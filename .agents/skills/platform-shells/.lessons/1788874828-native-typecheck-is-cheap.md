---
title: `make native-typecheck` is affordable in a web session — native/'s tree installs in about half a minute
date: 2026-09-08
scope: native/
concepts: [native, harness, verification, build]
---

`native/` has its own dependency tree outside the npm workspace, which reads
like "unverifiable from here" — it is not. `npm install` in `native/` pulls
490 packages in about 25 seconds through the session proxy (no native
toolchain, no Xcode, no simulator), and `make native-typecheck` then covers
`App.tsx` and every `src/` module. That is the only check in the repo that
reads the shell's own code, so a change to `native/` without it is unchecked:
`make lint` and `make test` stop at the tree's edge by design.

Adding a dependency does not need the install at all —
`npm install --package-lock-only` in `native/` updates `package-lock.json`
alone in seconds, which is what a lockfile-only commit wants.

Run the typecheck against the real library types rather than hand-writing a
prop's shape: it is what catches an `expo-haptics` enum member that does not
exist, and it is why `native/App.tsx` takes `WebViewMessageEvent` from
`react-native-webview` instead of a local `{ nativeEvent: { data: string } }`.
