---
title: Nothing checks the icon.svg / generate-icons.mjs parity — rasterise the SVG and put it beside the PNG
date: 2026-08-27
scope: pwa/public/icons/, scripts/generate-icons.mjs
concepts: [icons, app-mark, parity, verification]
---

"Change one, change both" is enforced by no test and no lint, and the two
encodings drift in ways that look fine in isolation: each file renders a
plausible mark, and only a side-by-side shows they are different marks.

Rasterise the SVG and compare:

```js
const { chromium } = await import("playwright-core"); // repo dep; no "playwright"
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.goto("file:///…/pwa/public/icons/icon.svg");
await p.screenshot({ path: "…/svg.png" });
```

A scratch script must live inside the repo or import `playwright-core` by
absolute path — Node resolves `node_modules` from the script's own directory.
The SVG's rounded corners come out transparent where the PNG is square; that
difference is by design, everything else should match.

Two traps this catches:

- **Derive dependent geometry, never eyeball it.** The mark's S is two
  tangent arcs, so the second centre is exactly `C1 + (R1 + R2) * u` along the
  joint's radial. A centre rounded to whole units was 0.6 off and put a visible
  step where the two tracks meet — invisible in the raster (its arcs overlap by
  a couple of degrees to hide the seam), obvious in the SVG.
- **Importing `generate-icons.mjs` to reuse its constants RUNS it**: it writes
  every icon and logs to stdout, so `node emit.mjs > icon.svg` puts the log line
  at the top of the file.

The generated PNGs are the deliverable, so `make icons` and LOOK at
`pwa-512.png`, `pwa-192.png`, the maskable and `og.png` — the maskable's 0.78
inset and the 32px favicon are where a mark with fine detail falls apart.
