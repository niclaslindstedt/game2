---
name: hud-and-menus
description: "Use when changing WHAT THE PLAYER READS AND PRESSES — a HUD readout (dials, boards, pacenote calls, the news column, the minimap, the damage schematic), the touch or gamepad controls and their bindings, a menu page (main menu, Roam's map, the pre-race car card, options, the campaign's stage boxes and location table, the pause card), a player setting, the high-score board, the ghost, the photo roll and gallery, or the splash. Owns the DOM-free-payload split every one of these is built on, the menu-card containing-block trap, and where each surface lives. Load `ui-review` beside it for the screenshot-audit sweep that judges the result."
---

# The HUD and the menus: what the player reads and presses

Everything on screen that is not the world. Two surfaces, one rule: the
**decision is DOM-free, the DOM only renders it**. A payload module works out
what to show — the shapes, the numbers, the framing, the cursor's next stop —
and a `.tsx` component draws it. That split is why the root vitest suite can
test a minimap, a shift window and an initials entry without a browser, and it
is the first thing to preserve in any change here.

**Read this skill's lessons first** — `node scripts/skill-lessons.mjs
hud-and-menus --list`. Load **`skill-reflection`** at both ends, **`write-code`**
beside this one, and **`ui-review`** for the fit-and-finish sweep at the
reference viewports. For what a readout MEANS (a warning, a camera's framing,
a drift's drama) load `game-feel`; for the developer surfaces, `debug-tools`.

## The HUD

| Surface                                                       | Where                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readouts: dials, boards, calls                                | `pwa/src/game/hud.tsx` + `pwa/src/styles.css`                                                                                                                                                                                                                                                |
| THE NEWS COLUMN — what the car has just thrown off, and where | `.hud-flashes` in `styles.css` (bottom-right, newest at the bottom); how many stand and how long is `FLASH_LINES` / `FLASH_LIFE` in `App.tsx`                                                                                                                                                |
| The SHAPE a corner call is drawn as, and the head on it       | `pace-shape.ts` — the stage's own plan of that turn, fitted to the sign's box; DOM-free                                                                                                                                                                                                      |
| What the minimap DRAWS, and at what framing                   | `minimap-scene.ts` — the schematic and the window it is cut in (span, speed zoom, anchor); DOM-free, so `tests/minimap_test.ts` reads it                                                                                                                                                     |
| What STANDS on the minimap (car, field, board)                | `minimap-view.ts` is the payload; `minimap.tsx` the DOM and glyphs; `.hud-minimap-*` in `styles.css` the palette                                                                                                                                                                             |
| The car's CONDITION at a glance                               | `car-health.ts` (the damage ledger folded to four colours, DOM-free) + `hud-health.tsx` (the plan and the marks under it) — `make health` is the lab; `collision` owns the ledger itself                                                                                                     |
| The rear-view mirror, folded away and back                    | `hud-mirror.tsx` — the glass as a switch; the menu option is still the only way to be rid of it. The glass itself is `mirror.ts`, and how often it is redrawn and how far it sees is `mirror-pace.ts` — the ladder the frame rate walks it down, DOM-free so `tests/mirror_test.ts` reads it |
| How WIDE the mirror looks, and how far up the window          | `car/mirror-fit.ts` — the widest frame that lands entirely on the body's own backlight, tilted as high in it as it will go; the CURVE in the glass is `GLASS` in `mirror.ts`, on the EFFECTS row (`MIRROR_GLASS`)                                                                            |
| Watching the run-out once your run is over                    | `spectate.ts` (the feed) + `hud-spectate.tsx`                                                                                                                                                                                                                                                |
| The quickest this machine has been between two boards         | `split-records.ts` — one book per stage, banked as the board goes by; never shown as a number, it IS the NEW RECORD! beside a split                                                                                                                                                          |

## The controls

| Surface                                                   | Where                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input mapping                                             | `input.ts` (bindings in `settings.ts`)                                                                                                                                         |
| Touch: the wheel and the pedal zones                      | `hud-touch.tsx`; a zone's grip on a finger is `thumb-guard.ts`, what a drag MEANS is `pedal-gesture.ts`                                                                        |
| Which gears a thumb flick may take, and why a key may not | `shift-window.ts` — DOM-free, and the shift light reads off it too                                                                                                             |
| A controller's sticks, triggers and buttons               | `gamepad.ts` reads a POLLED pad (DOM-free); `input.ts` does the polling                                                                                                        |
| Walking a menu on a controller                            | `menu-nav.ts` (the cards, and `data-nav-back`) over `menu-cursor.ts` (where the cursor goes — DOM-free)                                                                        |
| Flying god mode on a pad or a phone                       | `readFlyPad` in `gamepad.ts` + `hud-fly.tsx`, merged in `input.ts`'s `flyMove`                                                                                                 |
| The press a THUMB ON THE GAS costs a button               | `second-finger.ts` — the browser withholds a touch's click for any press that shared the glass; the relay fires those itself, so a button stays a `<button>` with an `onClick` |

## The menus

| Page or piece                                | Where                                                                                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages and routing                            | `main-menu.tsx` (+ `menu-roam`, `menu-options`, `menu-car`)                                                                                                                                                                |
| Choosing a seed to drive                     | `menu-roam.tsx` — the map pane plus one column of `menu-knobs` rows                                                                                                                                                        |
| The window the renderer draws the map into   | `map-pane.tsx` — a HOLE, not a picture: it must paint nothing, or the map disappears                                                                                                                                       |
| The pre-race card: car, spec, gearbox        | `menu-car.tsx` — ONE card behind all four ways into a run, Roam included; the numbers in `car-stats.ts`                                                                                                                    |
| How the car is FRAMED on its stand           | `frameCar` in `car-turntable.ts` — measured off the built body, so the shot is full of car on a phone and a laptop                                                                                                         |
| The glyph a row leads with                   | `menu-glyphs.tsx` — one 24x24 mark per idea; `make glyphs` contact-sheets them at the three sizes they are read at                                                                                                         |
| The ROW every settings surface is built from | `menu-knobs.tsx` — mark, name, value, two arrows, pips; the pause card, options and Roam all share it                                                                                                                      |
| A player option                              | `settings.ts`, then its reader; offered on `menu-options.tsx` only if a PLAYER needs it — the rest stay code knobs                                                                                                         |
| Campaign stages, locations, points, unlocks  | `campaign.ts` — one board: the points a stage pays ARE what opens the next stage and the next location                                                                                                                     |
| The stage boxes and the country step         | `menu-levels.tsx` (shared by all three grids) + `LocationList`; the HEADS UP page is `menu-headsup.tsx`                                                                                                                    |
| The campaign's stage/country previews        | `stage-preview.ts` (road as an SVG path, country as a file name), both BUILT AHEAD by `make previews` (`scripts/stage-routes.mjs` → `stage-routes.ts`, `scripts/biome-preview.mjs` → `pwa/public/previews/biome-<id>.jpg`) |
| The location's table, drawn                  | `results-table.tsx` — behind the location head's STANDINGS press                                                                                                                                                           |
| How hard the game is, as a control           | `DifficultyPicker` in `menu.tsx` (three cards, green-amber-red) over the meter glyphs                                                                                                                                      |
| The campaign's stages offered elsewhere      | `StagePicker` in `menu-levels.tsx` over `App.tsx`'s `loadRoamLevel`; `levelForRoad` says which is loaded                                                                                                                   |
| High scores and initials                     | `scores.ts` (storage) + `score-board.tsx` / `hud-initials.tsx`; what a PRESS does is `initials-entry.ts` (DOM-free: the wheel, the caret, what an empty slot wakes as)                                                     |
| The time trial's ghost                       | `ghost.ts` — recording, replay, storage                                                                                                                                                                                    |
| Taking a picture                             | `screenshots.ts` (the canvas work) + `shot-plan.ts` (size, name, where the mark and notes go — DOM-free)                                                                                                                   |
| Getting the HUD into a picture               | `shot-hud.ts` — serialize at the press, rasterize later — over `hudLayerSvg` / `stampLift` in `shot-plan.ts`                                                                                                               |
| The roll of pictures, and sending one on     | `pwa/src/lib/shot-store.ts` over `shot-roll.ts`; the share/copy/save probes in `pwa/src/lib/share-image.ts`                                                                                                                |
| The gallery                                  | `menu-gallery.tsx`                                                                                                                                                                                                         |
| The studio card / boot cover                 | `splash.ts` (policy) + `splash-screen.tsx`                                                                                                                                                                                 |
| A figure that COUNTS to its new value        | `pwa/src/lib/count.ts` — the easing only; the caller owns the clock, which is what keeps it testable                                                                                                                       |

Everything above is under `pwa/src/game/` unless a path says otherwise.

## The traps

- **`.menu-card` carries a `backdrop-filter`, which makes it the CONTAINING
  BLOCK for every `position: fixed` descendant.** A modal mounted inside a
  menu page is therefore fixed to the CARD's box rather than the screen's, and
  on a phone held sideways its own way out ends up below the fold. Render a
  modal as a SIBLING of the card — `LocationPage`'s standings board does —
  never inside it.
- **The mirror's box is stated twice.** `mirror.ts` places the glass from a
  width, a top offset and an aspect; `.hud` in `styles.css` restates the same
  three so the co-driver's calls hang under the glass instead of across it.
  The strip is a canvas pass and the calls are DOM, so there is no shared
  measurement to read — change one, change both.
- **The menu backdrop is the real game.** `App.tsx` steps the engine on
  `botInput` under the drone camera while a menu page is up, and holds it
  under the map camera on Roam. A menu that stops driving is a bug, not a
  saving.
- **A campaign level or country edited in `campaign.ts` owes a
  `make previews`** — the boxes and banners are generator OUTPUT.

## The loop

```sh
make build
# The whole suite is dozens of shots and the better part of an hour. Name the
# SCENES instead — bare-word filters, matched as substrings of the shot name:
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/screenshot.mjs menu-options
CHROMIUM_PATH=/opt/pw-browsers/chromium make screenshots   # every surface
make glyphs                                                 # the menu's marks
make health                                                 # the condition schematic
```

Then run `ui-review`'s audit at the reference viewports (desktop landscape and
phone portrait, and rotation is its own case). A HUD change is not finished
until it has been LOOKED at on a phone-shaped viewport — the failure mode here
is always overlap, clipping or a control under a thumb that already has a job.
