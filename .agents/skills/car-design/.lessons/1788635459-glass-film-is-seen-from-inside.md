---
title: A coat laid ON a pane the player looks THROUGH must be double-sided — the film sits outside the glass, so from the seat it is a culled back face
date: 2026-09-05
scope: pwa/src/game/car/wipers.ts, pwa/src/game/car-body.ts
concepts: [dirt, glass, wipers, cockpit, materials]
---

The grime film is laid `FILM_LIFT` proud of every pane, outward. With a
single-sided material it is a coat every camera on the ladder sees from
outside and the cockpit camera never sees at all: the back window cakes for
everyone on the road while the windscreen and the side glass stay spotless
for the one person behind them. Nothing in a screenshot from outside shows
it — the film is right — and the cockpit shot just looks clean.

Anything laid on the glass for the driver's benefit gets `side: DoubleSide`
(the glass itself already is, for the far pane's sake). The same goes for
whatever is next laid on a pane: a sticker, a crack, a decal. Check the
cockpit view after a long bot-driven gravel run — `?start=1&bot=1&camera=cockpit`
held to 40-90 s of stage time — not the four-second shot `make screenshots`
takes, which is a car that has driven nothing yet.
