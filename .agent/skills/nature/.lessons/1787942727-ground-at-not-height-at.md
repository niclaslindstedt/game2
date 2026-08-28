---
title: Props stand on `terrain.groundAt`, not `terrain.heightAt` — testing against the wrong one invents hundreds of floating rocks
date: 2026-08-28
scope: engine/mapgen/terrain.ts, engine/mapgen/props.ts, tests/
concepts: [terrain, props, tests, placement]
---

The terrain exposes two surfaces and they are not the same: `heightAt` is the
analytic field, `groundAt` is the LATTICE the car actually rides, and every
prop field plants its feet on `groundAt` so a solid never hovers a step over
the drawn ground.

A test that asks whether a prop is bedded into the hill — `ob.y <
ground - 0.05` — reads a third of the whole landscape as sunk if it compares
against `heightAt`, because the two surfaces differ by up to a few decimetres
everywhere. Same trap for anything reading the local gradient: sample
`groundAt` over the same span the field itself used, or the fall line a test
computes is not the one the placement saw.
