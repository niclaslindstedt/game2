---
title: Two sections with the same voices, bars and density fail the arc test — give one a real difference, do not tweak the key
date: 2026-09-02
scope: pwa/src/game/audio/scores/, tests/audio_test.ts
concepts: [music, scores, arrangement, test-conventions]
---

`tests/audio_test.ts` refuses a score whose two patterns have the same set
of voices, the same bar count and the same attacks per bar: that is a
section written twice, and a fifty-six-bar loop with eight bars of material
in it. It bit the desert score's `intro` and `outro` (both the riff over a
kick and a shaker) and the menu's `intro` and `c` (both pads, bass, bell)
before the bar count went into the key.

The right fix is a musical one that the ear would want anyway — a clap on
the halves in the outro so the loop lands back on the riff with the kit
still going, a longer bell line in the break — and never a change to how
the test derives its key. When a score genuinely needs two sections that
sound alike, the loop is telling you one of them is not earning its bars.

The measure is also the cheap screen the `soundtrack` skill recommends
when you cannot listen: attacks per bar per section should not be flat
across a loop, and the numbers in the test are the ones to print.
