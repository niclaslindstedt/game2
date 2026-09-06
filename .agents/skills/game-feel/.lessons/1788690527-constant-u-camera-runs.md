---
title: The scripted camera runs hold `car.u` at a constant, so any reading off a RATE is silently untested by them
date: 2026-09-06
scope: tests/camera_test.ts, tests/camera_feel_test.ts
concepts: [camera, test-conventions, verification, game-feel]
---

`weave`, `straight`, `blowRun` and the jump runs in `tests/camera_test.ts` all
script the car by hand and set `car.u` once — which is what makes them clean
probes of the thing under test. It also means a camera reading taken off the
car's ACCELERATION (or any other rate the scripts hold flat) is exactly zero
through all of them: the suite goes green whether the reading works, is wired to
the wrong rig field, or is never applied at all.

A new rate-driven reading therefore owes its own scripted run that actually
varies the quantity — for the surge, a loop stepping `car.u` by a fixed m/s²
and moving `car.z` with it — and the comparison has to be against a car HOLDING
the speed it ended at, or the rig's own `distPerSpeed` pull-back shows up in the
answer and reads as a surge that is there when it is not.
