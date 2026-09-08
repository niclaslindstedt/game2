---
name: store-listing
description: "Use when writing or rewriting the words a storefront shows a buyer — the App Store subtitle, description, promotional text, keywords and release notes, the review notes, the age-rating answers, or the Steam store page. Carries the craft and every limit; the words themselves live in a gitignored file, because the game is paid on the App Store and open source on GitHub. Load it before touching `native/store/copy.mts`, and load `store-shots` for the pictures that go beside it."
---

# Writing the store listing

The listing is the second half of a submission; the `store-shots` skill is the
first. A buyer decides in about four seconds off the icon, the subtitle and the
first screenshot, and reads the description only if those three survive.

**THE KNOWLEDGE IS IN THIS REPOSITORY AND THE WORDS ARE NOT.** That is the one
structural thing to understand before editing anything:

| File | Holds | Committed? |
| --- | --- | --- |
| `native/store/listing.mts` | types, limits, categories, age rating, the checks | yes |
| `native/store/copy.mts` | **every word a buyer reads** | **no** |
| `native/store/copy.example.mts` | a skeleton naming what goes where | yes |
| this skill | how to write it, and what the traps are | yes |

The game is **paid on the App Store** and **open source on GitHub**. Those two
facts are only in tension for the listing's copy: a description, subtitle,
promotional text and keyword set are what the store indexes and what a
competitor reads, and publishing them in a public repository puts the paid
listing's own words on a crawlable page under somebody else's domain —
competing with, and sometimes outranking, the listing they were written for.
Nothing else about the submission has that problem, which is why everything
else stayed in the open.

So: **never move a sentence of copy into a committed file**, and never
"improve" the prose in `copy.example.mts` — improving it recreates the problem
one adjective at a time. Put the craft here and the words there.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs store-listing --list`, then the ones this task
touches. Load **`skill-reflection`** at both ends of the session.

## Where everything is

Two storefronts, one authored source, because they describe one game. **The App
Store side lives under `native/`** (the Expo shell that ships the phone app) and
**the Steam side under `tauri/`** (the desktop shell that ships the download) —
each store's assets sit beside the shell that submits them, and the copy they
share is authored once.

### What you edit

| File | What it holds |
| --- | --- |
| `native/store/copy.mts` | **Every word both stores show.** Gitignored. This is the file you write. |
| `native/store/listing.mts` | The rules: types, categories, age rating, contact, Steam tags, `notYetShipped` |
| `native/.env` | `ASC_REVIEW_PHONE` and the upload credentials. Gitignored. |
| `pwa/src/identity.ts` | The name, the site URL, the palette — the COMPOSED fields come from here |
| `pwa/public/privacy/index.html` | The privacy policy the listing names. Apple fetches it. |
| `pwa/public/support/index.html` | The support page. Apple requires one and rejects a `mailto:`. |

### What runs

| Command | Does |
| --- | --- |
| `make store-metadata` | compiles the listing; validates every limit; says which copy module it used |
| `make store-metadata ARGS="--check"` | validates without writing |
| `make store-preflight` | what is still missing, BOTH storefronts, with store-gated items marked |
| `make store-preflight ARGS="--now"` | …narrowed to what needs no store account |
| `make store-shots` | the screenshot set for both stores (the `store-shots` skill owns it) |
| `npx vitest run tests/store_listing_test.ts` | the limits, and the claims the notes make about the build |

### What comes out — all of it gitignored build output, never hand-edited

| Output | For | Consumed by |
| --- | --- | --- |
| `native/store/store.config.json` | App Store | `eas metadata:push` (text only) |
| `native/fastlane/metadata/**` | App Store | `fastlane deliver` (text + shots) |
| `native/store/screenshots/<device>/` | App Store | `fastlane deliver`, or by hand |
| `tauri/store/steam-listing.md` | Steam | pasted into Steamworks by hand |
| `tauri/store/screenshots/steam-1080/` | Steam | uploaded by hand |

### Committed alongside, and not yours to author

`native/store/README.md` (the submission package), `native/RELEASING.md` (the
Apple/Play run-through and what is gated on an enrolled account),
`tauri/store/README.md` (the Steam half, including the four capsule images
Valve requires), `tauri/store/steam.json` (the app and depot ids — identifiers,
not secrets), and `scripts/generate-store-metadata.mjs` (where every rule in
this skill is actually enforced).

### The two storefronts, side by side

|  | App Store (`native/`) | Steam (`tauri/`) |
| --- | --- | --- |
| Short pitch | `subtitle`, ≤ 30 | `STEAM_SHORT_DESCRIPTION`, ≤ 300 |
| Long pitch | `description`, ≤ 4000, phone-shaped | `STEAM_ABOUT_BODY`, desktop, `[b]markup[/b]` |
| Keywords | ≤ 100 chars JOINED | none — `tags`, weighted, in `listing.mts` |
| Screenshot layout | `framed` (band above the frame) | `bleed` (band over a full-bleed frame) |
| Reviewed against | guideline 4.2, via the review notes | the BUILD — hence `notYetShipped` |
| What you cannot script | the privacy/rating questionnaires | the capsule art, and the depot upload |
| Uploads with | `fastlane deliver` / `eas submit` | Steamworks by hand + `steamcmd` |

## Start here

```sh
cp native/store/copy.example.mts native/store/copy.mts   # once, on a new checkout
make store-metadata      # compile + validate; says which copy module it used
make store-preflight     # what is still missing, both storefronts
```

**And keep a backup of `copy.mts` outside this checkout.** Nothing in the
repository backs it up, by design; a clone has the skeleton and not the
listing. Losing it means rewriting the listing from this skill.

## Every limit, and which ones bite

The generator enforces all of these and **fails rather than truncates**,
because App Store Connect truncates silently and finding out from a live
listing is the expensive path.

| Field | Limit | What to know |
| --- | --- | --- |
| `title` | 2–30 | COMPOSED from `identity.ts` — not yours to author |
| `subtitle` | ≤ 30 | indexed for search as well as read |
| `keywords` | ≤ 100 | **the comma-JOINED string**, not each term |
| `promoText` | ≤ 170 | the only field that changes without a build |
| `description` | 10–4000 | only the first two lines show before "more" |
| `releaseNotes` | ≤ 4000 | belongs to the version it ships beside |
| `review.notes` | 2–4000 | the highest-leverage field in the submission |
| `steam.shortDescription` | ≤ 300 | Valve's own |

**The keyword field is the one that surprises people.** The 100 characters are
spent on the joined string — `drift,racing,offline,…` — commas included. Three
rules follow:

1. **Never spend a keyword the title or subtitle already spends.** Apple indexes
   those anyway, so a repeat buys nothing and costs its own length. The
   generator warns when one creeps back in; the test fails on it.
2. **Singulars only, and no word order.** Apple's index does not care, so
   "stage" covers "stages" and `a,b` covers `b,a`.
3. **No competitor names and no real trademarks.** Never in this game (see
   `docs/naming.md`), and Apple rejects the listing for it besides.

## The description: what actually goes in it

Written to be read on a phone, in this order:

1. **The hook, in two lines.** That is all the store shows before "more", and
   most readers never press it. It has to say what the game IS and what is
   unusual about it, in a sentence that could not be said about ten other games.
2. **What you actually do**, with the controls in it. A player deciding wants to
   know what their thumbs will be doing.
3. **The things that make it unusual**, one short block each with a bare
   heading. Blocks, not paragraphs: a wall of prose on a phone is not read.
4. **What it does NOT do**, if that is a selling point. No account, no ads, no
   internet, nothing sold inside it — for this game those four are among the
   strongest lines available, because most of the market cannot say them.

Write plainly. A listing that reads like the game reads honest; one that reads
like an ad reads like every other listing on the shelf.

## The review notes are an argument, not a description

**This is the field that decides whether the app ships at all.** A WebView-shaped
app is judged under **App Store guideline 4.2 (minimum functionality)**, and
review's default reading of one is "a wrapper around a website". The notes are
where that reading is answered, and they must say, plainly:

- **No account, no login.** Launch and press PLAY.
- **How to play**, in two sentences, for both the touch controls and the desktop
  ones. A reviewer who cannot work out the controls files a rejection about the
  controls.
- **That the WHOLE game ships inside the binary** (`assets/webroot.zip`) and is
  served by an HTTP server on the device, so it is playable in airplane mode
  from first launch and makes no network request in order to run. This is the
  4.2 argument. Name the file.
- **What the native layer adds** that a browser cannot — the audio session, the
  local server, the haptics, links handed to the system browser.
- **That nothing is sold and no data is collected**, and where the privacy page
  says so.
- **Where to look first** to see the most of the game quickly: name a specific
  short level and roughly how long it takes.

**Every claim in there is checked against the build**, by
`scripts/generate-store-metadata.mjs` and `tests/store_listing_test.ts`. A note
that has drifted is an argument a reviewer can disprove faster than they can
read it, so the checks fail on:

- an `extra.gameUrl` in `app.config.js` — `src/config.ts` reads it as "stream
  the remote site instead", which makes the bundled-binary claim false for every
  build at once;
- a purchase library in `native/package.json` while the notes say nothing is
  sold;
- a missing `pwa/public/privacy/index.html` behind the URL the notes name;
- a support URL that is a `mailto:` (Apple rejects it) or the source repository.

**If it is rejected under 4.2 anyway, do not argue — point at airplane mode.**

## The phone number is not copy

Apple **rings** the review contact, and this repository is public. The number
comes from `ASC_REVIEW_PHONE` in the gitignored `native/.env`
(`scripts/lib/store-env.mjs`), never from any committed or authored file. The
generator omits the field rather than upload a number that rings nobody, and
`make store-preflight` fails until one is set. The name and mailbox beside it
ARE committed, in `listing.mts` — they are the publisher's public contact
details, which the listing shows anyway.

## The age rating: answer honestly, and say why in the comment

The `advisory` block in `listing.mts` is committed on purpose — an age-rating
answer is a claim about the build that a public repository should be able to
check. Two rules:

- **A wrong answer is a rejection**, and "wrong" includes over-cautious in a way
  that contradicts the screenshots. Each row carries a comment saying why it is
  what it is; keep that up.
- **The obvious trap for this game is violence.** Cars hit trees and roll.
  Nobody is hurt and nothing bleeds, but a car coming apart is cartoon violence
  and answering NONE is the answer that gets looked at.

The questionnaire still has to be walked through once per storefront in the
console; the authored answers are what you walk it through WITH.

## Steam is a different shop window, not a different game

One authored source describes both, because they are one product — but the page
differs in three ways that matter:

- **A 300-character blurb** under the capsule, doing the job the subtitle does
  on the App Store.
- **A desktop reader.** Longer blocks are fine; Steam's own `[b]markup[/b]`
  works; the pitch can assume a monitor and a keyboard.
- **`notYetShipped` is load-bearing.** Valve reviews the store page and the
  build **together**, so a feature presented as shipped is a rejection rather
  than an aspiration. That list in `listing.mts` names what the desktop shell
  deliberately lacks — cloud save, achievements, leaderboards, Workshop,
  multiplayer — and the generator **refuses to emit a page whose copy mentions
  any of it**. As the shell grows a feature, drop its row and the copy is free
  to say so. Do not work around the refusal; it is the check working.

## Never name a real party

`docs/naming.md` governs the game and it governs the listing: nothing is named
after a real person, company, product or franchise, and that includes the
near-miss pun. In a listing the temptation is comparative — "like ⟨famous rally
game⟩" — and it is both a trademark problem and a weaker sentence than saying
what this game does.

## Before you call it done

1. `make store-metadata` — read the budget line it prints. A field at 29/30 is
   fine; a field at 30/30 is one rename away from failing.
2. `npx vitest run tests/store_listing_test.ts` — the limits and the claims.
   **And run the gates with `copy.mts` MOVED ASIDE too**, because a gitignored
   source module means this checkout is not a clone and the local whole-repo
   check is not the one CI runs:

   ```sh
   mv native/store/copy.mts /tmp/ \
     && npx tsc --noEmit && npx eslint . \
     && npx vitest run tests/store_listing_test.ts
   mv /tmp/copy.mts native/store/
   ```

3. `make store-preflight` — it reports running on `copy.example.mts` as
   outstanding, because a submission built from the skeleton would ship
   placeholder prose.
4. **Read the description on a phone-width column**, not in an editor. The first
   two lines are the listing.
5. Back `copy.mts` up somewhere that is not this checkout.
