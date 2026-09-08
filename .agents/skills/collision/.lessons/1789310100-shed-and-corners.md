---
title: A part torn off a STATIONARY car has nothing to be thrown by — the renderer's throw is built out of the car's own speed, which a plunge has none of
date: 2026-09-08
scope: pwa/src/game/car-damage.ts, pwa/src/game/loose-wheel.ts, engine/game/collision.ts
concepts: [collision, damage, debris, wheels, visual-effects]
---

`throwWheel` gives a wheel the corner's own velocity, the tread's spin, and
a small constant kick; `throwOff` gives a panel 0.8× the car's velocity and
a random pop. Both were written for a part torn off AT ROAD SPEED, and both
degenerate to the constant alone when the car has stopped — which is
exactly what a car that fell out of the sky has done (measured at the frame
the wheels leave a 1500 m plunge: `u` 0.08 m/s, tread spin 0.3 rad/s). Four
wheels then leave on the same step at the same speed, two left and two
right, and flop over beside the car: a symmetric fountain that reads as
scripted, arriving through a model with no script in it.

The fix is a number the engine already computes and used to throw away.
Carry it on the event (`partBreak.shed`, m/s) and let the renderer's
constant become a DIRECTION the engine scales. Give it a floor equal to
what a part always left with, and every ordinary crash is unchanged by
construction — only arrivals violent enough to beat the floor throw harder,
which is the whole set of cases the constant was wrong for.

The same applies to WHICH corner fails. Dealing an arrival evenly to four
wheels is what made them leave in formation; weighting by the corner's
depth under the arrival attitude (`cornerLoads`) is one line of geometry
and is what makes a nose-first plunge tear off the front pair and leave the
rears. Keep the weights symmetric about 1 so the arrival is redistributed
and never inflated, and size the swing against BOTH ends — too little
distinguishes nothing, too much lets an attitude the car held for ten
milliseconds save a corner from a terminal impact.
