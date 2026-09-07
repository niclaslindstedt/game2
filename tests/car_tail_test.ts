// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BACK OF A CAR, and the rules that hold it together — the panel the
// chase camera looks at for a whole stage, and the one where a builder
// mistake sits in the middle of the frame for the whole stage too.
//
// Three things here are stated by a spec and DERIVED by a builder, and the
// derivation is where each can silently go wrong: a tail cluster whose
// colours run across it has to run them the same way on both sides (a list
// laid -x → +x on both clusters puts the amber by the plate on one of them);
// a quarter glass stated in metres has to stand plumb rather than lean with
// the flank patch it is cut into; and a tailgate wing on posts at its ends
// has to stand its posts where the spec put them, on the deck, and its blade
// over the backlight. None of it is on the sheet's leading columns, which
// look at the nose and the flank.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CARS, TUNING, type DamagePart } from "@engine";

import { MeshBuilder, patchAt } from "../pwa/src/game/car/builder.ts";
import { buildRear } from "../pwa/src/game/car/fascia.ts";
import { backlightY, cabinPanels } from "../pwa/src/game/car/greenhouse.ts";
import { buildTailLights } from "../pwa/src/game/car/lamps.ts";
import {
  bodyHalfLength,
  pipeAnchors,
  pipeSides,
  sampleProfile,
} from "../pwa/src/game/car/shell.ts";
import type { CarBodySpec } from "../pwa/src/game/car/spec.ts";
import { buildTrim } from "../pwa/src/game/car/trim.ts";
import { CAR_BODIES, CLASSIC_BODY } from "../pwa/src/game/car-styles.ts";

/** A vertex's green-to-red ratio: what a baked sun leaves of a colour,
 * since it multiplies every channel by the same factor. */
function warmth(color: THREE.Color): number {
  return color.g / Math.max(1e-6, color.r);
}

describe("a tail cluster whose colours run across it", () => {
  const spec = CLASSIC_BODY;
  const lights = spec.rear?.lights;
  const cells = lights?.cellColors ?? [];
  const outboard = new THREE.Color(cells[0]);
  const inboard = new THREE.Color(cells[cells.length - 1]);

  it("keeps the OUTBOARD colour at the corner on both sides of the car", () => {
    expect(lights).toBeDefined();
    expect(cells.length).toBeGreaterThan(1);
    const s = { body: new MeshBuilder(), lens: new MeshBuilder() };
    buildTailLights(s, lights!, spec.profile[spec.profile.length - 1].z);
    const geo = s.lens.geometry();
    const pos = geo.getAttribute("position");
    const col = geo.getAttribute("color");
    // The lens vertices furthest from the centreline on each side, and the
    // ones nearest it: the corner cell and the cell by the plate.
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
    const near = (x: number, target: number): boolean => Math.abs(x - target) < 0.02;
    const at = (test: (x: number) => boolean): THREE.Color[] => {
      const out: THREE.Color[] = [];
      for (let i = 0; i < pos.count; i++) {
        if (test(pos.getX(i))) out.push(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)));
      }
      return out;
    };
    const closer = (c: THREE.Color, a: THREE.Color, b: THREE.Color): boolean =>
      Math.abs(warmth(c) - warmth(a)) < Math.abs(warmth(c) - warmth(b));
    for (const edge of [minX, maxX]) {
      const corner = at((x) => near(x, edge));
      expect(corner.length).toBeGreaterThan(0);
      for (const c of corner) expect(closer(c, outboard, inboard)).toBe(true);
    }
    const inner = lights!.x - lights!.width / 2;
    for (const sign of [-1, 1]) {
      const byPlate = at((x) => near(x, sign * inner));
      expect(byPlate.length).toBeGreaterThan(0);
      for (const c of byPlate) expect(closer(c, inboard, outboard)).toBe(true);
    }
    geo.dispose();
  });
});

describe("a quarter glass stated in metres", () => {
  it("puts its foot at the z the spec named and its top the rake ahead, on both flanks", () => {
    const spec = CLASSIC_BODY;
    const quarterZ = spec.cabin.pillars?.quarterZ;
    const rake = spec.cabin.pillars?.quarterRake ?? 0;
    expect(quarterZ).toBeDefined();
    const [, , ...flanks] = cabinPanels(spec);
    expect(flanks).toHaveLength(2);
    for (const flank of flanks) {
      const quarter = flank.holes[1];
      const foot = patchAt(flank.patch, quarter.u1, 0)[2];
      const top = patchAt(flank.patch, quarter.u1 + (quarter.lean1 ?? 0), 1)[2];
      expect(foot).toBeCloseTo(quarterZ!, 3);
      expect(top).toBeCloseTo(quarterZ! + rake, 3);
    }
  });

  it("stands plumb when no rake is stated", () => {
    // A foot the roof edge still reaches over, so a plumb top exists.
    const spec: CarBodySpec = {
      ...CLASSIC_BODY,
      cabin: {
        ...CLASSIC_BODY.cabin,
        pillars: { ...CLASSIC_BODY.cabin.pillars, quarterZ: -0.8, quarterRake: undefined },
      },
    };
    const [, , flank] = cabinPanels(spec);
    const quarter = flank.holes[1];
    const foot = patchAt(flank.patch, quarter.u1, 0)[2];
    const top = patchAt(flank.patch, quarter.u1 + (quarter.lean1 ?? 0), 1)[2];
    expect(top).toBeCloseTo(foot, 3);
  });

  it("still leans with the patch on a car that states the post's width instead", () => {
    // The default: the C post is a share of the flank, and the flank's roof
    // edge is shorter than its sill, so the edge lands further forward up
    // top. That lean is the reason `quarterZ` exists.
    const spec: CarBodySpec = {
      ...CLASSIC_BODY,
      cabin: {
        ...CLASSIC_BODY.cabin,
        pillars: { ...CLASSIC_BODY.cabin.pillars, quarterZ: undefined, c: 0.3 },
      },
    };
    const [, , flank] = cabinPanels(spec);
    const quarter = flank.holes[1];
    const foot = patchAt(flank.patch, quarter.u1, 0)[2];
    const top = patchAt(flank.patch, quarter.u1 + (quarter.lean1 ?? 0), 1)[2];
    expect(top - foot).toBeGreaterThan(0.1);
  });
});

describe("a tailgate wing on posts at its ends", () => {
  const spec = CLASSIC_BODY;
  const sp = spec.spoiler;
  const shift = spec.axleShift ?? 0;
  const axles = [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];

  function spoilerGeometry(): THREE.BufferGeometry {
    const parts = new Map<string, MeshBuilder>();
    const part = (name: string): MeshBuilder => {
      let b = parts.get(name);
      if (!b) parts.set(name, (b = new MeshBuilder()));
      return b;
    };
    buildTrim(new MeshBuilder(), spec, axles, part as never);
    const wing = parts.get("spoiler");
    expect(wing).toBeDefined();
    return wing!.geometry();
  }

  it("spans the width it was given and stands its blade where it was told", () => {
    expect(sp?.kind).toBe("gate");
    if (sp?.kind !== "gate") return;
    const geo = spoilerGeometry();
    const pos = geo.getAttribute("position");
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < pos.count; i++) {
      maxX = Math.max(maxX, Math.abs(pos.getX(i)));
      maxY = Math.max(maxY, pos.getY(i));
    }
    expect(maxX).toBeCloseTo(sp.span / 2, 2);
    expect(maxY).toBeCloseTo(sp.y + (sp.thick ?? 0.07) / 2 + 0.02, 2);
    // Over the backlight: the blade sits behind the roof's rear edge, and
    // its trailing edge may reach over the bumper but never past it — the
    // bumper face is the length the collision box is written for.
    expect(sp.z).toBeLessThan(spec.cabin.roofRearZ);
    expect(sp.z - sp.chord / 2).toBeGreaterThan(-bodyHalfLength(spec));
    geo.dispose();
  });

  it("plants its posts on the glass at the ends, not on inboard struts", () => {
    if (sp?.kind !== "gate") return;
    const geo = spoilerGeometry();
    const pos = geo.getAttribute("position");
    const postX = (sp.span / 2) * (sp.post ?? 0.8);
    const lipHalf = (sp.lip?.span ?? sp.span * 0.92) / 2;
    // The surface the feet stand on: the backlight where it runs under
    // them, the deck where it does not.
    const footZ = sp.z + sp.chord * 0.1;
    const deck = backlightY(spec, footZ) ?? sampleProfile(spec.profile, footZ).topY;
    // Everything of the wing that reaches down to the deck is a post foot
    // or the lip, and the lip only has vertices at its own ends — so what
    // is down there inboard of those ends is a post, standing where the
    // spec said.
    let feet = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i));
      if (pos.getY(i) > deck + 0.03 || x >= lipHalf - 0.03) continue;
      expect(x).toBeGreaterThan(postX - 0.04);
      expect(x).toBeLessThan(postX + 0.04);
      feet++;
    }
    expect(feet).toBeGreaterThan(0);
    geo.dispose();
  });
});

describe("the tailpipes, and the smoke that has to come out of them", () => {
  const bodies = Object.entries(CAR_BODIES);

  function axlesOf(spec: CarBodySpec): number[] {
    const shift = spec.axleShift ?? 0;
    return [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];
  }

  /** Everything the rear clip builds, by part. */
  function rearParts(
    spec: CarBodySpec,
    options?: { exhaust?: boolean },
  ): Map<DamagePart, MeshBuilder> {
    const parts = new Map<DamagePart, MeshBuilder>();
    const part = (name: DamagePart): MeshBuilder => {
      let b = parts.get(name);
      if (!b) parts.set(name, (b = new MeshBuilder()));
      return b;
    };
    buildRear(
      { body: new MeshBuilder(), lens: new MeshBuilder() },
      spec,
      axlesOf(spec),
      part,
      options,
    );
    return parts;
  }

  /** The pipes as they are actually DRAWN: the geometry the rear clip puts
   * in the `exhaust` part, which is its own mesh because the ground tears
   * it off (engine `BELLY_BOLTS`) and a piece that flies has to be one. */
  function pipeGeometry(spec: CarBodySpec): THREE.BufferGeometry {
    const pipes = rearParts(spec).get("exhaust");
    expect(pipes, "the rear clip drew no exhaust at all").toBeDefined();
    return pipes!.geometry();
  }

  it.each(bodies)("%s draws one pipe per side its spec claims", (_id, spec) => {
    const e = spec.rear?.exhaust;
    const want = pipeSides(e);
    expect(want.length).toBeGreaterThan(0);
    const geo = pipeGeometry(spec);
    const pos = geo.getAttribute("position");
    // Sort every vertex onto the pipe it is nearest and insist all of them
    // are used. A spec asking for a twin exit and getting one tube back is
    // the failure this catches, and it is invisible on a contact sheet shot
    // from three quarters. `REACH` is how far off its own centreline any of
    // the assembly — tube, tip or silencer — is allowed to stand: a hand,
    // which is also what keeps a pipe from wandering onto the other one.
    const REACH = 0.12;
    const found = new Set<number>();
    let widest = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let on = 0;
      for (let k = 1; k < want.length; k++) {
        if (Math.abs(x - want[k]) < Math.abs(x - want[on])) on = k;
      }
      const off = Math.abs(x - want[on]);
      expect(
        off,
        `an exhaust vertex at x=${x.toFixed(3)} stands ${off.toFixed(3)} m off its pipe`,
      ).toBeLessThanOrEqual(REACH);
      found.add(on);
      widest = Math.max(widest, Math.abs(x));
    }
    expect([...found].sort()).toEqual(want.map((_, i) => i));
    // Mirrored, not merely two: a pair drawn from one x and its own half
    // would sit on the same side of the car.
    if (want.length > 1) expect(want[0]).toBeCloseTo(-want[1], 6);
    // ...and the whole assembly stays inboard of the REAR TYRES it runs
    // beside. Nothing draws attention to a silencer modelled through a
    // wheel, because the wheel is drawn over it from every angle the sheet
    // is shot at — it shows up in the game, on the one camera that gets
    // under the car, and by then it is somebody else's bug report.
    expect(widest).toBeLessThan(spec.trackHalf - spec.wheelWidth / 2);
    geo.dispose();
  });

  it("gives the twin exit to the four-wheel-drive car and to nothing else", () => {
    // The pair is the works car's own detail, and the roster reads it off
    // the drivetrain: a second car growing a second pipe is a spec change
    // somebody has to mean.
    for (const car of CARS) {
      const twin = pipeSides(CAR_BODIES[car.id].rear?.exhaust).length > 1;
      expect(twin, `${car.id} (${car.drive})`).toBe(car.drive === "awd");
    }
  });

  it.each(bodies)("%s smokes from where its pipe actually ENDS", (_id, spec) => {
    // The claim the whole feature rests on. The cloud is spawned off
    // `pipeAnchors` and the tube is drawn off the same spec, and the two are
    // computed in different files: a car whose smoke leaves 130 mm inside
    // its own bodywork looks exactly like a car whose smoke leaves its pipe
    // until somebody stands behind it.
    const geo = pipeGeometry(spec);
    const pos = geo.getAttribute("position");
    let tip = Infinity;
    for (let i = 0; i < pos.count; i++) tip = Math.min(tip, pos.getZ(i));
    const anchors = pipeAnchors(spec);
    expect(anchors).toHaveLength(pipeSides(spec.rear?.exhaust).length);
    for (const at of anchors) {
      expect(at.back).toBeCloseTo(-tip, 6);
      expect(at.up).toBeCloseTo(spec.rear!.exhaust!.y, 6);
    }
    expect(anchors.map((a) => a.side)).toEqual(pipeSides(spec.rear?.exhaust));
    geo.dispose();
  });

  it.each(bodies)("%s keeps the whole pipe inside the collision box", (_id, spec) => {
    // A tailpipe is the one piece of trim that can reach past a shallow rear
    // bumper, and the box the engine collides is one box for the roster. So
    // `bodyHalfLength` counts it, and the tip has to sit inside what that
    // number promises rather than hanging out the back of the car the
    // physics believes in.
    const back = Math.max(...pipeAnchors(spec).map((a) => a.back));
    expect(back).toBeLessThanOrEqual(bodyHalfLength(spec) + 1e-9);
    expect(back).toBeLessThanOrEqual(TUNING.collision.halfLength);
  });

  it.each(bodies)("%s moves its smoke forward to the BREAK once the pipe is gone", (_id, spec) => {
    // A car that has left its exhaust on a crest still smokes, and it has to
    // smoke from somewhere else: one plume, out of the stub under the tail,
    // ahead of where the tip used to be. Same anchor arithmetic, so the
    // renderer and the field read it the same way.
    const whole = pipeAnchors(spec);
    const stub = pipeAnchors(spec, true);
    expect(stub).toHaveLength(1);
    for (const at of whole) expect(stub[0].back).toBeLessThan(at.back);
    expect(stub[0].up).toBeCloseTo(spec.floorY, 6);
  });

  it("gives a car with no exhaust authored on it no pipes and no plume", () => {
    const bare: CarBodySpec = {
      ...CLASSIC_BODY,
      rear: { ...CLASSIC_BODY.rear, exhaust: undefined },
    };
    expect(pipeAnchors(bare)).toEqual([]);
    expect(pipeAnchors(bare, true)).toEqual([]);
  });

  it.each(bodies)("%s builds no pipes at all when the EXHAUST row is off", (_id, spec) => {
    // The row is part pool and part GEOMETRY (settings.ts's EXHAUST_SEEN),
    // and this is the geometry half: a machine not paying for fifteen pipes
    // must not be handed them anyway. The rest of the tail is untouched —
    // switching the exhaust off is not switching the bumper off.
    const bare = rearParts(spec, { exhaust: false });
    expect(bare.get("exhaust")).toBeUndefined();
    const whole = rearParts(spec);
    for (const [name, builder] of whole) {
      if (name === "exhaust") continue;
      const there = bare.get(name);
      expect(there, `${name} went missing with the pipes`).toBeDefined();
      const a = builder.geometry();
      const b = there!.geometry();
      expect(b.getAttribute("position").count).toBe(a.getAttribute("position").count);
      a.dispose();
      b.dispose();
    }
  });
});
