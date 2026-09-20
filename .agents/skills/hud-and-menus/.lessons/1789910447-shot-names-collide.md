---
title: Before adding a screenshot scene, grep EVERY shots-*.mjs for the name — the pause card already has four, in shots-air.mjs
date: 2026-09-20
scope: scripts/lib/, pwa/src/game/
concepts: [screenshots, harness, menus, hud]
---

The scene set is split over five files (`shots-driving`, `shots-air`,
`shots-menus`, `shots-tools`, `shots-showcase`) and the split is not by
SURFACE. The in-race pause card's four scenes — `shot-pause`,
`shot-pause-portrait`, `shot-pause-landscape`, `shot-pause-start` — live in
`shots-air.mjs`, beside the HUD ones, not in `shots-menus.mjs` where a menu
surface obviously belongs. A menu-shaped name can be anywhere.

Adding `shot-pause` to `shots-menus.mjs` therefore compiled, linted and ran,
and silently defined the same output file twice: the sweep captured
`shots-air`'s version first (it runs earlier), then the new one overwrote it
at the same path. Nothing warned. The only clue was the log printing
`previews/shot-pause.png` before the menu scenes it was supposedly after.

Grep the names before writing a scene, not the file you expect them in:

```sh
grep -rno "shot-[a-z-]*" scripts/lib/shots-*.mjs | sort -u
```

Also: the command-line filter is `name.includes(word)`, so `shot-menu` selects
every `shot-menu*` scene and there is no way to shoot only the root menu. And
in a Claude web session every PORTRAIT scene is a picture of the rotate gate
(`orientation.ts` bars upright), which for a scene that CLICKS something is
not merely a useless picture — the run dies on a 30 s click timeout after
`racing` has already waited 180 s for a clock that a paused run never starts.
Shoot landscape filters only, in there.
