#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COUNTRY, PHOTOGRAPHED — one banner per biome for the campaign menu's
// location rows, taken by the REAL GAME rather than drawn as a diagram.
//
// A location is a country, not a road: the taiga is six stages and the
// desert is six more, so a banner that was a map of any one of them would
// be advertising a stage the row is not about. What a row wants is the
// place — the light on it, what grows there, what stands in it, what the
// ground does — and the only honest source for that is the renderer that
// draws it in the game.
//
// So the camera is put over the START LINE of the country's FIRST level,
// lifted, and tilted down a bit: a helicopter shot looking out across the
// landscape the ladder opens on. The first level rather than a chosen one
// because it is the road that country introduces itself with — the first
// thing a player will actually see of it.
//
// Everything about the frame comes off switches the game already has, so
// the picture is the game's own and not a special renderer's:
//
//   ?hud=0             the instruments and the mirror off — the world alone
//   ?drawdistance=far  OPTIONS ▸ VIDEO's own longest air. The fog is tuned
//                      for a driver's eye a metre off the road; a camera two
//                      hundred metres up is looking through four times that,
//                      and on the stored default the middle distance washes
//                      out to fog colour.
//   ?god=1&g…=         god mode's free camera, parked by the URL
//
// THE ONE THING TO KNOW BEFORE MOVING THE CAMERA: the ground and the
// scenery are streamed around the CAR (world.ts — "the ground and the wild
// follow the CAR"), and god mode holds the car on the start line. Fly the
// camera a few hundred metres away and it looks at the world's edge: bare
// backdrop, a floating island of terrain, no trees. That is why this stands
// the camera OVER the start rather than anywhere more scenic, and it is why
// LIFT is as low as it is.
//
//   npm run biomes
//   npm run biomes -- --lift 260 --tilt -0.5   # try another shot
//   npm run biomes -- --out previews           # somewhere to compare, not ship
//
// Needs `npm i --no-save playwright-core` and a Chromium (CHROMIUM_PATH
// overrides discovery), same as scripts/screenshot.mjs — and a built
// pwa/dist, because that is what it serves. Run `make build` first, or the
// banners are a photograph of the previous change.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { aliasEngine } from "./lib/engine-alias.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");
aliasEngine(root);
const engine = await import(join(root, "engine/index.ts"));
const { DEFAULT_KNOBS, compileStage } = engine;
const { LOCATIONS } = await import(join(root, "pwa/src/game/campaign.ts"));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && at + 1 < args.length ? args[at + 1] : fallback;
};

/** How high over the start line the camera hangs, m. Two hundred is a
 * helicopter over the grid: high enough to see the country roll away and
 * what is standing in it, low enough that the ground below is well inside
 * the fog and well inside the streamed world. Past about 250 the far edge
 * of the drawn terrain comes into shot. */
const LIFT = Number(flag("lift", 200));

/** How far the camera tilts down from level, radians. Down "a bit" — a
 * third of a right angle — so the frame is mostly landscape with the
 * horizon and some sky left along the top. Straight down would be a map
 * again, which is the one thing this picture is not. */
const TILT = Number(flag("tilt", -0.35));

/** The banner, px. Low resolution on purpose: it is read as a strip behind
 * a location's name, and the game it is a picture of is low-poly anyway.
 *
 * A PANORAMA rather than a 16:9 frame, because the shape it has to fill is
 * a menu row — four-something to one on every viewport the campaign page
 * has. Shot at 16:9 and cropped to that, three quarters of the picture is
 * thrown away and whatever the camera was pointed at goes with it. Shot at
 * the row's own shape, the camera keeps its vertical slice and simply sees
 * further left and right, which is what a vista wants anyway. */
const W = Number(flag("width", 1024));
const H = Math.round(W / Number(flag("aspect", 4)));

/** JPEG, and not PNG. A 3D render of a landscape is a photograph as far as
 * a compressor is concerned — sky gradients, dappled ground, thousands of
 * shaded leaves — and PNG spends 200 KB on one. This is what JPEG is for. */
const QUALITY = Number(flag("quality", 80));

/** Where the banners land. `--out previews` puts a set in the gitignored
 * dir instead, for trying a lift or a tilt without touching what ships. */
const outDir = join(root, flag("out", "pwa/public/previews"));

/** The app chrome that is drawn for a human at the controls and is not part
 * of the country: god mode's copy button, and the pause chip `?hud=0`
 * deliberately leaves on screen (it is a phone's only way back out of a
 * run, so the HUD switch is right to keep it and this is right to hide it —
 * nobody is going to press it). */
const HIDE = ".debug-copy, .hud-actions, .hud-mini { display: none !important; }";

/** How long the world is given to build before the shutter, ms. The terrain
 * tiles and the wild scenery arrive over many frames (`BUILD_TILES` a
 * frame), and under software rasterization those frames are slow — a
 * shutter that opens too early photographs half-planted country. */
const SETTLE_MS = Number(flag("settle", 12000));

if (!existsSync(join(dist, "index.html"))) {
  console.error("no pwa/dist — run `make build` first (this serves the built site)");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
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
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));

for (const location of LOCATIONS) {
  // The country's opening road — the one the ladder starts on.
  const level = location.levels[0];
  const track = compileStage(
    level.seed,
    level.length,
    { ...DEFAULT_KNOBS, biome: location.biome },
    level.shape ?? "sprint",
  );
  // Over the start line, looking the way the stage sets off. The road's
  // heading and the camera's yaw are the same convention — 0 down +z,
  // growing toward +x — so the opening sample's heading IS the yaw.
  const start = track.samples[0];
  const query =
    `?start=1&biome=${location.biome}&seed=${level.seed}&length=${level.length}` +
    `&shape=${level.shape ?? "sprint"}&tod=${level.timeOfDay}&weather=${level.weather}` +
    `&season=${level.season}&hud=0&drawdistance=far&god=1` +
    `&gx=${start.x.toFixed(1)}&gy=${LIFT}&gz=${start.z.toFixed(1)}` +
    `&gyaw=${start.heading.toFixed(4)}&gpitch=${TILT}`;

  await page.goto(`http://127.0.0.1:${port}/${query}`);
  await page.waitForFunction("!document.querySelector('.loading')", null, { timeout: 120000 });
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(SETTLE_MS);

  const file = join(outDir, `biome-${location.biome}.jpg`);
  const shot = await page.screenshot({ type: "jpeg", quality: QUALITY });
  writeFileSync(file, shot);
  console.log(
    `${file} — ${(shot.length / 1024).toFixed(1)} KB  ${W}x${H} (${(W / H).toFixed(2)}:1)\n` +
      `  ${location.name} over ${level.id} (seed ${level.seed}), ` +
      `${LIFT} m up, tilt ${TILT}, ${level.timeOfDay} ${level.weather} ${level.season}`,
  );
}

await browser.close();
server.close();
