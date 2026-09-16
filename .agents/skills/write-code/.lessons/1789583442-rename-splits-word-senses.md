---
title: A repo-wide word rename must split the word's SENSES first — this tree's comments carry the same word in two meanings
date: 2026-09-16
scope: (global)
concepts: [rename, comments, prose, sed, review]
---

Renaming "country" to "biome" looked like one `sed -i` over 2,500
occurrences. It is not, because this tree's comments are written in English
prose and "country" carried two unrelated meanings: the BIOME a stage is
built in (taiga/desert/alpine — what the menus name), and the LANDSCAPE in
the British rally sense ("a road laid ALONG the country", "how steep the
country stands", "COUNTRY space"). A single pass produced "the biome falling
away under the grid" and "a hundred metres of biome was a squiggle".

The order that works:

1. **Replace the MINORITY sense first**, with narrow phrase patterns
   (`(on|onto|over|along|under|into) the country`, `flat/open country`,
   `the country stands|falls|holds`). Here the landscape sense became
   `land`, which is already this repo's word for it (`land.ts`, `BiomeLand`,
   `createLandField`) — never invent a third word.
2. **Then bulk-replace the rest**, protecting real-world idioms with
   sentinels first: `country road`, `across country`, `cross-country`,
   `countryside`. Two survived only because of that: the traffic roster's
   `"Country bus"` and `docs/configuration.md`'s phone **country code**.
3. **Then sweep the result for the sense you got wrong**, both ways —
   `biome` sitting next to a ground verb (`the biome beside`, `follows the
   biome`, `square of biome`) and `land` sitting in a progression context
   (`opens every land behind them`, `an open land is open`). Budget for
   several rounds; each sweep finds a class the last one did not.

Two mechanical traps beside the prose:

- **A local renamed into an enclosing binding.** `const country = …` inside
  a function that already had `biome` compiles fine when the types agree.
  `tsc` caught the typed ones; eslint's `no-self-assign` caught
  `biome = biome` in `environment.ts`, which was a real bug. Grep HEAD for
  every `country` DECLARATION and check each scope by hand.
- **Markdown table padding.** `AGENTS.md` and `.agents/**` are in
  `.prettierignore` precisely so a one-cell edit does not re-pad a whole
  table, so a shortened word leaves the row short. Pad the changed cells back
  to their old width rather than reformatting the table — `docs/` is
  Prettier's and needs no help.
