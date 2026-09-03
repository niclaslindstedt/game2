.PHONY: build test lint fmt fmt-check release clean install icons check-seo sim drift roll heat record replay track level analyze previews routes biomes cars liveries field crew items items-list sky traffic glyphs transit views audition screenshots profile debug-shot native-install native-bundle native-typecheck native-ios native-android shellcheck actionlint changelog bump hooks docs tauri tauri-test tauri-lint tauri-fmt desktop

build:
	npm run build

# The vitest suite. SHARD=i/N runs only the i-th of N slices of the test
# FILES — how CI fans the suite out across runners (ten of them); a bare
# `make test` is still the whole thing, and stays the definition of green.
#
# Sharding splits at file granularity, so the SLOWEST SINGLE FILE is the
# floor and more runners cannot get under it. Keeping that floor down is
# what keeps the fan-out worth having: a rule suite shares one corpus of
# built stages through tests/support/stages.ts rather than rebuilding it
# per rule, and a file whose subject is really two gets split.
test:
	npm test -- $(if $(SHARD),--shard=$(SHARD),)

lint:
	npm run lint

fmt:
	npm run fmt

fmt-check:
	npm run fmt:check

release:
	npm run build

clean:
	rm -rf pwa/dist node_modules pwa/node_modules previews

install:
	npm install

# Regenerate the PWA install icons, favicon, the Open Graph image and the
# native app's icon set from the app mark (keep pwa/public/icons/icon.svg in
# lockstep).
icons:
	npm run icons

# THE NATIVE APP (native/): the App Store / Play Store shell — an Expo
# WebView over a copy of the site bundled inside the app. Outside the npm
# workspace, with a dependency tree of its own, so it is installed on its
# own. `native-bundle` builds the website and packs it into the zip the app
# serves; every device build and every EAS build wants a fresh one first.
native-install:
	npm run native:install

native-bundle:
	npm run native:bundle

native-typecheck:
	npm run native:typecheck

native-ios:
	npm run native:ios

native-android:
	npm run native:android

check-seo:
	npm run build && npm run check:seo

# Headless balance sweep: bots drive generated stages through the real
# engine and print the pace / drift / air / respawn / damage table.
sim:
	npm run sim

# THE DRIFT LAB — every corner the generator can build (and the sequences
# that catch a car out), driven through by every technique a driver has, on
# a scripted fixture rather than the bot. Prints the table and draws
# previews/drift-<car>.png: the car every sixth of a second with its travel
# arrow, so the slip angle is something you LOOK at rather than infer.
# Required before/after any change to the drift model.
# `make drift CAR=compact` · `make drift ARGS="--surface asphalt --table"`
drift:
	npm run drift -- $(if $(CAR),--car $(CAR),) $(if $(CORNERS),--corners $(CORNERS),) $(ARGS)

# THE ROLL LAB — a car going OVER, drawn from behind: the hull's own
# outline every sixth of a second along the ground it crossed, with the
# corner it is pivoting about marked on each one, plus what each roll cost
# the car. `make drift` shows what a car does before it goes over; this is
# the roll itself. Required before/after any change to the roll model — a
# body spinning about a fixed point under its middle draws a stack of
# outlines in one place, and only a picture shows that.
# `make roll CAR=coupe` · `make roll ARGS="--seeds=4,5"`
roll:
	npm run roll -- $(if $(CAR),--car=$(CAR),) $(ARGS)

# Record a bot run to a run tape (runs/*.jsonl): a whole drive written down
# as the controls that drove it. `make record SEED=42 CAR=compact
# DIFFICULTY=hard OUT=runs/ref.jsonl`
record:
	npm run tape -- record $(if $(SEED),--seed $(SEED),) $(if $(CAR),--car $(CAR),) \
		$(if $(DIFFICULTY),--difficulty $(DIFFICULTY),) $(if $(LENGTH),--length $(LENGTH),) \
		$(if $(OUT),--out $(OUT),) $(ARGS)

# Replay a run tape and place its time against each field — the difficulty
# calibration. RUN is the file, off `make record` or the game's SAVE RUN DATA
# button (developer menu → COLLECT RACE DATA).
# `make replay RUN=runs/my-run.jsonl DIFFICULTY=easy,medium,hard`
replay:
	@test -n "$(RUN)" || { \
		echo "usage: make replay RUN=runs/<file>.jsonl [DIFFICULTY=easy,medium,hard]"; exit 2; \
	}
	npm run tape -- replay $(RUN) $(if $(DIFFICULTY),--difficulty $(DIFFICULTY),) $(ARGS)

# The other half of the same instrument: the whole grid down one road AT
# ONCE, and what the crews do to each other on the way. `make sim` drives a
# car alone, so the bot's traffic eyes and the field's tempers never fire in
# it — this is the table that measures them.
heat:
	npm run sim -- --heat

# Render generated stages to previews/track-<seed>.png for eyeballing the
# rules engine's output.
track:
	npm run track

# THE LEVEL MAP: one stage top down, annotated and described, from the
# engine alone — no build, no browser. Every call, jump, crest, ford,
# bridge, split board and junction gets an id (T3, J1, CP2) on the picture
# and a row in the table, so a claim about "the first jump on level 1" is
# about J1 in previews/level-taiga-1.png. FOCUS= re-frames around one id.
# `make level LEVEL=1` · `make level LEVEL=1 FOCUS=J1 SPAN=160`
# `make level SEED=38 LENGTH=short` · `make level LEVEL=3 ARGS=--json`
level:
	npm run level -- $(if $(LEVEL),--level $(LEVEL),) $(if $(SEED),--seed $(SEED),) \
		$(if $(LENGTH),--length $(LENGTH),) $(if $(SHAPE),--shape $(SHAPE),) \
		$(if $(FOCUS),--focus $(FOCUS),) $(if $(SPAN),--span $(SPAN),) $(ARGS)

# THE CAMPAIGN MENU'S PREVIEWS: what a stage box and a location row show of
# the road and the country before either is driven. Both halves are built
# from the generator and COMMITTED, because deriving one costs between 60 ms
# and ten seconds a stage and a menu cannot spend that while somebody is
# looking at it. Re-run after any generator change — a stale preview is a
# picture of a road nobody drives any more.
previews: routes biomes

# The stage boxes' routes: every campaign stage's road, simplified and
# quantised into pwa/src/game/stage-routes.ts (~4 KB for the campaign) and
# stroked as an SVG path by the menu. Pure Node, no browser, ~13 s.
routes:
	npm run routes

# The location rows' banners: a REAL RENDER of each country, taken by the
# game from 200 m over its first stage's start line, into
# pwa/public/previews/. A location is six roads, so it gets a photograph of
# the place rather than a map of any one of them.
# Needs a built pwa/dist (run `make build` first) and the same Chromium as
# `make screenshots`. `LIFT=` and `TILT=` move the camera; `OUT=previews`
# puts a set somewhere to compare instead of somewhere to ship.
biomes:
	npm run biomes -- $(if $(LIFT),--lift $(LIFT),) $(if $(TILT),--tilt $(TILT),) \
		$(if $(OUT),--out $(OUT),) $(ARGS)

# SCORE generated stages instead of looking at them: the rollers over the
# road surface, the water's flow, the road network, drivability, the jumps,
# the two ends, the ground's layers, and what the whole thing COST to build.
# The measuring half of the generator loop — `make track` is the looking
# half. Exits non-zero on any error finding.
# `make analyze SEEDS=7` · `make analyze COUNT=24 ARGS=--checks`
analyze:
	npm run analyze -- $(if $(SEEDS),--seeds $(SEEDS),) $(if $(COUNT),--count $(COUNT),) \
		$(if $(LENGTH),--length $(LENGTH),) $(if $(SHAPE),--shape $(SHAPE),) $(ARGS)

# Render the car models to a labeled contact sheet (previews/cars.png):
# the chase-cam gaming angle plus turntable views, for the car-design
# iteration loop. Same Chromium requirements as `screenshots`.
cars:
	npm run cars

# Render one body in the field's paint schemes (previews/liveries.png) —
# the sheet that says whether a start list reads as a field of different
# cars or as one car nine times. CAR picks the body, COUNT how many slots.
liveries:
	npm run cars -- --liveries $(or $(CAR),compact) --count $(or $(COUNT),9) --out liveries

# The sixteen crew characters (previews/crew.png): each one close up in the
# cabin with the glass off, then through it, then from the chase camera —
# the sheet that says whether the fat one reads as the fat one. CREW picks a
# subset (CREW=blink,diesel), CAR the body they are sat in.
crew:
	npm run cars -- --crew $(CREW) --out crew $(if $(CAR),--car $(CAR),)

# R29 — the campaign's fourteen rivals as they actually line up: each crew's
# own car in their own paint, in start order. The sheet that says whether a
# field of strangers reads as fourteen teams.
field:
	npm run cars -- --field --out field

# Photograph ONE THING at a time (previews/items.png): a row per item, a
# column per view, every row fitted to its own item and standing on a metre
# grid. The review surface for everything a run screenshot passes too fast
# to show — a stone, a fern, the cabin behind the glass. ITEMS picks the
# rows, GROUP a whole kind, TURNTABLE the number of seats to walk round.
# `make items ITEMS=interior TURNTABLE=8 OUT=cabin`
items:
	npm run items -- $(if $(ITEMS),--items $(ITEMS),) $(if $(GROUP),--group $(GROUP),) \
		$(if $(TURNTABLE),--turntable $(TURNTABLE),) $(if $(SEASON),--season $(SEASON),) \
		$(if $(CAR),--car $(CAR),) $(if $(OUT),--out $(OUT),)

# Every item the sheet knows how to stand up, by group.
items-list:
	npm run items -- --list

# Render the sky to a labeled contact sheet (previews/sky.png): every
# weather against every time of day, plus a caught lightning strike. The
# review surface for anything about the atmosphere — a run screenshot can
# only ever show one sky, and a flash lasts a fifth of a second. Same
# Chromium requirements as `screenshots`.
sky:
	npm run sky

# Photograph the HIGH TRAFFIC over a stage (previews/traffic.png): five
# skies down, four moments of the same race across — the grid, twenty
# seconds, a minute, the flag. What it reviews is a RATE (do a few aircraft
# come over, and does their wake build a sky), which no screenshot of a run
# carries. Same Chromium requirements as `screenshots`.
traffic:
	npm run traffic

# Render the menu's glyphs to a contact sheet at the three sizes they are
# read at (previews/glyphs.png). A mark is judged small — see the header of
# pwa/src/tools/glyph-preview.tsx.
glyphs:
	npm run glyphs

# Photograph the camera leaving the finish line for a crew still out on the
# stage (previews/transit.png) — CONSECUTIVE frames, so what is judged is
# whether each one belongs beside the last. REQUIRED before/after any change
# to the transit or to what it lands in. `OUT=` names the sheet. Same
# Chromium requirements as `screenshots`.
transit:
	npm run transit

# Photograph the CAMERA KEY being pressed, at every step of the ladder
# (previews/views.png) — six consecutive frames per step, with the lens's own
# reading under each, so a frame that does not belong beside the last shows
# up as one big number in a column of small ones. REQUIRED before/after any
# change to how one view hands over to the next. `OUT=` names the sheet.
# Same Chromium requirements as `screenshots`.
views:
	npm run views

# Build the audio review page: every sound in the bank on a button, both
# scores under the real sequencer with per-voice mutes, and the continuous
# road bed under sliders. Self-contained HTML — open it, or publish it so
# somebody else can hear what changed.
audition:
	npm run audition

# Drive the built app headlessly and screenshot the moments that matter
# (grid, speed, drift, hood cam, portrait). Needs `npm i --no-save
# playwright-core` and a Chromium (CHROMIUM_PATH overrides discovery).
screenshots:
	node scripts/screenshot.mjs

# Meter what one frame costs the renderer: draw calls, triangles, program
# and texture binds, per scene. Same Chromium requirements as
# `screenshots`. Run it before and after any rendering change.
profile:
	npm run profile

# Stand where a screenshot was taken: paste the REPRO line off the in-game
# debug overlay — or off the developer map's COPY DEBUG INFO button — and
# this captures that exact frame, plus the page's own rows as text. The
# before/after tool for anything reported with a picture.
# `make debug-shot REPRO='?seed=42&…' OUT=before`
# `make debug-shot REPRO='?seed=42&roam=1&…' ARGS=--drive`  (from the road)
debug-shot:
	@test -n "$(REPRO)" || { \
		echo "usage: make debug-shot REPRO='<repro line>' [OUT=name] [ARGS='--drive --portrait']"; \
		exit 2; \
	}
	node scripts/debug-shot.mjs '$(REPRO)' $(if $(OUT),--out $(OUT),) $(ARGS)

# ---------------------------------------------------------------------------
# The desktop app (tauri/)
# ---------------------------------------------------------------------------
#
# A thin wrapper around the same built website, for Windows, macOS and Linux
# — `tauri/README.md` is the tree, `docs/platforms.md` is where it sits. It is
# Rust, so it has its own toolchain and its own linter, and none of it is on
# the root suite's path: `make test` and `make lint` stop at this tree's edge.
# These targets are how it is checked; `.github/workflows/desktop-tauri.yml`
# runs them on every push that touches it.

# Build the site into tauri/webroot/, compile the shell, and launch it.
tauri:
	npm run tauri -- $(ARGS)

# The decision layer's whole test suite, and DELIBERATELY only that crate:
# `scanflick-shell` depends on no GUI toolkit, so this target runs on an
# ordinary CI runner with a Rust toolchain and nothing else. The app crate has
# no tests of its own by design (every decision lives in the library), and
# compiling it needs the platform's webview development libraries — which is
# what `make tauri-lint` and `make tauri` are for.
tauri-test:
	npm run tauri:test

# clippy at zero warnings, the peer of `make lint` for this tree. This one DOES
# need the webview libraries: it checks both crates.
tauri-lint:
	npm run tauri:lint

# rustfmt in place, the peer of `make fmt`.
tauri-fmt:
	npm run tauri:fmt

# Package this machine's desktop downloads into tauri/release/ — the release
# workflow's per-platform job, runnable by hand. `ARGS="--target <triple>"`
# for an explicit target.
desktop:
	npm run tauri:package -- $(ARGS)

shellcheck:
	shellcheck scripts/*.sh .githooks/* .claude/hooks/*.sh

actionlint:
	actionlint -color

# Install the repo's git hooks (pre-commit fmt/lint checks, conventional
# commit message lint).
hooks:
	git config core.hooksPath .githooks
	@echo "git hooks installed (core.hooksPath = .githooks)"

docs:
	@echo "see docs/"

# Local preview of what the release workflow will write to CHANGELOG.md.
# Pass the planned version: `make changelog VERSION=0.2.0`. Consumes the
# fragments in .changes/unreleased/ — run inside a scratch branch or
# revert afterwards if you only wanted a preview.
changelog:
	@test -n "$(VERSION)" || { \
		echo "usage: make changelog VERSION=X.Y.Z"; exit 2; \
	}
	node scripts/release/collate-changelog.mjs $(VERSION)

# Print the semver bump (patch/minor/major) the release workflow will
# auto-derive from the current .changes/unreleased/ fragments. Read-only.
bump:
	@node scripts/release/compute-bump.mjs
