// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FRONT DOOR — the first card the game shows, over the live bot-driven
// stage the whole menu is painted on.
//
// It is one HERO and a block of tiles, and that shape is the whole design.
// CAMPAIGN is not one of six equal choices and never was: it is the game,
// and every other entry is a way of driving roads it has opened or of
// setting the game up to be driven. So it gets the size that says so, and
// carries how far through the ladder the player is — the one fact worth
// reading before pressing anything.
//
// Under them the foot: what is not a way onto a road at all (the pictures
// and the runs already taken, the knobs, the developer's door) and the
// build the whole thing is.
//
// NOT EVERY BUILD DRAWS EVERY ENTRY. Roam and the training ground ride
// feature flags (`features.ts`); this page draws what the build ships and
// leaves everything behind them untouched.

import { feature, type Feature } from "../features.ts";
import { APP_NAME, REPO_URL } from "../identity.ts";
import { LOCATIONS, levelCleared, type CampaignProgress } from "./campaign.ts";
import { MarkTracks } from "./mark-tracks.tsx";
import { Glyph, type GlyphName } from "./menu-glyphs.tsx";
import { TRAINING_ID } from "./training.ts";
import type { MenuPage } from "./main-menu.tsx";

/** The build, bottom right, linking to the exact commit it was cut from.
 * A build with no commit behind it (a working tree, `git` unavailable) says
 * so and links nowhere — a dead link is worse than an honest label. */
export function VersionStamp() {
  const label = `v${__APP_VERSION__}`;
  const sha = __COMMIT_SHA__;
  if (!sha || sha === "dev") {
    return <span className="menu-version menu-version-dev">{label} · dev</span>;
  }
  return (
    <a
      className="menu-version"
      href={`${REPO_URL}/commit/${sha}`}
      target="_blank"
      rel="noreferrer noopener"
      title="Open this build's commit on GitHub"
    >
      {label} · {sha}
    </a>
  );
}

/** Where the CAMPAIGN tile lands. A page listing ONE biome is a press
 * that asks nothing — so while there is only one, the tile opens it and the
 * list is skipped. The rule is read off the catalog rather than hardcoded:
 * the day a second biome ships, the list comes back on its own, and
 * `parentOf` reads the same rule so BACK never lands on the skipped page. */
export function campaignEntry(): MenuPage {
  return LOCATIONS.length === 1
    ? { page: "location", locationId: LOCATIONS[0].id }
    : { page: "campaign" };
}

/** ONE ENTRY ON THE CARD.
 *
 * A glyph and a name, and nothing else. An entry carrying a sentence saying
 * what its mode is, is a menu explaining itself: a card of explanations
 * fills a phone, and none of them survives the second visit — what HEADS UP
 * is, is learned by pressing it once.
 *
 * `data-menu` is the stable hook the capture harness presses; the label is
 * free to change without a probe changing with it. */
type RootItem = {
  key: string;
  glyph: GlyphName;
  label: string;
  page: MenuPage;
  /** The flag this entry rides on, where it rides on one (`features.ts`).
   * An entry with no flag is in every build. */
  flag?: Feature;
};

/** The other ways onto a road: the campaign's stages raced without the
 * championship, and the two modes that are not the campaign's roads at all. */
const MODE_ITEMS: RootItem[] = [
  { key: "timetrial", glyph: "stopwatch", label: "TIME TRIAL", page: { page: "timetrial" } },
  { key: "headsup", glyph: "headsup", label: "HEADS UP", page: { page: "headsup" } },
  { key: "roam", glyph: "roam", label: "ROAM", page: { page: "roam" }, flag: "roam" },
  {
    key: "training",
    glyph: "cone",
    label: "TRAINING",
    page: { page: "car", levelId: TRAINING_ID, mode: "training" },
    flag: "training",
  },
];

/** ...and the three that are not a way onto a road at all: things the
 * player has already made, and the knobs. They wear the foot of the card,
 * in a line, at the size of a press nobody came to the front door FOR. */
const QUIET_ITEMS: RootItem[] = [
  { key: "replays", glyph: "replay", label: "REPLAYS", page: { page: "replays" } },
  { key: "gallery", glyph: "camera", label: "GALLERY", page: { page: "gallery" } },
  { key: "options", glyph: "sliders", label: "OPTIONS", page: { page: "options" } },
];

/** What a build actually offers, of a list (`features.ts`). */
function shipped(items: RootItem[]): RootItem[] {
  return items.filter((item) => item.flag === undefined || feature(item.flag));
}

/** HOW FAR THROUGH THE GAME THE PLAYER IS, in the one line under CAMPAIGN.
 * Every stage in the game rather than every stage OPEN: the point of the
 * line is the size of what is left, and a denominator that grows as you
 * play is a progress bar that never fills. */
function stagesCleared(progress: CampaignProgress): { cleared: number; of: number } {
  let cleared = 0;
  let of = 0;
  for (const location of LOCATIONS) {
    for (const level of location.levels) {
      of += 1;
      if (levelCleared(progress, level.id)) cleared += 1;
    }
  }
  return { cleared, of };
}

export function RootPage({
  developer,
  progress,
  onNavigate,
}: {
  developer: boolean;
  progress: CampaignProgress;
  onNavigate: (page: MenuPage) => void;
}) {
  const { cleared, of } = stagesCleared(progress);
  const modes = shipped(MODE_ITEMS);
  return (
    <div className="menu-card menu-card-root">
      {/* THE MASTHEAD: the mark, the name beside it, the billing on its own
          line under the pair. Ranged left rather than centred, because it is
          the card's heading and the body under it is not symmetrical — a
          centred heading over an asymmetric block reads as a second axis
          competing with the real one. */}
      <div className="menu-brand">
        <MarkTracks lay="once" className="menu-brand-mark" />
        <span className="menu-brand-name">{APP_NAME.toUpperCase()}</span>
        <span className="menu-brand-tag">arcade rally drifting</span>
      </div>
      <div className="menu-front">
        <button
          type="button"
          className="menu-hero"
          data-menu="campaign"
          data-nav-next
          onClick={() => onNavigate(campaignEntry())}
        >
          <Glyph name="trophy" />
          <span className="menu-tile-name">CAMPAIGN</span>
          <span className="menu-hero-line">
            {cleared} OF {of} STAGES CLEARED
          </span>
        </button>
        {/* `data-few` is the shape of the block, not a count: a build that
            ships only two of these wants them stacked rather than drawn as
            two narrow towers beside the hero. */}
        <div className="menu-tiles" data-few={modes.length <= 2 ? "" : undefined}>
          {modes.map((item) => (
            <button
              key={item.key}
              type="button"
              className="menu-tile"
              data-menu={item.key}
              onClick={() => onNavigate(item.page)}
            >
              <Glyph name={item.glyph} />
              <span className="menu-tile-name">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="menu-foot">
        <div className="menu-quiet">
          {QUIET_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="menu-chip"
              data-menu={item.key}
              onClick={() => onNavigate(item.page)}
            >
              <Glyph name={item.glyph} />
              <span>{item.label}</span>
            </button>
          ))}
          {developer && (
            <button
              type="button"
              className="menu-chip menu-chip-dev"
              data-menu="developer"
              onClick={() => onNavigate({ page: "developer" })}
            >
              <Glyph name="terminal" />
              <span>DEVELOPER</span>
            </button>
          )}
        </div>
        <VersionStamp />
      </div>
    </div>
  );
}
