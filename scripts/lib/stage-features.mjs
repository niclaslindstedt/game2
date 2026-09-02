// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING A STAGE HAS ON IT, in stage order, with a name.
//
// A claim about a stage is made in words — "the first jump on level 1",
// "the hairpin after the second split" — and the words only mean one thing
// if the numbering is fixed. This module IS that numbering: it walks a
// compiled track once and hands back every feature the co-driver would call
// and every mark the stage is timed by, each with an id (`J1`, `T4`, `CP2`),
// its position along the road, the ground it stands on, and what stands
// close to the road there. The level map draws the list and the CLI prints
// it, so a label in the picture and a row in the table are the same thing.
//
// The ids follow what the GAME says, not what the generator planned: the
// turns are the track's pacenotes (one call per run of same-direction bends,
// exactly what the HUD reads out, numbered as they are called), the jumps
// are the samples the compiler flagged as a lip, and `left`/`right` is the
// driver's — a positive pacenote direction is a LEFT, the way snapshot.ts
// hands it to the HUD.

/** The HUD's own threshold for calling a corner LONG (pwa/src/game/
 * snapshot.ts) — restated here so the map says LONG on the same corners. */
const LONG_NOTE_ANGLE = 1.75;

/** The HUD's word for each severity bucket. */
export const SEVERITY_WORD = { soft: "EASY", medium: "MEDIUM", hard: "HARD" };

/** How close to the road a solid has to stand to be "near the racing
 * track", m past the road's edge. A trunk at this distance is one a car
 * that runs a metre wide meets; further out is forest. */
export const NEAR_EDGE = 12;

/** Nearest sample index to an arc position, by bisection on `s`. */
export function indexAtS(samples, s) {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(samples[lo - 1].s - s) < Math.abs(samples[lo].s - s)) return lo - 1;
  return lo;
}

/** Ground grade of the road at a sample, as a percentage over the `over`
 * metres BEFORE it — positive is uphill in the direction of travel. */
function gradeBefore(samples, index, over = 20) {
  const back = indexAtS(samples, samples[index].s - over);
  const run = samples[index].s - samples[back].s;
  if (run < 1) return 0;
  return ((samples[index].elevation - samples[back].elevation) / run) * 100;
}

/** Tightest radius through a range of samples, m — Infinity on a dead
 * straight. */
function minRadius(samples, from, to) {
  let peak = 0;
  for (let i = from; i <= to; i++) peak = Math.max(peak, Math.abs(samples[i].curvature));
  return peak > 1e-6 ? 1 / peak : Infinity;
}

/** Which kind of solid a WildObstacle is, for counting and for colour. */
export function solidGroup(ob) {
  if (ob.kind === "tree") return "tree";
  if (ob.kind === "log" || ob.kind === "rootlog" || ob.kind === "stump" || ob.kind === "timber") {
    return "wood";
  }
  if (ob.kind === "parapet") return "parapet";
  // R37 — a homestead's house wall and the two halves of a parked car.
  if (ob.kind === "wall" || ob.kind === "parked") return "building";
  return "rock";
}

/** Every solid within `reach` metres of the centreline between two arc
 * positions, each with how far past the road's EDGE it stands and which
 * side of travel it is on. Deduplicated — the field's near-queries overlap
 * from one sample to the next. */
export function solidsAlong(track, terrain, fromS, toS, reach = NEAR_EDGE + 8) {
  const { samples } = track;
  const from = indexAtS(samples, fromS);
  const to = indexAtS(samples, toS);
  const seen = new Set();
  const out = [];
  // A query every 8 m with a radius that covers the gap: the sample step is
  // 2 m, and asking at every one quadruples the work for the same answer.
  for (let i = from; i <= to; i += 4) {
    const at = samples[i];
    // The wild trunks and rocks, and the BUILT solids: a bridge's parapet
    // bays, a homestead's walls, parked cars and lane trees (R37).
    const found = terrain
      .treesNear(at.x, at.z, reach + 8)
      .concat(terrain.obstaclesNear(at.x, at.z, reach + 8))
      .concat(terrain.fixturesNear(at.x, at.z, reach + 8));
    for (const ob of found) {
      const key = `${ob.kind}:${ob.x.toFixed(2)},${ob.z.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const placed = placeBeside(
        track,
        ob,
        Math.max(from - 8, 0),
        Math.min(to + 8, samples.length - 1),
      );
      if (placed.edge <= reach) out.push({ ob, ...placed, group: solidGroup(ob) });
    }
  }
  return out;
}

/** Where a solid stands relative to the road: the nearest sample in a
 * window, the distance past the mat's edge (negative is ON the road, which
 * a parapet is), and the side — `left` or `right` of travel. */
function placeBeside(track, ob, from, to) {
  const { samples } = track;
  let best = from;
  let bestD = Infinity;
  for (let i = from; i <= to; i++) {
    const d = Math.hypot(samples[i].x - ob.x, samples[i].z - ob.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const at = samples[best];
  // Travel is (sin h, cos h) — the heading is read from +z — so the LEFT
  // of travel, the way the nose moves as the heading grows, is
  // (cos h, -sin h): the same side `search.ts` puts a left turn's centre.
  const side = Math.cos(at.heading) * (ob.x - at.x) - Math.sin(at.heading) * (ob.z - at.z);
  // `shift` moves the mat RIGHT of travel (R17's junction mouths); `side`
  // counts left, so the mat's centre sits at `-shift` in these terms.
  const lateral = side + (at.shift ?? 0);
  return {
    index: best,
    s: at.s,
    edge: Math.abs(lateral) - at.width / 2 - ob.radius,
    side: lateral >= 0 ? "left" : "right",
  };
}

/** "3 trees, 1 rock within 12 m of the edge; nearest tree 1.4 m right" —
 * or "nothing solid within 12 m". */
export function describeSolids(solids) {
  if (solids.length === 0) return `nothing solid within ${NEAR_EDGE} m of the edge`;
  const close = solids.filter((p) => p.edge <= NEAR_EDGE);
  if (close.length === 0) return `nothing solid within ${NEAR_EDGE} m of the edge`;
  const count = { tree: 0, rock: 0, wood: 0, parapet: 0, building: 0 };
  for (const p of close) count[p.group]++;
  const parts = [];
  if (count.tree) parts.push(`${count.tree} tree${count.tree > 1 ? "s" : ""}`);
  if (count.rock) parts.push(`${count.rock} rock${count.rock > 1 ? "s" : ""}`);
  if (count.wood) parts.push(`${count.wood} log${count.wood > 1 ? "s" : ""}/stump`);
  if (count.parapet) parts.push(`parapet`);
  // A house is a run of wall bays and a parked car is two halves, so the
  // count is of BAYS — say so rather than claim that many houses.
  if (count.building) parts.push(`${count.building} house-wall/parked-car bays`);
  const nearest = close.reduce((a, b) => (a.edge < b.edge ? a : b));
  return (
    `${parts.join(", ")} within ${NEAR_EDGE} m of the edge; nearest ${nearest.group} ` +
    `${Math.max(0, nearest.edge).toFixed(1)} m ${nearest.side} at ${nearest.s.toFixed(0)} m`
  );
}

/** Arc position of every segment's start, m, in plan order. */
function segmentStarts(track) {
  const starts = [];
  let s = 0;
  for (const seg of track.segments) {
    starts.push(s);
    s += seg.length;
  }
  return starts;
}

/** Contiguous stretches of one surface along the road, as `[fromS, toS]`
 * ranges — the tarmac sections, the fords. */
export function surfaceRuns(track, surface) {
  const runs = [];
  let open = null;
  for (const sample of track.samples) {
    if (sample.surface === surface && sample.deck == null) {
      if (!open) open = { fromS: sample.s, toS: sample.s };
      else open.toS = sample.s;
    } else if (open) {
      runs.push(open);
      open = null;
    }
  }
  if (open) runs.push(open);
  return runs;
}

/**
 * The stage's features in stage order. Each has:
 *   id      the name the picture and the table both use
 *   kind    turn | jump | crest | ford | bridge | checkpoint | start |
 *           finish | junction | crossing
 *   s       arc position, m (turns and water also carry `endS`)
 *   x z     where that is on the map, and `heading` there
 *   label   the short mark drawn on the map
 *   detail  one line of what it is, for the table
 *   solids  what stands within reach of the road there
 */
export function stageFeatures(track, terrain) {
  const { samples } = track;
  const starts = segmentStarts(track);
  const features = [];
  const at = (s) => {
    const i = indexAtS(samples, s);
    const sample = samples[i];
    return {
      index: i,
      x: sample.x,
      z: sample.z,
      heading: sample.heading,
      elevation: sample.elevation,
    };
  };
  const solids = (fromS, toS) => solidsAlong(track, terrain, fromS, toS);

  // ── The turns: the co-driver's calls, numbered as they are called ─────
  const turns = track.pacenotes.map((note, k) => {
    const from = indexAtS(samples, note.s);
    const to = indexAtS(samples, note.endS);
    const dir = note.dir > 0 ? "left" : "right";
    const long = note.angle > LONG_NOTE_ANGLE;
    const radius = minRadius(samples, from, to);
    const mid = at((note.s + note.endS) / 2);
    const word = `${long ? "LONG " : ""}${SEVERITY_WORD[note.severity]} ${dir.toUpperCase()}`;
    return {
      id: `T${k + 1}`,
      kind: "turn",
      s: note.s,
      endS: note.endS,
      ...mid,
      dir,
      severity: note.severity,
      long,
      angle: note.angle,
      radius,
      label: `T${k + 1} ${SEVERITY_WORD[note.severity][0]}${dir[0].toUpperCase()}`,
      detail:
        `${word}, ${((note.angle * 180) / Math.PI).toFixed(0)}° over ${(note.endS - note.s).toFixed(0)} m` +
        (Number.isFinite(radius) ? `, tightest R ${radius.toFixed(0)} m` : "") +
        `, ${gradeBefore(samples, from).toFixed(0)}% grade in`,
      solids: solids(note.s - 10, note.endS + 10),
    };
  });
  features.push(...turns);

  /** The next call after an arc position, and how far off it is. */
  const nextTurn = (s) => turns.find((t) => t.s > s) ?? null;
  const inTurn = (s) => turns.find((t) => t.s <= s && s <= t.endS) ?? null;

  // ── The jumps: every lip the compiler flagged ─────────────────────────
  let jumpNo = 0;
  samples.forEach((sample, index) => {
    if (!sample.jump) return;
    jumpNo++;
    const segIndex = starts.findLastIndex((start) => start <= sample.s + 1e-6);
    const seg = track.segments[segIndex];
    const rampFrom =
      seg?.feature === "jump" && seg.featureStart != null
        ? starts[segIndex] + seg.featureStart
        : sample.s - 20;
    const lip = seg?.lipHeight;
    const grade = gradeBefore(samples, index, Math.max(8, sample.s - rampFrom));
    const after = nextTurn(sample.s);
    const during = inTurn(sample.s);
    const where = during
      ? `inside ${during.id} (${SEVERITY_WORD[during.severity]} ${during.dir.toUpperCase()})`
      : after
        ? `on a straight, ${(after.s - sample.s).toFixed(0)} m before ${after.id} ` +
          `(${SEVERITY_WORD[after.severity]} ${after.dir.toUpperCase()})`
        : "on the run to the finish";
    features.push({
      id: `J${jumpNo}`,
      kind: "jump",
      s: sample.s,
      index,
      x: sample.x,
      z: sample.z,
      heading: sample.heading,
      elevation: sample.elevation,
      rampFrom,
      lipHeight: lip,
      grade,
      label: `J${jumpNo}`,
      detail:
        `lip ${lip != null ? lip.toFixed(1) : "?"} m up a ${grade.toFixed(0)}% ramp of ` +
        `${(sample.s - rampFrom).toFixed(0)} m, ${where}`,
      solids: solids(rampFrom, sample.s + 60),
    });
  });

  // ── Crests and water, from the plan ───────────────────────────────────
  let crestNo = 0;
  let fordNo = 0;
  let bridgeNo = 0;
  track.segments.forEach((seg, k) => {
    const segStart = starts[k];
    const fromS = segStart + (seg.featureStart ?? 0);
    const toS = segStart + (seg.featureEnd ?? seg.length);
    if (seg.feature === "crest") {
      crestNo++;
      const brow = at((fromS + toS) / 2);
      features.push({
        id: `CR${crestNo}`,
        kind: "crest",
        s: (fromS + toS) / 2,
        endS: toS,
        ...brow,
        label: `CR${crestNo}`,
        detail:
          `blind crest, brow ${seg.crestHeight != null ? seg.crestHeight.toFixed(1) : "?"} m ` +
          `over ${(toS - fromS).toFixed(0)} m` +
          (inTurn((fromS + toS) / 2) ? ` inside ${inTurn((fromS + toS) / 2).id}` : ""),
        solids: solids(fromS, toS),
      });
    } else if (seg.feature === "water") {
      const ford = seg.crossing === "ford";
      const id = ford ? `F${++fordNo}` : `B${++bridgeNo}`;
      const mid = at((fromS + toS) / 2);
      features.push({
        id,
        kind: ford ? "ford" : "bridge",
        s: fromS,
        endS: toS,
        ...mid,
        crossing: seg.crossing,
        label: id,
        detail: ford
          ? `ford, ${(toS - fromS).toFixed(0)} m of water on the road`
          : `${seg.crossing} bridge, ${(toS - fromS).toFixed(0)} m of deck`,
        solids: solids(fromS - 20, toS + 20),
      });
    }
    if (seg.overRoad) {
      const mid = at(segStart + seg.length / 2);
      features.push({
        id: `X${k}`,
        kind: "crossing",
        s: segStart + seg.length / 2,
        ...mid,
        label: "X",
        detail: "crosses a public road square on",
        solids: [],
      });
    }
  });

  // ── The junctions: where the tarmac is joined and left ────────────────
  track.junctions.forEach((junction, k) => {
    let best = 0;
    let bestD = Infinity;
    samples.forEach((sample, i) => {
      const d = Math.hypot(sample.x - junction.x, sample.z - junction.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const sample = samples[best];
    // The seal starts a car length or two either side of the meeting point
    // (the mouth is paved with the platform), so read the surface well clear
    // of it on both sides.
    const before = samples[Math.max(0, best - 30)].surface;
    const after = samples[Math.min(samples.length - 1, best + 30)].surface;
    const onto = after === "asphalt" && before !== "asphalt";
    features.push({
      id: `JN${k + 1}`,
      kind: "junction",
      s: sample.s,
      index: best,
      x: junction.x,
      z: junction.z,
      heading: sample.heading,
      elevation: junction.y,
      label: `JN${k + 1}`,
      detail: onto
        ? "junction: gravel turns ONTO tarmac here"
        : after !== "asphalt" && before === "asphalt"
          ? "junction: tarmac left for gravel here"
          : "junction with a public road",
      solids: [],
    });
  });

  // ── The homesteads (R37): a house on its yard, off the stage ──────────
  (track.homesteads ?? []).forEach((home, k) => {
    const at = samples[indexAtS(samples, home.atS)];
    const yardD = Math.hypot(home.yard.x - at.x, home.yard.z - at.z);
    const houseD = Math.hypot(home.house.x - at.x, home.house.z - at.z);
    // A homestead's `side` counts +1 as RIGHT of travel — the opposite
    // sense to a pacenote's `dir`.
    const side = home.side > 0 ? "right" : "left";
    features.push({
      id: `H${k + 1}`,
      kind: "homestead",
      s: home.atS,
      index: indexAtS(samples, home.atS),
      x: home.house.x,
      z: home.house.z,
      heading: at.heading,
      elevation: home.house.y,
      side,
      label: `H${k + 1}`,
      detail:
        `homestead ${side}: ${home.house.plan.storeys}-storey house ${houseD.toFixed(0)} m off the centreline, ` +
        `yard rim ${Math.max(0, yardD - home.yard.radius - at.width / 2).toFixed(0)} m off the edge, ` +
        `${home.cars.length} parked car${home.cars.length === 1 ? "" : "s"}, ${home.trees.length} lane tree${home.trees.length === 1 ? "" : "s"}`,
      solids: solids(home.atS - 40, home.atS + 40),
    });
  });

  // ── The towns (R39): a village down both sides of a sealed street ─────
  (track.towns ?? []).forEach((town, k) => {
    const index = indexAtS(samples, town.atS);
    const at = samples[index];
    const lots = town.lots;
    const cx = lots.reduce((sum, lot) => sum + lot.building.x, 0) / Math.max(1, lots.length);
    const cz = lots.reduce((sum, lot) => sum + lot.building.z, 0) / Math.max(1, lots.length);
    const kinds = {};
    for (const lot of lots)
      kinds[lot.building.plan.kind] = (kinds[lot.building.plan.kind] ?? 0) + 1;
    const cars = lots.reduce((sum, lot) => sum + lot.cars.length, 0);
    const where =
      town.street.kind === "route"
        ? `on the borrowed tarmac ${town.street.fromS.toFixed(0)}–${town.street.toS.toFixed(0)} m`
        : `down the arm the tape shuts at the ${town.street.end === "exit" ? "junction the route leaves by" : "junction the route joins at"}`;
    features.push({
      id: `V${k + 1}`,
      kind: "town",
      s: town.atS,
      index,
      x: cx,
      z: cz,
      heading: at.heading,
      elevation: lots[0]?.building.y ?? at.elevation,
      side: "both",
      label: `V${k + 1}`,
      detail:
        `town ${where}: ${lots.length} buildings (` +
        Object.entries(kinds)
          .map(([kind, n]) => `${n} ${kind}`)
          .join(", ") +
        `), ${cars} parked car${cars === 1 ? "" : "s"}`,
      solids: town.street.kind === "route" ? solids(town.street.fromS, town.street.toS) : [],
    });
  });

  // ── The splits, the start and the finish ──────────────────────────────
  track.checkpoints.forEach((board, k) => {
    const sample = samples[board.index];
    const after = turns.filter((t) => t.endS <= board.s).at(-1);
    features.push({
      id: `CP${k + 1}`,
      kind: "checkpoint",
      s: board.s,
      index: board.index,
      x: sample.x,
      z: sample.z,
      heading: sample.heading,
      elevation: sample.elevation,
      label: `CP${k + 1}`,
      detail: `split board${after ? `, on the exit of ${after.id}` : ""}; a respawn lands here`,
      solids: [],
    });
  });
  const first = samples[0];
  features.push({
    id: "START",
    kind: "start",
    s: 0,
    index: 0,
    x: first.x,
    z: first.z,
    heading: first.heading,
    elevation: first.elevation,
    label: track.circuit ? "S/F" : "START",
    detail: track.circuit
      ? "start AND finish line: the lap comes back to it"
      : `start line; first call ${turns[0] ? `${turns[0].id} at ${turns[0].s.toFixed(0)} m` : "none"}`,
    solids: solids(0, 60),
  });
  if (!track.circuit) {
    const finishS = track.finishS ?? track.length;
    const fin = at(finishS);
    features.push({
      id: "FINISH",
      kind: "finish",
      s: finishS,
      ...fin,
      label: "FINISH",
      detail: `finish gate, ${(track.length - finishS).toFixed(0)} m of run-out past it`,
      solids: solids(finishS - 60, finishS),
    });
  }

  features.sort((a, b) => a.s - b.s || rank(a) - rank(b));
  return features;
}

/** Tie-break for features at one arc position: the mark the driver meets
 * first in the sentence. */
function rank(feature) {
  return [
    "start",
    "junction",
    "crossing",
    "homestead",
    "town",
    "turn",
    "crest",
    "ford",
    "bridge",
    "jump",
    "checkpoint",
    "finish",
  ].indexOf(feature.kind);
}

/** The whole stage in one paragraph of numbers. */
export function stageSummary(track, features) {
  const turns = features.filter((f) => f.kind === "turn");
  const by = (kind) => features.filter((f) => f.kind === kind).length;
  const paved = track.samples.filter((s) => s.surface === "asphalt").length;
  const elevations = track.samples.map((s) => s.elevation);
  return {
    lengthM: track.finishS ?? track.length,
    roadM: track.length,
    circuit: track.circuit,
    turns: turns.length,
    hard: turns.filter((t) => t.severity === "hard").length,
    medium: turns.filter((t) => t.severity === "medium").length,
    soft: turns.filter((t) => t.severity === "soft").length,
    jumps: by("jump"),
    crests: by("crest"),
    fords: by("ford"),
    bridges: by("bridge"),
    checkpoints: by("checkpoint"),
    junctions: by("junction"),
    homesteads: by("homestead"),
    towns: by("town"),
    tarmacShare: paved / track.samples.length,
    tarmac: surfaceRuns(track, "asphalt"),
    climb: Math.max(...elevations) - Math.min(...elevations),
    widthM: track.width,
  };
}
