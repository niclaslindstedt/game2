<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Releasing the desktop app

The desktop app ships three ways, and all three are cut from the same tagged
commit the website and the phone app are — never from `main`:

| Channel                      | What it is                                                                                   | Built by                                             | The rest of the story                              |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| **GitHub Release downloads** | the web edition wrapped for the desktop: a `.dmg`, a `.deb` + `.AppImage`, an NSIS installer | `release.yml`'s `desktop` matrix, on every release   | this file                                          |
| **Mac App Store**            | the same app, sandboxed and signed for the store, shipped as a `.pkg`                        | `make mac-appstore`, by hand on a Mac                | [`store/MAC_APP_STORE.md`](store/MAC_APP_STORE.md) |
| **Steam**                    | the downloads, uploaded to a depot per platform                                              | `make desktop` per platform, then Valve's `steamcmd` | [`store/README.md`](store/README.md)               |

A download from a GitHub Release is not a store build: it claims nothing only a
store provides.

## 0. Once, before the first release

- **The identity.** `tauri.conf.json` commits the development identifier
  (`dev.local.scandinavianflick`). A release packages under `APP_BUNDLE_ID` (and,
  optionally, `APP_DISPLAY_NAME`) from the repository's secrets, and
  `release.yml` passes `--require-identity`, so it refuses to package under the
  development id. The identifier is where the webview keeps the player's
  progress: once a download has shipped, changing it strands every installed
  copy's saves, so it is fixed per deployment and a move is a migration.
- **Signing and notarization.** Without the Apple secrets a macOS build is
  signed ad hoc and Gatekeeper refuses its first launch once (the release notes
  tell the player how past it). With `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`,
  `MAC_SIGN_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
  `APPLE_TEAM_ID` set, `.github/actions/apple-signing` imports the Developer ID
  certificate and the build is signed and notarized — in `release.yml` and in
  `desktop-tauri.yml`'s dispatch alike. [`../docs/configuration.md`](../docs/configuration.md)
  has the table. Setting secrets is the owner's job.

## 1. Prove it before you tag

Dispatch `desktop-tauri.yml` for one platform. It packages exactly as a release
does — same script, same signing environment — without cutting a version, so a
certificate or a packaging change is proved before a version is tagged rather
than after. Locally, `make desktop` packages this machine's downloads into
`tauri/release/`.

## 2. Release

Dispatch `version-bump.yml`. It checks `main`, the tree and the version the
changeset fragments add up to, then calls `release.yml`, which tags the
release, creates it as a **draft**, packages every platform onto it (macOS
builds both slices, cross-compiling the Intel one), and publishes it only once
every download is attached. A Windows packaging failure therefore leaves a
draft, never a public release with a missing download.

## 3. The stores

The Mac App Store and Steam builds are cut from the same tag, by hand, by the
owner — follow the two documents in the table above. Uploading is an outward
action; nothing in this repository uploads a build on its own.

## What fails quietly

- **A stale site inside the app.** `scripts/bundle-web.mjs` copies whatever
  `pwa/dist` holds; `make desktop` rebuilds it first, and a hand-run
  `tauri build` does not.
- **A source link in a store build.** The bundle scripts refuse a webroot that
  still names the source repository; a build that trips it was built without
  `VITE_SHELL_BUILD=on`.
- **The identifier moving.** See §0 — the saves stay behind under the old one.
