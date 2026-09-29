---
name: update-website
description: "Use when the deployed app's identity-derived content under pwa/ may be stale. Discovers commits since the last website update and refreshes identity, head copy and icons so the built site matches pwa/src/identity.ts, the README, and the docs — and confirms every page still carries noindex."
---

# Updating the Website

**What it holds the site to:** the deployed site IS the product — this is a
webapp-kind project with no separate `website/` tree — and it is **deliberately
not discoverable** (see below). The project publishes a website, which is why
this skill exists.

The site is the game, deployed to GitHub Pages at the `siteUrl` in three slots
(`/` latest release, `/preview/` main, `/branch/` parked feature branch) via
`pages.yml`. What this skill keeps in sync is the shell around the game — the
identity-derived head, the manifest, the icons, and the hand-authored static
pages.

> **THE SITE IS NOT MEANT TO BE FOUND.** There are no size budgets and no SEO
> tooling, by owner decision: every HTML page carries
> `<meta name="robots" content="noindex">`, `robots.txt` allows crawling (a
> crawler has to fetch a page to read its `noindex`) and names no sitemap, and
> there is no `sitemap.xml`, `llms.txt`, canonical link or JSON-LD. The title,
> the meta description and the Open Graph / Twitter tags stay — they make a
> shared link look right. **Do not add a discovery surface back.**

| Surface | Derived from | By |
| --- | --- | --- |
| `index.html` head + `manifest.webmanifest` | `pwa/src/identity.ts` (name, title, description, palette) | `pwa/pwa-plugin.ts` at build time |
| Icons, favicon, `og.png` | `pwa/public/icons/icon.svg` + the palette | `make icons` (`scripts/generate-icons.mjs`) — never hand-edit the PNGs |
| `robots.txt`, `CNAME` | hand-authored in `pwa/public/` | you — `CNAME` tracks `SITE_URL`; `robots.txt` stays `Allow: /` with no `Sitemap:` line |
| `privacy/`, `support/` pages | hand-authored in `pwa/public/` | you — reachable for the stores, and `noindex` like every page |
| Head copy in `pwa/index.html` (title, description, Open Graph) | `identity.ts` strings + README's framing | you — no double authoring: same claims, one voice |
| Identity strings in app code | `pwa/src/identity.ts` | never re-hardcode a brand string |

Two parity rules from `AGENTS.md` ride along: `pwa/public/icons/icon.svg` and
`scripts/generate-icons.mjs` encode the **same mark geometry** — change one,
change both, then `make icons`; and a stale deployed site after
identity/feature changes is a bug, not a nice-to-have.

## Tracking mechanism

`.agents/skills/update-website/.last-updated` contains the git commit hash from
the last successful run. Empty means "never run" — fall back to the initial
commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agents/skills/update-website/.last-updated)
   ```

2. Diff the sources of truth against the baseline:

   ```sh
   git diff --name-only "$BASELINE"..HEAD -- pwa/src/identity.ts README.md docs/ \
     pwa/index.html pwa/public/ scripts/generate-icons.mjs engine/version.ts package.json
   ```

3. If anything changed, walk the mapping table, refresh the affected surfaces,
   and run the checks.

## Mapping table

| Changed file | Effect on website |
| --- | --- |
| `identity.ts` name/title/description | `index.html` head + manifest pick it up at build — but the hand-written head copy in `pwa/index.html` must be re-synced by hand |
| `identity.ts` `SITE_URL` | `CNAME` and the Open Graph URLs — and the deploy-slot config in `pwa/pwa-plugin.ts` / `pages.yml` must still agree |
| `identity.ts` PALETTE | `make icons` — the icons and OG card render from it |
| `pwa/public/icons/icon.svg` | `make icons`, and check `scripts/generate-icons.mjs` still encodes the same mark geometry |
| README / docs feature claims | The head description and the Open Graph copy describe the same game — re-read for drift (new cars, new features, new controls) |
| `engine/version.ts` / `package.json` version | Move only via `scripts/update-versions.sh`; never hand-edit either |

## Update checklist

- [ ] Read baseline and diff sources of truth
- [ ] Re-sync any drifted copy (`pwa/index.html` head)
      against `identity.ts` and the README
- [ ] If the mark or palette changed: `make icons` and commit the regenerated
      art
- [ ] `make build` (warning-free), then smoke-read the built shell
      (`pwa/dist/index.html`: title, description, manifest name, the
      `noindex`) and confirm every `.html` under `pwa/dist` carries `noindex`
      and there is no `sitemap.xml` or `llms.txt`
- [ ] Run `make test`
- [ ] Write the new baseline:

      git rev-parse HEAD > .agents/skills/update-website/.last-updated

## Verification

1. `make build` passes with no warnings, and every page in `pwa/dist` carries
   `noindex`.
2. `pwa/dist/index.html` and the manifest carry the current `identity.ts`
   strings; `CNAME` agrees with `SITE_URL`.
3. `.last-updated` has been rewritten.

## Skill self-improvement

1. **Expand the mapping table** if a new source file started feeding the
   website (operating data — edit it in place).
2. **Record quirks** as lesson fragments — load the **`skill-reflection`**
   skill (`npx ogf-skill-lessons update-website --list`).
3. **Commit the skill edit** alongside the website update.
