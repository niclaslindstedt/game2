---
title: main-menu.tsx and menu.tsx sit within ~50 lines of the 1000-line cap — budget a split into any change that grows either
date: 2026-09-20
scope: pwa/src/game/
concepts: [file-size, menus, refactor]
---

`tests/file_size_test.ts` holds every source file to 1000 lines, and two of
the menu modules are close enough that an ordinary feature lands over it:
`main-menu.tsx` was 948 and `menu.tsx` 968. Rewriting ONE page of the front
door pushed main-menu to 1021, and rewriting the pause card pushed menu.tsx to
1029 — two cap failures from one change, both found by the suite rather than
by reading.

Both split cleanly along the grain the files already have, and the split is an
improvement rather than a tax:

- `menu.tsx` is the shared option VOCABULARY (the bands, the weathers,
  `OptionRow`, `MenuHead`, `ToggleRow`). A PAGE living in it was the anomaly;
  the pause card came out as `menu-pause.tsx`, beside `menu-headsup.tsx` and
  `menu-options.tsx`.
- `main-menu.tsx` is the ROUTER plus the campaign's own pages. The front door
  came out as `menu-root.tsx`.

A page module extracted out of `main-menu.tsx` will need `MenuPage` — import it
back as a TYPE (`import type { MenuPage } from "./main-menu.tsx"`). That is
erased at compile time, so the apparent cycle is not one at runtime.

Plan the split when you start, not when the suite says so: a rewrite done in
place and then moved is the same edit twice.
