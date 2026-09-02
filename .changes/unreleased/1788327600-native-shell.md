---
type: Added
title: Native app shell
---

A thin Expo / React Native wrapper under `native/` — the App Store / Play
Store build: a full-screen WebView over a copy of the game bundled inside
the app and served locally, so it plays offline, with an audio session that
plays through the phone's ringer switch. Inside it the game skips the PWA
update card and updates through the store instead. Built on demand by the
new `native` workflow.
