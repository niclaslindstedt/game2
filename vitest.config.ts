// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Root test runner config. Tests live in tests/ and follow the *_test.ts
// naming convention (OSS_SPEC §20.2/§20.3); they exercise the engine and
// the headless simulator — nothing here needs a DOM.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@engine": fileURLToPath(new URL("./engine/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*_test.ts"],
    environment: "node",
    // Vitest's 5 s default is a UNIT test's allowance, and almost nothing
    // here is a unit test: a case compiles whole stages, builds their
    // terrain and drives a car through them at 120 Hz.
    //
    // `analysis_test` and `circuit_test` already say so in their own words
    // and pass 20 s and 30 s per test — "not a timeout on this file, a coin
    // toss, and it came up tails on CI". This makes that the DEFAULT rather
    // than something each heavy file has to rediscover the hard way. It was
    // rediscovered again by explore_test's cone rule, which takes 3.5 s on
    // an idle machine — 1.4x against the default, and nothing at all
    // against a runner sharing two cores with a shard-mate.
    //
    // 30 s is sized to the work, not to the failure: ~8x the heaviest case,
    // so how busy the runner was cannot decide a result. A genuinely hung
    // test now costs 30 s to report instead of 5 s, which is the price.
    testTimeout: 30_000,
  },
});
