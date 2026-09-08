// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORE LISTING'S RULES — everything about the submission that is not the
// marketing copy. Committed; the copy is not.
//
// THE SPLIT IS DELIBERATE AND IT IS ABOUT ONE FACT: the game is PAID on the
// App Store and OPEN SOURCE on GitHub. Those two are only in tension for the
// listing's WORDS. A product page's description, subtitle, promotional text
// and keyword set are what the store indexes and what a competitor reads, and
// publishing them in a public repository puts the paid listing's own copy on a
// crawlable page under somebody else's domain — competing with, and sometimes
// outranking, the listing it was written for. Nothing else here has that
// problem: an age-rating answer, a category, a field limit and a cross-check
// are all better off in the open, where a reviewer can see them.
//
// So:
//
//   listing.mts        THIS FILE. Types, limits, categories, the age-rating
//                      questionnaire, the release policy, and what the Steam
//                      page may not claim. Committed.
//   copy.mts           Every word a buyer reads. GITIGNORED.
//   copy.example.mts   The committed template that documents its shape, with
//                      obvious placeholder text.
//
// It is the same shape as `native/.env` beside `native/.env.example`, for a
// related reason — see `docs/configuration.md`. The generator compiles
// whichever of the two copy modules is present and says which one it used;
// `make store-preflight` reports running on the example as outstanding work,
// because a submission built from the template would ship placeholder prose.
//
// Compiled by `make store-metadata` (scripts/generate-store-metadata.mjs) into
// the files the upload tools read: native/store/store.config.json for
// `eas metadata:push`, the fastlane metadata tree for `fastlane deliver`,
// tauri/fastlane/metadata/ for the MAC App Store's own `deliver`, and
// tauri/store/steam-listing.md for the Steamworks store page. All of it is
// gitignored build output — never edit it.
//
// THREE STOREFRONTS, TWO SHELLS. The App Store's phone app is `native/` (Expo
// over a WebView); the Mac App Store's app and Steam's download are both
// `tauri/` (the desktop shell), because a Mac app is a desktop app and the
// Expo shell does not build one. Each store's assets sit beside the shell that
// submits them; the words are authored once, here and in `copy.mts`, because
// they describe one game.
//
// A TypeScript module rather than a YAML catalog, for the reason the rest of
// this repo's small fixed catalogs are (docs/spec-conformance.md, §24): the
// tests and the generator read the same typed rows with no schema layer and no
// parser dependency, and the identity it composes against
// (`pwa/src/identity.ts`) is a module, not a data file.
//
// TWO MORE KINDS OF FIELD, NEITHER OF WHICH IS HERE:
//
//   COMPOSED    the listing title, the marketing URL, the privacy URL and the
//               copyright line, which the generator takes from identity.ts, so
//               a rename reaches the store listing the same way it reaches the
//               manifest and the app's name.
//   OUT OF BAND the App Store review PHONE NUMBER. Apple rings it and this
//               repository is public, so it comes from `ASC_REVIEW_PHONE` in
//               the gitignored `native/.env` (scripts/lib/store-env.mjs). The
//               generator drops the field rather than upload a number that
//               rings nobody.

/** One App Store locale's product page. Authored in `copy.mts`. */
export type AppleInfo = {
  /** ≤ 30 chars. Sits under the app name and IS indexed for search, so it
   * carries the hook and a term or two the keywords then don't have to. */
  subtitle: string;
  /** ≤ 170 chars. The only field that can change WITHOUT shipping a build,
   * so it holds what is newsy — never anything load-bearing. */
  promoText: string;
  /** 10–4000 chars. Read on a phone: the hook lives in the first two lines,
   * because that is all the store shows before "more". */
  description: string;
  /** Joined with commas by App Store Connect, and the JOINED string is what
   * must stay under 100 chars — not each term. */
  keywords: string[];
  /** ≤ 4000 chars. The product page's "What's New". */
  releaseNotes: string;
  /** Required by Apple, and must be http(s) — a `mailto:` is rejected. It
   * deliberately does not point at the source repository. */
  supportUrl: string;
};

/** What App Store review is told, and who it asks. */
export type AppleReview = {
  firstName: string;
  lastName: string;
  email: string;
  demoRequired: boolean;
  /** 2–4000 chars, authored in `copy.mts` as `APPLE_REVIEW_NOTES`. */
  notes: string;
};

/** The half of the submission that is rules rather than words. */
export type StoreRules = {
  /** Bumped only when Expo changes the store.config schema. */
  configVersion: number;
  apple: {
    /** First entry is the primary category; an array is
     * [category, subcategory, subcategory]. */
    categories: (string | string[])[];
    /** The age-rating questionnaire. A wrong answer here is a rejection, so
     * every row says why it is what it is. */
    advisory: Record<string, unknown>;
    /** Who review contacts. The notes themselves are copy. */
    contact: Omit<AppleReview, "notes">;
    release: { automaticRelease: boolean; phasedRelease: boolean };
  };
  /** THE MAC APP STORE. Apple's second storefront, a different binary, and
   * the same questionnaire — `apple.advisory` and `apple.contact` are shared,
   * because the age rating and the review contact are claims about the GAME
   * rather than about a build. */
  mac: {
    /** App Store Connect's own category ids, shared across platforms. */
    categories: (string | string[])[];
    /** The oldest macOS the build runs on. RESTATED from
     * `tauri/src-tauri/tauri.conf.json`, which cannot import this file, and
     * checked against it by the generator: a listing that promises Catalina
     * and a binary that refuses to launch on it is a refund. */
    minimumSystemVersion: string;
    /** Every entitlement the submitted build declares.
     *
     * The App Sandbox is not optional on the Mac App Store, and its presence
     * is the load-bearing half of what the review notes claim about this app:
     * a sandboxed process that never asks for the network is a very short
     * argument that nothing leaves the device. Anything ADDED here is a new
     * claim to defend, so the list stays as short as the game can stand. */
    entitlements: string[];
    /** Whether the Mac app is sold as ONE PURCHASE with the iPhone app.
     *
     * Apple's universal purchase needs both apps to carry the SAME bundle id,
     * and it can only be turned on before either has shipped — after that the
     * two are separate products for good. The generator checks the two
     * identifiers agree when this is on, and says which files disagree. */
    universalPurchase: boolean;
  };

  steam: {
    /** The store page's genres, most representative first. */
    genres: string[];
    /** Player-facing tags, in the order Valve should weight them. */
    tags: string[];
    /** What the page must NOT claim. Steam reviews the listing and the build
     * together, so a planned feature presented as shipped is a rejection. */
    notYetShipped: string[];
  };
};

export const RULES: StoreRules = {
  configVersion: 0,

  apple: {
    // Racing first because that is what it is; SIMULATION second because the
    // handling model, the damage and the co-driver are the reason somebody
    // who wanted a rally game stays.
    categories: [["GAMES", "GAMES_RACING", "GAMES_SIMULATION"], "SPORTS"],

    advisory: {
      // Cars hit trees and roll. Nobody is in them but the driver, nobody is
      // hurt, and nothing bleeds — but a car coming apart is cartoon violence
      // and answering NONE here would be the answer that gets looked at.
      violenceCartoonOrFantasy: "INFREQUENT_OR_MILD",
      violenceRealistic: "NONE",
      violenceRealisticProlongedGraphicOrSadistic: "NONE",
      horrorOrFearThemes: "NONE",
      profanityOrCrudeHumor: "NONE",
      matureOrSuggestiveThemes: "NONE",
      sexualContentOrNudity: "NONE",
      sexualContentGraphicAndNudity: "NONE",
      alcoholTobaccoOrDrugUseOrReferences: "NONE",
      medicalOrTreatmentInformation: "NONE",
      // Nothing is wagered and no outcome is rolled against a stake. The
      // stage generator draws from a seed, which is not a wager.
      gamblingSimulated: "NONE",
      gambling: false,
      contests: "NONE",
      // The WebView serves the copy of the site bundled INSIDE the app from a
      // local HTTP server. It is not a browser and cannot be steered
      // elsewhere: the only outbound links are handed to Safari.
      unrestrictedWebAccess: false,
      kidsAgeBand: null,
    },

    // A name and a mailbox, not a phone number — see the header. Committed
    // because they are the publisher's public contact details, which the
    // listing shows anyway.
    contact: {
      firstName: "Niclas",
      lastName: "Lindstedt",
      email: "niclas@agilator.se",
      demoRequired: false,
    },

    release: {
      // Held for a human to press. A first launch should not go live off a
      // review approval at three in the morning.
      automaticRelease: false,
      phasedRelease: false,
    },
  },

  mac: {
    // The same shelf as the phone app: it is the same game, and a buyer who
    // finds it on one should recognise it on the other.
    categories: [["GAMES", "GAMES_RACING", "GAMES_SIMULATION"], "SPORTS"],

    // Catalina, which is what the desktop shell already declares. The webview
    // this app is a window onto is the SYSTEM's, so the floor is really "a
    // WKWebView new enough to run the game" rather than anything the shell
    // itself needs.
    minimumSystemVersion: "10.15",

    // The sandbox, and NOTHING ELSE. Every capability this game could plausibly
    // want it deliberately does not have: no network (the whole site is inside
    // the binary and served from a private scheme in-process), no file access
    // (the player's settings, scores, ghosts and pictures are the webview's own
    // origin-keyed storage), no camera, no location. The one thing it opens is
    // a URL in the player's browser, which the system does on its behalf.
    entitlements: ["com.apple.security.app-sandbox"],

    // ONE PURCHASE ACROSS THE IPHONE AND THE MAC. Off until the two bundle ids
    // are made to agree — see the generator's check, which names both files.
    // This is a decision with a deadline: it can only be turned on while
    // NEITHER app has shipped.
    universalPurchase: false,
  },

  steam: {
    genres: ["Racing", "Sports", "Indie", "Simulation"],

    tags: [
      "Racing",
      "Driving",
      "Rally",
      "Arcade",
      "Singleplayer",
      "3D",
      "Procedural Generation",
      "Difficult",
      "Atmospheric",
      "Controller",
      "Offline",
      "Physics",
    ],

    // Read by the generator, which refuses to emit a page whose copy mentions
    // any of these. Each is a thing the sibling repo's shell has and this one
    // deliberately does not — see docs/platforms.md. As the desktop shell
    // grows a feature, drop its row and the copy is free to say so.
    //
    // This one belongs in the OPEN half on purpose: it is a statement about
    // what the build does, which is exactly the kind of claim a public
    // repository should be able to check.
    notYetShipped: [
      "Steam Cloud",
      "Steam Achievements",
      "Steam Leaderboards",
      "Steam Workshop",
      "Trading Cards",
      "multiplayer",
      "co-op",
      "matchmaking",
      "Remote Play",
    ],
  },
};
