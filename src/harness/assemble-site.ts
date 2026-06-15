/**
 * Assemble the publishable site — `npm run site:assemble` (the final step of `npm run site`).
 *
 * This copies the freshly-generated, self-contained pages into one directory ready for
 * GitHub Pages. It does NOT generate anything itself: `npm run site` runs every viz/talk
 * generator first, so by the time we get here `results/*.html` and `talk/index.html`
 * already reflect the current `results/*.json`. Nothing here is hand-edited, and the
 * output dir is gitignored — the site is always rebuilt from data, never served stale.
 *
 * Output dir defaults to `site/`; set SITE_DIR=docs to target a committed /docs folder
 * (the no-Actions, serve-from-branch option).
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.SITE_DIR ?? 'site';

// Start clean so a removed/renamed source page never lingers in the output.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'results'), { recursive: true });
mkdirSync(join(OUT, 'talk'), { recursive: true });

// Landing page.
copyFileSync('web/index.html', join(OUT, 'index.html'));

// Every self-contained report page.
const reports = readdirSync('results').filter((f) => f.endsWith('.html'));
for (const f of reports) copyFileSync(join('results', f), join(OUT, 'results', f));

// The talk deck.
copyFileSync('talk/index.html', join(OUT, 'talk', 'index.html'));

// Serve files verbatim (the talk lives fine, but be explicit and future-proof).
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(
  `assembled ${OUT}/ — index.html, talk/index.html, ${reports.length} report pages ` +
    `(${reports.map((f) => f.replace('.html', '')).join(', ')})`,
);
