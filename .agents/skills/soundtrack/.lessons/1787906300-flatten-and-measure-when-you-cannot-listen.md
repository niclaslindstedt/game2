---
title: When you cannot listen, flatten the score and measure attacks per bar per section — it catches the arc and section faults
date: 2026-08-28
scope: pwa/src/game/audio/scores/
concepts: [music, scores, review, arrangement]
---

Listening is the real review loop, but a headless session cannot run one. The
usable substitute is to import the track and, per pattern, print: attacks per
bar (non-`.`/`=` tokens × the voice's cycle count), the voice count, and the
lead's pitch span. Three of the skill's listed faults fall straight out of that
table:

- **A loop with no arc** — the numbers should not be flat. A working menu
  arrangement measured intro 17, verse 40, chorus 48, break 7, build 61,
  outro 48 attacks per bar.
- **A section that is not a section** — two patterns with the same voice count
  and density are one section written twice.
- **Two voices in one octave** — print each pitched voice's median and range
  over the whole track and read the overlaps.

It does NOT judge whether anything sounds good, so it is a screen before the
audition page, never a replacement for it. Note that `noteFrequency` throws on
a noise voice's `x` token — wrap it in a try/catch when walking every voice.
