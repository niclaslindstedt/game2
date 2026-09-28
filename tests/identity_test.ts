// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE IDENTITY MODULE: the name, the URLs and the colours live in
// `pwa/src/identity.ts`, and every surface that cannot import it — the static
// HTML head, the static pages and crawler files under `pwa/public/`, the
// phone app's config, the fastlane Appfile, the README's play link — restates
// or reads it. This holds each of them to the module, so a rename or a domain
// move is one edit and a failing test naming the copies, not an archaeology
// expedition. The desktop app's restatements are `tests/tauri_test.ts`'s.
//
// And the site is not indexed: every page carries `noindex`, and
// `robots.txt` lets a crawler in to read it rather than shutting the door on
// the one tag that says so.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
  APP_TITLE,
  HOME_URL,
  PALETTE,
  PUBLISHER,
  REPO_URL,
  SITE_URL,
} from "../pwa/src/identity.ts";

const root = join(import.meta.dirname, "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const html = read("pwa", "index.html");
const PAGES = ["privacy", "support"].map((page) => ({
  page,
  text: read("pwa", "public", page, "index.html"),
}));

/** The content of every `<meta name|property="key" content="…">`, across line breaks. */
function metas(text: string, key: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/<meta\s[^>]*>/g)) {
    const tag = m[0].replace(/\s+/g, " ");
    const k = /(?:name|property)="([^"]+)"/.exec(tag)?.[1];
    const v = /content="([^"]*)"/.exec(tag)?.[1];
    if (k === key && v !== undefined) out.push(v);
  }
  return out;
}

describe("the identity module", () => {
  it("is well-formed", () => {
    expect(APP_NAME.trim()).toBe(APP_NAME);
    expect(APP_TITLE).toContain(APP_NAME);
    // A launcher cuts a home-screen name at about twelve characters.
    expect(APP_SHORT_NAME.length).toBeLessThanOrEqual(12);
    expect(PUBLISHER.length).toBeGreaterThan(0);
    expect(APP_DESCRIPTION.length).toBeGreaterThan(40);
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
    expect(HOME_URL).toMatch(/^https:\/\/apps\.agilator\.se\/[a-z-]+$/);
    expect(REPO_URL).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(hex, `PALETTE.${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("the static head (pwa/index.html)", () => {
  it("names the app", () => {
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe(APP_TITLE);
    for (const key of ["og:title", "twitter:title"]) {
      for (const value of metas(html, key)) expect(value, key).toContain(APP_NAME);
    }
  });

  it("points its share card at the web edition's own host", () => {
    for (const key of ["og:url", "og:image", "twitter:image"]) {
      for (const value of metas(html, key))
        expect(value.startsWith(`${SITE_URL}/`), key).toBe(true);
    }
  });

  it("asks not to be indexed", () => {
    expect(metas(html, "robots").join()).toMatch(/noindex/);
  });
});

describe("the static pages under pwa/public/", () => {
  it("name the app in their titles and ask not to be indexed", () => {
    for (const { page, text } of PAGES) {
      expect(/<title>([^<]*)<\/title>/.exec(text)?.[1], page).toContain(APP_NAME);
      expect(metas(text, "robots").join(), page).toMatch(/noindex/);
    }
  });

  it("serve the web edition from the host identity.ts names", () => {
    expect(read("pwa", "public", "CNAME").trim()).toBe(new URL(SITE_URL).host);
  });

  it("let a crawler in, so the noindex is read, and advertise no sitemap", () => {
    const robots = read("pwa", "public", "robots.txt");
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
    expect(robots).not.toMatch(/sitemap/i);
  });
});

describe("the surfaces that read the module rather than restate it", () => {
  it("the phone app takes its name from identity.ts, not a literal", () => {
    const config = read("native", "app.config.js");
    expect(config).toContain('identity("APP_NAME")');
    const code = config
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
    expect(code).not.toContain(`"${APP_NAME}"`);
  });

  it("fastlane reads the bundle id from the build, as the phone app does", () => {
    const appfile = read("native", "fastlane", "Appfile");
    expect(appfile).toContain('ENV["APP_BUNDLE_ID"]');
    const fallback = /DEV_BUNDLE_ID = "([^"]+)"/.exec(read("native", "app.config.js"))?.[1];
    expect(fallback).toMatch(/^dev\.local\./);
    expect(appfile).toContain(`"${fallback}"`);
    expect(appfile).not.toMatch(/se\.agilator\./);
  });

  it("the README names the game and links the web edition", () => {
    const readme = read("README.md");
    expect(readme.split("\n")[0]).toBe(`# ${APP_NAME}`);
    expect(readme).toContain(`${SITE_URL}/`);
  });
});
