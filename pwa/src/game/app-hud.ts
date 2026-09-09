// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HUD'S OWN CLOCKS AND THE SHAPES BEHIND THEM: how long a news line
// stands and how it goes out, how long a split holds, what a field being
// settled after the flag looks like while it is happening, and what
// WATCHING somebody else's run is — the two ways in (a backdrop under the
// results, and a live feed) and the camera each of them opens on.

import { type HudSnapshot } from "./hud.tsx";
import { type RivalField } from "./standings.ts";
import { type Watched } from "./spectate.ts";

/** THE NEWS COLUMN, at the foot of the screen (`.hud-flashes`). Five lines
 * STAND at a time and each one holds its place for fifteen seconds: news
 * about the car arrives while the driver is busy with a corner, and a line
 * that has come and gone by the time they look up has told nobody anything.
 * Five is what the corner holds at that size without becoming a wall.
 *
 * A sixth line does not wait for the oldest one's clock to run out — it puts
 * it out early, over FLASH_FADE, which is the same fade its own fifteen
 * seconds would have ended in. The CSS runs both fades (`hud-flash-fade`);
 * these numbers only have to agree with it, because the row is dropped when
 * the fade it is playing is over. */
let flashId = 0;

/** The next news line's id. A counter rather than an index: a line is
 * dropped when its own fade is over, so an id is never re-used while the
 * row keyed by it is still fading out. */
export function nextFlashId(): number {
  return ++flashId;
}

export const FLASH_LINES = 5;
export const FLASH_LIFE = 15000;
export const FLASH_FADE = 400;

/** How long a split stays on screen, SECONDS OF THE RUN. Long enough to read
 * the gap and the clock under it at speed, and a small fraction of the gap
 * between boards, so a second split is always the first one long gone.
 *
 * Measured on the race clock rather than on a timer, because that is the
 * clock the reading belongs to: a paused run holds its split the way it
 * holds everything else on the HUD, and a machine rendering the stage at a
 * fraction of real time shows it for as much of the ROAD as a machine that
 * is keeping up. */
export const SPLIT_HOLD = 3.6;

/** R30 — one run-out in progress: the field still on the road, and everything
 * the classification it is going to produce has to be filed under. Named
 * rather than inlined on the ref because three frames read it — the card's
 * own backdrop, the feed a press of SPECTATE opens (spectate.ts), and the
 * one-go settle that books the sheet when the player presses on. */
export type Settling = {
  field: RivalField;
  levelId: string;
  /** The player's own stage time, and the car they set it in. */
  time: number;
  carId: string;
  /** …and their split times in board order, which is what a spectator's gap
   * is measured against: the crew on screen is racing a time that is already
   * on the sheet. */
  splits: number[];
  /** Race time at which anybody still going is retired where they stand. */
  limit: number;
  /** Whether the classification goes on the campaign's board. False on a
   * heads-up race, which is settled to be READ and never written down. */
  score: boolean;
};

/** HOW THE RUN-OUT IS BEING WATCHED.
 *
 * `backdrop` is the default and needs no press: once the player's own
 * roll-out is over, their car is parked and the race is still on, so the
 * results card sits over the RACE rather than over a stationary car — the
 * leader of what is left, driving.
 *
 * `feed` is what SPECTATE buys: the same run-out, the same shot, with the
 * card down, the whole driving layout pointed at the crew on screen, and the
 * banner naming them over the two buttons that walk the field
 * (spectate.ts). */
export type WatchMode = "off" | "backdrop" | "feed";

/** THE FEED, as the HUD wears it: the banner's line on the crew under the
 * camera, and the instruments the driving layout is pointed at them with —
 * their clock, their revs, their gear, their dents, their route, their
 * place. One object because both halves are read off the same crew on the
 * same tick, and a HUD holding one of them without the other would be a
 * name over somebody else's numbers for a frame. */
export type WatchFace = { feed: Watched; snap: HudSnapshot };

/** …and the camera each is watched from. It is an OUTSIDE view and not a
 * choice: the in-car rigs are measured off the silhouette of the car the
 * stage was built around (`setEyes`), and the car on screen is somebody
 * else's.
 *
 * BOTH ways of watching take the SAME rig, and that is the point of the
 * pair being written out here rather than assumed. The transit that carries
 * the lens onto a crew (camera-sweep.ts) lands it behind them in the view
 * the player was just driving in, which is the shot a spectator is owed —
 * so pressing SPECTATE over the card is the card coming down rather than the
 * camera going somewhere else, and BACK TO RESULTS is it going back up.
 * A second flight between two ways of watching the same car said nothing
 * about the race and cost a second of it. */
export const WATCH_CAMERA = { backdrop: "chase", feed: "chase" } as const;

/** How much of R25's roll-out the player's own car keeps before the card's
 * backdrop takes the frame, s.
 *
 * The flying finish is the celebration and it is worth having: the camera
 * plants at the gate, holds, and watches the car go down the run-out. But it
 * is a GESTURE, and it is over long before the car has finished coasting —
 * past this the shot is a small car receding, and there is a race going on
 * somewhere up the road. So the beat is given its seconds and then handed
 * over, rather than waiting out a roll-out that can run for half a minute.
 *
 * Measured on `rollout`, the run's own clock for the beat, so a machine
 * drawing the stage at a fraction of real time gives the shot the same
 * amount of ROAD as one that is keeping up. */
export const BACKDROP_AFTER = 4.5;

/** Steps per pass when the run-out is finished off in one go, and how many
 * passes it is given. The product is far more road than `settleLimit` can
 * ever ask for, and the whole thing is spent on a screen that is being torn
 * down anyway — see `settleNow`. */
export const SETTLE_ALL = 20_000;
export const SETTLE_PASSES = 500;

/** How much of a frame the LOADING BEAT may spend writing the field down,
 * ms. The beat is a held frame with a caption on it, so it is not paying
 * for smoothness: forty is a picture that still answers at twenty-odd
 * frames a second while nearly all of the machine goes on the field. */
export const FIELD_HOLD_MS = 40;

/** How long the loading card takes to fade off the road, ms. Must match the
 * `.loading` transition in styles.css, which is what times the unmount
 * behind it. */
export const LOAD_FADE_MS = 260;

/** Air time under which a landing is not worth a banner, s — every ripple
 * and curb technically leaves the ground, and "CLEAN AIR 0.0s" three times
 * in a row is the HUD talking over the game. */
export const REAL_AIR = 0.5;
