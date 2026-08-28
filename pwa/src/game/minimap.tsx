// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The minimap: the stage drawn as a route in the top-right corner, the car
// riding it as an arrowhead, and how far through the stage you are read off
// the FRAME ITSELF — the border is the progress gauge, filling clockwise
// from the top as the run goes on. Tapping it opens the in-race menu.
//
// SIGN BOUNDARY (the same one-flip rule input.ts states for steering): the
// rendered world mirrors the engine's map view, so the map draws in SCREEN
// space — `mx = -x`, `my = -z` — which puts the start heading up-screen and
// makes a heading-growing turn bend LEFT, exactly as the player sees it.

import type { GameState } from "@engine";

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

export type HudMinimap = {
  /** The route as an SVG path in the `VIEW`-square user space. */
  path: string;
  /** R28 — the split boards on that route, in stage order: where each one
   * sits in the same space, and whether the run has been through it. A
   * board is the only landmark on the map a driver can plan against, so it
   * is drawn as a tick across the route rather than as a dot beside it. */
  checkpoints: { x: number; y: number; passed: boolean }[];
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

/** The HUD's minimap payload for this frame. */
export function buildMinimap(state: GameState): HudMinimap {
  const { path, project } = route(state);
  const [x, y] = project(-state.car.x, -state.car.z);
  const km = state.progressS / 1000;
  const endless = state.track.endless;
  const samples = state.track.samples;
  // An endless stage's map is a window travelling with the car, and its
  // list of boards only grows — so the ticks are filtered to what is
  // actually on the face rather than drawn and clipped.
  const checkpoints: HudMinimap["checkpoints"] = [];
  for (let i = 0; i < state.track.checkpoints.length; i++) {
    const at = samples[state.track.checkpoints[i].index];
    const [cx, cy] = project(-at.x, -at.z);
    if (cx < 0 || cx > VIEW || cy < 0 || cy > VIEW) continue;
    checkpoints.push({ x: cx, y: cy, passed: i < state.checkpointsPassed });
  }
  return {
    path,
    checkpoints,
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

export function Minimap({ map, onOpen }: { map: HudMinimap; onOpen: () => void }) {
  return (
    <button type="button" className="hud-minimap" onClick={onOpen} aria-label="Race menu">
      <svg className="hud-minimap-face" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
        <path className="hud-minimap-route" d={map.path} />
        {map.checkpoints.map((cp, i) => (
          <circle
            key={i}
            className={`hud-minimap-cp ${cp.passed ? "hud-minimap-cp-passed" : ""}`}
            cx={cp.x}
            cy={cp.y}
            r={2.6}
          />
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
