---
name: update-website
description: "Use when the deployed app's SEO surfaces or identity-derived content under pwa/ may be stale. Discovers commits since the last website update and refreshes identity, metadata, icons, and SEO files so the built site matches pwa/src/identity.ts, the README, and the docs."
---

# Updating the Website

**Governing spec sections:** §11.2 (the deployed site IS the product — this is
a webapp-kind project with no separate `website/` tree), §11.3 (SEO surfaces),
§21.5 (this skill is mandated when the project publishes a website).

The site is the game, deployed to GitHub Pages at the `siteUrl` in three slots
(`/` latest release, `/preview/` main, `/branch/` parked feature branch) via
`pages.yml`. What this skill keeps in sync is the shell around the game — the
identity-derived head, the manifest, the icons, and the hand-authored SEO
files:

| Surface                                          | Derived from                                               | By                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `index.html` head + `manifest.webmanifest`       | `pwa/src/identity.ts` (name, title, description, palette)  | `pwa/pwa-plugin.ts` at build time                                      |
| Icons, favicon, `og.png`                         | `pwa/public/icons/icon.svg` + the palette                  | `make icons` (`scripts/generate-icons.mjs`) — never hand-edit the PNGs |
| `robots.txt`, `sitemap.xml`, `llms.txt`, `CNAME` | hand-authored in `pwa/public/`, anchored to the `SITE_URL` | you — keep them agreeing with `identity.ts`                            |
| SEO copy in `pwa/index.html`                     | `identity.ts` strings + README's framing                   | you — §11.2's no-double-authoring rule: same claims, one voice         |
| Identity strings in app code                     | `pwa/src/identity.ts`                                      | never re-hardcode a brand string                                       |

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

| Changed file                                 | Effect on website                                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity.ts` name/title/description         | `index.html` head + manifest pick it up at build — but the hand-written SEO copy in `pwa/index.html` and `llms.txt` must be re-synced by hand |
| `identity.ts` `SITE_URL`                     | `sitemap.xml`, `robots.txt`, `CNAME`, canonical URLs — and the deploy-slot config in `pwa/pwa-plugin.ts` / `pages.yml` must still agree       |
| `identity.ts` PALETTE                        | `make icons` — the icons and OG card render from it                                                                                           |
| `pwa/public/icons/icon.svg`                  | `make icons`, and check `scripts/generate-icons.mjs` still encodes the same mark geometry                                                     |
| README / docs feature claims                 | The SEO description and `llms.txt` describe the same game — re-read for drift (new cars, new features, new controls)                          |
| `engine/version.ts` / `package.json` version | Move only via `scripts/update-versions.sh`; never hand-edit either                                                                            |

## Update checklist

- [ ] Read baseline and diff sources of truth
- [ ] Re-sync any drifted copy (`pwa/index.html` head, `pwa/public/llms.txt`)
      against `identity.ts` and the README
- [ ] If the mark or palette changed: `make icons` and commit the regenerated
      art
- [ ] `make check-seo` — builds and runs the structural SEO/PWA/bundle
      assertions over `pwa/dist` (`scripts/check-seo.mjs`)
- [ ] Smoke-read the built shell (`pwa/dist/index.html`: title, description,
      manifest name, canonical URL)
- [ ] Run `make test`
- [ ] Write the new baseline:

      git rev-parse HEAD > .agents/skills/update-website/.last-updated

## Verification

1. `make check-seo` passes.
2. `pwa/dist/index.html` and the manifest carry the current `identity.ts`
   strings; `sitemap.xml`/`robots.txt`/`CNAME` agree with `SITE_URL`.
3. `.last-updated` has been rewritten.

## Skill self-improvement

1. **Expand the mapping table** if a new source file started feeding the
   website (operating data — edit it in place).
2. **Record quirks** as lesson fragments — load the **`skill-reflection`**
   skill (`node scripts/skill-lessons.mjs update-website --list`).
3. **Commit the skill edit** alongside the website update.
