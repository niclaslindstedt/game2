---
title: A web session can open with NO node_modules — the session-start hook only runs under CLAUDE_CODE_REMOTE=true, so check for the tree in the preflight and run the hook by hand when it is missing
date: 2026-09-02
concepts: [harness, npm, install, preflight, github-packages]
---

AGENTS.md says `.claude/hooks/session-start.sh` installs the dependencies
automatically in a web session. It bails out unless `CLAUDE_CODE_REMOTE=true`,
and a session in which that variable was not set arrives with no `node_modules`
at all — which only surfaces an hour later, as `sh: 1: vite: not found` out of
the first `make build`, or `npm ci` refusing `@niclaslindstedt/oss-framework`
with a 401 because nothing wrote the token into `~/.npmrc`.

Add one line to the preflight beside `git status`: `ls node_modules/.bin/vite`.
If it is missing, run the hook yourself — the tokens ARE in the environment
(`GH_TOKEN`, `GITHUB_TOKEN`, `GITHUB_PAT`), the hook knows the order to try
them in, and it does the install and a first build:

```sh
CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh
```

Do it BEFORE the first edit rather than at the gate: the hook ends with
`make build`, so on a tree that already carries a half-finished change its
"build failed" line reads as a bug in the work instead of as a missing install.
