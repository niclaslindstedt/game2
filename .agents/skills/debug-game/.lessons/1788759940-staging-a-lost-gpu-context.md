---
title: Reproduce a phone's "the screen went a solid colour" report by taking the GPU context away with WEBGL_lose_context — and know that bringToFront cannot background a page
date: 2026-09-07
scope: pwa/src/game/, scripts/
concepts: [harness, rendering, playwright, debugging, three, mobile]
---

A report of a blank or flat-coloured screen after backgrounding or rotating a
phone is not a layout bug and not a hang: it is almost always the browser
having reclaimed the WebGL context from the backgrounded tab. The canvas is
transparent, so what fills the screen is `body`'s own `#3fa9f5`, with the DOM
HUD still floating on it — the page colour is the tell, exactly as it is for
the buffer-vs-viewport mismatch beside it.

It is fully reproducible in the headless harness, which is what makes it worth
knowing:

```js
const gl = document.querySelector("canvas.game-canvas").getContext("webgl2");
const ext = gl.getExtension("WEBGL_lose_context");
ext.loseContext(); // …then ext.restoreContext()
```

Both events go through three's own listeners first, so `THREE.WebGLRenderer:
Context Lost.` / `Context Restored.` in the console is the confirmation the
sequence landed. three preventDefaults the loss and re-inits on the restore,
then re-uploads every geometry and recompiles every shader lazily on the first
frame that asks — measured here as one frame gap three times the software
baseline, which on a phone is the "hangs for a few seconds" half of the report.

The trap: **Playwright's `page.bringToFront()` does not hide the page it
displaces.** `document.hidden` stays `false` and `resize` still fires, so it
cannot stage "rotated while the app was in the background" at all — the run
looks like a clean foreground rotation and proves nothing. Stage the context
loss instead; it is the part of the sequence that actually breaks.
