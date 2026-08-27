// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import { appPwa } from "./pwa-plugin.ts";

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

export default defineConfig({
  base,
  resolve: {
    alias: {
      "@engine": here("../engine/index.ts"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __COMMIT_SHA__: JSON.stringify(commit),
  },
  // `appPwa` only applies on build, so dev keeps registering no worker (the
  // app passes `enabled: !import.meta.env.DEV` to `usePwaUpdate`).
  //
  // The runtime is Preact: `@preact/preset-vite` compiles JSX against
  // `preact/jsx-runtime` and aliases `react` / `react-dom` onto
  // `preact/compat`, so the pre-built framework chunks resolve to Preact.
  plugins: [preact(), tailwindcss(), appPwa({ base, version, ignorePaths })],
});
