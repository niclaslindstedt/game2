---
name: car-design
description: "Use when designing or changing how a CAR LOOKS — its silhouette, proportions, panels, wheels, spoiler, livery, or colors. Owns the parametric body builder (pwa/src/game/car-body.ts), the per-car specs (car-styles.ts), and the render-compare-iterate loop: generate candidate variants, contact-sheet them with `make cars` from the gaming perspective and turntable angles, LOOK, pick a winner, refine, then verify in the real game."
---

# Car design

Cars in this game are not modeled in a DCC tool and not hand-placed boxes:
they are **generated**. `pwa/src/game/car-body.ts` lofts a low-poly body from
a `CarBodySpec` — silhouette stations, cabin, flares, wheels, spoiler,
colors — and bakes a fixed fake sun into vertex colors so the fullbright
arcade look still has panel definition. Designing a car means editing a spec
and LOOKING, never guessing from numbers.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs car-design --list`, then what the task
touches. Load `skill-reflection` at both ends, and `write-code` beside this
skill for any code change.

## Where everything lives

| Piece                          | Role                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `pwa/src/game/car-body.ts`     | The builder: shell loft, greenhouse, bumpers, lights, arches, mud flaps, wheels, spoilers, baked shading |
| `pwa/src/game/car-styles.ts`   | The specs — one `CarBodySpec` per catalog id. **Pure data, no three.js import** (Node tooling loads it)  |
| `pwa/src/game/car-mesh.ts`     | Scene wrapper: attitude (drift roll / air pitch), wheel spin + steer, blob shadow                        |
| `pwa/src/tools/car-preview.ts` | The harness page the preview tool drives (contact-sheet renderer)                                        |
| `scripts/car-preview.mjs`      | The tool: `make cars` / `npm run cars`; `--variants`, `--cars`, `--out`, `--skip-build`                  |
| `engine/game/defs/cars.ts`     | NOT this skill's file — handling numbers and the catalog. Only `color`/`accent` feed the default look    |

## The loop: generate → render → LOOK → iterate

1. **Render the current state**: `make cars` (Chromium required; in web
   sessions `CHROMIUM_PATH=/opt/pw-browsers/chromium`). The sheet lands in
   `previews/cars.png`: per car one row — chase-cam **game** view first
   (straight + mid-drift, the view that actually matters), then front 3/4,
   side, rear 3/4, top.
2. **Generate candidates, several at a time.** Write a scratch script that
   imports `CAR_BODIES`, clones a spec (`JSON.parse(JSON.stringify(...))`),
   patches ONE axis per variant (silhouette, cabin, glass tone, spoiler…),
   and writes `{ cars: [{ id, spec }] }` to a JSON file. Then:

   ```sh
   node scripts/car-preview.mjs --variants candidates.json --out candidates
   ```

   Label variant ids by what changed (`cpt-A-boxy`, `cls-C-fastback`) so the
   sheet reads as an A/B/C test.

3. **LOOK — with the Read tool, and zoom.** The full sheet shrinks in
   terminal view; crop cells out (PIL or the harness cell math: 440×310 per
   cell) before judging details like wheel arches or light placement.
4. **Pick the winner, fold it into `car-styles.ts`, re-render.** Spec-only
   iterations can pass `--skip-build` — the harness bundle only needs a
   rebuild when `car-body.ts` or the harness itself changed.
5. **Close in the real game**: `make build` then `make screenshots` (the
   `playtest` skill). The contact sheet judges the sculpture; only the game
   proves the read at speed, in fog, against the world palette.

## Judging a car (what "good" means here)

- **The game view is the verdict.** A car is judged at 7 m behind and 2.5 m
  up, mid-drift, at 30 px tall — silhouette, roof color, and wing must read
  THERE. Turntable views only diagnose.
- **Identity per car, one glance apart**: the small car is short, tall,
  boxy (white roof, lip spoiler); the big car is long, low, rear-set cabin
  with the full wing. Any new car needs its own one-glance signature.
- **Match the world's art direction**: fullbright, faceted, chunky. No
  smooth curves — the loft's hard stations ARE the style. Keep glass light
  (an arcade near-sky tone, not black): a dark greenhouse reads as a hole.
- **Wheels sell rally**: big, proud of the body (tire face outside the
  rocker), light hubs. If wheels vanish under the body, raise `floorY` or
  push `trackHalf` out rather than shrinking the body.
- **Physical scale is fixed**: cars stay roughly real-sized (3.6–4.6 m long,
  ~1.7–1.8 m wide, roof ≤ ~1.4 m) — the camera, dust, and road width are
  tuned for it. Changing a car's LENGTH does not change physics (the engine
  is a point-mass), but keep visual footprints honest against track width.

## Spec-editing craft

- The z axis points out the NOSE; stations run nose → tail, and the loft
  interpolates linearly between them — add a station only where the
  silhouette bends.
- `beltY`/`floorY` are spec-wide; per-station `topY`/`half` do the shaping.
  The rocker/shoulder tuck ratios live in `car-body.ts` (`ROCKER`,
  `SHOULDER`) and apply to every car.
- Flares are a triangular bulge over each axle (`flare.extra` ≈ 0.05–0.07 m
  reads Group-A wide-body without silliness).
- Colors are plain hex numbers so specs stay JSON-serializable — that is
  what lets `--variants` bypass the TypeScript build entirely.
- New body part (light pods, snorkel, roof scoop…) → a new builder function
  in `car-body.ts` driven from optional spec fields, defaulting off, so
  every existing spec keeps rendering unchanged.

## Ship checklist

- [ ] Winner folded into `car-styles.ts` (specs stay pure data)
- [ ] `make cars` sheet checked AND `make screenshots` in-game check
- [ ] `npx tsc --noEmit -p pwa/tsconfig.json` + eslint on touched files
- [ ] A changeset fragment (a car's look is player-visible — `changelog` skill)
- [ ] docs/architecture.md still describes the car pipeline truthfully
