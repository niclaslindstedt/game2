#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CONDITION LAB: the car's health schematic in every state it can reach
// (previews/health.png).
//
// Builds the tooling page (pwa/health-preview.html + the real
// <CarHealthPanel> over real damage ledgers), serves it, and photographs the
// lot: a row of cells at desktop size, then the same states at the size the
// narrowest phone draws them, over gravel, tarmac, grass and a night sky.
//
// THE SECOND HALF IS THE POINT. This instrument's whole job is to be read
// out of the corner of an eye at speed, and a colour that separates
// beautifully on a dark plate can vanish over a sunlit gravel road. Judge it
// small and judge it over the ground.
//
//   node scripts/health-preview.mjs
//   node scripts/health-preview.mjs --skip-build   # reuse the last build
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".health-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const has = (name) => process.argv.slice(2).includes(`--${name}`);

if (!has("skip-build") || !existsSync(join(buildDir, "health-preview.html"))) {
  const { build } = await import("vite");
  await build({
    configFile: false,
    logLevel: "warn",
    root: join(root, "pwa"),
    base: "./",
    esbuild: { jsx: "automatic", jsxImportSource: "preact" },
    resolve: { alias: { "@engine": join(root, "engine", "index.ts") } },
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      // The app stylesheet carries Tailwind at-rules that only the app's own
      // vite config knows how to expand; this page builds without that
      // config, and minifying them raises a page of warnings about rules it
      // does not need to touch. Nothing here ships, so leave the CSS alone.
      cssMinify: false,
      rollupOptions: { input: join(root, "pwa", "health-preview.html") },
    },
  });
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(buildDir, path === "/" ? "health-preview.html" : path.slice(1));
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
// Twice the pixels, because half of what is being judged is a drawing about
// forty pixels tall.
const page = await browser.newPage({
  viewport: { width: 1180, height: 900 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
await page.goto(`http://127.0.0.1:${port}/health-preview.html`);
// A string, not a closure — it runs in the page, where `window` exists.
await page.waitForFunction("window.__done === true", undefined, { timeout: 20000 });
const cells = await page.locator(".cell").count();
if (cells === 0) throw new Error("no states rendered — check pwa/src/tools/health-preview.tsx");
// A state added to the sheet grows it past the window, and past the window
// is exactly where a capture goes wrong: only what the VIEWPORT could have
// shown is painted, so the states added most recently are the ones that come
// back as bare plate. Stand the window as tall as the document before taking
// the picture. The plate under `html` is for the same class of miss — the
// page's own background only covers the body's box, and the app stylesheet
// paints a SKY behind everything else.
await page.addStyleTag({ content: "html { background: #0d1c38; }" });
const tall = await page.evaluate("document.documentElement.scrollHeight");
await page.setViewportSize({ width: 1180, height: Math.ceil(tall) });
await page.screenshot({ path: join(outDir, "health.png") });
console.log(`previews/health.png (${cells} states)`);

await browser.close();
server.close();
