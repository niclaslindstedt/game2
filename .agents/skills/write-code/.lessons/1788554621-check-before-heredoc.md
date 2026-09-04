---
title: `cat > tests/<topic>_test.ts` silently destroys a file that already exists — the naming convention makes collisions LIKELY, not rare
date: 2026-09-04
scope: tests/
concepts: [test-conventions, harness, tooling]
---

Writing a new test with a shell heredoc (`cat > tests/car_wheels_test.ts
<<'EOF'`) truncates whatever was there. This session did exactly that and
overwrote 235 lines of an existing suite; it showed up only because
`git status` listed the file as ` M` rather than `??`, which is a detail easy
to read past.

The one-file-per-topic convention is what makes it likely rather than
freakish: the obvious name for a test about the subject you are working on is
usually the name somebody already used for a DIFFERENT rule about the same
part. `car_wheels_test.ts` was about which wheels the engine spins; the new
tests were about which way round the rim faces. Same noun, different subject.

So before creating any test file: `ls tests/ | grep <noun>`, and read the
header of anything that comes back — the block comment at the top states the
file's subject, which is what decides whether to append or to pick a name of
your own (`car_rims_test.ts` here). `git status --short` after writing is the
cheap second check: a new file must be `??`.

Recovery, if it happens, is `git checkout -- <path>` and it is complete —
but only while the clobber is still uncommitted and nothing else has touched
the file.

This is not specific to tests; it is specific to `cat >`. Prefer the Write
tool for a file you believe is new — it refuses to overwrite a file that
exists and has not been read, which is exactly this mistake.
