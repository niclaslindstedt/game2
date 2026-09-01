---
title: Browser-driven tooling pages belong in pwa/src/tools + a pwa-root HTML entry, not under scripts/ — and they need the app's own stylesheet
date: 2026-08-26
scope: pwa/src/tools/, scripts/
concepts: [tooling, harness, lint-coverage, css]
---

Neither tsconfig includes scripts/**/\*.ts and eslint only covers
scripts/**/*.mjs (with NODE globals — a browser-global .mjs there fails
no-undef). So a Playwright-driven harness page written under scripts/ is
invisible to every gate. The pattern that works: put the page's TS/TSX in
pwa/src/tools/ (typechecked + linted for free via the pwa project) with an
HTML entry at pwa/<name>.html, and have the Node script build just that
entry programmatically (vite build with configFile:false and
rollupOptions.input) — the normal app build only ever builds index.html, so
nothing leaks into dist. scripts/car-preview.mjs and
scripts/glyph-preview.mjs are the working examples.

A tools page that renders REAL app components has to `import "../styles.css"`
as well. Without it every rule the components lean on is missing, and the
failure is silent rather than ugly: `.menu-glyph` sizes its SVG in `em`, and
an SVG with no size at all collapses to zero width in a flex row — the sheet
came back as a grid of empty cells with the labels still under them.
Restating the one rule on the page is the wrong fix: it is a second copy to
keep in step, and the whole point of rendering the real component is that it
cannot drift. That import needs `build: { cssMinify: false }` in the script's
vite call, because styles.css carries Tailwind at-rules only the app's own
config expands and lightningcss warns on every one of them.

Related trap: page.waitForFunction in the Node script must take a STRING,
not a closure, or eslint's node-globals config flags `window`.
