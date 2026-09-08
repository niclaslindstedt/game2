#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compile the hand-authored listing (native/store/listing.mts) into the files
// the upload tools actually read. Same shape as everything else generated in
// this repo: the committed source is the truth, the output is gitignored build
// product, and the GENERATOR is where the rules live.
//
//   native/store/store.config.json     `eas metadata:push` (text only)
//   native/fastlane/metadata/**        `fastlane deliver`  (text + screenshots)
//   tauri/store/steam-listing.md       the Steamworks store page, to paste
//
// Three jobs the authored module cannot do for itself:
//
//  1. COMPOSE the brand-shaped fields out of pwa/src/identity.ts — the listing
//     title, the marketing URL, the privacy URL, the copyright line — so a
//     rename reaches the store listing the same way it reaches the manifest
//     instead of being re-typed in a second place.
//
//  2. VALIDATE every Apple length limit and FAIL on an overrun. App Store
//     Connect truncates an over-long subtitle or promo text silently, and the
//     keyword field is the nasty one: the 100-character budget is spent on the
//     COMMA-JOINED string, not per keyword.
//
//  3. CROSS-CHECK the listing against the app it describes. The review notes
//     make load-bearing claims — that the whole game ships inside the binary,
//     that nothing is sold, that a named privacy page exists — and each of
//     those is checkable here rather than by a reviewer.
//
// Usage:
//   make store-metadata                                   # write the outputs
//   node scripts/generate-store-metadata.mjs --check      # validate only

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = (...parts) => join(root, ...parts);
const rel = (path) => relative(root, path);

const { RULES } = await import(at("native", "store", "listing.mts"));
const identity = await import(at("pwa", "src", "identity.ts"));
const pkg = JSON.parse(readFileSync(at("package.json"), "utf8"));

// ---------------------------------------------------------------------------
// THE COPY IS NOT IN THE REPOSITORY. `native/store/copy.mts` holds every word
// a buyer reads and is gitignored — the game is paid on the App Store and open
// source on GitHub, and the listing's own prose is the one thing those two
// facts pull apart (listing.mts's header has the reasoning). What IS committed
// is `copy.example.mts`, a skeleton naming what goes where.
//
// So this resolves whichever is present and SAYS WHICH. Falling back silently
// would be the worst of the three possible behaviours: a submission built from
// the skeleton ships placeholder prose, and the only clue would be a listing
// whose subtitle reads "SUBTITLE — the hook, 30".
// ---------------------------------------------------------------------------
const COPY_FILES = ["copy.mts", "copy.example.mts"];
let copy = null;
let copyFile = "";
for (const candidate of COPY_FILES) {
  const path = at("native", "store", candidate);
  if (!existsSync(path)) continue;
  copy = await import(path);
  copyFile = candidate;
  break;
}
if (!copy) {
  console.error(
    "generate-store-metadata: no store copy. Start from the skeleton:\n" +
      "  cp native/store/copy.example.mts native/store/copy.mts\n" +
      "…then load the `store-listing` skill, which is where the craft lives — " +
      "the words themselves are deliberately not in this repository.",
  );
  process.exit(1);
}
const onSkeleton = copyFile === "copy.example.mts";

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

// Said as early as it can be said, because everything downstream is compiled
// FROM the skeleton's placeholders and looks perfectly valid: the budgets add
// up, the checks pass, and the listing that comes out has a subtitle reading
// "SUBTITLE — the hook, 30".
if (onSkeleton) {
  warn(
    "compiled from native/store/copy.example.mts — the SKELETON, not a listing. " +
      "Start the real copy with `cp native/store/copy.example.mts " +
      "native/store/copy.mts` and load the `store-listing` skill, which is where " +
      "the craft lives; the words are deliberately not in this repository.",
  );
}

// ---------------------------------------------------------------------------
// Apple's limits. Every one is enforced by App Store Connect at upload time;
// enforcing them here turns a failed submission into a failed command, which
// is a very much cheaper place to find out.
// ---------------------------------------------------------------------------
const LIMITS = {
  title: { min: 2, max: 30 },
  subtitle: { max: 30 },
  description: { min: 10, max: 4000 },
  promoText: { max: 170 },
  releaseNotes: { max: 4000 },
  supportUrl: { max: 255 },
  marketingUrl: { max: 255 },
  privacyPolicyUrl: { max: 255 },
  /** The JOINED, comma-separated keyword string — NOT each keyword. */
  keywordsJoined: { max: 100 },
  reviewNotes: { min: 2, max: 4000 },
};

/** Valve's own ceiling on the blurb under the capsule. */
const STEAM_SHORT_MAX = 300;

function checkLength(field, value, limit) {
  if (typeof value !== "string") return;
  const n = value.length;
  if (limit.max !== undefined && n > limit.max) {
    fail(`${field}: ${n} chars — the limit is ${limit.max}`);
  }
  if (limit.min !== undefined && n < limit.min) {
    fail(`${field}: ${n} chars — at least ${limit.min} is required`);
  }
}

// ---------------------------------------------------------------------------
// Compose. Brand-shaped values come from identity.ts, never from the listing,
// so there is exactly one place a rename has to happen.
// ---------------------------------------------------------------------------
const site = identity.SITE_URL.replace(/\/$/, "");
const MARKETING_URL = `${site}/`;
const PRIVACY_URL = `${site}/privacy/`;
const copyright = `${new Date().getFullYear()} ${identity.PUBLISHER}`;

// The review phone is resolved out of band — see scripts/lib/store-env.mjs.
// Absent, the field is OMITTED rather than filled with a placeholder: giving
// review a number that rings nobody is worse than leaving Apple to ask.
const { reviewPhone } = await import(at("scripts", "lib", "store-env.mjs"));
const phone = reviewPhone(root);
if (!phone) {
  warn(
    "no review phone — set ASC_REVIEW_PHONE in native/.env (never in " +
      "a committed file: this repository is public). `make store-preflight` fails until " +
      "you do; the field is left out of the upload.",
  );
} else if (!phone.startsWith("+")) {
  fail(`ASC_REVIEW_PHONE (${phone}) has no country code — Apple requires the + prefix`);
}

const info = {};
for (const [locale, authored] of Object.entries(copy.APPLE_INFO)) {
  info[locale] = {
    // Composed, not authored.
    title: identity.APP_TITLE,
    marketingUrl: MARKETING_URL,
    privacyPolicyUrl: PRIVACY_URL,
    // Authored.
    ...authored,
  };

  const i = info[locale];
  const field = (name) => `apple.info.${locale}.${name}`;
  for (const name of [
    "title",
    "subtitle",
    "description",
    "promoText",
    "releaseNotes",
    "supportUrl",
    "marketingUrl",
    "privacyPolicyUrl",
  ]) {
    checkLength(field(name), i[name], LIMITS[name]);
  }

  const keywords = i.keywords ?? [];
  if (!Array.isArray(keywords) || keywords.length === 0) {
    fail(`${field("keywords")}: at least one keyword is required`);
  } else {
    const joined = keywords.join(",");
    checkLength(`${field("keywords")} (joined "${joined}")`, joined, LIMITS.keywordsJoined);
    const dupes = keywords.filter((k, n) => keywords.indexOf(k) !== n);
    if (dupes.length) {
      fail(`${field("keywords")}: duplicated — ${[...new Set(dupes)].join(", ")}`);
    }
    // A keyword already in the title or subtitle is indexed anyway, so spending
    // part of a 100-character budget on it a second time buys nothing.
    const spent = `${i.title} ${i.subtitle ?? ""}`.toLowerCase();
    const wasted = keywords.filter((k) => spent.includes(k.toLowerCase()));
    if (wasted.length) {
      warn(
        `${field("keywords")} repeats a word already in the title or subtitle ` +
          `(indexed regardless): ${wasted.join(", ")}`,
      );
    }
  }
}

const review = { ...RULES.apple.contact, notes: copy.APPLE_REVIEW_NOTES };
checkLength("apple.review.notes", review.notes, LIMITS.reviewNotes);
for (const required of ["firstName", "lastName", "email"]) {
  if (!review[required]) fail(`apple.review.${required} is required by Apple`);
}

// ---------------------------------------------------------------------------
// Cross-check the listing against the app it describes.
//
// The review notes are not decoration: they are the argument that this app is
// not a browser pointed at a website (guideline 4.2), and every claim in them
// is checkable from here. A note that has drifted from the build is an
// argument a reviewer can disprove faster than they can read it.
// ---------------------------------------------------------------------------
const appConfig = readFileSync(at("native", "app.config.js"), "utf8");
const bundleId = /const BUNDLE_ID = "([^"]+)"/.exec(appConfig)?.[1];
if (!bundleId) fail("could not read BUNDLE_ID from native/app.config.js");

// THE CLAIM: "the entire game ships inside the binary … there is no
// streaming". `src/config.ts` treats any `extra.gameUrl` as "stream the remote
// site instead", so one appearing in the config would make the notes false for
// every build at once — store builds included.
//
// Read off the config with its COMMENTS STRIPPED, because the block that
// matters is a paragraph explaining why the field is absent — and a check that
// a file does not mention a field is a check that fails on the comment saying
// so. What is being looked for is an assignment, not the word.
const withoutComments = appConfig.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
if (/gameUrl\s*:/.test(withoutComments)) {
  fail(
    "native/app.config.js sets extra.gameUrl — the review notes claim the game " +
      "ships inside the binary, and src/config.ts reads that field as " +
      '"stream the remote site instead". One of the two has to change.',
  );
}

// THE CLAIM: a privacy policy lives at the composed URL. Apple requires the
// field, and it must resolve at review time — so the page has to exist in the
// site's own tree, not merely be promised here.
const privacyPage = at("pwa", "public", "privacy", "index.html");
try {
  readFileSync(privacyPage, "utf8");
} catch {
  fail(
    `${PRIVACY_URL} has no page behind it — ${rel(privacyPage)} does not exist. ` +
      "Apple requires the privacy URL to resolve, and the review notes name it.",
  );
}

// THE CLAIM: nothing is sold. There is no purchase surface in this game, and
// if one ever lands, these notes are the first thing that has to change.
const notes = review.notes ?? "";
if (/no in-app\s+purchases/i.test(notes)) {
  const purchases = /StoreKit|expo-in-app-purchases|react-native-iap/.test(
    readFileSync(at("native", "package.json"), "utf8"),
  );
  if (purchases) {
    fail(
      "apple.review.notes says there are no in-app purchases, but native/ " +
        "depends on a purchase library. Review reads the notes.",
    );
  }
}

// THE CLAIM: the support URL resolves and is not the source repository.
// Apple rejects a mailto:, and a listing whose support link is a GitHub tree
// is a listing that tells a player to file an issue.
const support = info["en-US"]?.supportUrl ?? "";
if (!/^https:\/\//.test(support)) {
  fail(`apple.info.en-US.supportUrl (${support}) must be an https URL — Apple rejects a mailto:`);
}
if (support.includes("github.com")) {
  fail("apple.info.en-US.supportUrl points at the source repository — it needs a support page");
}

// ---------------------------------------------------------------------------
// Steam. Valve reviews the store page and the build TOGETHER, so a page that
// advertises a feature the shell does not have is a rejection — and the whole
// point of `notYetShipped` is that the list moves as features land instead of
// somebody remembering what the shell can do today.
// ---------------------------------------------------------------------------
const steam = {
  ...RULES.steam,
  shortDescription: copy.STEAM_SHORT_DESCRIPTION,
  aboutBody: copy.STEAM_ABOUT_BODY,
};
checkLength("steam.shortDescription", steam.shortDescription, { max: STEAM_SHORT_MAX });
const steamCopy = `${steam.shortDescription}\n${steam.aboutBody}`.toLowerCase();
for (const claim of steam.notYetShipped ?? []) {
  if (steamCopy.includes(claim.toLowerCase())) {
    fail(
      `steam copy mentions "${claim}", which steam.notYetShipped says this build ` +
        "does not have. Either the shell grew the feature (drop the row) or the " +
        "copy is claiming something Valve will check.",
    );
  }
}
if (!steam.genres?.length) fail("steam.genres is empty — the store page needs at least one");
if (!steam.tags?.length) fail("steam.tags is empty");

// ---------------------------------------------------------------------------
// Emit.
// ---------------------------------------------------------------------------
for (const message of warnings) {
  console.warn(`generate-store-metadata: warning — ${message}`);
}
if (errors.length) {
  console.error("generate-store-metadata: the listing is not shippable\n");
  for (const message of errors) console.error(`  ✗ ${message}`);
  console.error("");
  process.exit(1);
}

const config = {
  configVersion: RULES.configVersion ?? 0,
  // Pinned to the game's version, so "What's New" always belongs to the build
  // it ships beside.
  version: pkg.version,
  copyright,
  apple: {
    info,
    categories: RULES.apple.categories,
    advisory: RULES.apple.advisory,
    review: { ...review, ...(phone ? { phone } : {}) },
    release: RULES.apple.release,
  },
};

/** Apple's category ids in the layout `fastlane deliver` reads. */
function categoryFiles(categories) {
  if (!Array.isArray(categories)) return {};
  const files = {};
  const put = (value, ...names) => {
    if (!value) return;
    const [head, ...subs] = Array.isArray(value) ? value : [value];
    files[names[0]] = head;
    subs.slice(0, 2).forEach((sub, i) => {
      files[names[i + 1]] = sub;
    });
  };
  const [primary, secondary] = categories;
  put(primary, "primary_category", "primary_first_sub_category", "primary_second_sub_category");
  put(
    secondary,
    "secondary_category",
    "secondary_first_sub_category",
    "secondary_second_sub_category",
  );
  return files;
}

/**
 * The fastlane metadata tree — the same listing in the layout `deliver` reads.
 * Both upload paths come off this one source so they cannot disagree, and
 * deliver reads one plain-text file per field: a MISSING file means "leave that
 * field alone in App Store Connect", which is why only what the listing
 * actually declares gets written.
 */
function writeFastlaneTree() {
  const treeRoot = at("native", "fastlane", "metadata");
  rmSync(treeRoot, { recursive: true, force: true });

  for (const [locale, i] of Object.entries(info)) {
    const dir = join(treeRoot, locale);
    mkdirSync(dir, { recursive: true });
    const files = {
      "name.txt": i.title,
      "subtitle.txt": i.subtitle,
      "description.txt": i.description,
      // deliver takes the joined string — the same budget validated above.
      "keywords.txt": i.keywords.join(","),
      "promotional_text.txt": i.promoText,
      "release_notes.txt": i.releaseNotes,
      "support_url.txt": i.supportUrl,
      "privacy_url.txt": i.privacyPolicyUrl,
      "marketing_url.txt": i.marketingUrl,
    };
    for (const [file, value] of Object.entries(files)) {
      if (value === undefined || value === null) continue;
      writeFileSync(join(dir, file), `${String(value).trim()}\n`);
    }
  }

  writeFileSync(join(treeRoot, "copyright.txt"), `${copyright}\n`);
  for (const [file, value] of Object.entries(categoryFiles(RULES.apple.categories))) {
    writeFileSync(join(treeRoot, `${file}.txt`), `${value}\n`);
  }

  const dir = join(treeRoot, "review_information");
  mkdirSync(dir, { recursive: true });
  const r = config.apple.review;
  for (const [file, value] of Object.entries({
    "first_name.txt": r.firstName,
    "last_name.txt": r.lastName,
    "email_address.txt": r.email,
    "phone_number.txt": r.phone,
    "notes.txt": r.notes,
  })) {
    if (value === undefined || value === null) continue;
    writeFileSync(join(dir, file), `${String(value).trim()}\n`);
  }

  return treeRoot;
}

/**
 * The Steamworks store page, as a document to paste into the partner site.
 *
 * Generated rather than hand-kept for the reason every other output here is:
 * the two storefronts describe one game, and a second hand-written page is a
 * second place the game's own name, version and claims can go stale.
 */
function writeSteamPage() {
  const out = at("tauri", "store", "steam-listing.md");
  const lines = [
    `<!-- GENERATED by \`make store-metadata\` from the authored listing — do not edit. -->`,
    ``,
    `# ${identity.APP_NAME} — Steamworks store page`,
    ``,
    `Paste each section into the Steamworks partner site (Store Presence → Basic`,
    `Info / Description). Regenerate with \`make store-metadata\` whenever the`,
    `listing changes; \`tauri/store/README.md\` has the rest of the submission.`,
    ``,
    `- **Version described:** ${pkg.version}`,
    `- **Copyright:** ${copyright}`,
    `- **Website:** ${MARKETING_URL}`,
    `- **Privacy policy:** ${PRIVACY_URL}`,
    `- **Support:** ${support}`,
    ``,
    `## Short description (${steam.shortDescription.length}/${STEAM_SHORT_MAX})`,
    ``,
    steam.shortDescription,
    ``,
    `## About This Game`,
    ``,
    steam.aboutBody.trim(),
    ``,
    `## Genres`,
    ``,
    steam.genres.map((g) => `- ${g}`).join("\n"),
    ``,
    `## Tags, in the order to weight them`,
    ``,
    steam.tags.map((t) => `- ${t}`).join("\n"),
    ``,
    `## What this build does NOT have`,
    ``,
    `Valve reviews the page and the build together, so none of these may appear`,
    `anywhere in the copy above — the generator refuses a page that mentions one.`,
    `As the shell grows a feature, drop its row from \`steam.notYetShipped\` and`,
    `the copy is free to say so.`,
    ``,
    (steam.notYetShipped ?? []).map((n) => `- ${n}`).join("\n"),
    ``,
  ];
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${lines.join("\n")}\n`);
  return out;
}

const en = info["en-US"];
const budget = (value, max) => `${value.length}/${max}`;

if (process.argv.includes("--check")) {
  console.log(
    `generate-store-metadata: the listing is valid — ` +
      `${Object.keys(info).length} locale(s), bundle ${bundleId}, copy from ${copyFile}` +
      `${phone ? "" : ", NO review phone"}`,
  );
} else {
  const configFile = at("native", "store", "store.config.json");
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  const fastlane = writeFastlaneTree();
  const steamPage = writeSteamPage();
  console.log(
    [
      `generate-store-metadata: wrote ${rel(configFile)}`,
      `  title      ${en.title} (${budget(en.title, 30)})`,
      `  subtitle   ${en.subtitle} (${budget(en.subtitle, 30)})`,
      `  keywords   ${en.keywords.join(",")} (${budget(en.keywords.join(","), 100)})`,
      `  promo      ${budget(en.promoText, 170)} chars`,
      `  descr      ${budget(en.description, 4000)} chars`,
      `  notes      ${budget(config.apple.review.notes, 4000)} chars` +
        `${phone ? ` — review rings ${phone}` : " — NO review phone"}`,
      `  homepage   ${en.marketingUrl}`,
      `  privacy    ${en.privacyPolicyUrl}`,
      `  copy       native/store/${copyFile}${onSkeleton ? "  ← THE SKELETON" : ""}`,
      `  fastlane   ${rel(fastlane)}`,
      `  steam      ${rel(steamPage)} (short ${budget(steam.shortDescription, STEAM_SHORT_MAX)})`,
    ].join("\n"),
  );
}
