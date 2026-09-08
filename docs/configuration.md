# Configuration

Scandinavian Flick has no runtime configuration surface (no accounts, no server); everything below is build-time or repo plumbing.

## Installing

Every dependency resolves from the public npm registry, so `npm install` needs no token and no `~/.npmrc` entry. Claude web sessions run `.claude/hooks/session-start.sh`, which installs and builds in the background so the tooling is ready when the session opens.

## Build-time environment

| Variable                           | Meaning                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_BASE`                        | Deploy base path: `/` (default), `/preview/`, `/branch/`. Drives the SW scope, the manifest identity, and every emitted URL.                                   |
| `VITE_PWA_IGNORE_PATHS`            | Comma-separated absolute paths the built service worker must NOT claim. Only the root slot sets it (`/preview/,/branch/`) so nested slots own their own pages. |
| `GITHUB_SHA` / `GITHUB_RUN_NUMBER` | Provided by CI; baked into the build label the HUD corner and the new-build card show.                                                                         |

## The desktop app's launch environment

The desktop app (`tauri/`, see [platforms.md](platforms.md)) reads three variables at LAUNCH, all optional and all for debugging a build rather than configuring the game:

| Variable       | Meaning                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SF_GAME_URL`  | Load a remote URL instead of the bundled site (e.g. `https://game2.niclaslindstedt.se/preview/`), for debugging the shell against live content. |
| `SF_WEBROOT`   | Serve the site from another directory without rebuilding the app.                                                                               |
| `SF_VERBOSE=1` | Keep the informational log lines in a release build (a debug build prints them anyway). Warnings and errors are never suppressed.               |

Packaging reads one more: `APPLE_SIGNING_IDENTITY`, the Developer ID a macOS build is signed with. Absent, the app is signed ad hoc — enough to run on Apple Silicon, at the cost of one Gatekeeper prompt the release notes explain.

On a runner nobody sets it by hand: `.github/actions/apple-signing` imports a certificate into a throwaway keychain and reads the identity back out of it, so a renewed certificate is one secret to replace rather than two to keep agreeing. Five repository secrets, all optional and all sharing their names with the sibling `game` repo:

| Secret                        | Meaning                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `MAC_CSC_LINK`                | The Developer ID Application certificate as a base64-encoded `.p12` (`base64 -i cert.p12`). |
| `MAC_CSC_KEY_PASSWORD`        | The password that `.p12` was exported with.                                                 |
| `APPLE_ID`                    | The Apple ID the notarization request is made as.                                           |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for it, from appleid.apple.com.                                    |
| `APPLE_TEAM_ID`               | The ten-character Developer Team ID the certificate belongs to.                             |

The first two sign; the last three notarize, and the bundler acts on them only once the app carries a real signature — so half a set signs without notarizing rather than failing. `MAC_SIGN_IDENTITY` overrides the identity read out of the certificate, and is needed only where the keychain holds more than one.

Every launch is written to `launch.log` in the app's own user-data directory — `%APPDATA%\scanflick` on Windows, `~/Library/Application Support/scanflick` on macOS, `~/.local/share/scanflick` on Linux — with the previous launch kept beside it as `launch.log.prev`. The window's remembered geometry (`window-state.json`) is there too. The player's settings and scores are NOT: those are the webview's own origin-keyed storage, exactly as in a browser.

## The native shell's build environment

Read by the Expo app's own build (`native/`, see [platforms.md](platforms.md)), never by the website's. All optional; `native/.env.example` says where each one comes from.

| Variable               | Meaning                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_GAME_URL` | Points the WebView at a deployed slot instead of the copy of the game bundled inside the app, and skips the local server. Debugging only — a store build that streams the website is the shape App Store guideline 4.2 rejects. |
| `EAS_PROJECT_ID`       | The Expo project the app builds under, until it is pinned in `native/app.config.js`; the `native` workflow reads it from a repository variable of the same name.                                                                |
| `EXPO_TOKEN`           | An Expo access token for non-interactive EAS builds; the `native` workflow reads it from a repository secret of the same name. A laptop uses `eas login` instead.                                                               |
| `APPLE_TEAM_ID`        | The Apple team a LOCAL iPhone build (`make native-iphone`) signs with, overriding the publisher's team pinned in `native/app.config.js`. EAS builds ignore it and use the credentials on the Expo project.                      |

## The deploy slots

`pages.yml` builds three whole sites and merges them into one Pages artifact served at `game2.niclaslindstedt.se` (the custom domain in `pwa/public/CNAME`; DNS is a CNAME on `niclaslindstedt.github.io`, and the repo's Pages settings must say "GitHub Actions" + that domain):

- `/` — the highest `v*` tag (or `main` before the first release), with `VITE_PWA_IGNORE_PATHS` set so its service worker disowns the nested slots.
- `/preview/` — the triggering `main` commit, every push.
- `/branch/` — parked by `workflow_dispatch` with a `branch_ref` input; persisted in the `branch-deploy` orphan branch so ordinary deploys carry it forward until the next dispatch overwrites it.

Each slot's manifest gets a distinct `id`/`scope`/`start_url` and install name, so side-by-side installs don't collide.

## Releases

`release.yml` (manual dispatch, and the only entry point) derives the bump from `.changes/unreleased/` fragments, rewrites every version string via `scripts/update-versions.sh`, collates the CHANGELOG, commits `chore(release): vX.Y.Z`, tags, creates the GitHub Release, and chains into `pages.yml` so `/` serves the new tag immediately. Between the tag and the publish, a runner per platform packages the desktop downloads onto the release while it is still a draft — macOS builds both slices, cross-compiling the Intel one, so an Intel Mac is not left with an `aarch64` `.dmg` it cannot open. Preview locally with `make bump` and `make changelog VERSION=X.Y.Z`.

## Identity

Name, copy, palette, and URLs live in `pwa/src/identity.ts` and nowhere else; `pwa/index.html` (SEO head), `pwa/public/` (robots/sitemap/llms/CNAME), and the icon generator all follow it. Changing identity means touching those in the same change — AGENTS.md's parity table is the checklist.
