---
title: Rewriting something that is still unreleased is `no-changelog` plus a correction to the existing fragment
date: 2026-08-28
concepts: [changelog, fragments, releases]
---

When a PR replaces a feature whose OWN fragment is still sitting in
`.changes/unreleased/`, no player has ever seen the thing being replaced. A
second fragment then describes a change between two states nobody experienced,
and the release notes list the feature twice.

The honest call is the `no-changelog` label, plus editing the existing
unreleased fragment wherever it states a fact the rewrite made false (a track
title, a mode name, a number). That is not the "never append to somebody else's
fragment" rule being broken — appending a new bullet is what that rule forbids;
correcting a now-false string in an unreleased fragment is what keeps the
release notes true.

Check with `grep -in "<the feature>" CHANGELOG.md`: an empty result confirms it
never shipped and the label is right.
