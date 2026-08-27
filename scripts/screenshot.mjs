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

/** Wait until the run is actually ticking — every driving scene starts here
 * rather than with a fixed countdown wait. Building the world takes several
 * seconds under software rendering, and the loop does not start until it is
 * done — a bare timeout from page load spends most of itself on the loading
 * screen and captures the start line however long it waits. */
async function racing(page) {
  await page.waitForFunction(
    "document.querySelector('.hud-timer')?.textContent !== '0:00.0'",
    null,
    { timeout: 60000 },
  );
}

/** Wait until the RUN's own clock has passed `seconds`. Under software
 * rendering the sim advances at a fraction of wall time, so a fixed
 * `waitForTimeout` lands at a different place on the stage on every machine;
 * the HUD timer is the only honest cursor into how far the drive has got. */
async function atStageTime(page, seconds) {
  await page.waitForFunction(
    `(() => {
      const t = document.querySelector('.hud-timer')?.textContent;
      if (!t) return false;
      const [m, s] = t.split(':');
      return Number(m) * 60 + Number(s) >= ${seconds};
    })()`,
    null,
    { timeout: 180000 },
  );
}

/** The run's own clock, seconds. */
async function stageTime(page) {
  return await page.evaluate(
    `(() => {
      const t = document.querySelector('.hud-timer')?.textContent ?? '0:00.0';
      const [m, s] = t.split(':');
      return Number(m) * 60 + Number(s);
    })()`,
  );
}

/** Wait until the co-driver's current call is at least `metres` away — i.e.
 * the car is out on open road with room to do something in — and say which
 * way that call goes. The stage the bot happens to be on decides where that
 * lands, so a scene that needs elbow room asks for it instead of counting
 * seconds, and turns the way the road is going rather than across it. */
async function atOpenRoad(page, metres) {
  const handle = await page.waitForFunction(
    `(() => {
      const call = document.querySelector('.hud-pace-call');
      const dist = call?.querySelector('.hud-pace-dist');
      if (!dist || Number.parseInt(dist.textContent, 10) < ${metres}) return false;
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

// Start grid, landscape + portrait.
await capture("shot-grid", { width: 1280, height: 720 }, async (page) => {
  await page.waitForTimeout(800);
});
await capture("shot-grid-portrait", { width: 390, height: 844 }, async (page) => {
  await page.waitForTimeout(800);
});

// Flat out down the opening straight.
await capture("shot-speed", { width: 1280, height: 720 }, async (page) => {
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(5000);
});

// The drift: no flick, no handbrake — just a committed turn at pace, which
// is the whole entry now. Held on the power so the slide is at its angle.
await capture("shot-drift", { width: 1280, height: 720 }, async (page) => {
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4000);
  await page.keyboard.down("ArrowRight");
  // Long enough for the slide to reach the angle the lock is asking for —
  // the angle builds with commitment rather than arriving with the input,
  // so a short hold captures a car that has only started to move.
  await page.waitForTimeout(950);
});

/** Off the road and into the wild, and hold it there. The reset chip is the
 * honest cursor: it says the engine agrees the car has left the track, so
 * what is behind the wheels is turf rather than grit. Not the RETURN TO
 * TRACK strip — that one waits for the car to be LOST, which is a stricter
 * thing than being off the road and a scene may never reach it. */
async function inTheWild(page) {
  await page.waitForFunction("document.querySelector('.hud-mini-alert')", null, {
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
    // has to live inside: braked back to a rally pace first, and flicked the
    // way the co-driver says the road goes rather than across it. At 120
    // km/h and a guessed direction the car is in the trees before the smoke
    // has finished coming up — and a car in the trees is a picture of GRAVEL
    // dust, which is the opposite of what this shot is for.
    await racing(page);
    await atStageTime(page, ON_TARMAC);
    const turn = await atOpenRoad(page, 150);
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
    // road — a slide held any longer is a picture of the scenery.
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
        await page.waitForSelector(".hud-air", { timeout: 30000 });
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
      await page.waitForSelector(".hud-air", { timeout: 30000 });
      await page.waitForSelector(".hud-air", { state: "hidden", timeout: 15000 });
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

// The pedal thumb, held on the anchor: the three gesture hints around it are
// the only place the player is ever told which drag does what, so the shot
// exists to check they say the right words in the right directions.
await capture(
  "shot-touch-pedals",
  { width: 390, height: 844 },
  async (page) => {
    await racing(page);
    const zone = await page.locator(".hud-zone-right").boundingBox();
    await page.mouse.move(zone.x + zone.width * 0.5, zone.y + zone.height * 0.55);
    await page.mouse.down();
    await page.waitForTimeout(400);
  },
  {},
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
// the driver. `?camera=` pins the angle rather than counting KeyV presses —
// a press count silently shoots the wrong camera the day the ladder grows.
for (const angle of ["hood", "close", "chase", "far", "heli", "top"]) {
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

await browser.close();
server.close();
