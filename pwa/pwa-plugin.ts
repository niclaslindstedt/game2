// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from "vite";

import { cacheIdForBase } from "./src/app-pwa.ts";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, APP_TITLE, PALETTE } from "./src/identity.ts";

// Hand-rolls the app's service worker at build time so the deployed game is
// an installable, self-updating PWA. We deliberately avoid `vite-plugin-pwa`
// / Workbox: the framework's `usePwaUpdate` hook only needs three files and
// one cache-naming convention, which is cheaper to emit by hand than to pull
// a Workbox toolchain in for. (Pattern shared with the sibling contacts app.)
//
// What the hook expects, and what we therefore emit:
//   - `${base}sw.js`                  a "prompt to update" worker (installs,
//                                     parks in `waiting`, never auto-skips)
//   - `${base}version.json`           `{ version }` shown in the toast
//   - `${base}precache-manifest.json` `{ totalBytes, assets }` driving the fill
//   - a Cache Storage entry named `<cacheId>-precache`

type AppPwaOptions = {
  /** The bundler base — drives the SW scope, emitted URLs, and cache id. */
  base: string;
  /** Label shown in the update toast; also makes each deploy's SW unique. */
  version: string;
  /** Absolute path prefixes this worker must disown (sibling deploy slots
   * nested under this base, e.g. `/preview/` under `/`). */
  ignorePaths?: string[];
  /** A store build (`VITE_SHELL_BUILD=on`): strip what only the website may
   * carry — see `stripWebOnly`. */
  shell?: boolean;
};

// WHAT ONLY THE WEBSITE MAY CARRY. No phone or desktop build may link back to
// the source or name the web edition's host (strictly): so every such
// line in `index.html` and in the static pages under `public/` sits between
// `<!-- web-only -->` and `<!-- /web-only -->`, and a shell build drops the
// span. The website keeps it all. `CNAME` is GitHub Pages' own file and names
// the host, so a shell build drops it too. The bundle scripts then refuse any
// bundle that still names the owner's account, so a line added outside the
// markers fails the build rather than shipping.
const WEB_ONLY = /[ \t]*<!--\s*web-only\b[\s\S]*?-->[\s\S]*?<!--\s*\/web-only\s*-->[ \t]*\n?/g;
const WEB_ONLY_FILES = new Set(["CNAME"]);

/** `html` with every web-only span removed. */
export function stripWebOnly(html: string): string {
  return html.replace(WEB_ONLY, "");
}

// Public assets we never want in the precache: robots.txt is for crawlers and
// og.png for link unfurlers, not the game shell. CNAME is GitHub Pages config — the deploy
// workflow strips it from every non-root slot, so a precached `${base}CNAME`
// would 404 the install fetch on `/preview/` and `/branch/`.
const PUBLIC_SKIP = new Set(["robots.txt", "og.png", "CNAME"]);

/** Per-deploy-slot install name so a parked preview installs as its own tile. */
function channelName(base: string): { name: string; short_name: string } {
  if (base === "/preview/")
    return { name: `${APP_NAME} (preview)`, short_name: `${APP_SHORT_NAME} pre` };
  if (base === "/branch/")
    return { name: `${APP_NAME} (branch)`, short_name: `${APP_SHORT_NAME} br` };
  return { name: APP_TITLE, short_name: APP_SHORT_NAME };
}

// The web app manifest is generated per build (not shipped from `public/`)
// because the install *identity* — `id`, `start_url`, `scope` — must be
// pinned to the absolute deploy base: some engines resolve relative values
// against the origin, collapsing every slot onto the root app.
export function buildManifest(base: string): string {
  const { name, short_name } = channelName(base);
  const manifest = {
    name,
    short_name,
    description: APP_DESCRIPTION,
    id: base,
    start_url: base,
    scope: base,
    display: "fullscreen",
    // LANDSCAPE ONLY. Portrait is turned off in the app itself
    // (`src/game/orientation.ts`); this is the half of it an INSTALLED copy
    // honours, so the game never rotates under the player's hands in the
    // first place and the cover the page would otherwise throw up is never
    // needed. Change one and change the other — and `native/app.config.js`,
    // which says the same thing to the store build.
    orientation: "landscape",
    background_color: PALETTE.sky,
    theme_color: PALETTE.sky,
    icons: [
      { src: `${base}icons/pwa-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}icons/pwa-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `${base}icons/pwa-512-maskable.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

export function buildServiceWorker(
  cacheId: string,
  base: string,
  version: string,
  precache: string[],
  ignorePaths: string[] = [],
): string {
  const cacheName = `${cacheId}-precache`;
  return `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GENERATED — do not edit. Emitted by pwa-plugin.ts for the ${APP_NAME} PWA.
// A minimal "prompt to update" precaching worker: it installs the build's
// assets, parks in \`waiting\` (never auto-skipWaiting — a silent swap would
// yank a stage mid-drift), and applies on a SKIP_WAITING message from the
// framework's update toast. Build: ${version}
const CACHE = ${JSON.stringify(cacheName)};
const BASE = ${JSON.stringify(base)};
const INDEX = ${JSON.stringify(`${base}index.html`)};
const IGNORE = ${JSON.stringify(ignorePaths)};
const PRECACHE = ${JSON.stringify(precache)};
const PRECACHE_PATHS = new Set(
  PRECACHE.map((u) => new URL(u, self.location.href).pathname),
);

self.addEventListener("install", (event) => {
  // Populate the precache one entry at a time so the window-side progress
  // poller (usePwaUpdate) watches the fill advance as bytes land. No
  // skipWaiting: park in \`waiting\` until the user accepts the prompt.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of PRECACHE) {
        try {
          await cache.add(new Request(url, { cache: "reload" }));
        } catch {
          // A single asset failing to cache must not abort the whole install.
        }
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const req of await cache.keys()) {
        if (!PRECACHE_PATHS.has(new URL(req.url).pathname)) {
          await cache.delete(req);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// App-shell navigations: network-first for freshness, precached shell as the
// offline fallback. Assets are content-hashed, so a fresh shell pulls its
// new bundle on its own; the worker swap still gates the precache.
async function navigateFallback(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(new Request(INDEX, { cache: "reload" }));
    if (fresh && fresh.ok) {
      cache.put(INDEX, fresh.clone());
      return fresh;
    }
  } catch {
    // Offline — serve the precached shell below.
  }
  return (await cache.match(INDEX)) || fetch(req).catch(() => cache.match(INDEX));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    if (!url.pathname.startsWith(BASE)) return;
    if (IGNORE.some((p) => url.pathname.startsWith(p))) return;
    event.respondWith(navigateFallback(req));
    return;
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) || fetch(req);
      })(),
    );
  }
});
`;
}

export function appPwa({ base, version, ignorePaths = [], shell = false }: AppPwaOptions): Plugin {
  const cacheId = cacheIdForBase(base);
  let config: ResolvedConfig;

  return {
    name: "app-pwa",
    apply: "build",
    // Run after Vite's own build plugins so the generated `index.html` is
    // already in the bundle when we collect assets for the precache.
    enforce: "post",

    configResolved(resolved) {
      config = resolved;
    },

    // Wire the manifest, theme color, and apple-touch metadata into the
    // shell. Done here (not in index.html) so the hrefs stay base-correct
    // from one source of truth regardless of the configured `base`. A shell
    // build also loses the page's web-only spans (`stripWebOnly`).
    transformIndexHtml(html: string): { html: string; tags: HtmlTagDescriptor[] } {
      const tags: HtmlTagDescriptor[] = [
        {
          tag: "link",
          attrs: { rel: "manifest", href: `${base}manifest.webmanifest` },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: { rel: "icon", href: `${base}favicon.ico`, sizes: "32x32" },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: { rel: "icon", type: "image/svg+xml", href: `${base}icons/icon.svg` },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: { rel: "apple-touch-icon", href: `${base}icons/apple-touch-icon-180.png` },
          injectTo: "head",
        },
        { tag: "meta", attrs: { name: "theme-color", content: PALETTE.sky }, injectTo: "head" },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "mobile-web-app-capable", content: "yes" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: {
            name: "apple-mobile-web-app-status-bar-style",
            content: "black-translucent",
          },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-title", content: APP_SHORT_NAME },
          injectTo: "head",
        },
      ];
      return { html: shell ? stripWebOnly(html) : html, tags };
    },

    // A shell build rewrites the static pages `public/` copied in as-is, and
    // drops the files only the website serves.
    writeBundle(options) {
      if (!shell) return;
      const outDir = options.dir ?? config.build.outDir;
      for (const file of listFiles(outDir)) {
        const rel = relative(outDir, file).split(sep).join(posix.sep);
        if (WEB_ONLY_FILES.has(rel)) {
          rmSync(file);
        } else if (rel.endsWith(".html")) {
          const html = readFileSync(file, "utf8");
          const stripped = stripWebOnly(html);
          if (stripped !== html) writeFileSync(file, stripped);
        }
      }
    },

    // After the bundle is built, collect every emitted asset plus the public
    // assets and emit the worker + the two manifests the hook reads.
    generateBundle(_options, bundle) {
      const assets: Record<string, number> = {};
      const add = (urlPath: string, bytes: number) => {
        assets[urlPath] = bytes;
      };

      for (const [fileName, output] of Object.entries(bundle)) {
        const bytes =
          output.type === "chunk"
            ? Buffer.byteLength(output.code)
            : typeof output.source === "string"
              ? Buffer.byteLength(output.source)
              : output.source.byteLength;
        add(`${base}${fileName}`, bytes);
      }

      const publicDir = config.publicDir;
      if (publicDir) {
        for (const file of listFiles(publicDir)) {
          const rel = relative(publicDir, file).split(sep).join(posix.sep);
          if (PUBLIC_SKIP.has(rel) || rel.endsWith(".map")) continue;
          // A shell build ships the page `writeBundle` will strip, so the
          // precache has to count that page's bytes rather than the source's.
          const bytes =
            shell && rel.endsWith(".html")
              ? Buffer.byteLength(stripWebOnly(readFileSync(file, "utf8")))
              : statSync(file).size;
          add(`${base}${rel}`, bytes);
        }
      }

      const manifestSource = buildManifest(base);
      add(`${base}manifest.webmanifest`, Buffer.byteLength(manifestSource));

      const precache = Object.keys(assets);
      const totalBytes = Object.values(assets).reduce((a, b) => a + b, 0);

      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: manifestSource });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: buildServiceWorker(cacheId, base, version, precache, ignorePaths),
      });
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version }, null, 2)}\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "precache-manifest.json",
        source: `${JSON.stringify({ totalBytes, assets }, null, 2)}\n`,
      });
    },
  };
}
