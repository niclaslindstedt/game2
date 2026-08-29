#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Screenshot tool for the build-and-iterate loop: serves the built app,
// drives it headlessly with scripted keyboard input, and captures frames at
// interesting moments (start grid, full speed, drift, jump if reachable) in
// both landscape and portrait. Screenshots land in the gitignored
// previews/ dir. Requires `npm i --no-save playwright-core` and a Chromium
// (CI/web sessions have one preinstalled at PLAYWRIGHT_BROWSERS_PATH).
//
//   node scripts/screenshot.mjs                # every scene below
//   node scripts/screenshot.mjs pause map      # only scenes whose name
//                                              # contains one of these
//
// The app boots to the STUDIO CARD and then the main menu; driving captures
// pass ?start=1 (plus ?seed=, ?tod=, ?weather=, ?camera=) to pin a run and
// skip both.
// The menu captures pass ?menu=1 to force the menu back, and ?splash=1 to
// see the card itself.
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(dist, path === "/" ? "index.html" : path.slice(1));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : undefined);

/** Every scene runs the same pinned stage in the same conditions unless it
 * overrides them — `?start=1` skips the menu. Overrides go through
 * URLSearchParams rather than string concatenation: a repeated key resolves
 * to the FIRST one, so an appended `&seed=` would silently do nothing. */
const SCENE_DEFAULTS = { seed: "42", start: "1" };

/** Scene filter: bare words on the command line keep only the scenes whose
 * name contains one of them. A whole sweep takes minutes, and a fix to one
 * surface only ever needs to look at that surface again. */
const only = process.argv.slice(2);

/** The race clock, read off the HUD and parsed back out of `M\'SS"CC` —
 * the only honest cursor into how far a drive has actually got. Written as
 * a source string because every use of it runs inside the page. */
const READ_CLOCK = `(() => {
  const t = document.querySelector(".hud-clock-total")?.textContent;
  if (!t) return null;
  const m = /^(\\d+)'(\\d\\d)"(\\d\\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100 : null;
})()`;

/** Wait until the run is actually ticking — every driving scene starts here
 * rather than with a fixed countdown wait. Building the world takes several
 * seconds under software rendering, and the loop does not start until it is
 * done — a bare timeout from page load spends most of itself on the loading
 * screen and captures the start line however long it waits. */
async function racing(page) {
  // The HUD is not in the DOM at all while the world builds, and an absent
  // clock must not read as a started run — which is why READ_CLOCK answers
  // null there rather than parsing an optional chain's `undefined` into a
  // number: `null > 0` is false, so the scene waits instead of starting to
  // press keys at the loading screen.
  await page.waitForFunction(`${READ_CLOCK} > 0`, null, { timeout: 60000 });
}

/** Wait until the RUN's own clock has passed `seconds`. Under software
 * rendering the sim advances at a fraction of wall time, so a fixed
 * `waitForTimeout` lands at a different place on the stage on every machine;
 * the HUD timer is the only honest cursor into how far the drive has got. */
async function atStageTime(page, seconds) {
  await page.waitForFunction(`${READ_CLOCK} >= ${seconds}`, null, { timeout: 180000 });
}

/** Wait until the car has slowed past `kmh`. The finish's two moments are
 * both defined by where the car IS, and under software rendering the sim
 * advances at a fraction of wall time — so a `waitForTimeout` after the
 * flying finish lands somewhere different on every machine and usually
 * catches the car still at rally pace. The speedo is the honest cursor. */
async function slowerThan(page, kmh) {
  await page.waitForFunction(
    `Number.parseInt(document.querySelector('.hud-speed-num')?.textContent ?? '999', 10) < ${kmh}`,
    null,
    { timeout: 180000 },
  );
}

/** The run's own clock, seconds. */
async function stageTime(page) {
  return (await page.evaluate(`${READ_CLOCK} ?? 0`)) ?? 0;
}

/** Wait until the co-driver has nothing to say — no corner inside the call's
 * lead, which is the harness's definition of OPEN ROAD: room ahead to brake
 * in, or to get the car straight before a scene asks something of it. The
 * stage the bot happens to be on decides where that lands, so a scene that
 * needs elbow room asks for it instead of counting seconds. */
async function atOpenRoad(page) {
  await page.waitForFunction("!document.querySelector('.hud-pace-call')", null, {
    timeout: 180000,
  });
}

/** Wait until the co-driver CALLS the next corner, and say which way it
 * goes. The call goes up a couple of seconds out, so this is the turn-in
 * itself — a scene that turns on it turns the way the road is going rather
 * than across it. Returns at once if a call is already up. */
async function atNextCall(page) {
  const handle = await page.waitForFunction(
    `(() => {
      const call = document.querySelector('.hud-pace-call');
      if (!call) return false;
      const text = call.querySelector('.hud-pace-text')?.textContent ?? '';
      return text.includes('LEFT') ? 'ArrowLeft' : text.includes('RIGHT') ? 'ArrowRight' : false;
    })()`,
    null,
    { timeout: 180000 },
  );
  return await handle.jsonValue();
}

async function capture(name, viewport, script, params = {}, waitUntil = "load", pageOptions = {}) {
  if (only.length > 0 && !only.some((f) => name.includes(f))) return;
  const page = await browser.newPage({ viewport, ...pageOptions });
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.goto(`${url}?${new URLSearchParams({ ...SCENE_DEFAULTS, ...params })}`, {
    waitUntil,
  });
  if (waitUntil === "load") await page.waitForSelector("canvas.game-canvas");
  await script(page);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`previews/${name}.png`);
  await page.close();
}

/** A close-up of one HUD element, captured at 4x so the instruments can be
 * JUDGED. The minimap and the damage glyph are a few dozen pixels in a real
 * frame — big enough to check there for clipping, far too small to see
 * whether their parts read apart from each other. */
async function captureElement(name, selector, script, params = {}) {
  if (only.length > 0 && !only.some((f) => name.includes(f))) return;
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 4,
  });
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.goto(`${url}?${new URLSearchParams({ ...SCENE_DEFAULTS, ...params })}`);
  await page.waitForSelector("canvas.game-canvas");
  await script(page);
  await page.locator(selector).screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`previews/${name}.png`);
  await page.close();
}

// Start grid, landscape + portrait. A `?start=1` link lands on the lights:
// the establishing shot is ten seconds of camera every scene would otherwise
// sit through, and it has scenes of its own below.
await capture("shot-grid", { width: 1280, height: 720 }, async (page) => {
  await page.waitForTimeout(800);
});
await capture("shot-grid-portrait", { width: 390, height: 844 }, async (page) => {
  await page.waitForTimeout(800);
});

/** Wait until the start gantry has `lamps` reds lit — the only cursor into
 * the countdown, whose own clock has not started yet. One lamp fills per
 * second, so the last one is the last second before green. */
async function atLamps(page, lamps) {
  await page.waitForSelector(".hud-lights", { timeout: 120000 });
  await page.waitForFunction(
    `document.querySelectorAll('.hud-lamp-red').length >= ${lamps}`,
    null,
    { timeout: 120000 },
  );
}

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

// Off the line. The driven wheels are spinning under a car that has barely
// moved, so the acceptance test is a plume off BOTH rear wheels at a road
// speed where the rolling kickup throws nothing at all — and that it has
// thinned out by the time the car is up and running.
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

/** Wheels off the ground. `data-air` on the HUD root is the engine's own
 * verdict that the car is flying, read the same way `data-off` is: nothing
 * is drawn from it, so the frame is the game rather than the tooling.
 *
 * The budget is WALL time and the sim runs at a fraction of it under
 * software rendering: seed 28's opening lip is ten seconds of stage and a
 * full minute of waiting on this machine. Too short a wait does not fail —
 * it photographs the car still on the road and says the jump was never
 * reachable, which is a jump scene quietly turned into a driving one. */
async function inTheAir(page) {
  await page.waitForSelector(".hud[data-air]", { timeout: 120000 });
}

// In the air, straight and crossed up. Seed 28 opens with a long straight
// into a lip, so both are a matter of holding the throttle; the sideways one
// turns into the launch, which is what puts roll in the body. The camera has
// to hold its frame through both — a jump that pulls the camera back reads
// as small, and it is the biggest moment in the stage.
for (const [name, steer] of [
  ["shot-air", null],
  ["shot-air-sideways", "ArrowRight"],
]) {
  await capture(
    name,
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      if (steer) {
        // A flick just before the lip, not a held turn: the car has to be
        // crossed up AT the launch, and still on the road when it gets there.
        await page.waitForTimeout(7900);
        await page.keyboard.down(steer);
        await page.waitForTimeout(260);
        await page.keyboard.up(steer);
      }
      try {
        await inTheAir(page);
        await page.waitForTimeout(260);
      } catch {
        console.log(`  (${name}: never left the ground)`);
      }
    },
    { seed: "28" },
  );
}

// TOUCHDOWN: the frame just after a flight lands, while the springs are
// still swallowing it. The body is squatted onto its stops and the wheels
// and the shadow are flat on the road — the car having WEIGHT is visible
// here or it is visible nowhere.
await capture(
  "shot-slam",
  { width: 1280, height: 720 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    try {
      await inTheAir(page);
      await page.waitForSelector(".hud:not([data-air])", { timeout: 60000 });
      // Well under the springs' own period: a shot a beat later catches a
      // settled car, which proves nothing about the beat before it.
      await page.waitForTimeout(90);
    } catch {
      console.log("  (shot-slam: never left the ground)");
    }
  },
  { seed: "28" },
);

// Off the road and into the hillside. The ground is a solid like any trunk:
// a face too steep to climb takes the pace, folds the nose and rocks the car
// on its springs. The camera trails DOWN the slope behind it, which is where
// a chase cam at roof height would otherwise be inside the hill.
await capture("shot-bank", { width: 1280, height: 720 }, async (page) => {
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(2600);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(2400);
});

// Portrait at speed (touch HUD hidden on desktop; portrait shows scale).
await capture("shot-speed-portrait", { width: 390, height: 844 }, async (page) => {
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4500);
});

// The touch controls, which only a coarse pointer ever sees — the desktop
// shots above hide them by media query. A thumb dragged partway across the
// left zone and HELD: the rim chases the thumb instead of snapping to it, so
// the blue arc from 12 o'clock is the lock the car is actually being given.
await capture(
  "shot-touch-steer",
  { width: 390, height: 844 },
  async (page) => {
    await racing(page);
    const zone = await page.locator(".hud-zone-left").boundingBox();
    const x = zone.x + zone.width * 0.5;
    const y = zone.y + zone.height * 0.6;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 46, y, { steps: 10 });
    // Long enough for the rim to have caught up — a shot taken mid-chase
    // measures the harness's timing, not the control.
    await page.waitForTimeout(700);
  },
  {},
  "load",
  { hasTouch: true, isMobile: true },
);

// The pedal thumb, held on the anchor: the hints around it are the only place
// the player is ever told which drag does what, so the shot exists to check
// they say the right words in the right directions — and, in the MANUAL box,
// that the gear flicks beside the thumb clear every one of them.
//
// It is taken with the gear RUN OUT (the throttle held long enough for the
// shift light) so the arrows are caught in both states at once: the up one
// lit, because the gear is there to take, and the down one faint, because
// first has nothing under it.
await capture(
  "shot-touch-pedals",
  { width: 390, height: 844 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(3500);
    const zone = await page.locator(".hud-zone-right").boundingBox();
    await page.mouse.move(zone.x + zone.width * 0.5, zone.y + zone.height * 0.55);
    await page.mouse.down();
    await page.waitForTimeout(400);
  },
  { gearbox: "manual" },
  "load",
  { hasTouch: true, isMobile: true },
);

// The gear flick, caught at full stretch — the frame between the stab and the
// release that takes the gear. The throttle is still on under it: a thumb
// reaching for a shift never lifts off, which is the whole point of the
// gesture.
await capture(
  "shot-touch-shift",
  { width: 390, height: 844 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(3500);
    const zone = await page.locator(".hud-zone-right").boundingBox();
    const x = zone.x + zone.width * 0.5;
    const y = zone.y + zone.height * 0.55;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 6 });
  },
  { gearbox: "manual" },
  "load",
  { hasTouch: true, isMobile: true },
);

// Reverse: the brake held once the car has stopped, so the gear reads R and
// the speedo is climbing again with the car going the other way.
await capture("shot-reverse", { width: 1280, height: 720 }, async (page) => {
  await racing(page);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(4000);
});

// Deep into a short stage, portrait: the minimap's route, the car on it, and
// a gauge with a real fraction of the stage filled in.
await capture(
  "shot-map-portrait",
  { width: 390, height: 844 },
  async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(20000);
  },
  { length: "short" },
);

// The camera ladder, one shot per angle, all at the same pace on the same
// stretch so the proportions can be compared side by side: how big the car
// is in frame, where it sits vertically, and how much road each one gives
// the driver. `?camera=` pins the angle rather than counting presses of the
// camera key — a press count silently shoots the wrong camera the day the
// ladder grows.
for (const angle of ["cockpit", "hood", "bumper", "close", "chase", "far", "heli", "top"]) {
  await capture(
    `shot-cam-${angle}`,
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4500);
    },
    { camera: angle },
  );
}

// The two in-car views on a phone held upright. Their own shots because
// hor+ opens the frame vertically on a narrow viewport, and every degree of
// that opening lands half of itself at the BOTTOM — which from the scuttle
// is bonnet and from the seat is fascia.
for (const angle of ["cockpit", "hood"]) {
  await capture(
    `shot-cam-${angle}-portrait`,
    { width: 390, height: 844 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4500);
    },
    { camera: angle },
  );
}

// The cockpit after dark, which is the one condition it is authored for
// separately: a closed cabin gets no light, so the room goes to almost
// nothing and the two instruments — which answer to nothing the sky does —
// are the only lit thing in the car.
await capture(
  "shot-cam-cockpit-night",
  { width: 1280, height: 720 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4500);
  },
  { camera: "cockpit", tod: "night" },
);

// The cockpit in a corner, which is where three of its four moving parts
// are: the wheel on lock, the needles up, and the driver's head leaned into
// the turn against a horizon that is not levelling with the car.
await capture(
  "shot-cam-cockpit-turn",
  { width: 1280, height: 720 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(950);
  },
  { camera: "cockpit" },
);

// THE VIEW KNOBS, as a contact sheet. The four numbers OPTIONS ▸ VIEW moves
// are the ones this camera is developed against, so the sweep is the loop:
// change a default in camera-eye.ts or car/cockpit.ts, shoot the row, look
// at where the fascia, the rim and the header rail actually land. Every
// variant is the same seed at the same pace, so only the framing moves.
for (const variant of [
  { name: "seat-low", seat: -0.05 },
  { name: "seat-high", seat: 0.05 },
  { name: "reach-back", reach: -0.08 },
  { name: "reach-fwd", reach: 0.08 },
  { name: "fov-narrow", vfov: -8 },
  { name: "fov-wide", vfov: 8 },
  { name: "fov-ultra", vfov: 16 },
]) {
  const { name, ...knobs } = variant;
  await capture(
    `shot-cockpit-${name}`,
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4500);
    },
    {
      camera: "cockpit",
      ...Object.fromEntries(Object.entries(knobs).map(([k, v]) => [k, String(v)])),
    },
  );
}

// The same three distant rigs mid-turn, which is where their sway lives:
// the swing is sprung, so a committed turn should have thrown the camera
// out to the OUTSIDE of it rather than leaving it square behind the car. A
// still cannot show the settle, but it can show that the offset is there.
for (const angle of ["far", "heli", "top"]) {
  await capture(
    `shot-cam-${angle}-turn`,
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4000);
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(950);
    },
    { camera: angle },
  );
}

// The in-race menu, opened the way a player opens it — by tapping the
// minimap — in both orientations, since the card is the same width in each.
for (const [name, viewport] of [
  ["shot-pause", { width: 1280, height: 720 }],
  ["shot-pause-portrait", { width: 390, height: 844 }],
]) {
  await capture(name, viewport, async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(6000);
    await page.keyboard.up("ArrowUp");
    await page.click(".hud-minimap");
    await page.waitForSelector(".hud-pause");
    await page.waitForTimeout(400);
  });
}

// ...and the same card opened during the ESTABLISHING SHOT, which is the one
// moment the HUD has something of its own in the middle of the screen — so
// the scene asks for that shot with `?shot=1`. The acceptance test is that
// the caption under the establishing shot is BEHIND the card rather than
// printed through its title, which is what a pause card with no layer of its
// own does: the HUD's centre column claims one to clear the thumb zones, and
// coming later in the DOM does not beat that.
await capture(
  "shot-pause-start",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForSelector(".hud-start-shot");
    await page.click(".hud-minimap");
    await page.waitForSelector(".hud-pause");
    await page.waitForTimeout(400);
  },
  { shot: "1" },
);

// The two new instruments, close up: the minimap with a stage's worth of
// gauge on it, and the damage glyph on a car that has actually been hurt.
await captureElement(
  "shot-instrument-minimap",
  ".hud-minimap-dock",
  async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(22000);
  },
  { length: "short" },
);
await captureElement("shot-instrument-damage", ".hud-damage", async (page) => {
  // Into the scenery on purpose, and held there until the glyph has
  // something to SAY: a sound car makes this shot prove nothing, and how long
  // the bashing takes is not a number worth hard-coding.
  await page.keyboard.down("ArrowUp");
  await racing(page);
  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction(
    `[...document.querySelectorAll(".hud-dmg-sys, .hud-dmg-zone")]
       .filter((el) => (el.style.fill || el.style.stroke || "").startsWith("hsl")).length >= 1
     || document.querySelectorAll(".hud-dmg-part-broken").length >= 1`,
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(500);
});

// ── The menu surfaces. The main menu runs a live bot demo under a drone
// camera, so these want a few seconds on screen before the shutter: a
// backdrop caught mid-build is not what a player sees.

/** The menu is up and its stage has had time to start moving. */
async function menuUp(page) {
  await page.waitForSelector(".menu-card, .roam", { timeout: 90000 });
  await page.waitForTimeout(5000);
}

/** Playwright's per-click actionability checks outlast the chassis secret's
 * own window while a stage is being built, so the developer drum is
 * dispatched in one go. What is under test here is the menu, not the
 * pointer plumbing. Passed as SOURCE rather than a function, like the
 * `waitForFunction` calls above: this file lints as Node, where `document`
 * and `PointerEvent` do not exist. */
const drumChassis = (page) =>
  page.evaluate(`(() => {
    const el = document.querySelector(".car-pick-stage");
    const box = el.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      el.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, composed: true, pointerId: 1,
        clientX: box.left + 100, clientY: box.top + 50,
      }));
    }
  })()`);

// The attract card on its READY beat — the flags flapping, the title up and
// the prompt asking for a press. Shot on `commit` rather than `load`, because
// the card's own clock starts at first paint and can be spent before every
// chunk has landed, and then held until the game behind it is actually
// standing: nothing is on screen to look at before that.
async function attractReady(page) {
  // The world builder is what the card is waiting for, and under software
  // rendering it takes as long as it takes.
  await page.waitForSelector(".splash-title", { timeout: 180000 });
  // Long enough for the reveal to finish and the cloth to get into its flap
  // rather than being caught at rest on its first frame.
  await page.waitForTimeout(1300);
  // The prompt blinks, and spends nearly half its cycle invisible — a shutter
  // racing it would come back empty as often as not. Hold it lit; a still
  // cannot show a blink either way.
  await page.evaluate("document.querySelector('.splash-prompt').style.animation = 'none'");
}

// The card at the three shapes its crest has to hold — the phone held
// sideways being the one that has barely any height to hang it in.
for (const [suffix, viewport] of [
  ["", { width: 1280, height: 720 }],
  ["-portrait", { width: 390, height: 844 }],
  ["-landscape", { width: 844, height: 390 }],
]) {
  await capture(
    `shot-splash${suffix}`,
    viewport,
    attractReady,
    { splash: "1", start: "" },
    "commit",
  );
}

// The root menu at all three shapes it has to hold. The phone LANDSCAPE one
// is the tightest surface in the whole app — very wide, barely 390px tall —
// and the one screen that must never need a scroll to reach OPTIONS.
for (const [name, viewport] of [
  ["shot-menu", { width: 1280, height: 720 }],
  ["shot-menu-portrait", { width: 390, height: 844 }],
  ["shot-menu-landscape", { width: 844, height: 390 }],
]) {
  await capture(name, viewport, menuUp, { menu: "1" });
}

// Campaign: the location, then its four stages with the ladder still locked.
for (const [name, viewport] of [
  ["shot-menu-campaign", { width: 1280, height: 720 }],
  ["shot-menu-campaign-landscape", { width: 844, height: 390 }],
]) {
  await capture(
    name,
    viewport,
    async (page) => {
      await menuUp(page);
      await page.getByText("CAMPAIGN", { exact: false }).first().click();
      await page.waitForTimeout(300);
      await page.locator(".menu-location").first().click();
      await page.waitForTimeout(2500);
    },
    { menu: "1" },
  );
}

// The pre-race card: the stage picked, the car being chosen against its
// spec sheet. Three shapes, because the sheet's two columns collapse to one
// on a phone and the turntable has to keep its share of a 390px-tall
// landscape screen.
for (const [name, viewport] of [
  ["shot-menu-car", { width: 1280, height: 720 }],
  ["shot-menu-car-portrait", { width: 390, height: 844 }],
  ["shot-menu-car-landscape", { width: 844, height: 390 }],
]) {
  await capture(
    name,
    viewport,
    async (page) => {
      await menuUp(page);
      await page.getByText("CAMPAIGN", { exact: false }).first().click();
      await page.waitForTimeout(300);
      await page.locator(".menu-location").first().click();
      await page.waitForTimeout(600);
      await page.locator(".menu-level-open").first().click();
      // The turntable is a dynamic import that builds its own body: the
      // card is up long before there is a car standing on it.
      await page.waitForTimeout(3000);
    },
    { menu: "1" },
  );
}

// Roam: the split view, with the stage drawn into its own pane.
for (const [name, viewport] of [
  ["shot-menu-roam", { width: 1280, height: 720 }],
  ["shot-menu-roam-portrait", { width: 390, height: 844 }],
]) {
  await capture(
    name,
    viewport,
    async (page) => {
      await menuUp(page);
      await page.getByText("ROAM", { exact: false }).first().click();
      await page.waitForTimeout(14000);
    },
    { menu: "1" },
  );
}

for (const tab of ["HUD", "AUDIO", "VIDEO", "CONTROLS"]) {
  for (const [suffix, viewport] of [
    ["", { width: 1280, height: 720 }],
    ["-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(
      `shot-menu-options-${tab.toLowerCase()}${suffix}`,
      viewport,
      async (page) => {
        await menuUp(page);
        await page.getByText("OPTIONS", { exact: false }).first().click();
        await page.waitForTimeout(300);
        await page.locator(".opt-tab", { hasText: tab }).click();
        await page.waitForTimeout(500);
      },
      { menu: "1" },
    );
  }
}

// The new-build card, over the menu and over a run: it wears the menu's
// chrome, and both are places it can turn up. `?update=1` stands it up —
// a real waiting worker needs a deploy to land on a device that already had
// the app, which no capture pass can arrange.
for (const [name, viewport, params, script] of [
  ["shot-update-card", { width: 1280, height: 720 }, { menu: "1" }, menuUp],
  ["shot-update-card-portrait", { width: 390, height: 844 }, { menu: "1" }, menuUp],
  ["shot-update-card-landscape", { width: 844, height: 390 }, { menu: "1" }, menuUp],
  ["shot-update-card-race", { width: 1280, height: 720 }, {}, racing],
]) {
  await capture(name, viewport, script, { ...params, update: "1" });
}

// The developer menu, and the campaign with its ladder opened up.
await capture(
  "shot-menu-developer",
  { width: 1280, height: 720 },
  async (page) => {
    await menuUp(page);
    await page.getByText("ROAM", { exact: false }).first().click();
    await page.waitForTimeout(3000);
    await drumChassis(page);
    await page.locator(".menu-back").click();
    await page.waitForTimeout(600);
    await page.locator(".menu-item-dev").click();
    await page.waitForTimeout(400);
  },
  { menu: "1" },
);

// The conditions: a dawn run, the dusk sun, storm rain at speed, and night
// under the headlights.
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
// and both pairs of lamps on at noon because there is no daylight left to
// drive by. Every sky in every weather is on one sheet at `make sky`; this
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
// The results card, with the lap board on it. Two laps rather than three:
// a scripted pass has to DRIVE to a finish to photograph one, and what the
// card has to prove is that the laps read as a board — which two of them
// say as well as three.
await capture(
  "shot-finish",
  { width: 1280, height: 720 },
  async (page) => {
    await racing(page);
    await page.waitForSelector(".hud-finish", { timeout: 240000 });
    await page.waitForTimeout(400);
  },
  { shape: "circuit", length: "short", seed: "3", laps: "2", bot: "1" },
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

// R28 — the SPLIT, as the car goes through the first checkpoint. The bot
// drives: a board stands a corner or two into the stage and reaching one is
// the whole point of the shot, not something a scripted key press can
// stage. Captured as the CLOCK COLUMN rather than the whole frame — the
// split times itself off the screen in a few seconds, and a full-frame
// screenshot of a software-rendered stage takes long enough to miss it.
await captureElement(
  "shot-checkpoint",
  ".hud-topleft",
  async (page) => {
    await racing(page);
    await page.waitForSelector(".hud-split", { timeout: 240000 });
  },
  { length: "short", bot: "1" },
);

// ...and the pips on the route, close up: a board already driven through
// reads differently from one still to come.
await captureElement(
  "shot-instrument-checkpoints",
  ".hud-minimap-dock",
  async (page) => {
    await racing(page);
    await page.waitForSelector(".hud-minimap-cp-passed", { timeout: 240000 });
    await page.waitForTimeout(400);
  },
  { length: "short", bot: "1" },
);

// THE SALUTE, and the run-out behind it (R23/R24/R25). The one scene that
// cannot be staged: the car has to actually drive a whole stage to reach a
// finish, so the BOT drives a short SPRINT — a circuit's finish is its own
// start line and has no run-out to coast down — and the shots wait for the
// results card, which goes up the instant the line is crossed.
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
    await page.waitForSelector(".hud-finish", { timeout: FINISH_WAIT });
    await slowerThan(page, 105);
  },
  { bot: "1", length: "short", seed: "38" },
);
await capture(
  "shot-runout",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForSelector(".hud-finish", { timeout: FINISH_WAIT });
    await slowerThan(page, 12);
  },
  { bot: "1", length: "short", seed: "38" },
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
  await page.getByText("CAMPAIGN", { exact: false }).first().click();
  await page.getByText("TAIGA", { exact: false }).first().click();
  await page.getByText("HARD", { exact: true }).first().click();
  await page.screenshot({ path: join(outDir, "shot-campaign-stages.png") });
  console.log("previews/shot-campaign-stages.png");
  await page.getByText("Loggers' Run", { exact: false }).first().click();
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
  // R30 — THE RESULT SHEET: fifteen crews, their times, what the stage paid
  // them and what they have for the season. The card holds the way in shut
  // until the last car is home, so this waits for the button to say so
  // rather than for a number of seconds.
  const sheet = page.getByRole("button", { name: "FULL RESULTS" });
  await sheet.waitFor({ timeout: FINISH_WAIT });
  await sheet.click();
  await page.waitForSelector(".hud-modal");
  await page.screenshot({ path: join(outDir, "shot-campaign-points.png") });
  console.log("previews/shot-campaign-points.png");
  await page.close();
}

await browser.close();
server.close();
