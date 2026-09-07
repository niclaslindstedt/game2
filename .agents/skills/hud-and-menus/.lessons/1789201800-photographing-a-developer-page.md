---
title: Photograph a DEVELOPER sub-page by seeding `scandi-flick-options` in an init script and passing `?menu=1&splash=0` — never by drumming the chassis secret
date: 2026-09-07
scope: pwa/src/game/menu-dev.tsx, scripts/screenshot.mjs
concepts: [menus, screenshots, review, harness]
---

`scripts/screenshot.mjs` reaches the developer menu the way a player does —
Roam, the pre-race card, `drumChassis`, two backs — which is five seconds of
clicking and a scene that breaks whenever the route to the car card moves. For
a one-off look at a developer page, seed the switch instead:

```js
await page.addInitScript(() => {
  localStorage.setItem("scandi-flick-options", JSON.stringify({ developer: true }));
});
await page.goto(`${url}?menu=1&splash=0`, { waitUntil: "load" });
await page.waitForSelector(".menu-card, .roam", { timeout: 90000 });
await page.waitForTimeout(5000);
await page.locator("[data-menu='developer']").click();
```

Two things that bite:

- **`splash=0` is not optional.** Without it the attract card is still over
  the menu, the tile under it is visible and enabled, and Playwright retries
  the click until it times out with `<span class="splash-game"> … intercepts
  pointer events` — which reads as a missing element rather than a cover.
- **A page whose content comes from local storage** (the benchmark history,
  the score boards, the campaign) is seeded in the same init script, so the
  surface is photographed with something on it. A page shot empty is a page
  whose layout was never tested.

Put the script under `previews/` rather than `/tmp` — it is gitignored, and
`playwright-core` only resolves from inside the repo.
