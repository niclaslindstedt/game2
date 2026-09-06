---
title: A new menu page owes four edits, and the one that fails silently is `parentOf` — its default sends BACK to the front door
date: 2026-09-06
scope: pwa/src/game/main-menu.tsx
concepts: [menus, navigation, gamepad, ui]
---

Adding a page to `main-menu.tsx` means four edits, not two:

1. the `MenuPage` union — a new `{ page: "..." }` member;
2. `DEPTH` — TypeScript catches this one, since the record is keyed on
   `MenuPage["page"]`, so it is the only one that cannot be forgotten;
3. `parentOf` — where BACK goes, which `menu-nav.ts` reads for the pad's B
   button;
4. the render block, and the `on…` prop that navigates into it.

**Only the second is enforced.** `parentOf` ends in a bare
`return { page: "root" }`, so a page nobody names there compiles, renders and
looks right — and then the pad's B button leaves the whole menu while the
page's own back button steps one level out. That is exactly the disagreement
the function's own comment forbids, and it is invisible to a mouse: the
button and the key only diverge on a controller. `debuglog` shipped with it.

Any page reached FROM another page (the developer menu's own sub-pages, for
instance) must be named in `parentOf` explicitly.
