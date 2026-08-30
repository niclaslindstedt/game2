// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the debug overlay knows, gathered in one place and shaped into rows
// somebody can read off a screenshot.
//
// THE POINT OF THIS FILE IS THE REPRO LINE. Everything else here is context
// for a human eye; `reproQuery` is the part a second person — or an agent
// handed nothing but a PNG — pastes back to stand on the same square metre
// of the same stage, in the same light, looking the same way. Every fact
// that goes into it has to be one the app can also READ back out of a URL
// (see App.tsx), or the loop is broken and nobody finds out until the
// screenshots disagree.
//
// Rendering lives next door in debug-hud.tsx; nothing here touches the DOM,
// so the debug log can write the same rows into text.

import type { GameState, StageKnobs, Track } from "@engine";

import type { FreeFlyPose } from "./camera-free.ts";
import type { CameraMode } from "./camera.ts";
import { STAGE_DIALS } from "./menu.tsx";
import type { PlayCamera } from "./settings.ts";

/** Everything about WHICH stage is standing — the App's own stage spec, in
 * the shape this module needs it. Structural, so the App hands its
 * `StageSpec` straight over. */
export type DebugStage = {
  seed: number;
  length: string;
  shape: string;
  laps: number;
  knobs: StageKnobs;
  carId: string;
  timeOfDay: string;
  weather: string;
};

/** One line of the overlay. `k` doubles as the row's `data-k` in the DOM, so
 * a headless pass can read a value back without parsing the screenshot it
 * just took. */
export type DebugRow = { k: string; v: string };

export type DebugBox = { title: string; rows: DebugRow[] };

/** What the App knows that the engine does not, plus the camera's own
 * standing. */
export type DebugContext = {
  stage: DebugStage;
  /** Which camera is up, and the one the player would return to. */
  view: CameraMode;
  playCamera: PlayCamera;
  pose: FreeFlyPose & { speed: number };
  god: boolean;
  /** Frames per second, averaged over the last second. */
  fps: number;
  /** Build stamp — the version and the commit the app was cut from. */
  build: string;
};

const m = (v: number): string => v.toFixed(1);
const deg = (rad: number): string => `${((rad * 180) / Math.PI).toFixed(1)}°`;

/** The sample of `track` nearest a world point, scanned whole rather than
 * windowed. The engine's own `locate` only looks a few dozen samples either
 * side of a hint, which is exactly right for a car that cannot teleport and
 * exactly wrong for a camera that can: god mode's whole purpose is to be
 * somewhere the car is not. A stage is a few thousand samples and this runs
 * at the HUD's rate, not the engine's. */
export function nearestSample(track: Track, x: number, z: number): { index: number; d: number } {
  let best = 0;
  let bestD2 = Infinity;
  const samples = track.samples;
  for (let i = 0; i < samples.length; i++) {
    const dx = x - samples[i].x;
    const dz = z - samples[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return { index: best, d: Math.sqrt(bestD2) };
}

/** The stage box: everything that decides what the generator built and what
 * it was lit with. This is the half of a repro that is the same for every
 * frame of a run — read it off the screenshot and you have the world. */
function stageBox(ctx: DebugContext, state: GameState): DebugBox {
  const t = state.track;
  // Spelled out rather than initialled: two of the dials start with the
  // same letter, and a repro read off a screenshot must not depend on
  // guessing which `w` is the water and which is the width.
  const dials = STAGE_DIALS.map((d) => `${d.key} ${ctx.stage.knobs[d.key].toFixed(2)}`).join(" · ");
  return {
    title: "STAGE",
    rows: [
      { k: "seed", v: String(ctx.stage.seed) },
      { k: "shape", v: `${ctx.stage.shape} ${ctx.stage.length} · ${ctx.stage.laps} lap` },
      { k: "dials", v: dials },
      { k: "road", v: `${m(t.length)} m · ${m(t.width)} m wide · ${t.samples.length} samples` },
      { k: "cond", v: `${ctx.stage.timeOfDay} ${ctx.stage.weather}` },
      { k: "car", v: `${ctx.stage.carId} (${state.spec.name})` },
      { k: "build", v: ctx.build },
    ],
  };
}

/** Where the LENS is, and what the world is doing under it. The camera is
 * the subject rather than the car because the camera is what took the
 * picture: the thing in the middle of the frame is whatever this point was
 * looking at. */
function placeBox(ctx: DebugContext, state: GameState): DebugBox {
  const p = ctx.pose;
  const near = nearestSample(state.track, p.x, p.z);
  const sample = state.track.samples[near.index];
  const ground = state.terrain.groundAt(p.x, p.z);
  const water = state.terrain.waterAt(p.x, p.z);
  return {
    title: "PLACE",
    rows: [
      { k: "xyz", v: `${m(p.x)} ${m(p.y)} ${m(p.z)}` },
      { k: "ground", v: `${m(ground)} m · ${m(p.y - ground)} m up` },
      { k: "water", v: water === null ? "dry" : `${m(water)} m` },
      // Where the ROAD is from here, which is what names a place on a stage:
      // "1240 m along, 18 m off it" finds a spot; a world coordinate only
      // confirms you are standing on the one you already found.
      { k: "stage-s", v: `${m(sample.s)} m of ${m(state.track.length)} m` },
      { k: "off-road", v: `${m(near.d)} m from centre · sample ${near.index}` },
      { k: "surface", v: sample.surface },
    ],
  };
}

/** The camera box: the half of the repro line that changes shot to shot.
 *
 * God mode is announced in this box's TITLE rather than in a panel of its
 * own. It has to be visible — a picture taken from a camera that is not on
 * the car reads differently from one that is — but it is one word, and one
 * word does not get to take a corner of the screen away from the thing
 * being photographed. */
function cameraBox(ctx: DebugContext): DebugBox {
  const rows: DebugRow[] = [
    { k: "view", v: ctx.god ? `free (returns to ${ctx.playCamera})` : ctx.view },
    { k: "yaw", v: `${deg(ctx.pose.yaw)} (${ctx.pose.yaw.toFixed(4)} rad)` },
    { k: "pitch", v: `${deg(ctx.pose.pitch)} (${ctx.pose.pitch.toFixed(4)} rad)` },
  ];
  if (ctx.god) rows.push({ k: "fly-speed", v: `${m(ctx.pose.speed)} m/s` });
  rows.push({ k: "fps", v: ctx.fps.toFixed(0) });
  return { title: ctx.god ? "CAMERA · GOD MODE" : "CAMERA", rows };
}

/** The car, while somebody is driving it. This box is the one that answers
 * "what was the car DOING when it went wrong", so it carries the state a
 * handling or collision bug is argued from — the slip angle, the load on
 * the wheels, what the surface under them is — rather than the speedo the
 * HUD already shows. */
function carBox(state: GameState): DebugBox {
  const c = state.car;
  const speed = Math.hypot(c.u, c.w);
  const slip = speed > 0.5 ? Math.atan2(c.w, Math.max(0.001, c.u)) : 0;
  const dmg = c.damage;
  const worst = (Object.entries(dmg.systems) as [string, number][])
    .filter(([, v]) => v > 0.02)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
    .join(" ");
  return {
    title: "CAR",
    rows: [
      { k: "xyz", v: `${m(c.x)} ${m(c.y)} ${m(c.z)}` },
      { k: "vel", v: `${m(speed * 3.6)} km/h · u ${m(c.u)} w ${m(c.w)} vy ${m(c.vy)}` },
      { k: "slip", v: `${deg(slip)} · yaw rate ${c.yawRate.toFixed(2)} rad/s` },
      { k: "attitude", v: `head ${deg(c.heading)} pitch ${deg(c.pitch)} roll ${deg(c.roll)}` },
      {
        k: "drive",
        v: `gear ${c.reversing ? "R" : c.gear} · rev ${c.rev.toFixed(2)}${c.airborne ? " · AIRBORNE" : ""}`,
      },
      {
        k: "track",
        v: `s ${m(state.progressS)} · lat ${m(state.lateral)} · ${state.surface}${state.offRoad ? " · OFF" : ""}${state.lost ? " · LOST" : ""}`,
      },
      {
        k: "damage",
        v: `wear ${(dmg.wear * 100).toFixed(0)}%${worst ? ` · ${worst}` : ""}${dmg.broken.length ? ` · lost ${dmg.broken.join(",")}` : ""}`,
      },
      {
        k: "run",
        v: `${state.phase} · lap ${state.lap}/${state.laps} · t ${state.raceTime.toFixed(2)} s`,
      },
    ],
  };
}

/** The query string that reproduces this exact frame.
 *
 * It always pins the whole stage AND lands in god mode at the camera's
 * current pose, whichever camera the picture was actually taken from —
 * because standing still and looking is what a second pair of eyes needs to
 * do first. A chase-cam screenshot therefore reproduces as a FREE camera
 * parked where that chase cam was, which is the same view of the same
 * thing, held. */
export function reproQuery(ctx: DebugContext): string {
  const p = ctx.pose;
  const params = stageParams(ctx.stage);
  params.set("god", "1");
  params.set("gx", p.x.toFixed(2));
  params.set("gy", p.y.toFixed(2));
  params.set("gz", p.z.toFixed(2));
  params.set("gyaw", p.yaw.toFixed(4));
  params.set("gpitch", p.pitch.toFixed(4));
  return `?${params.toString()}`;
}

/** The stage half of a repro on its own — everything that decides what was
 * BUILT, with no camera on it. This is what heads a run in the debug log,
 * where there is no one frame to stand in: the lines under it are a whole
 * run, and what they share is the stage. */
export function stageQuery(stage: DebugStage): string {
  return `?${stageParams(stage).toString()}`;
}

/** Everything that decides what the generator BUILT, as URL parameters —
 * the half of every repro line that is about the stage rather than about the
 * frame. Exported so the map view's own line (map-debug.ts) is built from
 * this one list rather than from a second copy of it that can drift. */
export function stageParams(stage: DebugStage): URLSearchParams {
  const params = new URLSearchParams({
    seed: String(stage.seed),
    length: stage.length,
    shape: stage.shape,
    laps: String(stage.laps),
    tod: stage.timeOfDay,
    weather: stage.weather,
    car: stage.carId,
  });
  for (const dial of STAGE_DIALS) params.set(dial.key, stage.knobs[dial.key].toFixed(3));
  params.set("start", "1");
  params.set("debug", "1");
  return params;
}

/** The boxes for the overlay, in the order they are stacked.
 *
 * God mode and a run print DIFFERENT things because they are two different
 * questions. Flying, nobody is driving and the car is scenery: what matters
 * is where the lens is standing and what the generator put there, so PLACE
 * comes first and the car is one summary line. Racing, the car IS the
 * subject: the full CAR box comes back and the place drops to what the run
 * is doing on the road. */
export function debugBoxes(ctx: DebugContext, state: GameState): DebugBox[] {
  if (ctx.god) {
    const car = state.car;
    return [
      placeBox(ctx, state),
      cameraBox(ctx),
      stageBox(ctx, state),
      {
        title: "CAR (PARKED)",
        rows: [
          { k: "xyz", v: `${m(car.x)} ${m(car.y)} ${m(car.z)}` },
          { k: "track", v: `s ${m(state.progressS)} · lat ${m(state.lateral)} · ${state.phase}` },
        ],
      },
    ];
  }
  return [carBox(state), placeBox(ctx, state), cameraBox(ctx), stageBox(ctx, state)];
}

/** One compact line for the log's per-second trace. Deliberately NOT the
 * full box dump: a two-minute run at one line a second would fill the whole
 * ring buffer with the same eight facts and push out the events that
 * actually say what went wrong. What is kept is the shape of the run —
 * where it was, how fast, on what, and whether it was in trouble. */
export function traceLine(ctx: DebugContext, state: GameState): string {
  const c = state.car;
  const speed = Math.hypot(c.u, c.w) * 3.6;
  const flags = [
    state.offRoad ? "off" : "",
    state.lost ? "lost" : "",
    c.airborne ? "air" : "",
    state.drowning ? "drowning" : "",
  ]
    .filter(Boolean)
    .join(",");
  const cam = ctx.god
    ? ` cam ${m(ctx.pose.x)} ${m(ctx.pose.y)} ${m(ctx.pose.z)} yaw ${ctx.pose.yaw.toFixed(2)}`
    : "";
  return (
    `s=${m(state.progressS)} lat=${m(state.lateral)} xyz ${m(c.x)} ${m(c.y)} ${m(c.z)} ` +
    `${m(speed)} km/h ${state.surface} ${state.phase} wear=${(c.damage.wear * 100).toFixed(0)}%` +
    `${flags ? ` [${flags}]` : ""} ${ctx.fps.toFixed(0)} fps${cam}`
  );
}

/** ANY boxes as one block of text, with the repro under them. A screenshot
 * is the fastest way to SHOW a problem and the slowest way to quote a
 * number out of; this is the other half, and it is the whole of what the
 * map's COPY DEBUG INFO puts on the clipboard.
 *
 * `repro` is whatever the surface wants pasted back — the query on its own
 * where the reader already knows which build it is, the whole URL where the
 * text is going somewhere else entirely. */
export function debugReport(boxes: DebugBox[], repro: string): string {
  const lines: string[] = [];
  for (const box of boxes) {
    lines.push(`[${box.title}]`);
    for (const row of box.rows) lines.push(`  ${row.k}: ${row.v}`);
  }
  lines.push(`[REPRO] ${repro}`);
  return lines.join("\n");
}

/** The driving overlay's own boxes, as that block — for the debug log and
 * the clipboard. */
export function debugText(ctx: DebugContext, state: GameState): string {
  return debugReport(debugBoxes(ctx, state), reproQuery(ctx));
}
