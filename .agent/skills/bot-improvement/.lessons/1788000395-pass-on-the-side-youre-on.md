---
title: Pick the pass side from where the bot ALREADY IS, never from road width alone — width alone sends it through the car it is passing
date: 2026-08-29
scope: engine/sim/bot.ts
concepts: [bot-tuning, traffic, overtaking, collision]
---

The obvious rule for which side to overtake on is "whichever side of the car
in front has more road". It is wrong, and it fails silently: a bot sitting to
the right of a car that is a hair left of the crown computes more room on the
left, aims there, and drives THROUGH the car to get to it. On a wide stage the
contact model just shoves them apart and the run looks fine, so nothing in the
sim table says anything happened.

The rule is: take the side the bot is already on
(`state.lateral >= theirLateral ? 1 : -1`), and only come across when that
side genuinely has no road on it AND the move is still being set up — from
behind, where there is room to cross. Room is measured against a full body
width (`halfWidth × 2`), not against zero.

Test it directly: put both cars on the crown so the two sides are equally
open, run the pass at several tempers, and assert the closest approach never
drops below half a body. Every temper must pass that, including the nastiest
— a crew that means to put you in a tree still goes down ONE side of you to
do it.
