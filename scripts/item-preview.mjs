#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Item preview tool: photograph ONE THING at a time. Builds the harness
// page (pwa/item-preview.html + the real in-game builders), stands each
// requested item on its own turntable, and writes a labeled contact sheet
// to previews/ — a row per item, a column per view, every row fitted to its
// own item and standing on a metre grid.
//
// The sheet the other preview tools cannot give you: `make cars` frames a
// whole car at chase-cam range, `make track` is a stage from above, and a
// screenshot of a run passes a boulder at 40 m/s. This one rotates the
// boulder. Requires `npm i --no-save playwright-core` and a Chromium
// (CHROMIUM_PATH overrides discovery), same as scripts/screenshot.mjs.
//
//   node scripts/item-preview.mjs
//     # previews/items.png — a spread across every group
//   ... item-preview.mjs --list
//     # every item the catalog knows, by group
//   ... item-preview.mjs --items interior,car --out cabin
//   ... item-preview.mjs --group flora --out flora
//   ... item-preview.mjs --items boulder --turntable 8 --elev 12
//     # eight seats round one stone, twelve degrees up: the rotate loop
//   ... item-preview.mjs --season autumn --group flora
//
// The harness bundle is rebuilt only when a source it is built from has
// changed, so the loop this tool exists for — edit a builder, look, edit
// again — pays for the bundler once. `--rebuild` forces one anyway.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { Buffer } from "node:buffer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".item-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const listing = has("list");
const outName = flag("out") ?? "items";
const cellArg = (flag("cell") ?? "360x280").split("x");
const turntable = flag("turntable") === null ? null : Number(flag("turntable"));
if (turntable !== null && !(turntable > 0)) {
  throw new Error(`--turntable takes a count of seats, got ${flag("turntable")}`);
}
const season = flag("season") ?? "summer";
if (!["spring", "summer", "autumn"].includes(season)) {
  throw new Error(`--season is spring, summer or autumn; got ${season}`);
}

const config = {
  select: {
    ids:
      flag("items")
        ?.split(",")
        .map((id) => id.trim()) ?? null,
    group: flag("group"),
    all: has("all"),
  },
  turntable,
  // Degrees on the command line, radians in the page — nobody asks for a
  // turntable 0.21 radians up.
  elev: (Number(flag("elev") ?? 14) * Math.PI) / 180,
  season,
  car: flag("car") ?? "compact",
  cell: { w: Number(cellArg[0]), h: Number(cellArg[1] ?? cellArg[0]) },
  list: listing,
};

/** What the bundle is built FROM, as one string: every source file's path,
 * size and mtime. Cheaper than hashing the bytes by an order of magnitude
 * and wrong only if a file is rewritten byte-identically within a
 * filesystem clock tick — in which case `--rebuild` is the answer. */
function fingerprint() {
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        const { size, mtimeMs } = statSync(path);
        parts.push(`${path}:${size}:${mtimeMs}`);
      }
    }
  };
  walk(join(root, "pwa", "src"));
  walk(join(root, "engine"));
  const html = statSync(join(root, "pwa", "item-preview.html"));
  parts.push(`html:${html.size}:${html.mtimeMs}`);
  return parts.join("\n");
}

const stampFile = join(buildDir, "sources.stamp");
const stamp = fingerprint();
const fresh =
  !has("rebuild") &&
  existsSync(join(buildDir, "item-preview.html")) &&
  existsSync(stampFile) &&
  readFileSync(stampFile, "utf8") === stamp;

if (!fresh) {
  const { build } = await import("vite");
  await build({
    configFile: false,
    logLevel: "warn",
    root: join(root, "pwa"),
    base: "./",
    resolve: { alias: { "@engine": join(root, "engine", "index.ts") } },
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      rollupOptions: { input: join(root, "pwa", "item-preview.html") },
    },
  });
  writeFileSync(stampFile, stamp);
}
writeFileSync(join(buildDir, "items.json"), JSON.stringify(config));

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(buildDir, path === "/" ? "item-preview.html" : path.slice(1));
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];
page.on("pageerror", (err) => {
  failures.push(err.message);
  console.error(`[pageerror] ${err.message}`);
});
await page.goto(`http://127.0.0.1:${port}/item-preview.html`);
// A string, not a closure — it runs in the page, where `window` exists.
await page.waitForFunction("window.__done === true", undefined, { timeout: 120000 });

if (listing) {
  const catalog = await page.evaluate("window.__catalog");
  let group = null;
  for (const item of catalog) {
    if (item.group !== group) {
      group = item.group;
      console.log(`\n${group}`);
    }
    console.log(`  ${item.id.padEnd(18)}${item.note ?? ""}`);
  }
  console.log(`\n${catalog.length} items — --items <id,…>, --group <name>, or --all`);
} else {
  // The page hands back the finished sheet rather than being photographed:
  // a screenshot would mean resizing the window to a canvas metres tall and
  // compositing the whole page, which costs more than drawing it did.
  const png = await page.evaluate("window.__png");
  writeFileSync(join(outDir, `${outName}.png`), Buffer.from(png, "base64"));
  const rendered = await page.evaluate("window.__rendered");
  console.log(`previews/${outName}.png (${rendered.join(", ")})`);
}

await browser.close();
server.close();
// A row that threw built nothing, and a sheet with a hole in it is worse
// than no sheet: it looks like the item renders as empty space.
if (failures.length > 0) process.exitCode = 1;
