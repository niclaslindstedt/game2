---
title: A tools page under pwa/src/tools must unpin html/body height, or the sheet photographs as its first screenful and nothing else
date: 2026-09-04
scope: pwa/src/tools/, scripts/
concepts: [tooling, harness, screenshots, css]
---

A tooling page that imports `../styles.css` — which it must, to render real
components at the sizes the app gives them — also inherits the app's own
`html, body { height: var(--shell-height); }`. That is right for a game that
fills the window and wrong for a contact sheet: the document stops at one
screenful, `document.documentElement.scrollHeight` returns the viewport
height, and Playwright's `fullPage: true` obediently captures exactly that.

The failure is silent and reads as a code bug. The rows that go missing are
the ones added most recently, so the page looks like it renders four of seven
states — not like a page whose last three states scrolled off.

Two lines in the page's own `<style>` fix it:

```css
html,
body {
  height: auto;
  overflow: visible;
}
```

And in the script, prefer measuring `scrollHeight` and standing the VIEWPORT
that tall over `fullPage: true`: only what the viewport could have shown is
painted, so a tall `fullPage` capture can still come back as bare backdrop.
`fullPage` also paints the browser's default background into everything the
body's box does not cover — with styles.css loaded that default is the app's
own SKY — so add a plate on `html` before the shot.
