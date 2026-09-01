---
title: Forces added to car.w before the lateral-grip redirect are silently erased
date: 2026-08-26
scope: engine/game/car.ts
concepts: [lateral-grip, slip, physics, gravity]
---

The lateral-grip block in stepGrounded rebuilds `u`/`w` from `car.slip`
(`kept·cos/sin(swung)`), and `car.slip` is only refreshed by
`updateSlip()`. Any lateral force applied to `car.w` upstream without
calling `updateSlip()` afterwards is thrown away wholesale when the
redirect overwrites `w` from the stale angle — the probe shows the force
having exactly zero effect, which reads as a sign error and is not. Apply
lateral forces immediately before the redirect and call `updateSlip(car)`
so the redirect sees the deflection (the hillside pull does this — see
`ctx.slopeLat`).
