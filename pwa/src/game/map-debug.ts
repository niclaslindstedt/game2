// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MAP'S DEBUG BOX — what a full-screen screenshot of the map has to say
// for itself.
//
// It is the same idea as the driving overlay next door (debug-info.ts) and
// it exists for the same reason: a picture of a generator defect is worth
// nothing to the person who has to fix it unless the picture also says
// which seed it is, which dials built it, which layer is painted on it and
// where the camera was standing. The difference is the SUBJECT. Driving,
// the question is "what was the car doing"; here it is "what did the
// generator build", so the boxes carry the stage's own vocabulary — the
// segments it was assembled from, the features in them, the spurs forked
// off it — and the layer's measurement of the ground it was laid on.
//
// Nothing here touches the DOM, so the same rows can be read off a
// screenshot, copied as text, or asserted on in a headless pass.

import type { Track } from "@engine";

import type { MapPose } from "./camera.ts";
import { stageParams, type DebugBox, type DebugStage } from "./debug-info.ts";
import type { MapLayerId, MapLayerInfo } from "./map-layers.ts";
import { STAGE_DIALS } from "./menu.tsx";

const m = (v: number): string => v.toFixed(1);
const deg = (rad: number): string => `${(((rad * 180) / Math.PI) % 360).toFixed(1)}°`;

/** What the stage was ASSEMBLED from: the vocabulary the search drew on,
 * counted. A stage with no jumps in it, or with every turn a hairpin, is a
 * rules problem rather than a geometry one, and this is the row that says
 * so without anybody having to drive it. */
function segmentTally(track: Track): string {
  let turns = 0;
  let jumps = 0;
  let crests = 0;
  let fords = 0;
  let bridges = 0;
  for (const plan of track.segments) {
    if (plan.kind === "turn") turns++;
    if (plan.feature === "jump") jumps++;
    if (plan.feature === "crest") crests++;
    if (plan.feature === "water") {
      if (plan.crossing === "ford") fords++;
      else bridges++;
    }
  }
  const straights = track.segments.length - turns;
  return `${turns} turns · ${straights} straights · ${jumps} jumps · ${crests} crests · ${fords} fords · ${bridges} bridges`;
}

/** The stage box: what was built, in the generator's own terms. */
function stageBox(stage: DebugStage, track: Track, build: string): DebugBox {
  const b = track.bounds;
  const shape = track.endless ? "endless" : track.circuit ? "circuit" : "sprint";
  // Spelled out rather than initialled, for the same reason the driving
  // overlay spells them: two dials start with the same letter, and a repro
  // read off a screenshot must not depend on guessing which is which.
  const dials = [
    stage.knobs.biome,
    ...STAGE_DIALS.map((d) => `${d.key} ${stage.knobs[d.key].toFixed(2)}`),
  ].join(" · ");
  return {
    title: "STAGE",
    rows: [
      { k: "seed", v: `${stage.seed} · ${shape} ${stage.length} · ${stage.laps} lap` },
      { k: "dials", v: dials },
      {
        k: "road",
        v: `${(track.length / 1000).toFixed(2)} km · ${m(track.width)} m wide · ${track.samples.length} samples`,
      },
      { k: "plan", v: segmentTally(track) },
      {
        k: "spread",
        v: `${m(b.maxX - b.minX)} × ${m(b.maxZ - b.minZ)} m · centre ${m((b.minX + b.maxX) / 2)} ${m((b.minZ + b.maxZ) / 2)}`,
      },
      {
        k: "fittings",
        v: `${track.spurs.length} spurs · ${track.junctions.length} junctions · ${track.checkpoints.length} splits · ${track.pacenotes.length} calls`,
      },
      { k: "build", v: build },
    ],
  };
}

/** Where the lens is over the map, in the units the map is steered in — so
 * a second look at the same defect is a matter of typing three numbers back
 * rather than hunting for it again. */
function viewBox(pose: MapPose, layer: MapLayerInfo | null): DebugBox {
  return {
    title: "MAP VIEW",
    rows: [
      { k: "layer", v: layer ? `${layer.label} · ${m(layer.cell)} m per reading` : "none" },
      {
        k: "framing",
        v: `${m(pose.across)} m across the pane · ${m(pose.range)} m out · zoom ×${(1 / pose.zoom).toFixed(1)}`,
      },
      {
        k: "aim",
        v: `${deg(pose.az)} around · ${deg(pose.pitch)} up · pan ${m(pose.panX)} ${m(pose.panZ)} m`,
      },
      {
        k: "lens",
        v: `${m(pose.eye.x)} ${m(pose.eye.y)} ${m(pose.eye.z)} · aiming at ground ${m(pose.aimY)} m`,
      },
      { k: "frustum", v: `${m(pose.near)} … ${m(pose.far)} m` },
    ],
  };
}

/** The boxes the full-screen map stacks, in reading order: what was built,
 * what the painted layer measured of it, and where this was seen from. */
export function mapDebugBoxes(
  stage: DebugStage,
  track: Track,
  pose: MapPose,
  layer: MapLayerInfo | null,
  build: string,
): DebugBox[] {
  const boxes = [stageBox(stage, track, build)];
  if (layer) boxes.push({ title: layer.label, rows: layer.rows });
  boxes.push(viewBox(pose, layer));
  return boxes;
}

/** The query that puts somebody else in front of this exact map: the same
 * stage, the same layer, the same framing, full screen. The stage half comes
 * off `stageParams` so that a dial added to the generator reaches this line
 * for free — the driving repro and this one are two framings of one list.
 *
 * `start` is dropped: this link opens a MAP, not a run, and a link that drove
 * away from the thing being looked at would be the one mistake the whole
 * loop exists to stop. */
export function mapReproQuery(stage: DebugStage, pose: MapPose, layer: MapLayerId | null): string {
  const params = stageParams(stage);
  params.delete("start");
  params.set("roam", "1");
  params.set("mapfull", "1");
  if (layer) params.set("layer", layer);
  params.set("maz", pose.az.toFixed(4));
  params.set("mpitch", pose.pitch.toFixed(4));
  params.set("mzoom", pose.zoom.toFixed(5));
  params.set("mpanx", pose.panX.toFixed(1));
  params.set("mpanz", pose.panZ.toFixed(1));
  return `?${params.toString()}`;
}
