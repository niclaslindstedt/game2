<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Steam store assets

The Steamworks half of the submission. The desktop shell (`tauri/`) wraps the
same built site the phone app does, so it describes the same game from the same
authored source. Its WORDS are `native/store/copy.mts`, which is gitignored —
the game is paid on the App Store and open source here — and its RULES (the
genres, the tags, and `notYetShipped`) are
[`native/store/listing.mts`](../../native/store/listing.mts). The
`store-listing` skill carries the craft and a map of every store file.

```sh
make store-preflight                     # what is missing, both storefronts
make store-metadata                      # → steam-listing.md, the page to paste
make store-shots ARGS="--only steam"     # → screenshots/steam-1080/, full-bleed
make desktop                             # → ../release/, the download itself
```

| Path                      | What it is                                       | Committed? |
| ------------------------- | ------------------------------------------------ | ---------- |
| `steam.json`              | The app and depot ids — identifiers, not secrets | yes        |
| `steam-listing.md`        | The store page, compiled from the authored copy  | no (built) |
| `screenshots/steam-1080/` | Five 1920×1080 frames, captioned, full-bleed     | no (built) |
| `capsules/`               | Valve's required capsule art                     | not yet    |

## The page

Generated rather than hand-written, for the reason every other output here is:
the two storefronts describe one game, and a second hand-kept page is a second
place the game's name, version and claims can go stale. Edit the two Steam
strings in `native/store/copy.mts` (or the genres and tags in `listing.mts`)
and run `make store-metadata`.

**`steam.notYetShipped` is the load-bearing field.** Valve reviews the store page
and the build **together**, so a page advertising a feature the shell does not
have is a rejection rather than an aspiration. It lives in the COMMITTED half
for that reason: it is a statement about what the build does, which is exactly
the kind of claim a public repository should be able to check. That list is what the desktop
shell deliberately does not do today — no cloud save, no achievements, no
leaderboards, no Workshop, no multiplayer (see
[`docs/platforms.md`](../../docs/platforms.md)) — and the generator **refuses to
emit a page whose copy mentions any of it.** As the shell grows a feature, drop
its row and the copy is free to say so.

## The screenshots

The same recipes as the App Store set, at Valve's raster and `bleed` rather than
`framed`: every pixel of the game stays 1:1 with the caption over the top edge on
a fade, because Valve's guidance is that a screenshot is gameplay, and the inset
band is a phone store card's shape. The Steam context also shoots with
`hasTouch` **off** — the game gives a touch device its own controls and a mouse
the desktop ones, so a Steam frame taken with touch on advertises the phone
build.

Valve wants at least five. `native/store/README.md` owns the harness and the
loop that chooses each frame's moment.

## The capsule art

Valve requires four images that are **designed, not generated**, and none of them
may be an upscaled icon — a capsule is the game's name set in a picture, which is
a different job from an app mark:

| Image           | Size     | Where it shows                       |
| --------------- | -------- | ------------------------------------ |
| Header capsule  | 920×430  | The top of the store page, wishlists |
| Small capsule   | 462×174  | Search results, lists                |
| Main capsule    | 1232×706 | Front-page and category features     |
| Library capsule | 600×900  | The player's own library, vertical   |

They go in `capsules/` and are committed once they exist (they are authored art,
not build output). `make store-preflight` reports them as outstanding until then.

## The app record

`steam.json` holds the ids. Two things about it are worth knowing before a first
upload:

- **480 is not a default.** It is Spacewar, Valve's shared test app, and
  everything works against it — the build uploads, the achievements report —
  into a sandbox every developer on Steam shares. The preflight fails on it by
  name.
- **A depot per platform.** Without one, that platform's build has nowhere to go.
  Steamworks → App Admin → Depots.

The download itself is `make desktop` (`tauri/scripts/package.mjs`), which is
already what the release workflow runs per platform — see
[`../README.md`](../README.md). Uploading those artifacts to a depot needs
Valve's own `steamcmd` and a build account, neither of which lives in this
repository.
