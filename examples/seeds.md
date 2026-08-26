# Known-good stage seeds

Rendered with `npm run track -- --seeds <n>`; driven with
`npm run sim -- --seeds <n>`. Shapes as of the current generator rules —
the generator is deterministic per seed, so these stay stable until the
rule book (`engine/mapgen/rules.ts`) changes, at which point regenerate
this list from a fresh `make track` sweep.

| Seed | Character                                                 |
| ---- | --------------------------------------------------------- |
| 3    | Ford run — four water crossings, three hairpins, no jumps |
| 10   | Flow stage — jumps and fords mixed, fast average          |
| 42   | The loop-back — long soft esses, one ford, three hairpins |
| 99   | All of it — jumps, ford, hairpins, longest of the set     |
| 123  | Jump stage — two lips, two crests, hairpin finish         |
| 2024 | Four jumps, big air time                                  |
