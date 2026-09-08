// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SERVING THE BUILT SITE to a headless browser. Every browser-driven tool in
// `scripts/` needs the same thing — `pwa/dist/` on a real origin, on a port
// nobody has to pick — and the reason it is an HTTP server rather than a
// `file://` URL is not tidiness: the service worker, the manifest and
// `localStorage` all behave differently, or not at all, off an opaque origin.
//
// It serves the built site AS DEPLOYED: a directory request falls back to that
// directory's `index.html`, which is how the static pages under `pwa/public/`
// (`/privacy/`, `/support/`) are reached, and an unknown path 404s rather than
// being rewritten to the app — a tool asking for a file that is not in the
// build should hear so, not get the game back with a 200.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

/**
 * Serve `dir` on an ephemeral loopback port.
 *
 * Returns `{ url, close }` — the origin with its trailing slash, and the
 * shutdown. `close` is deliberately part of the contract rather than left to
 * `process.exit`: a tool that finishes its captures and then hangs is a tool
 * that looks broken on CI.
 */
export async function serveDir(dir) {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const requested = path === "/" ? "index.html" : path.slice(1);
    // A directory (or a path with no extension) gets that directory's index —
    // the shape a static host serves, and what `/privacy/` depends on.
    const candidates = extname(requested)
      ? [requested]
      : [join(requested, "index.html"), requested];
    for (const candidate of candidates) {
      try {
        const body = await readFile(join(dir, candidate));
        res.writeHead(200, {
          "content-type": MIME[extname(candidate)] ?? "application/octet-stream",
        });
        res.end(body);
        return;
      } catch {
        /* try the next candidate */
      }
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
