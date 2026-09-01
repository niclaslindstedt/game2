---
title: Setting `el.value` on a React-controlled input makes the input event it fires disappear — go through the prototype's setter
date: 2026-08-30
scope: pwa/src/game/
concepts: react, input, ui, menu-nav, sliders
---

Anything that drives a React-controlled `<input>` from OUTSIDE React — the
controller stepping a volume fader in `menu-nav.ts`, a harness scripting a
slider — cannot just write the value and dispatch:

    el.value = String(next);
    el.dispatchEvent(new Event("input", { bubbles: true }));   // silently lost

React tracks what each input last held so it can drop duplicate change
events, and it tracks it by REPLACING the element's own `value` setter. So
the assignment updates React's record as a side effect, the event handler
then compares the two, finds them equal, and never runs. Nothing throws and
nothing logs; the slider just does not move.

The fix is one line, and it is worth the comment it needs:

    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set ? set.call(el, String(next)) : (el.value = String(next));
    el.dispatchEvent(new Event("input", { bubbles: true }));

Same trap for `checked` on a checkbox. And when the row already makes its own
noise off the input event, do not raise one from the driving side too — that
is two clicks for one notch.
