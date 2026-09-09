// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVING SET: the grid, the launch, the speed, the country off the
// road, the air, the crashes, and every camera the player can drive from.
// Each scene is one page driven to a moment and photographed there; the
// harness that opens the page and waits for the moment is
// `shot-harness.mjs`.

import { RICH_PICTURE } from "./shot-harness.mjs";

export async function drivingShots(shot) {
  const { capture, racing, atStageTime, onThePower, stageTime, atOpenRoad, atNextCall, atLamps } =
    shot;
  await capture("shot-grid", { width: 1280, height: 720 }, async (page) => {
    await page.waitForTimeout(800);
  });
  await capture("shot-grid-portrait", { width: 390, height: 844 }, async (page) => {
    await page.waitForTimeout(800);
  });

  // Revving on the grid — the one thing there is to do while the lights fill.
  // A blipped engine against a car that cannot move turns none of its fuel
  // into road speed, so the acceptance test is the PIPE: a black cloud
  // building behind a stationary car, thicker than the same car makes at
  // pace. Throttle down from the first lamp and held through the shutter.
  await capture("shot-grid-revving", { width: 1280, height: 720 }, async (page) => {
    await atLamps(page, 1);
    await page.keyboard.down("ArrowUp");
    await atLamps(page, 3);
  });

  // THE WHOLE GRID REVVING, which is the shot above with the rest of the field
  // in it: `?mode=headsup` stands the other crews on the apron in front of the
  // player, and every one of them spends the countdown blipping its own
  // throttle (`GRID` in the engine's bot). The acceptance test is that the
  // line is not one car making smoke and a row of parked models — every pipe
  // working, and working by DIFFERENT amounts in the one frame, because the
  // crews are on their own beats and the ones with a temper are harder at it.
  //
  // Shot at the second lamp rather than the last, and from over the field
  // rather than from behind it. Both are about what a STILL can carry: the
  // last second is the held note every crew leaves on, where the pipes are
  // steady and the picture cannot tell a pattern from a constant — and from
  // the chase camera a car's own bodywork stands between the lens and its
  // tailpipe, so the only exhaust in frame is the player's. The player's
  // throttle is down from the first lamp so their own pipe is there to judge
  // the rest against.
  await capture(
    "shot-grid-field-revving",
    { width: 1280, height: 720 },
    async (page) => {
      await atLamps(page, 1);
      await page.keyboard.down("ArrowUp");
      await atLamps(page, 2);
    },
    { mode: "headsup", camera: "heli" },
  );

  // THE SAME GRID, COLD AND WARM — the pair, because an exhaust is a WINTER
  // effect and a single frame of one cannot say so. What a pipe puts out is
  // mostly water, invisible until the air is cold enough to condense it
  // (pwa/src/game/exhaust.ts), so the acceptance test is the DIFFERENCE
  // between these two files and not either one of them:
  //
  //   COLD — a pale plume standing off every pipe on the line, thickest here
  //   of anywhere in the game: the cars are stationary, their pipes are still
  //   cold steel from the manifold back, and the whole field is blipping. If
  //   this frame is a row of thin grey wisps, `condense` is wrong.
  //
  //   WARM — the same seed, the same lamp, the same throttles, and very nearly
  //   nothing: a dark haze off the crews hardest on the pedal and clean air
  //   behind the rest. If this frame has a plume in it, the effect has stopped
  //   being about the weather.
  //
  // Shot from over the field rather than from behind it, because a chase
  // camera looks along its own car's roofline and a tailpipe is under the
  // bumper at the bottom of the frame — from the seat your own exhaust is
  // something you catch in the mirror, and every other car's is what the
  // effect is actually for.
  //
  // The shutter is on the RUN's clock a beat after the green rather than on a
  // lamp, and that is the only cursor the pair can share. A lamp resolves and
  // the shutter fires behind it, so under software rendering one of the two
  // lands on the line and the other half a second down the road — two frames
  // of different moments, which is the one thing a comparison may not be. A
  // beat after the green is also the best exhaust in the game: every pipe on
  // the field cold, and every throttle buried. The player's own is down from
  // the first lamp, so there is a near pipe to judge the far ones against.
  for (const scene of [
    { name: "cold", params: { season: "winter", temp: "-12" } },
    { name: "warm", params: { season: "summer", temp: "26" } },
  ]) {
    await capture(
      `shot-exhaust-${scene.name}`,
      { width: 1280, height: 720 },
      async (page) => {
        await atLamps(page, 1);
        await page.keyboard.down("ArrowUp");
        await atStageTime(page, 0.5);
      },
      { mode: "headsup", camera: "heli", ...scene.params },
      "load",
      { initScript: RICH_PICTURE },
    );
  }

  // ...and the other half of the claim: the PIPE ON A CAR THAT IS MOVING. The
  // plume is left standing on the road rather than towed, so a cold stage
  // keeps a line of it down the road behind the car — and the acceptance test
  // is that it is a TRAIL and not a ball, which is the difference between a
  // puff that lives long enough to be left behind and one that dies at the
  // bumper.
  //
  // Driven by the bot, and held until the car is provably ACCELERATING. Open
  // road is not enough on its own: the bot can be off the throttle with
  // nothing called — settling the car, or already braking for the corner the
  // call is about to name — and a car off the throttle has no exhaust to
  // photograph by design, so a scene that caught one would say nothing either
  // way. From over the car for the reason the grid pair is: the road behind it
  // is where the plume is, and from any rig behind the car that road is off
  // the bottom of the frame.
  await capture(
    "shot-exhaust-cold-pace",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 12);
      await atOpenRoad(page);
      await onThePower(page);
    },
    { season: "winter", temp: "-12", bot: "1", camera: "heli" },
  );

  await capture(
    "probe-grid-heli",
    { width: 1280, height: 720 },
    async (page) => {
      await atLamps(page, 1);
      await page.keyboard.down("ArrowUp");
      await atLamps(page, 3);
    },
    { mode: "headsup", camera: "heli" },
  );
  await capture(
    "probe-grid-top",
    { width: 1280, height: 720 },
    async (page) => {
      await atLamps(page, 1);
      await page.keyboard.down("ArrowUp");
      await atLamps(page, 3);
    },
    { mode: "headsup", camera: "far" },
  );

  // Off the line, THE WRONG WAY: the throttle goes down on the first lamp, so
  // the engine is against the limiter when the clutch comes out and the tyres
  // are lit rather than gripping. The driven wheels are spinning under a car
  // that has barely moved, so the acceptance test is a plume off BOTH rear
  // wheels at a road speed where the rolling kickup throws nothing at all —
  // and that it has thinned out by the time the car is up and running.
  await capture("shot-launch-dust", { width: 1280, height: 720 }, async (page) => {
    await atLamps(page, 1);
    await page.keyboard.down("ArrowUp");
    // The first frame the car has MOVED on. Under software rendering one
    // frame carries a good fraction of a second of sim, so any later cursor —
    // a stage time, a chosen speed — lands past the moment: a 0.35 s wait
    // came out at 0.81 s and 32 km/h on this machine, with the launch already
    // half handed over to the rolling kickup.
    await page.waitForFunction(
      "Number.parseInt(document.querySelector('.hud-speed-num')?.textContent ?? '0', 10) > 0",
      null,
      { timeout: 180000 },
    );
  });

  // ...and the SAME launch made properly: the pedal stays up through the whole
  // countdown and goes down on the green. This is the pair that has to be
  // looked at together, because the rule the start line now runs on is only
  // legible as a difference. The acceptance test is the CLOUD: this one is
  // visibly smaller than the shot above at the same road speed, because the
  // tyres are driving the car instead of digging under it. (Only the cloud —
  // the green is found by polling the HUD clock, which under software
  // rendering can land a good fraction of a second late, so the metres this
  // launch is worth are the start tests' business, not the shutter's.)
  await capture("shot-launch-clean", { width: 1280, height: 720 }, async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(
      "Number.parseInt(document.querySelector('.hud-speed-num')?.textContent ?? '0', 10) > 0",
      null,
      { timeout: 180000 },
    );
  });

  // Flat out down the opening straight.
  await capture("shot-speed", { width: 1280, height: 720 }, async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(5000);
  });

  // The drift: no flick, no handbrake — just a committed turn at pace, which
  // is the whole entry now. Held on the power so the slide is at its angle.
  //
  // The bot drives the opening out to a corner with room in it, the same way
  // the tarmac scenes do, and the turn goes the way the co-driver says the
  // road goes. Driven blind off the grid instead, the shot is a picture of
  // the first corner's scenery — and the waits are on the RUN's clock, never
  // wall time: under software rendering a fixed `waitForTimeout` catches the
  // car a fraction of a second in, still gripped and still in second gear.
  await capture(
    "shot-drift",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 10);
      await atOpenRoad(page);
      const turn = await atNextCall(page);
      const entry = await stageTime(page);
      await page.keyboard.down("ArrowUp");
      await page.keyboard.down(turn);
      // Long enough for the slide to reach the angle the lock is asking for:
      // the angle builds with commitment rather than arriving with the input.
      await atStageTime(page, entry + 0.7);
    },
    { bot: "1" },
  );

  // The same slide, held on: the ROOSTER TAIL (drift-spray.ts). By now the
  // angle is developed and the tyres are being dragged sideways at pace, so
  // the acceptance test is the stones — a fan of them off the side the tail
  // is going, out and back, low and arcing, darker than the dust and landing
  // on the road rather than hanging over it.
  await capture(
    "shot-drift-tail",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 10);
      await atOpenRoad(page);
      const turn = await atNextCall(page);
      const entry = await stageTime(page);
      await page.keyboard.down("ArrowUp");
      await page.keyboard.down(turn);
      // A beat past the drift shot and no more: held past a second, full lock
      // on full throttle carries the car off the outside of the corner and
      // the shot is a picture of turf being thrown instead.
      await atStageTime(page, entry + 0.9);
    },
    { bot: "1" },
  );

  /** Off the road and into the wild, and hold it there. `data-off` on the HUD
   * root is the honest cursor: it is the engine's own verdict that the car has
   * left the track, so what is behind the wheels is turf rather than grit, and
   * it costs the frame nothing. Not the RETURN TO TRACK strip — that one waits
   * for the car to be LOST, which is a stricter thing than being off the road
   * and a scene may never reach it. */
  async function inTheWild(page) {
    await page.waitForFunction("document.querySelector('.hud[data-off]')", null, {
      timeout: 120000,
    });
  }

  // The wild's turf, at pace. Grass holds together where loose grit does not,
  // so the acceptance test is that the plume off a car crossing a field is
  // visibly THINNER than the one the same car throws on gravel — clods and
  // blades you can count, not a green screen.
  await capture("shot-wild-dust", { width: 1280, height: 720 }, async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    // Stage seconds, not wall seconds: under software rendering the sim runs
    // at a fraction of wall time, and a timeout long enough to build pace on
    // this machine catches the car at walking speed on the next one — which
    // is the one thing a cloud-at-pace shot cannot afford to get wrong.
    await atStageTime(page, 8);
    // The lock stays ON and the throttle comes OFF at the verge. Both matter:
    // a car crossing a field in a straight line puts its plume behind the
    // camera, and at 120 km/h the wake carries the grains past it inside half
    // a second whatever the car is doing. What a player actually looks at is
    // the tail off the outside wheels of a car sliding on turf at a pace the
    // wild allows, which is where this lands after a second of its drag.
    await page.keyboard.down("ArrowLeft");
    await inTheWild(page);
    await page.keyboard.up("ArrowUp");
    const off = await stageTime(page);
    await atStageTime(page, off + 1.4);
  });

  // The same ground at a crawl, which is the other half of the same test: a
  // car picking its way back to the road disturbs the ground, it does not
  // excavate it, so the cloud has to be a scatter at the wheels rather than
  // the plume above.
  await capture("shot-crawl-dust", { width: 1280, height: 720 }, async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await atStageTime(page, 8);
    await page.keyboard.down("ArrowLeft");
    await inTheWild(page);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("ArrowUp");
    // A fixed brake, not a target speed. Waiting for the HUD to read a chosen
    // number cannot land the frame: the readout repaints every 80 ms and one
    // software-rendered frame advances the sim well past it, so the shutter
    // finds the car either back up to speed on this hillside or already
    // reversing out under the same pedal. A fixed stage-time brake lands on
    // ONE deterministic frame instead — the same one on every build, which is
    // what makes a before/after of the cloud a comparison rather than two
    // pictures of different moments.
    await page.keyboard.down("ArrowDown");
    const off = await stageTime(page);
    await atStageTime(page, off + 1.9);
    await page.keyboard.up("ArrowDown");
  });

  // TURN AROUND: the co-driver's strip when the road is still under the
  // wheels and being driven back up. Reached by an actual three-point turn on
  // an actual road, because that is the only honest way in — the engine wants
  // the nose past 110° AND the car covering ground that way for over a
  // second, which is precisely the pair a reverse or a spin cannot fake. Each
  // shuffle is on the RUN's clock rather than wall time, and the loop stops
  // as soon as the sign is up: how many shuffles a car this length needs on
  // a road this width is a fact about the stage, not a number to hard-code.
  await capture("shot-turn-around", { width: 1280, height: 720 }, async (page) => {
    await racing(page);
    // Road behind as well as in front — the sign is about a stage being
    // driven backwards, and a car still on the start line has none to drive.
    await page.keyboard.down("ArrowUp");
    await atStageTime(page, 6);
    await page.keyboard.up("ArrowUp");
    await page.keyboard.down("ArrowDown");
    await atStageTime(page, (await stageTime(page)) + 3);
    // The first bite of the turn: stopped, the same pedal backs the car out,
    // and it does it on full lock so the nose starts coming round.
    await page.keyboard.down("ArrowLeft");
    await atStageTime(page, (await stageTime(page)) + 2.5);
    await page.keyboard.up("ArrowDown");
    await page.keyboard.up("ArrowLeft");
    for (let shuffle = 0; shuffle < 5; shuffle++) {
      // Forward on full lock, then back on the other, which is a three-point
      // turn — the lock stays over while the car changes direction.
      await page.keyboard.down("ArrowUp");
      await page.keyboard.down("ArrowRight");
      await atStageTime(page, (await stageTime(page)) + 1.4);
      await page.keyboard.up("ArrowUp");
      await page.keyboard.up("ArrowRight");
      await page.keyboard.down("ArrowDown");
      await page.keyboard.down("ArrowLeft");
      await atStageTime(page, (await stageTime(page)) + 2.2);
      await page.keyboard.up("ArrowDown");
      await page.keyboard.up("ArrowLeft");
      if (await page.evaluate("!!document.querySelector('.hud-pace-turn')")) break;
    }
    await page.waitForSelector(".hud-pace-turn", { timeout: 60000 });
  });

  // THE PLUME: a car at rally pace on dry gravel, which is the shot this
  // whole effect exists for. Driven by the bot so the frame lands on the
  // road at a speed well past the cloud's 30 km/h threshold — the acceptance
  // test is a boiling tan wall behind and beside the car that is plainly
  // made of SMOKE rather than of dots, and that it thins toward the top
  // rather than ending at an edge.
  await capture(
    "shot-gravel-plume",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 14);
    },
    { bot: "1" },
  );

  // …and the same plume from ABOVE, which is the angle it is actually shaped
  // for and the only one that shows the whole of it. From behind the car the
  // cloud is foreshortened into a haze at the bumper; from the helicopter it
  // is a TAIL, and the acceptance test is its profile down the road: narrow
  // and dense where it leaves the wheels, opening out and thinning the
  // further back it goes, with the widest part of it a good way behind the
  // car rather than on it.
  await capture(
    "shot-plume-heli",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, 14);
    },
    { bot: "1", camera: "heli" },
  );

  // THE RAIN, which takes the plume away. Water binds a loose surface
  // together, so the acceptance test here is an ABSENCE: the same gravel
  // road at the same pace as shot-speed, with no cloud over it at all — just
  // dark clods off the wheels and the drops in the air. A frame with a tan
  // haze in it means the plume is still coming up in the wet.
  await capture(
    "shot-rain-mud",
    { width: 1280, height: 720 },
    async (page) => {
      // Driven by the bot, for the same reason the tarmac scenes are: this
      // shot has to be ON the road at a pace past the plume's own 30 km/h
      // threshold, and a blind throttle held down the opening of a stage
      // ends up in a field — where the ground is a different ground and the
      // shot proves nothing about the road.
      await racing(page);
      await atStageTime(page, 14);
    },
    { weather: "rain", bot: "1" },
  );

  // The mountain, which is the wild's OTHER ground. Above the meadow and on
  // the steep flanks there is no turf to tear, so the acceptance test is the
  // color of the cloud: a car scrabbling up bare rock must throw stone, not
  // grass. Seed 55 stands a 47 m flank 60 m off the road inside the first 50 m
  // of the stage — a ~38° face, which is steep enough that the terrain paints
  // it bedrock and shallow enough that a car with a run-up can climb it. The
  // run-up is the whole trick: this shot is the car ON the rock with the
  // wheels still driving, and a car that arrives at the foot slowly just
  // stops there.
  await capture(
    "shot-rock-dust",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await atStageTime(page, 4);
      await page.keyboard.down("ArrowRight");
      await inTheWild(page);
      await page.keyboard.up("ArrowRight");
      // Straightened up and climbing: the plume wants the wheels loaded and
      // the car pointing UP the flank, not sliding along the foot of it. The
      // turf runs a good way up the foot, so the frame that lands ON the rock
      // is several seconds past the verge.
      const off = await stageTime(page);
      await atStageTime(page, off + 5);
    },
    { seed: "55" },
  );

  // Tarmac, where the ground-contact FX are a different question: a sealed
  // road has nothing lying on it to throw, so the acceptance test for these
  // three is as much what is ABSENT as what is there. Flat out must be clean
  // air behind the car; the line and the drift are the two moments the tires
  // are allowed to give something up.
  //
  // `asphalt=1` seals the stage, but the paving only ever changes at a
  // JUNCTION, so every stage still opens on a couple of hundred metres of
  // gravel behind a real corner — which no blind key press gets around. So
  // these three ride out on `bot=1` and take the wheel once the road is
  // sealed under them.
  const TARMAC = { asphalt: "1", bot: "1" };
  /** How far into the run the bot has the car out on the sealed road, stage
   * seconds — it drives the opening gravel and the junction off it. */
  const ON_TARMAC = 16;

  // The bot keeps driving through this one: nothing is pressed, so there is
  // nothing to see behind the car, which is the whole point of the shot.
  await capture(
    "shot-tarmac-speed",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await atStageTime(page, ON_TARMAC);
    },
    TARMAC,
  );
  await capture(
    "shot-tarmac-drift",
    { width: 1280, height: 720 },
    async (page) => {
      // The bot rides out to the sealed road and finds a straight with room in
      // it; the flick itself is scripted, because a bot with 1.35x of grip
      // under it has no reason to hang the car out and simply drives round
      // every corner.
      //
      // Both halves of the entry are about the eight metres of road the slide
      // has to live inside: the corner is taken as the co-driver calls it —
      // braked back to a rally pace on the way in, then flicked the way the
      // road is going rather than across it. Waiting for open road first would
      // strand a coasting car short of the next corner. At 120
      // km/h and a guessed direction the car is in the trees before the smoke
      // has finished coming up — and a car in the trees is a picture of GRAVEL
      // dust, which is the opposite of what this shot is for.
      await racing(page);
      await atStageTime(page, ON_TARMAC);
      const turn = await atNextCall(page);
      await page.keyboard.down("ArrowDown");
      await page.waitForFunction(
        "Number(document.querySelector('.hud-speed-num')?.textContent) <= 55",
        null,
        { timeout: 60000 },
      );
      await page.keyboard.up("ArrowDown");
      const flick = await stageTime(page);
      await page.keyboard.down(turn);
      await page.keyboard.down("Space");
      await atStageTime(page, flick + 0.3);
      await page.keyboard.up("Space");
      // Caught with the angle up and the car still on its own side of the
      // road — a slide held any longer is a picture of the scenery, which is
      // also why there is no separate shot of a LONG tarmac drift: a sealed
      // surface has too much grip to hang the car out for a second and stay
      // on the road. So this frame carries both halves of the tarmac smoke.
      // The angle is one; the COLOR is the other — the rubber has been
      // cooking for half a second by now (`SOOT` in ground-tint.ts), so the
      // cloud should be visibly grey rather than the clean white a tire
      // gives the instant it lets go, and darker again the longer a player
      // holds it in the real game.
      await atStageTime(page, flick + 0.45);
    },
    TARMAC,
  );
  await capture(
    "shot-tarmac-launch",
    { width: 1280, height: 720 },
    async (page) => {
      // Every stage starts on gravel, so the launch has to be made out on the
      // sealed road: stop the car dead there, then floor it.
      await racing(page);
      await atStageTime(page, ON_TARMAC);
      await page.keyboard.down("ArrowDown");
      // THE BRAKE DOES NOT PARK THE CAR. Once it has stopped, the same pedal
      // backs it out (`CarState.reversing`), so the readout leaves zero and
      // climbs again — and the HUD only repaints every 80 ms, so waiting for the
      // literal "0" waits for a repaint to land inside that one narrow window.
      // It usually never does, and the shot hangs for the full two minutes.
      // A standstill OR the reverse gear is the honest condition: both mean the
      // car has finished going forwards, which is all a launch needs.
      await page.waitForFunction(
        `Number(document.querySelector('.hud-speed-num')?.textContent) <= 1
       || document.querySelector('.hud-gear')?.textContent === 'R'`,
        null,
        {
          timeout: 120000,
        },
      );
      await page.keyboard.up("ArrowDown");
      await page.keyboard.down("ArrowUp");
      // Caught while the driven wheels are still ahead of the car — the puff
      // is gone the moment they hook up.
      await page.waitForFunction(
        "Number(document.querySelector('.hud-speed-num')?.textContent) >= 12",
        null,
        {
          timeout: 60000,
        },
      );
    },
    TARMAC,
  );
}
