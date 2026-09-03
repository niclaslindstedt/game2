// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A compiled stage's centreline, encoded as the campaign menu stores it.
//
// It lives in its own module rather than inside scripts/stage-routes.mjs
// because TWO callers need to agree on it exactly: the tool that writes
// pwa/src/game/stage-routes.ts, and tests/stage_preview_test.ts, which
// recompiles a stage and checks the committed bytes still match. A second
// implementation in the test would be a test of the copy rather than of the
// data — it would pass while the shipped routes were stale, which is the one
// failure this is all here to prevent.

/** The box a route is stored in, per axis. One byte a coordinate: the menu
 * draws a stage in a couple of hundred pixels, so a 1/255 grid is already
 * finer than the screen it lands on, and the whole campaign's routes come to
 * under four kilobytes. */
export const GRID = 255;

/** How far the stored line may stray from the compiled centreline, in those
 * same units — under a pixel at the size a stage box draws it. The
 * simplification is what makes the cost adaptive: a hairpin stage keeps the
 * points it needs to still have hairpins in it, and a stage that runs
 * straight for a kilometre spends two points on it. */
export const TOLERANCE = 0.75;

/** Douglas–Peucker: drop every point the straight line between its
 * neighbours already accounts for, to within `tol`. Iterative rather than
 * recursive — a stage carries several thousand samples, and the worst case of
 * this on a road that never straightens is a stack as deep as the input. */
export function simplify(points, tol) {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    const [ax, ay] = points[lo];
    const [bx, by] = points[hi];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      // Perpendicular distance to the chord, or to the endpoint where the
      // chord has no length — which is a closed circuit, whose first and last
      // point are the same place.
      const d =
        len < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs(dx * (ay - py) - (ax - px) * dy) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst <= tol) continue;
    keep[at] = 1;
    stack.push([lo, at], [at, hi]);
  }
  return points.filter((_p, i) => keep[i] === 1);
}

/** One stage's route, ready to store: the compiled centreline projected into
 * its own bounding box, north up, simplified, and quantised.
 *
 * Each axis is normalised to its OWN extent rather than to a shared square,
 * so the stored line always fills the box and keeps every byte of resolution
 * it has. What that throws away is the road's real proportion, which comes
 * back as `aspect` — the menu fits its drawing box to that, so a stage that
 * runs east-west is drawn wide and one that runs north-south is drawn tall. */
export function routeOf(track) {
  const b = track.bounds;
  const spanX = Math.max(1, b.maxX - b.minX);
  const spanZ = Math.max(1, b.maxZ - b.minZ);
  // Screen y grows downward and world z grows north, so z is flipped here and
  // the stored line is already the way up the menu draws it.
  const points = track.samples.map((s) => [
    ((s.x - b.minX) / spanX) * GRID,
    ((b.maxZ - s.z) / spanZ) * GRID,
  ]);
  const line = simplify(points, TOLERANCE);
  const bytes = Buffer.alloc(line.length * 2);
  for (const [i, [x, y]] of line.entries()) {
    bytes[i * 2] = Math.max(0, Math.min(GRID, Math.round(x)));
    bytes[i * 2 + 1] = Math.max(0, Math.min(GRID, Math.round(y)));
  }
  // Four decimals is finer than a menu box can show; `Number` takes the
  // trailing zeroes back off, because prettier strips them from a number
  // literal and `0.7290` in the emitted module is a formatting failure on
  // every regeneration.
  return {
    d: bytes.toString("base64"),
    aspect: Number((spanX / spanZ).toFixed(4)),
    points: line.length,
  };
}
