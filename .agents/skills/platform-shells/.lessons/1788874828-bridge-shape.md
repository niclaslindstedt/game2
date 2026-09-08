---
title: A native bridge is FOUR files and two wiring points — and the decision half must not import an expo package
date: 2026-09-08
scope: native/, pwa/src/shell-host.ts
concepts: [native, bridge, webview, test-conventions, haptics]
---

The haptics bridge is the first one in this tree, and it is the template. Four
files, in this order:

1. `pwa/src/game/<feature>.ts` — the WEBSITE's own feature, working in a
   browser. A shell-only behaviour is refused on review.
2. `pwa/src/shell-host.ts` — one event name and one `ask…` helper beside the
   fullscreen pair. Nothing listens in a browser, so the ask is a no-op there.
3. `native/src/<feature>.ts` — every DECISION, the same split `tauri/shell/`
   has: parse the page's message, size what it asked for. Pure.
4. `native/src/haptics.ts`-style effect module — the only file importing the
   expo package.

That third/fourth split is not tidiness: the ROOT suite tests `native/src/*`
(`tests/rumble_test.ts` imports both `native/src/rumble.ts` and
`native/src/injected.ts`), and the root tsconfig cannot resolve `expo-haptics`
— native/ is outside the npm workspace. One `import * as Haptics` in the
decision module makes the whole test file unresolvable.

And TWO wiring points in `native/App.tsx`, both easy to forget: the listener
script goes in `injectedJavaScriptBeforeContentLoaded` (joined to
`NATIVE_FLAG`, not the after-load script — a listener added after the first
frame misses the pulse that frame asked for), AND the WebView needs an
`onMessage` prop or nothing the page posts is ever delivered.
