// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHOWCASE SET: the frames that go in the README and the store
// listings. Same harness, same stages — the difference is that these are
// chosen to SELL the game rather than to check it, so they are staged with
// the field in frame and the light at its best.

export async function showcaseShots(shot) {
  const { capture } = shot;
  // ── THE SHOWCASE SET ────────────────────────────────────────────────────
  //
  // The five above the fold. Everything else in this file audits a surface;
  // these are the pictures the game is SHOWN with — a README, a post, the head
  // of a store listing — so the subject is the WORLD and the racing in it
  // rather than a panel being checked for clipping. Three rules they all obey
  // and the diagnostic scenes do not:
  //
  //   THE FIELD IS IN THE FRAME. A rally frame of one car alone on an empty
  //   road sells a screensaver. Every scene here that can have other cars in
  //   it enters a race to get them, and waits for the moment they are close.
  //
  //   THEY ARE SHOT WIDE. `SHOWCASE` below, because these are the only frames
  //   in the file that get looked at full size by somebody who is not
  //   debugging — and no wider, because every one of these scenes has to DRIVE
  //   to its moment under software rendering, and the sim advances at a
  //   fraction of wall time in inverse proportion to how many pixels the
  //   renderer is filling. Wider than this and the scenes with a field in
  //   them run out of patience before the car has reached its moment.
  //
  //   THE MOMENT IS FOUND, NOT COUNTED. Under software rendering a wall-clock
  //   wait lands somewhere different on every machine, so each one waits on
  //   the run's own clock and then on the thing it is a picture of — a slide,
  //   a corner, a bunched grid.

  /** The raster the whole set is shot at, and how long a showcase scene may
   * take to DRIVE to its moment. The patience is not padding: these are the
   * biggest frames in the file and several of them have a full field in them,
   * so the sim advances at a small fraction of wall time and the same scene
   * has taken 40 s and 200 s on the same machine an hour apart. Every wait
   * here is on the run's own clock, so a generous ceiling costs nothing on the
   * run that is quick and is the difference between a picture and a stack
   * trace on the run that is not. */
  const SHOWCASE = { width: 1600, height: 900 };
  const SHOWCASE_PATIENCE = 600000;

  /** A CLEAN FRAME that can still be steered to — the two halves of the same
   * problem, solved by two query keys.
   *
   * `?hud=0` is the switch a picture of the WORLD wants: the instrument panel,
   * the rear-view glass and the name plates floating over the other crews all
   * go down together. Two of those could not have been removed any other way.
   * The mirror is a second RENDER of the world rather than an element over it,
   * and the plates are drawn IN the world (name-tag.ts), so nothing laid on
   * the page afterwards touches either.
   *
   * What `?hud=0` also takes away is every cursor this file steers by — the
   * race clock, the pace call, the drift flag are all read off the panel it
   * just switched off. `?debug=1` puts them back somewhere else: the developer
   * overlay carries the run's own numbers as DOM rows keyed by `data-k`,
   * which debug-hud.tsx states in as many words is so a headless pass can read
   * one. Unlike the HUD it is not part of the picture, so it comes off at the
   * shutter with a style rule (`clean`) instead of from the URL. */
  const CLEAN = { hud: "0", debug: "1" };

  /** One value off the developer overlay, as page-side source. Written as a
   * string like every other page-side read here, because this file lints as
   * Node and `document` does not exist in it. */
  const debugRow = (key) =>
    `document.querySelector('.debug-row[data-k="${key}"] .debug-row-v')?.textContent ?? ""`;

  /** The run's own clock off the overlay's `run` row, seconds — 0 before it
   * starts. Wanted as a VALUE by any scene that stands the run partway down
   * the stage (`?at=racing&s=`), because that writes a clock from the road it
   * skipped: a run put down a kilometre in opens at nearly a minute, and a
   * scene asking to reach 14 s of it is asking for a moment already gone. */
  async function cleanTime(page) {
    return (await page.evaluate(`Number(/t ([0-9.]+) s/.exec(${debugRow("run")})?.[1] ?? 0)`)) ?? 0;
  }

  /** Wait until the car is ON THE ROAD — the CAR box's own `track` row, which
   * carries ` · OFF` for exactly as long as the engine considers it off. A wide
   * shot of the country is spoiled by a car standing in a field, and a bot on
   * an alpine stage spends real seconds out there.
   *
   * Read from that row rather than from a distance, because the distance the
   * overlay quotes is the PLACE box's, and the place box reports where the
   * CAMERA is standing — it says so in as many words. On a TV tripod that is a
   * fixed eight metres off the centreline forever. */
  async function atOnRoad(page) {
    await page.waitForFunction(`/ · OFF/.test(${debugRow("track")}) === false`, null, {
      timeout: SHOWCASE_PATIENCE,
    });
  }

  /** The run's own clock off the overlay's `run` row — `atStageTime`'s answer
   * for a scene with no HUD to read it from. */
  async function atCleanTime(page, seconds) {
    await page.waitForFunction(
      `Number(/t ([0-9.]+) s/.exec(${debugRow("run")})?.[1] ?? 0) >= ${seconds}`,
      null,
      { timeout: SHOWCASE_PATIENCE },
    );
  }

  /** Wait until the car is SIDEWAYS, on the ground and on the road, all on the
   * one frame. Degrees of slip.
   *
   * One predicate rather than three waits in a row, and that is the whole point
   * of it: each of the three comes and goes on its own, so waiting for them in
   * sequence returns on a frame where the last one is true and the first has
   * already gone. Asked separately, a scene that wanted a drift came back with
   * four cars in mid-air over a crest — every one of them slipping, none of
   * them driving.
   *
   * Slip is the drift cursor rather than the HUD's own flag: that lights at
   * `TUNING.drift.enterSlip`, which is about 10°, and a picture wants nearer
   * twice that. */
  async function atDrifting(page, degrees) {
    await page.waitForFunction(
      `Math.abs(Number(/^(-?[0-9.]+)/.exec(${debugRow("slip")})?.[1] ?? 0)) >= ${degrees}` +
        ` && /AIRBORNE/.test(${debugRow("drive")}) === false` +
        ` && / · OFF/.test(${debugRow("track")}) === false`,
      null,
      { timeout: SHOWCASE_PATIENCE },
    );
  }

  /** PROVOKE THE SLIDE, then wait for it. Returns once the car is `degrees`
   * sideways with all four wheels down and still on the road.
   *
   * This scene drives the car by hand, and it is worth writing down why, because
   * the obvious thing — hand the bot a stage and wait for it to drift — was
   * tried first and does not work. Measured on the desert seed this set uses:
   * the bot's slip peaks at 9.8° over three hundred metres of open sand, which
   * is UNDER the angle the game itself calls a drift. There is no threshold that
   * would have caught it, and lowering one twice is how two ten-minute runs
   * ended in a stack trace. A bot driving a fast, wide road tidily is the bot
   * working; it is simply not a photograph.
   *
   * The other half of the reason is time. Under software rendering the sim
   * advances about a second per eighteen of wall clock, so DRIVING to a corner
   * that might produce a slide is minutes per attempt. `?at=racing&s=` stands
   * the run where the shot wants it (engine's place.ts) and the clock it writes
   * from the skipped road is why every wait here is an offset off `cleanTime`.
   *
   * So: throttle, a stab of handbrake to unstick the rear, and lock held into
   * the turn. Held any longer than this the car leaves the road — at full lock
   * it reaches 45° and ends up in a field, which the predicate correctly
   * refuses — so the shutter wants the early part of the slide, while the angle
   * is up and the car is still on the road. */
  async function stageDrift(page, degrees) {
    const placed = await cleanTime(page);
    await atCleanTime(page, placed + 1.5);
    await page.keyboard.down("ArrowUp");
    await atCleanTime(page, placed + 3);
    await page.keyboard.down("ArrowRight");
    await page.keyboard.down("Space");
    await atCleanTime(page, placed + 3.6);
    await page.keyboard.up("Space");
    await atDrifting(page, degrees);
  }

  /** Take the last two layers off for the shutter: whatever the HUD still
   * draws with the panel switched off (the pause chip, the lights, a call to
   * get a lost car home) and the developer overlay this scene steered by. */
  async function clean(page) {
    await page.addStyleTag({
      content: ".hud, .debug-hud { display: none !important; }",
    });
  }

  // 1 — THE START, from the side of the road, with no HUD and no mirror over
  // it. A mass start is the only moment in the game where fifteen cars are
  // close enough to touch, and it lasts about four seconds: the grid rolls
  // through the gate as one bunch, everybody arrives at the first corner at
  // once, and what comes out the far side is a queue. This is shot inside that
  // window.
  //
  // On the TV cam, and the two facts that make it work belong to the gallery
  // and to the grid. The gallery opens with a stand a little way past the start
  // line — the gate keeps its own furniture clear and the run-up bends nowhere,
  // so the first camera is the gap filler's (camera-tv.ts).
  //
  // The grid puts the PLAYER on the back row and the TV cam aims at the player,
  // which decides the SECOND: the cars in this frame are the ones still between
  // the player and the lens, so the shot empties as the run goes on. The
  // leaders reach that first stand well before the player does and are past it
  // — behind the camera — by the time it is aiming anywhere near them. Four
  // seconds off the line is inside the window where the whole field is still up
  // the road, and on the long lens (`TV.frame`) that is a tight frame of cars
  // fighting for the same two ruts rather than a wide one of a valley. From the
  // boom the cars behind are behind the lens; from overhead they are a diagram.
  await capture(
    "shot-showcase-start",
    SHOWCASE,
    async (page) => {
      // `racing` reads the HUD's clock, which this scene has switched off, so
      // the whole wait is on the overlay instead: a `run` row quoting a race
      // time at all is a run that is ticking.
      await atCleanTime(page, 4);
      await clean(page);
    },
    {
      ...CLEAN,
      mode: "headsup",
      camera: "tv",
      // ...and HELD on the tripods. The TV mode is a broadcast in play — the
      // chase boom down the road, cutting trackside for a corner — and a
      // still staged at a fixed point on a fixed seed has to come off the
      // same lens every time it is taken (camera-tv-cut.ts).
      tvstand: "1",
      bot: "1",
      length: "short",
      seed: "38",
      hour: "11",
      // Every showcase frame taken from a TRIPOD asks to see. The stored fog
      // is tuned for a driver's eye a metre and a half off the road looking at
      // the next corner; a camera standing still while a field arrives out of
      // the distance is looking through all of it, and on the default the
      // grid comes through the start gate as a grey smudge.
      drawdistance: "far",
    },
  );

  // 2 — ROAM, which is the generator's own shop window: a seed on the left as
  // an island of real country with the route drawn over it, and on the right
  // every dial that built it. The page is the argument that the stages are
  // made rather than drawn, so it is shot at a seed with RELIEF in it — an
  // alpine winter, rugged, where the land does something the eye can read at
  // map size. The long wall-clock wait after the page arrives is the one in
  // this set that cannot be anything else: the player's Roam page carries no
  // readiness flag (the `data-ready` one belongs to the developer's full-screen
  // viewer), and the ground streams in a few tiles a frame, so a map shot on
  // arrival is a picture of half an island.
  await capture(
    "shot-showcase-roam",
    SHOWCASE,
    async (page) => {
      await page.waitForSelector(".roam", { timeout: 120000 });
      await page.waitForTimeout(16000);
    },
    {
      menu: "1",
      roam: "1",
      seed: "20704",
      biome: "alpine",
      // SPRING rather than winter. An alpine winter puts the sun low enough at
      // midday that the sky goes pink and the whole country reads as dusk — a
      // handsome frame, and not the one this scene is for, which is the Alps in
      // daylight. The snow that matters is on the peaks either way.
      season: "spring",
      length: "short",
      // The generator's own dial names (NUMERIC_KNOBS in mapgen/rules.ts), not
      // the words the page prints beside them: HILLS is `elevation` and TERRAIN
      // is `steepness`, and a link that spells them the way the row does sets
      // nothing at all and photographs the defaults.
      elevation: "1",
      steepness: "0.85",
      peaks: "1",
      // High COUNTRY, low ROAD. The peaks dial is what puts mountains in the
      // frame; the altitude dial is where the stage itself sits, and wound up
      // it puts the road above the treeline, where a winter stage is grey
      // scree under grey sky and the only colour left is the marker posts.
      // Down at the treeline the same mountains are still there and the road
      // has snow, rock and trees in it.
      altitude: "0.25",
    },
  );

  // 3 — THE DESERT, in the four-wheel-drive car, sideways past somebody. Three
  // things have to be in this frame at once and only one of them can be asked
  // for directly, so it is staged in that order: the race puts a rival on the
  // road, the run's clock puts the field far enough in to be racing rather
  // than launching, and the slip angle waits for the car to be properly
  // crossed up rather than merely loose. Sand is the surface that shows a
  // slide best — the plume is the colour of the ground and it hangs.
  await capture(
    "shot-showcase-desert",
    SHOWCASE,
    async (page) => {
      await stageDrift(page, 20);
      await clean(page);
    },
    {
      ...CLEAN,
      // Roam with a handful of rivals rather than a fifteen-car grid. A mass
      // start puts six cars inside ten metres of the lens and the frame has no
      // subject — everything is a car and none of them is THE car. Four
      // opponents is enough that somebody is being driven past and few enough
      // that it reads. (`?rivals=` is Roam's own slider; a heads-up grid takes
      // its size from the race card instead.)
      rivals: "4",
      // Stood deep in the stage and DRIVEN BY HAND (`stageDrift`), for reasons
      // measured rather than guessed — see that helper.
      at: "racing",
      s: "1200",
      biome: "desert",
      car: "coupe",
      // The LONG boom rather than the one the game is driven from: at 22° of
      // slip the chase rig is close enough that the car's own flank fills the
      // bottom of the frame and goes off the edge of it, and what a shot of a
      // slide has to show is the whole car at an angle to the road it is on.
      camera: "far",
      seed: "27",
    },
  );

  // 4 — THE ALPS: the one country where the shot is the COUNTRY, so the car is
  // small in it and the frame is mostly mountain, on the longest lens on the
  // boom. Three things this scene needs that no other one does:
  //
  //   IT IS STOOD IN THE MOUNTAINS RATHER THAN DRIVEN TO THEM. `?at=racing&s=`
  //   puts the run down a kilometre and a half in (engine's place.ts) instead
  //   of paying for the whole climb under software rendering. That writes the
  //   race clock from the road it skipped, which is why the wait below is an
  //   OFFSET off `cleanTime` and not an absolute — a placed run opens at
  //   nearly a minute and every fixed target is already behind it.
  //
  //   IT ASKS TO SEE. The fog is tuned for a driver's eye a metre and a half
  //   off the road; on the stored default an alpine skyline is fog colour, and
  //   a picture of the Alps with no mountains in it is a picture of a field.
  //   `?drawdistance=far` is the setting a player with a good machine has.
  //
  //   IT WAITS FOR THE CAR TO BE ON THE ROAD. `atOpenRoad` is what every other
  //   country would use for a wide shot — no call in the co-driver's window
  //   means no corner inside its lead — but the Alps never clear that call:
  //   the stage is hairpin into hairpin for its whole length, so a scene that
  //   waited for open road here would wait forever. What it can ask for
  //   instead is that the car is not in a field when the shutter goes.
  await capture(
    "shot-showcase-alpine",
    SHOWCASE,
    async (page) => {
      const placed = await cleanTime(page);
      await atCleanTime(page, placed + 6);
      await atOnRoad(page);
      await clean(page);
    },
    {
      ...CLEAN,
      biome: "alpine",
      // SPRING rather than winter. An alpine winter puts the sun low enough at
      // midday that the sky goes pink and the whole country reads as dusk — a
      // handsome frame, and not the one this scene is for, which is the Alps in
      // daylight. The snow that matters is on the peaks either way.
      season: "spring",
      camera: "far",
      bot: "1",
      seed: "20704",
      length: "medium",
      at: "racing",
      s: "1500",
      hour: "13",
      weather: "clear",
      drawdistance: "far",
      // The same dials the Roam shot names, for the same reason: a country
      // asked for by name still arrives on the default relief.
      elevation: "1",
      steepness: "0.85",
      peaks: "1",
      // High COUNTRY, low ROAD. The peaks dial is what puts mountains in the
      // frame; the altitude dial is where the stage itself sits, and wound up
      // it puts the road above the treeline, where a winter stage is grey
      // scree under grey sky and the only colour left is the marker posts.
      // Down at the treeline the same mountains are still there and the road
      // has snow, rock and trees in it.
      altitude: "0.25",
    },
  );

  // 5 — THE TV CAM (camera-tv.ts), which is the shot the camera was built for:
  // a tripod on the OUTSIDE of a corner, just past where the bend releases,
  // and a car coming out of it sideways and running wide onto the very edge
  // the lens is standing on — arriving already drifting, with the rooster tail
  // off the outside rear thrown at the glass. Nothing is pressed here: the
  // director chose where to stand before the run started, the bot drives the
  // corner, and the shutter only waits for a car that is sideways, on the
  // ground and on the road at once. Shot with rivals on the road, so the
  // gallery has more than one car coming through it.
  await capture(
    "shot-showcase-tvcam",
    SHOWCASE,
    async (page) => {
      // No drift predicate here, and that is the measured answer rather than a
      // surrender. On this taiga stretch the bot's slip peaks at 7°, and a
      // staged slide is worse than useless: the road is narrower than the
      // desert's, so the same provocation that works there has the car off the
      // road before the shutter starts watching, and — with the lock still on
      // and the throttle pinned — driving circles in a field for the rest of
      // the run. Every angle worth photographing on this stage happens while
      // the car is somewhere the predicate rightly refuses.
      //
      // Which is fine, because the SUBJECT of this frame is the camera. A
      // trackside tripod watching a car come through a corner is the picture;
      // whether that car is fifteen degrees sideways or five is the desert
      // shot's business. So the bot drives, the run is stood near a corner,
      // and the shutter asks only that the car is on the road when it fires.
      const placed = await cleanTime(page);
      await atCleanTime(page, placed + 4);
      await atOnRoad(page);
      await clean(page);
    },
    {
      ...CLEAN,
      rivals: "4",
      camera: "tv",
      tvstand: "1",
      // Stood partway down the stage rather than driven there: this is the only
      // frame in the set paying for the lens pass on top of a software-rendered
      // one, so it is the slowest scene here and the least able to afford the
      // drive.
      at: "racing",
      s: "900",
      bot: "1",
      seed: "38",
      length: "short",
      hour: "11",
      drawdistance: "far",
    },
  );
}
