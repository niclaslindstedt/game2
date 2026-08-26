# Platforms

The repository is structured after its sibling game repo, which ships one product through many shells: web/PWA, desktop (Electron and Tauri, including Steam), and native mobile (App Store / Play Store). Sideways adopts the same shape deliberately — the engine is already headless and shell-agnostic — but the horizontal slice ships **one real shell**: the web.

## Today: web / PWA (`pwa/`)

The deployed site IS the product. It is installable (home-screen app on iOS/Android, fullscreen launch), offline-capable (hand-rolled precaching service worker), self-updating (in-app prompt via the oss-framework), and phone-first with full desktop keyboard support. Three deploy slots on [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/):

| Slot        | Serves                                        |
| ----------- | --------------------------------------------- |
| `/`         | The latest release (highest `v*` tag)         |
| `/preview/` | Current `main`, on every push                 |
| `/branch/`  | A feature branch parked via workflow dispatch |

Each slot is a whole build at its own base path with its own install identity, so the three can be installed side by side without fighting over one service-worker scope.

## Next: desktop shells (Steam)

The plan mirrors the sibling repo, where both shells wrap the identical built site:

- **`electron/`** — the shipping desktop wrapper: packaged archives for Windows/macOS/Linux, attached to GitHub Releases by the release workflow; the Steam build is this shell with the Steam capabilities stamped in.
- **`tauri/`** — the comparison shell (install size, cold start), packaged from the same product so the numbers stay honest.

What Sideways needs first: gamepad input in `pwa/src/game/input.ts` (the engine's `CarInput` is already controller-shaped), and a pause surface. The engine needs nothing — it has no DOM or renderer dependencies today.

## Later: native mobile (App Store / Play Store)

A `native/` capacitor-style wrapper around the same site, as in the sibling repo: store metadata generation, achievements/leaderboards mapping (the engine's `RunStats` and event stream are the data source), and the store screenshot pipeline. The PWA already covers the phone experience; the native shell exists for distribution and platform services, not for a different game.

## Deliberate differences from the sibling repo

- **No modding seam.** The sibling ships a data-authored mod SDK; Sideways keeps content as typed data in `engine/game/defs/` for now. If content authoring outgrows TypeScript rows, the path is the sibling's: YAML catalogs in `content/` compiled by a script — the defs modules are already the seam.
- **No multiplayer/server.** Stages are deterministic by seed, so the natural first social feature is asynchronous: shared daily seed (already in), then ghost times — no server shell until then.

When a shell lands, it gets its own top-level directory, its packaging jobs slot into `release.yml` between `release` and a `publish` flag-flip (the sibling's release workflow is the template), and this document stops calling it "next".
