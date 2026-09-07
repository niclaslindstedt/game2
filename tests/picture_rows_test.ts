// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PICTURE ROWS AND THE LADDERS THAT DECODE THEM — held to each other.
//
// `pictureRows` (settings.ts) says what OPTIONS ▸ VIDEO is standing at, and
// it is what the benchmark writes down with every run it keeps.
// `PICTURE_LADDERS` beside it says what each of those rows could ever read,
// which is what turns a stored value back into a POSITION — the rung the
// score sheet draws as a bar (benchmark-sheet.ts).
//
// They are one list written twice, and the cost of them disagreeing is
// SILENT: a row added to `pictureRows` alone still reports its value, the
// benchmark still stores it, and only the sheet says anything — as a `?`
// against "a stop this build does not have", on every run ever recorded.
// That is not hypothetical. A LIGHTING row was added to the picture and not
// to the ladders, and it read as unknown on runs that had recorded it
// perfectly well.
//
// So this walks EVERY stop of EVERY row through both, and fails the moment
// one of them grows a row the other has not.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIDEO,
  DETAIL_PRESETS,
  DETAIL_STOPS,
  DISTANCE_STOPS,
  LIGHTING_STOPS,
  PICTURE_LADDERS,
  PICTURE_ROWS,
  RESOLUTION_STOPS,
  SKY_STOPS,
  pictureRows,
  type Detail,
  type VideoSettings,
} from "../pwa/src/game/settings.ts";
import { RENDER_HEIGHTS, renderHeightStops } from "../pwa/src/game/desktop-video.ts";
import { pictureGlyph } from "../pwa/src/game/benchmark-sheet.ts";

/** Every picture this build can be set to, as `VideoSettings`. The four
 * single-lever rows crossed with each other, with DETAIL entering through its
 * PRESET — which is what the row actually sets, and what `detailOf` reads
 * back out of the nine knobs behind it. */
function everyPicture(): VideoSettings[] {
  const out: VideoSettings[] = [];
  for (const resolution of RESOLUTION_STOPS) {
    for (const detail of DETAIL_STOPS) {
      for (const distance of DISTANCE_STOPS) {
        for (const lighting of LIGHTING_STOPS) {
          for (const sky of SKY_STOPS) {
            out.push({
              ...DEFAULT_VIDEO,
              ...DETAIL_PRESETS[detail.id as Detail],
              resolution: resolution.id,
              drawDistance: distance.id,
              lighting: lighting.id,
              sky: sky.id,
            });
          }
        }
      }
    }
  }
  return out;
}

describe("the picture rows and their ladders", () => {
  it("covers every row the picture reports", () => {
    // Not a count: the LABELS themselves, so a renamed row fails here rather
    // than passing a length check and reading as unknown on the sheet.
    const reported = pictureRows(DEFAULT_VIDEO, false).map((row) => row.label);
    expect(PICTURE_LADDERS.map((l) => l.label)).toEqual(reported);
    // …and every row named once in PICTURE_ROWS is one of them.
    expect(new Set(reported)).toEqual(new Set(Object.values(PICTURE_ROWS)));
  });

  it("decodes every stop of every row, on both shells", () => {
    for (const video of everyPicture()) {
      for (const desktop of [false, true]) {
        for (const row of pictureRows(video, desktop)) {
          const read = pictureGlyph(row);
          expect(
            read.rung,
            `${row.label} ${row.value} is on no ladder — add it to PICTURE_LADDERS`,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("decodes every desktop render height, which is the longest ladder there is", () => {
    // The row the eight rungs are sized for. Walked through `pictureRows`
    // rather than asserted against the stop list, so it is the value the
    // benchmark would actually have stored.
    for (const height of [0, ...RENDER_HEIGHTS]) {
      const [row] = pictureRows({ ...DEFAULT_VIDEO, renderHeight: height }, true);
      expect(row.label).toBe(PICTURE_ROWS.resolution);
      expect(pictureGlyph(row).rung, `${row.value} is on no ladder`).toBeGreaterThanOrEqual(0);
    }
    expect(renderHeightStops(0)).toHaveLength(RENDER_HEIGHTS.length + 1);
  });

  it("gives each row's stops distinct rungs, so no two settings share a bar", () => {
    for (const ladder of PICTURE_LADDERS) {
      for (const stops of ladder.ladders) {
        const rungs = stops.map((value) => pictureGlyph({ label: ladder.label, value }).glyph);
        expect(new Set(rungs).size, `${ladder.label} puts two stops on one bar`).toBe(stops.length);
      }
    }
  });

  it("climbs: the cheapest stop is the lowest bar", () => {
    for (const ladder of PICTURE_LADDERS) {
      for (const stops of ladder.ladders) {
        const rungs = stops.map((value) => pictureGlyph({ label: ladder.label, value }).rung);
        for (let i = 1; i < rungs.length; i++) expect(rungs[i]).toBeGreaterThan(rungs[i - 1]);
      }
    }
  });
});
