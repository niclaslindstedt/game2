// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT EVERY ROAD SURFACE IS PAINTED, as data and nothing else.
//
// Split out of `road-mesh.ts` because the road is not the only thing that
// has to know what a road looks like. `snow-marks.ts` draws the track a car
// presses INTO a snow road, and a track is made of the road's own snow —
// grit, salt, the dirt of everything that has driven there — so it has to
// tend toward the very tone the mat beside it is painted. Restating that
// colour in two files is the bug where one of them is retuned and a stage
// grows tyre tracks a different white from the road they are cut into.
//
// Kept DOM-FREE on purpose, which is the whole reason it is a module of its
// own rather than an export bolted onto the mesh builder: `road-mesh.ts`
// builds canvas textures, so importing anything from it drags `document`
// into the root typecheck's program — the one that checks the engine and
// the tests, and has no DOM. Nothing here is anything but strings.

/** The road's palette. Gravel is graded dirt, worn to hardpack down the two
 * tracks every car before you drove in, loose and pale at the edges;
 * asphalt is bitumen, polished lighter where the tires have burnished it
 * and grey-black between. */
export const ROAD_PAINT = {
  gravel: { loose: "#d2b489", worn: "#8a7046" },
  // R40 — the desert's road: bleached, near-white sand rather than graded
  // stone, and the wheel tracks are packed sand rather than worn-through
  // subgrade, so the split between loose and worn is shallow and stays
  // pale. Read under the same speckle map as the gravel, which darkens
  // everything it covers — so both are authored a shade lighter than the
  // sand they are meant to come out as.
  sand: { loose: "#f2e2b4", worn: "#d6bf8a" },
  // R47 — packed snow over the road above the snowline: white, the wheel
  // tracks worn to grey-blue ice. Authored as it should come OUT, because
  // a snow vertex is lifted clear of the grit map's darkening (see
  // `buildRoad`) — unlike the rows above, which are read under it.
  snow: { loose: "#f1f3f6", worn: "#c4ccd6" },
  // R48 — the road across a frozen lake: swept ice rather than packed
  // snow, so it is darker and bluer than the row above it, and the wheel
  // tracks are polished rather than worn — the tread burnishes the sheet
  // instead of cutting into it. Lifted clear of the grit map for the same
  // reason the snow is: there is no stone in a lake.
  ice: { loose: "#dbe7f1", worn: "#adc2d4" },
  asphalt: { loose: "#3a3b40", worn: "#54555c" },
  water: { loose: "#8fa6c6", worn: "#8fa6c6" },
  deck: { loose: "#b7b3a8", worn: "#a4a096" },
  shoulder: "#8a734f",
  /** Past the bare shoulder the verge greens over and meets the terrain's
   * own grass — there is no ditch to color (R16). */
  verge: "#6f8f3e",
};
