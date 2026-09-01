import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    // Build output, dependencies, and generated previews are out of scope.
    ignores: [
      "pwa/dist/**",
      "node_modules/**",
      "pwa/node_modules/**",
      "coverage/**",
      "previews/**",
    ],
  },
  js.configs.recommended,
  {
    // Node tooling scripts (icon generation, SEO checks, sim CLI, release
    // plumbing). These run under Node, so expose its globals rather than
    // the browser's.
    files: ["scripts/**/*.mjs", ".agents/skills/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
  },
  {
    files: [
      "engine/**/*.ts",
      "pwa/src/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "pwa/vite.config.ts",
      "vitest.config.ts",
      "pwa/pwa-plugin.ts",
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TypeScript checks for undefined identifiers itself; the core rule
      // only produces false positives for DOM/Web globals.
      "no-undef": "off",
      // Defer to the TS-aware rule, which also honours the `_`-prefix
      // convention for intentionally unused parameters.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Rules that arrived enabled-by-default in the ESLint 10 /
      // eslint-plugin-react-hooks 7 majors; they fire on deliberate,
      // working patterns. Mirrors the sibling apps' configuration.
      "no-useless-assignment": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      // The HUD's touch controls write into the input manager's mutable
      // channel from event handlers by design (see pwa/src/game/input.ts);
      // the immutability heuristic reads that as mutating a prop.
      "react-hooks/immutability": "off",
    },
  },
];
