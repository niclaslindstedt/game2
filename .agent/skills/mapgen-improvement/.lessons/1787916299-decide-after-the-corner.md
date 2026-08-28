---
title: A feature that belongs "after a corner" is decided at the START of the NEXT segment, off openNote
date: 2026-08-28
scope: engine/mapgen/compile.ts
concepts: [compile, pacenotes, checkpoints, placement, streaming]
---

Placing something at a corner's EXIT (R28's split boards, and anything like
them) cannot be decided while walking the corner: R5 allows two same-direction
turns in a row, so the segment you are in may be the middle of one corner
rather than the end of it. Decide at the top of the NEXT segment's iteration,
where `built` says whether the corner is over — and use `openNote`, the open
pacenote, as the candidate rather than the segment: it already merges a
same-direction combination and carries its hardest severity, so "after the
corner" comes out meaning "after the whole thing" for free. `openNote.endS` is
the exit the cursor is standing on at that moment.

Two mechanics that make it hold up:

- Cap the run-out past the exit by the segment that carries it
  (`Math.min(runOut, built.length * k)`, and zero on a turn), so the mark
  always lands inside the segment being walked. Without the cap it can slide
  into the next bend, or drift forward segment after segment.
- Charge the spacing from where the mark actually STANDS, not from the corner
  that earned it. Setting the low-water mark at the corner exit lets two marks
  end up a whole run-out closer together than the rule claims.

Both are incremental-safe: keep the cursor state in `createCompiler`'s closure
beside `openNote` and an endless stage's repeated `append` calls behave the
same as one finite pass. Trim against the finish gate at the end of `append`
instead — `track.finishS` is only known once the run-out segment is walked, and
`track.endless ? null : (track.finishS ?? cursor.s)` covers circuits and the
synthetic `compileTrack` rigs, which have no gate of their own.
