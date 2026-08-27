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
| `GITHUB_SHA` / `GITHUB_RUN_NUMBER` | Provided by CI; baked into the build label the HUD corner and the update toast show.                                                                           |

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
