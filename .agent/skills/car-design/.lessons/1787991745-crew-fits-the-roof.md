---
title: A person is authored ACROSS, not up — the roof decides the height, so clamp the lid and squash the hair
date: 2026-08-29
scope: pwa/src/game/car/crew.ts, pwa/src/game/car-crew.ts, tests/car_crew_test.ts
concepts: [interior, crew, characters, proportions, contact-sheet]
---

Sixteen caricatures have to fit a cabin that is a 300 mm tray, and a helmet
is 290 mm across. So almost none of the vertical range a character seems to
have is real: `stature` moves a head by centimetres before the headliner
takes the rest back. What actually separates two people through a tinted
pane is WIDTH — shoulders, girth, head size — plus what is on the head. Spend
the authoring there.

Two traps, and the second one only appears on a body the sheet never
rendered:

- **The clamp has to be against the LID, not the whole head.** Clamp against
  the tallest thing (a bouffant, an afro) and the character's head is pushed
  down until the face is below the window line, which loses the one thing
  the hair was for. Clamp the helmet/skull under the roof and SQUASH the hair
  into whatever room is left, scaling the whole mass about the head's centre
  so it keeps its width. A flattened bouffant in a coupe is both the honest
  answer and the funnier one.
- **The coupe is 60 mm shallower than the hatch.** A crew that fits the sheet
  (rendered on one body) can have helmets through another body's headliner —
  invisible from outside, and right in front of the hood camera.
  `tests/car_crew_test.ts` builds every character into every catalog body and
  checks the bounds; it caught three characters the sheet said were fine.

And a full-face helmet draws over everything: hair and face hair under one
are triangles nobody will ever see. Give the big hair to the open lids, the
caps and the bare heads, or author nothing at all.
