// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two panels drawn BESIDE a level map: the legend down the right-hand
// side, which is the only thing that says what any of the marks mean, and
// the elevation profile along the bottom, which is the stage as a driver
// meets it rather than as a surveyor sees it.

import {
  LEGEND_W,
  PROFILE_H,
  hypso,
  INK,
  label,
  MARK,
  mix,
  PAPER,
  ROAD,
  SEVERITY_COLOR,
  SOLID,
  WATER,
} from "./level-map-ink.mjs";
import { NEAR_EDGE, indexAtS } from "./stage-features.mjs";

/** The key down the right-hand column. */
export function drawLegend(canvas, x, y, { lines, lo, hi, interval }) {
  const row = (text, color) => {
    if (color)
      canvas.poly(
        [
          [x, y],
          [x + 10, y],
          [x + 10, y + 10],
          [x, y + 10],
        ],
        color,
      );
    canvas.text(text, x + (color ? 14 : 0), y, INK, 2);
    y += 15;
  };
  const gap = (h = 8) => {
    y += h;
  };
  for (const line of lines) row(line);
  row("NORTH UP - EAST LEFT, AS DRIVEN", null);
  gap();
  canvas.line(x, y, x + LEGEND_W - 24, y, INK);
  gap(6);
  row("ROAD", null);
  row("GRAVEL", ROAD.gravel);
  row("TARMAC", ROAD.asphalt);
  row("BRIDGE DECK", ROAD.deck);
  row("FORD - WATER ON THE ROAD", ROAD.ford);
  row("RUN-OUT PAST THE FINISH", mix(ROAD.gravel, PAPER, 0.5));
  row("BRANCH / PUBLIC ROAD", ROAD.spur);
  gap();
  row("CALLS - TN E/M/H L/R", null);
  row("EASY TURN", SEVERITY_COLOR.soft);
  row("MEDIUM TURN", SEVERITY_COLOR.medium);
  row("HARD TURN", SEVERITY_COLOR.hard);
  gap();
  row("MARKS", null);
  row("JN  JUMP LIP", MARK.jump);
  row("CRN BLIND CREST", MARK.crest);
  row("TUN TUNNEL", MARK.tunnel);
  row("FN / BN  FORD / BRIDGE", MARK.ford);
  row("CPN SPLIT BOARD", MARK.checkpoint);
  row("START", MARK.start);
  row("FINISH", MARK.finish);
  row("JNN JUNCTION", MARK.junction);
  row("WN  WIND FARM (ROTOR SWEEP)", mix(MARK.windfarm, PAPER, 0.5));
  row("PVN SOLAR FARM", MARK.solarfarm);
  row("CORNER GUARD MOUND", mix(MARK.guardMound, PAPER, 0.25));
  row("CORNER GUARD GROVE", mix(MARK.guardGrove, PAPER, 0.25));
  row("PLN POWER LINE - WAYLEAVE", mix(MARK.powerline, PAPER, 0.82));
  row("     ...ITS TOWERS AND SPANS", mix(MARK.powerline, PAPER, 0.15));
  gap();
  row(`SOLIDS WITHIN ${NEAR_EDGE} M OF EDGE`, null);
  row("TREE TRUNK", SOLID.tree);
  row("ROCK / BOULDER", SOLID.rock);
  row("LOG / STUMP / TIMBER", SOLID.wood);
  row("HN HOUSE, YARD, PARKED CAR / VN TOWN LOT", SOLID.building);
  gap();
  row("GROUND HEIGHT", null);
  {
    const w = LEGEND_W - 24;
    for (let i = 0; i < w; i++) {
      canvas.line(x + i, y, x + i, y + 10, hypso(i / w));
    }
    y += 13;
    canvas.text(`${lo.toFixed(0)} M`, x, y, INK, 2);
    const highText = `${hi.toFixed(0)} M`;
    canvas.text(highText, x + w - 8 * highText.length, y, INK, 2);
    y += 15;
    row(`CONTOURS EVERY ${interval} M`, null);
  }
  row("LAKE / STREAM", WATER);
}

/** The road's height against distance, with the marks on it. */
export function drawProfile(canvas, { track, features, top, width, lo, range, focus }) {
  const { samples } = track;
  const left = 44;
  const right = width - 12;
  const plotTop = top + 22;
  const plotBottom = top + PROFILE_H - 40;
  const fromS = focus ? Math.max(0, focus.s - focus.span) : 0;
  const toS = focus ? Math.min(track.length, focus.s + focus.span) : track.length;
  const from = indexAtS(samples, fromS);
  const to = indexAtS(samples, toS);
  // The strip's own height axis is the road IN VIEW, so a close-up on a
  // jump shows the ramp rather than the stage's whole climb in one pixel.
  let eLo = Infinity;
  let eHi = -Infinity;
  for (let i = from; i <= to; i++) {
    eLo = Math.min(eLo, samples[i].elevation);
    eHi = Math.max(eHi, samples[i].elevation);
  }
  const eSpare = Math.max(1, (eHi - eLo) * 0.1);
  eLo -= eSpare;
  eHi += eSpare;
  const sx = (s) => left + ((s - fromS) / (toS - fromS)) * (right - left);
  const sy = (e) => plotBottom - ((e - eLo) / (eHi - eLo)) * (plotBottom - plotTop);
  canvas.line(left, plotBottom, right, plotBottom, INK);
  canvas.line(left, plotTop, left, plotBottom, INK);
  canvas.text(`${eHi.toFixed(0)}`, 4, plotTop - 4, INK, 2);
  canvas.text(`${eLo.toFixed(0)}`, 4, plotBottom - 5, INK, 2);
  canvas.text("M", 4, (plotTop + plotBottom) / 2 - 5, INK, 2);
  const finishS = track.finishS ?? Infinity;
  // Column by column: the tallest sample in the column, filled in the
  // ground ramp's colour so the strip and the map agree.
  let lastX = -1;
  for (let i = from; i <= to; i++) {
    const s = samples[i];
    const x = Math.round(sx(s.s));
    if (x === lastX) continue;
    lastX = x;
    const y = sy(s.elevation);
    let color = hypso((s.elevation - lo) / range);
    if (s.s > finishS) color = mix(color, PAPER, 0.5);
    canvas.line(x, y, x, plotBottom - 1, color);
    canvas.set(x, y, INK);
    // The surface, as a band under the axis.
    const surface =
      s.deck != null
        ? ROAD.deck
        : s.tunnel
          ? ROAD.tunnel
          : s.surface === "water"
            ? ROAD.ford
            : s.surface === "asphalt"
              ? ROAD.asphalt
              : s.surface === "snow"
                ? ROAD.snow
                : ROAD.gravel;
    canvas.line(x, plotBottom + 2, x, plotBottom + 5, surface);
  }
  // The calls, as a second band, and the marks over the line.
  for (const f of features) {
    if (f.s < fromS || f.s > toS) continue;
    const x = sx(f.s);
    const e = samples[indexAtS(samples, f.s)].elevation;
    switch (f.kind) {
      case "turn": {
        const x1 = sx(Math.min(f.endS, toS));
        for (let px = Math.round(x); px <= x1; px++) {
          canvas.line(px, plotBottom + 7, px, plotBottom + 10, SEVERITY_COLOR[f.severity]);
        }
        if (focus || x1 - x > 18)
          label(canvas, (x + x1) / 2 - 4 * f.id.length, plotBottom + 13, f.id, INK, 2);
        break;
      }
      case "jump":
        canvas.poly(
          [
            [x, sy(e) - 3],
            [x - 5, sy(e) - 12],
            [x + 5, sy(e) - 12],
          ],
          MARK.jump,
        );
        label(canvas, x - 4 * f.id.length, sy(e) - 24, f.id, MARK.jump, 2);
        break;
      case "crest":
        canvas.disk(x, sy(e) - 6, 3, MARK.crest);
        label(canvas, x - 4 * f.id.length, sy(e) - 22, f.id, INK, 2);
        break;
      case "tunnel": {
        // The bore as a bar over the profile, portal to portal.
        const x1 = sx(f.endS);
        canvas.line(x, sy(e) - 8, x1, sy(e) - 8, MARK.tunnel);
        canvas.line(x, sy(e) - 8, x, sy(e) - 3, MARK.tunnel);
        canvas.line(x1, sy(e) - 8, x1, sy(e) - 3, MARK.tunnel);
        label(canvas, (x + x1) / 2 - 4 * f.id.length, sy(e) - 22, f.id, INK, 2);
        break;
      }
      case "ford":
      case "bridge":
        for (let px = Math.round(x); px <= sx(Math.min(f.endS, toS)); px++)
          canvas.line(px, sy(e) - 3, px, sy(e), WATER);
        label(canvas, x - 4 * f.id.length, sy(e) - 18, f.id, INK, 2);
        break;
      case "culvert":
        // Under the road, so the water is drawn under the profile's line.
        for (let px = Math.round(x); px <= sx(Math.min(f.endS, toS)); px++)
          canvas.line(px, sy(e) + 1, px, sy(e) + 4, WATER);
        label(canvas, x - 4 * f.id.length, sy(e) - 18, f.id, INK, 2);
        break;
      case "checkpoint":
        canvas.line(x, plotTop, x, plotBottom, MARK.checkpoint);
        label(canvas, x + 3, plotTop, f.id, MARK.checkpoint, 2);
        break;
      case "finish":
        for (let y = plotTop; y < plotBottom; y += 4) canvas.line(x, y, x, y + 2, INK);
        label(canvas, x + 3, plotTop, "FIN", INK, 2);
        break;
      default:
        break;
    }
  }
  // Distance along the axis.
  const tick = focus ? 50 : 500;
  for (let s = Math.ceil(fromS / tick) * tick; s <= toS; s += tick) {
    const x = sx(s);
    canvas.line(x, plotBottom, x, plotBottom + 1, INK);
    const text = focus ? `${s}` : `${(s / 1000).toFixed(1)}`;
    canvas.text(text, x - 4 * text.length, plotBottom + 26, INK, 2);
  }
  canvas.text(focus ? "M" : "KM", right - 16, plotBottom + 26, INK, 2);
}
