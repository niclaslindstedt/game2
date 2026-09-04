// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The minimap, drawn: a square of country seen from above with the car in
// the middle of it, the run's progress read off the FRAME ITSELF — the
// border is the gauge, filling clockwise from the top as the run goes on —
// and the field's plates over the lot. Tapping it opens the in-race menu.
//
// The two halves it draws are owned elsewhere: minimap-scene.ts cuts the
// country into paths, minimap-view.ts places everything that moves. This
// file is the DOM and the glyphs.
//
// The schematic travels: it is cut around an anchor and translated to the
// car every frame, which is what makes a map that scrolls smoothly while
// its geometry is rebuilt a couple of times a second. The transform is on
// the group, so one attribute moves the whole landscape.

import { useRef } from "react";

import {
  PIN_DIGIT,
  PIN_H,
  PIN_PAD,
  PIN_R,
  PIN_TEXT,
  PIN_TIP,
  PIN_TIP_W,
  type HudMinimap,
  type MinimapCar,
} from "./minimap-view.ts";
import { VIEW } from "./minimap-scene.ts";

/** The gauge ring's corner radius and stroke width, in the same space.
 * `.hud-minimap` derives its own border-radius from R + SW/2 so the chassis
 * and the gauge share one corner at every screen scale. */
const RING_R = 15;
const RING_SW = 5;

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

/** THE CAR, from above: a body with a pointed nose and a tapered tail, the
 * glass inside it, and four wheels standing proud of the sides.
 *
 * It is drawn nose-up around the origin, so the whole thing is one
 * translate and one rotate — and it is drawn at a size nothing on the map
 * shares. A car at this framing is a metre and a half of view space, which
 * is a dot; the icon is nine times that, because what it has to say is
 * WHICH WAY THE CAR IS POINTED and a dot cannot say it. */
const CAR_BODY = "M 0 -7.4 L 3 -4.8 L 3.4 2.2 L 2.6 6.6 L -2.6 6.6 L -3.4 2.2 L -3 -4.8 Z";
const CAR_GLASS = "M -2 -2.8 L 2 -2.8 L 2.2 0.8 L -2.2 0.8 Z";
const CAR_WHEELS = [
  "M -5.1 -5.2 h 1.7 v 3 h -1.7 Z",
  "M 3.4 -5.2 h 1.7 v 3 h -1.7 Z",
  "M -5.1 1.8 h 1.7 v 3 h -1.7 Z",
  "M 3.4 1.8 h 1.7 v 3 h -1.7 Z",
].join(" ");

/** R28 — the next board's mark: a ring with a dot in it, with a wider ring
 * breathing out of it. A RING because everything else that MOVES on the map
 * is solid, and a hollow glyph is told apart from all of them at a glance
 * and at the size a phone draws this at. */
const MARK_R = 3.9;
const MARK_DOT = 1.5;
const MARK_HALO = 7.6;

/** ...and the chevron it becomes once the board is off the window: a wedge
 * on the rim, pointing the way the board is. */
const MARK_ARROW = "M 0 -4.6 L 3.4 1.6 L 0 0.1 L -3.4 1.6 Z";

/** The stage's ends: a flag on a staff, drawn from its foot so the foot is
 * the place. Squared off for the finish, swallow-tailed for the start, so
 * the two read apart with no colour at all. */
const END_START = "M 0 0 V -9 L 7 -7.4 L 3.6 -5.6 L 7 -3.8 L 0 -2.2 Z";
const END_FINISH = "M 0 0 V -9 L 7 -9 L 7 -3 L 0 -3 Z";

/** A rival's plate, drawn around the POINT it stands on so the whole glyph
 * is one translate. One closed path rather than a box and a triangle: two
 * shapes share an edge, and a stroked shared edge is a line drawn across
 * the middle of the plate. Traversal is clockwise on screen — which is what
 * makes every corner arc a sweep of 1, the same way `ringPath` runs.
 *
 * `up` hangs the box BELOW the point instead of above it, for a car near
 * the top of the window whose plate the frame would otherwise clip. */
function pinPath(digits: number, up: boolean): string {
  const x = (PIN_PAD * 2 + digits * PIN_DIGIT) / 2;
  const s = up ? 1 : -1;
  const top = s * (PIN_TIP + PIN_H);
  const tip = s * PIN_TIP;
  const r = PIN_R;
  const sweep = up ? 0 : 1;
  return [
    "M 0 0",
    `L ${-PIN_TIP_W} ${tip}`,
    `H ${-x + r}`,
    `A ${r} ${r} 0 0 ${sweep} ${-x} ${tip + s * r}`,
    `V ${top - s * r}`,
    `A ${r} ${r} 0 0 ${sweep} ${-x + r} ${top}`,
    `H ${x - r}`,
    `A ${r} ${r} 0 0 ${sweep} ${x} ${top - s * r}`,
    `V ${tip + s * r}`,
    `A ${r} ${r} 0 0 ${sweep} ${x - r} ${tip}`,
    `H ${PIN_TIP_W}`,
    "Z",
  ].join(" ");
}

/** Cut once per width and orientation. A door number is one or two numerals
 * and the map is rebuilt twelve times a second with a whole grid on it. */
const PIN_PATHS = new Map<string, string>();

function pinFor(car: MinimapCar): string {
  const digits = Math.max(1, car.number.length);
  const key = `${digits}${car.flip ? "u" : "d"}`;
  let path = PIN_PATHS.get(key);
  if (path === undefined) {
    path = pinPath(digits, car.flip);
    PIN_PATHS.set(key, path);
  }
  return path;
}

/** Where the numeral sits: the middle of the box, on whichever side of the
 * point the box ended up. */
function pinTextY(car: MinimapCar): number {
  return (car.flip ? 1 : -1) * (PIN_TIP + PIN_H / 2);
}

/** The country's pose: scaled about the middle of the box for the speedo's
 * zoom, then slid to where the car has got since the paths were cut. The
 * origin is written into the list rather than left to `transform-origin`,
 * so the two halves compose the same way whatever the element's box is. */
function worldPose(scene: HudMinimap["scene"]): string {
  const x = VIEW / 2 + scene.offset.x;
  const y = VIEW / 2 + scene.offset.y;
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scene.zoom.toFixed(4)}) translate(${-VIEW / 2}px, ${-VIEW / 2}px)`;
}

function place(x: number, y: number, angle = 0): string {
  const turn = angle === 0 ? "" : ` rotate(${angle.toFixed(1)}deg)`;
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)${turn}`;
}

export function Minimap({ map, onOpen }: { map: HudMinimap; onOpen: () => void }) {
  const { scene } = map;
  // The one frame a re-cut lands on is the one frame the country must NOT be
  // tweened onto: the offset, the zoom and the paths all change together and
  // compose back to the same picture, so the transform has to arrive with
  // them. Every other frame is a few view units of drift and is tweened.
  const drawn = useRef(-1);
  const recut = drawn.current !== scene.cut;
  drawn.current = scene.cut;
  return (
    <button type="button" className="hud-minimap" onClick={onOpen} aria-label="Race menu">
      <svg className="hud-minimap-face" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
        {/* The country, cut around its anchor and slid to where the car now
            stands. Painted bottom up: the ground, then the water on it, then
            everything built over both. */}
        <g
          className="hud-minimap-world"
          style={{ transform: worldPose(scene), transition: recut ? "none" : undefined }}
        >
          <path className="hud-minimap-open" d={scene.open} />
          <path className="hud-minimap-water" d={scene.water} />
          <path className="hud-minimap-stream" d={scene.streams} />
          <path className="hud-minimap-rail" d={scene.rails} />
          <path className="hud-minimap-lane" d={scene.lanes} />
          {/* The stage is drawn twice: a dark casing, then the surface over
              it. The casing is what separates the road from a lane running
              beside it and from pale ground under both — a single stroke on
              this plate has no edge of its own at all. */}
          <path className="hud-minimap-case" d={scene.road} />
          <path className="hud-minimap-road" d={scene.road} />
          <path className="hud-minimap-sealed" d={scene.sealed} />
          <path className="hud-minimap-wall" d={scene.walls} />
        </g>
        {/* The stage's ends, where the window holds them. */}
        {map.ends.map((end) => (
          <path
            key={end.kind}
            className={`hud-minimap-end hud-minimap-end-${end.kind}`}
            d={end.kind === "start" ? END_START : END_FINISH}
            style={{ transform: place(end.x, end.y) }}
          />
        ))}
        {/* R28 — the board still owed, over the country and under everything
            that MOVES. It is a place rather than a car, so a plate closing
            on you must never be the thing it hides. */}
        {map.next !== null && (
          <g
            className="hud-minimap-next"
            style={{ transform: place(map.next.x, map.next.y, map.next.angle) }}
          >
            {map.next.edge ? (
              <path className="hud-minimap-next-arrow" d={MARK_ARROW} />
            ) : (
              <>
                <circle className="hud-minimap-next-halo" r={MARK_HALO} />
                <circle className="hud-minimap-next-ring" r={MARK_R} />
                <circle className="hud-minimap-next-dot" r={MARK_DOT} />
              </>
            )}
          </g>
        )}
        {/* The field, backmarker first — SVG paints in document order, so
            the leader's plate is the last one down and the one nothing can
            cover. The player's own car follows the whole list for the same
            reason: whatever else is on the map, you can see yourself. */}
        {map.cars.map((car) => (
          <g
            key={car.number}
            className="hud-minimap-pin"
            style={{ transform: place(car.x, car.y) }}
          >
            <path d={pinFor(car)} fill={car.color} />
            <text className="hud-minimap-pin-no" y={pinTextY(car)} fontSize={PIN_TEXT}>
              {car.number}
            </text>
          </g>
        ))}
        <g
          className="hud-minimap-car"
          style={{ transform: place(VIEW / 2, VIEW / 2, map.heading) }}
        >
          <path className="hud-minimap-car-tyres" d={CAR_WHEELS} />
          <path className="hud-minimap-car-body" d={CAR_BODY} />
          <path className="hud-minimap-car-glass" d={CAR_GLASS} />
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
