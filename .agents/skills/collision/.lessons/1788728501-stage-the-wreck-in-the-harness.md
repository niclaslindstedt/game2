---
title: The LOOK step for a fold is `make wrecks` first; the game's own `shot-crash*` scenes come after, with the head-ons last because they can time out
date: 2026-09-01
scope: scripts/screenshot.mjs, pwa/src/game/car-damage.ts
concepts: [collision, damage, screenshots, harness, playtest, glass]
---

`make wrecks` is the LOOK step for the shape of a fold: one body through a
brush, two head-ons, a corner, a flank, a rear shunt, a roll and the wreck,
each a ledger written by hand in the engine's metres (`scripts/car-preview.mjs
--wrecks`, with `shearedParts` deriving the parts those folds tear off), bent
by the real damage visual with no physics or scenery in the way. `SCENE=flank
VIEWS=side CELL=1320x930` is one accident close up. Judge the fold there
first; it is seconds, and it shows every face.

The game's own wreck scenes are `shot-crash*` in `scripts/screenshot.mjs`
(`CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/screenshot.mjs
shot-crash shot-crash-after` after `make build`). Two things about them: the
chase camera never sees the nose (`shot-crash-headon-heli` is the frame for
that), and the head-on scenes wait for the car to drop under 25 km/h, which
on the current stage 42 it may never do — the scene then times out after
three minutes and takes the rest of the run with it. Name the scenes you
need, and put the head-ons last.

`make wrecks` is also the only honest tool for a PROGRESSIVE visual — glass
crazing, a gauge that fills. In the game the whole range between "first mark"
and "part gone" is under a second at rally pace, so a scripted crash catches
the car clear on one frame and stripped on the next however densely it is
sampled; the lab shows the whole ladder side by side in seconds. Drive the
game only for what a staged ledger cannot show — a piece LEAVING and where it
lands. Its gap: no view from inside the cabin, so a cockpit claim still needs
the game.
