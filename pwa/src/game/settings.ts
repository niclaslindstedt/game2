// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options — what the HUD shows, how hard the renderer works,
// and how the car is driven — in one persisted blob.
//
// Almost everything here is SCREEN-space and app-side: the engine neither
// knows nor cares. The one exception is the gearbox, which the engine does
// read — it is a choice about how the car is DRIVEN rather than how it is
// drawn, and it is offered for every car in the roster. The renderer reads
// `VideoSettings`, the HUD reads the `HudShow` derived from `HudSettings`,
// input.ts reads the key bindings, and the audio bus reads `AudioSettings`.
//
// THE BLOB HOLDS MORE KNOBS THAN THE MENU OFFERS, on purpose. The options
// page (menu-options.tsx) asks a player a dozen questions; the in-car seat
// and lens, the pad's deadzone and the pedal gestures are all still here
// with their defaults and their readers, and the tooling still sets some of
// them from the URL. They are the game's knobs rather than the player's.
//
// The PICTURE is the one place that grouping is drawn deliberately rather
// than by default: nine renderer levers, three player rows. RESOLUTION and
// DISTANCE stand alone because they are separate costs a machine can be
// separately short of, and the seven that decide how much world gets built
// ride one DETAIL row (`DETAIL_PRESETS`) because they are one judgement —
// a simple game does not hand somebody a question about undergrowth
// density. Which levers share a row is a design decision; see
// `VideoSettings`.

import type { GearboxMode } from "@engine";

/** Where the camera watches the car from, walked from the nose BACKWARDS:
 * the three seats first, closest to the road first, then out onto the boom
 * and up. This is both the order the camera key walks and the order the
 * options screen lists, and every entry is a mode the car can be DRIVEN
 * from — the menu's drone and the Roam map are placed by the app and are
 * not offered here. The geometry behind each name lives in camera.ts (the
 * three inside the car in camera-eye.ts); this is the vocabulary the
 * player picks from. */
export type PlayCamera = "bumper" | "hood" | "cockpit" | "close" | "chase" | "far" | "heli" | "top";

/** No hints, like every ladder the options page walks: a camera describes
 * itself the moment it is picked, because picking it MOVES the one behind
 * the menu card. What each angle is FOR is camera.ts. */
export const PLAY_CAMERAS: { id: PlayCamera; label: string }[] = [
  { id: "bumper", label: "BUMPER" },
  { id: "hood", label: "HOOD" },
  { id: "cockpit", label: "COCKPIT" },
  { id: "close", label: "CLOSE" },
  { id: "chase", label: "CHASE" },
  { id: "far", label: "FAR" },
  { id: "heli", label: "HELI" },
  { id: "top", label: "TOP" },
];

/** The three views taken from inside the car — the ones the seat, lens and
 * head-motion knobs apply to. Nothing outside the car has a seat to raise
 * or a head to steady. */
export const IN_CAR_CAMERAS: PlayCamera[] = ["bumper", "hood", "cockpit"];

/** THE IN-CAR VIEW, AS FOUR KNOBS. Every one of them is a ladder of named
 * stops rather than a slider: a value nobody can quite reproduce is worse
 * than one they can name.
 *
 * Only HEAD MOTION reaches the menu, and there as a switch — OFF is the
 * stop somebody the movement makes ill needs, and it has to be one press
 * away. The other three are the tuning surface this view is DEVELOPED
 * against: the tooling sweeps all four from the URL (`?seat=`, `?reach=`,
 * `?vfov=`, `?headmotion=`), so a contact sheet of variants costs a loop
 * rather than a rebuild. */
export type ViewSettings = {
  /** Seat height over the car's own mount, m. */
  seat: number;
  /** Seat reach toward the nose, m. */
  reach: number;
  /** Added to whichever in-car view's design field of view, deg. */
  fov: number;
  /** How much the driver's head moves at all, as a scale on the neck's
   * travel, the road grain, the impact jolt and the wobble together. */
  headMotion: number;
};

/** The seat ladder stops at HIGH. The screen aperture is fixed and the eye
 * walks up it, so a stop above this one puts the header rail across the apex
 * of every corner — a seat setting that costs the player the road is not a
 * setting, it is a trap with a name on it. */
export const SEAT_STOPS: { id: string; label: string; value: number }[] = [
  { id: "low", label: "LOW", value: -0.05 },
  { id: "mid", label: "MID", value: 0 },
  { id: "high", label: "HIGH", value: 0.05 },
];

export const REACH_STOPS: { id: string; label: string; value: number }[] = [
  { id: "back", label: "BACK", value: -0.08 },
  { id: "mid", label: "MID", value: 0 },
  { id: "fwd", label: "FORWARD", value: 0.08 },
];

/** The lens ladder stops at WIDE. Past that the cabin this view is framed by
 * stops being the frame — the pillars fold out to the edges, the fascia
 * flattens, and what is left is a wide-angle plate of road with a car drawn
 * round the outside of it. */
export const FOV_STOPS: { id: string; label: string; value: number }[] = [
  { id: "narrow", label: "NARROW", value: -8 },
  { id: "standard", label: "STANDARD", value: 0 },
  { id: "wide", label: "WIDE", value: 8 },
];

/** OFF is a real stop, not the bottom of a ramp: a bolted lens is the right
 * answer for anybody the motion makes ill, and it has to be reachable. */
export const HEAD_STOPS: { id: string; label: string; value: number }[] = [
  { id: "off", label: "OFF", value: 0 },
  { id: "light", label: "LIGHT", value: 0.55 },
  { id: "standard", label: "STANDARD", value: 1 },
  { id: "heavy", label: "HEAVY", value: 1.5 },
];

/** The stop nearest a stored value — a build that moves a ladder must still
 * show something sensible for a choice made on the old one. */
export function nearestStop(stops: { id: string; value: number }[], value: number): string {
  let best = stops[0];
  for (const stop of stops) {
    if (Math.abs(stop.value - value) < Math.abs(best.value - value)) best = stop;
  }
  return best.id;
}

/** A stored knob, put back on its ladder. `nearestStop` is what the menu
 * highlights with; this is what the camera is actually given, and the two
 * must not be allowed to disagree — a build that drops a stop otherwise
 * leaves the player driving on a number no button on the page can restore.
 * Anything that is not a number at all was never a choice, so it keeps the
 * default rather than being rounded to the bottom of the ladder. */
function snapToStop(
  stops: { id: string; value: number }[],
  stored: unknown,
  fallback: number,
): number {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return fallback;
  const id = nearestStop(stops, stored);
  return stops.find((stop) => stop.id === id)?.value ?? fallback;
}

/** THE HUD, AS THE PLAYER SETS IT: on or off, and whether the car has a
 * rear-view mirror. Two switches rather than one per instrument, because a
 * rally HUD is one instrument panel — nobody wants the clock without the
 * map — and the one part of it that is not an instrument is the glass. The
 * mirror is the CAR's, drawn by the renderer, and it stays up with the HUD
 * off for anyone who drives by the road behind them. */
export type HudSettings = {
  /** The instrument panel: clock, map, cluster, calls, tags and the buttons
   * on the top bar. Off is a clean frame with the pause chip left on it —
   * the one door back that a phone with no keys cannot do without. */
  on: boolean;
  /** The rear-view glass at the top of the screen, in every view. */
  mirror: boolean;
};

/** Every part of the HUD that can be switched, one flag each — the HUD's
 * own contract (hud.tsx reads it), kept per instrument so a build can still
 * take one part down on its own. The player's two switches map onto it
 * through `hudShow`. Speed, gear and the countdown are not on it: the
 * countdown is the start line itself, and the cluster comes and goes with
 * the panel as a whole. */
export type HudInstrument =
  | "minimap"
  | "damage"
  | "mirror"
  | "nameTags"
  | "cameraButton"
  | "pacenotes"
  | "pacenoteText"
  | "tachometer"
  | "timer"
  | "stage"
  | "cluster"
  | "position";

export type HudShow = Record<HudInstrument, boolean>;

/** The two switches, spread over the panel. */
export function hudShow(hud: HudSettings): HudShow {
  const on = hud.on;
  return {
    minimap: on,
    damage: on,
    mirror: hud.mirror,
    nameTags: on,
    cameraButton: on,
    pacenotes: on,
    pacenoteText: on,
    tachometer: on,
    timer: on,
    stage: on,
    cluster: on,
    position: on,
  };
}

/** The two faders. Kept apart because they are two different jobs: the
 * effects are information the player needs to drive, and the music is the
 * room it happens in — plenty of people want one without the other. */
export type AudioSettings = {
  /** 0–1 master for the score. */
  music: number;
  /** 0–1 master for every sound effect, the engine bed included. */
  sfx: number;
};

/** THE SEVEN LEVERS THE RENDERER READS, on THREE rows the player turns.
 *
 * `resolution` and `drawDistance` are their own rows because they are their
 * own decisions: how SHARP the picture is and how FAR into it you can see
 * cost different things on different machines, and wanting one without the
 * other is the normal case rather than the exotic one — a retina phone with
 * a modest GPU wants every pixel and the fog pulled in, and a laptop driving
 * a big low-density screen wants the opposite. Tying them together only ever
 * charges a player for something they did not ask for.
 *
 * The remaining seven are HOW MUCH WORLD IS DRAWN, and they are one row
 * (`DETAIL_PRESETS`) because they are one judgement with one answer: they
 * all move together with how much headroom the machine has, and nobody has
 * an opinion about undergrowth density that is not also an opinion about
 * verge stones. */
export type VideoSettings = {
  /** Pixel-ratio ceiling — the single biggest lever on a weak GPU, and its
   * own player-facing row (RESOLUTION). Applies the moment it is set. */
  resolution: "low" | "medium" | "high";
  /** How far the fog lets you see, which is the same thing as how much
   * stage is submitted: the world is culled at the fog's own far distance
   * (`DRAW_DISTANCE_SCALE`). Its own player-facing row (DISTANCE), and it
   * applies the moment it is set. */
  drawDistance: "near" | "normal" | "far";
  /** Particles, rain and the ambient life — the transient FX budget. Part
   * of DETAIL. */
  effects: "off" | "low" | "full";
  /** HOW MUCH OF A CAR IS BUILT for the sake of what is only visible up
   * close — the two things behind and on the glass, on one ladder because
   * they are one judgement: how much does a car you are looking AT deserve.
   *
   * The cabin: `off` is the solid car — every window an opaque panel with
   * nothing behind it and no wiper arms on it, the cheapest car there is,
   * and the only level that costs no extra draw call per car on the road.
   * `low` furnishes the read: the trim, the dash, the seats and the crew
   * sat in them. `full` adds the roll cage, the harnesses and a steering
   * wheel that turns with the front tyres.
   *
   * The grime film the wipers clear (`SCREEN_GRIME`) rides along: `off`
   * leaves every screen permanently clean, and both levels above it wet the
   * glass — a rival's at a resolution that costs 48 triangles rather than
   * 3,456, which is what makes giving it to a whole grid affordable at all.
   * The RAIN on the player's own windscreen (car/screen-rain.ts) rides the
   * same row for the same reason: it is one more thing on the glass, and a
   * player who has asked for clean screens is asking for clean screens.
   *
   * WHICH cars this row reaches is the `glass` row under it: the car being
   * driven always, the rest of the road only when that row says so.
   *
   * Applies to the NEXT stage built, like the undergrowth: both are
   * geometry, and geometry is decided when a car is made. */
  interior: "off" | "low" | "full";
  /** WHOSE WINDOWS CAN BE SEEN THROUGH: which cars on the road get the
   * cabin the INTERIOR row describes, with the wiper arms and the grime on
   * the screens that go with it. Part of DETAIL, and geometry like the
   * cabin, so it lands on the next stage built.
   *
   * Two stops because the cost is per car and the road can carry fifteen.
   * A cabin behind glass is a second cabin's worth of triangles and three
   * extra draw calls on every car that has one — the furniture, the glass
   * in the transparent pass, and the film over it — and on a rival read at
   * two hundred metres none of it is a car's worth of picture. `player` is
   * a grid where only the car being driven is built that way: every other
   * car is the solid one the INTERIOR row's `off` builds, whatever that row
   * says. `all` furnishes the whole entry list, which is what a rally looks
   * like from the car behind. */
  glass: "player" | "all";
  /** How thickly the world is planted with the SOFT stuff — undergrowth,
   * shrubs, stumps. Part of DETAIL, and applies to the NEXT stage built.
   * The undergrowth only: the FOREST's own density is a generator dial the
   * player sets per stage, and this never touches it. */
  flora: "sparse" | "normal" | "lush";
  /** How much LOOSE STONE the ground is scattered with — the chippings
   * spilled across the road's edge that make it run out into the country
   * instead of ending at a line (R16, road-spill.ts), and the cobbles out in
   * the field beyond them. Its own row rather than a share of UNDERGROWTH
   * because it is the one detail lever that is not decoration: what it
   * thins is the transition at the road's edge, which is the thing a driver
   * looks straight down for a whole stage. Thousands of small instances, so
   * it is also the lever with the most frames in it after RESOLUTION. Part
   * of DETAIL, and applies to the NEXT stage built like the undergrowth. */
  ground: "plain" | "normal" | "rich";
  /** WHOSE WHEELS RAISE THE GROUND: the cloud a car TOWS down a loose stage
   * (plume.ts), the grit and the clods its wheels kick up, and the stones a
   * slide throws out sideways (drift-spray.ts). Part of DETAIL, and the one
   * lever on the row that applies the instant it is set rather than at the
   * next stage — none of it is geometry, it is particles spawned per frame
   * off a car that is moving.
   *
   * Three stops because the cost is not shared evenly between the cars on
   * the road. The player's own cloud IS the effect: it is what a loose
   * surface feels like from the seat, and the last of it to give up. The
   * field's is the same substance read from two hundred metres away — worth
   * a great deal to the picture (a rival is a plume over the trees a corner
   * before it is a car) and nothing at all to the driving, so it is the half
   * that goes first on a machine that is struggling: `player` is a stage
   * where only the car you are in is digging. `off` is both, for the phone
   * that would rather have the frames.
   *
   * It does not reach what a CRASH ploughs up, what a landing punches out,
   * or the smoke a tyre boils off tarmac: none of those is a cloud hanging
   * over the stage, they are the moment they belong to, and they ride the
   * EFFECTS budget with every other burst. */
  dust: "off" | "player" | "all";
  /** WHOSE PIPE SMOKES: the puffs off a tailpipe (fumes.ts) — the cloud a
   * car hangs on the line while it is revved, and the thinner one it trails
   * at pace. Part of DETAIL, and like the dust it applies the instant it is
   * set: an exhaust is not geometry, it is a pool spawned into per frame.
   *
   * Its own row rather than a share of the DUST one because the two answer
   * the same question about different substances and the answers do not have
   * to agree: rain settles what a wheel picks up and does nothing at all to
   * what an engine puts out, so a soaked stage where nobody is towing a
   * cloud is still a stage where a grid steams on the line.
   *
   * Three stops for the reason the dust has three. The player's own pipe is
   * read from a couple of metres away, out of the back of the car the frame
   * is drawn from, and it is what the engine looks like from the seat. The
   * field's is one shared pool feeding every crew in range — worth a great
   * deal on a start line and nothing to the driving, so it is the half that
   * goes first: `player` is a stage where only the car being driven smokes.
   * `off` is neither, for the phone that would rather have the frames.
   *
   * It does not reach the ENGINE SMOKE a holed radiator boils off the
   * bonnet: that is damage news the player has to be able to read, not
   * decoration, and it rides the EFFECTS budget with every other burst. */
  exhaust: "off" | "player" | "all";
};

/** HOW MANY FRAMES A SECOND A PHONE IS ASKED FOR, at most.
 *
 * A ProMotion screen asks for a hundred and twenty, and answering costs
 * twice the GPU and twice the draw submission for a game that reads
 * identically at sixty — on a device with no fan and a battery, which is
 * where a heat complaint comes from. A sixty-hertz screen never reaches
 * this ceiling, so it is free there rather than a cut.
 *
 * Phones only (`FRAME_CAP_QUERY`): a machine with a real pointer is on
 * mains power and its owner may well have bought the high refresh rate on
 * purpose. The physics does not ride on it either way — that runs off its
 * own accumulator at `TUNING.physicsHz`, so a frame not drawn is a frame
 * with more steps in it, never a slower car. */
export const FRAME_HZ = 60;

/** Who the cap applies to. */
export const FRAME_CAP_QUERY = "(pointer: coarse)";

/** ...as the shortest gap between two drawn frames, ms, with a tolerance
 * under the interval. A sixty-hertz display does not deliver frames exactly
 * 16.67 ms apart, and at a hard floor the jitter alone would drop every few
 * and cap the phone that needed no help at fifty. Under it, sixty passes
 * every time and a hundred and twenty (8.3 ms) still cannot. */
export function frameFloorMs(): number {
  // Off `globalThis` rather than the bare global, because this module is
  // reachable from the ENGINE's own project, which is typed without a DOM —
  // and nothing headless is drawing frames, so no cap there anyway.
  const media = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  if (!media) return 0;
  return media(FRAME_CAP_QUERY).matches ? 1000 / FRAME_HZ - 2 : 0;
}

/** Pixel-ratio ceilings. Below 1 the canvas renders smaller than the screen
 * and is scaled up — blurry, and the difference between a phone that holds
 * 60 fps and one that does not. */
export const RESOLUTION_SCALE: Record<VideoSettings["resolution"], number> = {
  low: 0.65,
  medium: 1,
  high: 2,
};

/** Multipliers on the environment preset's own fog distances. The fog IS
 * the draw distance: how far it lets the player see is also the radius the
 * world is culled at every frame (`world.cull` is handed `fogFar`), so
 * pulling it in is what stops a weak device from submitting half a stage it
 * cannot see through anyway.
 *
 * NEAR is a LOT nearer than the design point rather than a shade under it,
 * and that is the whole reason the stop exists. At two-thirds it was a
 * picture that looked like the tuned one and metered like it too — a stop a
 * player reaches for because the game is stuttering and puts back because
 * nothing happened. At this depth a clear day fogs out around two hundred
 * metres instead of five, and every road chunk and wild cell past that is
 * dropped before the frame is drawn rather than shaded into solid fog. It
 * cannot be pushed further without
 * closing the view in on the driver: the weather shortens the SAME fog
 * (sky.ts's per-weather fractions), so this is a multiplier ON one and the
 * two compound — which is what `environment.ts` keeps a floor under. */
export const DRAW_DISTANCE_SCALE: Record<VideoSettings["drawDistance"], number> = {
  near: 0.4,
  normal: 1,
  far: 1.45,
};

/** The nearest the DISTANCE row may ever bring the far fog, m.
 *
 * A hundred and fifty metres is about five seconds of road at rally pace,
 * which is the shortest sight line a corner can arrive out of and still be
 * a corner rather than an ambush. It exists because the SETTING and the
 * WEATHER shorten the same fog and compound: every stop of the row is well
 * past this on a clear sky, and what it catches is NEAR landing on the
 * weather that already takes the most (sky.ts's per-weather fractions). */
export const MIN_FOG_FAR = 150;

/** The fog a preset actually gets, once the player's DISTANCE row has had
 * its say — the whole policy in one place, so `environment.ts` applies it
 * rather than deciding it and the ladder can be read without a browser.
 *
 * The floor is on what the SETTING may take, never on what the weather may:
 * a preset already shorter than `MIN_FOG_FAR` keeps its own answer, so this
 * can only ever push the fog back OUT, and a storm stays as short as a storm
 * is. The near plane rides whatever ratio the far one landed on, so the fog
 * keeps its shape instead of thickening at one end when the floor bites. */
export function fogRangeFor(
  near: number,
  far: number,
  scale: number,
): { near: number; far: number } {
  const reach = Math.max(far * scale, Math.min(far, MIN_FOG_FAR));
  return { near: near * (reach / far), far: reach };
}

/** Particle-count and spawn-rate multiplier per effects level; `off` also
 * takes the rain and the ambient life out entirely. */
export const EFFECTS_SCALE: Record<VideoSettings["effects"], number> = {
  off: 0,
  low: 0.45,
  full: 1,
};

/** Whether a wheel torn off a car is thrown as a BODY — a rolling, bouncing
 * wheel with mass and grip (loose-wheel.ts), on every car on the road,
 * the field's included — or not thrown at all, leaving the hub. It rides
 * the particles' row: a wheel is stepped two hundred and forty times a
 * second while it is moving, the field can have a dozen loose at once,
 * and the picture that setting is cheapest on is the one that cannot
 * afford them. */
export const LOOSE_WHEELS: Record<VideoSettings["effects"], boolean> = {
  off: false,
  low: false,
  full: true,
};

/** The player's option, as the detail level car-body.ts builds against. The
 * two are not one enum because the setting lives in a module the menus load
 * and the level lives in one that imports three.js. */
export const INTERIOR_DETAIL: Record<VideoSettings["interior"], "off" | "low" | "high"> = {
  off: "off",
  low: "low",
  full: "high",
};

/** Whether the road's glass gets dirty at all, off the same row. How FINELY
 * any one screen carries it is not this setting's business — that is decided
 * per car by whose it is (`FilmDetail`), because the car being driven is
 * read through and every other one is read at range. */
export const SCREEN_GRIME: Record<VideoSettings["interior"], boolean> = {
  off: false,
  low: true,
  full: true,
};

/** Which cars the INTERIOR row reaches at each stop of the GLASS row: the
 * car the frame is rendered FROM, and the rest of the entry list. A car it
 * does not reach is built solid — opaque windows, no cabin, no wiper arms,
 * no film — whatever the INTERIOR row says.
 *
 * A record rather than a comparison at the call sites, for the reason
 * `DUST_RAISED` is one: the field must never be furnished while the driven
 * car is not, or a grid of glass cabins around a solid car would read as a
 * bug in the car. */
export const GLASS_SEEN_THROUGH: Record<
  VideoSettings["glass"],
  { player: boolean; field: boolean }
> = {
  player: { player: true, field: false },
  all: { player: true, field: true },
};

/** Flora density multiplier — the scatter chance for everything the world
 * plants that the physics does not collide with. The engine's own trunk
 * field is never thinned: those are solid, and a tree you can hit but
 * cannot see is the worst bug this setting could buy. */
export const FLORA_SCALE: Record<VideoSettings["flora"], number> = {
  sparse: 0.4,
  normal: 1,
  lush: 1.5,
};

/** Loose-stone density multiplier — the road's spill and the litter beyond
 * it. `plain` is a third rather than nothing: the road's edge still has to
 * TRANSITION at every setting, because a hard line between gravel and grass
 * is a defect and not a level of detail. Everything this scales is a few
 * centimetres tall and drives straight over, so thinning it can never
 * change what a car hits. */
export const GROUND_SCALE: Record<VideoSettings["ground"], number> = {
  plain: 0.33,
  normal: 1,
  rich: 1.6,
};

/** Who is allowed to raise ground off the stage at each stop of the DUST
 * row, as the two questions the renderer actually has: the car the frame is
 * rendered FROM (its towed plume, its wheel kickup, its rooster tail), and
 * the rest of the entry list (the one cloud the whole field shares).
 *
 * A record rather than a pair of comparisons at the two call sites, because
 * the two must never disagree: a stage where the field is towing dust and
 * the player is not would read as a bug in the car. */
export const DUST_RAISED: Record<VideoSettings["dust"], { player: boolean; field: boolean }> = {
  off: { player: false, field: false },
  player: { player: true, field: false },
  all: { player: true, field: true },
};

/** Whose pipe is allowed to smoke at each stop of the EXHAUST row, as the
 * same two questions the dust is asked: the car the frame is rendered FROM,
 * and the rest of the entry list. One record for the same reason DUST_RAISED
 * is one: a stage where the field is smoking and the car being driven is not
 * would read as a bug in the car. */
export const EXHAUST_SEEN: Record<VideoSettings["exhaust"], { player: boolean; field: boolean }> = {
  off: { player: false, field: false },
  player: { player: true, field: false },
  all: { player: true, field: true },
};

/** THE PICTURE, AS THREE QUESTIONS: how sharp, how much, how far. Every one
 * of the nine levers above is real and still read by the renderer, but a
 * player does not have an opinion about undergrowth density — they have an
 * opinion about whether the game is smooth, and about which of the things
 * making it unsmooth they would rather keep. Three rows is what lets them
 * answer that: RESOLUTION and DISTANCE are single levers, and DETAIL is the
 * seven that are one judgement.
 *
 * The point of the split is that the three costs are NOT the same cost.
 * Resolution is pixels — every one of them, every frame, whatever is on
 * screen. Distance is how much stage is submitted at all. Detail is how
 * much of it there is per metre — the geometry each one is made of, and the
 * dust the cars hang over it. A machine can be short of one and rich in
 * another, and a phone with a dense screen is the ordinary case of exactly
 * that: it wants the pixels it has and would rather give up the far ridges
 * than look at a soft picture. Under one knob that trade could not be
 * expressed at all. */
export type Detail = "low" | "medium" | "high";

/** The seven levers DETAIL owns. Named as a slice of `VideoSettings` rather
 * than restated, so adding a tenth lever is a decision about which row it
 * belongs on instead of a silent omission from both. */
export type DetailSettings = Pick<
  VideoSettings,
  "effects" | "interior" | "glass" | "flora" | "ground" | "dust" | "exhaust"
>;

/** What each DETAIL stop is worth, cheapest first — the order the ladder is
 * walked and the order `detailOf` breaks its ties in. Changing a preset here
 * changes what LOW, MEDIUM and HIGH mean everywhere, including for every
 * blob already stored. */
export const DETAIL_PRESETS: Record<Detail, DetailSettings> = {
  // The phone that stutters: every window solid and every wiper off, the
  // verges bare, under half the particles, a lost wheel gone rather than
  // rolling, nobody on the road raising any ground, and no pipe smoking.
  low: {
    effects: "low",
    interior: "off",
    glass: "player",
    flora: "sparse",
    ground: "plain",
    dust: "off",
    exhaust: "off",
  },
  // The design point — every lever at the number the game was tuned on, and
  // everything that is per car spent on the one car it is worth the most
  // on: the car being driven has the cabin, the wipers, the dust and the
  // smoke, and the field's share of all four is what the machine buys back.
  medium: {
    effects: "full",
    interior: "full",
    glass: "player",
    flora: "normal",
    ground: "normal",
    dust: "player",
    exhaust: "player",
  },
  // A machine with headroom: a thicker forest floor, stonier verges, and the
  // whole entry list furnished behind its glass, towing dust and steaming on
  // the line the way a rally actually looks.
  high: {
    effects: "full",
    interior: "full",
    glass: "all",
    flora: "lush",
    ground: "rich",
    dust: "all",
    exhaust: "all",
  },
};

/** The three picture ladders, as the menu walks them. No hints: what the
 * three rows do is `VideoSettings` above, for anyone reading the code, and
 * on screen the row's own name and its three stops are the explanation — a
 * page of settings that has to be read is a page that has failed. */
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

/** Where the three rows stand on a first launch: the design point on each.
 * MEDIUM resolution is one pixel per screen pixel rather than the retina
 * canvas, which is the honest default for a machine the game has never
 * seen — HIGH is a choice somebody makes after finding out they can. */
export const DEFAULT_VIDEO: VideoSettings = {
  resolution: "medium",
  drawDistance: "normal",
  ...DETAIL_PRESETS.medium,
};

/** Which DETAIL stop a set of video knobs IS: by exact match, else the stop
 * that agrees with the most of the seven, ties going to the CHEAPER picture
 * because `DETAIL_PRESETS` is walked cheapest first. So a blob written on
 * another build's ladder — or on the old single QUALITY row — lands on the
 * picture it most resembles, and never on a heavier one than it asked for.
 * A blob with none of the seven in it is a blob with no opinion, which is
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

/** Everything the keyboard can be asked to do. `menu` leaves the run for
 * the main menu; `pause` opens the in-race card. */
export type KeyAction =
  | "left"
  | "right"
  | "throttle"
  | "brake"
  | "handbrake"
  | "shiftUp"
  | "shiftDown"
  | "reset"
  | "camera"
  | "restart"
  | "menu"
  | "pause"
  | "screenshot";

/** Bound `KeyboardEvent.code` values per action — a list, because the
 * defaults ship the arrow keys and WASD side by side. Rebinding an action
 * replaces its whole list with the one key that was pressed. */
export type KeyBindings = Record<KeyAction, string[]>;

export const KEY_ACTIONS: { id: KeyAction; label: string }[] = [
  { id: "throttle", label: "THROTTLE" },
  { id: "brake", label: "BRAKE" },
  { id: "left", label: "STEER LEFT" },
  { id: "right", label: "STEER RIGHT" },
  { id: "handbrake", label: "HANDBRAKE" },
  { id: "shiftUp", label: "SHIFT UP" },
  { id: "shiftDown", label: "SHIFT DOWN" },
  { id: "reset", label: "BACK TO TRACK" },
  { id: "camera", label: "CAMERA" },
  { id: "restart", label: "RESTART STAGE" },
  { id: "menu", label: "MAIN MENU" },
  { id: "pause", label: "PAUSE" },
  { id: "screenshot", label: "SCREENSHOT" },
];

export const DEFAULT_KEYS: KeyBindings = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  throttle: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  handbrake: ["Space"],
  shiftUp: ["KeyE", "KeyX", "ShiftRight"],
  shiftDown: ["KeyQ", "KeyZ", "ControlRight"],
  // R for the one of these two a driver reaches for MID-STAGE: the car is
  // in a ditch, or on its roof, and the run wants putting back on the road
  // at the last board. Restarting the whole stage is the rarer press and
  // the more expensive one to make by accident, so it takes the key this
  // one vacated rather than sharing a hand with it.
  reset: ["KeyR"],
  camera: ["KeyC", "KeyV"],
  restart: ["KeyB"],
  menu: ["KeyM"],
  pause: ["Escape"],
  // ENTER, because it is the one key on a driving keyboard that nothing
  // else on the road wants: the pedals are the arrows and WASD, the gears
  // and the camera are letters around them, and ESCAPE is the pause card.
  screenshot: ["Enter"],
};

/** Where a pad action reads from. A button index under the browser's
 * gamepad mapping, or an axis and the direction along it that counts as
 * pressed — the shoulder triggers are buttons under the W3C standard
 * mapping and axes on plenty of Android controllers, so an action has to be
 * able to name either. */
export type PadSource =
  { kind: "button"; index: number } | { kind: "axis"; index: number; dir: 1 | -1 };

/** Everything a controller can be asked to do. Steering is not here: a
 * stick is an AXIS and is bound as one (`steerAxis`), while `steerLeft` and
 * `steerRight` are the d-pad — a digital pair that rides the same ramp the
 * keyboard's arrows do.
 *
 * The last five are the MENUS, not the car: a pad has to be able to walk a
 * card and press what it lands on, or half the game is unreachable on a
 * handheld. `steerLeft`/`steerRight` move the cursor sideways in a menu —
 * the same d-pad, doing the thing that d-pad means — so only up and down
 * need names of their own. `next` is the odd one: it presses a surface's
 * way ON rather than whatever the cursor found, so START walks a player
 * from the front door to the green light without them choosing anything. */
export type PadAction =
  | "throttle"
  | "brake"
  | "handbrake"
  | "steerLeft"
  | "steerRight"
  | "shiftUp"
  | "shiftDown"
  | "reset"
  | "camera"
  | "restart"
  | "menu"
  | "pause"
  | "screenshot"
  | "confirm"
  | "back"
  | "next"
  | "navUp"
  | "navDown";

export type PadBindings = {
  /** Sources per action — a list, the way the keyboard's are, so one action
   * can answer to more than one thing on the pad. */
  sources: Record<PadAction, PadSource[]>;
  /** Which axis steers, and whether it reads backwards. */
  steerAxis: number;
  steerInvert: boolean;
  /** How far off centre the steering axis has to be before the car is asked
   * to turn. A worn stick rests off zero, and a car that steers itself down
   * every straight is worse than one that ignores the first few percent. */
  deadzone: number;
};

export type PadSettings = {
  bindings: PadBindings;
  /** Whether a connected pad drives at all. The escape hatch for a device
   * that reports itself as a gamepad and then holds an axis over: with this
   * off the pad is not read and nothing it does reaches the car. */
  enabled: boolean;
  /** Whether a connected pad takes the thumb zones off the screen. On by
   * default — a handheld running this as an installed PWA has the controls
   * in its hands, and the wheel and pedal under them are just glass in the
   * way of the road. */
  hideTouch: boolean;
};

/** The rows on the CONTROLLER page, in the order they are printed: the car
 * first, then the menus. */
export const PAD_ACTIONS: { id: PadAction; label: string; menu?: true }[] = [
  { id: "throttle", label: "THROTTLE" },
  { id: "brake", label: "BRAKE" },
  { id: "handbrake", label: "HANDBRAKE" },
  { id: "steerLeft", label: "STEER LEFT" },
  { id: "steerRight", label: "STEER RIGHT" },
  { id: "shiftUp", label: "SHIFT UP" },
  { id: "shiftDown", label: "SHIFT DOWN" },
  { id: "reset", label: "BACK TO TRACK" },
  { id: "camera", label: "CAMERA" },
  { id: "restart", label: "RESTART STAGE" },
  { id: "pause", label: "PAUSE" },
  { id: "screenshot", label: "SCREENSHOT" },
  { id: "menu", label: "MAIN MENU" },
  { id: "confirm", label: "MENU: SELECT", menu: true },
  { id: "back", label: "MENU: BACK", menu: true },
  { id: "next", label: "MENU: NEXT", menu: true },
  { id: "navUp", label: "MENU: UP", menu: true },
  { id: "navDown", label: "MENU: DOWN", menu: true },
];

const button = (index: number): PadSource[] => [{ kind: "button", index }];

/** The W3C standard mapping, laid out the way a driving game wants it: the
 * analogue triggers are the pedals (right gas, left brake, the pair that
 * makes a pad worth driving on at all), A is the handbrake under the thumb
 * that is already there, X switches the camera, the shoulders shift, and
 * SELECT — the button nothing on the road wants — takes the picture. The
 * d-pad steers for anyone who would rather not use the stick.
 *
 * In a menu the same buttons mean menu things: A selects, B goes back, the
 * d-pad and stick walk the card, and START — the same button that pauses a
 * run — is NEXT: it takes each screen's way on, so holding it down from the
 * front door lands on a start line without a single choice being made.
 *
 * TWO actions are deliberately unbound, and for the same reason in each
 * case — there is already a way to do it that cannot be done by accident:
 *
 * - RESTART, because throwing the stage away halfway down it is the one
 *   press on this pad that is not recoverable by pressing it again, and a
 *   face button that does it is one fumble from a ruined run.
 * - MAIN MENU, because PAUSE opens a card that has MAIN MENU on it. A
 *   button that walks straight out of a run, in the middle of the run, is
 *   the same fumble wearing a different hat.
 *
 * Both are in the list, so anyone who wants them can put them somewhere. */
export const DEFAULT_PAD: PadSettings = {
  bindings: {
    sources: {
      throttle: button(7),
      brake: button(6),
      handbrake: button(0),
      steerLeft: button(14),
      steerRight: button(15),
      shiftUp: button(5),
      shiftDown: button(4),
      reset: button(1),
      camera: button(2),
      restart: [],
      menu: [],
      pause: button(9),
      screenshot: button(8),
      confirm: button(0),
      back: button(1),
      next: button(9),
      navUp: button(12),
      navDown: button(13),
    },
    steerAxis: 0,
    steerInvert: false,
    deadzone: 0.15,
  },
  enabled: true,
  hideTouch: true,
};

/** The standard mapping's button names, in index order. A pad that reports
 * any other mapping gets numbers instead: the browser is telling us it does
 * not know what the buttons ARE, and a wrong name is worse than none. */
const STANDARD_BUTTONS = [
  "A",
  "B",
  "X",
  "Y",
  "L1",
  "R1",
  "L2",
  "R2",
  "SELECT",
  "START",
  "L3",
  "R3",
  "D-PAD UP",
  "D-PAD DOWN",
  "D-PAD LEFT",
  "D-PAD RIGHT",
  "HOME",
];

/** A pad source as the player reads it off the thing in their hands. */
export function padSourceLabel(source: PadSource, standard: boolean): string {
  if (source.kind === "axis") return `AXIS ${source.index}${source.dir < 0 ? "−" : "+"}`;
  const name = standard ? STANDARD_BUTTONS[source.index] : undefined;
  return name ?? `BUTTON ${source.index}`;
}

/** The steering axis as the player reads it. Axis 0 is the left stick on
 * every standard pad, and naming it is the difference between a row that
 * explains itself and one that says `AXIS 0`. */
export function padAxisLabel(axis: number, invert: boolean, standard: boolean): string {
  const named =
    standard && axis === 0 ? "LEFT STICK" : standard && axis === 2 ? "RIGHT STICK" : null;
  return `${named ?? `AXIS ${axis}`}${invert ? " (INVERTED)" : ""}`;
}

/** The deadzone's stops, as fractions of full stick travel. A knob the menu
 * no longer offers — the default suits every pad tried — kept as the ladder
 * for whoever wires a row back. */
export const PAD_DEADZONES: { id: string; label: string }[] = [
  { id: "0.05", label: "5%" },
  { id: "0.1", label: "10%" },
  { id: "0.15", label: "15%" },
  { id: "0.25", label: "25%" },
];

/** The four ways a thumb can drag off its anchor on the pedal zone. */
export type PedalDir = "up" | "down" | "left" | "right";
export const PEDAL_DIRS: { id: PedalDir; label: string }[] = [
  { id: "up", label: "UP" },
  { id: "down", label: "DOWN" },
  { id: "left", label: "LEFT" },
  { id: "right", label: "RIGHT" },
];

/** The touch layout: which half of the screen steers (the other half is the
 * pedal), and which drag direction off the pedal anchor does what. Plain
 * gas needs no direction — it is what a touch that has not been dragged
 * anywhere already means. Only the side reaches the menu; the gestures ship
 * as `DEFAULT_TOUCH` and `assignPedalDir` is the rule for changing them. */
export type TouchSettings = {
  steerSide: "left" | "right";
  brake: PedalDir;
  handbrake: PedalDir;
};

/** Brake is DOWN because that is what the gesture already means: a thumb
 * pulled back toward the player is the car being reined in, the same way a
 * thumb pushed away is the car sent forward. */
export const DEFAULT_TOUCH: TouchSettings = {
  steerSide: "left",
  brake: "down",
  handbrake: "right",
};

export type Settings = {
  hud: HudSettings;
  /** The camera a run OPENS on. The camera key still walks the whole
   * ladder from wherever the run started; this only decides where it
   * starts, because a player who drives from the hood should not have to
   * press V four times at every start line. */
  camera: PlayCamera;
  /** Seat, lens and head motion for the three views taken from inside the
   * car. One set for all three: a player who wants to sit high and see wide
   * wants it in the cockpit and over the bonnet alike, and each view's own
   * row in camera-eye.ts is what makes the same offsets read differently. */
  view: ViewSettings;
  audio: AudioSettings;
  video: VideoSettings;
  keys: KeyBindings;
  touch: TouchSettings;
  /** The controller: what its buttons do, and what its presence does to the
   * touch controls. Separate from `keys` because a pad is not a keyboard —
   * its pedals are analogue and its stick is an axis, and both are things a
   * key cannot be. */
  pad: PadSettings;
  /** Which box the driver wants, for EVERY car. It is a preference about
   * how much of the car you want to be responsible for, not a property of
   * any one of them, so it lives here rather than in the catalog.
   *
   * The options page does NOT ask it. It is asked on the pre-race card
   * (menu-car.tsx), which is the one screen where the question means
   * something — the car's top speed and its 0–100 are quoted THROUGH the
   * box, so AUTO and MANUAL are two different sets of numbers sitting
   * beside the choice. This field is only the MEMORY of that answer: the
   * card writes back to it, so the box a player drove last time is the box
   * the next car is offered with, and nobody has to answer twice. */
  gearbox: GearboxMode;
  /** Whether the SCREENSHOT key and the HUD's shutter take pictures at
   * all. On by default — the feature is the point of having it — and off
   * is for a player who keeps hitting ENTER by accident, or who would
   * rather their own device's screenshot key were the only camera in the
   * room. Off leaves the gallery reachable: the pictures already in the
   * roll are still theirs to look at, copy and share. */
  screenshots: boolean;
  /** Whether every picture also goes on the CLIPBOARD as it is filed in the
   * roll. On by default: a screenshot is nearly always taken to be shown to
   * somebody, and the shortest road from the shutter to a chat window is a
   * paste. Off is for a player who works with something else on their
   * clipboard and would rather the game left it alone — the picture still
   * lands in the gallery, where COPY is a press away. */
  copyShots: boolean;
  /** True once the developer menu has been let out — see DEV_TAPS. It stays
   * out: a player who found it deliberately does not want to find it again
   * every time they open the game. */
  developer: boolean;
  /** The developer tools themselves — only reachable once `developer` is
   * true, and only ever switched on deliberately. */
  dev: DevSettings;
};

/** The two developer tools, and what each one is FOR.
 *
 * Both exist to make a problem somebody saw reproducible by somebody else:
 * god mode puts the camera anywhere on the stage, and the debug overlay
 * writes down exactly where "anywhere" was, in the form a URL can carry.
 * That pair is the whole loop — fly to the bad spot, screenshot it, and the
 * boxes in the corner of that screenshot are enough to put anyone else on
 * the same square metre of road. */
export type DevSettings = {
  /** The debug overlay: the boxes naming the stage, the place, the camera
   * and the car, plus the repro line that reproduces the frame. Stays on
   * screen while ALT hides the rest of the HUD — a screenshot with the HUD
   * out of the way still has to say where it was taken. */
  debug: boolean;
  /** God mode: the camera comes off the car and flies, and the car is handed
   * neutral input so it sits where it was left. */
  god: boolean;
  /** COLLECT RACE DATA: write every run down as the controls that drove it,
   * and offer the file at the finish (game/run-tape.ts). Separate from the
   * overlay on purpose — a drive collected for calibration should not have
   * to be driven with debug boxes across it. */
  record: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  hud: { on: true, mirror: true },
  // The shortest boom outside the car: the car is big in the frame, a drift
  // swings it right across, and standing that close is what makes it
  // the calmest read at pace — the nearer the camera, the fewer metres of
  // world a given lag in the follow drags across the frame. A player who
  // has not chosen a view gets the one that asks least of them; the ladder
  // runs both ways from here, one press of the camera key at a time.
  camera: "close",
  view: { seat: 0, reach: 0, fov: 0, headMotion: 1 },
  // Defaults with headroom on both: the engine bed and the score sum into
  // one limiter, and a game that arrives at full scale has nowhere to go but
  // down. Music sits under the effects, because the effects are what the
  // player is actually driving on.
  audio: { music: 0.7, sfx: 0.9 },
  video: { ...DEFAULT_VIDEO },
  keys: DEFAULT_KEYS,
  touch: DEFAULT_TOUCH,
  pad: DEFAULT_PAD,
  // The automatic: a player who has not chosen has not asked to be given
  // something else to manage while the road is coming at them.
  gearbox: "auto",
  screenshots: true,
  copyShots: true,
  developer: false,
  dev: { debug: false, god: false, record: false },
};

/** Taps on the car's chassis that let the developer menu out, and how long
 * a tap waits for the next one before the count starts over. Seven is far
 * past anything a player does by accident, and the window is short enough
 * that it has to be deliberate drumming rather than idle poking. */
export const DEV_TAPS = 7;
export const DEV_TAP_WINDOW_MS = 700;

const SETTINGS_KEY = "scandi-flick-options";

/** Merge stored options over the defaults one group at a time, so a build
 * that adds a toggle keeps every choice already made around it. */
/** The pedal gestures shipped with the brake on the PUSH, which is
 * backwards: pulling the thumb back is what reining a car in feels like.
 * Every player who has ever opened OPTIONS has that stored, and they did not
 * choose it — a default is not a preference. So exactly the arrangement that
 * shipped is turned round on load; any other one is a real choice and is left
 * alone. `boost` is a gesture the pedal no longer has: its stored key serves
 * only to identify that shipped arrangement, and is dropped rather than
 * written back out. */
function migratePedalDirs(touch: TouchSettings & { boost?: PedalDir }): void {
  if (touch.brake === "up" && touch.boost === "down") touch.brake = "down";
  delete touch.boost;
}

/** C used to be the way OUT of a run and V the way round the cameras, which
 * had the letter that names the thing sitting on the thing it does not do.
 * The camera moved onto C (V still works) and the menu onto M. As with the
 * pedals, a default is not a preference: exactly the old pair, and only it,
 * is moved across on load — a player who bound either key themselves keeps
 * what they chose. */
function migrateCameraKey(keys: KeyBindings): void {
  const only = (codes: string[], code: string): boolean => codes.length === 1 && codes[0] === code;
  if (!only(keys.camera, "KeyV") || !only(keys.menu, "KeyC")) return;
  keys.camera = [...DEFAULT_KEYS.camera];
  keys.menu = [...DEFAULT_KEYS.menu];
}

/** A pad settings blob nothing else shares a reference with. The bindings
 * are nested two deep, so the spread every other group is cloned with would
 * hand the defaults' own source lists to the live settings — and rebinding
 * one action would then silently rewrite what RESET PAD restores. */
export function clonePad(pad: PadSettings): PadSettings {
  const sources = {} as Record<PadAction, PadSource[]>;
  for (const action of PAD_ACTIONS) sources[action.id] = [...pad.bindings.sources[action.id]];
  return { ...pad, bindings: { ...pad.bindings, sources } };
}

/** Merge a stored pad blob over the defaults, action by action, so a build
 * that adds a pad action keeps every binding already made around it — and a
 * stored source list that is not a list of sources is dropped rather than
 * handed to the reader. */
function mergePad(pad: PadSettings, stored: Partial<PadSettings>): void {
  if (typeof stored.enabled === "boolean") pad.enabled = stored.enabled;
  if (typeof stored.hideTouch === "boolean") pad.hideTouch = stored.hideTouch;
  const bindings = stored.bindings;
  if (!bindings) return;
  if (Number.isInteger(bindings.steerAxis)) pad.bindings.steerAxis = bindings.steerAxis;
  if (typeof bindings.steerInvert === "boolean") pad.bindings.steerInvert = bindings.steerInvert;
  if (Number.isFinite(bindings.deadzone)) {
    pad.bindings.deadzone = Math.min(0.5, Math.max(0, bindings.deadzone));
  }
  const sources = bindings.sources;
  if (!sources) return;
  for (const action of PAD_ACTIONS) {
    const list = sources[action.id];
    if (Array.isArray(list)) pad.bindings.sources[action.id] = list.filter(isSource);
  }
}

function isSource(value: unknown): value is PadSource {
  if (!value || typeof value !== "object") return false;
  const source = value as PadSource;
  if (!Number.isInteger(source.index) || source.index < 0) return false;
  if (source.kind === "button") return true;
  return source.kind === "axis" && (source.dir === 1 || source.dir === -1);
}

/** The defaults, as a blob nothing else shares a reference with — what a
 * first launch loads, and what RESTORE DEFAULTS puts back. */
export function freshSettings(): Settings {
  return {
    hud: { ...DEFAULT_SETTINGS.hud },
    camera: DEFAULT_SETTINGS.camera,
    view: { ...DEFAULT_SETTINGS.view },
    audio: { ...DEFAULT_SETTINGS.audio },
    video: { ...DEFAULT_SETTINGS.video },
    keys: { ...DEFAULT_SETTINGS.keys },
    touch: { ...DEFAULT_SETTINGS.touch },
    pad: clonePad(DEFAULT_PAD),
    gearbox: DEFAULT_SETTINGS.gearbox,
    screenshots: DEFAULT_SETTINGS.screenshots,
    copyShots: DEFAULT_SETTINGS.copyShots,
    developer: false,
    dev: { ...DEFAULT_SETTINGS.dev },
  };
}

export function loadSettings(): Settings {
  const settings = freshSettings();
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return settings;
    const parsed = JSON.parse(stored) as Partial<Settings>;
    // Field by field rather than merged: a blob written when the HUD was
    // eight switches still carries them, and they are not settings any more.
    const hud = parsed.hud as Partial<Record<string, unknown>> | undefined;
    if (typeof hud?.on === "boolean") settings.hud.on = hud.on;
    if (typeof hud?.mirror === "boolean") settings.hud.mirror = hud.mirror;
    // Checked against the list rather than merged: a build that renames or
    // drops an angle must not leave the player pointed at one that no
    // longer exists, which would be a run with no camera at all.
    if (PLAY_CAMERAS.some((cam) => cam.id === parsed.camera)) {
      settings.camera = parsed.camera as PlayCamera;
    }
    // Snapped to the ladders rather than merged raw, for the same reason the
    // camera above is checked against its list: the four are stops, not a
    // slider, so a value off the ladder is a view the player cannot get back
    // to once they have moved away from it.
    if (parsed.view) {
      const view = parsed.view as Partial<Record<keyof ViewSettings, unknown>>;
      const base = DEFAULT_SETTINGS.view;
      settings.view.seat = snapToStop(SEAT_STOPS, view.seat, base.seat);
      settings.view.reach = snapToStop(REACH_STOPS, view.reach, base.reach);
      settings.view.fov = snapToStop(FOV_STOPS, view.fov, base.fov);
      settings.view.headMotion = snapToStop(HEAD_STOPS, view.headMotion, base.headMotion);
    }
    if (parsed.audio) Object.assign(settings.audio, parsed.audio);
    // Row by row, because the rows are independent: the two single levers
    // are checked against their own ladders and the other seven are snapped
    // together onto a DETAIL stop. Checked rather than merged for the reason
    // the view is snapped to its ladders — a value off a ladder is a place
    // the menu could never put the player back to once they moved off it —
    // but never snapped ACROSS rows, which is what a blob from the old
    // single QUALITY row would otherwise do to a mixed picture.
    if (parsed.video) {
      const video = parsed.video as Partial<Record<keyof VideoSettings, unknown>>;
      const resolution = RESOLUTION_STOPS.find((stop) => stop.id === video.resolution);
      if (resolution) settings.video.resolution = resolution.id;
      const distance = DISTANCE_STOPS.find((stop) => stop.id === video.drawDistance);
      if (distance) settings.video.drawDistance = distance.id;
      Object.assign(settings.video, DETAIL_PRESETS[detailOf(parsed.video)]);
    }
    if (parsed.keys) Object.assign(settings.keys, parsed.keys);
    if (parsed.touch) Object.assign(settings.touch, parsed.touch);
    if (parsed.pad) mergePad(settings.pad, parsed.pad);
    migrateCameraKey(settings.keys);
    migratePedalDirs(settings.touch);
    if (parsed.gearbox === "manual") settings.gearbox = "manual";
    if (parsed.screenshots === false) settings.screenshots = false;
    if (parsed.copyShots === false) settings.copyShots = false;
    if (parsed.developer === true) settings.developer = true;
    if (parsed.dev) Object.assign(settings.dev, parsed.dev);
    // A tool nobody can reach is a tool nobody can switch off: if the menu
    // that owns these was never let out, neither of them is on.
    if (!settings.developer) settings.dev = { ...DEFAULT_SETTINGS.dev };
  } catch {
    /* storage unavailable — the defaults are a perfectly good game */
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — the choice still applies to this session */
  }
}

/** Assigning a pedal gesture SWAPS rather than duplicates: two actions on
 * one direction would make one of them unreachable, and a settings screen
 * that can lock the handbrake away is worse than one that cannot. */
export function assignPedalDir(
  touch: TouchSettings,
  action: "brake" | "handbrake",
  dir: PedalDir,
): TouchSettings {
  const next = { ...touch };
  const clash = (["brake", "handbrake"] as const).find((a) => a !== action && next[a] === dir);
  if (clash) next[clash] = touch[action];
  next[action] = dir;
  return next;
}

/** A `KeyboardEvent.code` as a player reads it on their keyboard. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `NUM ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `${code.slice(5).toUpperCase()} ARROW`;
  if (code === "Space") return "SPACE";
  if (code === "ShiftLeft") return "L SHIFT";
  if (code === "ShiftRight") return "R SHIFT";
  if (code === "ControlLeft") return "L CTRL";
  if (code === "ControlRight") return "R CTRL";
  if (code === "AltLeft") return "L ALT";
  if (code === "AltRight") return "R ALT";
  return code.toUpperCase();
}
