---
title: When your side WINS a conflict, the losing side's supporting numbers are orphaned — and git raises none of them, because neither side edited them
date: 2026-09-05
scope: pwa/src/styles.css, docs/, .agents/skills/
concepts: [merge, rebase, semantic-conflict, verification, css, hud, dead-code]
---

A branch moved the HUD's news column to the bottom-right corner. Main had
meanwhile fixed the SAME complaint a different way: it measured `.hud-flashes`
into the top-of-frame chain, adding `--flash-top` — and `--pace-band` /
`--pace-call` under it purely to reserve the room the column stood in.

Taking the branch's side is right (leaving the stack answers the complaint more
thoroughly than being measured into it), and git's two hunks resolve in
seconds. What git does NOT raise is everything main built to SUPPORT the
position that just lost: three custom properties now defined and never read,
the chain's own doc comment still narrating three bands, `docs/driving.md`
describing the old spot, and another skill's `.lessons/` fragment naming
`--flash-top` as the chain's last link. None of it conflicts, because neither
side touched any of it.

So after resolving in your favour, ask what the losing hunk was WIRED INTO, and
follow each thread out:

```sh
git show origin/main -- <path> | grep '^+'        # what main actually added
grep -c "var(--<each-new-name>)" <file>           # 0 uses = you orphaned it
grep -rn "<the-name>" docs/ .agents/ AGENTS.md    # prose that names it
```

A `calc()` chain is the sharp case — deleting one link can orphan the link
above it, so re-grep after each removal rather than once (`--flash-top` going
made `--pace-band` dead, which made `--pace-call` dead). Prose is the sneaky
case: a doc sentence that was true of main and true of your branch separately
can be false of the merge, and `docs/driving.md` here was already stale from
main's own change on top of yours.

Deleting them belongs in the SAME commit as the resolution, and the PR body
should say so — a reviewer of #304 will look for their variable.
