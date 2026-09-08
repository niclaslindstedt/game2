---
name: atmosphere
description: "Use when working on the SKY and the air under it — where the sun is and what colour it makes the sky, the clouds, the mist in the valleys, the shadow a ridge throws, the horizon's ridge rings, rain and snow and how hard they come down, lightning, the birds and the aircraft crossing above them, and what water and ice LOOK like. Owns the daylight clock, the cloud chart, the height fog every material carries, and the two contact sheets that are the only honest way to judge any of it — `make sky` and `make traffic`. Not the ground and what grows on it (`nature`), and not transient effects the car throws off (`visual-effects`)."
---

# The atmosphere: the sky, the light and the weather

Everything above the ground and in the air between the camera and the hills.
The stage's look is set here before a single tree is placed: the sun's
elevation decides the palette, the weather decides the contrast, and the mist
decides how far the country reads. A change here moves every screenshot in
the game.

**Read this skill's lessons first** — `node scripts/skill-lessons.mjs
atmosphere --list`, then the ones the task touches. Load **`skill-reflection`**
at both ends of the session and **`write-code`** beside this one for any code
change. For the ground and what grows on it, `nature`; for dust, spray and
anything the car throws off, `visual-effects`; for how it all SOUNDS,
`sound-effects` (thunder, rain, the geese).

## The files, one direction of flow

The sun is decided first, everything else reads it.

| File | Owns |
| --- | --- |
| `pwa/src/game/daylight.ts` | WHERE THE SUN IS: the hour, the season and the country's latitude turned into an elevation and a bearing. The clock itself is the engine's `sunHourAt` — an hour of sun per minute of racing |
| `pwa/src/game/sky.ts` | What COLOUR the sky is: a ladder of rungs over the sun's elevation, plus the weather and season colour maths, over the tables in `sky-looks.ts`. Also `sunHardness` — how hard a shadow the light throws |
| `pwa/src/game/cloud-field.ts` | What is IN the sky: the cloud chart's genera, their altitudes and coverage, decided per stage. `sky-shader.ts` draws them on the dome; `clouds.ts` is the LOW setting's ring of puffs and its mesh deck |
| `pwa/src/game/starfield.ts` | THE NIGHT SKY: where the sphere of stars has turned this hour and season (the pole is the country's latitude), the Milky Way's frame, band and rift, and the star grids — as GLSL for the dome and as the same arithmetic in TypeScript for the LOW sky |
| `pwa/src/game/night-sky.ts` | The LOW setting's answer to it: the field baked into points and the band into one additive strip |
| `pwa/src/game/mist.ts` | The rule for mist in the valleys — when it lies there and how deep |
| `pwa/src/game/height-fog.ts` | The fog chunk EVERY material carries: the mist, the sun in it, and the shadows in the air |
| `pwa/src/game/mountain-shadow.ts` | The shadow the COUNTRY throws — a low sun stopped by a ridge, marched off the heightfield; read by `height-fog.ts` on the ground and `sky-shader.ts` on the cloud sea |
| `pwa/src/game/horizon.ts` | The ridge rings closing the view, and the sea gap in them; turned to the run's sunrise or sunset by `environment.ts` |
| `pwa/src/game/weather.ts` | How heavy the weather is and how hard it is coming down — read off the wind, and DOM-free so the road bed can share it |
| `pwa/src/game/storm.ts` | Lightning; the thunder behind it is `thunder_*` in `audio/bank.ts` |
| `pwa/src/game/ambient-life.ts` | The birds, and the aircraft crossing far above them |
| `pwa/src/game/sky-traffic.ts` | How often an aircraft comes over and how its contrail ages — DOM-free |
| `pwa/src/game/skein.ts` | The birds that are GOING SOMEWHERE — geese, swans, the vee. What flies, which way and how high is the SEASON's answer (`passageFor`); the shape they hold is `formationOffset`, and the same season is heard in `audio/ambience.ts` |
| `pwa/src/game/water-look.ts` | What WATER looks like — one flat semi-transparent material for lakes, fords and streams alike; and `iceMaterial` over `iceTexture` (`textures.ts`) for a frozen one. The SHEETS themselves are cut in `terrain.ts` (`flushSheet`) |
| `pwa/src/game/environment.ts` | Hangs it all in the scene: the sky, the light, the horizon's orientation. The CAR's own beams and its brake pool are `car-lamps.ts`, which this only drives |

WHETHER a lake is frozen at all is the engine's call, not this skill's:
`CLIMATE.ice` + `waterFrozen` / `icyCountry` in `engine/game/climate.ts`, and
the floor it becomes is `iceAt` on the `LandField`. This skill only decides
what that ice LOOKS like.

## The two labs

Neither the sky nor the traffic can be judged from one frame — both are
functions of the hour and the weather, so both are contact sheets.

```sh
make build                       # both harnesses serve pwa/dist
make sky                         # every weather x hour of a day, the simple
                                 # sky, plus a strike → previews/sky.png
make traffic                     # five skies x four moments of ONE race →
                                 # the aircraft and their contrails
```

`make sky` is REQUIRED before and after any change to the sky, the weather or
the storm; `make traffic` before and after any change to the aircraft or their
contrails. In web sessions Chromium is preinstalled —
`CHROMIUM_PATH=/opt/pw-browsers/chromium make sky`.

Read the sheet as a sheet: the failure mode of this subsystem is a change that
looks right at noon in clear weather and wrong at every other cell. Check the
low-sun rungs (dawn and dusk) and the heaviest weather column especially —
that is where a palette change usually breaks. The NIGHT columns are their own
review: they are dark, so a thumbnail lies about them — crop the cells at
native resolution rather than judging the sheet as a whole.

## Craft rules

- **The sun is the single input.** Anything that needs to know how bright,
  how hard-edged or what colour the light is asks `daylight.ts` / `sky.ts`;
  nothing restates an elevation or picks its own sun colour. A car's shadow
  (`car-shadow.ts`) reads `sunHardness` for exactly this reason.
- **The fog is a material chunk, not a post pass.** Every material carries
  `height-fog.ts`'s chunk, so anything new drawn in the world must include it
  or it will hang in front of the mist instead of inside it.
- **Sky elements are an ANGULAR size.** A cloud, a bird or an aircraft is
  placed by the angle it subtends, not by metres — it is effectively at
  infinity, and something sized in metres pops as the camera moves.
- **The weather is shared with the audio.** `weather.ts` is DOM-free so the
  road bed and the ambience read the same number the renderer draws; do not
  fork a second notion of "how hard it is raining".

## Documentation sync

A change to the sky, the weather or the storm updates the atmosphere bullet in
`docs/architecture.md`; a change to the aircraft or a contrail updates the
high-traffic bullet. Then re-shoot the sheet and read it.
