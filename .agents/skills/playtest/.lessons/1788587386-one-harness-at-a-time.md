---
title: Run ONE screenshot pass at a time, and check the shot is newer than the file you changed before you read it
date: 2026-09-05
scope: scripts/screenshot.mjs
concepts: [harness, screenshots, tooling, verification, staleness]
---

A full pass takes minutes, so the temptation after another edit is to fire a
second one while the first is still going. Don't: both serve `pwa/dist` on the
same port and write the same `previews/shot-*.png`, so what lands is a mix of
two builds with no marker saying which is which. The failure is silent and
convincing — a shot whose mtime looks recent, showing the code from before
your edit, which reads as "my CSS did nothing".

Kill the running one first (`pkill -f screenshot.mjs`), rebuild, then start
one pass. And before drawing any conclusion from a frame, prove it is yours:

```sh
[ previews/shot-grid.png -nt pwa/src/styles.css ] && echo fresh
```

The same check catches the other stale case — reading a shot without having
run `make build` after the edit at all.
