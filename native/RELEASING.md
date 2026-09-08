<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Releasing to the App Store and Google Play

The run-through for putting Scandinavian Flick on the phone stores. The Steam
half is [`../tauri/store/README.md`](../tauri/store/README.md); the listing
package itself is [`store/README.md`](store/README.md).

**Start here, at any point:**

```sh
make store-preflight              # everything, with what waits on a store record marked
make store-preflight ARGS="--now" # only what this checkout can finish today
```

It reads the tree and says which specific thing is missing and where to get it.
Nothing in it uploads or touches the network. Run it before reading further —
most of this document is a list of things it will tell you the state of.

## 0. What is a gate, and what is not

The single most useful thing to understand before starting: **most of the
submission cannot be started until a store record exists, and the store record
cannot be created until an account is enrolled.** Enrolling an organization means
Apple verifying a legal entity against Dun & Bradstreet, which takes weeks and
sometimes months, and a stale D&B record is corrected on D&B's timetable rather
than yours.

So the work splits in two, and the preflight marks the split:

**Doable today, and every one of them is something the submission stalls on
afterwards:**

- The listing copy and the review notes (`store/copy.mts`, gitignored — load
  the `store-listing` skill), and the age-rating answers (`store/listing.mts`).
- The privacy policy and support pages (`pwa/public/privacy/`, `support/`).
  Apple fetches the privacy URL before review opens the app.
- The screenshot set, both storefronts (`make store-shots`).
- The icon set and the share card (`make icons`).
- The bundled site the app ships (`make native-bundle`).
- The review contact phone number, in `native/.env`.
- Steam's capsule art, which is designed and takes a person rather than a
  command.

**Gated on the record:** the numeric Apple app id, the team id, the App Store
Connect API key, the Play service account, every console questionnaire, and the
Steamworks app and depot ids.

`ARGS="--now"` is the first list. Do all of it while the enrollment runs.

## 1. Create the app records

**Apple.** [App Store Connect](https://appstoreconnect.apple.com) → Apps → **+**.

- **Bundle ID** must be the one `app.config.js` already declares:
  `se.agilator.scandinavianflick`. It is on the publisher's domain rather than
  the author's because Agilator AB holds the store agreements, and it is
  **unchangeable** once a record ships under it.
- **SKU** is yours and never shown; the slug is fine.
- Creating the record assigns the numeric **Apple ID** (the `id##########` in the
  App Store URL). Paste it into `eas.json` → `submit.production.ios.ascAppId`,
  and the ten-character team id from the developer portal's Membership page into
  `appleTeamId`. Both are public identifiers and both are committed.

**Play.** [Play Console](https://play.google.com/console) → Create app. Same
package name. Play wants the Data safety form and a content rating before a
release can be reviewed at all.

**The API key, not an Apple ID.** App Store Connect → Users and Access →
Integrations → App Store Connect API → a key with the **App Manager** role. The
`.p8` downloads exactly once. A key rather than an Apple ID because a `.p8`
carries no 2FA session to expire in the middle of a forty-minute upload. Put
`ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH` in `native/.env` — see
[`.env.example`](.env.example), and note that `eas submit` reads the **process**
environment while fastlane reads the file, so export them for the former.

**One-time Expo link.** `cd native && eas init`, then pin the project id it
prints as `EAS_PROJECT_ID` in `app.config.js`. Until it is pinned the config
reads the environment variable, which is how the CI workflow supplies it.

## 2. Version

Never by hand: `scripts/update-versions.sh` owns the version, and the release
workflow runs it. The app's marketing version tracks the game's
(`app.config.js` reads the root `package.json`); store **build numbers** are
auto-incremented by EAS (`autoIncrement` in `eas.json`), so a rejected build can
be resubmitted without touching the repository.

## 3. Listing metadata and screenshots

```sh
make store-metadata      # compile + validate; fails rather than truncates
make build
make store-shots         # all three rasters
```

`store/README.md` owns both pipelines. Two things about them belong here:

**The review notes are the highest-leverage field in the whole submission.** A
WebView-shaped app is judged under **guideline 4.2 (minimum functionality)**, and
the notes are the argument that this is not a browser pointed at a website: the
entire game ships inside the binary as `assets/webroot.zip` and is served by an
HTTP server on the device, so the app is fully playable in airplane mode from
first launch. `make store-metadata` checks that claim against `app.config.js`
rather than trusting it.

**fastlane is not set up yet.** `native/fastlane/` needs an `Appfile` naming the
same bundle id and the Apple account, plus a `metadata` lane. Until it is,
`eas metadata:push` uploads the text and the screenshots go up by hand in App
Store Connect. The preflight names this.

## 4. Build

```sh
cd native
npm run build:testflight    # bundles the site, then builds on EAS
npm run build:production
```

Every `build:*` script runs `npm run bundle` first, because the app ships
whatever zip is on disk and a stale one is a store build of last week's game.
The `native` GitHub workflow does the same and is **dispatch-only** — EAS minutes
are paid for, so CI never builds the app on a push.

A store build must **not** set `EXPO_PUBLIC_GAME_URL`. A build that streams the
website is exactly the shape guideline 4.2 rejects.

## 5. Submit

```sh
cd native && npm run submit          # eas submit --profile production
```

…or `eas build --profile production --platform all --auto-submit` to do both.
Submitting for review stays a deliberate act.

`release.automaticRelease` is **false** in `listing.mts`: the build is held for a
human to press. A first launch should not go live off a review approval at three
in the morning.

## 6. The console work nobody can automate

- **App Privacy** (Apple) and **Data safety** (Play). The answer is
  **no data collected**, and it is true — settings, campaign progress, score
  boards, ghosts and saved photographs are all in the WebView's own local storage
  and nothing is transmitted. There is no account, no analytics SDK, no
  advertising SDK and no server. `/privacy/` says the same thing, and if that
  ever stops being true, this page and the review notes both become false in the
  same commit.
- The age-rating questionnaire, from the `advisory` answers in `listing.mts`.
- Play's 1024×500 **feature graphic**, which Apple does not want and Play will
  not publish without.

## The review risks, honestly

**Guideline 4.2, minimum functionality.** The real one. A WebView app gets read
as a wrapper around a website unless it is obviously not: the mitigations are
already in the build (the whole game inside the binary, a local HTTP server,
offline from first launch, an audio session the browser cannot give) and the
review notes state each of them. If it is rejected under 4.2, the answer is not
to argue — it is to point at airplane mode.

**Nothing else is close.** There is no account, nothing is sold, no data leaves
the device, and there is no user-generated content or communication of any kind,
so the guidelines that reject most first submissions do not apply. The game is
cars hitting scenery; the age-rating answers say cartoon violence, infrequent,
which is what it is.
