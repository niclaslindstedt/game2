// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT STANDS ON THE MINIMAP — everything that moves, over the schematic
// the country is drawn as (minimap-scene.ts).
//
// The window travels with the car, so every mark here is a mark that may be
// off the edge of it, and each one answers that differently:
//
//   the CAR is always in the middle, because the middle is where the window
//   is centred — it is the only glyph that cannot leave;
//
//   a RIVAL simply goes when they leave the box. A plate for a car three
//   hundred metres away pinned to the rim is a car the driver would look
//   for and not find;
//
//   the BOARD THE RUN STILL OWES never goes. It is the one place on the
//   stage the run has to reach next, and a driver in a field with the road
//   nowhere in sight is exactly who needs it, so once it is off the window
//   it rides the rim as a chevron pointing at where it is.
//
// The plate geometry lives here rather than with the component because
// whether a plate fits above its own point is a decision about the window,
// and the component only draws what it is handed.

import { finishIndex, onRoad, type GameState, type RivalField } from "@engine";

import { legible } from "../lib/util.ts";
import { liveryForCrew } from "./car-livery.ts";
import {
  SPAN,
  VIEW,
  inView,
  minimapScene,
  project,
  spanFor,
  type MinimapScene,
} from "./minimap-scene.ts";

/** A rival's plate: how tall the box is, the point that hangs off it and
 * how wide that point's base is, and the box's corner radius — all in the
 * `VIEW`-square user space. */
export const PIN_H = 10;
export const PIN_TIP = 3.5;
export const PIN_TIP_W = 2.4;
export const PIN_R = 2.2;

/** The numeral's type size, one numeral's advance at that size in the HUD's
 * condensed face, and the plate's padding either side of the number — which
 * together are what makes a two-digit plate wider than a one-digit one
 * instead of stretching every plate to fit the widest. */
export const PIN_TEXT = 7.4;
export const PIN_DIGIT = 4.2;
export const PIN_PAD = 3;

/** How much room a whole plate needs above its own point. An SVG root
 * clips, so a plate standing this close to the top of the box would have
 * its numeral shaved off — which is what `flip` is for. */
const PLATE_REACH = PIN_H + PIN_TIP;

/** How far inside the frame a marker driven off the window rides, view
 * units — clear of the gauge ring's own stroke. */
const RIM = 9;

/** One rival on the map: where their plate stands, what is written on it,
 * what it is painted, and which way up it hangs. */
export type MinimapCar = {
  x: number;
  y: number;
  /** The number off their door (car-livery.ts). */
  number: string;
  /** Their paint as CSS, already lifted to a shade dark ink reads against. */
  color: string;
  /** True where the plate hangs BELOW its point instead of standing above
   * it: a car near the top of the window would otherwise have its numeral
   * clipped off by the frame. */
  flip: boolean;
};

/** R28 — where the board the run still owes is. `edge` is set once it is
 * outside the window: the point is then on the rim rather than on the
 * board, and `angle` (degrees clockwise, zero pointing up-screen) is the
 * way to it. */
export type MinimapNext = { x: number; y: number; edge: boolean; angle: number };

/** The stage's two ends, drawn while they are in the window. */
export type MinimapEnd = { x: number; y: number; kind: "start" | "finish" };

export type HudMinimap = {
  /** The country around the car, as paths (minimap-scene.ts). */
  scene: MinimapScene;
  /** The rivals on the road, in PAINT ORDER: last in the list is drawn last
   * and is therefore the one nothing can cover. The list runs backmarker
   * first, so the crew winning the race is never hidden behind the plate of
   * a crew losing it, and the player's own car goes on after all of them.
   *
   * Empty on every run that is not a heads-up race. A rally leaves ten
   * seconds apart and its cars are minutes of road apart; drawing them
   * side by side on one map would claim an order the discipline does not
   * know it has, which is the same line `livePlace` draws in field.ts. */
  cars: MinimapCar[];
  /** The car's heading, degrees clockwise for the icon. It stands at the
   * middle of the box by construction, so there is no position to carry. */
  heading: number;
  next: MinimapNext | null;
  ends: MinimapEnd[];
  /** Gauge fill, 0..1 — the finish line on a staged run, the next whole
   * kilometre on an endless one. */
  progress: number;
  /** The readout on the frame's bottom edge. The window no longer holds the
   * whole stage, so how much of it is LEFT is not something the picture can
   * be read for any more: the ring says what share is done and this says
   * what that share is worth in kilometres. On an endless stage, which has
   * no finish to count down to, it is the distance covered instead, and on
   * a circuit the lap the ring is filling for. */
  label: string;
};

/** HOW FAR ROUND THE STAGE a run has got, m — the laps already in the book
 * plus the road covered on this one, because `progressS` restarts at every
 * line. It is the plates' paint order, so a leader who has just crossed for
 * another lap must not drop behind the field on the map the way a bare
 * `progressS` would have them. */
function covered(state: GameState): number {
  return (state.lap - 1) * state.track.length + state.progressS;
}

/** The field's plates for this frame, backmarker first. */
function rivalPlates(field: RivalField | null, own: GameState, span: number): MinimapCar[] {
  if (!field?.massStart) return [];
  const plated: { car: MinimapCar; covered: number }[] = [];
  for (const run of field.runs) {
    // Never a plate on the car the map is drawn FROM. It is the car icon,
    // and the icon is already where it is: never the player, and — with a
    // run-out being watched (spectate.ts) — never the crew under the
    // camera, whose plate would otherwise stand on its own icon.
    if (run.state === own) continue;
    // A crew still in the start control or already home is not on the road,
    // and a plate for one would be a car the player cannot reach.
    if (!onRoad(run)) continue;
    const at = project(own, run.state.car.x, run.state.car.z, span);
    if (!inView(at)) continue;
    const livery = liveryForCrew(run.entry.crew.id, run.entry.number);
    plated.push({
      car: {
        x: at[0],
        y: at[1],
        number: livery.number,
        color: legible(livery.paint),
        flip: at[1] < PLATE_REACH,
      },
      covered: covered(run.state),
    });
  }
  plated.sort((a, b) => a.covered - b.covered);
  return plated.map((entry) => entry.car);
}

/** Put a point that is off the window onto its rim, with the bearing to it.
 * The scale is the box's, not the point's distance, so a board a kilometre
 * away and one just past the edge both sit on the same rim. */
function onRim(x: number, y: number): MinimapNext {
  const dx = x - VIEW / 2;
  const dy = y - VIEW / 2;
  const half = VIEW / 2 - RIM;
  const t = Math.min(half / Math.max(1e-3, Math.abs(dx)), half / Math.max(1e-3, Math.abs(dy)));
  return {
    x: VIEW / 2 + dx * t,
    y: VIEW / 2 + dy * t,
    edge: true,
    // SVG's rotation is clockwise from up-screen, and up-screen is -y.
    angle: (Math.atan2(dx, -dy) * 180) / Math.PI,
  };
}

/** R28 — the board the run owes, placed. Null once they are all behind the
 * car, and on a stage with no boards at all. */
function nextBoard(state: GameState, span: number): MinimapNext | null {
  const board = state.track.checkpoints[state.checkpointsPassed];
  if (board === undefined) return null;
  const sample = state.track.samples[board.index];
  const at = project(state, sample.x, sample.z, span);
  if (inView(at)) return { x: at[0], y: at[1], edge: false, angle: 0 };
  return onRim(at[0], at[1]);
}

/** The start line and the finish gate, where the window holds them. */
function endMarks(state: GameState, span: number): MinimapEnd[] {
  const { samples, endless } = state.track;
  const out: MinimapEnd[] = [];
  const first = project(state, samples[0].x, samples[0].z, span);
  if (inView(first)) out.push({ x: first[0], y: first[1], kind: "start" });
  // An endless stage has no finish to mark — the road simply keeps going.
  // A finite one is marked at the GATE, which is where the run actually
  // ends, not at the last sample of run-off road past it.
  if (endless) return out;
  const line = samples[finishIndex(state.track)];
  const at = project(state, line.x, line.z, span);
  if (inView(at)) out.push({ x: at[0], y: at[1], kind: "finish" });
  return out;
}

/** What the readout under the map says. */
function readout(state: GameState): string {
  const { track } = state;
  if (track.endless) return `${(state.progressS / 1000).toFixed(1)} KM`;
  if (state.laps > 1) return `LAP ${Math.min(state.lap, state.laps)}/${state.laps}`;
  const left = (track.finishS ?? track.length) - state.progressS;
  return `${Math.max(0, left / 1000).toFixed(1)} KM`;
}

/** The gauge's fill: the share of the stage that is done, or — where there
 * is no finish to be a share of — the share of the current kilometre. */
function gaugeFill(state: GameState): number {
  const km = state.progressS / 1000;
  if (state.track.endless) return km - Math.floor(km);
  return Math.min(1, state.progressS / state.track.length);
}

/** The HUD's minimap payload for this frame. The field is the run's own, or
 * null on the runs nobody else is entered for. */
export function buildMinimap(state: GameState, field: RivalField | null = null): HudMinimap {
  // A heads-up race is framed wider, because on one the map is also the
  // race: a grid spread over a few hundred metres of stage has nobody on a
  // window that only holds the road ahead. Every other discipline leaves
  // ten seconds apart and has no field to hold, so it keeps the framing
  // that draws the ROAD best.
  // ...and then closed in or opened up by the speedo, so what the window
  // holds is a roughly constant amount of NOTICE rather than a constant
  // piece of road. Ground speed, like the speedo: a car crossed up at 140 is
  // covering ground at 140, and a map that zoomed back in every time the
  // nose swung would breathe through every corner.
  const base = field?.massStart === true ? SPAN.race : SPAN.solo;
  const span = spanFor(base, Math.hypot(state.car.u, state.car.w) * 3.6);
  return {
    scene: minimapScene(state, span),
    cars: rivalPlates(field, state, span),
    // Screen space runs the heading backwards (see minimap-scene.ts's sign
    // boundary), so the icon's clockwise rotation is the negated heading.
    heading: -state.car.heading * (180 / Math.PI),
    next: nextBoard(state, span),
    ends: endMarks(state, span),
    progress: gaugeFill(state),
    label: readout(state),
  };
}
