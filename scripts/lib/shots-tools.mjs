// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEVELOPER'S OWN SURFACES: the debug map and its layers, the stage
// list, the map viewer, the score boards and the photo roll. Not what a
// player is sold — what a contributor looks at to see whether a change did
// what it said.

import { join } from "node:path";

import { RICH_PICTURE } from "./shot-harness.mjs";

import { menuUp, stageGrid } from "./shots-menus.mjs";

export async function toolShots(shot) {
  const { capture, captureElement, racing, atStageTime, slowerThan, stageTime } = shot;
  const { browser, url, outDir, only } = shot;
  // ── The developer's map ─────────────────────────────────────────────────
  //
  // The map pane blown up to the whole screen, with one of the generator's own
  // layers painted over the landscape. These are the sheets to LOOK at when a
  // stage comes out wrong: the ground under a bad stretch of road can be read
  // off them without driving it.
  //
  // Nothing is captioned on screen — the numbers live behind COPY DEBUG INFO
  // now, and in the game's own SCREENSHOT they are painted into the picture.
  // These sheets do not need one: every fact a caption would carry is in the
  // URL below, which is also what makes them reproducible.
  //
  // Everything is pinned through the URL rather than clicked — the framing
  // included — so two passes over the same seed are the same picture and the
  // diff between them is the change under test. The map holds still by itself
  // once it is full screen (see holdMap), which is what makes that true.
  const MAP_FRAME = { maz: "0.9", mpitch: "1.0", mzoom: "1" };

  /** The full-screen map is standing and its stage is built — the copy button
   * arms itself off the same read the debug text comes out of, so a live
   * `data-ready` is the page saying there is a stage to photograph. Everything
   * here waits on the DOM rather than on a timeout: the world takes as long as
   * software rendering takes. */
  async function mapUp(page) {
    await page.waitForSelector(".roam-map-full", { timeout: 120000 });
    await page.waitForSelector("[data-map-copy][data-ready='1']", { timeout: 240000 });
    // The ground streams in a few tiles a frame, and a map photographed while
    // it is still arriving is a picture of a half-built island.
    await page.waitForTimeout(12000);
  }

  // The bare map first — the landscape as the generator left it, at the shape
  // every layer below is read against.
  await capture("shot-map-debug", { width: 1280, height: 720 }, mapUp, {
    menu: "1",
    roam: "1",
    mapfull: "1",
    debug: "1",
    ...MAP_FRAME,
  });

  // ...then one sheet per layer, in the order the country was made: the rock,
  // the water in it, the soil on it, the forest rooted in that, and the road
  // cut through the lot.
  for (const layer of ["bedrock", "water", "soil", "flora", "roads"]) {
    await capture(`shot-map-layer-${layer}`, { width: 1280, height: 720 }, mapUp, {
      menu: "1",
      roam: "1",
      mapfull: "1",
      debug: "1",
      layer,
      ...MAP_FRAME,
    });
  }

  // The same map leaned all the way in and WALKED to a place, which is the
  // other half of what these layers are for. `mzoom` is a multiplier on the
  // framing that holds the whole stage, so a twenty-fifth of it is a hundred
  // metres of ground; `mpanx`/`mpanz` walk the aim off the stage's centre,
  // which is what makes leaning in worth anything — the defect is never in the
  // middle. This one stands over the road 1.4 km into seed 42.
  await capture("shot-map-zoomed", { width: 1280, height: 720 }, mapUp, {
    menu: "1",
    roam: "1",
    mapfull: "1",
    debug: "1",
    layer: "water",
    maz: "0.9",
    mpitch: "0.7",
    mzoom: "0.04",
    mpanx: "868",
    mpanz: "-63",
  });

  // The same place after dark, and the reason the CAR is drawn on the map: the
  // environment throws its lamps whatever is drawn, so a hidden body left a
  // pool of headlight travelling along an empty road. Panned onto the start
  // line, where the Roam page's engine holds the car.
  await capture("shot-map-night", { width: 1280, height: 720 }, mapUp, {
    menu: "1",
    roam: "1",
    mapfull: "1",
    debug: "1",
    tod: "night",
    maz: "0.9",
    mpitch: "0.7",
    mzoom: "0.05",
    mpanx: "503",
    mpanz: "-484",
  });

  // ── The stage list, and the map viewer ──────────────────────────────────
  //
  // The campaign's own stages, opened on the map rather than driven — the
  // stages a defect actually reaches a player through. Driven by CLICKING
  // rather than by URL, which is the other half of what these two scenes are
  // for: every control on the developer map lives inside the map pane, and the
  // pane captures the pointer so a drag survives leaving it, so a press that
  // is not excused from that capture is a button that never fires.
  await capture(
    "shot-map-viewer",
    { width: 1280, height: 720 },
    async (page) => {
      await menuUp(page);
      await page.locator("[data-menu='developer']").click();
      await page.waitForTimeout(400);
      await page.locator(".menu-item", { hasText: "MAP VIEWER" }).first().click();
      await page.waitForTimeout(400);
      await page.locator(".menu-location", { hasText: "TAIGA" }).first().click();
      await page.waitForTimeout(600);
    },
    { menu: "1", debug: "1" },
  );

  await capture(
    "shot-map-campaign",
    { width: 1280, height: 720 },
    async (page) => {
      await menuUp(page);
      await page.locator("[data-menu='developer']").click();
      await page.waitForTimeout(400);
      await page.locator(".menu-item", { hasText: "MAP VIEWER" }).first().click();
      await page.waitForTimeout(400);
      await page.locator(".menu-location", { hasText: "TAIGA" }).first().click();
      await page.waitForTimeout(400);
      // The LAST stage of the location — the long climactic one, which is the
      // stage with the most in it to paint a layer over. Taken by position
      // rather than by name: the campaign's levels are re-picked whenever the
      // generator moves, and a name pinned here fails as a silent click
      // timeout rather than as an error. The picker opens every stage, locked
      // or not, so the last box is always there to take.
      await page.locator(".menu-level-open").last().click();
      await mapUp(page);
      // ...and the layer switched on with the BUTTON, not with a URL. Painting
      // a layer samples the generator over the whole stage on the main thread,
      // which under software rendering is longer than a click's default wait.
      await page.locator("[data-map-layer='soil']").click({ timeout: 120000 });
      await page.waitForTimeout(6000);
    },
    { menu: "1", debug: "1" },
  );

  // ...and the same boxes where a PLAYER meets them: Roam's own SELECT A
  // LEVEL, which is the campaign's country rows and the campaign's stage grid
  // with the padlocks off.
  await capture(
    "shot-roam-stages",
    { width: 1280, height: 720 },
    async (page) => {
      await menuUp(page);
      await page.locator("[data-menu='roam']").click();
      await page.waitForTimeout(600);
      await page.locator("[data-roam-level]").click();
      await page.waitForTimeout(400);
      await page.locator(".menu-location", { hasText: "TAIGA" }).first().click();
      await page.waitForTimeout(600);
    },
    { menu: "1" },
  );

  // The stage loaded back onto Roam: the pick button lit with its name, the
  // conditions it is authored in showing on the rows, and the map redrawn.
  await capture(
    "shot-roam-level",
    { width: 1280, height: 720 },
    async (page) => {
      await menuUp(page);
      await page.locator("[data-menu='roam']").click();
      await page.waitForTimeout(600);
      await page.locator("[data-roam-level]").click();
      await page.waitForTimeout(400);
      await page.locator(".menu-location", { hasText: "TAIGA" }).first().click();
      await page.waitForTimeout(400);
      await page.locator(".menu-level", { hasText: "COLD WATER" }).first().click();
      await page.waitForTimeout(6000);
    },
    { menu: "1" },
  );

  // ...and the CAR, which is the screen after it: the same pre-race card the
  // campaign hands off to, reached from Roam and saying so.
  await capture(
    "shot-roam-car",
    { width: 1280, height: 720 },
    async (page) => {
      await menuUp(page);
      await page.locator("[data-menu='roam']").click();
      await page.waitForTimeout(2000);
      await page.locator(".menu-start").click();
      await page.waitForTimeout(2500);
    },
    { menu: "1" },
  );

  // The conditions: a dawn run, the dusk sun, storm rain at speed, and night
  // under the headlights.
  //
  // The first two are also the sheet's pictures of the light switch's DIPPED
  // stop (`LampStage`, sky.ts): both stand with the sun still up — 8° climbing
  // and 5° falling — where a car is already running lights. What has to read
  // there is a car that is LIT rather than a car lighting the road: glowing
  // lenses, a short pool a few metres off the bumper, and daylight still on the
  // stage around it. The long corridor is `shot-night`'s, and the two frames
  // side by side are the whole point of having two stops.
  await capture(
    "shot-dawn",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4000);
    },
    { tod: "dawn" },
  );
  await capture(
    "shot-dusk",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4000);
    },
    { tod: "dusk" },
  );
  // The thunderstorm. Not the same stage dimmed: the acceptance test is a
  // BLACK sky with a lit strip under the cloud base at the horizon, scud
  // tearing along below it, the rain leaning at the pace the car is doing,
  // and both pairs of lamps lit at noon because there is not enough daylight
  // left to be seen in — DIPPED, not the driving beams, because a black sky at
  // midday is still a day: main beam waits for a deck over an hour that was
  // already losing the light (`LAMPS_GLOOM`, sky.ts). Every sky in every weather is on one sheet at `make sky`; this
  // is the one that has to hold up in the real game.
  await capture(
    "shot-storm",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4000);
    },
    { weather: "storm" },
  );
  await capture(
    "shot-night",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4000);
    },
    { tod: "night" },
  );

  // WHAT IS FALLING, at the pace it is read at. `make sky` has every weather
  // against every hour, but its cells are a fifth of a frame and a drop and a
  // flake are sized in PIXELS — so the sheet says whether the SKY is right and
  // only a real frame says whether the WEATHER is. Four of them, because the
  // sheets of rain and snow are built as three ranges each (rain.ts,
  // snowfall.ts) and every one of the four has to show all three:
  //
  //   NEAR — streaks or crystals coming at the glass, dense enough to be
  //   weather. At night this is the half the lamps light, and the acceptance
  //   test is that the two substances do not look alike: rain is a scatter of
  //   bright streaks with dark air between them, snow a wall.
  //
  //   MIDDLE — the far shell, hatching the country over rather than stopping
  //   at a bubble round the car. A frame where the rain ends at a clean radius
  //   is the defect this set exists to catch.
  //
  //   FAR — the fog, closed down live by the squall (`precipReach`,
  //   weather.ts) and, in snow, whitened to the flakes' own colour. The test
  //   is that the distance says it is raining WITHOUT a single drop in it: a
  //   downpour whose ridge line is as crisp as a clear day's is not a
  //   downpour.
  for (const scene of [
    { name: "rain-day", params: { weather: "storm", hour: "12" } },
    { name: "rain-night", params: { weather: "storm", hour: "22" } },
    { name: "snow-day", params: { weather: "storm", season: "winter", temp: "-12", hour: "12" } },
    { name: "snow-night", params: { weather: "storm", season: "winter", temp: "-12", hour: "22" } },
  ]) {
    await capture(
      `shot-falling-${scene.name}`,
      { width: 1280, height: 720 },
      async (page) => {
        // Driven by the bot and shot well down the stage: both sheets are
        // drawn at the velocity they are SEEN at, so a parked camera
        // photographs a completely different weather from the one anybody
        // plays in — and the snow's own cross-fade takes a second to come up
        // once the air at the camera is under freezing.
        await racing(page);
        await atStageTime(page, 8);
      },
      { bot: "1", ...scene.params },
      "load",
      // The DETAIL row's top stop, because the lamps finding the flakes and
      // the crystals near the glass BOTH ride it (`snow` in settings.ts) —
      // shot on the default preset this set photographs plain grey dots and
      // says nothing about the half of the effect a night blizzard is.
      { initScript: RICH_PICTURE },
    );
  }

  // THE BRAKE LIGHTS, which are the one lamp on the car that is a SIGNAL: they
  // exist for the driver behind, so they have to be read at the couple of car
  // lengths a chase is fought over and in FULL DAYLIGHT, where every other lamp
  // on the car is switched off. Two shots because they are two different
  // pictures made by the same pedal: by day the whole read is the bloom over
  // the lens (car-mesh.ts), because a spotlight competing with the sun changes
  // no pixel; at night the marker is already burning and what the pedal adds is
  // the flare on top of it plus the pool it throws on the road behind
  // (environment.ts). The acceptance test in both is that the frame BEFORE the
  // pedal and the frame after are obviously different cars-in-front.
  //
  // Both are driven to a fixed stage clock rather than to a HUD reading, for
  // the reason `shot-mud` is: one software-rendered frame advances the sim past
  // any number the readout can be waited for.
  for (const [name, params] of [
    ["shot-brakes", {}],
    ["shot-night-brakes", { tod: "night" }],
    // ...and from a rig standing far enough back to hold the ground BEHIND
    // the car, which is the only place the brake beam's own pool can land: the
    // default chase sits a car length off the bumper and looks along the road,
    // so the wash is a sliver at the bottom of that frame however it is aimed.
    ["shot-night-brakes-far", { tod: "night", camera: "far" }],
  ]) {
    await capture(
      name,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await atStageTime(page, 6);
        await page.keyboard.up("ArrowUp");
        // ...and the pedal stays DOWN through the shutter. `braking` is true
        // for exactly as long as the brakes bite, so a scene that lifts before
        // the frame is a scene of a car that has finished braking — which
        // looks identical to one that never started.
        await page.keyboard.down("ArrowDown");
        const off = await stageTime(page);
        await atStageTime(page, off + 0.6);
      },
      params,
    );
  }

  // THE THREE FACES, LIT. Every beam on a car comes off a lens the body
  // authored (car/lamps.ts), so the pool three cars lay on the same piece of
  // road is three different pools — and that is the whole acceptance test
  // here, in one place, from the rig that can see the ground ahead:
  //
  //   the QUAD face lays a splayed pair of low beams with a narrow driving
  //   pair spearing up the middle of them;
  //   the WIDE-CLUSTER face lays two broad pools and nothing else, and is the
  //   brightest car on the roster for it, because its bowls are the biggest;
  //   the POD car throws its bar — two long spots from the bonnet's corners —
  //   with its own slim face lamps filling in underneath.
  //
  // If two of these three ever come back looking alike, a face has been
  // restyled and its light has not followed it.
  for (const car of ["compact", "classic", "coupe"]) {
    await capture(
      `shot-night-beams-${car}`,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await atStageTime(page, 6);
      },
      { tod: "night", camera: "far", car },
    );
  }

  // THE THREE FACES, LIT. Every beam on a car comes off a lens the body
  // authored (car/lamps.ts), so the pool three cars lay on the same piece of
  // road is three different pools — and that is the whole acceptance test
  // here, in one place, from the rig that can see the ground ahead:
  //
  //   the QUAD face lays a splayed pair of low beams with a narrow driving
  //   pair spearing up the middle of them;
  //   the WIDE-CLUSTER face lays two broad pools and nothing else, and is the
  //   brightest car on the roster for it, because its bowls are the biggest;
  //   the POD car throws its bar — two long spots off the bonnet's corners —
  //   with its own slim face lamps filling in underneath.
  //
  // If two of these three ever come back looking alike, a face has been
  // restyled and its light has not followed it.
  for (const car of ["compact", "classic", "coupe"]) {
    await capture(
      `shot-night-beams-${car}`,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await atStageTime(page, 6);
      },
      { tod: "night", car },
    );
  }

  // THE CLOUD IN THE DARK, which is a different picture from either of the
  // two it is made of. Dust is not in the lit scene — a point sprite has no
  // normals for the sun or the spotlights to reach — so it takes the sky as a
  // flat ambient plus whatever the cars' own lamps put back on it
  // (dust-light.ts), and BOTH halves of that only exist here. The acceptance
  // test is three things at once: the tail lamps painting the near cloud RED
  // where the chase camera is looking straight through it, the headlights
  // throwing a warm cone into anything still hanging in front of the car, and
  // the cloud beyond either of them nearly gone — a night plume the player
  // can see the road through is a plume that is emitting its own light.
  //
  // Driven by the bot to the same stage clock as `shot-gravel-plume`, so the
  // two are one before-and-after of the same cloud under two skies rather
  // than two pictures of different moments.
  await capture(
    "shot-night-plume",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 14);
    },
    { tod: "night", bot: "1" },
  );

  // The lap clock: a circuit (R22) driven by the bot until it has crossed the
  // line once, so the shot has a lap in the book, a lap counter reading 2 of
  // 3, and both clocks running — which is the whole instrument and cannot be
  // seen on a sprint, where the lap time and the total time are one number.
  await capture(
    "shot-laps",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.waitForFunction("document.querySelectorAll('.hud-clock-mark').length > 0", null, {
        timeout: 180000,
      });
      await page.waitForTimeout(2500);
    },
    { shape: "circuit", length: "medium", seed: "3", bot: "1" },
  );
  await capture(
    "shot-laps-portrait",
    { width: 390, height: 844 },
    async (page) => {
      await racing(page);
      await page.waitForFunction("document.querySelectorAll('.hud-clock-mark').length > 0", null, {
        timeout: 180000,
      });
      await page.waitForTimeout(2500);
    },
    { shape: "circuit", length: "medium", seed: "3", bot: "1" },
  );
  // The results card, with the lap board on it. The run is STOOD at its
  // finish (`at=finish`, engine/game/place.ts): a step short of the line on
  // the last lap with the laps before it in the book, and the loop's first
  // step drives through the gate and fires the finish the way a driven one
  // fires. Nothing has to be driven to photograph a card any more.
  await capture(
    "shot-finish",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.waitForTimeout(400);
    },
    { shape: "circuit", length: "short", seed: "3", laps: "3", at: "finish" },
  );
  // …and the same card on a phone held up, where the head's ways on take a
  // row of their own and the summary stands over whatever sheet there is.
  await capture(
    "shot-finish-portrait",
    { width: 390, height: 844 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.waitForTimeout(400);
    },
    { shape: "circuit", length: "short", seed: "3", laps: "3", at: "finish" },
  );
  // THE TIME TRIAL'S RESULTS CARD, which is a different card from the one
  // above: no field, no points — the stage's high score board is the field,
  // and where the run landed on it is the whole verdict. The board is SEEDED
  // (the app reads it out of storage on the way up), because an empty one
  // photographs ten free places and says nothing about what a full board
  // looks like: the podium's medals, the cars, the boxes they were driven
  // with, and the row the run has just taken among them.
  const SEEDED_BOARD = `(() => {
  const rows = [
    { who: "NLM", time: 89.53, carId: "coupe", gearbox: "manual", difficulty: "hard" },
    { who: "AJK", time: 98.33, carId: "classic", gearbox: "manual", difficulty: "medium" },
    { who: "RTS", time: 99.05, carId: "compact", gearbox: "auto", difficulty: "medium" },
    { who: "IVO", time: 100.46, carId: "coupe", gearbox: "auto", difficulty: "easy" },
    { who: "PEK", time: 100.5, carId: "classic", gearbox: "manual", difficulty: "hard" },
    { who: "S", time: 101.34, carId: "compact", gearbox: "manual", difficulty: "medium" },
  ];
  const day = Date.UTC(2026, 7, 29) / 1;
  localStorage.setItem(
    "scandi-flick-scores:taiga-1",
    JSON.stringify(rows.map((r, i) => ({ ...r, at: day + i * 86400000 }))),
  );
  localStorage.setItem("scandi-flick-initials", "NLM");
})()`;
  const TRIAL_CARD = { mode: "timetrial", level: "taiga-1", at: "finish", time: "99.4" };
  for (const [name, viewport] of [
    ["shot-finish-trial", { width: 1280, height: 720 }],
    ["shot-finish-trial-portrait", { width: 390, height: 844 }],
    // A phone held SIDEWAYS is where this card has the least room and the most
    // to say: the board pages to fit rather than scrolling, and the ways off
    // the card have to stay above the fold.
    ["shot-finish-trial-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(
      name,
      viewport,
      async (page) => {
        await page.waitForSelector(".hud-finish", { timeout: 120000 });
        // The rows carry a picture of every car, and each one is built and shot
        // on an idle callback behind the card — so the shot waits for the roll
        // to land rather than photographing the boxes it leaves for them. How
        // MANY rows there are is the viewport's business (the board pages to
        // fit), so the wait is that every row on the page has landed, and that
        // there is a page at all: an `every` over nothing is true.
        await page.waitForFunction(
          `(() => {
          const rows = [...document.querySelectorAll('.rsheet-row:not(.is-free)')];
          return rows.length > 0 && rows.every((r) => r.querySelector('.rsheet-car img'));
        })()`,
          null,
          { timeout: 60000 },
        );
        await page.waitForTimeout(400);
        // THE ENTRY FIRST: a run that makes the board is asked for its three
        // letters, and they are typed into the row the time has just won.
        await page.screenshot({ path: join(outDir, `${name}-naming.png`) });
        console.log(`previews/${name}-naming.png`);
        // The offered name is the one seeded above, so the keyboard's own
        // return key is the whole entry — and what it settles into is the board
        // with this run standing on it under its name.
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
      },
      TRIAL_CARD,
      "load",
      { initScript: SEEDED_BOARD },
    );
  }
  // THE RETIREMENT: the run over short of the line, the car sitting where it
  // stopped with a dead engine, and the card saying so with its two ways out.
  await capture(
    "shot-retired",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.waitForTimeout(400);
    },
    { at: "retire", s: "400" },
  );

  await captureElement(
    "shot-clock",
    ".hud-topleft",
    async (page) => {
      await racing(page);
      await page.waitForFunction("document.querySelectorAll('.hud-clock-mark').length > 0", null, {
        timeout: 180000,
      });
      await page.waitForTimeout(2000);
    },
    { shape: "circuit", length: "medium", seed: "3", bot: "1" },
  );

  // THE JUMP CALL, at each of the three sizes the co-driver has words for.
  // A lip's size is stage geometry (`engine/game/jump.ts`), so each of these
  // is a KNOWN lip on a known seed rather than something to be driven to: the
  // run is PLACED a call's lead short of it (`at=racing&s=`, engine's
  // place.ts) and the strip is photographed on its own. Read them as a row —
  // the point of three words is that they are told apart at a glance, and
  // three separate frames are the only way to see whether the colour and the
  // drawn flight step together: the sign is the lip's own elevation, so a
  // bigger jump has to come back as more daylight between the arc and the
  // ground falling away under it, not merely as a different colour.
  //
  // The seeds are not decorative: re-roll the generator and these lips move,
  // so if a shot comes back with no call in it, re-list the stage's lips
  // (their sizes are `jumpSize` over `track.samples[i].jump`) and re-pick.
  for (const lip of [
    { name: "small", seed: "26", s: 796 },
    { name: "medium", seed: "7", s: 1178 },
    { name: "big", seed: "3", s: 2475 },
  ]) {
    await capture(
      `shot-pace-jump-${lip.name}`,
      { width: 1280, height: 720 },
      // Wait for the LIP'S OWN call rather than for any call at all: the
      // strip holds two, and a lip that follows a combination is behind two
      // corner calls until they are driven through.
      async (page) => {
        await page.waitForSelector(`.hud-pace-jump-${lip.name}`, { timeout: 240000 });
      },
      // Placed a few hundred metres short of the lip with the bot driving —
      // the run is stood where the drive would have left it (`at=racing&s=`,
      // engine's place.ts) instead of costing the whole stage up to here.
      { at: "racing", s: String(lip.s - 300), seed: lip.seed, length: "medium", bot: "1" },
    );
  }

  // R28 — the SPLIT, as the car goes through the first checkpoint: the segment
  // time, which board it was, and the gap to what the run is chasing. The bot
  // drives, because a board stands a corner or two into the stage and reaching
  // one is the whole point of the shot rather than something a scripted key
  // press can stage. Captured as the READING rather than the whole frame — it
  // times itself off the screen in a few seconds, and a full-frame screenshot
  // of a software-rendered stage takes long enough to miss it.
  await captureElement(
    "shot-checkpoint",
    ".hud-split",
    async (page) => {
      await racing(page);
      await page.waitForSelector(".hud-split", { timeout: 240000 });
    },
    { length: "short", bot: "1" },
  );

  // ...and the same map with a RACE on it, close up: `?mode=headsup` enters
  // the grid, so the route carries a numbered plate per crew still out there.
  // Waits for the field to have strung itself out rather than shooting the
  // grid, where fifteen plates stand on one point and the only thing the shot
  // could show is that the topmost is the leader's.
  await captureElement(
    "shot-instrument-field",
    ".hud-minimap-dock",
    async (page) => {
      await racing(page);
      await atStageTime(page, 25);
    },
    { length: "short", bot: "1", mode: "headsup" },
  );

  // The top bar's two big numbers together — the clock the run is against and
  // the place it stands in the field, which are sized to each other. Shot as
  // the whole strip left of the map, and in PORTRAIT, because that is where a
  // place the size of the total time has the least room to be wrong in.
  await captureElement(
    "shot-topbar-place",
    ".hud-top",
    async (page) => {
      await racing(page);
      await atStageTime(page, 25);
    },
    { length: "short", bot: "1", mode: "headsup" },
  );

  // ...and the same race in the frame it is actually driven in: the field on
  // the map, the place beside it, at a landscape viewport.
  await capture(
    "shot-headsup",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 25);
    },
    { length: "short", bot: "1", mode: "headsup" },
  );

  // THE SALUTE, and the run-out behind it (R23/R24/R25), on a short SPRINT —
  // a circuit's finish is its own start line and has no run-out to coast
  // down. The run is stood a step short of the gate at rally pace
  // (`at=finish`), so the car comes THROUGH the line on the first frames and
  // the shots wait for the results card, which goes up the instant it does.
  //
  // Two frames, because the finish is two moments. The first catches the
  // cannons going off over the car as it comes through the gate, with the
  // crowd banked either side of it; the second catches the end of the
  // roll-out, the camera still planted at the line and the car well down the
  // run-out road, which is the one thing a still can prove about R23.
  //
  // Both wait on the SPEEDO rather than a timer: headless rendering advances
  // the sim at a fraction of wall time, so a `waitForTimeout` after the flying
  // finish lands somewhere different on every machine.
  const FINISH_WAIT = 600000;
  await capture(
    "shot-salute",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await slowerThan(page, 105);
    },
    { at: "finish", length: "short", seed: "38" },
  );
  await capture(
    "shot-runout",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await slowerThan(page, 12);
    },
    { at: "finish", length: "short", seed: "38" },
  );

  // R29/R30 — THE CAMPAIGN'S RESULTS CARD, stood at rather than driven to:
  // `level=` enters the run on a campaign stage with the whole field on the
  // road, and `at=finish` stands it a step short of the line with every crew
  // placed at the same moment — the ones who have already made the line home,
  // the rest still out at their stagger. So the card comes up with the sheet
  // PROVISIONAL (the crews still out at the bottom marked OUT) and SPECTATE on
  // offer, which is the state of it a player actually sees, and the one no
  // scene could reach while reaching it meant driving the stage.
  //
  // HARD on purpose, for the same reason the driven campaign scene is: a card
  // that always says STAGE CLEAR photographs half the feature. `time=` pins
  // the placed run's own clock — quick, so that the field is still out there
  // and there is a run-out worth watching.
  await capture(
    "shot-campaign-card",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.waitForTimeout(600);
    },
    { level: "taiga-1", at: "finish", time: "75", difficulty: "hard" },
  );
  // R30 — THE RESULT SHEET, FINAL: the same card once the last car is home.
  // The run-out plays at race speed behind the card, so this waits for the
  // last OUT to clear rather than for a number of seconds, then walks to the
  // sheet's other page, which is where the pictures of the cars nobody was
  // racing near are.
  await capture(
    "shot-campaign-sheet",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.waitForFunction(
        "document.querySelector('.rsheet-row') && !document.querySelector('.rsheet-row.is-out')",
        null,
        { timeout: FINISH_WAIT },
      );
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(outDir, "shot-campaign-sheet-page1.png") });
      console.log("previews/shot-campaign-sheet-page1.png");
      const flip = page.getByRole("button", { name: "Next page" });
      if (await flip.count()) {
        await flip.click();
        await page.waitForTimeout(300);
      }
    },
    { level: "taiga-1", at: "finish", time: "75", difficulty: "hard" },
  );
  // R30's SPECTATOR MODE: the card's SPECTATE pressed while the road still has
  // somebody on it, and the driving layout back up over the crew under the
  // camera with the banner naming them. The placed time is QUICK — a hard
  // field is home in under a minute of its own clock, and the crew in front
  // left only one interval before the player, so a placed time much past
  // forty seconds is a card with nobody left to watch.
  await capture(
    "shot-spectate",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.getByRole("button", { name: "SPECTATE" }).click();
      await page.waitForSelector(".hud-spectate", { timeout: 120000 });
      await page.waitForTimeout(1500);
    },
    { level: "taiga-1", at: "finish", time: "30", difficulty: "hard" },
  );
  // The same mode held upright, which is a different placement and so a
  // different picture: the banner cannot take the top edge here — the clock has
  // the left of it and the minimap dock the right — so it drops to the row the
  // condition schematic stands on. What this shot is for is the check that it
  // clears BOTH of them and still leaves the road under it open.
  await capture(
    "shot-spectate-portrait",
    { width: 390, height: 844 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.getByRole("button", { name: "SPECTATE" }).click();
      await page.waitForSelector(".hud-spectate", { timeout: 120000 });
      await page.waitForTimeout(1500);
    },
    { level: "taiga-1", at: "finish", time: "30", difficulty: "hard" },
  );
  // …and HEADS UP's own sheet: the same card with the board taken off, on a
  // grid the whole field left together.
  await capture(
    "shot-headsup-card",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-finish", { timeout: 120000 });
      await page.waitForTimeout(600);
    },
    { mode: "headsup", at: "finish", length: "short", seed: "38" },
  );

  // THE DEVELOPER TOOLS, which only exist to be photographed: the debug
  // overlay is a contract that a screenshot of the game carries enough to
  // stand in the same place again, and the only way to know it still does is
  // to take one and read it. The bot drives so the car box has something in
  // it other than a parked car.
  await capture(
    "shot-debug",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 12);
    },
    { debug: "1", bot: "1" },
  );
  // The same frame with ALT held: the game's chrome comes off, the overlay
  // does NOT. A shot where both vanish is the bug this scene catches.
  await capture(
    "shot-debug-hud-hidden",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 12);
      await page.keyboard.down("Alt");
      await page.waitForTimeout(300);
    },
    { debug: "1", bot: "1" },
  );
  // God mode, parked off the road above a corner — the shot a report comes in
  // as, and the one `make debug-shot` has to be able to reproduce from the
  // REPRO line printed along the bottom of it.
  await capture(
    "shot-debug-god",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".debug-repro", { timeout: 120000 });
      await page.waitForTimeout(3000);
    },
    {
      debug: "1",
      god: "1",
      gx: "-30",
      gy: "25",
      gz: "120",
      gyaw: "2.6",
      gpitch: "-0.35",
    },
  );
  // The same flight with the boxes OFF: the picture whole, and COPY DEBUG INFO
  // in the corner the overlay's repro strip would have had. That button is the
  // only way the numbers behind this frame can be got at from here, so a scene
  // that photographs it is what catches it going missing.
  await capture(
    "shot-debug-god-bare",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector("[data-debug-copy]", { timeout: 120000 });
      await page.waitForTimeout(3000);
    },
    {
      god: "1",
      gx: "-30",
      gy: "25",
      gz: "120",
      gyaw: "2.6",
      gpitch: "-0.35",
    },
  );

  // R29 — THE CAMPAIGN AND ITS FIELD, which is the one part of the game a
  // `?start=1` link cannot reach: a stage entered from the menu is the only
  // one with fourteen rivals on the road, and everything the field puts on
  // screen — the position board, the split against the leader, the card that
  // says the podium was missed — exists only there. So this scene walks in
  // the way a player does, and the bot drives it.
  //
  // HARD on purpose. The reference bot is quick enough to win EASY outright,
  // and a results card that always says STAGE CLEAR photographs half the
  // feature.
  if (only.length === 0 || only.some((f) => "shot-campaign shot-start".includes(f))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
    // `splash=0` rather than a press: the attract card only takes one once the
    // world has landed, and a scripted click that arrives a frame early is a
    // scene that fails on a fast machine and passes on a slow one.
    await page.goto(`${url}?bot=1&splash=0`, { waitUntil: "load" });
    await page.waitForSelector("canvas.game-canvas");
    await stageGrid(page);
    await page.getByText("HARD", { exact: true }).first().click();
    await page.screenshot({ path: join(outDir, "shot-campaign-stages.png") });
    console.log("previews/shot-campaign-stages.png");
    // The first OPEN stage on the page, by its box rather than by its name:
    // the campaign's levels are re-picked whenever the generator moves and a
    // name pinned here goes stale silently — this scene sat out a 30 s click
    // timeout on a stage that had been renamed, and took the rest of the run
    // down with it. Only the first is guaranteed unlocked on a fresh profile.
    await page.locator(".menu-level-open").first().click();
    // A stage press opens the pre-race card, not the stage: the car and the
    // gearbox are chosen there, and START is what begins the run.
    await page.getByRole("button", { name: "START" }).click();
    // THE ESTABLISHING SHOT, which only exists here for the same reason the
    // position board does: it is the crew in front LEAVING, and there is only
    // a crew in front in a campaign field. Three moments, because what has to
    // be judged is a MOVE rather than a frame — the camera comes round the
    // start control from ahead of the car to behind it while car 14 pulls
    // away, and hands over to the camera the stage will be driven from.
    //
    // The caption is the cursor into it: it is on screen for exactly the shot
    // and nothing else, so the ends are waited for rather than timed. The
    // middle frame is the one honest timeout in the scene, and it only has to
    // land somewhere in the sweep.
    //
    // It is also the one deterministic look at a NAME TAG (name-tag.ts): car
    // 14 is stood on the line a few metres away wearing its plate. Mid-stage
    // there is no honest scene for one — the stagger keeps the field hundreds
    // of metres apart, so whether anybody is close enough and in sight at a
    // given clock reading is a different answer on every machine.
    await page.waitForSelector(".hud-start-shot", { timeout: FINISH_WAIT });
    await page.screenshot({ path: join(outDir, "shot-start-open.png") });
    console.log("previews/shot-start-open.png");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(outDir, "shot-start-sweep.png") });
    console.log("previews/shot-start-sweep.png");
    // The lights are up: the blend is finished and this IS the driving
    // camera's own framing, which is what makes the hand-over seamless.
    await page.waitForSelector(".hud-lights", { timeout: FINISH_WAIT });
    await page.screenshot({ path: join(outDir, "shot-start-land.png") });
    console.log("previews/shot-start-land.png");
    // The first split board: the one moment a staggered rally knows where
    // anybody is, so the position and the gap to the leader arrive together.
    await page.waitForSelector(".hud-split", { timeout: FINISH_WAIT });
    await page.screenshot({ path: join(outDir, "shot-campaign-split.png") });
    console.log("previews/shot-campaign-split.png");
    await page.waitForSelector(".hud-finish", { timeout: FINISH_WAIT });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, "shot-campaign-result.png") });
    console.log("previews/shot-campaign-result.png");
    // R30 — THE RESULT SHEET, FINAL: fifteen crews, their times, what the
    // stage paid them and what they have for the season, on the card itself.
    // It is provisional until the last car is home — the crews still out sit
    // at the bottom marked OUT — so this waits for the last OUT to clear
    // rather than for a number of seconds, then walks to the sheet's other
    // page, which is where the pictures of the cars nobody was racing near
    // are.
    await page.waitForFunction(
      "document.querySelector('.rsheet-row') && !document.querySelector('.rsheet-row.is-out')",
      null,
      { timeout: FINISH_WAIT },
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, "shot-campaign-points.png") });
    console.log("previews/shot-campaign-points.png");
    const flip = page.getByRole("button", { name: "Next page" });
    if (await flip.count()) {
      await flip.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(outDir, "shot-campaign-page2.png") });
      console.log("previews/shot-campaign-page2.png");
    }
    await page.close();
  }
}
