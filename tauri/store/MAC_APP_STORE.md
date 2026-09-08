<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# The Mac App Store

The third storefront, and the second one that ships **this** tree. `native/` is
the phone app; `tauri/` is the desktop app, so the Mac App Store build and the
Steam download are the same binary with two different wrappers around it.

A Mac App Store build is **not `tauri build` with a different flag**. Four things
separate it from the notarized download in [`README.md`](README.md), and this
page owns all four.

|             | The download (Steam, the website) | The Mac App Store                                   |
| ----------- | --------------------------------- | --------------------------------------------------- |
| Sandbox     | none                              | **required** — `com.apple.security.app-sandbox`     |
| Signed with | Developer ID Application          | **3rd Party Mac Developer** Application + Installer |
| Ships as    | `.dmg`, notarized                 | **`.pkg`**, uploaded                                |
| Icon        | the `.icns`                       | the `.icns`, **plus a layered `.icon` on macOS 26** |

## The listing

Compiled by `make store-metadata` into `mac.config.json` and
`../fastlane/metadata/`, both gitignored. The rules are committed in
[`native/store/listing.mts`](../../native/store/listing.mts) under `mac`; the
**words are not in this repository** — see the `store-listing` skill, which
carries the craft.

The Mac page is a **separate piece of writing** from the phone listing, and the
generator skips it entirely rather than filling it in from the phone's words.
The review notes are why: the phone app's argument is "a local HTTP server
serves a zip inside the bundle", and this app has no server. Its argument is
better and completely different — the site is a **bundled resource served
in-process from a private `game://` scheme**, in a **sandboxed process with no
network entitlement at all**. A reviewer can confirm the second half from the
entitlements in thirty seconds, which is the strongest thing any review note in
this repository can say.

`make store-preflight` reports what is still missing, and marks which items wait
on an App Store Connect record.

## One purchase, or two products

Apple's **universal purchase** sells the Mac app and the iPhone app as one
thing — buy it on a phone, it is on the Mac. It needs both apps to carry the
**same bundle id**, and it can only be turned on while **neither has shipped**.

Today they differ (`se.agilator.scanflick` here, `se.agilator.scandinavianflick`
in `native/app.config.js`), so `make store-metadata` warns on every run until
somebody decides. To take it: set this tree's `identifier` to the phone's and
flip `mac.universalPurchase` in `listing.mts`. Note that the identifier is also
what the WebView keys its storage to, so changing it after a desktop build has
been in anyone's hands orphans their settings and scores.

## The icon

Two icon systems exist on macOS and this app ships for both.

**Up to macOS 15**, the app supplies a finished picture and the system displays
it. That is `icon.icns`, written by `npm --prefix tauri run icons` from the app
mark — masked to Apple's continuous-corner squircle, inset to 824/1024 of its
canvas, lit from above and dropped onto a soft shadow. None of that is
decoration: a Dock icon that fills its canvas with hard corners is instantly
legible as one that was never made for macOS.
[`scripts/lib/mac-icon.mjs`](../scripts/lib/mac-icon.mjs) has the geometry and
the reasoning.

**On macOS 26 (Tahoe)** the system _draws_ the icon instead: a layered `.icon`
is masked, lit, blurred and re-tinted by the compositor for the light, dark,
clear and tinted appearances a player picks in the Dock. It needs **layers**,
not a picture, and `make icons` writes them:

```
tauri/store/icon-layers/background.png   the sky, full bleed, no rounding
tauri/store/icon-layers/foreground.png   the tracks and the car, on transparency
```

Full bleed and square on purpose — the system owns the mask on macOS 26, and a
rounded corner baked into a layer it is about to round again cannot be undone.

Turning those into a `.icon` **needs a Mac**, and it is the one part of this
page that cannot be done from a Linux checkout:

1. Open **Icon Composer** (ships with Xcode 26, also on the Apple Developer
   downloads page).
2. New document; drop `background.png` in as the background layer and
   `foreground.png` above it. Keep it to those two — the format allows at most
   four groups, and this mark is two.
3. Check the **Default, Dark, Clear and Tinted** previews. The mark is a light
   car and yellow tracks on a blue sky, so Dark and Tinted are the two worth
   looking at.
4. Export to `Scandinavian Flick.icon`.
5. Compile it and put it in the bundle:
   ```sh
   xcrun actool "Scandinavian Flick.icon" \
     --compile <output-dir> --app-icon "Scandinavian Flick" \
     --platform macosx --minimum-deployment-target 26.0 \
     --output-partial-info-plist /tmp/icon.plist
   ```
   The resulting `Assets.car` goes in `Contents/Resources/`, and
   `CFBundleIconName` in the Info.plist names it.

**Ship both.** macOS 26 prefers the `Assets.car` and every older system reads
only the `.icns`, so the two do not fight. Shipping only the `.icns` is not a
bug on Tahoe — it is an icon that stays flat while its neighbours pick up the
glass.

## The menu bar

The desktop shell draws a real macOS menu bar
([`tauri/shell/src/menu.rs`](../shell/src/menu.rs) is every row). This matters
here specifically: an app that declares no menu still gets one, bare, carrying
its name and a Quit — and that is what a reviewer sees first. An empty bar reads
as a web page in a frame, which is the exact reading guideline 4.2 is about.

Every row presses a button the game already has. The one row whose absence would
be a _bug_ rather than a rough edge is **Edit**: without it the responder chain
never offers Cut/Copy/Paste, and the high-score board asks the player to type a
name.

## Building and uploading

```sh
npm --prefix tauri run mac:appstore   # the entitlements + the config overlay
npm --prefix tauri run mac:steps      # …and the Mac-only run-through, printed
```

The entitlements are **generated, not committed**: they name the Apple team,
which identifies one developer account, and this repository is public. The team
comes from `APPLE_TEAM_ID` in the gitignored `native/.env`, exactly as the iOS
device build's does.

Then, on a Mac, `npm --prefix tauri run mac:steps` prints the rest: the
`cargo tauri build --config tauri.appstore.conf.json`, the two certificates, the
`productbuild`, and the `altool` upload.

## What most often comes back rejected

- **A missing `LSApplicationCategoryType`.** `tauri.conf.json`'s `category`
  supplies it (`"Racing Game"` → `public.app-category.racing-games`), and
  `tests/tauri_test.ts` holds it.
- **An unsandboxed helper.** Everything in the bundle is signed with the
  entitlements above, or the whole upload is refused.
- **Guideline 4.2, on a WebView-shaped app.** Answered in the review notes, and
  the answer here is the sandbox — see above. If it is rejected anyway, do not
  argue: point at the app running with the network off.
