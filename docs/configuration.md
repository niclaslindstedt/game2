# Configuration

Scandinavian Flick has no runtime configuration surface (no accounts, no server); everything below is build-time or repo plumbing.

## GitHub Packages auth (required to install)

`@niclaslindstedt/oss-framework` resolves from `npm.pkg.github.com`, which requires a token even for public reads. The committed `.npmrc` maps the scope; the token lives in **your** `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=<GitHub token with read:packages>
```

- **CI** authenticates with the workflow's `GITHUB_TOKEN` (the workflows request `packages: read`).
- **Claude web sessions** run `.claude/hooks/session-start.sh`, which finds a token in the environment (`NODE_AUTH_TOKEN`, `GITHUB_PAT`, `GH_TOKEN`, `GITHUB_TOKEN` — first match wins), writes it to `~/.npmrc`, and installs dependencies in the background.

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

Every launch is written to `launch.log` in the app's own user-data directory — `%APPDATA%\scanflick` on Windows, `~/Library/Application Support/scanflick` on macOS, `~/.local/share/scanflick` on Linux — with the previous launch kept beside it as `launch.log.prev`. The window's remembered geometry (`window-state.json`) is there too. The player's settings and scores are NOT: those are the webview's own origin-keyed storage, exactly as in a browser.

## The native shell's build environment

Read by the Expo app's own build (`native/`, see [platforms.md](platforms.md)), never by the website's. All optional; `native/.env.example` says where each one comes from.

| Variable               | Meaning                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_GAME_URL` | Points the WebView at a deployed slot instead of the copy of the game bundled inside the app, and skips the local server. Debugging only — a store build that streams the website is the shape App Store guideline 4.2 rejects. |
| `EAS_PROJECT_ID`       | The Expo project the app builds under, until it is pinned in `native/app.config.js`; the `native` workflow reads it from a repository variable of the same name.                                                                |
| `EXPO_TOKEN`           | An Expo access token for non-interactive EAS builds; the `native` workflow reads it from a repository secret of the same name. A laptop uses `eas login` instead.                                                               |

## The deploy slots

`pages.yml` builds three whole sites and merges them into one Pages artifact served at `game2.niclaslindstedt.se` (the custom domain in `pwa/public/CNAME`; DNS is a CNAME on `niclaslindstedt.github.io`, and the repo's Pages settings must say "GitHub Actions" + that domain):

- `/` — the highest `v*` tag (or `main` before the first release), with `VITE_PWA_IGNORE_PATHS` set so its service worker disowns the nested slots.
- `/preview/` — the triggering `main` commit, every push.
- `/branch/` — parked by `workflow_dispatch` with a `branch_ref` input; persisted in the `branch-deploy` orphan branch so ordinary deploys carry it forward until the next dispatch overwrites it.

Each slot's manifest gets a distinct `id`/`scope`/`start_url` and install name, so side-by-side installs don't collide.

## Releases

`release.yml` (manual dispatch; `version-bump.yml` is a thin dispatcher onto it) derives the bump from `.changes/unreleased/` fragments, rewrites every version string via `scripts/update-versions.sh`, collates the CHANGELOG, commits `chore(release): vX.Y.Z`, tags, creates the GitHub Release, and chains into `pages.yml` so `/` serves the new tag immediately. Preview locally with `make bump` and `make changelog VERSION=X.Y.Z`.

## Identity

Name, copy, palette, and URLs live in `pwa/src/identity.ts` and nowhere else; `pwa/index.html` (SEO head), `pwa/public/` (robots/sitemap/llms/CNAME), and the icon generator all follow it. Changing identity means touching those in the same change — AGENTS.md's parity table is the checklist.
