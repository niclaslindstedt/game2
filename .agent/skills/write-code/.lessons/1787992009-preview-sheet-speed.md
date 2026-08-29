---
title: A contact-sheet harness is slow at the READBACK and the PNG, never at the render — and a noisy ground is half the file
date: 2026-08-29
scope: pwa/src/tools/, scripts/
concepts: [tooling, harness, preview, performance, rendering]
---

Building `make items` measured where a preview-sheet tool's seconds actually
go, and none of it was intuition:

- **The GL rendering is nothing.** Sixty-five 360×280 cells of real game
  geometry: **174 ms**. Antialias off saves 200 ms across the whole sheet and
  is not worth the jaggies on the thing you are inspecting.
- **`ctx.drawImage(webglCanvas, …)` is everything.** The same sixty-five cells
  blitted into a 2D canvas cost **875 ms** — Chromium logs "GPU stall due to
  ReadPixels" for each. Blitting once per ROW instead of once per cell changes
  nothing (same pixels read), and a GL canvas sized to the WHOLE sheet is
  worse still (1949 ms): SwiftShader hates a multi-megapixel MSAA framebuffer.
  One cell-sized context blitted per cell is the fastest of the three.
- **Do not let the tool photograph the page.** `setViewportSize` to the sheet
  plus `screenshot({fullPage:true})` was 2066 ms where handing the bytes back
  (`canvas.toDataURL()` → `Buffer.from(png, "base64")` in Node) is ~1100 ms,
  and it drops the DOM label layer with it — `ctx.fillText` instead.
- **A gravel-textured ground is half the file and a second of encode.**
  High-frequency noise is what PNG cannot compress: 7.9 MB / 2.1 s with the
  world's gravel under every item, 1.0 MB / 1.1 s with a flat colour. A studio
  floor also stops the ground competing with what is being judged.
- **Cache the vite build on a source fingerprint** (path+size+mtime over
  `pwa/src` and `engine/`, stamped beside the bundle). It is ~900 ms per run,
  every run, on a tool whose whole point is being run twenty times an hour,
  and `--skip-build` only helps the person who remembers it.

Net on `make items`: 5.9 s → 1.2 s for one item, 15.6 s → 5.9 s for all
fifty-seven.
