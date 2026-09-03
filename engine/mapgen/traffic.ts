// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R44 — THE TRAFFIC ROUTES. The rally closes the road it borrows, but the
// country does not stop for it: the public roads it abandons at every
// junction (R17, R36) and the lanes into the car parks (R42) still carry
// whoever has somewhere to be. This module says WHERE they are going.
//
// The public road network is a FOREST: the tarmac lines never touch each
// other (R23), a car park's lane hangs off one arm or off another lane, and
// nothing loops. So every journey has exactly one way to go, and a route is
// just the path between two of the places the network reaches — the edge
// of the map, a town, a car park's pad, the tape across the closed road —
// walked on the driver's own side of the road. This module builds the
// network out of the compiled arms and lanes, cuts it at every place, and
// hands the fleet (`game/traffic.ts`) one polyline per journey, resampled
// so a vehicle finds its place on it by index.
//
// It also stands the SPEED LIMIT SIGNS: one wherever the limit changes
// along a direction of travel, repeated down a long road, on the driver's
// right, facing the traffic it applies to.

import { STAGE_RULES as R } from "./rules.ts";
import type { CarPark } from "./carparks.ts";
import type { Spur, SpurLine } from "./spurs.ts";
import type { Town } from "./towns.ts";

/** Somewhere a journey starts or ends — or a place on the road that is
 * neither. `shore` and `stage` are the ends of an arm the country stopped
 * (the water, the rally's own road): a road that goes there is still a
 * road, but nobody sets out for it. `join` is where a lane turns off. */
export type TrafficPlace = "map" | "block" | "town" | "park" | "shore" | "stage" | "join";

/** One point of a route, in the LANE — already offset to the driver's
 * side of the centerline. `limit` is the posted speed here, m/s. */
export type RoutePoint = {
  x: number;
  z: number;
  y: number;
  heading: number;
  s: number;
  limit: number;
};

export type TrafficRoute = {
  /** Which two places it runs between, and how often anybody makes the
   * journey against the rest of the routes. */
  from: TrafficPlace;
  to: TrafficPlace;
  weight: number;
  /** A name that survives the network being rebuilt (endless: a new arm or
   * car park appears), so a vehicle keeps its journey across the rebuild. */
  key: string;
  points: RoutePoint[];
  /** Spacing of `points`, m, and the route's whole length, m. */
  step: number;
  length: number;
};

/** A speed limit sign: where it stands, the direction of travel it serves
 * (its face looks back down that direction, at the traffic coming up it),
 * and the limit it posts, km/h. `atS` is the arc position on the stage of
 * the arm or car park it belongs to. */
export type SpeedSign = {
  x: number;
  z: number;
  y: number;
  heading: number;
  limit: number;
  atS: number;
};

export type TrafficPlan = {
  routes: TrafficRoute[];
  signs: SpeedSign[];
  /** Metres of LANE in the network — every road twice, once per direction
   * — which is what the fleet's population is sized by. */
  laneM: number;
};

/** The posted limits, km/h: an open public road, the street through a
 * village, the graded lane into a car park. What the signs say; the fleet
 * divides by 3.6. */
export const TRAFFIC_LIMITS = { country: 70, town: 50, lane: 30 } as const;

const KMH = 1 / 3.6;

type LinePoint = { x: number; z: number; y: number; limit: number };

/** A whole road of the network before it is cut: an arm past its barrier
 * or a car park's lane, with the places along it. */
type Line = {
  pts: LinePoint[];
  width: number;
  atS: number;
  /** The place at `pts[0]` and at the last point, and names for them. */
  head: TrafficPlace;
  tail: TrafficPlace;
  headKey: string;
  tailKey: string;
  /** Places in the MIDDLE of the line, by index into `pts`: a village on
   * an arm, or the turning where a lane leaves it. */
  cuts: Map<number, "town" | "join">;
  /** A lane's parent road, and where on it the lane turns off: the lane
   * then starts at that turning instead of at a head of its own. */
  joined: { parent: Line; at: number } | null;
};

type Node = { x: number; z: number; kind: TrafficPlace; key: string };

type Edge = { a: number; b: number; pts: LinePoint[]; width: number };

const TERMINAL: ReadonlySet<TrafficPlace> = new Set(["map", "block", "town", "park"]);

/** Plan every journey the network carries, and stand its signs. `carParks`
 * is the terrain field's list — the parks live there, not on the track. */
export function planTraffic(
  track: {
    spurs: readonly Spur[];
    publicRoads: readonly SpurLine[];
    towns: readonly Town[];
  },
  carParks: readonly CarPark[],
): TrafficPlan {
  const lines: Line[] = [];
  const arms: Line[] = [];
  for (const spur of track.spurs) {
    const line = armLine(spur, track.towns);
    if (!line) continue;
    lines.push(line);
    arms.push(line);
  }
  // R17 — and the public roads the route never met, which carry traffic for
  // the reason they exist: they run rim to rim, so a journey down one is a
  // journey from off the map to off the map.
  const roads: Line[] = [];
  for (const road of track.publicRoads) {
    const line = publicLine(road);
    if (!line) continue;
    lines.push(line);
    roads.push(line);
  }
  // The lanes, in the order they were placed: a lane that leaves another
  // lane (`access: "park"`) leaves one placed before it.
  const lanes: Line[] = [];
  for (const park of carParks) {
    const parents =
      park.access === "arm"
        ? arms
        : park.access === "road"
          ? roads
          : park.access === "park"
            ? lanes
            : [];
    const line = laneLine(park, parents);
    if (!line) continue;
    lines.push(line);
    lanes.push(line);
  }
  const { nodes, edges } = cutNetwork(lines);
  let laneM = 0;
  for (const edge of edges) laneM += 2 * polylineLength(edge.pts);
  return { routes: buildRoutes(nodes, edges, R.traffic.step), signs: standSigns(lines), laneM };
}

/** An arm as a road of the network. It begins past its barrier, so the
 * piece the traffic uses is the piece the marshal left open; an arm with
 * no barrier is one too short or too folded against the stage for a lane
 * to be honest on, and a railway is not a road. */
function armLine(spur: Spur, towns: readonly Town[]): Line | null {
  const T = R.traffic;
  if (spur.rail || !spur.block) return null;
  const fromS = spur.block.s + T.pastBlock;
  const start = spur.samples.findIndex((p) => p.s >= fromS);
  if (start < 0 || spur.samples.length - start < 8) return null;
  // A village on this arm: the town limit through it, and a place of its
  // own in the middle of the street.
  const zones: [number, number][] = [];
  let village: number | null = null;
  for (const town of towns) {
    if (town.street.kind !== "arm") continue;
    if (town.atS !== spur.atS || town.street.end !== spur.end) continue;
    zones.push([town.street.fromS - T.townMargin, town.street.toS + T.townMargin]);
    village = (town.street.fromS + town.street.toS) / 2;
  }
  const samples = spur.samples.slice(start);
  const pts = samples.map((p) => ({
    x: p.x,
    z: p.z,
    y: p.elevation,
    limit:
      (zones.some(([a, b]) => p.s >= a && p.s <= b)
        ? TRAFFIC_LIMITS.town
        : TRAFFIC_LIMITS.country) * KMH,
  }));
  // What is behind the tape: a town the route runs through within reach
  // of the junction, or just the closed road.
  const townBehind = towns.some(
    (town) =>
      town.street.kind === "route" &&
      ((town.street.fromS <= spur.atS && spur.atS <= town.street.toS) ||
        Math.abs(town.atS - spur.atS) < T.townReach),
  );
  const name = `arm@${Math.round(spur.atS)}${spur.end}`;
  const line: Line = {
    pts,
    width: spur.width,
    atS: spur.atS,
    head: townBehind ? "town" : "block",
    tail: spur.endsAt === "map" ? "map" : spur.endsAt === "water" ? "shore" : "stage",
    headKey: `${name}:in`,
    tailKey: `${name}:out`,
    cuts: new Map(),
    joined: null,
  };
  if (village !== null) {
    let at = 0;
    for (let i = 1; i < samples.length; i++) {
      if (Math.abs(samples[i].s - village) < Math.abs(samples[at].s - village)) at = i;
    }
    if (at > 0 && at < pts.length - 1) line.cuts.set(at, "town");
  }
  return line;
}

/** R17 — a public road the route never met, as a road of the network: rim
 * to rim, at the country limit, with nothing shut on it. */
function publicLine(road: SpurLine): Line | null {
  if (road.samples.length < 8) return null;
  const name = `road@${Math.round(road.atS)}`;
  return {
    pts: road.samples.map((p) => ({
      x: p.x,
      z: p.z,
      y: p.elevation,
      limit: TRAFFIC_LIMITS.country * KMH,
    })),
    width: road.width,
    atS: road.atS,
    head: "map",
    tail: "map",
    headKey: `${name}:in`,
    tailKey: `${name}:out`,
    cuts: new Map(),
    joined: null,
  };
}

/** A car park's lane as a road of the network, from the outside world to
 * the pad. Off an arm, a public road or an earlier lane, its first sample
 * lies on that road's own centerline, so the nearest point of the parent is
 * the turning — and a lane whose parent was never built is a lane from
 * nowhere. */
function laneLine(park: CarPark, parents: readonly Line[]): Line | null {
  const samples = park.road.samples;
  if (samples.length < 4) return null;
  const pts = samples.map((p) => ({
    x: p.x,
    z: p.z,
    y: p.elevation,
    limit: TRAFFIC_LIMITS.lane * KMH,
  }));
  const name = `park@${Math.round(park.atS)}`;
  const line: Line = {
    pts,
    width: park.road.width,
    atS: park.atS,
    head: "map",
    tail: "park",
    headKey: `${name}:road`,
    tailKey: `${name}:pad`,
    cuts: new Map(),
    joined: null,
  };
  if (park.access === "map") return line;
  const first = samples[0];
  let parent: Line | null = null;
  let at = -1;
  let best = 12;
  for (const other of parents) {
    for (let i = 0; i < other.pts.length; i++) {
      const d = Math.hypot(other.pts[i].x - first.x, other.pts[i].z - first.z);
      if (d < best) {
        best = d;
        parent = other;
        at = i;
      }
    }
  }
  if (!parent) return null;
  // The turning is a place on the parent — unless a village already
  // stands there, which is a place in its own right and keeps its name.
  if (!parent.cuts.has(at)) parent.cuts.set(at, "join");
  line.joined = { parent, at };
  line.headKey = `${parent.headKey}@${at}+${name}`;
  // The parent's node stands for the lane's first sample.
  line.pts = pts.slice(1);
  return line;
}

/** Cut every line at its places into edges between nodes. */
function cutNetwork(lines: readonly Line[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const node = (x: number, z: number, kind: TrafficPlace, key: string): number => {
    nodes.push({ x, z, kind, key });
    return nodes.length - 1;
  };
  const headOf = new Map<Line, number>();
  const tailOf = new Map<Line, number>();
  const cutNode = new Map<Line, Map<number, number>>();
  for (const line of lines) {
    const own = new Map<number, number>();
    for (const [at, kind] of line.cuts) {
      const p = line.pts[at];
      own.set(at, node(p.x, p.z, kind, `${line.headKey}@${at}`));
    }
    cutNode.set(line, own);
    if (!line.joined) {
      headOf.set(line, node(line.pts[0].x, line.pts[0].z, line.head, line.headKey));
    }
    const last = line.pts[line.pts.length - 1];
    tailOf.set(line, node(last.x, last.z, line.tail, line.tailKey));
  }
  for (const line of lines) {
    if (line.joined) {
      headOf.set(line, cutNode.get(line.joined.parent)?.get(line.joined.at) as number);
    }
    const head = headOf.get(line) as number;
    const own = cutNode.get(line) as Map<number, number>;
    const stops = [...own.keys()].sort((a, b) => a - b);
    let fromNode = head;
    let from = 0;
    for (const at of stops) {
      const to = own.get(at) as number;
      edges.push({ a: fromNode, b: to, pts: line.pts.slice(from, at + 1), width: line.width });
      fromNode = to;
      from = at;
    }
    edges.push({
      a: fromNode,
      b: tailOf.get(line) as number,
      pts: line.pts.slice(from),
      width: line.width,
    });
  }
  return { nodes, edges };
}

/** Every journey: the unique path between each ordered pair of places. */
function buildRoutes(nodes: readonly Node[], edges: readonly Edge[], step: number): TrafficRoute[] {
  const adjacency: { edge: number; to: number }[][] = nodes.map(() => []);
  edges.forEach((edge, i) => {
    adjacency[edge.a].push({ edge: i, to: edge.b });
    adjacency[edge.b].push({ edge: i, to: edge.a });
  });
  const routes: TrafficRoute[] = [];
  const via = new Array<{ edge: number; from: number } | null>(nodes.length);
  const seen = new Array<boolean>(nodes.length);
  for (let o = 0; o < nodes.length; o++) {
    if (!TERMINAL.has(nodes[o].kind)) continue;
    // One breadth-first sweep from each origin reaches every destination.
    via.fill(null);
    seen.fill(false);
    seen[o] = true;
    const queue = [o];
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q];
      for (const { edge, to } of adjacency[at]) {
        if (seen[to]) continue;
        seen[to] = true;
        via[to] = { edge, from: at };
        queue.push(to);
      }
    }
    for (let d = 0; d < nodes.length; d++) {
      if (d === o || !seen[d] || !TERMINAL.has(nodes[d].kind)) continue;
      // Walk back from the destination, collecting the lane on the right.
      const pieces: LinePoint[][] = [];
      let at = d;
      while (at !== o) {
        const hop = via[at] as { edge: number; from: number };
        const edge = edges[hop.edge];
        const forward = edge.a === hop.from;
        pieces.push(sideOf(forward ? edge.pts : [...edge.pts].reverse(), edge.width / 4));
        at = hop.from;
      }
      pieces.reverse();
      const lane: LinePoint[] = [];
      for (const piece of pieces) {
        for (const p of piece) {
          const last = lane[lane.length - 1];
          if (last && Math.hypot(last.x - p.x, last.z - p.z) < 0.5) continue;
          lane.push(p);
        }
      }
      const points = resample(lane, step);
      if (points.length < 3) continue;
      routes.push({
        from: nodes[o].kind,
        to: nodes[d].kind,
        weight: 0,
        key: `${nodes[o].key}>${nodes[d].key}`,
        points,
        step,
        length: points[points.length - 1].s,
      });
    }
  }
  // Every KIND of journey gets an equal share of the traffic, however
  // many routes make it: eight car parks off one arm are not eight times
  // the reason to drive in from the edge of the map. Moving from one car
  // park to another is a thing that happens, but not what the road is for.
  const kinds = new Map<string, number>();
  for (const route of routes) {
    const kind = `${route.from}>${route.to}`;
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  for (const route of routes) {
    const share = route.from === "park" && route.to === "park" ? 0.3 : 1;
    route.weight = share / (kinds.get(`${route.from}>${route.to}`) ?? 1);
  }
  return routes;
}

/** The lane on the driver's right of a centerline: each point pushed
 * `off` metres along the road's right axis, read from its neighbours. */
function sideOf(pts: readonly LinePoint[], off: number): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    out.push({
      x: pts[i].x + Math.cos(h) * off,
      z: pts[i].z - Math.sin(h) * off,
      y: pts[i].y,
      limit: pts[i].limit,
    });
  }
  return out;
}

/** Walk a polyline at a fixed spacing, reading the heading off the line
 * itself — which is what smooths the kink a square turning leaves in the
 * offset lane into a corner a car can be posed round. */
function resample(lane: readonly LinePoint[], step: number): RoutePoint[] {
  const out: RoutePoint[] = [];
  let s = 0;
  let due = 0;
  for (let i = 0; i < lane.length - 1; i++) {
    const a = lane[i];
    const b = lane[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    while (due <= s + len) {
      const t = (due - s) / len;
      out.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        y: a.y + (b.y - a.y) * t,
        heading: 0,
        s: due,
        limit: t < 0.5 ? a.limit : b.limit,
      });
      due += step;
    }
    s += len;
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    out[i].heading = Math.atan2(b.x - a.x, b.z - a.z);
  }
  return out;
}

function polylineLength(pts: readonly LinePoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  return total;
}

/** The signs: for each road and each direction of travel down it, one
 * where the limit changes and one every `sign.every` metres of the same
 * limit, on the driver's right, facing the traffic. */
function standSigns(lines: readonly Line[]): SpeedSign[] {
  const S = R.traffic.sign;
  const signs: SpeedSign[] = [];
  for (const line of lines) {
    for (const forward of [true, false]) {
      // A lane is signed only on the way IN: the way out rejoins a road
      // whose own signs say what it is.
      if (!forward && line.tail === "park") continue;
      const pts = forward ? line.pts : [...line.pts].reverse();
      let posted = -1;
      let since = 0;
      let s = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        s += len;
        since += len;
        const limit = Math.round(b.limit / KMH);
        const changed = limit !== posted;
        if (!changed && since < S.every) continue;
        if (changed && s < S.after) continue;
        posted = limit;
        since = 0;
        const heading = Math.atan2(b.x - a.x, b.z - a.z);
        const side = line.width / 2 + S.out;
        signs.push({
          x: b.x + Math.cos(heading) * side,
          z: b.z - Math.sin(heading) * side,
          y: b.y,
          heading,
          limit,
          atS: line.atS,
        });
      }
    }
  }
  return signs;
}
