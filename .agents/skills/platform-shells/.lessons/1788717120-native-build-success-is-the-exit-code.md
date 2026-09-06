---
title: A native iOS build's success is its EXIT CODE — the log carries a nested "** BUILD SUCCEEDED **" minutes early
date: 2026-09-06
scope: native/
concepts: [ios, build, harness, measurement]
---

`@dr.pogodin/react-native-static-server` compiles its embedded lighttpd
through CMake, which runs its **own nested xcodebuild** and prints its own
`** BUILD SUCCEEDED **` into the same stream — several minutes before the app
target is linked. A monitor grepping the log for that string fires early, and
the `.app` it then points at is an empty directory with nothing but
`Frameworks/` in it. `devicectl install` rejects it with the misleading
`not a valid bundle … Failed to get the identifier for the app to be
installed`, which reads like a signing or Info.plist fault rather than "the
build is still running".

Watch the PROCESS, not the log: wait on the command's exit status
(`run_in_background` and the completion notification, or `$?`), and only then
read the products directory. `native/scripts/ios-device.mjs` does this — it
streams only `error:` lines to the console and decides success purely on
xcodebuild's exit code — so prefer running it over hand-rolling an xcodebuild
invocation and watching its output.

The same trap applies to any grep-the-log progress watch over a cold native
build: filter for failure signatures, never for the success marker.
