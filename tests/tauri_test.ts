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

import { APP_DESCRIPTION, APP_NAME } from "../pwa/src/identity.ts";
import { SHELL_GLOBAL } from "../pwa/src/shell-host.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAURI = path.join(ROOT, "tauri");

const config = JSON.parse(
  readFileSync(path.join(TAURI, "src-tauri", "tauri.conf.json"), "utf8"),
) as {
  productName: string;
  mainBinaryName: string;
  identifier: string;
  bundle: { longDescription: string; macOS: Record<string, unknown>; icon: string[] };
};
const rustConfig = readFileSync(path.join(TAURI, "shell", "src", "config.rs"), "utf8");
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
    const written = readFileSync(path.join(TAURI, "scripts", "icons.mjs"), "utf8").match(
      /const SIZES = \[([^\]]*)\]/,
    );
    if (!written) throw new Error("icons.mjs no longer declares SIZES");
    const sizes = written[1].split(",").map((size) => size.trim());
    for (const icon of config.bundle.icon) {
      const size = icon.match(/^icons\/(\d+)x\1\.png$/)?.[1];
      expect(size, `${icon} is not a square PNG under icons/`).toBeTruthy();
      expect(sizes).toContain(size);
    }
  });
});
