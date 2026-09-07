---
title: The dome and the LOW ring are two answers to ONE chart, and the ring's `Math.max(1, …)` floor hid the empty one
date: 2026-09-07
scope: pwa/src/game/clouds.ts, pwa/src/game/cloud-field.ts
concepts: [sky, parity, rendering]
---

`cloud-field.ts`'s `dressSky` is the chart; `sky-shader.ts` draws it as sheets
on the dome and `clouds.ts` stands in for it with a ring of instanced puffs on
the LOW sky lever. Only the first of the two ever read the dressing — the ring
sized itself off `Preset.cloudShare`, a per-COUNTRY constant, behind a
`Math.max(1, …)` floor. So any change to what the chart may roll reaches half
the players: a stage the chart put nothing over came out bare on MEDIUM/HIGH
and with one lone puff parked over it on LOW.

`clouds.apply` now takes the `SkyDressing` beside the `Preset`, the same pair
`shell.apply` takes. When you change what the chart CAN say, check both
consumers, and be suspicious of any floor that cannot express "none" — the
shader was already safe (`build.layers === 0` emits no loop), the ring was not.
