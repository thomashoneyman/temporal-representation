/**
 * "Just tell me what wins": a compact headline table — one row per model, one column
 * per method, the row's best cell highlighted. Reactive: a metric toggle (strict /
 * + reasonable / severity-weighted, whichever the caller provides) re-scores and
 * re-highlights live. The selected metric is shared page-wide via $store.tip.metric,
 * so other charts on the page (e.g. the leaderboards) follow the same toggle.
 */
const esc2 = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const attr2 = (o: unknown): string => esc2(JSON.stringify(o)).replace(/"/g, '&quot;');

export function winnerTable(opts: {
  columns: Array<{ key: string; label: string; color: string }>;
  /** cells[columnKey][metricKey] = 0..100 (omit a column for a dash). */
  rows: Array<{ label: string; cells: Record<string, Record<string, number> | undefined> }>;
  /** Toggleable metrics, first = default. Keys must match the cell metric keys. */
  metrics: Array<{ key: string; label: string }>;
  caption?: string;
}): string {
  const head = opts.columns
    .map((c) => `<th><span style="background:${c.color};display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:.35rem"></span>${esc2(c.label)}</th>`)
    .join('');
  const payload = attr2({ rows: opts.rows, cols: opts.columns.map((c) => c.key), metricKeys: opts.metrics.map((m) => m.key) });
  const toggle =
    opts.metrics.length > 1
      ? `<div class="lb-toggle">${opts.metrics
          .map((m, i) => `<label><input type="radio" value="${esc2(m.key)}" x-model="$store.tip.metric"${i === 0 ? ' checked' : ''}> ${m.label}</label>`)
          .join('')}</div>`
      : '';
  return `<div x-data="${payload}">
  ${toggle}
  <table class="winner-table">
    <thead><tr><th></th>${head}</tr></thead>
    <tbody><template x-for="r in rows" :key="r.label">
      <tr x-data="{ m() { return metricKeys.includes($store.tip.metric) ? $store.tip.metric : metricKeys[0]; },
                    best() { return Math.max(...cols.map(c => r.cells[c]?.[this.m()] ?? -1)); } }">
        <td style="text-align:left;font-weight:600" x-text="r.label"></td>
        <template x-for="c in cols" :key="c">
          <td :style="r.cells[c] && r.cells[c][m()] === best() ? 'background:#e8f5e9;color:#1b5e20;font-weight:700;border-radius:6px' : (r.cells[c] ? '' : 'color:#9aa0a6')"
              x-text="r.cells[c] ? Math.round(r.cells[c][m()]) + '%' : '—'"></td>
        </template>
      </tr>
    </template></tbody>
  </table>
  ${opts.caption ? `<div class="sub" style="margin-top:.4rem">${opts.caption}</div>` : ''}
</div>
<style>.winner-table{border-collapse:separate;border-spacing:.5rem .25rem;font-size:1rem;margin:.5rem 0}
.winner-table th{text-align:center;color:#5f6368;font-weight:600;font-size:.8rem;padding:.2rem .8rem}
.winner-table td{text-align:center;padding:.35rem .9rem}</style>`;
}
