// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRACK A CAR LEAVES IN SNOW — what is left behind it on a snow road or
// a snowfield (climate.ts). Nothing on a gravel road records a car having
// passed; snow does, and a white stage with no track on it is a stage nobody
// has driven.
//
// IT IS FOUR TYRES, AND EACH ONE DRAWS ITS OWN. That is the whole shape of
// this module and the reason it is not a single strip swept along the car.
// A swept strip has one width and two ruts in it whatever the car is doing,
// and that is right for exactly one case: a car going where it is pointing.
// The moment it is sideways — which on a rally stage is most of the time —
// it is wrong in three ways at once, and all three are visible from the
// chase camera:
//
//   * THE FRONTS AND THE REARS STOP SHARING A LINE. Driven straight, a rear
//     wheel runs in the track its own front wheel cut and the car leaves
//     TWO tracks. Yawed, the four wheels sweep four different paths, and
//     what is behind the car is FOUR — the classic pair of crossing arcs a
//     drift writes into a snowfield.
//   * THE TRACK GETS WIDER THAN THE CAR. The contact patch is dragged
//     sideways, so a tyre going 40° off its own pointing direction smears a
//     band far wider than its tread (`bandHalf`), and the four bands
//     together are wider than the car that made them.
//   * ...and THE TREAD STOPS PRINTING. A rolling tyre stamps its blocks
//     into the snow, one row per pitch of tread. A sliding one polishes
//     what it crosses. The shader takes that as `smear` and fades the
//     pattern out with it, so a drift reads as a scrub and a straight as a
//     print.
//
// WHAT THE BODY DOES IS A SEPARATE QUESTION, and the answer is USUALLY
// NOTHING (R47, `snowBelly`). In deep powder the car cannot be where it is
// unless the snow under it has come down, so the body presses a broad floor
// at about its own clearance and the tyres cut their furrows into that —
// the trough with a crown down the middle. On a snow ROAD the cover is a
// few centimetres and the floor of the car is a clear third of a metre
// above it: the body never touches it, and what is left is four tyre tracks
// with UNBROKEN SNOW between them. So the belly pan is drawn on the same
// gate the engine presses on, and on a road it is not drawn at all.
//
// WHAT IT IS DRAWING IS REAL. The engine's snow is deformable
// (`snowpack.ts`) and the wheels have already pressed this ground down by a
// measured number of metres (`Snowpack.sunkAt`) — and a track driven a
// second and a third time deepens exactly as the physics under it does.
//
// THE GROUND ITSELF DOES THE DEEP PART. The coat of snow off the road is a
// mesh that bends (`snow-mantle.ts`), so the trough is a real hole in the
// drawn world and these bands are laid IN it, on the coat's own surface
// (`coatHeightAt`). What is left for a band to stand up is only what the
// coat had no room to show — a couple of centimetres off the road, and on a
// snow ROAD, whose mat is one mesh built when the stage was and cannot bend
// at all, the whole of a rut that was never more than that deep. Nothing
// here may ever be drawn BELOW the ground it is laid on: a floor under the
// ground mesh is a floor the depth buffer throws away.
//
// AND IT IS LIT (`snow-shader.ts`). The bands are the same snow as the coat
// around them and take the same lights, the same shadows, the same fog,
// the same wrap and the same glitter — which is what the flat unlit strip
// this replaced could not do: authored to sit in the snow at noon, it read
// as a stripe of white paint at dusk and as a lamp at night, and no tint
// multiply could tell the sunlit side of a rut from the shaded one.
//
// Each car gets a RING of stamps: each is its own quads from the last stamp
// to this one, so the ring wraps with no seam to hide and the oldest mark
// is simply the next one overwritten. A stamp is laid when the FURTHEST-
// TRAVELLED WHEEL has covered `SPACING`, not when the car's middle has —
// a car spinning on the spot moves its middle nowhere and its wheels a long
// way, and that is a mark worth having.
//
// Whose track is drawn is the DUST row's call (settings.ts, `TRAIL_LEFT`),
// which is the same question about the same wheels — but it is NOT the same
// budget, and that is the whole of why it has its own record. What a car
// throws off the ground is sprites, spawned per frame per car for as long
// as anybody is driving. What it LEAVES on the ground is this: one mesh,
// built the first time that car touches snow and never again, a ring of
// stamps rewritten in place. A stage with no snow on it never allocates one.
//
// So the car being driven marks the snow at every stop of the row, `off`
// included, and only the FIELD's tracks — one mesh per rival in range — are
// the row's to put away. The renderer asks per car, so this module only ever
// lays what it is handed.

import * as THREE from "three";
import { TUNING, snowBelly, snowUnder, type GameState, type SnowUnder } from "@engine";

import { WHEEL_STEER_LOCK } from "./wheel-steer.ts";
import { coatHeightAt, coatSagAt } from "./snow-mantle.ts";
import { snowLambert } from "./snow-shader.ts";

/** Metres of travel between stamps, measured on the busiest wheel. */
const SPACING = 0.7;
/** Stamps kept per car — at `SPACING` this is the best part of two hundred
 * metres of road behind it, which is the far side of any corner the camera
 * can see. */
const STAMPS = 280;
/** Lifted off the ground, m — every band rides on this, and no part of one
 * ever goes below. */
const LIFT = 0.04;

/** WHERE THE WHEELS ARE, and how big the patch each one stands on is.
 *
 * The positions are the ENGINE's (`TUNING.snow.wheelAt` across, `axleAt`
 * along) and not this module's own, because they are the points the engine
 * carves the snow at: a band drawn anywhere else is a picture of a rut the
 * physics did not cut. `patch` is the contact patch itself — a rally tyre
 * on snow runs soft and stands on about this — and it is what decides how
 * wide a band is, both rolling and dragged (`bandHalf`). */
const WHEELS = [
  { lz: TUNING.snow.axleAt, lx: -TUNING.snow.wheelAt, front: true },
  { lz: TUNING.snow.axleAt, lx: TUNING.snow.wheelAt, front: true },
  { lz: -TUNING.snow.axleAt, lx: -TUNING.snow.wheelAt, front: false },
  { lz: -TUNING.snow.axleAt, lx: TUNING.snow.wheelAt, front: false },
] as const;
const PATCH = { width: 0.24, length: 0.34 };

/** THE TREAD ITSELF: metres between one row of blocks and the next down the
 * band, and how many longitudinal ribs run across it.
 *
 * A rally tyre on snow runs a coarse block pattern — the point of it is to
 * bite loose ground, so the lugs are big and the voids between them are
 * bigger — and `pitch` is what sets how fast the print ticks past at speed.
 * Too fine and it strobes into a grey band at anything over walking pace;
 * this reads as separate rows from the chase camera at rally pace, which is
 * the only place it is ever judged.
 *
 * `bump` is how far the pattern leans the surface and `shade` how much it
 * darkens it. `bump` does nearly all of the work on purpose: a tread is
 * SHAPE, so what should make it visible is the light finding the edges of
 * the blocks, not the blocks being painted a different colour. `shade` is
 * the little that is honestly albedo-ish — a block pressed into snow sits
 * at the bottom of its own small groove, so it keeps a touch less of the
 * sky, which is the sky term one scale down.
 *
 * Both are deliberately UNDER what looks right in a still.
 * The first pass ran them at 0.34 and 0.16 and the track came back as a
 * ladder — rungs, with the regularity of a zip rather than the texture of
 * a tyre. A tread is something the eye catches at the edge of a frame at
 * a hundred km/h; anything strong enough to count the blocks in is too
 * strong.
 *
 * `ribs` is a COUNT and not a width, because the band is drawn in its own
 * across coordinate rather than in metres — which is what lets one pattern
 * sit correctly on a band that is narrow when the tyre rolls true and half
 * again as wide when it is dragged (`bandHalf`). A tread stretches with the
 * smear; it does not tile more of itself into it. */
const TREAD = { pitch: 0.115, ribs: 3, bump: 0.14, shade: 0.05 };

/** HOW WIDE A BAND A RECTANGLE SMEARS, half-width in m, given how far off
 * its own pointing direction it is travelling.
 *
 * A contact patch is a rectangle `PATCH.width` across the wheel by
 * `PATCH.length` along it. Dragged through the snow at an angle, what it
 * sweeps is that rectangle projected across the direction it is actually
 * going — so a tyre rolling true prints its own width and one going fully
 * sideways prints its LENGTH, and everything between is the two mixed by
 * the angle. That is the whole reason a drifting car's track is wider than
 * the car, and it comes out of the geometry rather than being asserted.
 *
 * The BODY is the same sum over a much bigger rectangle, which is why this
 * takes its dimensions rather than closing over the tyre's: a car crabbing
 * through deep snow presses a floor wider than itself for exactly the same
 * reason its tyres do. */
function bandHalf(across: number, along: number, cosB: number, sinB: number): number {
  return (across * Math.abs(cosB) + along * Math.abs(sinB)) / 2;
}

/** THE BODY'S OWN RECTANGLE, for the floor it presses in snow deep enough
 * to reach it: as wide as the wheels it stands on plus the tyres themselves,
 * and as long as the box the contact model uses — the same one the engine
 * carves the nose line across (`TUNING.snow.chassis`). */
const BODY = {
  width: 2 * (TUNING.snow.wheelAt + PATCH.width),
  length: 2 * TUNING.collision.halfLength,
};

/** The colours across a track — AND THEY ARE ALL SNOW-WHITE, which is the
 * whole of what this palette has to say.
 *
 * A tyre track in a photograph looks dark. The snow in it is NOT dark: it
 * is the same snow, pressed, and pressing snow barely moves its albedo —
 * it is still a heap of ice crystals returning most of what falls on it.
 * What is actually dark in the photograph is LIGHT: the walls of the rut
 * have turned away from the sun, the floor of it sees a strip of sky
 * instead of a hemisphere, and the crystals that were catching the sun
 * edge-on have been crushed flat. All three are lighting, and all three
 * are modelled — the section's own normals (`lean`), the sky term
 * (`SKY_SHUT`) and the reduced glitter.
 *
 * Painted dark INSTEAD, which is what this palette used to do, a track is
 * wrong in a way that shows the moment the light changes: it stays a grey
 * stripe in flat overcast where the real thing all but disappears, it
 * cannot go darker when a ridge shadow crosses it, and at dusk it reads as
 * dirt on the snow rather than as snow. So nothing here is darker than the
 * field by more than a few percent, and the pressed ones lean BLUE rather
 * than grey — packed snow scatters a little less and lets a little more of
 * the sky's own colour back, which is the one honest albedo difference
 * there is.
 *
 * `FLOOR`, `BANK` and `EDGE` are exported because a car's rut is not the
 * only thing pressed into a snowfield: the crowd's walk out to a stand
 * (`carpark.ts`) is the same two tones, and a path trodden by boots that
 * read as a different white from one pressed by tyres would be two
 * materials claiming to be one snow. */
export const FLOOR = new THREE.Color(0xe6edf7);
/** ...and what the floor becomes once traffic has worked it all the way
 * down. A glazed racing line IS a shade darker and bluer than snow, and for
 * a reason that is not compaction: it is on its way to being ICE, and ice
 * is part transparent, so some of what reaches it does not come back. Kept
 * small but deliberately not zero — this is the one place the game tells
 * the driver that the fast line is also the slippery one (`snowpack.ts`),
 * and it is told in the place they are already looking. */
const GLAZE = new THREE.Color(0xccd8ec);
const RIM = new THREE.Color(0xeff3fb);
/** The broad floor the BODY pressed, where it pressed one at all. */
const PAN = new THREE.Color(0xf0f5fc);
/** The snow thrown out past the tyre — the BRIGHTEST thing on a track, and
 * the one tone here that is not a near-copy of the field. Freshly broken
 * snow is a heap of new faces, every one of them catching the light. */
export const BANK = new THREE.Color(0xffffff);
/** ...and where a band meets the untouched field, in the field's own white
 * exactly (`snow-mantle.ts`'s `FRESH`), so a track has no drawn edge at
 * all — only the shading of its own shape. */
export const EDGE = new THREE.Color(0xf4f8ff);

/** ONE STATION ACROSS A BAND: how far out it stands, how far it rises (in
 * ridge heights — `ridgeOf`), what colour it is, and how solid. Both ends
 * come back down to the ground at zero alpha, so a band meets the snow
 * around it rather than floating a lip along its edge.
 *
 * `u` IS NOT ONE SCALE THE WHOLE WAY OUT, and that is the correction that
 * made a track visible. Inside |u| = 1 it is a fraction of the band's own
 * half width, which is what it must be: the floor IS the contact patch, and
 * it has to widen with the smear. OUTSIDE it, every extra unit is
 * `SHOULDER` metres — an absolute distance, because the snow a tyre throws
 * out past itself spreads about as far whatever the tyre was doing. Scaled
 * with the band like everything else, the thrown lip came out two
 * centimetres wide: sub-pixel at any honest camera distance, which is a
 * track drawn with no shoulder at all and the reason the first sheet came
 * back showing two pencil lines where there should have been tyre tracks. */
type Station = { u: number; rise: number; tone: THREE.Color; alpha: number };

/** How far out the thrown snow reaches past the band's edge, m per unit of
 * `u` beyond 1 — so the sections below, which run to 1.45, put their outer
 * edge about a hand's breadth outside the pressed floor. */
const SHOULDER = 0.34;

/** Where a station actually stands, m to the side of the band's middle. */
function acrossAt(u: number, half: number): number {
  const out = Math.abs(u);
  const side = out > 1 ? half + (out - 1) * SHOULDER : out * half;
  return u < 0 ? -side : side;
}

/** A TYRE'S OWN CROSS-SECTION. Read from the middle out: the floor the
 * tread pressed flat, the shoulder where it lets go, and the little the
 * tyre pushed out past itself. It is deliberately NOT a snowplough's
 * cross-section — no wall of thrown snow down either side — because the
 * thing that made the mark was a tyre, and the deep trough a field of
 * powder puts it in is drawn by the coat under it rather than implied by
 * banks over it (`ridgeOf`).
 *
 * The floor is a flat BAND and not a crease: a tyre presses the width of
 * itself, and a section that touches the floor colour at one station draws
 * a hairline nobody reads at speed. */
const TYRE: Station[] = [
  { u: -1.45, rise: 0, tone: EDGE, alpha: 0 },
  { u: -1.15, rise: 0.9, tone: BANK, alpha: 0.8 },
  { u: -1.0, rise: 0.35, tone: RIM, alpha: 1 },
  { u: -0.88, rise: 0, tone: FLOOR, alpha: 1 },
  { u: 0.88, rise: 0, tone: FLOOR, alpha: 1 },
  { u: 1.0, rise: 0.35, tone: RIM, alpha: 1 },
  { u: 1.15, rise: 0.9, tone: BANK, alpha: 0.8 },
  { u: 1.45, rise: 0, tone: EDGE, alpha: 0 },
];

/** ...and THE BODY'S, for the stages where the body touches the snow at all.
 * One broad shallow floor at about the car's own clearance, spanning the
 * whole track width, with the four tyre bands cutting into it. Faded out
 * entirely by `snowBelly` on anything shallower than the sills, which is
 * every snow ROAD in the game. */
const BELLY: Station[] = [
  { u: -1, rise: 0, tone: EDGE, alpha: 0 },
  { u: -0.86, rise: 0.55, tone: PAN, alpha: 0.85 },
  { u: 0.86, rise: 0.55, tone: PAN, alpha: 0.85 },
  { u: 1, rise: 0, tone: EDGE, alpha: 0 },
];

/** The lanes a stamp lays: one per wheel, then the belly pan. */
const LANES = [...WHEELS.map(() => TYRE), BELLY];
const STATIONS = LANES.reduce((n, lane) => n + lane.length, 0);
/** Where each lane's stations start in a row. */
const LANE_AT = LANES.map((_, l) => LANES.slice(0, l).reduce((n, s) => n + s.length, 0));
/** Quads per stamp — one between each pair of stations in each lane. */
const QUADS = LANES.reduce((n, lane) => n + lane.length - 1, 0);

/** HOW MUCH SKY EACH STATION CAN SEE, 0 at the bottom of the rut and 1 at
 * the top of its lip — the section's own rise, normalised.
 *
 * This is the term that replaced a dark floor colour, and it is the honest
 * version of the same look. A point at the bottom of a groove has the walls
 * of that groove across part of its hemisphere, so less of the sky reaches
 * it and it is darker than the snow beside it WITHOUT being made of
 * anything darker. Which is why it behaves: it goes with the shape of the
 * rut (`skyShut`), so a road's shallow one hardly darkens at all and a deep
 * field rut does; and it is a multiplier on the light, so a ridge shadow
 * crossing the track takes the whole of it down together instead of
 * leaving a grey stripe lit from nowhere. */
const OPEN = LANES.map((lane) => {
  const top = Math.max(...lane.map((st) => st.rise));
  return lane.map((st) => (top > 0 ? st.rise / top : 1));
});

/** HOW MUCH SKY THE FLOOR OF A RUT HAS LOST TO ITS OWN WALLS, 0..1 —
 * computed from the rut rather than dialled.
 *
 * A rut is a trench `half` wide and `deep` deep, so its floor sees the sky
 * between ±atan(half / deep) either side of vertical, and the
 * cosine-weighted fraction of the hemisphere that leaves is the sine of
 * that angle. Two lines of trigonometry, no knob, and it answers the right
 * thing at both ends without being asked: a road's rut is two centimetres
 * deep and a hand wide, so it loses under one percent and is invisible as
 * shading — correctly, because a tyre track on a packed road IS nearly
 * invisible except for its tread; a deep field rut loses about nine.
 *
 * Nine percent is the number worth remembering, because the first version
 * of this was a flat 0.34 picked by eye and it was FOUR TIMES the truth.
 * Measured off the sheet, the bands were coming back a third darker than
 * the snow around them in plan and nearly half in the chase — which is the
 * same dark-stripe mistake the dark paint made, arriving by another road.
 * A groove a few centimetres deep in snow is barely shaded at all; what
 * makes a track visible is its WALLS turning to the sun, not its floor
 * going dim. */
function skyShut(half: number, deep: number): number {
  return 1 - Math.sin(Math.atan2(half, Math.max(deep, 1e-4)));
}

/** HOW STEEPLY THE SECTION RISES at each station, per unit of `u` — the
 * central difference of the section's own shape, so the lips of a rut carry
 * a normal that leans and catch the light as raised snow rather than reading
 * as paint on a flat floor. */
const SLOPE = LANES.map((lane) =>
  lane.map((_, i) => {
    const a = lane[Math.max(0, i - 1)];
    const b = lane[Math.min(lane.length - 1, i + 1)];
    return b.u === a.u ? 0 : (b.rise - a.rise) / (b.u - a.u);
  }),
);

/** How high a band stands above the ground it is laid on, m — WHAT THE
 * GROUND ITSELF COULD NOT SHOW.
 *
 * The drawn snow sinks under a car now: the coat is a mesh and it bends
 * (`snow-mantle.ts`), so most of a track is a hole in the ground rather
 * than a shape laid over it, and these bands only have to carry the part
 * the coat had no room for. Off the road in deep powder that is nearly
 * nothing and the coat IS the trough. On a snow ROAD it is the whole of the
 * rut, because the mat is one mesh built when the stage was and it cannot
 * bend at all; a snow road's cover is thin and already worn, so the whole
 * of the rut is a few centimetres.
 *
 * `max` is low ON PURPOSE, and it is the rule a track is judged against: a
 * car in snow leaves a TRACK — four tyres and, in powder, its floor — and
 * never the walls of thrown snow a snowplough leaves behind it. `min` keeps
 * a hairline, so a road worked to a floor still draws its track. */
const RIDGE = { min: 0.022, max: 0.08 };

function ridgeOf(sunk: number, sag: number): number {
  return Math.min(RIDGE.max, Math.max(RIDGE.min, sunk - sag));
}

/** How much of the tread a FULLY worked floor has lost. Not all of it: a
 * racing line polished by a hundred passes still carries the last car's
 * print faintly, and taking it to nothing made a worn road read as poured
 * concrete rather than as snow that has been driven on. */
const GLAZED = 0.8;

/** How uneven the thrown snow is, as a share of its own height. Snow does
 * not throw evenly: the lip a wheel builds is lumpy at the scale of the
 * lumps it is made of, and a pair of dead-straight ridges reads as extruded
 * plastic. Drawn off the station's own position so a track does not change
 * shape when it is laid again. */
const ROUGH = 0.4;

function jitter(x: number, z: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** ONE STAMP: where every station of every lane stands, and the handful of
 * numbers a lane carries as a whole. */
type Row = {
  /** Station positions, world space, three floats each. */
  pos: Float64Array;
  /** ...and how steeply the band leans across itself at each one, m per m. */
  lean: Float64Array;
  /** Per lane: the across axis (x, z), how far that lane has travelled (m,
   * for the tread's pitch), how sideways it was going (0..1), how solid the
   * lane is at all — which is what switches the belly pan off on a road —
   * and how much sky the FLOOR of its rut has lost to its own walls
   * (`skyShut`), which every station above the floor gets less of. */
  lane: Float64Array;
};
const LANE_STRIDE = 6;

/** The attributes a stamp rewrites, so the upload list and the geometry
 * cannot drift apart. */
const TOUCHED = ["position", "normal", "color", "mark", "bandAxis", "alpha"] as const;

/** Where a lane's tread distance wraps, m — far enough that no track is
 * ever long enough to see the seam, near enough that the float keeps the
 * millimetres the pattern is drawn at. */
const TREAD_WRAP = 4096;

function freshRow(): Row {
  return {
    pos: new Float64Array(STATIONS * 3),
    lean: new Float64Array(STATIONS),
    lane: new Float64Array(LANES.length * LANE_STRIDE),
  };
}

/** Scratch: the snow under a stamp, and the floor's tone for it. One record
 * each — this runs for every car that is laying a track, every frame it
 * moves a stamp's worth. */
const UNDER: SnowUnder = { rest: 0, base: 0 };
const FLOOR_NOW = new THREE.Color();
/** ...and where the wheels are this stamp: x, z per wheel. */
const AT = new Float64Array(WHEELS.length * 2);

/** Put the four wheels where the car's heading and geometry say they are. */
function wheelsOf(car: GameState["car"], out: Float64Array): void {
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // Forward is (sin h, cos h) and the driver's right is (cos h, -sin h).
  for (let i = 0; i < WHEELS.length; i++) {
    const { lz, lx } = WHEELS[i];
    out[i * 2] = car.x + sinH * lz + cosH * lx;
    out[i * 2 + 1] = car.z + cosH * lz - sinH * lx;
  }
}

type Ribbon = {
  mesh: THREE.Mesh;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Per vertex: across (-1..1 of the band), along (m), smear (0..1), and
   * how much of the sky this point can see (0..1). */
  marks: Float32Array;
  /** Per vertex: the band's across axis in world space, for the tread's
   * bump frame. */
  bandAxes: Float32Array;
  alphas: Float32Array;
  head: number;
  /** How far each lane's tread has run, m — carried across stamps so the
   * pattern runs continuously down a track instead of restarting at every
   * joint, and per CAR because two cars are two tracks. */
  along: Float64Array;
  /** Where each wheel was at the last stamp, and the two rows a stamp is
   * drawn between — swapped rather than reallocated, so a car laying a
   * track for a whole stage allocates nothing after its first stamp. */
  was: Float64Array;
  last: Row;
  next: Row;
  /** Whether the last stamp is a real one to draw a quad from: false on the
   * first stamp and after any break (air, a gravel stretch, a respawn), so
   * a track never runs across a gap. */
  joined: boolean;
};

export type SnowMarks = {
  group: THREE.Group;
  /** Lay this car's track for the frame, if it is on snow and on its
   * wheels. `ground` is the DRAWN surface under a point. */
  lay: (state: GameState, ground: (x: number, z: number) => number) => void;
  /** Take a car's bands down — it is out of range, or gone. */
  forget: (state: GameState) => void;
  /** Take every band down: a new stage, a restart. */
  reset: () => void;
  dispose: () => void;
};

/** THE DRAWN GROUND under a run: the road's ribbon on the road, and off it
 * the top of the blanket the tiles are drawn at — which the ridden ground
 * lies UNDER in winter (the car is sunk into the snow, terrain.ts), so the
 * higher of the two is the surface a mark has to lie on. */
export function drawnGround(state: GameState): (x: number, z: number) => number {
  const t = state.terrain;
  const snow = state.snow;
  if (!snow.white) return (x, z) => Math.max(t.groundAt(x, z), t.latticeAt(x, z));
  // ...WHICH SAGS INTO THE TROUGH THE CAR PRESSED. Off the road the coat is
  // a mesh that bends (`snow-mantle.ts`), so a mark laid at the untouched
  // top would hang in the air over the very trench it is supposed to be
  // lying in.
  //
  // Read off the COAT (`coatHeightAt`) and never off the pack under it,
  // which is the trap this walked into once already: the pack answers at
  // the 0.4 m grain a wheel carves at, the coat is drawn on a 2.5 m grid,
  // and a mark that follows the fine rut goes UNDER the coarse sheet
  // wherever the sheet's own average is the deeper of the two — which is a
  // trail drawn inside the ground. The coat is the ground here. Anything
  // finer than it is these bands' to draw, standing on it.
  return (x, z) => Math.max(t.groundAt(x, z), coatHeightAt(t, snow, x, z));
}

/** THE TREAD, and the material that prints it.
 *
 * A tyre in snow does not leave a smooth floor. It leaves the tread: rows
 * of blocks at the pitch of the pattern, with the snow squeezed up into the
 * voids between them — which is the thing in a photograph of a real tyre
 * track that says a TYRE made it, and the thing a flat band of colour can
 * never say however well it is coloured.
 *
 * It is drawn as a HEIGHT FIELD in the fragment rather than as geometry or
 * as a texture. As geometry it would be a vertex every centimetre for
 * hundreds of metres of track, per car; as a texture it would be a file,
 * and this game ships none. As a height field it is four lines of maths
 * whose GRADIENT perturbs the normal before the Lambert lighting resolves
 * — so the blocks are lit by the same sun as everything else, they go flat
 * as the sun goes down, and they turn to shadow when the car is between
 * them and the light. That last part is the whole difference between a
 * tread and a stripe.
 *
 * Three things switch it off, and each is a real fact about the snow:
 * `smear`, because a tyre dragged sideways polishes what it crosses rather
 * than printing into it; the band's SHOULDER, because thrown snow has no
 * pattern in it; and the pack, because a floor worn to glaze by a hundred
 * passes has lost the print of any one of them. */
function markMaterial(): THREE.MeshLambertMaterial {
  return snowLambert(
    {
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    },
    () => ({
      // Less than the open field's: the crystals that sparkled were the
      // loose ones standing proud of the surface, and a tyre has crushed
      // them flat.
      glitter: 0.45,
      // ...and the sky the bottom of a rut has lost to its own walls, which
      // is what makes a track read dark WITHOUT any part of it being made
      // of anything darker than snow.
      sky: "vMark.w",
      vertex: [
        [
          "#include <common>",
          `attribute vec4 mark;
           attribute vec3 bandAxis;
           attribute float alpha;
           varying vec4 vMark;
           varying vec3 vBandAxis;
           varying float vAlpha;`,
        ],
        [
          "#include <begin_vertex>",
          `vMark = mark;
           vBandAxis = bandAxis;
           vAlpha = alpha;`,
        ],
      ],
      fragment: [
        [
          "#include <common>",
          `varying vec4 vMark;
           varying vec3 vBandAxis;
           varying float vAlpha;
           // Flat-topped blocks rather than a sine: a tread is rubber and
           // voids with edges between them, and a smooth ripple reads as
           // corduroy.
           float tread(float t) { return smoothstep(-0.35, 0.35, sin(t)); }
           #define ALONG ${((Math.PI * 2) / TREAD.pitch).toFixed(4)}
           #define ACROSS ${(Math.PI * TREAD.ribs).toFixed(4)}
           #define BUMP ${TREAD.bump.toFixed(3)}
           #define TREAD_SHADE ${TREAD.shade.toFixed(3)}`,
        ],
        [
          // AFTER three's own normal, and before its lighting — which is
          // the one place a grafted bump can reach, and why the tread takes
          // the sun and the shadows for free.
          "#include <normal_fragment_begin>",
          `// One row of blocks per pitch of tread down the band, and a few
           // longitudinal ribs across it.
           float along = vMark.y * ALONG;
           float across = vMark.x * ACROSS;
           float lugs = tread(along);
           float ribs = tread(across);
           // Only where a tyre ROLLED and only on the floor it pressed: a
           // dragged patch polishes what it crosses instead of printing
           // into it, and thrown snow has no pattern in it at all.
           float print = (1.0 - vMark.z) * (1.0 - smoothstep(0.7, 1.0, abs(vMark.x)));
           float bump = print * BUMP;
           // The height field's own gradient, turned into a lean of the
           // surface: the blocks press and the snow rises into the voids
           // between them, so what the light meets is a relief and not a
           // stain.
           vec3 tAcross = normalize(vBandAxis);
           vec3 tAlong = normalize(cross(normal, tAcross));
           normal = normalize(normal - tAlong * cos(along) * bump - tAcross * cos(across) * bump * 0.4);
           // ...and the TREAD's own small shading, which is the same thing
           // one scale down: a block pressed into the snow sits at the
           // bottom of its own little groove.
           diffuseColor.rgb *= 1.0 - print * TREAD_SHADE * (1.0 - lugs * 0.5 - ribs * 0.5);
           diffuseColor.a *= vAlpha;`,
        ],
      ],
    }),
  );
}

export function createSnowMarks(): SnowMarks {
  const group = new THREE.Group();
  const material = markMaterial();
  const ribbons = new Map<GameState, Ribbon>();

  const build = (): Ribbon => {
    // One quad of four vertices per span of every lane, per stamp.
    const verts = STAMPS * QUADS * 4;
    const positions = new Float32Array(verts * 3);
    const normals = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const marks = new Float32Array(verts * 4);
    const bandAxes = new Float32Array(verts * 3);
    const alphas = new Float32Array(verts);
    const index = new Uint32Array(STAMPS * QUADS * 6);
    for (let q = 0; q < STAMPS * QUADS; q++) {
      const b = q * 4;
      // Corners: 0 = last outer, 1 = last inner, 2 = this inner, 3 = this
      // outer, where outer and inner are the two stations this quad spans.
      //
      // WOUND TO FACE UP, and it has to be spelled out because getting it
      // wrong costs the whole track and looks exactly like not drawing one.
      // The section runs left to right across a band and the stamps run
      // forward along it, and in this world's handedness those two axes
      // cross DOWNWARD — the driver's right is (cos h, -sin h) and forward
      // is (sin h, cos h), so `right × forward` is -y whichever way the car
      // is pointing. Taken in section order the quad therefore faces into
      // the ground, and a front-face material throws away every triangle in
      // the mesh: the track was laid, correct, and complete, and nothing was
      // ever on screen. Reversed here, once, rather than by drawing both
      // sides — a mark lies on the ground and there is no under-side of it
      // to see.
      index.set([b, b + 2, b + 1, b, b + 3, b + 2], q * 6);
    }
    // Parked under the world until laid.
    positions.fill(-1000);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("mark", new THREE.BufferAttribute(marks, 4));
    geo.setAttribute("bandAxis", new THREE.BufferAttribute(bandAxes, 3));
    geo.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
    return {
      mesh,
      positions,
      normals,
      colors,
      marks,
      bandAxes,
      alphas,
      head: 0,
      along: new Float64Array(LANES.length),
      was: new Float64Array(WHEELS.length * 2),
      last: freshRow(),
      next: freshRow(),
      joined: false,
    };
  };

  const onSnow = (state: GameState): boolean =>
    (state.surface === "snow" || state.surface === "snowfield") &&
    !state.car.airborne &&
    !state.car.rolling;

  /** WHERE THIS STAMP'S BANDS STAND, into `row`.
   *
   * Each wheel is measured against where IT was rather than against where
   * the car was: the direction a band runs is the direction that wheel
   * travelled, and the angle between that and the way the wheel is POINTING
   * is what decides how wide it smears and whether it prints (`bandHalf`).
   * A car going where it is pointing has four wheels agreeing and lays two
   * tracks; a car sideways has them disagreeing by forty degrees and lays
   * four. */
  const cut = (
    r: Ribbon,
    row: Row,
    state: GameState,
    belly: number,
    worked: number,
    sag: number,
    ground: (x: number, z: number) => number,
  ): void => {
    const car = state.car;
    wheelsOf(car, AT);
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    // WHERE THE CAR AS A WHOLE WENT, as the mean of where its four wheels
    // went — which is the same thing, and saves carrying a fifth remembered
    // position for the body. It is what the belly pan runs along, so a car
    // crabbing through deep snow presses its floor along the crab and not
    // along its nose.
    let mx = 0;
    let mz = 0;
    for (let i = 0; i < WHEELS.length; i++) {
      mx += AT[i * 2] - r.was[i * 2];
      mz += AT[i * 2 + 1] - r.was[i * 2 + 1];
    }
    // Where the STEERED wheels point, which in a caught slide is not where
    // the car does: the driver has the fronts turned into the drift, so
    // they run far truer than the rears and print where the rears scrub.
    const steer = car.steer * WHEEL_STEER_LOCK;
    const sinS = Math.sin(car.heading + steer);
    const cosS = Math.cos(car.heading + steer);
    for (let l = 0; l < LANES.length; l++) {
      const lane = LANES[l];
      const tyre = l < WHEELS.length;
      const cx = tyre ? AT[l * 2] : car.x;
      const cz = tyre ? AT[l * 2 + 1] : car.z;
      // Which way this band runs. Off the wheel's own last position where
      // there is one; off the car's nose on the first stamp of a run, when
      // there is nothing to difference against.
      let dx = r.joined ? (tyre ? cx - r.was[l * 2] : mx) : sinH;
      let dz = r.joined ? (tyre ? cz - r.was[l * 2 + 1] : mz) : cosH;
      const step = Math.hypot(dx, dz);
      if (step < 1e-6) {
        dx = sinH;
        dz = cosH;
      } else {
        dx /= step;
        dz /= step;
      }
      // ...and how far off its own pointing direction that is. Forward for
      // this wheel is (sin, cos) of wherever it is aimed; the cross against
      // the travel direction is the sine of the angle between them and the
      // dot is its cosine.
      const fx = tyre && WHEELS[l].front ? sinS : sinH;
      const fz = tyre && WHEELS[l].front ? cosS : cosH;
      const cosB = fx * dx + fz * dz;
      const sinB = fx * dz - fz * dx;
      // Across the band is its travel direction turned a quarter.
      const ax = dz;
      const az = -dx;
      const half = tyre
        ? bandHalf(PATCH.width, PATCH.length, cosB, sinB)
        : bandHalf(BODY.width, BODY.length, cosB, sinB);
      // HOW DEEP THIS WHEEL'S OWN RUT IS, asked under the wheel and never
      // at the middle of the car — the middle is the strip the car
      // STRADDLES, and a band sized off it is drawn dead flat on ground the
      // wheel beside it has pressed a foot into.
      const ridge = ridgeOf(state.snow.sunkAt(cx, cz), sag);
      r.along[l] = r.joined ? (r.along[l] + step) % TREAD_WRAP : 0;
      const at = l * LANE_STRIDE;
      row.lane[at] = ax;
      row.lane[at + 1] = az;
      row.lane[at + 2] = r.along[l];
      // WHAT STOPS THE TREAD PRINTING, as one number the shader reads.
      // A tyre dragged sideways polishes what it crosses instead of
      // stamping into it; snow already worn to a glaze by the traffic
      // before this car has no soft top left to take a print at all; and
      // the body never prints under any conditions, so the pan is handed
      // the whole of it and shows none.
      row.lane[at + 3] = tyre ? Math.min(1, Math.max(Math.abs(sinB), worked * GLAZED)) : 1;
      row.lane[at + 4] = tyre ? 1 : belly;
      row.lane[at + 5] = skyShut(half, ridge);
      for (let i = 0; i < lane.length; i++) {
        const st = lane[i];
        const out = acrossAt(st.u, half);
        const x = cx + ax * out;
        const z = cz + az * out;
        // The thrown snow is lumpy; the floor of a rut is not — a wheel
        // presses it flat, which is the whole reason a rut reads as a rut.
        const rough = st.rise > 0 ? 1 - ROUGH + jitter(x, z) * 2 * ROUGH : 1;
        const k = (LANE_AT[l] + i) * 3;
        row.pos[k] = x;
        row.pos[k + 1] = ground(x, z) + LIFT + st.rise * ridge * rough;
        row.pos[k + 2] = z;
        // The band's own lean across itself, in metres of rise per metre
        // out: the lips of a rut then carry a tilted normal and catch the
        // light, which is what stands them up out of a flat floor.
        row.lean[LANE_AT[l] + i] = (SLOPE[l][i] * ridge) / Math.max(SHOULDER, half);
      }
    }
  };

  const lay = (state: GameState, ground: (x: number, z: number) => number): void => {
    const car = state.car;
    let r = ribbons.get(state);
    if (!onSnow(state)) {
      if (r) r.joined = false;
      return;
    }
    if (!r) {
      r = build();
      ribbons.set(state, r);
    }
    wheelsOf(car, AT);
    // THE BUSIEST WHEEL decides when a stamp is due, not the car's middle.
    // A car spinning on the spot moves its middle nowhere and its outside
    // wheels a long way, and the pair of arcs that writes is exactly the
    // mark worth having.
    let moved = 0;
    for (let i = 0; i < WHEELS.length; i++) {
      const d = Math.hypot(AT[i * 2] - r.was[i * 2], AT[i * 2 + 1] - r.was[i * 2 + 1]);
      if (d > moved) moved = d;
    }
    if (r.joined && moved < SPACING) return;
    // A stamp far from the last is a car that jumped, respawned or was
    // handed a new road: start a fresh run rather than drawing the leap.
    if (moved > SPACING * 6) r.joined = false;
    // What the engine's snow says about this patch: how worked it is (the
    // floor's colour) and whether the BODY is touching it at all — which on
    // a snow road it is not, and the belly pan then draws nothing.
    snowUnder(state.track, state.terrain, state.nearIndex, car.x, car.z, UNDER);
    const worked = state.snow.workAt(car.x, car.z, UNDER.base);
    const belly = snowBelly(UNDER.rest, worked);
    // ...and how far the ground under this stamp has ALREADY come down for
    // the same car, so a band only stands up the part that is left. Zero on
    // the road, where nothing under the car can bend and the whole rut is
    // these bands' to draw.
    const sag = coatSagAt(state.terrain, state.snow, car.x, car.z);
    const now = r.next;
    cut(r, now, state, belly, worked, sag, ground);
    if (r.joined) {
      FLOOR_NOW.copy(FLOOR).lerp(GLAZE, worked);
      write(r, now);
      r.head = (r.head + 1) % STAMPS;
      for (const name of TOUCHED) {
        (r.mesh.geometry.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
      }
      r.mesh.visible = true;
    }
    for (let i = 0; i < WHEELS.length * 2; i++) r.was[i] = AT[i];
    // This stamp becomes the one the next quad is drawn from, and the row
    // it replaced is the scratch the next stamp is cut into.
    r.next = r.last;
    r.last = now;
    r.joined = true;
  };

  /** Write one stamp's quads: every lane, every span, from the last row to
   * this one. */
  const write = (r: Ribbon, now: Row): void => {
    const last = r.last;
    let q = r.head * QUADS;
    for (let l = 0; l < LANES.length; l++) {
      const lane = LANES[l];
      const laneAt = l * LANE_STRIDE;
      for (let span = 0; span < lane.length - 1; span++, q++) {
        const b = q * 4;
        for (let v = 0; v < 4; v++) {
          // 0 and 1 come off the last stamp, 2 and 3 off this one; 1 and 2
          // are the far station of the span and 0 and 3 the near one.
          const row = v < 2 ? last : now;
          const i = v === 1 || v === 2 ? span + 1 : span;
          const st = lane[i];
          const k = (LANE_AT[l] + i) * 3;
          const vi = b + v;
          r.positions[vi * 3] = row.pos[k];
          r.positions[vi * 3 + 1] = row.pos[k + 1];
          r.positions[vi * 3 + 2] = row.pos[k + 2];
          const ax = row.lane[laneAt];
          const az = row.lane[laneAt + 1];
          r.bandAxes[vi * 3] = ax;
          r.bandAxes[vi * 3 + 1] = 0;
          r.bandAxes[vi * 3 + 2] = az;
          const lean = row.lean[LANE_AT[l] + i];
          const len = Math.hypot(lean, 1);
          r.normals[vi * 3] = (-ax * lean) / len;
          r.normals[vi * 3 + 1] = 1 / len;
          r.normals[vi * 3 + 2] = (-az * lean) / len;
          r.marks[vi * 4] = st.u;
          r.marks[vi * 4 + 1] = row.lane[laneAt + 2];
          r.marks[vi * 4 + 2] = row.lane[laneAt + 3];
          // The sky this station is open to: the floor of the rut has lost
          // the whole of what its walls take, and the lip has lost none.
          r.marks[vi * 4 + 3] = 1 - row.lane[laneAt + 5] * (1 - OPEN[l][i]);
          r.alphas[vi] = st.alpha * row.lane[laneAt + 4];
          const tone = st.tone === FLOOR ? FLOOR_NOW : st.tone;
          r.colors[vi * 3] = tone.r;
          r.colors[vi * 3 + 1] = tone.g;
          r.colors[vi * 3 + 2] = tone.b;
        }
      }
    }
  };

  const drop = (r: Ribbon): void => {
    group.remove(r.mesh);
    r.mesh.geometry.dispose();
  };

  const forget = (state: GameState): void => {
    const r = ribbons.get(state);
    if (!r) return;
    ribbons.delete(state);
    drop(r);
  };

  const reset = (): void => {
    for (const r of ribbons.values()) drop(r);
    ribbons.clear();
  };

  const dispose = (): void => {
    reset();
    material.dispose();
  };

  return { group, lay, forget, reset, dispose };
}
