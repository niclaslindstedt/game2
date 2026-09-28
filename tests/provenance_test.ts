// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PROVENANCE — where everything the game ships comes from, held to the tree.
//
// `provenance.json` at the root lists every asset: its path, whether it was
// authored here or generated here (and by which command), and its licence.
// A manifest nobody checks drifts the first time an asset moves, so this
// holds it from both sides — every row names something that exists, and
// every image, font or sound file the repository tracks is covered by a row.
// The dependencies' side is `scripts/check-licenses.mjs`, run here as CI runs
// it: the committed lockfiles against the allow-list.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

type Asset = {
  path: string;
  source: "authored" | "generated" | "third-party";
  licence: string;
  generator?: string;
  prompt?: string;
  origin?: string;
  attribution?: string | null;
};

const manifest = JSON.parse(readFileSync(join(root, "provenance.json"), "utf8")) as {
  assets: Asset[];
};

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

/** An asset file: something a player sees or hears, as opposed to code. */
const ASSET = /\.(png|jpe?g|ico|svg|webp|gif|icns|ttf|otf|woff2?|mp3|ogg|wav|flac|glb|gltf)$/i;

/** A row's path as a matcher: a directory (trailing slash) covers what is in
 * it, `*` stands for one path segment's worth of name, anything else is one
 * file. */
function covers(pattern: string): (file: string) => boolean {
  if (pattern.endsWith("/")) return (file) => file.startsWith(pattern);
  const re = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`,
  );
  return (file) => re.test(file);
}

/** Build output that is gitignored — named by the manifest, absent from a clean tree. */
function ignored(path: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", path], { cwd: root }).status === 0;
}

describe("provenance.json", () => {
  it("lists assets, each with the fields its source needs", () => {
    expect(manifest.assets.length).toBeGreaterThan(0);
    for (const asset of manifest.assets) {
      expect(asset.path, JSON.stringify(asset)).toBeTruthy();
      expect(["authored", "generated", "third-party"]).toContain(asset.source);
      expect(asset.licence, asset.path).toMatch(/^[A-Za-z0-9.+-]+$/);
      if (asset.source === "generated") expect(asset.generator, asset.path).toBeTruthy();
      if (asset.source === "third-party") {
        expect(asset.origin, asset.path).toBeTruthy();
        expect(asset, asset.path).toHaveProperty("attribution");
      }
    }
  });

  it("names only paths that exist, or build output the tree ignores", () => {
    for (const { path } of manifest.assets) {
      if (ignored(path)) continue;
      expect(tracked.some(covers(path)), `${path} matches nothing tracked`).toBe(true);
    }
  });

  it("covers every asset file the repository tracks", () => {
    const matchers = manifest.assets.map((asset) => covers(asset.path));
    const assets = tracked.filter((file) => ASSET.test(file) && !file.startsWith("tests/"));
    expect(assets.length).toBeGreaterThan(0);
    const orphans = assets.filter((file) => !matchers.some((match) => match(file)));
    expect(orphans, "add a provenance.json row for each").toEqual([]);
  });
});

describe("the dependency licence check", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(root, "scripts", "check-licenses.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
    });

  it("passes on the committed lockfiles", () => {
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/every licence allowed/);
  });

  it("answers --help and refuses an unknown flag", () => {
    expect(run("--help").status).toBe(0);
    expect(run("--no-such-flag").status).not.toBe(0);
  });
});
