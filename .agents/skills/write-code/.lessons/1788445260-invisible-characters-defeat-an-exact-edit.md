---
title: An Edit that refuses text you copied off the screen is usually a non-ASCII character — check with `cat -A` before retyping it
date: 2026-09-03
scope:
concepts: [harness, tooling, edit-loop]
---

Edit matches exactly, and this repo's source is full of characters that look
like plain ASCII on screen: non-breaking spaces, en and em dashes, typographic
quotes, the `‹ ›` chevrons in the menus. A JSX literal like
`{letter === BLANK ? " " : letter}` in `hud-initials.tsx` renders as a
normal space in every view of the file, so an `old_string` typed with a real
space fails — twice, in that session, before the cause was found.

Do not respond by retyping the block or by widening the match: pipe the exact
lines through `cat -A` (or `sed -n 'a,bp' file | cat -A`) and look for `M-BM-`
and friends. Then either copy the real character or, better, ANCHOR AROUND IT
— split the edit into two smaller ones that stop either side of the suspect
line. That is faster than getting the byte right and leaves the character
untouched, which is what you want anyway: it is there on purpose.

The same trick settles the reverse case, an `old_string` that matches in two
places: shrink the match rather than growing it.
