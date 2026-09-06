// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SKEINS — the big birds crossing the sky, and the two things about
// them that a screenshot cannot show.
//
// The first is the SEASON. A skein is the one thing in the world whose
// whole meaning is which way it is pointed: the same vee of geese is
// arriving in spring and leaving in autumn, and a picture of either is the
// same picture. Only a bearing says which.
//
// The second is the FORMATION. What makes a skein read as a skein at three
// hundred metres is that every bird is behind the one in front of it and
// nobody is standing anywhere twice — which is an arithmetic claim about
// the shape and not a claim about how it looks.
//
// `make items ITEMS=goose,swan` is the looking half of the same loop.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Season } from "@engine";

import {
  createSkeins,
  formationOffset,
  passageFor,
  MOST_BIRDS,
  type Formation,
  type Passage,
} from "../pwa/src/game/skein.ts";

/** A pinned source, so what comes back is a decision and not a coin toss.
 * The generator walks a fixed cycle rather than returning a constant: a
 * constant roll picks one branch of every choice and would leave half the
 * rosters below untested. */
function dice(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** Every passage a season can produce, over enough rolls to reach the rare
 * branches. */
function passages(season: Season): Passage[] {
  const roll = dice(20260906);
  return Array.from({ length: 400 }, () => passageFor(season, roll));
}

/** The bearing, folded onto the unit circle so two of them can be compared
 * without worrying about which turn they were written on. */
function unit(bearing: number): { x: number; z: number } {
  return { x: Math.sin(bearing), z: Math.cos(bearing) };
}

describe("what is crossing", () => {
  it("sends them one way in spring and the other way in autumn", () => {
    const spring = passages("spring");
    const autumn = passages("autumn");
    const mean = (list: Passage[]): { x: number; z: number } => {
      const v = list.map((p) => unit(p.bearing));
      return {
        x: v.reduce((a, b) => a + b.x, 0) / v.length,
        z: v.reduce((a, b) => a + b.z, 0) / v.length,
      };
    };
    const s = mean(spring);
    const a = mean(autumn);
    // Opposite: the dot product of the two mean headings is hard against
    // -1, which is the whole of what spring and autumn mean up there.
    expect(s.x * a.x + s.z * a.z).toBeLessThan(-0.9);
    // ...and each season holds ITS heading rather than wandering: every
    // crossing of a season is within a rifle shot of that season's mean.
    for (const list of [spring, autumn]) {
      const m = mean(list);
      for (const p of list) {
        const u = unit(p.bearing);
        expect(u.x * m.x + u.z * m.z).toBeGreaterThan(0.9);
      }
    }
  });

  it("lets a summer flight go wherever it likes, low and in small numbers", () => {
    const summer = passages("summer");
    // No compass at all: over four hundred crossings the mean heading
    // cancels itself out.
    const x = summer.reduce((a, p) => a + unit(p.bearing).x, 0) / summer.length;
    const z = summer.reduce((a, p) => a + unit(p.bearing).z, 0) / summer.length;
    expect(Math.hypot(x, z)).toBeLessThan(0.2);
    // A summer flight is between two lakes: lower than any passage, fewer
    // birds in it, and never a vee.
    const passage = [...passages("spring"), ...passages("autumn")];
    expect(Math.max(...summer.map((p) => p.height))).toBeLessThan(
      Math.min(...passage.map((p) => p.height)),
    );
    expect(Math.max(...summer.map((p) => p.birds))).toBeLessThan(
      Math.min(...passage.map((p) => p.birds)),
    );
    expect(summer.some((p) => p.shape === "vee")).toBe(false);
    expect(passage.some((p) => p.shape === "vee")).toBe(true);
  });

  it("flies both birds in every season, and never more than the pools hold", () => {
    for (const season of ["spring", "summer", "autumn"] as const) {
      const list = passages(season);
      const kinds = new Set(list.map((p) => p.kind));
      expect(kinds, season).toContain("geese");
      expect(kinds, season).toContain("swans");
      for (const p of list) {
        expect(p.birds, season).toBeGreaterThanOrEqual(3);
        expect(p.birds, season).toBeLessThanOrEqual(MOST_BIRDS);
        expect(p.speed, season).toBeGreaterThan(8);
        expect(p.height, season).toBeGreaterThan(0);
      }
      // Nothing is at the airliners' lowest lane (300 m) or anywhere near
      // it: a goose at that height is a goose drawn over an aeroplane.
      expect(Math.max(...list.map((p) => p.height))).toBeLessThan(280);
    }
  });
});

describe("the shape they hold", () => {
  const shapes: Formation[] = ["vee", "line", "group"];

  it("puts the leader out front and everybody else behind it", () => {
    for (const shape of shapes) {
      expect(formationOffset(shape, 0)).toEqual({ across: 0, along: 0 });
      for (let i = 1; i < MOST_BIRDS; i++) {
        expect(formationOffset(shape, i).along, `${shape} ${i}`).toBeLessThan(0);
      }
    }
  });

  it("never stands two birds in the same place", () => {
    for (const shape of shapes) {
      const seen: { across: number; along: number }[] = [];
      for (let i = 0; i < MOST_BIRDS; i++) {
        const slot = formationOffset(shape, i);
        for (const other of seen) {
          expect(
            Math.hypot(slot.across - other.across, slot.along - other.along),
            `${shape} ${i}`,
          ).toBeGreaterThan(0.5);
        }
        seen.push(slot);
      }
    }
  });

  it("makes a vee symmetric and a line one-sided", () => {
    // The vee: matched pairs off the leader's shoulders, each pair further
    // back than the last.
    for (let rank = 1; rank * 2 < MOST_BIRDS; rank++) {
      const right = formationOffset("vee", rank * 2 - 1);
      const left = formationOffset("vee", rank * 2);
      expect(right.across).toBeCloseTo(-left.across, 6);
      expect(right.along).toBeCloseTo(left.along, 6);
      expect(right.across).toBeGreaterThan(0);
      if (rank > 1) expect(right.along).toBeLessThan(formationOffset("vee", 1).along);
    }
    // The line: one arm of that same vee, every bird further out and
    // further back than the one ahead of it.
    for (let i = 1; i < MOST_BIRDS; i++) {
      const near = formationOffset("line", i - 1);
      const far = formationOffset("line", i);
      expect(far.across).toBeGreaterThan(near.across);
      expect(far.along).toBeLessThan(near.along);
    }
    // The group: a huddle, so it is neither — some birds sit to the left of
    // the leader and the ranks do not march backwards.
    const across = Array.from({ length: 8 }, (_, i) => formationOffset("group", i + 1).across);
    expect(Math.min(...across)).toBeLessThan(0);
    expect(Math.max(...across)).toBeGreaterThan(0);
  });

  it("holds the same slot for the same bird every time it is asked", () => {
    for (const shape of shapes) {
      for (let i = 0; i < MOST_BIRDS; i++) {
        expect(formationOffset(shape, i)).toEqual(formationOffset(shape, i));
      }
    }
  });
});

describe("what a stage actually sees of them", () => {
  /** How many pinned sources the claims below are measured over, and how
   * long a stage each is driven for. EVERY crossing is a roll — what flies,
   * where it is pitched, how far along it starts — so one run measures one
   * throw of the dice and says nothing about the rate. That is exactly how
   * this suite first went red on CI: unseeded, the fraction of a stage with
   * birds near it ranges from 0.02 to 0.20 between runs. */
  const SOURCES = 8;
  const FRAMES = 180 * 60;

  /** A camera driven down the road at 25 m/s, which is what a stage is. A
   * crossing is pitched over a point a few hundred metres AHEAD, so what
   * turns it from a speck on the skyline into birds over the roof is the
   * car covering that ground; a parked camera measures the one thing a
   * stage never does. */
  function driver(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 900);
    cam.position.set(0, 30, 0);
    cam.lookAt(0, 30, 100);
    cam.updateMatrixWorld(true);
    return cam;
  }

  /** How far the nearest bird is from the camera, m — read off the instance
   * matrices, which is the only place a skein's actual positions exist. */
  function nearest(skeins: ReturnType<typeof createSkeins>, cam: THREE.Camera): number {
    let best = Infinity;
    const m = new THREE.Matrix4();
    const at = new THREE.Vector3();
    skeins.group.traverse((node) => {
      const mesh = node as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || !mesh.visible) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        at.setFromMatrixPosition(m);
        best = Math.min(best, at.distanceTo(cam.position));
      }
    });
    return best;
  }

  /** One stage driven end to end on one pinned source. */
  function drive(source: number, season: Season): { first: number; closest: number; near: number } {
    const skeins = createSkeins(2, dice(1000 + source * 7919));
    skeins.setSeason(2, season);
    const cam = driver();
    let first = Infinity;
    let closest = Infinity;
    let close = 0;
    for (let i = 0; i < FRAMES; i++) {
      cam.position.z += 25 / 60;
      cam.updateMatrixWorld(true);
      skeins.update(cam, 0, 0, 1 / 60);
      const at = nearest(skeins, cam);
      if (i === 0) first = at;
      closest = Math.min(closest, at);
      if (at < 400) close++;
    }
    skeins.dispose();
    return { first, closest, near: close / FRAMES };
  }

  const stages = Array.from({ length: SOURCES }, (_, i) => drive(i, "spring"));

  it("has birds in the sky on the first frame, not a minute into the stage", () => {
    // A crossing takes about a minute to fly in, so a pool that started them
    // all at the far end would leave the grid, the countdown and the first
    // corner under an empty sky.
    for (const [i, stage] of stages.entries()) {
      expect(stage.first, `source ${i}`).toBeLessThan(1400);
    }
  });

  it("brings one over the top of a stage, often enough to be a thing that happens", () => {
    // A RATE, so it is stated over the whole spread rather than per stage:
    // a skein that goes wide is a skein that went wide, and the sky is
    // allowed one. On average a tenth of a stage has something inside four
    // hundred metres — the range at which a goose is a bird rather than a
    // speck — and most stages get one properly overhead.
    const mean = stages.reduce((a, s) => a + s.near, 0) / stages.length;
    expect(mean).toBeGreaterThan(0.07);
    expect(stages.filter((s) => s.closest < 300).length).toBeGreaterThanOrEqual(5);
  });

  it("flies nothing at all where a country has no skeins", () => {
    const skeins = createSkeins(2, dice(7));
    skeins.setSeason(0, "autumn");
    const cam = driver();
    skeins.update(cam, 0, 0, 1 / 60);
    expect(nearest(skeins, cam)).toBe(Infinity);
    skeins.dispose();
  });
});
