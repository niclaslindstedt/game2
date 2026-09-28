// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

import { carModels } from "./models-plugin.ts";
import { appPwa } from "./pwa-plugin.ts";
import { modelSwitch } from "./src/game/model-switch.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The base path is injected by the deploy workflows via VITE_BASE — `/game2/`
// on GitHub Pages, `/` for local dev and preview builds.
const base = process.env.VITE_BASE ?? "/";

// Sibling release channels that live *under* this build's base and must be
// disowned by its service worker (see pwa-plugin.ts `ignorePaths`).
const ignorePaths = (process.env.VITE_PWA_IGNORE_PATHS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// Is this build going INSIDE a store shell — the phone app or the desktop app
// — rather than onto the web? Both shells' `bundle-web.mjs` pass it, on every
// profile. A shell build carries no link back to the source and never names
// the web edition's host: the version stamp prints as text instead of
// linking the commit, and `appPwa` strips the pages' web-only spans.
const shellBuild = process.env.VITE_SHELL_BUILD === "on";

// Build identity for the HUD's build label and the update toast.
const commit =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    } catch {
      return "dev";
    }
  })();
const appVersion = (JSON.parse(readFileSync(here("./package.json"), "utf8")) as { version: string })
  .version;
const buildLabel =
  appVersion +
  (process.env.GITHUB_RUN_NUMBER ? `.${process.env.GITHUB_RUN_NUMBER}` : "") +
  (process.env.GITHUB_SHA ? `+${commit}` : "");

// The update toast's label doubles as the SW-uniqueness salt: a CI build's
// label is unique per deploy; a local build appends a timestamp instead.
const version = process.env.GITHUB_SHA ? buildLabel : `${buildLabel}+${new Date().toISOString()}`;

// The environment files are the repository's root `.env` (`.env.example`
// documents it), read for the client's `import.meta.env` and here alike.
const envDir = here("..");

export default defineConfig(({ mode }) => ({
  base,
  envDir,
  // No size budgets, by owner decision; this only keeps Vite's own warning quiet.
  build: { chunkSizeWarningLimit: 100_000 },
  resolve: {
    alias: {
      "@engine": here("../engine/index.ts"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __COMMIT_SHA__: JSON.stringify(commit),
    __SHELL_BUILD__: JSON.stringify(shellBuild),
  },
  // `appPwa` only applies on build, so dev keeps registering no worker (the
  // app passes `enabled: !import.meta.env.DEV` to `usePwaUpdate`).
  //
  // The runtime is Preact: `@preact/preset-vite` compiles JSX against
  // `preact/jsx-runtime` and aliases `react` / `react-dom` onto
  // `preact/compat`, so the pre-built framework chunks resolve to Preact.
  //
  // `carModels` comes before `appPwa`, so the models it emits are in the
  // bundle the worker's precache list is read off. The MODEL switch is on
  // unless the environment or the root `.env` turns it back
  // (`src/game/model-switch.ts`).
  plugins: [
    preact(),
    tailwindcss(),
    carModels(
      { cars: modelSwitch({ ...loadEnv(mode, envDir, "VITE_"), ...process.env }.VITE_MODEL_CARS) },
      here(".."),
    ),
    appPwa({ base, version, ignorePaths, shell: shellBuild }),
  ],
}));
