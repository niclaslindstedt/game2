#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SWEEP — how a store frame's moment is CHOSEN rather than guessed.
//
// A recipe says what to stage; this says when to shoot it. It reproduces one
// recipe at a matrix of offsets past its trigger, contact-sheets the results
// with each cell labelled by the offset it was taken at, and then you LOOK at
// the sheet and write the winner into that recipe's `captureAtS`.
//
// Never guess a delay. A drift lasts a second and a half, a jump rather less;
// a screenshot of either taken at a number somebody liked the look of is luck,
// and luck does not reproduce on the next machine.
//
//   make build
//   make store-sweep ARGS="--shot drift"                 # the coarse pass
//   # LOOK at previews/store-sweep/drift.png
//   make store-sweep ARGS="--shot drift --around 0.4 --span 0.6"   # narrow it
//   # LOOK again, then write the number into recipes.mjs and `make store-shots`
//
// IT RE-STAGES THE RUN FOR EVERY SAMPLE, and that is not optional. Sampling
// one run instead would drift the shutter further past the schedule with every
// frame, because a full-raster screenshot and a compositing pass both cost
// real time — and the sheet would then be labelled with the numbers it was
// ASKED for rather than the ones it took. Re-staging costs a stage build per
// sample and buys a sheet whose labels are true.
//
// The sweep shoots at ONE raster (the phone's, unless `--device` says
// otherwise) because it is choosing a MOMENT, and the moment does not depend
// on the viewport. Tune each frame on a sheet, then let `store-shots.mjs`
// reproduce it at all three.
//
// Output lands in the gitignored previews/ directory, beside every other lab's
// pictures.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { serveDir } from "./lib/serve-dist.mjs";
import { compose, contactSheet, resolvedFont } from "./store-shots/compose.mjs";
import {
  assertRasters,
  COARSE_S,
  DEVICES,
  holdFor,
  prepareContext,
  shoot,
  SHOTS,
  stageRun,
} from "./store-shots/recipes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");
const outDir = join(root, "previews", "store-sweep");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const shotId = option("shot", null);
const deviceName = option("device", "iphone-6.9");
const around = Number(option("around", NaN));
const span = Number(option("span", 0.6));
const samples = Number(option("samples", 9));
const captions = !has("no-captions");

if (!shotId) {
  console.error(
    "store-shot-sweep: --shot <id> is required. Recipes: " + SHOTS.map((s) => s.id).join(", "),
  );
  process.exit(1);
}
const shot = SHOTS.find((s) => s.id === shotId);
if (!shot) {
  console.error(
    `store-shot-sweep: no recipe "${shotId}". Recipes: ${SHOTS.map((s) => s.id).join(", ")}`,
  );
  process.exit(1);
}
const device = DEVICES.find((d) => d.name === deviceName);
if (!device) {
  console.error(
    `store-shot-sweep: no device "${deviceName}". Devices: ${DEVICES.map((d) => d.name).join(", ")}`,
  );
  process.exit(1);
}
assertRasters([device]);

if (!existsSync(join(dist, "index.html"))) {
  console.error("store-shot-sweep: pwa/dist is not built. Run `make build` first.");
  process.exit(1);
}

/**
 * The schedule this run samples, in stage seconds past the trigger.
 *
 * With no `--around`, it is the recipe's own coarse schedule — a couple of
 * seconds of road, which answers "is the moment anywhere in here at all".
 * With one, it is a tight even fan around that value: the FINE pass, run once
 * the coarse sheet has said roughly where to look.
 */
const schedule = Number.isFinite(around)
  ? Array.from({ length: samples }, (_, i) =>
      Math.max(0, Number((around - span / 2 + (span * i) / (samples - 1)).toFixed(3))),
    )
  : (shot.sweepAtS ?? COARSE_S);

const site = await serveDir(dist);
const { chromium } = await import("playwright-core");
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
);
const composer = await (await browser.newContext()).newPage();

console.log(
  `store-shot-sweep: ${shot.id} on ${device.label}\n` +
    `  schedule  ${schedule.map((s) => `+${s}s`).join("  ")}\n` +
    `  captions  ${captions ? await resolvedFont(composer) : "off"}\n` +
    `  chosen    +${shot.captureAtS}s (recipes.mjs)`,
);

const context = await browser.newContext({
  viewport: device.css,
  deviceScaleFactor: device.scale,
  hasTouch: device.touch ?? true,
  reducedMotion: "no-preference",
});
await prepareContext(context);

const frames = [];
/** Samples whose shutter cost more stage time than their own offset. */
const lateBy = [];
for (const offset of schedule) {
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`  PAGE ERROR: ${error.message}`));
  try {
    await stageRun(page, shot, site.url);
    if (shot.trigger) await shot.trigger(page);
    await holdFor(page, offset);
    const shutter = await shoot(page, offset);
    const raw = shutter.png;
    if (!shutter.honest) lateBy.push(shutter.stageCost);
    frames.push({
      // The label carries the shutter's own cost when it outran the offset,
      // because otherwise the sheet invites you to pick between nine frames
      // that are all of the same too-late instant. See `shoot`.
      label:
        `+${offset}s${offset === shot.captureAtS ? " (chosen)" : ""}` +
        (shutter.honest ? "" : ` +${shutter.stageCost.toFixed(2)} LATE`),
      png: await compose(composer, raw, device, captions ? shot.caption : null, device.layout),
    });
    console.log(`  ✓ +${offset}s`);
  } catch (error) {
    console.error(`  ✗ +${offset}s: ${error.message}`);
  } finally {
    await page.close();
  }
}

if (frames.length === 0) {
  console.error("store-shot-sweep: every sample failed — nothing to sheet");
  await browser.close();
  await site.close();
  process.exit(1);
}

// A three-wide sheet keeps a nine-sample fan square and readable at the size a
// contact sheet is actually looked at.
const sheet = await contactSheet(composer, frames, { columns: 3 });
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${shot.id}.png`);
writeFileSync(file, sheet);

await browser.close();
await site.close();

console.log(
  `\nstore-shot-sweep: ${frames.length}/${schedule.length} sampled → ${relative(root, file)}\n` +
    "LOOK at it, pick the frame, then write its offset into that recipe's " +
    "`captureAtS` in scripts/store-shots/recipes.mjs.",
);

// A sweep whose every sample was shot late is a sheet of one instant wearing
// nine different labels — and picking a "winner" off it is how a wrong frame
// becomes a chosen frame.
if (lateBy.length) {
  const worst = Math.max(...lateBy);
  console.error(
    `\n${lateBy.length} of ${frames.length} samples were SHOT LATE: the shutter itself\n` +
      `cost up to ${worst.toFixed(2)}s of stage time, more than the offset it was measured\n` +
      "from. Do not pick a winner off this sheet — the samples are all past the\n" +
      "moment, and lowering the offset cannot help, because the cost is the\n" +
      "shutter's. Sweep this recipe on a machine where a full-raster screenshot\n" +
      "costs about a second.",
  );
}
