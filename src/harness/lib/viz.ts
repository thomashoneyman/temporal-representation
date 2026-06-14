/**
 * Shared HTML-visualization toolkit for results pages (preferences, phase 1, and the
 * Phase-2 reports to come). Produces self-contained pages (work from file://) with
 * Alpine.js (vendored inline — no network needed) providing:
 *   - rich hover/click tooltips: a floating panel with the reading, share, and the
 *     concrete date spans, instead of native title= text
 *   - click a segment to PIN the panel (click elsewhere to unpin)
 *   - legend hover → highlights that reading's segments across every bar in the section
 *   - a phrase/section filter box
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Vendored Alpine (installed as a dev dep) so pages work offline / from file://. */
export function alpineSource(): string {
  return readFileSync(require.resolve('alpinejs/dist/cdn.min.js'), 'utf8');
}

export interface Segment {
  label: string;
  n: number;
  total: number;
  color: string;
  /** Lines shown in the detail panel (concrete date spans, counts, notes). */
  detail: string[];
  /** Optional underlying rows: clicking the segment shows them as a table under the
   *  section (question · model's answer · what the key expects · note). */
  rows?: Array<{ q: string; asked?: string; actual: string; expected: string; note?: string; n?: number }>;
}

export interface Bar {
  rowLabel: string; // e.g. "weekSunday · Sun Jun 14" or "claude-haiku-4-5 · ISO"
  segments: Segment[];
}

export interface Section {
  id: string;
  title: string; // e.g. “last week”
  subtitle?: string; // e.g. the model name, or "asked Thu Mar 12 2026 14:30"
  groups: Array<{ name?: string; bars: Bar[] }>;
  legend: Array<{ label: string; color: string; detail: string[] }>;
  /** Escape hatch: render this HTML instead of groups+legend (still tab/filter-aware). */
  customHtml?: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (o: unknown): string => esc(JSON.stringify(o));

export function renderPage(opts: {
  title: string;
  metaHtml: string;
  hintHtml: string;
  sections: Section[];
  /** Optional tab bar: each tab lists the section ids it shows. First tab is active. */
  tabs?: Array<{ id: string; label: string; sectionIds: string[] }>;
}): string {
  const sectionsHtml = opts.sections
    .map((sec) => {
      const groups = sec.groups
        .map((g) => {
          const bars = g.bars
            .map((bar) => {
              const segs = bar.segments
                .map((seg) => {
                  const pct = (seg.n / seg.total) * 100;
                  const payload = { label: seg.label, n: seg.n, total: seg.total, detail: seg.detail, color: seg.color };
                  const tablePayload = seg.rows
                    ? { title: `${bar.rowLabel} — ${seg.label} (${seg.n}/${seg.total})`, color: seg.color, rows: seg.rows }
                    : null;
                  return `<div class="seg" :class="{dim: hl && hl !== '${esc(seg.label)}'}"
                    style="width:${pct}%;background:${seg.color}"
                    @mouseenter="show($event, ${attr(payload)})" @mouseleave="hide()"
                    @click.stop="${tablePayload ? `table(${attr(tablePayload)})` : `pin($event, ${attr(payload)})`}">${pct >= 18 ? `${Math.round(pct)}%` : ''}</div>`;
                })
                .join('');
              return `<div class="row"><div class="pos" title="${esc(bar.rowLabel)}">${esc(bar.rowLabel)}</div><div class="bar">${segs}</div></div>`;
            })
            .join('');
          return `${g.name ? `<div class="model">${esc(g.name)}</div>` : ''}${bars}`;
        })
        .join('');
      const legend = sec.legend
        .map(
          (l) => `<span class="lg" @mouseenter="hl='${esc(l.label)}'" @mouseleave="hl=null"
            @click.stop="pin($event, ${attr({ label: l.label, n: null, total: null, detail: l.detail, color: l.color })})">
            <span class="sw" style="background:${l.color}"></span>${esc(l.label)}</span>`,
        )
        .join('');
      const tabOf = opts.tabs?.find((t) => t.sectionIds.includes(sec.id))?.id ?? '';
      if (sec.customHtml) {
        return `<section x-data="chart()" x-show="visible('${esc(sec.title)}', '${esc(tabOf)}')" id="${esc(sec.id)}">
        <h2>${esc(sec.title)}</h2>${sec.subtitle ? `<div class="sub">${sec.subtitle}</div>` : ''}
        ${sec.customHtml}
      </section>`;
      }
      return `<section x-data="chart()" x-show="visible('${esc(sec.title)}', '${esc(tabOf)}')" id="${esc(sec.id)}">
        <h2>${esc(sec.title)}</h2>${sec.subtitle ? `<div class="sub">${sec.subtitle}</div>` : ''}
        ${groups}
        <div class="legend">${legend}</div>
        <div class="detail-table" x-show="tbl" x-cloak>
          <div class="dt-head"><span class="sw" :style="'background:' + (tbl?.color || '#000')"></span>
            <b x-text="tbl?.title"></b>
            <a href="#" @click.prevent="tbl=null" style="margin-left:auto">close</a></div>
          <table>
            <thead><tr><th>question</th><th>asked on</th><th>model answered</th><th>key expects</th><th>note</th><th>×</th></tr></thead>
            <tbody><template x-for="r in tbl?.rows ?? []">
              <tr><td x-text="r.q"></td><td x-text="r.asked ?? ''"></td><td x-text="r.actual"></td><td x-text="r.expected"></td><td x-text="r.note ?? ''"></td><td x-text="r.n ?? 1"></td></tr>
            </template></tbody>
          </table>
        </div>
      </section>`;
    })
    .join('\n');

  return `<!doctype html><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  body { font: 14px/1.45 -apple-system, system-ui, sans-serif; margin: 2rem auto; max-width: 1180px; color: #202124; padding: 0 1rem }
  h1 { font-size: 1.4rem } h2 { margin: 1.6rem 0 .15rem; font-size: 1.12rem }
  .sub { color: #5f6368; font-size: .82rem; margin-bottom: .3rem }
  .meta { color: #5f6368; font-size: .85rem; margin-bottom: 1rem }
  .model { margin: .55rem 0 .15rem; font-weight: 600; font-size: .88rem; color: #3c4043 }
  .row { display: flex; align-items: center; margin: 3px 0 }
  .pos { width: 270px; font-size: .8rem; color: #5f6368; text-align: right; padding-right: 10px; flex-shrink: 0;
         white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .bar { display: flex; flex: 1; height: 22px; border-radius: 4px; overflow: hidden; background: #f1f3f4 }
  .seg { height: 100%; min-width: 2px; display: flex; align-items: center; justify-content: center;
         color: #fff; font-size: .72rem; white-space: nowrap; overflow: hidden; cursor: pointer;
         transition: opacity .12s, flex-basis .12s }
  .seg.dim { opacity: .25 }
  .legend { display: flex; flex-wrap: wrap; gap: .3rem 1rem; margin: .4rem 0 0 280px; font-size: .78rem; color: #3c4043 }
  .lg { display: inline-flex; align-items: center; gap: .35rem; cursor: pointer; padding: .1rem .3rem; border-radius: 4px }
  .lg:hover { background: #f1f3f4 }
  .sw { width: 11px; height: 11px; border-radius: 2px; display: inline-block; flex-shrink: 0 }
  .hint { color: #5f6368; font-size: .85rem; background: #f8f9fa; padding: .6rem .9rem; border-radius: 6px }
  #tip { position: fixed; z-index: 10; max-width: 380px; background: #202124; color: #e8eaed; border-radius: 8px;
         padding: .6rem .8rem; font-size: .8rem; line-height: 1.5; box-shadow: 0 4px 16px rgba(0,0,0,.25); pointer-events: none }
  #tip.pinned { pointer-events: auto }
  #tip .t-label { font-weight: 700; display: flex; align-items: center; gap: .4rem }
  #tip .t-share { color: #9aa0a6; margin-left: .4rem; font-weight: 400 }
  #tip .t-detail { margin-top: .25rem; color: #bdc1c6 }
  #tip .t-detail div { padding: .05rem 0 }
  #filter { font: inherit; padding: .35rem .6rem; border: 1px solid #dadce0; border-radius: 6px; width: 260px; margin: 0 0 .4rem }
  .pin-hint { font-size: .72rem; color: #9aa0a6; margin-top: .3rem }
  .tabs { display: flex; gap: .4rem; margin: 0 0 .6rem }
  .tab { font: inherit; padding: .35rem .9rem; border: 1px solid #dadce0; background: #fff; border-radius: 999px; cursor: pointer }
  .tab.active { background: #202124; color: #fff; border-color: #202124 }
  .lb-toggle { display: flex; flex-direction: column; gap: .25rem; margin: .4rem 0 .7rem; font-size: .82rem; color: #3c4043 }
  .lb-toggle label { cursor: pointer }
  [x-cloak] { display: none }
  .detail-table { margin: .6rem 0 0 250px; background: #f8f9fa; border-radius: 8px; padding: .6rem .8rem; font-size: .8rem }
  .dt-head { display: flex; align-items: center; gap: .5rem; margin-bottom: .4rem }
  .detail-table table { border-collapse: collapse; width: 100% }
  .detail-table th { text-align: left; color: #5f6368; font-weight: 600; padding: .15rem .5rem .15rem 0 }
  .detail-table td { padding: .15rem .75rem .15rem 0; border-top: 1px solid #e8eaed; vertical-align: top }
</style>
<body x-data @click="$store.tip.unpin()">
<h1>${esc(opts.title)}</h1>
<div class="meta">${opts.metaHtml}</div>
<p class="hint">${opts.hintHtml}<br><span class="pin-hint">Hover a segment for details · click to pin the panel · hover a legend entry to highlight that reading everywhere · type below to filter.</span></p>
${opts.tabs ? `<div class="tabs">${opts.tabs.map((t, i) => `<button class="tab" :class="{active: $store.tip.tab === '${esc(t.id)}'}" @click="$store.tip.tab = '${esc(t.id)}'">${esc(t.label)}</button>`).join('')}</div>` : ''}
<input id="filter" placeholder="filter sections… (e.g. week)" x-model="$store.tip.filter">
${sectionsHtml}
<template x-teleport="body">
  <div id="tip" x-show="$store.tip.open" :class="{pinned: $store.tip.isPinned}"
       :style="\`left:\${$store.tip.x}px; top:\${$store.tip.y}px\`" @click.stop>
    <div class="t-label"><span class="sw" :style="\`background:\${$store.tip.data.color}\`"></span>
      <span x-text="$store.tip.data.label"></span>
      <span class="t-share" x-show="$store.tip.data.n !== null"
            x-text="\`\${Math.round($store.tip.data.n / $store.tip.data.total * 100)}% (\${$store.tip.data.n}/\${$store.tip.data.total})\`"></span></div>
    <div class="t-detail"><template x-for="line in $store.tip.data.detail"><div x-text="line"></div></template></div>
  </div>
</template>
<script>
// IMPORTANT: this config script must run BEFORE Alpine loads — the inlined Alpine
// build auto-starts on execution and fires alpine:init immediately; a listener
// registered after that tag misses the event and no component/store ever exists.
document.addEventListener('alpine:init', () => {
  Alpine.store('tip', {
    open: false, isPinned: false, x: 0, y: 0, filter: '', metric: 'exact', tab: ${opts.tabs ? `'${esc(opts.tabs[0].id)}'` : `''`},
    data: { label: '', n: null, total: null, detail: [], color: '#000' },
    place(ev) {
      const pad = 14, w = 380;
      this.x = Math.min(ev.clientX + pad, window.innerWidth - w - 20);
      this.y = Math.min(ev.clientY + pad, window.innerHeight - 140);
    },
    show(ev, data) { if (this.isPinned) return; this.data = data; this.place(ev); this.open = true; },
    hide() { if (!this.isPinned) this.open = false; },
    pin(ev, data) { this.data = data; this.place(ev); this.open = true; this.isPinned = true; },
    unpin() { this.isPinned = false; this.open = false; },
  });
  Alpine.data('chart', () => ({
    hl: null,
    tbl: null,
    table(payload) { this.tbl = payload; },
    show(ev, data) { Alpine.store('tip').show(ev, data); },
    hide() { Alpine.store('tip').hide(); },
    pin(ev, data) { Alpine.store('tip').pin(ev, data); },
    visible(title, tabId) {
      const store = Alpine.store('tip');
      if (tabId && store.tab && tabId !== store.tab) return false;
      const f = store.filter.trim().toLowerCase();
      return !f || title.toLowerCase().includes(f);
    },
  }));
});
</script>
<script>${alpineSource()}</script>
</body>`;
}

import { DateTime } from 'luxon';

/** Human line for one interval: a 1-day interval reads "the day Wed, Jun 3 2026"; a
 *  ≤1-minute interval "the moment Jun 3 2026 14:00"; anything longer "start → end". */
export function humanInterval(startIso: string, endIso: string): string {
  const s = DateTime.fromISO(startIso, { setZone: true });
  const e = DateTime.fromISO(endIso, { setZone: true });
  const fmtD = (d: DateTime) => d.toFormat('ccc, MMM d yyyy');
  const fmtDT = (d: DateTime) => d.toFormat('ccc, MMM d yyyy HH:mm');
  const mins = e.diff(s, 'minutes').minutes;
  if (mins <= 1.01) return `the moment ${fmtDT(s)}`;
  if (s.hour === 0 && s.minute === 0 && Math.abs(e.diff(s, 'days').days - 1) < 0.05) return `the day ${fmtD(s)}`;
  const sTxt = s.hour === 0 && s.minute === 0 ? fmtD(s) : fmtDT(s);
  const eTxt = e.hour === 0 && e.minute === 0 ? fmtD(e) : fmtDT(e);
  return `${sTxt} → ${eTxt}`;
}

export const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7'];
export const GRAY: Record<string, string> = { other: '#9aa0a6', none: '#d3d3d3', unresolvable: '#5f6368' };

/** Stable per-label colors within a section; merged labels (a=b) share the base color. */
export function colorPicker(): (label: string) => string {
  const assigned = new Map<string, string>();
  let next = 0;
  return (label: string): string => {
    if (GRAY[label]) return GRAY[label];
    const base = label.split('=')[0];
    if (!assigned.has(base)) assigned.set(base, PALETTE[next++ % PALETTE.length]);
    return assigned.get(base)!;
  };
}

