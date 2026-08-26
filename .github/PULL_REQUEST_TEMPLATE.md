<!-- Title must be a conventional-commit subject (it becomes the squash
     commit on main): feat(engine): give fords a spray wall -->

## What & why

<!-- What changes, and what it does for the player or the project. -->

## Test plan

<!-- How you verified it: commands run, scenarios driven, screenshots for
     visual changes. For handling/generator changes paste the `make sim`
     table BEFORE and AFTER. -->

## Checklist

- [ ] `make test`, `make lint`, `make fmt-check` pass locally
- [ ] Tests added/updated for behavior changes
- [ ] `make sim` before/after included (handling or generator changes)
- [ ] Changeset fragment in `.changes/unreleased/` (or `no-changelog` applies)
- [ ] Docs updated per AGENTS.md → Documentation sync points
- [ ] PR title is a conventional-commit subject
