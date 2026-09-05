---
title: Two screenshot passes overwrite each other's previews/ files — run one, and check the frame is newer than the file you changed
date: 2026-09-05
scope: scripts/screenshot.mjs
concepts: [harness, screenshots, tooling, verification, staleness]
---

A full pass takes minutes, so the temptation after another edit is to fire a
second one while the first is still going. Don't. They do NOT fight over the
port — `screenshot.mjs` serves on `listen(0)`, a fresh one each run — they
fight over the OUTPUT: both write the same `previews/shot-*.png`, so what
lands is a mix of two builds with nothing saying which frame is which. The
failure is silent and convincing: a shot whose mtime looks recent, showing
the code from before your edit, which reads as "my CSS did nothing".

Before drawing any conclusion from a frame, prove it is yours:

```sh
[ previews/shot-grid.png -nt pwa/src/styles.css ] && echo fresh
```

The same check catches the commoner stale case — reading a shot without
having run `make build` after the edit at all.

And `pgrep -f screenshot.mjs` is not a way to ask whether one is running: the
shell running your pgrep has that string on its own command line, so it
matches itself and reports BUSY forever. Match on the node process
(`pgrep -f "node scripts/screenshot.mjs"` still self-matches; `pgrep -x node`
or just reading `previews/` mtimes does not).
