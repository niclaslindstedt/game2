// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The device register: what a phone or a tablet is worth before the game has
// drawn a single frame on it, and what happens to the ones it has never
// heard of — which, on the web, is nearly all of them.

import { describe, expect, it } from "vitest";

import {
  DEVICE_GPUS,
  GPU_BANDS,
  GPU_FAMILIES,
  type GpuFamily,
  gpuBandOf,
  gpuScoreFor,
} from "../pwa/src/game/device-gpu";

describe("the device register", () => {
  it("name every device once", () => {
    const names = DEVICE_GPUS.map((device) => device.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  // A machine identifier is the ONE key a native iOS shell can actually
  // read, so two devices claiming the same one is a lookup that answers
  // with whichever row happens to be written first.
  it("give a machine identifier to at most one device", () => {
    const machines = DEVICE_GPUS.flatMap((device) => device.machines ?? []);
    expect(new Set(machines).size).toBe(machines.length);
    expect(machines.length).toBeGreaterThan(0);
  });

  it("put every device in a family the fallbacks know", () => {
    for (const device of DEVICE_GPUS) {
      expect(GPU_FAMILIES[device.family]).toBeGreaterThan(0);
    }
  });

  it("score every device as a real number of points", () => {
    for (const device of DEVICE_GPUS) {
      expect(Number.isFinite(device.score)).toBe(true);
      expect(device.score).toBeGreaterThan(0);
    }
  });

  // The Pro of a generation is an extra GPU core, not a badge — if the table
  // ever stops saying so, it has been edited by someone reading marketing.
  it("rank a generation's Pro above its plain phone", () => {
    expect(gpuScoreFor("iPhone 16 Pro")).toBeGreaterThan(gpuScoreFor("iPhone 16"));
    expect(gpuScoreFor("iPhone 15 Pro")).toBeGreaterThan(gpuScoreFor("iPhone 15"));
    expect(gpuScoreFor("iPhone 14 Pro")).toBeGreaterThan(gpuScoreFor("iPhone 14"));
  });

  it("rank each iPhone generation above the one before it", () => {
    const ladder = ["iPhone 12", "iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16", "iPhone 17"];
    const scores = ladder.map((name) => gpuScoreFor(name));
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });
});

describe("looking a device up", () => {
  it("find one by its marketing name, whatever the case and punctuation", () => {
    const wanted = gpuScoreFor("iPhone 16 Pro");
    expect(gpuScoreFor("iphone 16 pro")).toBe(wanted);
    expect(gpuScoreFor("IPHONE-16-PRO")).toBe(wanted);
    expect(gpuScoreFor("  iPhone16   Pro  ")).toBe(wanted);
    expect(gpuScoreFor("iPhone16Pro")).toBe(wanted);
  });

  // What a native iOS shell actually has to hand.
  it("find one by its Apple machine identifier", () => {
    expect(gpuScoreFor("iPhone17,1")).toBe(gpuScoreFor("iPhone 16 Pro"));
    expect(gpuScoreFor("iPhone16,1")).toBe(gpuScoreFor("iPhone 15 Pro"));
    expect(gpuScoreFor("iPhone14,7")).toBe(gpuScoreFor("iPhone 14"));
  });

  // The trap the exact match exists for: one name contains the other, so a
  // substring match would hand a Pro Max the plain phone's score.
  it("never answer for a device whose name merely contains another's", () => {
    expect(gpuScoreFor("iPhone 16 Pro Max", "apple-phone-current")).not.toBe(
      gpuScoreFor("iPhone 16", "apple-phone-current"),
    );
    expect(gpuScoreFor("iPhone 16 Pro Ultra Turbo", "apple-phone-current")).toBe(
      GPU_FAMILIES["apple-phone-current"],
    );
  });

  it("fall back to the family for a device it has never heard of", () => {
    expect(gpuScoreFor("Nokia Something", "android-mid")).toBe(GPU_FAMILIES["android-mid"]);
    expect(gpuScoreFor(undefined, "apple-phone-old")).toBe(GPU_FAMILIES["apple-phone-old"]);
  });

  it("fall to the floor when nothing at all is known", () => {
    expect(gpuScoreFor(undefined)).toBe(GPU_FAMILIES.unknown);
    expect(gpuScoreFor("")).toBe(GPU_FAMILIES.unknown);
  });
});

describe("the family fallbacks", () => {
  // The asymmetry the whole fallback design turns on: guessing HIGH gives a
  // phone a picture it stutters through on its first stage, before the
  // player knows there are settings; guessing LOW costs a strong phone some
  // sharpness that one row of the options page hands straight back. So a
  // family must read at or under its weakest named member, never at the
  // middle of the group.
  it("read no higher than the weakest device in the family", () => {
    const families = Object.keys(GPU_FAMILIES) as GpuFamily[];
    for (const family of families) {
      const members = DEVICE_GPUS.filter((device) => device.family === family);
      if (members.length === 0) continue;
      const weakest = Math.min(...members.map((device) => device.score));
      expect(GPU_FAMILIES[family]).toBeLessThanOrEqual(weakest);
    }
  });

  it("rank the families the way the devices in them rank", () => {
    expect(GPU_FAMILIES["apple-phone-current"]).toBeGreaterThan(GPU_FAMILIES["apple-phone-recent"]);
    expect(GPU_FAMILIES["apple-phone-recent"]).toBeGreaterThan(GPU_FAMILIES["apple-phone-old"]);
    expect(GPU_FAMILIES["android-flagship-current"]).toBeGreaterThan(
      GPU_FAMILIES["android-flagship-recent"],
    );
    expect(GPU_FAMILIES["android-flagship-recent"]).toBeGreaterThan(
      GPU_FAMILIES["android-flagship-old"],
    );
    expect(GPU_FAMILIES["android-upper-mid"]).toBeGreaterThan(GPU_FAMILIES["android-mid"]);
    expect(GPU_FAMILIES["android-mid"]).toBeGreaterThan(GPU_FAMILIES["android-budget"]);
  });

  it("leave the unknown device on the floor", () => {
    const scores = Object.values(GPU_FAMILIES);
    expect(GPU_FAMILIES.unknown).toBe(Math.min(...scores));
  });
});

describe("the bands", () => {
  it("run richest first, so the walk stops at the first one it clears", () => {
    for (let i = 1; i < GPU_BANDS.length; i += 1) {
      expect(GPU_BANDS[i].from).toBeLessThan(GPU_BANDS[i - 1].from);
    }
    expect(GPU_BANDS[GPU_BANDS.length - 1].from).toBe(0);
  });

  it("band the devices the way anyone holding them would", () => {
    expect(gpuBandOf(gpuScoreFor("iPad Pro (M4)"))).toBe("ample");
    expect(gpuBandOf(gpuScoreFor("iPhone 16 Pro"))).toBe("ample");
    expect(gpuBandOf(gpuScoreFor("iPhone 14"))).toBe("strong");
    expect(gpuBandOf(gpuScoreFor("Galaxy S23"))).toBe("strong");
    expect(gpuBandOf(gpuScoreFor("Pixel 8"))).toBe("modest");
    expect(gpuBandOf(gpuScoreFor("Snapdragon 695"))).toBe("weak");
  });

  it("band a device it knows nothing about at the bottom", () => {
    expect(gpuBandOf(gpuScoreFor(undefined))).toBe("weak");
  });

  it("give every device in the register a band", () => {
    for (const device of DEVICE_GPUS) {
      expect(GPU_BANDS.some((band) => band.id === gpuBandOf(device.score))).toBe(true);
    }
  });
});
