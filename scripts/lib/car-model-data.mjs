// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT BLENDER IS HANDED FOR A CAR (`make blender`, `scripts/blender/car.py`):
// the game's own numbers for one catalog car, read off the modules the
// game's builders read, never restated. The shell's stations and rings are
// `car/shell.ts`'s (plus a few more stations off the same `stationAt`, so a
// subdivided panel has the rows it needs); the greenhouse is `cabinPanels`'
// metal and seals as world quads; every bolt-on comes off its plan
// (`bumperPlan`, `tailgatePlan`, `mirrorPlan`, `spoilerPieces`, …); the
// wheel is its spec and `RIM_STYLES`; the rig's travel is the numbers
// car-mesh.ts poses the code car by; and the colours are `car-dress.ts`'s,
// in linear light, for the studio stills alone — the game dresses a model
// by its materials' names and keeps no colour a model carries.
//
// Needs `aliasEngine` in force (the car modules spell the engine `@engine`).

import * as THREE from "three";

export async function carModelData(id) {
  const { carById } = await import("../../engine/index.ts");
  const { bodySpecFor } = await import("../../pwa/src/game/car-styles.ts");
  const shell = await import("../../pwa/src/game/car/shell.ts");
  const house = await import("../../pwa/src/game/car/greenhouse.ts");
  const kit = await import("../../pwa/src/game/car/builder.ts");
  const fascia = await import("../../pwa/src/game/car/fascia.ts");
  const trim = await import("../../pwa/src/game/car/trim.ts");
  const wheels = await import("../../pwa/src/game/car/wheels.ts");
  const { bayOpening } = await import("../../pwa/src/game/car/engine-bay.ts");
  const { cabinOpening } = await import("../../pwa/src/game/car/cockpit.ts");
  const { CAR_CLIPS, STEER_BONES, WHEEL_BONES } = await import("../../pwa/src/game/car-rig.ts");
  const { CAR_ROLES, dressOf, shineOf } = await import("../../pwa/src/game/car-dress.ts");
  const { buildCarBody } = await import("../../pwa/src/game/car-body.ts");

  const car = carById(id);
  const spec = bodySpecFor(car);
  const shift = spec.axleShift ?? 0;
  const axles = [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];

  // THE STATIONS: the code's own, then more off the same `stationAt` — never
  // inside a shut line's groove, where the code's four stations ARE the
  // groove — so no band is longer than `STEP` and each arch has `ARCH` rows.
  const STEP = 0.2;
  const ARCH = 12;
  const code = shell.buildStations(spec, axles);
  const zs = new Map(code.map((st) => [st.z, st]));
  for (let i = 0; i < code.length - 1; i++) {
    const a = code[i];
    const c = code[i + 1];
    if (a.seam !== undefined && c.seam !== undefined) continue;
    const n = Math.ceil((a.z - c.z) / STEP);
    for (let k = 1; k < n; k++) {
      const z = a.z + ((c.z - a.z) * k) / n;
      zs.set(z, shell.stationAt(spec, axles, z));
    }
  }
  const radius = spec.arches?.radius ?? 0;
  const seamZ = code.filter((st) => st.seam !== undefined).map((st) => st.z);
  for (const axle of radius ? axles : []) {
    for (let i = 1; i < ARCH; i++) {
      const z = axle - radius + (2 * radius * i) / ARCH;
      const near = [...zs.keys()].some((q) => Math.abs(q - z) < 0.012);
      const inSeam = seamZ.some((q) => Math.abs(q - z) < 0.04);
      if (!near && !inSeam) zs.set(z, shell.stationAt(spec, axles, z));
    }
  }
  const nose = spec.profile[0].z;
  const tail = spec.profile[spec.profile.length - 1].z;
  const stations = [...zs.values()]
    .filter((st) => st.z <= nose && st.z >= tail)
    .sort((a, b) => b.z - a.z);
  const profileZ = new Set(spec.profile.map((p) => p.z));
  const codeZ = new Set(code.map((st) => st.z));
  // A BOX flare's folded ends — the code's own stations for them — are
  // creased in the model, or the subdivision rounds the box into a bulge.
  const flare = spec.flare;
  const h = (flare?.length ?? 0) / 2;
  const folds = new Set(
    flare?.kind === "box" ? axles.flatMap((a) => [a + h, a + h * 0.9, a - h * 0.9, a - h]) : [],
  );

  // THE DECK'S OPENINGS as z ranges on the CODE's stations — the code snaps
  // a hole out to the stations either side of it, and the model's hole is
  // that hole: the bonnet's always (the engine bay under it), the cabin's
  // kept as a panel of its own the game drops for the car being sat in.
  const cutOf = (opening, kind) => {
    if (!opening) return null;
    const cuts = shell.deckCuts(spec, code, [opening]);
    const hit = cuts.flatMap((c, i) => (c ? [code[i].z, code[i + 1].z] : []));
    if (hit.length === 0) return null;
    return { kind, zFrom: Math.max(...hit), zTo: Math.min(...hit), half: opening.half };
  };
  const cuts = [cutOf(bayOpening(spec), "bay"), cutOf(cabinOpening(spec), "cabin")].filter(Boolean);

  // THE GREENHOUSE: every strip of metal left round the windows, every seal
  // band and the roof, as world quads wound outward (`patchQuad`'s way).
  const quads = [];
  const seal = spec.cabin.seal ?? 0;
  const pillarRole = "pillar";
  const quad = (patch, rect, role, lift, mirrored) => {
    if (rect.u1 - rect.u0 < 1e-3 || rect.v1 - rect.v0 < 1e-3) return;
    const n = kit.patchNormal(patch);
    const out = mirrored ? -lift : lift;
    const c = kit.rectCorners(rect).map(([u, v]) => {
      const q = kit.patchAt(patch, u, v);
      return [q[0] + n[0] * out, q[1] + n[1] * out, q[2] + n[2] * out];
    });
    quads.push({
      role,
      pts: mirrored ? [c[3], c[2], c[1], c[0]] : c,
      n: n.map((k) => k * (mirrored ? -1 : 1)),
    });
  };
  for (const panel of house.cabinPanels(spec)) {
    for (const strip of house.panelMinus(panel.holes))
      quad(panel.patch, strip, pillarRole, 0, panel.mirrored);
    if (seal > 0) {
      for (const hole of panel.holes) {
        const pane = house.glassRect(hole, seal, panel.span);
        for (const band of house.frameOf(hole, pane))
          quad(panel.patch, band, "seal", 0.004, panel.mirrored);
      }
    }
  }
  const f = house.cabinFrame(spec);
  quad([f.FL, f.FR, f.RR, f.RL], { u0: 0, u1: 1, v0: 0, v1: 1 }, "roof", 0, false);

  // THE BOLT-ONS, each off its plan.
  const bumper = (bar, zEnd, dir, name) => {
    if (!bar) return null;
    const plan = fascia.bumperPlan(spec, axles, bar, zEnd, dir);
    const wrap = bar.wrap ?? 0;
    const run =
      wrap > 0
        ? fascia.wrapStations(spec, axles, zEnd, zEnd - dir * wrap).map((z) => ({
            z,
            outer: plan.outer(z),
            flank: shell.flankX(spec, axles, z, bar.y),
          }))
        : [];
    return { part: name, dir, zEnd, ...bar, half: plan.half, face: plan.face, run };
  };
  const lid = (l, part) => {
    if (!l) return null;
    const zs = new Set([l.zFrom, l.zTo]);
    for (let i = 1; i < 12; i++) zs.add(l.zFrom + ((l.zTo - l.zFrom) * i) / 12);
    for (const p of spec.profile)
      if (p.z < Math.max(l.zFrom, l.zTo) && p.z > Math.min(l.zFrom, l.zTo)) zs.add(p.z);
    const along = [...zs].sort((a, b) => b - a);
    return {
      part,
      half: l.half,
      lift: fascia.LID_LIFT,
      samples: along.map((z) => ({ z, top: shell.sampleProfile(spec.profile, z).topY })),
    };
  };
  const doors = trim.doorSkins(spec).map((d) => {
    const along = [];
    const n = 16;
    for (let i = 0; i <= n; i++) along.push(d.zFrom + ((d.zTo - d.zFrom) * i) / n);
    const rows = 6;
    const grid = along.map((z) => {
      const y0 = Math.max(d.yFrom, shell.archAt(spec, axles, z) + 0.012);
      const y1 = Math.max(y0, d.yTo);
      return Array.from({ length: rows + 1 }, (_, j) => {
        const y = y0 + ((y1 - y0) * j) / rows;
        return [d.side * (shell.flankX(spec, axles, z, y) + trim.DOOR_PROUD), y, z];
      });
    });
    return { part: d.part, side: d.side, grid };
  });
  const taper = (t, z, dir) =>
    t && {
      c: [0, t.y, z + dir * (0.06 - t.depth / 2)],
      front: t.span * 0.9,
      back: t.span,
      height: t.height,
      depth: t.depth,
    };

  // THE DRESS, for the stills: every role's colour in linear light, and how
  // much highlight it holds.
  const linear = (hex) => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  };
  const dress = Object.fromEntries(CAR_ROLES.map((r) => [r, linear(dressOf(r, spec) ?? 0x808080)]));
  const shine = Object.fromEntries(CAR_ROLES.map((r) => [r, shineOf(r)]));
  const style = spec.wheelStyle ?? "alloy";

  // FOR THE STILLS ALONE: what the game lays over a model — the code's own
  // dress, its lamp lenses and its glass — as coloured triangles, so a
  // studio render is the car the game draws rather than a car with no face.
  // Built by pouring an EMPTY model into the code car: every form is taken
  // out, and what is left is the dress.
  const empty = { position: new Float32Array(0), normal: new Float32Array(0), role: "paint" };
  const bare = buildCarBody(spec, {
    interior: "off",
    screens: "off",
    model: {
      id,
      parts: new Map(
        [
          "body",
          "bumperF",
          "bumperR",
          "hood",
          "hatch",
          "doorL",
          "doorR",
          "mirrorL",
          "mirrorR",
          "spoiler",
        ].map((n) => [n, [empty]]),
      ),
    },
  });
  const soup = (meshes) => {
    const pos = [];
    const col = [];
    for (const mesh of meshes) {
      if (!mesh) continue;
      const p = mesh.geometry.getAttribute("position");
      const c = mesh.geometry.getAttribute("color");
      for (let i = 0; i < p.count; i++) {
        pos.push(+p.getX(i).toFixed(4), +p.getY(i).toFixed(4), +p.getZ(i).toFixed(4));
        col.push(
          +c.getX(i).toFixed(3),
          +c.getY(i).toFixed(3),
          +c.getZ(i).toFixed(3),
          c.itemSize > 3 ? +c.getW(i).toFixed(3) : 1,
        );
      }
    }
    return { pos, col };
  };
  const studio = {
    dress: soup([bare.body, ...Object.values(bare.breakables)]),
    lens: soup([bare.lenses]),
    glass: soup([bare.glassMesh]),
  };
  bare.dispose();

  return {
    id,
    studio,
    spec,
    axles,
    stations: stations.map((st) => ({
      z: st.z,
      ring: shell.ring(spec, st),
      seam: st.seam ?? null,
      code: codeZ.has(st.z),
      profile: profileZ.has(st.z),
      fold: folds.has(st.z),
      tail: spec.tailPaint ? st.z <= spec.tailPaint.z + 1e-6 : false,
    })),
    gaps: stations.slice(0, -1).map((st, i) => shell.seamGap(st, stations[i + 1])),
    cuts,
    greenhouse: { quads, gutters: house.gutterBoxes(spec), vents: house.roofVentBoxes(spec) },
    bumpers: [
      bumper(spec.front?.bumper, nose, 1, "bumperF"),
      bumper(spec.rear?.bumper, tail, -1, "bumperR"),
    ].filter(Boolean),
    splitter: taper(spec.front?.splitter, nose, 1),
    valance: taper(spec.rear?.valance, tail, -1),
    lids: [lid(spec.front?.hood, "hood"), lid(spec.rear?.deck, "hatch")].filter(Boolean),
    tailgate: spec.rear?.tailgate
      ? fascia.tailgatePlan(spec, axles, spec.rear.tailgate, tail)
      : null,
    doors,
    archTrim: spec.arches?.trim
      ? { runs: trim.archTrimPlan(spec, axles), ...spec.arches.trim }
      : null,
    mudflaps:
      spec.mudflaps === false
        ? []
        : trim.mudflapPlan(spec, axles).map((p) => ({ ...p, thick: 0.025 })),
    mirrors: spec.mirrors === false ? [] : trim.mirrorPlan(spec, axles),
    spoiler: { kind: spec.spoiler?.kind ?? "none", pieces: trim.spoilerPieces(spec) },
    wheel: {
      radius: spec.wheelRadius,
      width: spec.wheelWidth,
      style,
      shape: wheels.RIM_STYLES[style],
      spokes: spec.wheelSpokes ?? wheels.RIM_STYLES[style].spokes,
      spokeWidth: spec.wheelSpokeWidth ?? wheels.RIM_STYLES[style].width,
      rim: wheels.rimRadii(spec),
      ...wheels.RIM_SHAPE,
      at: axles.flatMap((axle, i) =>
        [-1, 1].map((side, j) => ({
          name: WHEEL_BONES[i * 2 + j],
          x: side * spec.trackHalf,
          y: spec.wheelRadius,
          z: axle,
        })),
      ),
    },
    rig: { wheels: WHEEL_BONES, steer: STEER_BONES, clips: CAR_CLIPS },
    dress,
    shine,
  };
}
