// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORE LISTING, held to what the storefronts will actually accept — and
// to what the app it describes actually does.
//
// Two kinds of assertion live here and the split is the point:
//
//   THE LIMITS. Apple's field lengths, Valve's blurb ceiling. Enforced by
//   `scripts/generate-store-metadata.mjs` too, and asserted here as well
//   because the generator runs when somebody remembers to run it, where this
//   runs on every push. An over-long subtitle is not a broken build — App Store
//   Connect truncates it silently and the listing goes live wrong.
//
//   THE CLAIMS. The review notes make load-bearing statements about the build:
//   that the whole game ships inside the binary, that nothing is sold, that
//   nothing leaves the device, that a privacy page exists. Every one is
//   checkable from the tree, and a note that has drifted from the build is an
//   argument a reviewer can disprove faster than they can read it.
//
// The rasters are here too, for the one reason that matters: `css × scale` has
// to equal `raster` exactly, Chromium accepts a mismatch silently, and Apple
// rejects a set that is one pixel off.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { RULES } from "../native/store/listing.mts";
import * as skeleton from "../native/store/copy.example.mts";
import { DEVICES, SHOTS, SHOT_DEFAULTS, assertRasters } from "../scripts/store-shots/recipes.mjs";
import { APP_TITLE, PUBLISHER, SITE_URL } from "../pwa/src/identity.ts";

const root = join(import.meta.dirname, "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

// THE COPY IS NOT COMMITTED, so this suite reads whichever module is present:
// `copy.mts` on the machine that submits, and the committed `copy.example.mts`
// skeleton everywhere else — CI included. That is the honest arrangement rather
// than a compromise: the limits and the claims are properties of the SHAPE, and
// holding the skeleton to them is what stops the shape rotting while the real
// listing lives outside the repository. The generator re-runs every one of
// these against the real words at `make store-metadata`, on the machine that
// has them.
//
// IT MUST NOT NAME `copy.mts` IN A LITERAL IMPORT, and that cost a red CI.
// TypeScript resolves the specifier of a dynamic `import()` exactly as it
// resolves a static one, so `await import("../native/store/copy.mts")` inside a
// try/catch typechecks fine on the machine that HAS the file and fails on every
// clone with `TS2307: Cannot find module`. Locally green, CI red — which is the
// standing hazard of a gitignored SOURCE module: this checkout is not a clone,
// so `tsc --noEmit` here is not the check CI runs.
//
// So the path is built at runtime and handed over as a URL, which TypeScript
// cannot resolve and does not try to. The TYPES come from the skeleton, which is
// committed and therefore always resolvable — and since the skeleton is the
// declared shape, typing the real module as `typeof skeleton` is exactly the
// assertion worth making about it.
const localCopy = join(root, "native", "store", "copy.mts");
const copy: typeof skeleton = existsSync(localCopy)
  ? ((await import(pathToFileURL(localCopy).href)) as typeof skeleton)
  : skeleton;

const EN = copy.APPLE_INFO["en-US"];
const NOTES = copy.APPLE_REVIEW_NOTES;
const CONTACT = RULES.apple.contact;

/** Whether this checkout has the real listing, or only the skeleton. */
const authored = copy !== skeleton;

/**
 * A case that is only meaningful against real copy.
 *
 * The BUILD half of every claim below is checked unconditionally, because that
 * is a property of the tree and belongs on every runner. The half that asks
 * whether the NOTES say so can only be asked where the notes exist — the
 * skeleton's placeholders deliberately do not spell out the guideline 4.2
 * argument, and rewriting them until they did would recreate the very thing
 * keeping the copy out of this repository is for.
 */
const itAuthored = authored ? it : it.skip;

/**
 * A case about the MAC listing, which may not exist yet.
 *
 * `MAC_INFO` and `MAC_REVIEW_NOTES` are OPTIONAL in a real `copy.mts`: the Mac
 * page is a separate piece of writing, and the generator skips that storefront
 * rather than filling it in from the phone's words. So a checkout that has the
 * real listing but has not written the Mac half yet is a normal state, and the
 * cases that read those fields have to say so — otherwise this suite passes on
 * every clone (where the skeleton HAS them) and throws on the one machine that
 * actually submits.
 */
const macListed = Boolean(copy.MAC_INFO && copy.MAC_REVIEW_NOTES);
const itMac = macListed ? it : it.skip;

describe("the App Store listing fits Apple's fields", () => {
  it("has a title between 2 and 30 characters", () => {
    // Composed from identity.ts rather than authored, so this is really an
    // assertion about the game's NAME — which is the point: a rename that
    // overruns Apple's field should fail here rather than at upload.
    expect(APP_TITLE.length).toBeGreaterThanOrEqual(2);
    expect(APP_TITLE.length).toBeLessThanOrEqual(30);
  });

  it("keeps the subtitle under 30 characters", () => {
    expect(EN.subtitle.length).toBeLessThanOrEqual(30);
  });

  it("spends at most 100 characters on the JOINED keyword string", () => {
    // The budget is spent on the comma-joined string, NOT per keyword. This is
    // the limit that surprises people.
    expect(EN.keywords.join(",").length).toBeLessThanOrEqual(100);
  });

  it("does not repeat a keyword, or spend one the title already spends", () => {
    expect(new Set(EN.keywords).size).toBe(EN.keywords.length);
    const spent = `${APP_TITLE} ${EN.subtitle}`.toLowerCase();
    expect(EN.keywords.filter((k) => spent.includes(k.toLowerCase()))).toEqual([]);
  });

  it("keeps promo text under 170 and the description between 10 and 4000", () => {
    expect(EN.promoText.length).toBeLessThanOrEqual(170);
    expect(EN.description.length).toBeGreaterThanOrEqual(10);
    expect(EN.description.length).toBeLessThanOrEqual(4000);
    expect(EN.releaseNotes.length).toBeLessThanOrEqual(4000);
  });

  it("keeps the review notes between 2 and 4000", () => {
    expect(NOTES.length).toBeGreaterThanOrEqual(2);
    expect(NOTES.length).toBeLessThanOrEqual(4000);
  });

  it("gives Apple an https support URL that is not the source repository", () => {
    // A mailto: is rejected outright, and a listing whose support link is a
    // GitHub tree tells a player who installed a game to open a pull request.
    expect(EN.supportUrl).toMatch(/^https:\/\//);
    expect(EN.supportUrl).not.toContain("github.com");
  });

  it("names a review contact, and no phone number", () => {
    expect(CONTACT.firstName).toBeTruthy();
    expect(CONTACT.lastName).toBeTruthy();
    expect(CONTACT.email).toBeTruthy();
    // THE NUMBER APPLE RINGS IS NOT COMMITTED. This repository is public, so it
    // comes from ASC_REVIEW_PHONE in the gitignored native/.env and the
    // generator drops the field when nobody has set one. A phone number
    // appearing in the authored listing is a personal detail published
    // permanently and in the history.
    expect(JSON.stringify(CONTACT)).not.toMatch(/\+\d{6}/);
  });
});

describe("the Steam page fits Valve's fields and does not over-claim", () => {
  it("keeps the short description under 300 characters", () => {
    expect(copy.STEAM_SHORT_DESCRIPTION.length).toBeLessThanOrEqual(300);
  });

  it("names at least one genre and some tags", () => {
    expect(RULES.steam.genres.length).toBeGreaterThan(0);
    expect(RULES.steam.tags.length).toBeGreaterThan(0);
  });

  it("mentions nothing the shell does not have", () => {
    // Valve reviews the store page and the build TOGETHER, so a feature
    // presented as shipped is a rejection rather than an aspiration. As the
    // desktop shell grows one, its row comes off `notYetShipped` and the copy
    // is free to say so — which is why the list is data rather than a comment.
    const page = `${copy.STEAM_SHORT_DESCRIPTION}\n${copy.STEAM_ABOUT_BODY}`.toLowerCase();
    for (const claim of RULES.steam.notYetShipped) {
      expect(page, `steam copy claims "${claim}"`).not.toContain(claim.toLowerCase());
    }
  });
});

describe("the review notes are true of the build", () => {
  it("is right that the whole game ships inside the binary", () => {
    // `src/config.ts` reads ANY `extra.gameUrl` as "stream the remote site
    // instead and skip the local server", which would make the notes false for
    // every build at once — store builds included. The comment in
    // app.config.js explaining its absence is stripped before the check, or
    // this test fails on the sentence that says the field is not there.
    const config = read("native", "app.config.js")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(config).not.toMatch(/gameUrl\s*:/);
  });

  itAuthored("says so, naming the bundled site", () => {
    expect(NOTES).toMatch(/webroot\.zip/);
  });

  it("is right that nothing is sold", () => {
    const pkg = read("native", "package.json");
    expect(pkg).not.toMatch(/StoreKit|expo-in-app-purchases|react-native-iap/);
  });

  itAuthored("says so", () => {
    expect(NOTES).toMatch(/no in-app\s+purchases/i);
  });

  it("names a privacy page that exists in the site's own tree", () => {
    // Apple fetches this URL before review opens the app at all, and the Play
    // Console's Data safety form links it. It is static HTML under pwa/public/
    // rather than an app route precisely so that neither has to run any
    // JavaScript to read it.
    expect(read("pwa", "public", "privacy", "index.html")).toMatch(/collects nothing/i);
  });

  itAuthored("names that page in the notes", () => {
    expect(NOTES).toContain(`${SITE_URL}/privacy/`);
  });

  it("does not promise a feature by naming a bundle id the app does not use", () => {
    const bundleId = /const BUNDLE_ID = "([^"]+)"/.exec(read("native", "app.config.js"))?.[1];
    expect(bundleId).toBeTruthy();
    // On the PUBLISHER's domain, because the entity holding the store
    // agreements owns the permanent identifier — and unchangeable once a
    // record has shipped under it.
    expect(bundleId).toMatch(/^se\.agilator\./);
    expect(PUBLISHER).toBeTruthy();
  });
});

describe("the screenshot rasters", () => {
  it("multiply out exactly", () => {
    // Chromium accepts `css × scale !== raster` silently and Apple rejects the
    // set for being one pixel off, so the arithmetic is asserted rather than
    // trusted. `assertRasters` throws; this is the whole test.
    expect(() => assertRasters(DEVICES)).not.toThrow();
  });

  it("keeps the DESKTOP frames out of the phone App Store's upload directory", () => {
    // The fastlane upload ships everything it finds under
    // native/store/screenshots to the phone app's App Store Connect record,
    // and a 16:9 desktop frame is not a valid iPhone screenshot. Both desktop
    // sets — Steam's and the Mac App Store's — therefore land beside the shell
    // that submits them, and only the touch devices take the default.
    for (const device of DEVICES) {
      const desktop = device.touch === false;
      if (desktop) expect(device.out).toBe("tauri/store/screenshots");
      else expect(device.out).toBeUndefined();
    }
    expect(DEVICES.filter((d) => d.touch === false).map((d) => d.name)).toEqual([
      "mac-2880",
      "steam-1080",
    ]);
  });

  it("shoots the Mac App Store at one of Apple's four rasters", () => {
    // Apple takes 1280×800, 1440×900, 2560×1600 or 2880×1800 and nothing
    // else — a set at any other size is refused at upload, after the shoot.
    const mac = DEVICES.find((d) => d.name === "mac-2880");
    const allowed = [
      [1280, 800],
      [1440, 900],
      [2560, 1600],
      [2880, 1800],
    ];
    expect(allowed).toContainEqual([mac?.raster.width, mac?.raster.height]);
  });
});

describe("the Mac App Store listing", () => {
  it("is a second Apple storefront with its own words", () => {
    // NEVER the phone listing with a different icon over it: the description
    // is read at a desk, and the review notes describe a different binary.
    // The generator SKIPS the Mac page rather than filling either in.
    expect(skeleton.MAC_INFO["en-US"]).toBeTruthy();
    expect(skeleton.MAC_REVIEW_NOTES).toBeTruthy();
    expect(skeleton.MAC_INFO["en-US"].description).not.toBe(
      skeleton.APPLE_INFO["en-US"].description,
    );
    expect(skeleton.MAC_REVIEW_NOTES).not.toBe(skeleton.APPLE_REVIEW_NOTES);
  });

  itMac("fits the same Apple fields the phone listing does", () => {
    const mac = copy.MAC_INFO["en-US"];
    expect(mac.subtitle.length).toBeLessThanOrEqual(30);
    expect(mac.promoText.length).toBeLessThanOrEqual(170);
    expect(mac.description.length).toBeGreaterThanOrEqual(10);
    expect(mac.description.length).toBeLessThanOrEqual(4000);
    expect(mac.keywords.join(",").length).toBeLessThanOrEqual(100);
    expect(copy.MAC_REVIEW_NOTES.length).toBeLessThanOrEqual(4000);
    expect(mac.supportUrl).toMatch(/^https:\/\//);
  });

  it("asks for the sandbox and nothing else", () => {
    // The App Sandbox is mandatory on the Mac App Store, and it is also the
    // shortest true sentence the review notes have: a sandboxed process with
    // no network entitlement cannot send anything anywhere. Anything added to
    // this list is a claim somebody has to defend to a reviewer.
    expect(RULES.mac.entitlements).toContain("com.apple.security.app-sandbox");
    expect(RULES.mac.entitlements).toHaveLength(1);
  });

  it("promises the same oldest macOS the desktop shell declares", () => {
    // Two files that cannot import each other, and the one that is WRONG is
    // the listing: a store page promising a macOS the binary refuses to launch
    // on is a refund.
    const config = JSON.parse(read("tauri", "src-tauri", "tauri.conf.json")) as {
      bundle: { macOS: { minimumSystemVersion: string }; category: string; icon: string[] };
    };
    expect(config.bundle.macOS.minimumSystemVersion).toBe(RULES.mac.minimumSystemVersion);
  });

  it("ships the icon a macOS bundle actually reads", () => {
    // A `.app` reads Contents/Resources/icon.icns and nothing else: without it
    // in the bundler's list the Dock shows the blank generic icon, which is
    // both a rejection and the first thing anybody sees.
    const config = JSON.parse(read("tauri", "src-tauri", "tauri.conf.json")) as {
      bundle: { icon: string[]; category: string };
    };
    expect(config.bundle.icon).toContain("icons/icon.icns");
    // LSApplicationCategoryType comes from here, and the store shelf from it.
    expect(config.bundle.category).toContain("Game");
  });

  it("says whether the Mac and the iPhone app are one purchase", () => {
    // Apple sells them as one app only when the bundle ids match, and the
    // answer can only be given while NEITHER has shipped — so the rules module
    // states it rather than leaving it to whoever runs the upload.
    const macId = (
      JSON.parse(read("tauri", "src-tauri", "tauri.conf.json")) as {
        identifier: string;
      }
    ).identifier;
    const phoneId = /const BUNDLE_ID = "([^"]+)"/.exec(read("native", "app.config.js"))?.[1];
    expect(typeof RULES.mac.universalPurchase).toBe("boolean");
    if (RULES.mac.universalPurchase) expect(macId).toBe(phoneId);
  });

  it("stages every frame with the field on the road", () => {
    // THE one rule of this set (see the `store-shots` skill): a frame of a
    // single car on an empty road sells a screensaver. The campaign is a
    // STAGGER — every crew drives its own stage on its own clock and is never
    // physically near the player — so `mode=headsup`, the mass start, is what
    // puts fifteen crews on the same road at the same time.
    //
    // THE DEFAULT ITSELF IS THE ASSERTION, not just the absence of an
    // override. This test was first written the other way round, checking only
    // that no recipe opted out — and it passed for a whole capture run in which
    // the default was missing from the code and present only in the comment
    // above it. Six frames came back as beautiful photographs of an empty road
    // with POSITION 15/15 in the corner and a caption reading GET PAST THEM.
    expect(SHOT_DEFAULTS.mode).toBe("headsup");
    for (const shot of SHOTS) {
      expect(shot.params.mode, `${shot.id} overrides the heads-up default`).toBeUndefined();
    }
  });

  it("gives every frame a caption the band can hold on one line", () => {
    // The band sizes type down to fit and never wraps, so a very long caption
    // does not overflow — it shrinks until it is unreadable instead. Thirty-two
    // characters is what still reads at the smallest raster.
    for (const shot of SHOTS) {
      expect(shot.caption, `${shot.id}`).toMatch(/^[A-Z0-9 ,'-]+$/);
      expect(
        shot.caption.length,
        `${shot.id} caption is too long for the band`,
      ).toBeLessThanOrEqual(32);
    }
  });

  it("makes a different claim in every frame", () => {
    const ids = SHOTS.map((s) => s.id);
    const captions = SHOTS.map((s) => s.caption);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(captions).size).toBe(captions.length);
  });

  it("spreads the set across all three countries", () => {
    // The three countries are the reason this game does not look like one
    // screenshot, and a set shot entirely on the stage the tooling defaults to
    // is a set that says the game has one road.
    const countries = new Set(SHOTS.map((s) => s.params.level?.split("-")[0]).filter(Boolean));
    expect([...countries].sort()).toEqual(["alpine", "desert", "taiga"]);
  });
});
