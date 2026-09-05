---
name: ui-review
description: "Use for a fit-and-finish pass over the game's UI — the HUD, the touch controls, the finish/results overlay, the update toast. Drives the screenshot-audit loop: capture every surface at the reference viewports (desktop landscape, phone portrait), evaluate against the quality bar, fix what clips, overflows, or drifts off the shared look, and verify with re-captures."
---

# UI Review — audit the HUD and every overlay

The game's UI drifts the way all game UI drifts: a new readout ships at a size
that reads on desktop and vanishes on a phone, a touch control creeps under a
thumb's blind spot, an overlay assumes landscape. This skill is the periodic
sweep that catches all of it at once — **look at every surface, judge it, fix
it, look again**. Never evaluate UI from code alone; the failures (clipping,
overlap, illegibility over a bright sky) only show up in pixels.

The UI surface today is small — `pwa/src/game/hud.tsx` (the readouts),
`hud-touch.tsx` (the thumb zones, which are the phone's only controls),
`pwa/src/styles.css`, and the framework's update toast — which is exactly why a
sweep is cheap enough to run on every UI change.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs ui-review --list`, then the ones this task
touches. Load **`skill-reflection`** at both ends of the session.

## Tooling

| Piece                    | Role                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `scripts/screenshot.mjs` | The capture harness — scenes at 1280×720 (desktop landscape) and 390×844 (phone portrait)                     |
| `make screenshots`       | Runs it against the BUILT app (`make build` first); `CHROMIUM_PATH=/opt/pw-browsers/chromium` in web sessions |
| Read tool on the PNGs    | The evaluation itself — every judgement is made on a screenshot, not on source                                |
| `npm run dev`            | Headed spot-checks (hover states, the update toast's timing, touch behavior in devtools emulation)            |
| `scripts/debug-shot.mjs` | ONE driving frame, any viewport — the cheap way to audit a single instrument's placement                      |

The two shipped viewports are the floor, not the ceiling: when a change is
layout-sensitive, add a capture at the tight cases — landscape phone
(844×390, the harshest axis for a HUD strip) and a small phone (375×667) —
by passing a viewport in a scene. A surface tuned to exactly fit 390×844 runs
out of room on the SE class first.

**When the change is ONE instrument's placement rather than a surface, take
one frame per viewport instead of the whole sweep.** `debug-shot.mjs` wants a
repro line, but a bare seed is a valid one — it fills in the rest and drops
you on the grid with the HUD up:

```sh
make build
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/debug-shot.mjs '?seed=42' --out land
node scripts/debug-shot.mjs '?seed=42' --portrait --out port
node scripts/debug-shot.mjs '?seed=42' --viewport 844x390 --out phone-land
```

Each is about half a minute against a built `pwa/dist`, which makes the
before/after pair affordable on every orientation the rule splits on. The
frames carry the debug overlay (the script forces `debug=1`), so read the
corner the change is in and leave the boxes alone. It cannot stage a moment —
a drift, a landing, a finish card still needs `make screenshots`.

## The quality bar

Judge every screenshot against this list. Extend it when a new rule of thumb
settles (that is the `skill-reflection` promotion path).

1. **Nothing clips or overlaps at either viewport.** The HUD's elements keep
   clear of each other and of the safe areas at every aspect ratio the scenes
   capture.
2. **Legible over the WORLD, not over a mockup.** The scene behind the HUD is
   a bright sky over saturated grass and gravel — the worst case for white
   text. Every readout keeps its shadow/outline treatment (`hudInk` /
   `hudShadow` in `identity.ts`'s palette); a new element that skips it reads
   fine in devtools and vanishes at noon.
3. **Touch targets are thumb-sized and reachable.** The HUD IS the touch
   control surface on phones: controls sit in the thumb arcs (bottom corners),
   sized for a moving thumb, and never overlap a readout a player must watch
   mid-drift.
4. **Essential info reads at speed.** Speed, gear, drift feedback, the seed —
   a player glances at these mid-corner. Small captions are fine for
   ambient info; anything decision-driving is big.
5. **One look.** The HUD wears the arcade identity — the palette from
   `pwa/src/identity.ts`, never a re-hardcoded color. A new overlay that
   invents its own greys is drift; re-skin it.
6. **Portrait is designed, not squeezed.** The portrait layout is its own
   arrangement, not the landscape HUD scaled down.
7. **Safe areas + reduced motion.** Anything pinned to a screen edge respects
   `env(safe-area-inset-*)`; decorative animation has a
   `prefers-reduced-motion` fallback that keeps the information.
8. **The PWA surfaces count too.** The update toast and install flow are UI —
   capture them when they change (the toast can be forced by temporarily
   wiring a URL-param check into the update state; revert before committing).
9. **An instrument's IDLE color never sits on its own alert ramp.** A gauge
   that ramps yellow-to-red must read as something cool and inert when the
   thing it watches is fine; a warm "neutral" — cream, bone, off-white — lands
   close enough to the low end of that ramp, over a dark plate, that a healthy
   car looks like a hurt one. The other half of the same rule: a readout that
   paints every healthy part bright green is a row of lights shouting nothing.
   Quiet when there is no news is what makes the news findable at speed.

## Process

1. **Capture the baseline.** `make build && make screenshots` on a clean
   tree; skim EVERY PNG with the Read tool. List findings in two buckets:
   _broken_ (clips, overlaps, unreadable) and _drift_ (off-palette,
   undersized, inconsistent). Note the surfaces that are already strong —
   they define the bar, and the list proves the sweep was total.

   **When the edit is already written, take the baseline from `origin/main`
   rather than skipping it** — a card that overflows by 89px says nothing
   about whose fault that is, and a session that assumes it is theirs will
   redesign a layout that was already over. A worktree builds one in seconds
   with no `npm install`, because the build only ever reads the tree:

   ```sh
   git worktree add ../base-main origin/main
   ln -s "$PWD/node_modules" ../base-main/node_modules
   ln -s "$PWD/pwa/node_modules" ../base-main/pwa/node_modules
   (cd ../base-main && npm run build --workspace pwa)
   ```

   Point the probe's static server at either `pwa/dist` and run it twice;
   `git worktree remove --force` before committing. This is also the only
   safe way to take a late BEFORE — `git stash && make … && git stash pop`
   leaves the work stashed when the long target times out. Report a
   pre-existing overflow instead of quietly fixing or quietly inheriting
   it: a comment in the CSS naming the shape that does not fit, and why the
   obvious fix does not work, beats another round of shaving gaps.

2. **Fix structurally, not per-symptom.** Prefer the shared fix (a token, a
   shared text-shadow rule, a layout container) over per-element nudges; most
   drift exists because a surface predates a shared pattern. New CSS goes
   next to the component's existing block in `styles.css`.
3. **Re-capture and re-look.** Same harness, same scenes. Diff by eye against
   the baseline; a fix that helps landscape can break portrait.
4. **Gates + ship.** `make build && make test && make lint && make fmt-check`,
   a changeset fragment when anything user-visible changed, then the `commit`
   skill. Presentation-only passes rarely need new tests; engine untouched
   means the suite should be green unmodified.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. A settled
quality rule belongs in the bar above; a new surface earns a scene in
`scripts/screenshot.mjs` in the same change that ships it — a surface the
harness can't reach is a surface no sweep will ever look at.
