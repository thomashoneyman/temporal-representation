/**
 * The deterministic ScateLite resolver: TimeExpr → concrete half-open intervals.
 * This is the experiment's ground-truth engine: TimeExpr in, concrete intervals out,
 * under the locked conventions in conventions.ts.
 *
 * Design rules:
 *  - Luxon only; never the system clock. The anchor comes from ctx.
 *  - Throws on unresolvable input — authoring/model errors fail loudly, never guess.
 *  - All convention lives in ctx (week start, bare-date policy, fiscal year, bounds),
 *    so steering an interpretation (Task 5) is a config change, not a code change.
 */
import { DateTime, Duration } from 'luxon';
import {
  addBusinessDays,
  isBusinessDay,
  isFederalHoliday,
  quarterStart,
  startOfWeek,
  WEEKDAY_NUM,
  type Weekday,
} from './calendar.js';
import type { Conventions } from './conventions.js';
import type { PresetName, TimeExpr } from './ir.js';
import { normalizeIntervals, ZONE, type Cardinality, type Grain, type Interval, type Resolved } from './interval.js';
import type { IsoValue } from './iso.js';

export interface ResolveCtx {
  anchor: string; // the seeded "now", ISO 8601 with offset
  conventions: Conventions;
  customPresets?: Record<string, TimeExpr>; // org presets, reachable via `ref`
  window: { backMonths: number; forwardMonths: number }; // open-end clamp horizon
}

/** Tool admission shapes: a range tool also accepts points and open ranges. */
export type RequireShape = 'point' | 'range' | 'set';

export class ResolveError extends Error {}

/** Internal working form: Luxon endpoints + the grain that produced them. */
interface Piece {
  s: DateTime;
  e: DateTime;
}
interface Res {
  pieces: Piece[];
  grain: Grain | null; // null = explicit endpoints (iso / clock windows)
  card?: Cardinality; // explicit override (e.g. iso-with-end stays 'range')
  open?: boolean;
}

const GRAIN_UNIT: Record<Grain, object> = {
  minute: { minutes: 1 },
  hour: { hours: 1 },
  day: { days: 1 },
  week: { weeks: 1 },
  month: { months: 1 },
  quarter: { months: 3 },
  year: { years: 1 },
};

const fmt = (dt: DateTime): string => {
  const iso = dt.setZone(ZONE).toISO({ suppressMilliseconds: true });
  if (!iso) throw new ResolveError(`unformattable datetime: ${dt.invalidReason}`);
  return iso;
};

export function resolveIR(expr: TimeExpr, ctx: ResolveCtx, opts?: { requireShape?: RequireShape }): Resolved {
  const anchor = DateTime.fromISO(ctx.anchor, { zone: ZONE });
  if (!anchor.isValid) throw new ResolveError(`invalid anchor: ${ctx.anchor}`);
  const res = resolveNode(expr, anchor, ctx);
  const resolved = finalize(res);
  if (opts?.requireShape) assertShape(resolved, opts.requireShape);
  return resolved;
}

// ───────────────────────────── finalization ─────────────────────────────

/** Cardinality of a single contiguous interval: day-grain-or-finer single units are
 *  points; week-or-coarser units and multi-unit spans are ranges. */
function singlePieceCard(p: Piece, grain: Grain | null): Cardinality {
  if (grain === 'minute' || grain === 'hour' || grain === 'day') {
    const oneUnit = p.s.plus(GRAIN_UNIT[grain]);
    if (oneUnit.toMillis() === p.e.toMillis()) return 'point';
  }
  return 'range';
}

function finalize(res: Res): Resolved {
  for (const p of res.pieces) {
    if (!p.s.isValid || !p.e.isValid) throw new ResolveError('invalid interval endpoint');
    if (p.s.toMillis() >= p.e.toMillis()) throw new ResolveError(`empty/inverted interval: ${fmt(p.s)} ≥ ${fmt(p.e)}`);
  }
  const intervals = normalizeIntervals(res.pieces.map((p): Interval => ({ start: fmt(p.s), end: fmt(p.e) })));
  if (intervals.length === 0) return { cardinality: 'none', intervals: [] };
  if (intervals.length >= 2) return { cardinality: 'set', intervals, ...(res.open ? { open: true } : {}) };
  const piece: Piece = {
    s: DateTime.fromISO(intervals[0].start, { zone: ZONE }),
    e: DateTime.fromISO(intervals[0].end, { zone: ZONE }),
  };
  const cardinality = res.card ?? singlePieceCard(piece, res.grain);
  return { cardinality, intervals, ...(res.open ? { open: true } : {}) };
}

function assertShape(r: Resolved, shape: RequireShape): void {
  const ok =
    shape === 'set'
      ? r.cardinality === 'set'
      : shape === 'range'
        ? r.cardinality === 'range' || r.cardinality === 'point' // point ⊆ range
        : r.cardinality === 'point';
  if (!ok) throw new ResolveError(`shape mismatch: tool accepts '${shape}', expression resolved to '${r.cardinality}'`);
}

// ───────────────────────────── node dispatch ─────────────────────────────

function resolveNode(expr: TimeExpr, anchor: DateTime, ctx: ResolveCtx): Res {
  switch (expr.type) {
    case 'now':
      return point(anchor.startOf('minute'), 'minute');
    case 'iso':
      return resolveIsoLeaf(expr);
    case 'date':
      return resolveDate(expr, anchor, ctx);
    case 'preset':
      return resolvePreset(expr.name, anchor, ctx);
    case 'ref': {
      // Lenient id matching (case / space / hyphen → underscore): models reference org
      // presets by natural name; punishing "maintenance window" vs maintenance_window
      // would measure formatting, not understanding. Unknown ids still fail loudly.
      const norm = (s: string): string => s.toLowerCase().replace(/[\s-]+/g, '_');
      const target =
        ctx.customPresets?.[expr.id] ??
        Object.entries(ctx.customPresets ?? {}).find(([k]) => norm(k) === norm(expr.id))?.[1];
      if (!target) throw new ResolveError(`unknown ref '${expr.id}' (not in ctx.customPresets)`);
      return resolveNode(target, anchor, ctx);
    }
    case 'shift':
      return resolveShift(expr, anchor, ctx);
    case 'weekday':
      return resolveWeekday(expr, anchor, ctx);
    case 'nth':
      return resolveNth(expr, anchor, ctx);
    case 'range':
      return resolveRange(expr, anchor, ctx);
    case 'filter':
      return resolveFilter(expr, anchor, ctx);
    case 'union': {
      if (expr.of.length === 0) throw new ResolveError('empty union');
      const pieces = expr.of.flatMap((sub) => resolveNode(sub, anchor, ctx).pieces);
      return { pieces, grain: null };
    }
  }
}

const point = (s: DateTime, grain: Grain): Res => ({
  pieces: [{ s, e: s.plus(GRAIN_UNIT[grain]) }],
  grain,
});

// ───────────────────────────── leaves ─────────────────────────────

function resolveIsoLeaf(expr: { start: string; end?: string }): Res {
  const s = DateTime.fromISO(expr.start, { setZone: true }).setZone(ZONE);
  if (!s.isValid) throw new ResolveError(`invalid iso.start: ${expr.start}`);
  if (expr.end === undefined) return point(s.startOf('minute'), 'minute');
  const e = DateTime.fromISO(expr.end, { setZone: true }).setZone(ZONE);
  if (!e.isValid) throw new ResolveError(`invalid iso.end: ${expr.end}`);
  // An explicit [start, end) keeps cardinality 'range' even when one unit long.
  return { pieces: [{ s, e }], grain: null, card: 'range' };
}

type DateNode = Extract<TimeExpr, { type: 'date' }>;

function dateGrain(d: DateNode): Grain {
  if (d.minute !== undefined) return 'minute';
  if (d.hour !== undefined) return 'hour';
  if (d.day !== undefined) return 'day';
  if (d.month !== undefined) return 'month';
  if (d.year !== undefined) return 'year';
  throw new ResolveError('empty date node');
}

/** Wrap cycle for bare-date occurrence rolling: keyed by the MOST significant present
 *  field (bare month/month-day wrap by year; bare day-of-month by month; bare
 *  time-of-day by day; bare minute by hour). */
function dateWrap(d: DateNode): object {
  if (d.month !== undefined) return { years: 1 };
  if (d.day !== undefined) return { months: 1 };
  if (d.hour !== undefined) return { days: 1 };
  return { hours: 1 };
}

function resolveDate(d: DateNode, anchor: DateTime, ctx: ResolveCtx, policyOverride?: 'next' | 'previous' | 'nearest' | 'this'): Res {
  const grain = dateGrain(d);

  const build = (year: number): DateTime =>
    DateTime.fromObject(
      {
        year,
        month: d.month ?? (d.day !== undefined || d.hour !== undefined ? anchor.month : 1),
        day: d.day ?? (d.hour !== undefined ? anchor.day : 1),
        hour: d.hour ?? 0,
        minute: d.minute ?? 0,
      },
      { zone: ZONE },
    );

  // Explicit year → exact; invalid dates (Feb 30) fail loudly.
  if (d.year !== undefined) {
    const dt = build(d.year);
    if (!dt.isValid || (d.day !== undefined && dt.day !== d.day)) {
      throw new ResolveError(`invalid date: ${JSON.stringify(d)}`);
    }
    return point(startOfGrain(dt, grain, ctx), grain);
  }

  // Bare date → occurrence per `which` ?? override ?? org default.
  const policy = d.which ?? policyOverride ?? ctx.conventions.datePolicy ?? 'next';
  const wrap = dateWrap(d);

  /** Candidate in the anchor's cycle; if the calendar combination doesn't exist there
   *  (Feb 29), roll the cycle until it does (S1-07: next real Feb 29 may be years out). */
  const candidateAt = (base: DateTime, dir: 1 | -1): DateTime => {
    let probe = base;
    for (let i = 0; i < 9; i++) {
      const cand = DateTime.fromObject(
        {
          year: probe.year,
          month: d.month ?? probe.month,
          day: d.day ?? (d.hour !== undefined ? probe.day : 1),
          hour: d.hour ?? 0,
          minute: d.minute ?? 0,
        },
        { zone: ZONE },
      );
      if (cand.isValid && (d.day === undefined || cand.day === d.day)) return cand;
      probe = dir === 1 ? probe.plus(wrap) : probe.minus(wrap);
    }
    throw new ResolveError(`no valid occurrence for ${JSON.stringify(d)}`);
  };

  const thisCycle = candidateAt(anchor, 1);
  const intervalEnd = (s: DateTime): DateTime => startOfGrain(s, grain, ctx).plus(GRAIN_UNIT[grain]);

  let chosen: DateTime;
  switch (policy) {
    case 'this':
      chosen = thisCycle;
      break;
    case 'next':
      // "Wholly past" rolls forward; today/this-period counts if any of it remains.
      chosen = intervalEnd(thisCycle) <= anchor ? candidateAt(anchor.plus(wrap), 1) : thisCycle;
      break;
    case 'previous':
      chosen = thisCycle > anchor ? candidateAt(anchor.minus(wrap), -1) : thisCycle;
      break;
    case 'nearest': {
      const next = intervalEnd(thisCycle) <= anchor ? candidateAt(anchor.plus(wrap), 1) : thisCycle;
      const prev = thisCycle > anchor ? candidateAt(anchor.minus(wrap), -1) : thisCycle;
      const dNext = Math.abs(next.diff(anchor).toMillis());
      const dPrev = Math.abs(prev.diff(anchor).toMillis());
      chosen = dNext <= dPrev ? next : prev;
      break;
    }
  }
  return point(startOfGrain(chosen, grain, ctx), grain);
}

function startOfGrain(dt: DateTime, grain: Grain, ctx: ResolveCtx): DateTime {
  switch (grain) {
    case 'week':
      return startOfWeek(dt, ctx.conventions.weekStart);
    case 'quarter':
      return quarterStart(dt, ctx.conventions.fiscalYearStartMonth);
    default:
      return dt.startOf(grain);
  }
}

// ───────────────────────────── presets ─────────────────────────────

function resolvePreset(name: PresetName, anchor: DateTime, ctx: ResolveCtx): Res {
  const c = ctx.conventions;
  const week = (k: number): Res => {
    const s = startOfWeek(anchor, c.weekStart).plus({ weeks: k });
    const e = c.weekDefinition === 'mon-fri' ? s.plus({ days: 5 }) : s.plus({ weeks: 1 });
    return { pieces: [{ s, e }], grain: 'week' };
  };
  const month = (k: number): Res => {
    const s = anchor.startOf('month').plus({ months: k });
    return { pieces: [{ s, e: s.plus({ months: 1 }) }], grain: 'month' };
  };
  const quarter = (k: number): Res => {
    const s = quarterStart(anchor, c.fiscalYearStartMonth).plus({ months: 3 * k });
    return { pieces: [{ s, e: s.plus({ months: 3 }) }], grain: 'quarter' };
  };
  const year = (k: number): Res => {
    const s = anchor.startOf('year').plus({ years: k });
    return { pieces: [{ s, e: s.plus({ years: 1 }) }], grain: 'year' };
  };
  const day = (k: number): Res => point(anchor.startOf('day').plus({ days: k }), 'day');
  /** To-date periods include today as a whole day (convention C8) and are open-ended. */
  const toDate = (s: DateTime): Res => ({
    pieces: [{ s, e: anchor.startOf('day').plus({ days: 1 }) }],
    grain: 'day',
    card: 'range',
    open: true,
  });

  switch (name) {
    case 'today': return day(0);
    case 'yesterday': return day(-1);
    case 'tomorrow': return day(1);
    case 'this_week': return week(0);
    case 'last_week': return week(-1);
    case 'next_week': return week(1);
    case 'this_month': return month(0);
    case 'last_month': return month(-1);
    case 'next_month': return month(1);
    case 'this_quarter': return quarter(0);
    case 'last_quarter': return quarter(-1);
    case 'next_quarter': return quarter(1);
    case 'this_year': return year(0);
    case 'last_year': return year(-1);
    case 'next_year': return year(1);
    case 'ytd': return toDate(anchor.startOf('year'));
    case 'mtd': return toDate(anchor.startOf('month'));
    case 'qtd': return toDate(quarterStart(anchor, c.fiscalYearStartMonth));
  }
}

// ───────────────────────────── operators ─────────────────────────────

type ShiftNode = Extract<TimeExpr, { type: 'shift' }>;

function resolveShift(expr: ShiftNode, anchor: DateTime, ctx: ResolveCtx): Res {
  const base = resolveNode(expr.base, anchor, ctx);
  if (base.pieces.length !== 1) throw new ResolveError('shift base must resolve to a single point/range');
  const dur = Duration.fromISO(expr.by);
  if (!dur.isValid) throw new ResolveError(`invalid ISO-8601 duration: ${expr.by}`);
  const [p] = base.pieces;

  if (expr.businessDays) {
    const n = Math.round(dur.as('days'));
    const landed = addBusinessDays(p.s, expr.direction === 'before' ? -n : n);
    return point(landed, 'day'); // business-day math is day-grain by definition
  }

  // Luxon plus/minus: months/years use calendar math (day-of-month pinned + clamped),
  // days/weeks/hours/minutes are exact elapsed time — the Objective-1 pinning axis.
  const apply = (dt: DateTime): DateTime => (expr.direction === 'before' ? dt.minus(dur) : dt.plus(dur));

  // Grain follows the duration when it is COARSER than the base: "4 hours ago" from
  // the anchor minute is an hour point ([07:00, 08:00)), while "30/90 minutes ago"
  // stays minute-grain and "+1 week from now" keeps the base's clock (R2-14/15/20).
  if (base.card !== 'range' && base.grain === 'minute') {
    const hasMinutes = (dur.minutes ?? 0) !== 0 || (dur.seconds ?? 0) !== 0;
    const hasHours = (dur.hours ?? 0) !== 0;
    if (hasHours && !hasMinutes) return point(apply(p.s).startOf('hour'), 'hour');
  }
  return { pieces: [{ s: apply(p.s), e: apply(p.e) }], grain: base.grain, card: base.card };
}

type WeekdayNode = Extract<TimeExpr, { type: 'weekday' }>;

function resolveWeekday(expr: WeekdayNode, anchor: DateTime, ctx: ResolveCtx): Res {
  const base = expr.of
    ? resolveNode(expr.of, anchor, ctx).pieces[0].s.startOf('day')
    : anchor.startOf('day');
  const target = WEEKDAY_NUM[expr.day];
  const cur = base.weekday;
  let day: DateTime;
  switch (expr.which) {
    case 'this': {
      // The target weekday inside base's week (per week-start convention).
      const ws = startOfWeek(base, ctx.conventions.weekStart);
      day = ws.plus({ days: (target - WEEKDAY_NUM[ctx.conventions.weekStart === 'mon' ? 'mon' : 'sun'] + 7) % 7 });
      break;
    }
    case 'next':
      day = base.plus({ days: (target - cur + 7) % 7 || 7 });
      break;
    case 'last':
      day = base.minus({ days: (cur - target + 7) % 7 || 7 });
      break;
    case 'nearest': {
      const fwd = (target - cur + 7) % 7;
      const back = (cur - target + 7) % 7;
      day = fwd <= back ? base.plus({ days: fwd }) : base.minus({ days: back });
      break;
    }
  }
  if (expr.hour === undefined) return point(day, 'day');
  const grain: Grain = expr.minute !== undefined ? 'minute' : 'hour';
  return point(day.set({ hour: expr.hour, minute: expr.minute ?? 0 }), grain);
}

type NthNode = Extract<TimeExpr, { type: 'nth' }>;

const GRAINS: ReadonlySet<string> = new Set(['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']);

function resolveNth(expr: NthNode, anchor: DateTime, ctx: ResolveCtx): Res {
  const result = nthWithin(expr, resolveNode(expr.of, anchor, ctx), ctx);

  // Past-occurrence roll for rule-based holidays (the C4 "bare holiday → next" rule at
  // holiday granularity): "Labor Day" said Sep 15 must roll to NEXT year even though
  // September itself is still in progress. Applies only to DAY-POINT units (weekday /
  // business_day — the holiday shape); never to grain sub-periods like "the first week
  // of March", which name part of a current period rather than a recurring event.
  const ofNode = expr.of;
  const bareNext =
    !GRAINS.has(expr.unit) &&
    ofNode.type === 'date' &&
    ofNode.year === undefined &&
    (ofNode.which ?? ctx.conventions.datePolicy ?? 'next') === 'next';
  if (bareNext && result.pieces[0].e <= anchor) {
    const rolled = resolveNode({ ...ofNode, which: 'this' }, anchor.plus(dateWrap(ofNode)), ctx);
    return nthWithin(expr, rolled, ctx);
  }
  return result;
}

function nthWithin(expr: NthNode, of: Res, ctx: ResolveCtx): Res {
  if (of.pieces.length !== 1) throw new ResolveError('nth requires a single contiguous period');
  const [p] = of.pieces;

  if (GRAINS.has(expr.unit)) {
    const grain = expr.unit as Grain;
    const unit = GRAIN_UNIT[grain];
    // "First week of March": days 1–7 by default; the first FULL week under the
    // 'first-full-week' convention (steerable — G5-06 probe). Other grains count
    // plainly from the period's own start.
    let origin = p.s;
    if (grain === 'week' && ctx.conventions.firstWeek === 'first-full-week') {
      const ws = startOfWeek(p.s, ctx.conventions.weekStart);
      origin = ws < p.s ? ws.plus({ weeks: 1 }) : ws;
    }
    const s = expr.n === 'last' ? p.e.minus(unit) : origin.plus(multiplyUnit(unit, expr.n - 1));
    const e = s.plus(unit);
    if (s < p.s || e > p.e) throw new ResolveError(`nth(${expr.n}, ${expr.unit}) falls outside the period`);
    return { pieces: [{ s, e }], grain };
  }

  // Weekday / business_day units → enumerate matching days inside [s, e).
  const matches: DateTime[] = [];
  for (let d = p.s.startOf('day'); d < p.e; d = d.plus({ days: 1 })) {
    if (d < p.s) continue;
    if (expr.unit === 'business_day' ? isBusinessDay(d) : d.weekday === WEEKDAY_NUM[expr.unit as Weekday]) {
      matches.push(d);
    }
  }
  const pick = expr.n === 'last' ? matches[matches.length - 1] : matches[expr.n - 1];
  if (!pick) throw new ResolveError(`no ${expr.n}th ${expr.unit} inside the period`);
  return point(pick, 'day');
}

function multiplyUnit(unit: object, k: number): object {
  return Object.fromEntries(Object.entries(unit).map(([u, v]) => [u, (v as number) * k]));
}

type RangeNode = Extract<TimeExpr, { type: 'range' }>;

function resolveRange(expr: RangeNode, anchor: DateTime, ctx: ResolveCtx): Res {
  if (expr.from === null && expr.to === null) throw new ResolveError('range cannot be open on both ends');
  // `to: now` is the to-date reading ("since March") — open-ended like a null bound.
  const open = expr.from === null || expr.to === null || expr.to.type === 'now';

  // A bare `from` in an open-ended range defaults to its PREVIOUS occurrence: "since
  // March" said in June means the March just past, not next year's (the datePolicy
  // 'next' default would over-roll it; an explicit date.which still wins).
  const from = expr.from === null ? null : resolveNode(asFromOfOpenRange(expr.from, expr.to), anchor, ctx);
  const to = expr.to === null ? null : resolveNode(expr.to, anchor, ctx);
  if ((from && from.pieces.length !== 1) || (to && to.pieces.length !== 1)) {
    throw new ResolveError('range endpoints must resolve to single intervals');
  }

  let start: DateTime;
  let end: DateTime;
  if (to === null) {
    // Open end: "since March" (from wholly past) runs to the anchor; "from June onward"
    // (from still in progress / ahead) runs to the forward window clamp (convention C13).
    start = from!.pieces[0].s;
    end =
      from!.pieces[0].e <= anchor
        ? anchor
        : anchor.startOf('day').plus({ months: ctx.window.forwardMonths });
  } else {
    // Grain-inclusive end: "through the 4th" covers all of the 4th (steerable via C5).
    // Exceptions where the end is a BOUNDARY, not a unit to include:
    //  - `to: now` ("since March") — up to the instant;
    //  - explicit endExclusive ("the last 7 days" = range(today−7d, today, endExclusive));
    //  - clock-grain ends ("8–10am"): nobody means clock ranges inclusively — added
    //    after Task-4 measurement showed inclusive hour-ends mis-encode every clock span.
    const clockGrainEnd = to.grain === 'hour' || to.grain === 'minute';
    end =
      (expr.to !== null && expr.to.type === 'now') || expr.endExclusive || clockGrainEnd
        ? to.pieces[0].s
        : ctx.conventions.rangeBounds === 'inclusive'
          ? to.pieces[0].e
          : to.pieces[0].s;
    start = from === null ? anchor.startOf('day').minus({ months: ctx.window.backMonths }) : from.pieces[0].s;
  }

  // Backstop for an over-rolled bare `from` (authored with an explicit which:'next'):
  // a range must run forward, so pull `from` back a year until it does (≤5×).
  let guard = 0;
  while (start >= end && guard < 5) {
    start = start.minus({ years: 1 });
    guard++;
  }
  if (start >= end) throw new ResolveError('range start does not precede end');

  return { pieces: [{ s: start, e: end }], grain: from?.grain ?? to?.grain ?? null, card: 'range', ...(open ? { open: true } : {}) };
}

/** Wrap a bare from-date of an open range with the 'previous' default (see above). */
function asFromOfOpenRange(from: TimeExpr, to: TimeExpr | null): TimeExpr {
  if (to !== null) return from;
  if (from.type === 'date' && from.year === undefined && from.which === undefined) {
    return { ...from, which: 'previous' };
  }
  return from;
}

type FilterNode = Extract<TimeExpr, { type: 'filter' }>;

function parseClock(hhmm: string): { hour: number; minute: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new ResolveError(`invalid HH:MM clock time: ${hhmm}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function resolveFilter(expr: FilterNode, anchor: DateTime, ctx: ResolveCtx): Res {
  const within = resolveNode(expr.within, anchor, ctx);
  const allowed = expr.weekdays ? new Set(expr.weekdays.map((w) => WEEKDAY_NUM[w])) : null;
  const workweek = new Set(ctx.conventions.workweek.map((w) => WEEKDAY_NUM[w]));
  const tod = expr.timeOfDay
    ? { start: parseClock(expr.timeOfDay.start), end: parseClock(expr.timeOfDay.end) }
    : null;

  const pieces: Piece[] = [];
  for (const p of within.pieces) {
    for (let d = p.s.startOf('day'); d < p.e; d = d.plus({ days: 1 })) {
      if (allowed && !allowed.has(d.weekday)) continue;
      // "Business days only": the workweek minus US federal holidays.
      if (expr.businessDays && (!workweek.has(d.weekday) || isFederalHoliday(d))) continue;
      let s = tod ? d.set(tod.start) : d;
      let e = tod ? d.set(tod.end) : d.plus({ days: 1 });
      // Clip to the base interval (a partial first/last day stays partial).
      if (s < p.s) s = p.s;
      if (e > p.e) e = p.e;
      if (s < e) pieces.push({ s, e });
    }
  }
  if (pieces.length === 0) throw new ResolveError('filter matched nothing inside the period');
  return { pieces, grain: tod ? null : 'day', open: within.open };
}

// ───────────────────────────── the ISO arm ─────────────────────────────

/** Normalize an ISO-arm value to the same Resolved form. Bounds become half-open; the
 *  inclusivity grain is the value's own precision (a date-only end extends by a day,
 *  a datetime end by a minute). Null bounds clamp to the window like an open IR range. */
export function resolveISO(value: IsoValue, ctx: ResolveCtx): Resolved {
  const anchor = DateTime.fromISO(ctx.anchor, { zone: ZONE });
  if (!anchor.isValid) throw new ResolveError(`invalid anchor: ${ctx.anchor}`);

  const parse = (iso: string): { dt: DateTime; dateOnly: boolean } => {
    const dateOnly = !iso.includes('T');
    const dt = DateTime.fromISO(iso, dateOnly ? { zone: ZONE } : { setZone: true });
    if (!dt.isValid) throw new ResolveError(`invalid ISO value: ${iso}`);
    return { dt: dt.setZone(ZONE), dateOnly };
  };

  switch (value.cardinality) {
    case 'point': {
      const { dt, dateOnly } = parse(value.at);
      const grain: Grain = dateOnly ? 'day' : 'minute';
      return finalize(point(dt.startOf(grain), grain));
    }
    case 'range': {
      if (value.start === null && value.end === null) throw new ResolveError('range cannot be open on both ends');
      const open = value.start === null || value.end === null;
      const s = value.start === null ? { dt: anchor.startOf('day').minus({ months: ctx.window.backMonths }), dateOnly: false } : parse(value.start);
      const e = value.end === null ? { dt: anchor.startOf('day').plus({ months: ctx.window.forwardMonths }), dateOnly: false } : parse(value.end);
      const bounds = value.bounds ?? '[)';
      const grainOf = (x: { dateOnly: boolean }): object => (x.dateOnly ? { days: 1 } : { minutes: 1 });
      let start = bounds.startsWith('(') ? s.dt.plus(grainOf(s)) : s.dt;
      let end = bounds.endsWith(']') ? e.dt.plus(grainOf(e)) : e.dt;
      if (value.end !== null && e.dateOnly && bounds.endsWith(')')) {
        // A date-only exclusive end already denotes that day's midnight — keep as-is.
        end = e.dt;
      }
      if (start >= end) throw new ResolveError('range start does not precede end');
      return finalize({ pieces: [{ s: start, e: end }], grain: null, card: 'range', ...(open ? { open: true } : {}) });
    }
    case 'set': {
      const pieces = value.members.map((m) => {
        const s = parse(m.start);
        const e = parse(m.end);
        return { s: s.dt, e: e.dt };
      });
      if (pieces.length === 0) throw new ResolveError('empty set');
      return finalize({ pieces, grain: null });
    }
  }
}
