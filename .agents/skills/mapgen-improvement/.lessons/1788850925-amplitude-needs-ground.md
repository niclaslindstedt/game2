---
title: A dial that grows a landform's HEIGHT must grow the ground under it by nearly as much — and the stage's box caps how much relief can be real
date: 2026-09-08
scope: engine/mapgen/rules.ts, engine/mapgen/geology.ts
concepts: [massif, alpine, altitude, geology, terrain, dials, measurement]
---

R47's ALTITUDE dial grew the massif's crest 13× while growing its ridge
PERIOD only 2.2× (`spread: 0.3`). The flank's grade is height over period, so
the country came out at a measured 99th-percentile ground grade of 16.5
against 0.77 at the dial's default: not a mountain, a spike field. Every
downstream symptom followed from that one ratio — the summit had to be
flattened into a mesa before a road could be laid on it, R35 then sited every
start on the flattest ground available (the valley floor), and the fine ridge
octaves read as needles because they carried full amplitude on a vertical
face.

Two things to carry forward:

- **Check the RATIO, not the amplitude.** `grade = height^(1 - spread +
valleyPull)` says in one line whether a dial keeps a landform's character.
  Hold it near 1 and the shape survives the whole travel.
- **The stage's box is the hard cap on RELIEF.** For a peak to be inside a
  ~2.5 km box the ridge period must stay near the box's size; for the flank to
  be a mountainside the height must stay well under the period. Together that
  is roughly 1,500 m of relief, and no amount of tuning buys more. When a dial
  is asked for more than that, SPLIT it: keep the box-sized relief and put the
  rest into a base elevation that no geometry reads (`altitudeScale.base`) and
  only the bands, the air and the printed figure do. The slider still says
  6,000 M; the mountain is 748 m on a country 4,982 m up, which is how the
  Andes work.
