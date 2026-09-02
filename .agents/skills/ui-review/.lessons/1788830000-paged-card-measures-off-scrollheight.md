---
title: A card that PAGES its rows to fit measures its chrome off `scrollHeight` — and its body must be `flex: none`, or a shrunk body hides the overflow the measurement needs
date: 2026-09-02
scope: pwa/src/game/results-sheet.tsx, pwa/src/game/results-pages.ts, pwa/src/styles.css
concepts: [css, layout, paging, landscape, measurement, results-card]
---

The results sheet cuts its page to the room the card has: `room = screen ×
CARD_SHARE − chrome`, where chrome is everything on the card that is not
the rows, read as `card.scrollHeight − rows.offsetHeight`. That reads
right only while the card's flex children do NOT shrink under its
`max-height`. With the body at the flex default (`0 1 auto`, `min-height:
0`), a capped card shrank the body, the rows spilled out of it UNDER the
caption, and `scrollHeight` counted only the part of the spill that reached
past the caption — chrome came out ~40 px short, the page was cut two rows
long, and on 844×390 the sixth row sat under the caption with the card's
bottom edge off screen. `.fin-body { flex: none }` makes the card scroll
instead of the body giving, so `scrollHeight` is the true stacked height
and the page comes out right (five rows there).

Two more things the same measurement taught: the probe has to check the
LANDSCAPE PHONE, because 1280×720 and 390×844 both had room for a full
page and would have said nothing; and keep the CSS `max-height` and the
JS share the same number (`CARD_SHARE` — it is restated in the stylesheet
with a comment either side), since the sheet cannot read a percentage
`max-height` back out of `getComputedStyle`.
