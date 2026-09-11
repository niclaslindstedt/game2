---
title: The attract card's LOADING beat cannot be photographed by waiting for it — hold the renderer chunk back in `page.route`
date: 2026-09-11
scope: pwa/src/game/splash-screen.tsx, scripts/lib/shots-menus.mjs
concepts: [screenshots, harness, menus, verification]
---

`shots-menus.mjs` only ever shoots the attract card's READY beat, and the
obvious way to catch beat one — `?splash=1&start=`, wait for the beat-one
element, screenshot — is a coin flip. `SPLASH_MIN_MS` is 1000 ms from MOUNT,
and off a local `serveDir` the chunks land so fast that `waitForSelector` can
return with only tens of milliseconds of that left; the card flips to beat two
between the wait and the shutter, and the still comes back showing the title.
Adding a `waitForTimeout` makes it worse, not better.

What works is making the boot honestly slow, which is also the only condition
under which a player sees beat one at all:

```js
await page.route("**/renderer-*.js", async (route) => {
  await new Promise((r) => setTimeout(r, 6000));
  await route.continue();
});
await page.goto(`${url}?splash=1&start=`, { waitUntil: "commit" });
```

`warm` is what promotes the card, and it waits on the render stack, so holding
that one chunk parks the card on beat one for as long as the delay. Park the
element's own `animation` before the shutter the same way `attractReady` parks
the prompt's blink, and the still is repeatable.

Worth knowing for any surface that exists only while something is loading: the
race loading card's phases have the same problem, and the same answer.
