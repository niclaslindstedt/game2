---
title: Browser-driven tooling pages belong in pwa/src/tools + a pwa-root HTML entry, not under scripts/
date: 2026-08-26
scope: pwa/src/tools/, scripts/
concepts: [tooling, harness, lint-coverage]
---

Neither tsconfig includes scripts/**/\*.ts and eslint only covers
scripts/**/*.mjs (with NODE globals — a browser-global .mjs there fails
no-undef). So a Playwright-driven harness page written under scripts/ is
invisible to every gate. The pattern that works: put the page's TS in
pwa/src/tools/ (typechecked + linted for free via the pwa project) with an
HTML entry at pwa/<name>.html, and have the Node script build just that
entry programmatically (vite build with configFile:false and
rollupOptions.input) — the normal app build only ever builds index.html, so
nothing leaks into dist. scripts/car-preview.mjs is the working example.
Related trap: page.waitForFunction in the Node script must take a STRING,
not a closure, or eslint's node-globals config flags `window`.
