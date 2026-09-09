// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING THE COUNTRY TURNED OUT TO HOLD, built once the road through it
// exists: the public roads the route never met (R17), the towns down the
// tarmac (R39), the homesteads off the stage (R37), the wind and solar
// farms (R43) and the transmission line that carries their power away
// (R45). None of them moves the route — the route is already drawn — and
// each is a pure function of the seed and the country, so each is built
// once and appended to the track.

import { STAGE_RULES as R } from "./rules.ts";
import { type StageStream } from "./endless.ts";
import { roadClearance } from "./road.ts";
import { buildPublicRoads } from "./publicroad.ts";
import { placeHomesteads } from "./homesteads.ts";
import { placeTowns } from "./towns.ts";
import { placeSolarFarms, placeWindFarms } from "./energy.ts";
import { placePowerLines } from "./powerline.ts";
import { rectDistance } from "./farms.ts";
import { branchClearance } from "./compile-road.ts";
import { HIGHWAY_LOOK, roadTopField, STREAMED_HOLD } from "./compile-country.ts";
import type { Track } from "./track-shape.ts";

import type { Walk } from "./compile-walk.ts";
import type { createShelving } from "./compile-shelf.ts";

export function createPlaces(
  track: Track,
  walk: Walk,
  rolling: (s: number) => number,
  shelving: Pick<ReturnType<typeof createShelving>, "roadDistanceField" | "shelfBand">,
  stream: Pick<StageStream, "ahead" | "keepOff"> | undefined,
  followsLand: boolean,
) {
  const { roadDistanceField, shelfBand } = shelving;
  const { land, biome, loose, highways } = walk;
  /** R17 — build the public roads the route never met (`publicroad.ts`).
   * Once per stage: the lines are a pure function of the seed and the
   * country, and an endless stage carries none of them. */
  const buildPublic = (): void => {
    if (track.endless || track.publicRoads.length > 0 || track.highways.length === 0) return;
    const whole = roadDistanceField()({ x: 0, z: 0 });
    track.publicRoads.push(
      ...buildPublicRoads(track.highways, {
        land,
        bounds: track.bounds,
        routeDistance: (x, z) => whole(x, z, false),
        routeClear: roadClearance(track.width),
        shelfBand,
        routeS: (x, z) => {
          let best = Infinity;
          let at = 0;
          for (let i = 0; i < track.samples.length; i += 8) {
            const sample = track.samples[i];
            const d = (sample.x - x) ** 2 + (sample.z - z) ** 2;
            if (d < best) {
              best = d;
              at = sample.s;
            }
          }
          return at;
        },
      }),
    );
  };

  /** R39 — the towns whose streets are settled on road committed since the
   * last call: the whole stage on a finite one, everything behind the
   * streaming frontier on an endless one, for the homesteads' reason. */
  let townFrom = 0;
  const buildTowns = (): void => {
    // R40 — only in a country somebody lives in.
    if (!followsLand || !biome.settled) return;
    let to = track.samples.length;
    if (track.endless) {
      const horizon = track.samples[to - 1].s - STREAMED_HOLD;
      while (to > townFrom && track.samples[to - 1].s > horizon) to--;
    }
    if (to <= townFrom) return;
    const whole = roadDistanceField()({ x: 0, z: 0 });
    const branches = branchClearance([...track.spurs, ...track.publicRoads]);
    const placed = placeTowns({
      seed: track.seed,
      houses: biome.houses,
      width: track.width,
      samples: track.samples,
      from: townFrom,
      to,
      finishS: track.finishS,
      endless: track.endless,
      land,
      spurs: track.spurs,
      junctions: track.junctions,
      routeDistance: (x, z, except) => whole(x, z, false, except),
      branchDistance: branches,
      // A town stands on tarmac, never along a railway (R41).
      highwayAt: (x, z) => highways.nearest(x, z, undefined, 40, "road")?.road ?? null,
      // BOUNDED, because the answer is only ever compared against the
      // corridor: an unbounded query with no road near walks every ring of
      // the index, and a town asks it a couple of thousand times a stage.
      highwayDistance: (x, z, except) =>
        highways.nearest(x, z, except, HIGHWAY_LOOK)?.d ?? Infinity,
      shelfBand,
      homesteadDistance: (x, z) => {
        let best = Infinity;
        for (const h of track.homesteads) {
          const d = Math.hypot(h.yard.x - x, h.yard.z - z) - h.yard.radius;
          if (d < best) best = d;
        }
        return best;
      },
      placed: track.towns,
    });
    track.towns.push(...placed.towns);
    townFrom = placed.scanned;
  };

  /** R37 — the homesteads whose slots fall on road committed since the last
   * call. On a finite stage that is the whole stage, once; on an endless one
   * it is everything behind the streaming frontier, because a slot decided
   * against road that is still being shaped would move under a chunk the
   * renderer has already drawn. */
  let homesteadFrom = 0;
  const buildHomesteads = (): void => {
    // A synthetic rig is a measuring device, and a house beside a drift
    // test's straight is a wall the car under test slides into. No country,
    // no homesteads — the same line every other piece of the landscape
    // draws on a rig. R40 — and no country nobody lives in.
    if (!followsLand || !biome.settled) return;
    let to = track.samples.length;
    if (track.endless) {
      const horizon = track.samples[to - 1].s - STREAMED_HOLD;
      while (to > homesteadFrom && track.samples[to - 1].s > horizon) to--;
    }
    if (to <= homesteadFrom) return;
    const placed = placeHomesteads({
      seed: track.seed,
      width: track.width,
      loose,
      farms: biome.farms,
      houses: biome.houses,
      samples: track.samples,
      from: homesteadFrom,
      to,
      finishS: track.finishS,
      land,
      routeDistance: roadDistanceField(),
      branchDistance: branchClearance([...track.spurs, ...track.publicRoads]),
      highwayDistance: (x, z) => highways.nearest(x, z, undefined, HIGHWAY_LOOK)?.d ?? Infinity,
      shelfBand,
      townDistance: (x, z) => {
        let best = Infinity;
        for (const town of track.towns) {
          for (const lot of town.lots) {
            const d = Math.hypot(lot.pad.x - x, lot.pad.z - z) - lot.pad.radius;
            if (d < best) best = d;
          }
        }
        return best;
      },
      placed: track.homesteads,
    });
    track.homesteads.push(...placed);
    homesteadFrom = to;
  };

  /** R43 — the wind farms and the solar farms whose slots fall on road
   * committed since the last call, on the homesteads' window and for the
   * homesteads' reasons: none on a synthetic rig, none in a country that
   * makes no power. */
  let energyFrom = 0;
  const buildEnergy = (): void => {
    if (!followsLand || !biome.energy) return;
    let to = track.samples.length;
    if (track.endless) {
      const horizon = track.samples[to - 1].s - STREAMED_HOLD;
      while (to > energyFrom && track.samples[to - 1].s > horizon) to--;
    }
    if (to <= energyFrom) return;
    const whole = roadDistanceField()({ x: 0, z: 0 });
    // On a stream the route does not stop at the frontier: the search is
    // a commit lag ahead of it, and a tower placed against the compiled
    // road alone stands in the way of road already decided. So the planned
    // points count as route too — and what gets placed is claimed back from
    // the search's future, so no road planned later runs through it.
    const ahead = stream?.ahead() ?? [];
    const aheadDistance = (x: number, z: number): number => {
      let best = Infinity;
      for (const p of ahead) {
        const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best);
    };
    const ctx = {
      seed: track.seed,
      width: track.width,
      samples: track.samples,
      from: energyFrom,
      to,
      finishS: track.finishS,
      land,
      routeDistance: (x: number, z: number) =>
        Math.min(whole(x, z, false), ahead.length > 0 ? aheadDistance(x, z) : Infinity),
      branchDistance: branchClearance([...track.spurs, ...track.publicRoads]),
      highwayDistance: (x: number, z: number) =>
        highways.nearest(x, z, undefined, HIGHWAY_LOOK)?.d ?? Infinity,
      shelfBand,
      settledDistance: (x: number, z: number) => {
        let best = Infinity;
        for (const h of track.homesteads) {
          const d = Math.hypot(h.yard.x - x, h.yard.z - z) - h.yard.radius;
          if (d < best) best = d;
        }
        for (const town of track.towns) {
          for (const lot of town.lots) {
            const d = Math.hypot(lot.pad.x - x, lot.pad.z - z) - lot.pad.radius;
            if (d < best) best = d;
          }
        }
        return best;
      },
      wind: track.windFarms,
      solar: track.solarFarms,
    };
    // The wind first: a string of towers is the rarer, bigger thing, and a
    // fence that keeps off a tower is cheaper than a tower that keeps off a
    // fence.
    const wind = placeWindFarms(ctx);
    track.windFarms.push(...wind);
    const solar = placeSolarFarms(ctx);
    track.solarFarms.push(...solar);
    if (stream) {
      const keep = roadClearance(track.width);
      for (const farm of wind) {
        for (const t of farm.turbines) stream.keepOff(t.x, t.z, R.energy.wind.pad.radius + keep);
      }
      for (const farm of solar) {
        const { rect } = farm;
        stream.keepOff(rect.x, rect.z, Math.hypot(rect.width, rect.depth) / 2 + keep);
      }
    }
    energyFrom = to;
  };

  /** R45 — the transmission line this country carries, laid once per stage
   * across the whole map. Once, and not on the placers' streaming window,
   * because a line is not decided from the stage at all: it is a fact
   * about the country from rim to rim, and there is no rim on an endless
   * one — which is the same reason an endless stage carries no tarmac. */
  const buildPowerLines = (): void => {
    if (track.endless || !followsLand || !biome.energy) return;
    if (track.powerLines.length > 0 || track.samples.length === 0) return;
    const whole = roadDistanceField()({ x: 0, z: 0 });
    const branches = branchClearance([...track.spurs, ...track.publicRoads]);
    const roadTop = roadTopField(track, land);
    const b = track.bounds;
    track.powerLines.push(
      ...placePowerLines({
        seed: track.seed,
        // The country the STAGE occupies, not the length's nominal box:
        // the line has to cross what a player can see, and what a player
        // can see is the road and the fog's reach either side of it. The
        // module's own `overrun` puts both ends well outside that.
        worldBound: Math.max(
          Math.abs(b.minX),
          Math.abs(b.maxX),
          Math.abs(b.minZ),
          Math.abs(b.maxZ),
        ),
        land,
        routeDistance: (x, z) => whole(x, z, false),
        branchDistance: branches,
        highwayDistance: (x, z) => highways.nearest(x, z, undefined, HIGHWAY_LOOK)?.d ?? Infinity,
        settledDistance: (x, z) => {
          let best = Infinity;
          for (const h of track.homesteads) {
            const d = Math.hypot(h.yard.x - x, h.yard.z - z) - h.yard.radius;
            if (d < best) best = d;
          }
          for (const town of track.towns) {
            for (const lot of town.lots) {
              const d = Math.hypot(lot.pad.x - x, lot.pad.z - z) - lot.pad.radius;
              if (d < best) best = d;
            }
          }
          return best;
        },
        // The wire clears every ROAD, not the country under them: a road
        // rides its embankments and shelves metres over the ground the
        // survey read, and the terrain blends the country up onto them.
        clearanceAt: roadTop,
        shelfBand,
        energyDistance: (x, z) => {
          let best = Infinity;
          for (const farm of track.windFarms) {
            for (const t of farm.turbines) {
              const d = Math.hypot(t.x - x, t.z - z) - R.energy.wind.pad.radius;
              if (d < best) best = d;
            }
          }
          for (const farm of track.solarFarms) {
            const d = rectDistance(farm.rect, x, z);
            if (d < best) best = d;
          }
          return best;
        },
      }),
    );
  };

  return {
    buildPublic,
    buildTowns,
    buildHomesteads,
    buildEnergy,
    buildPowerLines,
  };
}
