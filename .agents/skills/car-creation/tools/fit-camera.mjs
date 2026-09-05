// Fit a reference photograph's camera from its landmarks, then write a
// variants file whose one view IS that camera, so the harness renders the
// car from the photo's own seat. Camera model: the harness's orbit — a
// pinhole at azimuth `az`, elevation `el`, distance `d` (in car lengths)
// from the aim point (0, 0.62, 0), vertical fov `fov`. Unknowns: el, d, fov;
// the 2D registration (scale, translation) is solved in closed form per
// candidate; the fov is not searched (it only scales the picture) but set
// so the car fills the cell at the fitted distance.
//
//   node --experimental-strip-types fit-camera.mjs <car> <az> <points.json> <out.json>
//     az: 0 for a photo of the nose, 3.14159 for one of the tail
//     points.json: { "tailR": [x, y], "wingL": [x, y], ... } in PHOTO pixels,
//       named as the harness's landmarks (car-preview.ts `landmarks`) —
//       remember the engine's +x is the car's LEFT, so from behind the "R"
//       points are on the photo's left, and from the front on its right
//   then: node scripts/car-preview.mjs --variants <out.json> --out fitted
//   and overlay.mjs on two of the marks the render reports.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const { aliasEngine } = await import(join(root, "scripts/lib/engine-alias.mjs"));

aliasEngine(root);
const [carId, azArg, pointsPath, outPath] = process.argv.slice(2);
const az = Number(azArg);
const { CAR_BODIES } = await import(join(root, "pwa/src/game/car-styles.ts"));
const spec = CAR_BODIES[carId];
const photo = JSON.parse(readFileSync(pointsPath, "utf8"));

// The same landmark table the harness reports, restated here (metres).
function landmarks(spec) {
  const shift = spec.axleShift ?? 0;
  const zF = spec.wheelbase / 2 + shift;
  const zR = -spec.wheelbase / 2 + shift;
  const r = spec.wheelRadius;
  const tyre = spec.trackHalf + spec.wheelWidth / 2;
  const nose = spec.profile[0];
  const tailSt = spec.profile[spec.profile.length - 1];
  const out = {
    axleF: [0, r, zF],
    axleR: [0, r, zR],
    tyreFL: [-tyre, 0, zF],
    tyreFR: [tyre, 0, zF],
    tyreRL: [-tyre, 0, zR],
    tyreRR: [tyre, 0, zR],
  };
  const head = spec.front?.lights;
  if (head) {
    const outer =
      head.pairGap === undefined
        ? head.x + head.size
        : head.x + head.pairGap + (head.pairSize ?? head.size);
    const edge = outer + (head.kind === "rect" ? (head.bezel ?? 0) : 0);
    out.headL = [-edge, head.y, nose.z];
    out.headR = [edge, head.y, nose.z];
  }
  const tail = spec.rear?.lights;
  if (tail) {
    const edge = tail.x + tail.width / 2 + (tail.bezel ?? 0.016);
    out.tailL = [-edge, tail.y, tailSt.z];
    out.tailR = [edge, tail.y, tailSt.z];
  }
  const { roofHalf, roofY, roofRearZ, roofFrontZ } = spec.cabin;
  const rearHalf = spec.cabin.roofRearHalf ?? roofHalf;
  const rearY = spec.cabin.roofRearY ?? roofY;
  out.roofRL = [-rearHalf, rearY, roofRearZ];
  out.roofRR = [rearHalf, rearY, roofRearZ];
  out.roofFL = [-roofHalf, roofY, roofFrontZ];
  out.roofFR = [roofHalf, roofY, roofFrontZ];
  const rb = spec.rear?.bumper;
  if (rb) {
    const half = rb.width ? rb.width / 2 : tailSt.half;
    out.bumperRL = [-half, rb.y - rb.height / 2, tailSt.z - (rb.depth - 0.02)];
    out.bumperRR = [half, rb.y - rb.height / 2, tailSt.z - (rb.depth - 0.02)];
  }
  const fb = spec.front?.bumper;
  if (fb) {
    const half = fb.width ? fb.width / 2 : nose.half;
    out.bumperFL = [-half, fb.y - fb.height / 2, nose.z + (fb.depth - 0.02)];
    out.bumperFR = [half, fb.y - fb.height / 2, nose.z + (fb.depth - 0.02)];
  }
  const sp = spec.spoiler;
  if (sp && sp.kind === "gate") {
    const top = sp.y + (sp.thick ?? 0.07) / 2 + 0.02;
    out.wingL = [-sp.span / 2, top, sp.z - sp.chord / 2];
    out.wingR = [sp.span / 2, top, sp.z - sp.chord / 2];
  }
  return out;
}

const L = landmarks(spec);
const zs = spec.profile.map((p) => p.z);
const length = Math.max(...zs) - Math.min(...zs);
const CELL_W = 1320,
  CELL_H = 930;
const aspect = CELL_W / CELL_H;

/** Project a car-space point through the orbit camera — the same maths as
 * three's lookAt + perspective, in the harness's frame (a camera looks down
 * its own -z; world +x lands on the frame's LEFT for a camera looking down
 * world +z, the way the sheet's every view does). Returns cell px. */
function project(p, el, d, fov) {
  const D = d * length;
  const target = [0, 0.62, 0];
  const cam = [
    Math.sin(az) * Math.cos(el) * D,
    0.62 + Math.sin(el) * D,
    Math.cos(az) * Math.cos(el) * D,
  ];
  // Camera basis: back = normalize(cam - target); right = up x back; up' = back x right.
  const back = norm(sub(cam, target));
  const right = norm(cross([0, 1, 0], back));
  const up = cross(back, right);
  const v = sub(p, cam);
  const x = dot(v, right),
    y = dot(v, up),
    z = dot(v, back); // z negative ahead
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const nx = (x * f) / aspect / -z;
  const ny = (y * f) / -z;
  return [((nx + 1) / 2) * CELL_W, ((1 - ny) / 2) * CELL_H];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Best similarity (scale s, translation t; no rotation — both frames are
 * level) mapping render px → photo px over the named points, and its RMS
 * residual in photo px. */
function registration(el, d, fov) {
  const names = Object.keys(photo).filter((n) => L[n]);
  const P = names.map((n) => project(L[n], el, d, fov));
  const Q = names.map((n) => photo[n]);
  const mean = (pts) =>
    pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length], [0, 0]);
  const mp = mean(P),
    mq = mean(Q);
  let num = 0,
    den = 0;
  for (let i = 0; i < P.length; i++) {
    const a = sub2(P[i], mp),
      b = sub2(Q[i], mq);
    num += a[0] * b[0] + a[1] * b[1];
    den += a[0] * a[0] + a[1] * a[1];
  }
  const s = num / den;
  const t = [mq[0] - s * mp[0], mq[1] - s * mp[1]];
  let err = 0;
  const per = {};
  for (let i = 0; i < P.length; i++) {
    const m = [s * P[i][0] + t[0], s * P[i][1] + t[1]];
    const e = [Q[i][0] - m[0], Q[i][1] - m[1]];
    per[names[i]] = e.map((v) => Math.round(v));
    err += e[0] * e[0] + e[1] * e[1];
  }
  return { s, t, rms: Math.sqrt(err / P.length), per };
}
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];

// The fov only scales a pinhole's picture and the registration absorbs
// scale, so it is not searched: it is set so the car FILLS the cell at
// whatever distance the fit lands on, which keeps the render sharp.
const fill = (d) => (2 * Math.atan(1.1 / (d * length)) * 180) / Math.PI;
let best = null;
for (let el = -0.06; el <= 0.5; el += 0.005) {
  for (let d = 0.8; d <= 20; d += 0.05) {
    const fov = fill(d);
    const r = registration(el, d, fov);
    if (!best || r.rms < best.rms) best = { el, d, fov, ...r };
  }
}
const D = best.d * length;
console.log(
  `best: el ${best.el.toFixed(2)} rad (camera ${(0.62 + Math.sin(best.el) * D).toFixed(2)} m up, ${(Math.cos(best.el) * D).toFixed(1)} m off the aim), fov ${best.fov.toFixed(1)}°, rms ${best.rms.toFixed(1)} px`,
);
console.log("residual per point (photo px, photo minus render):", JSON.stringify(best.per));
console.log(`photo px per render px: ${best.s.toFixed(3)}`);
writeFileSync(
  outPath,
  JSON.stringify({
    cars: [{ id: carId, spec }],
    views: [{ name: "fitted", fov: best.fov, orbit: { az, el: best.el, dist: best.d } }],
    cell: { w: CELL_W, h: CELL_H },
  }),
);
console.log(outPath);
