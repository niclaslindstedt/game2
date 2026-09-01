---
title: The oss-framework stylesheet import is dead weight the moment no framework COMPONENT renders — it was half the CSS bundle
date: 2026-08-27
scope: pwa/src/styles.css
concepts: [css, bundle, framework, tailwind]
---

`pwa/src/styles.css` imported `@niclaslindstedt/oss-framework/styles.css` and
`@source`-scanned the installed package so Tailwind emitted the utility classes
the framework's components use. Both exist only for RENDERED components — hooks
(`usePwaUpdate`, `createLogStore`) need neither.

Replacing the framework's `UpdateToast` with the app's own card left the app
rendering no framework component at all, and dropping the two lines took the
CSS bundle from 82.3 kB (16.4 gz) to 41.2 kB (8.8 gz) with no visual change
anywhere — verified by re-running `make screenshots` over the menu, the options
tabs and a run.

Check `grep -rn "oss-framework" pwa/src/` after removing any framework
component: if every hit is a hook, the stylesheet import and the `@source` line
go with it. Import both back the day a framework component is mounted again.
