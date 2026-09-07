---
title: Timing a UI change from a page-side rAF dates it to the next PAINT — behind the loading card that is seconds late
date: 2026-09-07
scope: scripts/, pwa/src/tools/
concepts: [harness, tooling, measurement, screenshots, preview]
---

A Playwright probe that records when something happened by sampling the DOM
inside `requestAnimationFrame` is measuring FRAMES, not events. Behind the
loading card a frame can be three and a half seconds long (the road compile,
the world build, the shader warm are single indivisible calls), and the app's
own loop is registered on rAF too — so a `setState` made inside one frame's
callback is not committed until after every rAF callback that frame, and a
watcher registered FIRST sees it a whole frame later.

That put a card transition 1.3 s away from the `import()` that actually caused
it and sent a session hunting a bug that was not there. Two fixes, and use
both:

- Read DOM state on a `MutationObserver`, which fires on a microtask right
  after the commit. rAF is fine for sampling something that changes CONTINUOUSLY
  (a bar's width, a line of text) and wrong for dating a transition.
- A `setInterval` probe measures the same blocking honestly and needs no DOM at
  all: the gap between firings IS how long the thread was gone. That is what
  established the 3.4 s block and the 5.1 s stall the music horizon is sized
  against.

Also: headless Chromium software-rasterizes, so every block measured this way
is a pessimistic upper bound rather than what a real GPU sees. Judge a change
by the SHAPE of the numbers — did the stall move, did the phase change land
somewhere else — never by their absolute size.
