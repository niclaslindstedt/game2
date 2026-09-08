---
title: A part that shatters is a PARTICLE effect, not geometry — quads cut out of the pane read as comic-book confetti, and grit's size and opacity read the same way
date: 2026-09-08
scope: pwa/src/game/car-damage.ts, pwa/src/game/dust.ts, pwa/src/game/renderer.ts
concepts: [visual-effects, debris, glass, art-direction, particles]
---

Two ways to get a shattering window wrong, and a session hit both in one
pass.

**Splitting the pane's own triangles into clumps and tumbling each as a
mesh.** It is the obvious model — the pieces really are pieces of that
window — and it looks like a page of confetti: half a dozen big opaque
quads, window-shaped, turning over behind the car. A shard of glass is
millimetres, a clump of a window is a hand's width, and nothing in between
reads as glass. It also leaves every clump lying in the debris group for
the rest of the run.

**Spawning into the wheel-dust pool.** `GRAVEL_DUST` is sized and
opacity'd for grit the colour of the ground it came out of, so a fat
sprite of it disappears into its own cloud. Pale glass at the same size
and 0.85 opacity, against a dirt road, is a white square stuck to the
screen. Anything TRANSLUCENT needs its own `DustStyle`: small enough to be
a speck (0.03 against gravel's 0.075), faint (0.5), and heavy — glass is
thrown and then falls and stays, where dust hangs and drifts.

Park a new pool like `crash` does (`visible = false`, switched on by its
first spawn and off when the last grain dies): a `THREE.Points` in the
scene costs a draw call and its whole buffer every frame, and most runs
never break a window.

And check what already exists before adding a channel. The renderer had
thrown a glass burst at the pane's own position for as long as the plate
had been flying — the plate was the bug, and deleting it was most of the
fix.
