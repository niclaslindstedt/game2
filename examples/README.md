# Examples

Runnable inputs for the project's tooling. Each example is exercised by the
test suite or reproducible with one command, so it cannot silently rot.

## Stage seeds (`seeds.md`)

A curated list of known-good stage seeds with their shapes — hairpin-heavy,
jump-heavy, ford runs. Try one:

```sh
npm run track -- --seeds 42,99,123     # render the maps to previews/
npm run sim -- --seeds 42,99,123       # let the bots drive them
```

Or play one directly: the game seeds from the day number, so to drive a
specific seed use the dev server and edit `dailySeed()` in
`pwa/src/App.tsx` — or just drive today's and share the number in the HUD.

## Simulation report (`sim-report.json`)

A saved `npm run sim -- --seeds 42,99 --json` dump showing the
machine-readable balance format tooling can consume (fields per run: seed,
car, finish time, track length, the full `RunStats`, and the determinism
digest). Regenerate any time:

```sh
npm run sim -- --seeds 42,99 --json examples/sim-report.json
```
