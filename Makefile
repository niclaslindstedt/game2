.PHONY: build test lint fmt fmt-check release clean install icons check-seo sim track cars liveries field audition screenshots profile debug-shot shellcheck actionlint changelog bump hooks docs

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
# engine and print the pace / drift / air / respawn table.
sim:
	npm run sim

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

# R29 — the campaign's fourteen rivals as they actually line up: each crew's
# own car in their own paint, in start order. The sheet that says whether a
# field of strangers reads as fourteen teams.
field:
	npm run cars -- --field --out field

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
