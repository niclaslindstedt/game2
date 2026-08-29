// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The minimap: the stage drawn as a route in the top-right corner, the car
// riding it as an arrowhead, and how far through the stage you are read off
// the FRAME ITSELF — the border is the progress gauge, filling clockwise
// from the top as the run goes on. Tapping it opens the in-race menu.
//
// AND, ON A HEADS-UP RACE, THE RACE ITSELF: every rival still on the road as
// a numbered plate with a point under it, so a grid of fifteen cars trading
// places over a stage is something the driver can watch happen rather than
// infer from the position board. A plate carries the number off that crew's
// door and the colour off their paint, so the box closing on you from behind
// is the same car the name tag in the mirror names.
//
// SIGN BOUNDARY (the same one-flip rule input.ts states for steering): the
// rendered world mirrors the engine's map view, so the map draws in SCREEN
// space — `mx = -x`, `my = -z` — which puts the start heading up-screen and
// makes a heading-growing turn bend LEFT, exactly as the player sees it.

import { onRoad, type GameState, type RivalField } from "@engine";

import { legible } from "../lib/util.ts";
import { liveryForCrew } from "./car-livery.ts";

/** The map's own square user space; everything below is in these units. */
const VIEW = 100;
/** Clearance between the route and the frame, so the gauge stays readable. */
const PAD = 14;
/** The gauge ring's corner radius and stroke width, in the same space.
 * `.hud-minimap` derives its own border-radius from R + SW/2 so the chassis
 * and the gauge share one corner at every screen scale. */
const RING_R = 15;
const RING_SW = 5;

/** Most points the route path is ever drawn with. The map is ~7rem across,
 * so 2 m sample spacing is far finer than the pixels can show — striding to
 * this many keeps a 7 km stage's path the same cost as a 1 km one. */
const ROUTE_POINTS = 170;

/** Endless stages have no map to fit, so the window travels with the car:
 * this much road behind it and this much ahead, meters. */
const ENDLESS_BEHIND = 260;
const ENDLESS_AHEAD = 900;

/** Smallest world span the window is fitted to, meters — without a floor a
 * stationary car on an endless stage fits a few meters of road to the whole
 * frame and the map lurches at walking pace. */
const MIN_SPAN = 60;

/** A rival's plate: how tall the box is, the point that hangs under it and
 * how wide that point's base is, and the box's corner radius — all in the
 * `VIEW`-square user space.
 *
 * `PIN_H + PIN_TIP` is held AT OR UNDER `PAD` on purpose. The plate stands
 * on the route and grows upward, the route never comes within `PAD` of the
 * frame, and an SVG root clips: a taller plate would have its numeral
 * shaved off for exactly the cars nearest the top edge. */
const PIN_H = 10;
const PIN_TIP = 3.5;
const PIN_TIP_W = 2.4;
const PIN_R = 2.2;

/** The numeral's type size, one numeral's advance at that size in the HUD's
 * condensed face, and the plate's padding either side of the number — which
 * together are what makes a two-digit plate wider than a one-digit one
 * instead of stretching every plate to fit the widest. */
const PIN_TEXT = 7.4;
const PIN_DIGIT = 4.2;
const PIN_PAD = 3;

/** One rival on the map: where their plate stands, what is written on it,
 * and what it is painted. */
export type MinimapCar = {
  x: number;
  y: number;
  /** The number off their door (car-livery.ts). */
  number: string;
  /** Their paint as CSS, already lifted to a shade dark ink reads against. */
  color: string;
};

export type HudMinimap = {
  /** The route as an SVG path in the `VIEW`-square user space. */
  path: string;
  /** The rivals on the road, in PAINT ORDER: last in the list is drawn last
   * and is therefore the one nothing can cover. The list runs backmarker
   * first, so the crew winning the race is never hidden behind the plate of
   * a crew losing it, and the player's own arrowhead goes on after all of
   * them.
   *
   * Empty on every run that is not a heads-up race. A rally leaves ten
   * seconds apart and its cars are minutes of road apart; drawing them
   * side by side on one map would claim an order the discipline does not
   * know it has, which is the same line `livePlace` draws in field.ts. */
  cars: MinimapCar[];
  /** The car in that space; `angle` is degrees clockwise for the icon. */
  car: { x: number; y: number; angle: number };
  /** Gauge fill, 0..1 — the finish line on a staged run, the next whole
   * kilometre on an endless one. */
  progress: number;
  /** The readout on the frame's bottom edge — distance on an endless stage,
   * which has no finish for the gauge to be a fraction of, and the lap
   * counter on a circuit, where the ring fills once per lap and on its own
   * cannot say which lap that is. Empty otherwise: the ring already says
   * how far in the run is, and a percentage beside it is the same sentence
   * twice over the route. */
  label: string;
};

/** The last route we built, keyed by the window it was built from. A staged
 * stage rebuilds once; an endless one rebuilds when its window has slid a
 * `STRIDE_BUCKET`'s worth, not every snapshot. */
let routeCache: { key: string; path: string; project: Project } | null = null;

type Project = (mx: number, my: number) => [number, number];

/** Sample indices the window is quantised to before it becomes a cache key
 * — 16 samples is ~32 m of road, below what the map can show moving. */
const STRIDE_BUCKET = 16;

function fitProject(points: [number, number][]): Project {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const span = VIEW - 2 * PAD;
  // Aspect is preserved: the tighter axis picks the scale, so a stage that
  // runs mostly north-south keeps its shape instead of being stretched flat.
  const k = Math.min(
    span / Math.max(MIN_SPAN, maxX - minX),
    span / Math.max(MIN_SPAN, maxY - minY),
  );
  return (x, y) => [VIEW / 2 + (x - cx) * k, VIEW / 2 + (y - cy) * k];
}

/** Build (or reuse) the route path and the projection that placed it. */
function route(state: GameState): { path: string; project: Project } {
  const { samples, step, endless } = state.track;
  const last = samples.length - 1;
  let i0 = 0;
  let i1 = last;
  if (endless) {
    i0 = Math.max(0, Math.round((state.progressS - ENDLESS_BEHIND) / step));
    i1 = Math.min(last, Math.round((state.progressS + ENDLESS_AHEAD) / step));
  }
  i0 -= i0 % STRIDE_BUCKET;
  i1 -= i1 % STRIDE_BUCKET;
  if (i1 <= i0) i1 = Math.min(last, i0 + STRIDE_BUCKET);
  const key = `${state.track.seed}:${i0}:${i1}:${samples.length}`;
  if (routeCache?.key === key) return routeCache;

  const stride = Math.max(1, Math.ceil((i1 - i0) / ROUTE_POINTS));
  const points: [number, number][] = [];
  for (let i = i0; i <= i1; i += stride) points.push([-samples[i].x, -samples[i].z]);
  // The tail sample is the finish line (or the streaming frontier) — striding
  // past it would draw a route that stops short of where the run ends.
  const tail = samples[i1];
  points.push([-tail.x, -tail.z]);

  const project = fitProject(points);
  const path = points
    .map(([x, y], i) => {
      const [px, py] = project(x, y);
      return `${i === 0 ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(" ");
  routeCache = { key, path, project };
  return routeCache;
}

/** HOW FAR ROUND THE STAGE a run has got, m — the laps already in the book
 * plus the road covered on this one, because `progressS` restarts at every
 * line. It is the plates' paint order, so a leader who has just crossed for
 * another lap must not drop behind the field on the map the way a bare
 * `progressS` would have them. */
function covered(state: GameState): number {
  return (state.lap - 1) * state.track.length + state.progressS;
}

/** The field's plates for this frame, backmarker first. */
function rivalPlates(field: RivalField | null, project: Project): MinimapCar[] {
  if (!field?.massStart) return [];
  const plated: { car: MinimapCar; covered: number }[] = [];
  for (const run of field.runs) {
    // A crew still in the start control or already home is not on the road,
    // and a plate for one would be a car the player cannot reach.
    if (!onRoad(run)) continue;
    const [x, y] = project(-run.state.car.x, -run.state.car.z);
    if (x < 0 || x > VIEW || y < 0 || y > VIEW) continue;
    const livery = liveryForCrew(run.entry.crew.id, run.entry.number);
    plated.push({
      car: { x, y, number: livery.number, color: legible(livery.paint) },
      covered: covered(run.state),
    });
  }
  plated.sort((a, b) => a.covered - b.covered);
  return plated.map((entry) => entry.car);
}

/** The HUD's minimap payload for this frame. The field is the run's own, or
 * null on the runs nobody else is entered for. */
export function buildMinimap(state: GameState, field: RivalField | null = null): HudMinimap {
  const { path, project } = route(state);
  const [x, y] = project(-state.car.x, -state.car.z);
  const km = state.progressS / 1000;
  const endless = state.track.endless;
  return {
    path,
    cars: rivalPlates(field, project),
    // Screen space runs the heading backwards (see the sign boundary above),
    // so the icon's clockwise rotation is the negated heading.
    car: { x, y, angle: -state.car.heading * (180 / Math.PI) },
    progress: endless ? km - Math.floor(km) : Math.min(1, state.progressS / state.track.length),
    label: endless
      ? `${km.toFixed(1)} KM`
      : state.laps > 1
        ? `LAP ${Math.min(state.lap, state.laps)}/${state.laps}`
        : "",
  };
}

/** The gauge ring's path: a rounded rect that starts at top-center and runs
 * clockwise, so the fill grows away from twelve o'clock like a lap counter.
 * Inset by half the stroke so the border is not clipped by the viewBox. */
function ringPath(): string {
  const a = RING_SW / 2;
  const b = VIEW - RING_SW / 2;
  const r = RING_R;
  return [
    `M ${VIEW / 2} ${a}`,
    `H ${b - r}`,
    `A ${r} ${r} 0 0 1 ${b} ${a + r}`,
    `V ${b - r}`,
    `A ${r} ${r} 0 0 1 ${b - r} ${b}`,
    `H ${a + r}`,
    `A ${r} ${r} 0 0 1 ${a} ${b - r}`,
    `V ${a + r}`,
    `A ${r} ${r} 0 0 1 ${a + r} ${a}`,
    "Z",
  ].join(" ");
}

const RING_PATH = ringPath();

/** The car icon: an arrowhead with a notched tail, drawn nose-up around the
 * origin so the whole glyph is one translate + rotate. */
const CAR_ICON = "M 0 -6 L 4 5 L 0 2.6 L -4 5 Z";

/** A rival's plate, drawn around the POINT it stands on so the whole glyph
 * is one translate. One closed path rather than a box and a triangle: two
 * shapes share an edge, and a stroked shared edge is a line drawn across
 * the middle of the plate. Traversal is clockwise on screen — bottom edge
 * leftward, up the left side, back along the top — which is what makes
 * every corner arc a sweep of 1, the same way `ringPath` runs. */
function pinPath(digits: number): string {
  const x = (PIN_PAD * 2 + digits * PIN_DIGIT) / 2;
  const top = -PIN_TIP - PIN_H;
  const r = PIN_R;
  return [
    "M 0 0",
    `L ${-PIN_TIP_W} ${-PIN_TIP}`,
    `H ${-x + r}`,
    `A ${r} ${r} 0 0 1 ${-x} ${-PIN_TIP - r}`,
    `V ${top + r}`,
    `A ${r} ${r} 0 0 1 ${-x + r} ${top}`,
    `H ${x - r}`,
    `A ${r} ${r} 0 0 1 ${x} ${top + r}`,
    `V ${-PIN_TIP - r}`,
    `A ${r} ${r} 0 0 1 ${x - r} ${-PIN_TIP}`,
    `H ${PIN_TIP_W}`,
    "Z",
  ].join(" ");
}

/** Cut once per width. A door number is one or two numerals and the map is
 * rebuilt twelve times a second with a whole grid on it. */
const PIN_PATHS = new Map<number, string>();

function pinFor(number: string): string {
  const digits = Math.max(1, number.length);
  let path = PIN_PATHS.get(digits);
  if (path === undefined) {
    path = pinPath(digits);
    PIN_PATHS.set(digits, path);
  }
  return path;
}

/** Where the numeral sits: the middle of the box above the point. */
const PIN_TEXT_Y = -PIN_TIP - PIN_H / 2;

export function Minimap({ map, onOpen }: { map: HudMinimap; onOpen: () => void }) {
  return (
    <button type="button" className="hud-minimap" onClick={onOpen} aria-label="Race menu">
      <svg className="hud-minimap-face" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
        <path className="hud-minimap-route" d={map.path} />
        {/* The field, backmarker first — SVG paints in document order, so
            the leader's plate is the last one down and the one nothing can
            cover. The player's arrowhead follows the whole list for the
            same reason: whatever else is on the map, you can see yourself. */}
        {map.cars.map((car) => (
          <g
            key={car.number}
            className="hud-minimap-pin"
            style={{ transform: `translate(${car.x.toFixed(2)}px, ${car.y.toFixed(2)}px)` }}
          >
            <path d={pinFor(car.number)} fill={car.color} />
            <text className="hud-minimap-pin-no" y={PIN_TEXT_Y} fontSize={PIN_TEXT}>
              {car.number}
            </text>
          </g>
        ))}
        <g
          className="hud-minimap-car"
          style={{
            transform: `translate(${map.car.x}px, ${map.car.y}px) rotate(${map.car.angle.toFixed(1)}deg)`,
          }}
        >
          <path d={CAR_ICON} />
        </g>
      </svg>
      {/* The frame IS the progress gauge — a dim track with the run's share
          of it drawn over the top, clockwise from twelve o'clock. */}
      <svg className="hud-minimap-ring" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
        <path className="hud-minimap-ring-track" d={RING_PATH} strokeWidth={RING_SW} />
        <path
          className="hud-minimap-ring-fill"
          d={RING_PATH}
          strokeWidth={RING_SW}
          pathLength={1}
          strokeDasharray={`${map.progress.toFixed(4)} 1`}
        />
      </svg>
      {map.label !== "" && <span className="hud-minimap-read">{map.label}</span>}
    </button>
  );
}
