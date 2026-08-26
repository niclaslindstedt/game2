# Security Policy

## Supported versions

Only the latest release (the build served at [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/)) and the current `main` branch receive security fixes. There are no maintained older lines.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately via [GitHub Security Advisories](https://github.com/niclaslindstedt/game2/security/advisories/new) ("Report a vulnerability" on the repository's Security tab). If you cannot use GHSA, email the maintainer at the address on [github.com/niclaslindstedt](https://github.com/niclaslindstedt).

- **Acknowledgement:** within 7 days.
- **Assessment + fix plan:** within 30 days for confirmed issues.
- **Disclosure:** coordinated — the advisory is published together with the fixed release; reporters are credited unless they prefer otherwise.

## Scope

**In scope:** the game as deployed (XSS or content injection through stage seeds, URLs, or stored data; service-worker/cache poisoning; anything in this repository's build and release pipeline that could ship altered code to players).

**Out of scope:** the game is local-first with no accounts and no server of its own — there is no player data to breach beyond what stays in the player's own browser storage. Issues purely in third-party platforms (GitHub Pages, npm) belong upstream, though reports about how this project _uses_ them are welcome.
