---
title: Water on the driver's glass reads as rain by its CROWD — hold every size to millimetres of real glass, and give tiny beads a lens floor instead of a highlight
date: 2026-09-06
scope: pwa/src/game/car/screen-rain.ts
concepts: [rain, glass, cockpit, shader, refraction, readability, scale]
---

"A 3 mm bead is under a pixel from the seat" is wrong by an order of
magnitude: the cockpit lens (fov 50, eye ~0.7 m off the glass) puts about
0.9 mm of windscreen on a 1080p pixel and 1.3 mm on a 720p one, so life-sized
beading is two to eight pixels across. Drawn "a size larger than life" the
runners came out four to eight CENTIMETRES wide — coins, not rain — and the
screen read as bubble wrap, which a player names on sight.

What the reference photographs show, and what the shader is held to:

- **Small and dense.** An unwiped screen is carpeted with drops one to five
  millimetres across; the crowd is what reads as rain. Three jittered layers
  at scales that do not divide one another (`BEAD`), with a `density` so a
  spit is a few beads far apart before it is many small ones.
- **Runners are still small.** A bead lets go at five or six millimetres, so
  nothing on the screen is a centimetre across (`RUNNER`). A running drop is
  a drop plus a TRACK: a continuous thread a third of the head's width, down
  a lane cleared of beading (`swept`). A dotted trail over untouched beading
  is a scratch on the picture.
- **The door glass keeps its millimetres** (`SIDE.scale` 0.8): three times
  the pixels IS what a side window looks like from the seat beside it.

Two things a small bead needs that a big one does not: a refraction FLOOR
(`BEND_FLOOR` — a lens bends by its curvature, not its size, so a bead three
pixels across still turns the world over; by radius alone the small beads
show the world un-bent, as specks of dirt), and LESS highlight — a highlight
the size of the bead against dark trees is snow, so it is scaled down under
~2.5 px and the dark rim does the work: fine beading is a milky haze.

Judge it on the three `cockpit-rain` scenes at 720p, the worst case.
