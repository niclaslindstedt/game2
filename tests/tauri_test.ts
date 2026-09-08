// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DESKTOP APP RESTATES THE IDENTITY AND CANNOT IMPORT IT.
//
// `tauri/` is Rust plus one static JSON config, so the app's name, its
// description and the one global the page reads are spelled again over there
// — and a rename in `pwa/src/identity.ts` that missed one of them would ship a
// window titled after the old game. This is the root suite's hold on that
// pairing, on every platform, with no Rust toolchain needed: the Rust file is
// read as text, which is enough for a `const`.
//
// It also keeps `tauri.conf.json` to what a STATIC config may say: nothing
// under `target/`, which depends on the profile and the `--target` triple and
// belongs to `tauri/scripts/package.mjs`'s `--config` patch.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "../pwa/src/identity.ts";
import {
  SHELL_COMMAND,
  SHELL_COMMANDS,
  SHELL_FULLSCREEN_ASK,
  SHELL_FULLSCREEN_STATE,
  SHELL_GLOBAL,
} from "../pwa/src/shell-host.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAURI = path.join(ROOT, "tauri");

const config = JSON.parse(
  readFileSync(path.join(TAURI, "src-tauri", "tauri.conf.json"), "utf8"),
) as {
  productName: string;
  mainBinaryName: string;
  identifier: string;
  bundle: {
    longDescription: string;
    macOS: Record<string, unknown>;
    icon: string[];
    category: string;
  };
};
const rustConfig = readFileSync(path.join(TAURI, "shell", "src", "config.rs"), "utf8");
const rustPage = readFileSync(path.join(TAURI, "src-tauri", "src", "page.rs"), "utf8");
const rustMain = readFileSync(path.join(TAURI, "src-tauri", "src", "main.rs"), "utf8");
const appManifest = readFileSync(path.join(TAURI, "src-tauri", "Cargo.toml"), "utf8");

/** One `pub const NAME: &str = "…";` out of a Rust source, as text. */
function rustConst(source: string, name: string): string {
  const match = source.match(new RegExp(`pub const ${name}: &str = "([^"]*)";`));
  if (!match) throw new Error(`no string const ${name} in config.rs`);
  return match[1];
}

/** Every string in a JSON value, each with the dotted path it was read from. */
function strings(value: unknown, at = ""): { at: string; value: string }[] {
  if (typeof value === "string") return [{ at, value }];
  if (Array.isArray(value))
    return value.flatMap((entry, index) => strings(entry, `${at}[${index}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, entry]) =>
      strings(entry, at ? `${at}.${key}` : key),
    );
  return [];
}

describe("the desktop app's names", () => {
  it("call the window and the bundle what identity.ts calls the game", () => {
    expect(config.productName).toBe(APP_NAME);
    expect(rustConst(rustConfig, "WINDOW_TITLE")).toBe(APP_NAME);
    expect(config.bundle.longDescription).toBe(APP_DESCRIPTION);
  });

  it("name the executable, the user-data folder and the Cargo binary alike", () => {
    expect(rustConst(rustConfig, "APP_DIR_NAME")).toBe(config.mainBinaryName);
    expect(appManifest).toContain(`name = "${config.mainBinaryName}"`);
    expect(config.identifier.endsWith(`.${config.mainBinaryName}`)).toBe(true);
  });

  it("tell the page about the shell through the one global shell-host.ts reads", () => {
    expect(rustConst(rustConfig, "SHELL_GLOBAL")).toBe(SHELL_GLOBAL);
    expect(rustConst(rustConfig, "SHELL_ID")).toBe("tauri");
  });

  // The FULLSCREEN row in the game's options talks to the window over two
  // DOM events, and neither side can import the other's spelling of them.
  it("hear the fullscreen ask, and answer it, on the events the page uses", () => {
    expect(rustConst(rustConfig, "SHELL_FULLSCREEN_ASK")).toBe(SHELL_FULLSCREEN_ASK);
    expect(rustConst(rustConfig, "SHELL_FULLSCREEN_STATE")).toBe(SHELL_FULLSCREEN_STATE);
  });

  // A command the page invokes by a name the builder does not register is a
  // switch that silently does nothing, and only a launch would show it.
  it("register the one command the initialization script invokes", () => {
    const command = rustConst(rustPage, "FULLSCREEN_COMMAND");
    expect(rustMain).toContain(`generate_handler![${command}]`);
    expect(rustMain).toContain(`fn ${command}(`);
  });
});

describe("the static Tauri config", () => {
  it("names no path inside the Cargo target directory", () => {
    const offenders = strings(config)
      .filter(({ value }) => /(^|\/)target\//.test(value))
      .map(({ at, value }) => `${at}: ${value}`);
    expect(
      offenders,
      "a path under target/ depends on the build profile and the target " +
        "triple, so it belongs in tauri/scripts/package.mjs' --config patch",
    ).toEqual([]);
  });

  it("leaves the macOS signing identity to the packaging script", () => {
    // The identity comes out of the build environment (a secret on CI, ad hoc
    // everywhere else), so a value written here would be wrong somewhere.
    expect(config.bundle.macOS).toBeTruthy();
    expect(config.bundle.macOS).not.toHaveProperty("signingIdentity");
  });

  it("lists only icons scripts/icons.mjs writes", () => {
    // `tauri-build` refuses a missing icon outright, so an entry here that
    // the script does not produce is a tree that will not compile.
    const iconScript = readFileSync(path.join(TAURI, "scripts", "icons.mjs"), "utf8");
    const written = iconScript.match(/const SIZES = \[([^\]]*)\]/);
    if (!written) throw new Error("icons.mjs no longer declares SIZES");
    const sizes = written[1].split(",").map((size) => size.trim());
    for (const icon of config.bundle.icon) {
      // The two CONTAINER formats: Windows reads an .ico out of the embedded
      // resource, and a macOS bundle reads icon.icns and nothing else. Neither
      // is one of the PNGs, and a build missing either is a blank icon rather
      // than an error.
      if (icon === "icons/icon.ico") {
        expect(iconScript).toContain("ICO_PATH");
        continue;
      }
      if (icon === "icons/icon.icns") {
        expect(iconScript).toContain("ICNS_PATH");
        continue;
      }
      const size = icon.match(/^icons\/(\d+)x\1\.png$/)?.[1];
      expect(size, `${icon} is not a square PNG under icons/`).toBeTruthy();
      expect(sizes).toContain(size);
    }
  });

  it("declares the App Store category the Mac shelf is picked from", () => {
    // `bundle.category` becomes LSApplicationCategoryType, which is what the
    // Mac App Store files the app under. Absent, the upload is rejected.
    expect(config.bundle.category).toBeTruthy();
  });
});

describe("the macOS menu bar", () => {
  // The bar is `tauri/shell/src/menu.rs`, and every row that reaches the game
  // does it by sending a WORD the page has to be listening for. Neither side
  // can import the other, so this is where the two lists are held together —
  // a word added on one side alone is a menu row that silently does nothing.
  const rustMenu = readFileSync(path.join(TAURI, "shell", "src", "menu.rs"), "utf8");

  it("presses the game's buttons on the event shell-host.ts listens on", () => {
    expect(rustConst(rustConfig, "SHELL_COMMAND")).toBe(SHELL_COMMAND);
  });

  it("sends only words the page answers, and every word it answers", () => {
    const sent = [...rustMenu.matchAll(/Target::Page\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(sent.length).toBeGreaterThan(0);
    expect([...sent].sort()).toEqual([...SHELL_COMMANDS].sort());
  });

  it("sends the player to the same website identity.ts names", () => {
    // The Help menu is the one part of the shell that points OUT, and the two
    // pages it offers are the two the store listing has to name as well.
    expect(rustConst(rustConfig, "SITE_URL")).toBe(SITE_URL.replace(/\/$/, ""));
    expect(rustMenu).toContain('Target::Link("/privacy/")');
    expect(rustMenu).toContain('Target::Link("/support/")');
  });
});
