// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DETAIL PRESETS, and the rows the picture menu shows. Three named
// levels a player picks in one press, the ladders each lever walks, and
// the reverse reading that says which preset a hand-tuned set of levers is
// nearest — so the menu can show "medium" for a set nobody chose by name.

import { NATIVE_HEIGHT, renderHeightStops } from "./desktop-video.ts";
import type { VideoSettings } from "./settings-video.ts";

/** THE PICTURE, AS FIVE QUESTIONS: how sharp, how much, how far, how lit,
 * and what the air over it is made of. Every one of the thirteen levers
 * above is real and still read by the renderer, but a player does not have
 * an opinion about undergrowth density — they have an opinion about whether
 * the game is smooth, and about which of the things making it unsmooth they
 * would rather keep. Five rows is what lets them answer that: RESOLUTION,
 * DISTANCE, LIGHTING and SKY are single levers, and DETAIL is the ten that
 * are one judgement.
 *
 * The point of the split is that the five costs are NOT the same cost.
 * Resolution is pixels — every one of them, every frame, whatever is on
 * screen. Distance is how much stage is submitted at all. Detail is how
 * much of it there is per metre — the geometry each one is made of, the
 * dust the cars hang over it, and what a crash is allowed to do to them.
 * Lighting is pixels again, but only the LIT ones, and it is the one cost
 * that does not fall when the world on screen gets thinner: a spotlight is
 * evaluated by every pixel it might reach whether it reaches it or not. Sky
 * is the ones with nothing in front of them, read at a depth the rest of
 * the frame never pays.
 *
 * A machine can be short of one and rich in another, and a phone with a
 * dense screen is the ordinary case of exactly that: it wants the pixels it
 * has and would rather give up the far ridges than look at a soft picture.
 * Under one knob that trade could not be expressed at all. */
export type Detail = "low" | "medium" | "high";

/** The ten levers DETAIL owns. Named as a slice of `VideoSettings` rather
 * than restated, so adding another is a decision about which row it belongs
 * on instead of a silent omission from both. */
export type DetailSettings = Pick<
  VideoSettings,
  | "effects"
  | "interior"
  | "glass"
  | "crumple"
  | "wheelLoss"
  | "flora"
  | "ground"
  | "dust"
  | "exhaust"
  | "snow"
>;

/** What each DETAIL stop is worth, cheapest first — the order the ladder is
 * walked and the order `detailOf` breaks its ties in. Changing a preset here
 * changes what LOW, MEDIUM and HIGH mean everywhere, including for every
 * blob already stored. */
export const DETAIL_PRESETS: Record<Detail, DetailSettings> = {
  // The phone that stutters: every window solid and every wiper off, the
  // verges bare, under half the particles, a lost wheel gone rather than
  // rolling, nobody on the road raising any ground, not a tailpipe or a
  // plume of smoke on the whole entry list, no body bent by what it hit,
  // and every wheel staying on the car that lost it.
  low: {
    effects: "low",
    interior: "off",
    glass: "player",
    crumple: "off",
    wheelLoss: "off",
    flora: "sparse",
    ground: "plain",
    dust: "off",
    exhaust: "off",
    snow: "plain",
  },
  // The design point — every lever at the number the game was tuned on, and
  // everything that is per car spent on the one car it is worth the most
  // on: the car being driven has the cabin, the wipers, the dust, the pipes
  // and the smoke out of them, the folded panels and the wheels it can
  // actually lose, and the field's share of all six is what the machine
  // buys back.
  medium: {
    effects: "full",
    interior: "full",
    glass: "player",
    crumple: "player",
    wheelLoss: "player",
    flora: "normal",
    ground: "normal",
    dust: "player",
    exhaust: "player",
    snow: "plain",
  },
  // A machine with headroom: a thicker forest floor, stonier verges, and the
  // whole entry list furnished behind its glass, towing dust, wearing its
  // own tailpipes and steaming out of them on the line, wearing every dent
  // it has earned and able to be put out by a lost wheel, the way a rally
  // actually looks.
  high: {
    effects: "full",
    interior: "full",
    glass: "all",
    crumple: "all",
    wheelLoss: "all",
    flora: "lush",
    ground: "rich",
    dust: "all",
    exhaust: "all",
    snow: "crystal",
  },
};

/** The picture ladders, as the menu walks them. No hints: what the rows do
 * is `VideoSettings` above, for anyone reading the code, and on screen the
 * row's own name and its three stops are the explanation — a page of
 * settings that has to be read is a page that has failed. */
export const RESOLUTION_STOPS: { id: VideoSettings["resolution"]; label: string }[] = [
  { id: "low", label: "LOW" },
  { id: "medium", label: "MEDIUM" },
  { id: "high", label: "HIGH" },
];

export const DETAIL_STOPS: { id: Detail; label: string }[] = [
  { id: "low", label: "LOW" },
  { id: "medium", label: "MEDIUM" },
  { id: "high", label: "HIGH" },
];

export const DISTANCE_STOPS: { id: VideoSettings["drawDistance"]; label: string }[] = [
  { id: "near", label: "NEAR" },
  { id: "normal", label: "NORMAL" },
  { id: "far", label: "FAR" },
];

/** The stops name how much LIGHT is thrown rather than a quality, because
 * that is what the ladder actually is: a cap on the beams a car may cast
 * and on the shadow map under it. LEAN is the one headlamp beam a night
 * stage needs and no shadow at all; NORMAL is a beam per end and a coarser
 * map; FULL is every lamp the body authored, the rivals' lamps on the dust,
 * and the sharp map the cars themselves read. */
export const LIGHTING_STOPS: { id: VideoSettings["lighting"]; label: string }[] = [
  { id: "lean", label: "LEAN" },
  { id: "normal", label: "NORMAL" },
  { id: "full", label: "FULL" },
];

/** The stops name what the sky IS rather than how much of it there is,
 * because that is what a player is choosing between: a flat drawn one, the
 * real sheets at their real heights, or those with the sun working on their
 * edges and their shadows on the ground. */
export const SKY_STOPS: { id: VideoSettings["sky"]; label: string }[] = [
  { id: "simple", label: "SIMPLE" },
  { id: "layered", label: "LAYERED" },
  { id: "full", label: "FULL" },
];

/** Where the rows stand on a first launch — and the answers are not the
 * same answer, because the costs are not the same cost.
 *
 * RESOLUTION ships HIGH, which is now the device's own screen rather than a
 * cap over it. Sharpness is the one thing a player cannot get back by
 * looking harder: a soft picture reads as a cheap game on the first frame,
 * before anything has been driven. It is also the row that is cheapest to
 * MOVE — it applies the moment it is set, mid-stage, with nothing rebuilt —
 * so a machine that cannot hold it says so within a corner and the fix is
 * one press away.
 *
 * DETAIL ships MEDIUM: the design point, every lever at the number the game
 * was tuned on, with the per-car spending on the one car it is worth most
 * on. HIGH there is a choice somebody makes after finding out they can.
 *
 * LIGHTING ships NORMAL, the same design point for the same reason: a beam
 * at each end and a shadow under the car is what the game was tuned to look
 * like, and it is the stop that leaves a night stage drivable without
 * charging every lit pixel for the car's whole complement. FULL is the
 * machine with headroom; LEAN is the phone that would rather have the
 * frames, and it is the row to reach for FIRST on one — a spotlight is
 * charged to every pixel it might reach whether or not there is anything
 * left on screen for it to light, so it is the one lever turning DETAIL
 * down cannot make cheaper.
 *
 * SKY ships LAYERED: the design point, the real cloud chart at its real
 * altitudes, one stop short of lighting every cloud edge by a second sample
 * and throwing their shadows on the ground. FULL there is the same kind of
 * choice HIGH is on DETAIL — something a player picks after finding out the
 * machine can hold it.
 *
 * DISTANCE ships NEAR, which is the row that pays for the others. What it
 * buys back is the far half of the world — ridges read through fog at the
 * horizon, submitted every frame and looked at by nobody at rally pace,
 * where the picture that matters is the next four seconds of road. Giving up
 * the ridges to keep the pixels is the trade a phone should be born making;
 * a player who wants the view has one row to move and sees it immediately. */
export const DEFAULT_VIDEO: VideoSettings = {
  resolution: "high",
  renderHeight: NATIVE_HEIGHT,
  drawDistance: "near",
  lighting: "normal",
  sky: "layered",
  ...DETAIL_PRESETS.medium,
};

/** THE PICTURE ROWS, NAMED ONCE. OPTIONS ▸ VIDEO sets them and the
 * benchmark's card reports what they were standing at, and the two have to
 * agree or a score cannot be mapped back onto the menu that produced it. */
export const PICTURE_ROWS = {
  resolution: "RESOLUTION",
  detail: "DETAIL",
  distance: "DISTANCE",
  lighting: "LIGHTING",
  sky: "SKY",
} as const;

/** One row, as it reads on screen. */
export type PictureRow = { label: string; value: string };

/** What the picture is set to, in the rows the player actually turns —
 * every value taken off the same stop list the menu walks, so the card and
 * the menu cannot drift into two vocabularies for one setting.
 *
 * `desktop` is `desktopPicture()`, asked by the caller rather than here: the
 * shell is a fact about where the code is running, and a pure function that
 * went and looked would be one no test could put on the other machine. On
 * the desktop the RESOLUTION row is a height in pixels (desktop-video.ts),
 * and the ladder is read with the window unknown so every stop is on it —
 * this is reporting a stored choice, not offering one. */
export function pictureRows(video: VideoSettings, desktop: boolean): PictureRow[] {
  const stop = (stops: readonly { id: string; label: string }[], id: string): string =>
    stops.find((s) => s.id === id)?.label ?? id.toUpperCase();
  return [
    {
      label: PICTURE_ROWS.resolution,
      value: desktop
        ? stop(renderHeightStops(0), String(video.renderHeight))
        : stop(RESOLUTION_STOPS, video.resolution),
    },
    { label: PICTURE_ROWS.detail, value: stop(DETAIL_STOPS, detailOf(video)) },
    { label: PICTURE_ROWS.distance, value: stop(DISTANCE_STOPS, video.drawDistance) },
    { label: PICTURE_ROWS.lighting, value: stop(LIGHTING_STOPS, video.lighting) },
    { label: PICTURE_ROWS.sky, value: stop(SKY_STOPS, video.sky) },
  ];
}

/** THE SAME ROWS AS LADDERS — every stop each one can report, cheapest
 * first.
 *
 * `pictureRows` above says what a row READS right now; this says what it
 * could ever have read, which is what anything decoding a stored row back
 * into a POSITION needs — the benchmark's score sheet draws each row as a bar
 * whose height is its rung on its own ladder (`benchmark-sheet.ts`).
 *
 * IT LIVES HERE, INCHES FROM `pictureRows`, because the two are one list
 * written twice and the cost of them disagreeing is silent: a row added to
 * `pictureRows` alone still reports a value, and every stored run then draws
 * it as "a stop this build does not have". That is exactly what a LIGHTING
 * row added to one and not the other did. `tests/picture_rows_test.ts` walks
 * every stop of every row through both and fails when they diverge.
 *
 * RESOLUTION carries TWO ladders, because the row is a different question in
 * the desktop app: a share of the screen in a browser tab, a height in pixels
 * in a window the game owns (`desktop-video.ts`). A given run was measured on
 * one of them, so both are offered and the stored value picks. The desktop
 * ladder is REVERSED on the way in — the row is walked downhill from NATIVE
 * on screen, and a ladder is climbed. */
export const PICTURE_LADDERS: { label: string; ladders: string[][] }[] = [
  {
    label: PICTURE_ROWS.resolution,
    ladders: [
      RESOLUTION_STOPS.map((s) => s.label),
      renderHeightStops(0)
        .map((s) => s.label)
        .reverse(),
    ],
  },
  { label: PICTURE_ROWS.detail, ladders: [DETAIL_STOPS.map((s) => s.label)] },
  { label: PICTURE_ROWS.distance, ladders: [DISTANCE_STOPS.map((s) => s.label)] },
  { label: PICTURE_ROWS.lighting, ladders: [LIGHTING_STOPS.map((s) => s.label)] },
  { label: PICTURE_ROWS.sky, ladders: [SKY_STOPS.map((s) => s.label)] },
];

/** Which DETAIL stop a set of video knobs IS: by exact match, else the stop
 * that agrees with the most of the ten, ties going to the CHEAPER picture
 * because `DETAIL_PRESETS` is walked cheapest first. So a blob written on
 * another build's ladder — or on the old single QUALITY row — lands on the
 * picture it most resembles, and never on a heavier one than it asked for.
 * A blob with none of the ten in it is a blob with no opinion, which is
 * MEDIUM: the design point, not the floor. */
export function detailOf(video: Partial<VideoSettings>): Detail {
  const ids = Object.keys(DETAIL_PRESETS) as Detail[];
  const keys = Object.keys(DETAIL_PRESETS.medium) as (keyof DetailSettings)[];
  let best: Detail = "medium";
  let agreed = 0;
  for (const id of ids) {
    const agree = keys.filter((key) => DETAIL_PRESETS[id][key] === video[key]).length;
    if (agree > agreed) {
      best = id;
      agreed = agree;
    }
  }
  return agreed > 0 ? best : "medium";
}
