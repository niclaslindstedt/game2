#!/bin/bash
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
#
# SessionStart hook for Claude Code on the web. Installs the npm dependencies
# and builds the project in the background, so `make lint` / `make test` /
# `make build` work the moment a web session opens — no waiting for a manual
# `npm install` first, and with the first build already paid for.
set -euo pipefail

# Announce async mode: this line must be the first thing on stdout. The
# install then runs in the background while the session starts.
echo '{"async": true, "asyncTimeout": 600000}'

# Only the remote (web) environment needs this. Locally you run the install
# yourself, so bail out rather than doing work behind a developer's back.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"}"

# Prefer `npm install` over `npm ci`: it reuses whatever is already in
# node_modules, so a re-run after the container cache warms is cheap, and it
# never wipes a partially-populated tree.
npm install --no-audit --no-fund

# The screenshot workflow (`make screenshots`) drives a headless Chromium via
# playwright-core. It is deliberately NOT a project dependency — no
# build/test/lint step uses it — but a web session already has the Chromium
# binary preinstalled, so install the small browserless driver here
# (`--no-save`, so package.json / the lockfile stay untouched). Non-fatal:
# only the screenshot tool needs it.
npm install --no-save --no-audit --no-fund playwright-core@1 \
  || echo "session-start: playwright-core install failed — make screenshots" \
          "won't run until it's installed; nothing else needs it." >&2

# Build once while nobody is waiting. Two things come out of it, and both are
# things a session otherwise pays for at the worst moment — the first time it
# wants to look at something:
#
#   The TYPECHECK CACHE (node_modules/.cache/tsc, see tsconfig.json). Nearly
#   all of a cold `tsc` is re-resolving the .d.ts files under node_modules,
#   which is work that has nothing to do with the session's own edits; with
#   it warm, `make build` and `make lint` run in about half the time for the
#   rest of the session.
#
#   `pwa/dist`. The screenshot and profile harnesses both serve it, so
#   without this the first `make screenshots` is a build plus a browser.
#
# Non-fatal on purpose: a session that opens on a branch that does not
# currently compile still has to start, and the error belongs to whoever runs
# the build themselves rather than to the hook.
npm run build \
  || echo "session-start: build failed — the tree may not compile on this" \
          "branch. Nothing here depends on it; run 'make build' to see why." >&2
