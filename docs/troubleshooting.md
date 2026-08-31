# Troubleshooting

## Installing / building

**`npm install` fails with 401/403 on `@niclaslindstedt/oss-framework`.**
Your GitHub Packages token is missing, expired, or lacks `read:packages`. See [configuration.md](configuration.md). Note npm reads `~/.npmrc` — a token exported only as an env var is not enough locally.

**`npm install` fails on `E404 @niclaslindstedt/oss-framework`.**
The committed `.npmrc` (scope → `npm.pkg.github.com`) didn't apply — run npm from the repo root, not a parent directory.

**`make lint` / `make test` pass locally but CI disagrees.**
Check Node major (`.nvmrc` says 24; ≥22 works) and that you ran the Make target, not a bare tool — the targets chain typechecks the bare tools skip.

## Playing

**Black or empty canvas.**
The renderer needs WebGL2. Check `chrome://gpu`, disable GPU-blocking extensions, or try another browser. If the page loads but the canvas errors, the console will name the failure — file it with the stage seed.

**The game feels slow / choppy on the phone.**
The engine steps at a fixed 60 Hz regardless of frame rate, so physics stays correct; choppiness is render-bound. Close other tabs, and prefer the installed (home-screen) app — browsers throttle busy tabs.

**Stale version after a deploy.**
Updates are prompt-gated: the new build installs in the background and asks before swapping. If the prompt was dismissed, reload twice, or clear site data for the domain as a last resort.

**Installed app opens the wrong variant (preview vs release).**
The three deploy slots are separate installs with separate identities. Check which slot the tile's name says — "(preview)" / "(branch)" — and install from the slot you want.

**Something looks wrong at one place on a stage, and a seed alone does not find it.**
Switch on **DEVELOPER → DEBUG OVERLAY** (and **GOD MODE** to fly to it), then screenshot it. The REPRO line along the bottom of the overlay is a URL that reopens that exact frame — paste it into a bug report, or into `make debug-shot REPRO='…'` to capture it yourself. Hold Alt while you take the shot to get the game's own HUD out of the way.

**Touch controls don't show on a laptop.**
By design: devices with a fine pointer + hover get keyboard controls only. Touch pads appear on touch devices.

## Developing

**A tuning change made bot sims fail.**
That's the harness working. Read [simulation.md](simulation.md): reproduce with `npm run sim -- --seeds <failing>`, trace with the event log, and either fix the regression or argue the test's world moved — explicitly, in the PR.

**`make screenshots` can't find a browser.**
Install the driver (`npm i --no-save playwright-core`) and point at a Chromium: `CHROMIUM_PATH=/opt/pw-browsers/chromium make screenshots` (that path is preinstalled in Claude web sessions).

**Pre-commit hook rejects CHANGELOG.md.**
Intended — the file is machine-written. Put your note in a `.changes/unreleased/` fragment instead (CONTRIBUTING.md shows the format).
