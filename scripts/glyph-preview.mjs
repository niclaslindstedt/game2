#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Render the menu's glyphs to a contact sheet (previews/glyphs.png).
//
// Builds the tooling page (pwa/glyph-preview.html + the real <Glyph>
// component), serves it, and photographs every mark at the three sizes it is
// read at. A mark is judged SMALL — the 14px column is a stage box's result
// row, and a drawing that only works at 40px is a drawing that fails where it
// is actually used.
//
//   node scripts/glyph-preview.mjs
//   node scripts/glyph-preview.mjs --skip-build   # reuse the last build
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".glyph-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const has = (name) => process.argv.slice(2).includes(`--${name}`);

if (!has("skip-build") || !existsSync(join(buildDir, "glyph-preview.html"))) {
  const { build } = await import("vite");
  await build({
    configFile: false,
    logLevel: "warn",
    root: join(root, "pwa"),
    base: "./",
    esbuild: { jsx: "automatic", jsxImportSource: "preact" },
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      // The app stylesheet carries Tailwind at-rules that only the app's own
      // vite config knows how to expand; this page builds without that
      // config, and minifying them raises a page of warnings about rules it
      // does not need to touch. Nothing here ships, so leave the CSS alone.
      cssMinify: false,
      rollupOptions: { input: join(root, "pwa", "glyph-preview.html") },
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
  const file = join(buildDir, path === "/" ? "glyph-preview.html" : path.slice(1));
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
// Twice the pixels, because what is being judged is a 14px drawing.
const page = await browser.newPage({ viewport: { width: 780, height: 600 }, deviceScaleFactor: 2 });
page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
await page.goto(`http://127.0.0.1:${port}/glyph-preview.html`);
// A string, not a closure — it runs in the page, where `window` exists.
await page.waitForFunction("window.__done === true", undefined, { timeout: 20000 });
const marks = await page.locator(".cell").count();
if (marks === 0) throw new Error("no glyphs rendered — check pwa/src/tools/glyph-preview.tsx");
// The grid rather than the page: a sheet with half a screen of empty plate
// under it is half a sheet of nothing to look at.
await page.locator(".grid").screenshot({ path: join(outDir, "glyphs.png") });
console.log(`previews/glyphs.png (${marks} marks)`);

await browser.close();
server.close();
