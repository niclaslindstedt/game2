---
title: Cut a preview sheet into cells with Playwright's Chromium, sized to the image — PIL and the bundled ffmpeg are not here, and a fitted viewport centres the picture
date: 2026-09-06
scope: scripts/, previews/
concepts: [tooling, harness, screenshots, review]
---

A contact sheet 3600 px wide read through the Read tool is scaled down
until the detail under review is gone. There is no PIL, and Playwright's
ffmpeg build cannot decode PNG. What works: a scratch script under
`scripts/` (so `playwright-core` resolves) that opens the PNG as a
`file://` page and takes `page.screenshot({ clip })` per cell — with the
viewport set to the IMAGE's own size. At any other size Chromium's image
viewer centres the picture and every clip lands off by the margin, which
reads as a sheet of black cells rather than as an offset. Delete the
script before committing; it is a lens, not tooling.
