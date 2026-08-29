.PHONY: build test lint fmt fmt-check release clean install icons check-seo sim heat record replay track cars liveries field crew items items-list sky glyphs audition screenshots profile debug-shot shellcheck actionlint changelog bump hooks docs

build:
	npm run build

test:
	npm test

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

# Regenerate the PWA install icons, favicon, and the Open Graph image from
# the app mark (keep pwa/public/icons/icon.svg in lockstep).
icons:
	npm run icons

check-seo:
	npm run build && npm run check:seo

# Headless balance sweep: bots drive generated stages through the real
# engine and print the pace / drift / air / respawn / damage table.
sim:
	npm run sim

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

# Render the menu's glyphs to a contact sheet at the three sizes they are
# read at (previews/glyphs.png). A mark is judged small — see the header of
# pwa/src/tools/glyph-preview.tsx.
glyphs:
	npm run glyphs

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
# debug overlay and this captures that exact frame, plus the overlay's rows
# as text. The before/after tool for anything reported with a picture.
# `make debug-shot REPRO='?seed=42&…' OUT=before`
debug-shot:
	@test -n "$(REPRO)" || { \
		echo "usage: make debug-shot REPRO='<repro line from the debug overlay>' [OUT=name]"; \
		exit 2; \
	}
	node scripts/debug-shot.mjs '$(REPRO)' $(if $(OUT),--out $(OUT),)

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
