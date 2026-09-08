// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORE SCREENSHOT RECIPES — what each frame stages, and the machinery
// that gets the real game into that situation. Shared by the two drivers, so a
// recipe is tuned in exactly ONE place:
//
//   store-shots.mjs       captures each recipe at its chosen `captureAtS`
//   store-shot-sweep.mjs  captures a MATRIX of moments around it and contact
//                         sheets them, so the chosen instant is picked by EYE
//                         instead of guessed
//
// The loop those two form is the point (see the `store-shots` skill): sweep
// coarsely, look at the sheet, sweep finely around the best frame, look again,
// then write the winner into `captureAtS` here. A screenshot of a slide that
// lasts a second and a half is otherwise luck.
//
// THE SHUTTER IS TIMED IN STAGE SECONDS, NOT WALL MILLISECONDS, and that is
// the one thing to carry away from this file. Under software rendering — every
// CI runner, every web session — the simulation advances at a fraction of wall
// time and at a DIFFERENT fraction on every machine, so a delay measured with
// `waitForTimeout` lands somewhere else on the road each time it runs. The
// run's own clock (`.hud-clock-total`) is the honest cursor, exactly as
// `scripts/screenshot.mjs` found: a fixed wait long enough to build pace on
// one machine catches the car at walking speed on the next.
//
// Every page-side read below is written as a SOURCE STRING rather than a
// closure, because that is what `page.waitForFunction` polls — and it keeps
// the browser's own globals out of this module entirely.

// ---------------------------------------------------------------------------
// The rasters the two storefronts require.
//
// Apple scales a 6.9" iPhone set down to every smaller iPhone and a 13" iPad
// set to every smaller iPad, so those two cover the whole App Store
// submission. Steam wants 1920×1080.
//
// `css` × `scale` MUST equal `raster`. Chromium accepts a mismatch silently
// and Apple rejects the set for being one pixel off, which is why
// `assertRasters` exists rather than a comment asking you to check.
//
// Shooting at the real CSS viewport with the real device scale factor — rather
// than shooting small and resizing up — is what makes these frames honest: the
// game lays its HUD out against the viewport (there is a whole portrait HUD in
// styles.css), so a 2868-wide capture of a 956-wide layout is a picture of the
// phone build, where an upscaled 956-wide capture is a picture of a small
// window.
//
// Three fields exist only for the Steam row, and each is the desktop answering
// differently from a phone rather than a preference:
//
//   `out`     where the set is written. Steam's frames must NOT land under
//             native/store/screenshots — the fastlane upload ships everything
//             it finds there to App Store Connect, and a 16:9 desktop frame is
//             not a valid iPhone screenshot.
//   `touch`   false. The game gives a touch device its own controls (the wheel
//             under the thumb, the pedal on the other side) and a mouse the
//             desktop ones, so a Steam frame taken with `hasTouch` on
//             advertises the phone build.
//   `layout`  bleed. `framed` insets the capture under a caption band, which
//             is a phone store card's shape; Valve's guidance is that a
//             screenshot is gameplay, and bleed keeps every pixel 1:1.
// ---------------------------------------------------------------------------
export const DEVICES = [
  {
    name: "iphone-6.9",
    label: 'iPhone 6.9" (16 Pro Max class)',
    css: { width: 956, height: 440 },
    scale: 3,
    raster: { width: 2868, height: 1320 },
  },
  {
    name: "ipad-13",
    label: 'iPad 13" (M4 class)',
    css: { width: 1376, height: 1032 },
    scale: 2,
    raster: { width: 2752, height: 2064 },
  },
  {
    name: "steam-1080",
    label: "Steam 1920×1080",
    css: { width: 1920, height: 1080 },
    scale: 1,
    raster: { width: 1920, height: 1080 },
    out: "tauri/store/screenshots",
    touch: false,
    layout: "bleed",
  },
];

/** Refuse a device row whose arithmetic does not close. */
export function assertRasters(devices) {
  for (const d of devices) {
    if (d.css.width * d.scale !== d.raster.width || d.css.height * d.scale !== d.raster.height) {
      throw new Error(
        `${d.name}: ${d.css.width}×${d.css.height} @${d.scale}× is not ` +
          `${d.raster.width}×${d.raster.height}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The parameters every frame is staged with. Each one is a picture that must
// not depend on what the machine taking it happens to have in local storage.
//
//   start=1          skip the studio card and the main menu
//   mode=headsup     THE WHOLE FIELD ON THE ROAD AT ONCE — fifteen crews on one
//                    grid (`GRID_MAX`), and the most important parameter in this
//                    table. A rally stage is one car alone against a clock, and
//                    a frame of one car on an empty road sells a screensaver;
//                    what sells a racing game is other cars to get past. Heads
//                    up is the discipline that is a MASS START, so the crews are
//                    physically on the road beside the player instead of running
//                    their own staggered stages somewhere else — and
//                    `placeField` (sim/field.ts) drives every one of them
//                    forward to match a placed run, so a frame stood at a corner
//                    two thirds of the way down a stage still has the field in
//                    it. The campaign is a STAGGER, which is why the first
//                    version of this set came back as photographs of an empty
//                    road with POSITION 15/15 in the corner.
//   bot=1            the engine's own driver has the wheel — a skilled rally
//                    driver, deterministic per seed, and it hands over the
//                    moment a control is touched (App.tsx's `autopilotRequested`)
//   hud=1            the HUD and the mirror ON and the frame-rate counter
//                    pinned OFF. That last one matters: an FPS readout in a
//                    store screenshot reads as a debug build, and it is the one
//                    number that is about the machine rather than the game
//   drawdistance=far the setting a player with a decent machine already has.
//                    The fog is tuned for an eye a metre off the road; a lifted
//                    camera on the stored default washes the middle distance out
//
// NOT passed, deliberately: `debug` and `god`, either of which puts developer
// chrome in the frame.
// ---------------------------------------------------------------------------
export const SHOT_DEFAULTS = {
  start: "1",
  mode: "headsup",
  bot: "1",
  hud: "1",
  drawdistance: "far",
};

// ---------------------------------------------------------------------------
// Reading the run out of the HUD.
//
// There is no page-side handle into `GameState` — deliberately, since the app
// exposes none to anybody — so the harness waits on the same DOM the player
// looks at. Every one of these is an attribute or a readout that already
// exists for its own reasons; `data-drift` and `data-air` in particular are on
// the HUD root precisely so a harness can wait for a moment without turning
// the debug overlay on and photographing that instead (see hud.tsx).
// ---------------------------------------------------------------------------

/** The race clock, off the HUD and parsed back out of `M'SS"CC`. Written as a
 * source string because every use of it runs inside the page. */
const READ_CLOCK = `(() => {
  const t = document.querySelector(".hud-clock-total")?.textContent;
  if (!t) return null;
  const m = /^(\\d+)'(\\d\\d)"(\\d\\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100 : null;
})()`;

/**
 * The longest any single wait here may take, in WALL milliseconds.
 *
 * Ten minutes looks absurd and is not. Two things stack up on a machine with
 * no GPU — every CI runner, every web session:
 *
 *   THE BUILD. Compiling a stage and standing its world up costs the better
 *   part of a minute on four cores for a long one, and nothing ticks until it
 *   is done.
 *
 *   THE RATIO. Under software rasterization this game's simulation advances at
 *   roughly a TENTH of wall time — measured on a four-core runner, and it is
 *   worse on a busy one. So a wait for something a few stage seconds away is a
 *   wait of half a minute or more, and a recipe placed a corner too early
 *   silently becomes a timeout rather than a slow frame.
 *
 * Both drivers report the ratio they actually observed, so an operator can see
 * which machine they are on. On a real GPU the same waits return in seconds.
 *
 * It is EXPORTED because the drivers need it for the shutter itself, not only
 * for the waits: a full-raster `page.screenshot()` at 2868x1320 under software
 * rasterization takes longer than Playwright's 30-second default action
 * timeout, and the failure reads as `page.screenshot: Timeout 30000ms
 * exceeded` — which looks like a broken harness rather than a slow machine.
 */
export const PATIENCE = 600_000;

/**
 * Wait until the run is actually ticking.
 *
 * The HUD is not in the DOM at all while the world builds, so an ABSENT clock
 * must not read as a started run — which is why `READ_CLOCK` answers null
 * there rather than parsing an optional chain's `undefined` into a number:
 * `null > 0` is false, so the wait waits instead of shooting the loading
 * screen however long it sits there.
 */
export async function racing(page) {
  await page.waitForFunction(`${READ_CLOCK} > 0`, null, { timeout: PATIENCE });
}

/** The run's own clock, seconds. */
export async function stageTime(page) {
  return (await page.evaluate(`${READ_CLOCK} ?? 0`)) ?? 0;
}

/** Wait until the run's clock has passed `seconds`. */
export async function atStageTime(page, seconds) {
  await page.waitForFunction(`${READ_CLOCK} >= ${seconds}`, null, { timeout: PATIENCE });
}

/** Wait until the HUD root's flags satisfy `test` — a page-side expression
 * over a `flags` object read off `data-drift`, `data-air`, `data-off` and
 * `data-night`. A predicate rather than one flag name, because the useful
 * questions are conjunctions: sideways AND still on the road. */
async function atHudFlags(page, test) {
  await page.waitForFunction(
    `(() => {
      const hud = document.querySelector('.hud');
      if (!hud) return false;
      const flags = {
        drift: hud.hasAttribute('data-drift'),
        air: hud.hasAttribute('data-air'),
        off: hud.hasAttribute('data-off'),
        night: hud.hasAttribute('data-night'),
      };
      return ${test};
    })()`,
    null,
    { timeout: PATIENCE },
  );
}

/**
 * THE CAR IS SIDEWAYS AT PACE, AND STILL ON THE ROAD.
 *
 * `data-drift` is `CarState.drifting` — the engine's own verdict, so the frame
 * this returns on is one where the dust is already coming off the tyres. The
 * second half of the condition was paid for: asking only for the drift caught
 * the car mid-field on a ploughed verge at 108 km/h with the dust flying, which
 * satisfies every word of "sideways at pace" and is a picture of a driver
 * having a bad afternoon. A store frame is a car DRIVING a corner, so the road
 * under the wheels is part of the claim.
 */
export const atDrift = (page) =>
  atHudFlags(page, "flags.drift && !flags.off && !document.querySelector('.hud-recover')");

/** THE CAR IS OFF THE GROUND — `data-air`. Returns at the moment the wheels
 * leave, so the capture offset is measured into the flight. */
export const atAir = (page) => atHudFlags(page, "flags.air");

/**
 * Wait until the start gantry has `lamps` reds lit.
 *
 * The grid is the one moment with no race clock to read: the countdown's own
 * clock has not started, `.hud-clock-total` says nothing until the lights go
 * out, and `racing()` would therefore wait through the whole start. The lamps
 * fill one a second, so this is the only honest cursor into the countdown —
 * and the countdown is where the entire field is still in one picture.
 */
export async function atLamps(page, lamps) {
  await page.waitForSelector(".hud-lights", { timeout: PATIENCE });
  await page.waitForFunction(
    `document.querySelectorAll('.hud-lamp-red').length >= ${lamps}`,
    null,
    {
      timeout: PATIENCE,
    },
  );
}

/**
 * Wait until the co-driver CALLS the next corner, and say WHICH WAY it goes.
 *
 * The call goes up a couple of seconds ahead of the turn-in, which makes it
 * the cursor for a frame that wants the corner rather than whatever the car
 * happens to be doing now — and the direction is what lets a frame turn WITH
 * the road instead of across it. It comes off the plate's `aria-label`, where
 * the co-driver's vocabulary still lives (`pacenoteText` in hud.tsx): the
 * plate itself carries no words any more, because the sign IS the call.
 *
 * Returns the arrow key for that direction, or null for a call with no side to
 * it (a crest, a jump), so a caller can decide rather than guess.
 */
export async function atNextCall(page) {
  const handle = await page.waitForFunction(
    `(() => {
      const call = document.querySelector('.hud-pace-call');
      if (!call) return false;
      const text = call.getAttribute('aria-label') ?? '';
      return text.includes('LEFT')
        ? 'ArrowLeft'
        : text.includes('RIGHT')
          ? 'ArrowRight'
          : 'straight';
    })()`,
    null,
    { timeout: PATIENCE },
  );
  const answer = await handle.jsonValue();
  return answer === "straight" ? null : answer;
}

/**
 * TAKE THE WHEEL AND ASK FOR A SLIDE.
 *
 * `?bot=1` hands the car over for good the moment a control is touched
 * (App.tsx's `autopilotRequested`), which is what makes this possible at all:
 * the bot drives the run to a corner worth photographing, and then the harness
 * drives that corner.
 *
 * It has to, and the reason is worth writing down because it looks like a
 * shortcut and is not. THE BOT DOES NOT DRIFT HAIRPINS — measured, not
 * assumed: placed sixty metres short of a sixteen-metre-radius HARD RIGHT on
 * taiga-3 it brakes from 112 km/h to 40 and takes the corner gripped, and
 * `data-drift` never lights at all. That is the bot being a good rally driver
 * rather than a bug (a tidy line through a hairpin is faster than a spectacular
 * one), so a drift frame that waits for the bot to produce one waits for ever.
 *
 * What produces a slide is what produces one in the player's hands: full lock
 * and the throttle down, into a corner taken faster than it wants. Aimed at a
 * MEDIUM corner rather than a hard one on purpose — full lock into a hairpin at
 * a hundred is a spin, and a spin is a different frame with a different caption.
 */
export async function commitToTheCorner(page) {
  const turn = await atNextCall(page);
  await page.keyboard.down("ArrowUp");
  if (turn) await page.keyboard.down(turn);
}

/**
 * ...AND THEN CATCH IT. Wait for the slide to have actually begun on the road,
 * then take the lock off and leave the throttle down.
 *
 * This is the second half of the drift and the reason the frame works at all.
 * Held lock plus held throttle does not photograph a drift — it photographs
 * the end of one: measured twice, the car reached its angle, kept going, and
 * left the road, and the frame came back as a car in a field with RETURN TO
 * TRACK across the middle of it. Which is correct behaviour on the game's part
 * and correct behaviour on the harness's: nobody holds full lock through a
 * corner. Taking the lock off is what a driver does, it is what the drift
 * model is built around (`drift.leverDepth` and the settle behind it), and it
 * is what leaves the car sideways ON the road for the moment the shutter wants.
 *
 * It is the TRIGGER rather than something the capture does afterwards, so the
 * offset in `captureAtS` is measured from the catch — which is the instant the
 * whole frame is about.
 */
export async function holdTheSlide(page) {
  // Commit for a beat, then let everything go.
  //
  // THE BOUND IS THE WHOLE POINT, and it is the second thing this function got
  // wrong. It first waited for `data-drift` before releasing, which sounds
  // right and is unbounded: in a fifteen-car mass start a full-lock turn-in
  // touches a rival, the car goes off, the recovery strip comes up, the flag
  // the wait is watching for never lights — and the harness holds full throttle
  // and full lock for the whole ten-minute patience, driving into the
  // wilderness, before reporting a timeout. Which is what happened.
  //
  // So the input is a fixed length of ROAD instead: turn in, hold it long
  // enough for the angle to build, then take the lock AND the throttle off, as
  // a driver catching a slide does. What the car is doing at that instant is
  // then a fact rather than a hope, and `atDrift` confirms it in one poll or
  // fails quickly with the car still on the road.
  await holdFor(page, 0.45);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowUp");
  await atDrift(page);
}

// THERE IS NO WAIT FOR "A RIVAL IS ON SCREEN", and it is worth saying why
// rather than leaving somebody to look for one. A name tag is a three.js
// sprite drawn INSIDE the canvas and depth-tested against the world
// (`name-tag.ts`) — there is no DOM node to query, and that is the right
// design: the tag appears when its car does. So the `field` frame is staged
// where the field cannot help being there (the first seconds of a heads-up
// race, when the whole grid is still together) and its instant is found on a
// sweep sheet like every other one.

// ---------------------------------------------------------------------------
// THE RECIPES.
//
// The rule every one obeys: SIX FRAMES, SIX DIFFERENT CLAIMS. A store set is
// not six pretty pictures — it is the six things somebody deciding in four
// seconds needs to be told, each staged at the moment its claim is legible.
// Two frames of a car on gravel from behind is one claim made twice.
//
// The second rule is PALETTE VARIETY, and it is not decoration. The three
// countries are the reason this game does not look like one screenshot: taiga
// green under a high sun, desert gold, alpine white and grey. A set shot
// entirely on `taiga-1` because that is the stage the tooling defaults to is a
// set that says the game has one road.
//
// Shape of a recipe:
//   params      the query the frame is staged from — a campaign `level`, and
//               `at=racing&s=…&speed=…` to stand the run where a drive would
//               have left it (engine/game/place.ts) instead of driving there.
//               Nothing random is drawn by a placement, so a frame reproduces
//               from its URL exactly as a driven one reproduces from its seed.
//   prepare     optional, runs once the run is live. Not timed.
//   trigger     the instant the clock starts from. Usually something the
//               harness WAITS FOR (the slide beginning, the wheels leaving the
//               ground), and the clock starts when it RETURNS — so a trigger
//               may take as long as the staged event needs without spending
//               the offset it is supposed to be measured from.
//   captureAtS  STAGE seconds after the trigger to shoot. THIS is the number
//               the sweep exists to find.
//   sweepAtS    the coarse schedule the sweep samples (defaults to COARSE_S).
//   devices     optional: the rasters this frame is for. Absent means all.
// ---------------------------------------------------------------------------

/** The default coarse schedule, in stage seconds: a couple of seconds of
 * road, close-spaced at the front because most of these moments are short. */
export const COARSE_S = [0, 0.2, 0.4, 0.7, 1.0, 1.4, 1.9, 2.5, 3.2, 4.0];

export const SHOTS = [
  {
    id: "grid",
    caption: "FIFTEEN CREWS, ONE ROAD",
    // THE CLAIM: this is a RACE. Fifteen cars going off the line together, dust
    // off every one of them, and the player's own bumper in the bottom of the
    // frame — the picture that says somebody is going to have to be got past.
    //
    // `far` rather than `heli`: the helicopter rig looks down the grid and the
    // column recedes into single file with the name plates stacked into an
    // unreadable pile, where the high chase rig holds BOTH columns, the gantry
    // and the country the stage runs through in one frame.
    //
    // THE LAUNCH, NOT THE COUNTDOWN, and that is a correction rather than a
    // preference. A static grid was the obvious frame and it is not reliably
    // reachable: `atLamps(3)` asks for the last second of the countdown, and on
    // a slow machine the poll lands either before the field is stood up (an
    // empty road with the START gantry over it — a real frame this harness
    // produced) or just after the lights have gone green. The GREEN is the
    // moment that is deterministic, because the race clock starting is what
    // defines it, and it is the better picture anyway: a grid of stationary
    // cars is a menu, and fifteen cars leaving is a race.
    //
    // So this is the one frame that skips the run-is-ticking wait (`onTheGrid`)
    // in order to get in front of the countdown, holds the player's throttle
    // down from the first lamp so their launch is as hard as everybody else's,
    // and then times the shutter off the lights going out.
    onTheGrid: true,
    params: { level: "taiga-1", camera: "far" },
    prepare: async (page) => {
      await atLamps(page, 1);
      await page.keyboard.down("ArrowUp");
    },
    trigger: racing,
    captureAtS: 0.5,
    sweepAtS: [0, 0.2, 0.4, 0.7, 1.0, 1.4, 2.0, 2.8],
  },
  {
    id: "pack",
    caption: "GET PAST THEM",
    // THE CLAIM: the field is not scenery — it is in the way. Taiga-1's first
    // two calls come at 165 m and 204 m, an EASY RIGHT straight into a MEDIUM
    // LEFT, which is the earliest place on the stage where fifteen cars that
    // left together have to take the same line at once.
    //
    // Placed EARLY rather than driven from the grid. Both work and the placement
    // is the one to keep: `placeField` advances every crew to the player's own
    // clock, and seven seconds in nobody has had time to get away, so the field
    // is as bunched as it is on the grid — for the price of one page load
    // instead of two hundred metres of software-rendered road, which on a
    // machine with no GPU is the difference between a minute and ten.
    //
    // It is the OPENING that has to be placed, though, and that is the rule:
    // each crew then holds the pace its own driver manages, so by two thirds of
    // a stage the field is strung out over hundreds of metres and this frame
    // would be a photograph of one car again.
    params: { level: "taiga-1", at: "racing", s: "150", speed: "24", camera: "chase" },
    trigger: atNextCall,
    captureAtS: 1.4,
    sweepAtS: [0, 0.4, 0.8, 1.2, 1.7, 2.3, 3.0, 4.0],
  },
  {
    id: "drift",
    caption: "COMMIT TO THE SLIDE",
    // THE CLAIM: the drift is the game. Loggers' Run at one in the afternoon in
    // high summer, from the chase camera — the one rig that shows the car's
    // angle against a road it is not pointing down.
    //
    // THE LIGHT WAS CHOSEN AND IS NOT INTERCHANGEABLE. This was first staged on
    // Granite Ridge, which the campaign runs in autumn rain at five in the
    // afternoon: dramatic to drive, and the frame came back a dark brown field
    // under a grey sky with a pair of tail lights in it. The stage that
    // photographs is the bright one; weather goes in the `weather` frame, where
    // being dark is the point.
    //
    // Stood at 740 m, sixty metres short of T6 — a LONG MEDIUM LEFT of
    // thirty-two metres' radius, the tightest corner on the stage
    // (`make level LEVEL=taiga-1`). MEDIUM rather than hard, deliberately: the
    // harness asks for the slide itself, and full lock into a sixteen-metre
    // hairpin at a hundred is a spin — a different frame with a different
    // caption.
    //
    // `commitToTheCorner` then `holdTheSlide` are what make it a drift rather
    // than a tidy line; see the notes on both, and the measurements behind
    // them. The shutter is timed from the CATCH rather than from the input,
    // because how far the car has come round by the time the lock comes off is
    // this frame's whole subject.
    params: { level: "taiga-1", at: "racing", s: "770", speed: "25", camera: "chase" },
    prepare: commitToTheCorner,
    trigger: holdTheSlide,
    captureAtS: 0.4,
    sweepAtS: [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1.1, 1.5],
  },
  {
    id: "air",
    caption: "LAND IT ALREADY TURNING",
    // THE CLAIM: the stages have jumps, and a jump is not a cutscene. Bajada's
    // J1 sits at 946 m — a metre and a half of lip up a 9% ramp, on a straight,
    // sixty-six metres before a HARD RIGHT — which is this caption written into
    // the road. Placed at 860 m so the run arrives at it, and the field is
    // brought forward with the placement, so there are cars on the ramp behind.
    //
    // Timed off the wheels LEAVING the ground, so the offset is how far into the
    // flight to shoot: arithmetic over the air time rather than a guess. The
    // desert for the light and because its crests come over open ground — a
    // taiga jump into a wall of spruce is a picture of trees with a car
    // somewhere in it.
    // THE OFFSET IS SMALL BECAUSE THE FLIGHT IS SHORT. Shot first at +0.35s,
    // which came back as a car on the ground at 105 km/h under a caption about
    // being airborne: a metre and a half of lip is a fraction of a second of
    // air, and the shutter was past it. A tenth of a second is barely off the
    // trigger on purpose — `atAir` returns the instant the wheels leave, so
    // this is measured into the flight rather than towards it.
    params: { level: "desert-1", at: "racing", s: "860", speed: "31", camera: "close" },
    trigger: atAir,
    captureAtS: 0.1,
    sweepAtS: [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6],
  },
  {
    id: "country",
    caption: "EVERY STAGE BUILT FROM ITS SEED",
    // THE CLAIM: the roads are generated, and a generated road still goes
    // somewhere. This is the one frame about the WORLD rather than about the
    // car, so it is the one shot from the helicopter — the rig that can hold a
    // road, the mountain it is cut into, and the field strung out down it, all
    // in one picture.
    //
    // The Col is the stage that proves it: ninety-seven metres of climb in a
    // kilometre and a half — the steepest thing in the campaign per metre of
    // road — with a fifteen-metre hairpin folded back into a long right on the
    // same radius, at NOON in high summer.
    //
    // THE HOUR IS WHY IT IS NOT SWITCHBACKS. That stage has the better
    // geometry and the campaign runs it at half past five in the morning; the
    // frame came back a grey dusk wash with a washed-out sky, which is the
    // Granite Ridge mistake made a second time in the same set. The light is
    // chosen before the geometry, every time. Being SHORT helps too: fifteen
    // hundred metres is not enough road for the field to string out on, so the
    // crews are still on the mountain with the player.
    //
    // `drawdistance=far` is doing real work here rather than being tidy: the fog
    // preset is sized for a driver's eye a metre off the road, and a camera
    // lifted a hundred metres up is looking through four times that at the
    // ground in front of it.
    params: { level: "alpine-1", at: "racing", s: "480", speed: "26", camera: "heli" },
    prepare: (page) => atStageTime(page, 1.5),
    captureAtS: 1.2,
    sweepAtS: [0, 0.8, 1.6, 2.6, 3.8, 5.2, 7.0, 9.0],
  },
  {
    id: "weather",
    caption: "DRIVE IT IN ANYTHING",
    // THE CLAIM: the sky is not wallpaper. Summit to Valley is ten kilometres
    // of wet tarmac dropping three hundred and fifty metres through a summer
    // storm at seven in the evening — headlamps on, spray off the car in front,
    // and a road surface that has stopped being gravel.
    //
    // The weather comes off the CAMPAIGN ROW rather than a `?weather=`
    // override, on purpose: this is the stage as a player meets it, and a storm
    // pinned onto a stage the campaign runs in the clear is a screenshot of a
    // build nobody plays.
    params: { level: "alpine-4", at: "racing", s: "1980", speed: "26", camera: "chase" },
    trigger: atNextCall,
    captureAtS: 1.6,
    sweepAtS: [0, 0.6, 1.2, 1.8, 2.5, 3.3, 4.2, 5.5],
  },
];

/**
 * Boot a capture context. The settings the game stores are stamped BEFORE the
 * first module evaluates, so a set never depends on what the machine taking it
 * has played: sound off (a headless Chromium has no output anyway, and the
 * synth costs frames), and every developer surface shut.
 *
 * Shared by both drivers so a sweep and the capture it tunes boot identically
 * — a moment chosen against one page's settings is not the moment the other
 * one shoots.
 */
export async function prepareContext(context) {
  await context.addInitScript(() => {
    try {
      // `SETTINGS_KEY` in pwa/src/game/settings.ts, and its shape. Named
      // literally rather than imported because this runs in the page before
      // the app's first module evaluates, which is the whole point of it —
      // the reader merges field by field and ignores anything it does not
      // know, so a key that drifts leaves the DEFAULTS rather than a broken
      // page. `?hud=1` says the same thing about the HUD from the URL, which
      // is the belt to this braces.
      localStorage.setItem(
        "scandi-flick-options",
        JSON.stringify({
          audio: { music: 0, sfx: 0 },
          hud: { on: true, mirror: true, fps: false },
          developer: false,
          dev: { debug: false, god: false, record: false },
        }),
      );
    } catch {
      /* a context with storage blocked still shoots the default settings */
    }
  });
}

/**
 * Stage one recipe: open the game on that frame's query, wait until the run is
 * live, and clear anything that must not be in a store screenshot.
 *
 * The FPS chip is hidden here as well as pinned off by `hud=1`, because the
 * two switches answer different questions — the URL says what this launch
 * wants, the style rule covers a stored setting the URL reader ever stops
 * honouring — and a frame-rate counter in a shipped screenshot is not a
 * mistake worth making twice.
 */
export async function stageRun(page, shot, url) {
  const query = new URLSearchParams({ ...SHOT_DEFAULTS, ...shot.params });
  await page.goto(`${url}?${query}`, { waitUntil: "load" });
  await page.waitForSelector("canvas.game-canvas", { timeout: PATIENCE });
  await page.addStyleTag({ content: ".hud-fps { display: none !important; }" });
  // A GRID frame is shot before the lights go out, so there is no race clock to
  // wait for yet — `onTheGrid` says so, and such a recipe waits on the lamps in
  // its own `prepare` instead. Everything else waits for the run to be ticking,
  // because pressing keys at a loading screen is how a frame silently becomes a
  // photograph of the loading screen.
  if (!shot.onTheGrid) await racing(page);
  if (shot.prepare) await shot.prepare(page);
}

/**
 * Hold the shutter until `seconds` of the RUN's clock have passed since the
 * trigger returned — the offset a recipe's `captureAtS` names.
 *
 * Reading the clock BEFORE the wait rather than after the trigger is what
 * makes a sweep honest: a full-raster screenshot costs a good fraction of a
 * second, so a sweep that samples one run and counts from where it started
 * fires later and later, and labels the frames with the numbers it was asked
 * for. Every sample here is measured from its own trigger.
 */
export async function holdFor(page, seconds) {
  const from = await stageTime(page);
  const started = Date.now();
  if (seconds > 0) await atStageTime(page, from + seconds);
  const wall = (Date.now() - started) / 1000;
  // How many wall seconds one stage second cost. Reported by both drivers,
  // because it is the single number that explains everything about how this
  // harness behaves on a given machine: a ratio near 1 is a real GPU, a ratio
  // near 10 is software rasterization, and a ratio of 30 is why a run that
  // finished yesterday is timing out today.
  return seconds > 0 ? wall / seconds : 0;
}

/**
 * TAKE THE FRAME, AND SAY WHAT THE SHUTTER ITSELF COST.
 *
 * `captureAtS` is honoured exactly — and then the screenshot takes its own
 * time, during which THE RUN KEEPS GOING. That latency is uncounted by the
 * offset and it is not small: measured on a four-core runner with no GPU, one
 * 2868×1320 capture cost 25.3 wall seconds, during which the run clock
 * advanced 0.90 STAGE seconds.
 *
 * Which is longer than some of the moments this set is about. The jump on
 * Bajada is airborne for 0.70 stage seconds, so on that machine NO value of
 * `captureAtS` can land inside the flight — the car lands while the shutter is
 * open, and every sampled offset comes back as a car on the ground under a
 * caption about being airborne. Twice, before anybody measured it.
 *
 * So the cost is measured and returned rather than assumed away. The drivers
 * warn when it exceeds the offset it is supposed to be measured from, because
 * at that point the frame is not the frame the recipe asked for and writing it
 * silently is how a listing ends up advertising a moment the game never had.
 */
export async function shoot(page, captureAtS) {
  const before = await stageTime(page);
  const started = Date.now();
  const png = await page.screenshot({ timeout: PATIENCE });
  const wall = (Date.now() - started) / 1000;
  const stageCost = (await stageTime(page)) - before;
  return { png, wall, stageCost, honest: captureAtS <= 0 || stageCost <= captureAtS };
}
