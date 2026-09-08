---
title: An exhaust is water the cold condenses plus soot the pedal blows out — and its near-lens fade is the opposite of a towed plume's
date: 2026-09-08
scope: pwa/src/game/exhaust.ts, pwa/src/game/fumes.ts, pwa/src/game/dust.ts
concepts: [particles, fumes, camera, weather, readability]
---

As one grey cloud darkening with ROAD SPEED an exhaust is wrong both ways at
once: a summer cruise smokes like a coal fire and a winter start line looks
like a summer one. It is two substances.

- **Water is the weather's.** Nothing over ~12 °C, a full plume by −10, more
  under a wet sky, half again out of a pipe still cold at the start of a run.
  Take the fuel ONCE here — a revving engine makes more water *and* more gas
  to carry it, so the throttle sets how much plume there is, not how white it
  is. Taken twice, a car idling at ten below has a wisp behind it.
- **Soot is the driver's**, and it needs the PEDAL. `rev` cannot stand in:
  coasting into a hairpin at 6,000 rpm and dragging out of it at the same
  revs are one needle and opposite engines — hence the `CarState` readout,
  written from the throttle the step already spent. Richest wide open and low
  down, which makes a stab of throttle a puff of black clearing as the revs
  come up: a real blip, no derivative, no per-car state.

Warm and off the throttle both come to nothing: return a burst of NO puffs
and never touch the pool. That pays for the winter stage.

**The near-lens fade inverts.** A towed plume is left on the road and the
camera drives INTO it, so `nearFade` is high (2.6 m) to keep it off the
glass. An exhaust leaves the pipe BACKWARDS — on a stationary car, straight
at the chase camera — and the gap between bumper and lens is the only place
it is ever seen from. At the plume's distance the frame comes back with a
redlining tacho and clean air. About 1.1 m stops the wash without eating the
effect.

Judge it from a camera that can SEE a tailpipe: the chase rig looks along
its own roofline with the pipe off the bottom edge, so a scene shot there
says nothing either way.
