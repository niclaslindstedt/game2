// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared PWA wiring. `lib/pwa-update.ts` owns the update *state machine*
// and `update-button.tsx` the prompt; this file owns the one value the
// service-worker *build* and the watch must agree on — the precache cache
// id, which the SW build turns into a cache named `<cacheId>-precache`.
// Imported by BOTH `App.tsx` (browser) and `pwa-plugin.ts` (the SW-emitting
// build plugin); keep it free of any browser- or Node-only imports.

/** Per-deploy-base precache cache id, derived from the bundler `base`. */
export function cacheIdForBase(base: string): string {
  const slug = base.replace(/^\/+|\/+$/g, "").replace(/\W+/g, "-");
  return slug ? `scandi-flick-${slug}` : "scandi-flick";
}
