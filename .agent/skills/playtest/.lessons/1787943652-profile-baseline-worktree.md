---
title: A BEFORE profile needs a scratch worktree — reverting engine/ in place cannot build, and the counts have a noise floor
date: 2026-08-28
scope: scripts/profile-render.mjs
concepts: [rendering, tooling, harness, baseline, profiling]
---

`make profile` is required before and after a rendering change, and getting
the BEFORE half wrong is easy in two ways.

`npm run build` runs `typecheck:only` over the WHOLE repo, `tests/` included.
So `git checkout origin/main -- engine pwa` to shoot a baseline in place does
not build: the branch's tests reference the branch's engine state, tsc fails,
vite never runs, and the profiler happily meters the `pwa/dist` still sitting
there from the AFTER build. That failure is silent unless you read the build
output — the table it prints looks like a baseline. Build the baseline in a
scratch worktree instead:

```sh
git worktree add -q --detach "$WT" origin/main
ln -s "$PWD/node_modules" "$WT/node_modules"   # deps are hoisted to the root
cd "$WT" && npm run build --workspace pwa      # skips the repo-wide typecheck
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/profile-render.mjs
```

And the counts are not exact. The profiler meters whichever frames it catches
of a moving scene: profiling ONE build twice moved `driving` by 5 draws and
7k triangles. Judge a change against that floor — a couple of draws either way
is noise, not a regression.
