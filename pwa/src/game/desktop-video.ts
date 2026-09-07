// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DESKTOP PICTURE: a RESOLUTION named in pixels, and the window's own
// fullscreen. Both exist only inside the desktop app (tauri/), and both are
// here rather than in settings.ts because they are the one part of the
// picture the shell has an opinion about.
//
// Why the row is different in there. A web page cannot see a monitor — only
// how many pixels the tab it was handed is worth — so on the site the
// RESOLUTION row is a SHARE of them (`RESOLUTION_SCALE`: HIGH is the screen
// the device has, and each stop down halves it). That is the honest answer
// in a browser and it is the wrong one in a window the game itself owns: a
// player who has spent thirty years telling games to run at 1080p is asking
// a question the desktop app can actually answer, and "MEDIUM" is not the
// answer to it. So in there the row names HEIGHTS, and the top of it is
// NATIVE — the window exactly as it stands, which is the same thing HIGH
// meant and a truer name for it.
//
// Nothing about the browser's row changes, and nothing here is reachable
// from it: `desktopPicture()` is the one gate, and it is the shell's word
// (shell-host.ts) rather than a guess from a screen size or a pointer type.
// A laptop running the site in Chrome is not the desktop app.

import { shellHost } from "../shell-host.ts";

/** Is this the DESKTOP APP — the one shell with a window of its own to size
 * and to fill? The store app is a webview filling a phone, which has neither
 * a resolution to pick nor a fullscreen to leave. */
export function desktopPicture(): boolean {
  return shellHost() === "tauri";
}

/** The window's own pixels, whatever they are — the stop the row opens on,
 * and what an empty or unrecognised stored value falls back to.
 *
 * Zero rather than a number, because the honest value changes under the
 * player's feet: the window is dragged, maximised and thrown fullscreen, and
 * a height written down at any one of those moments would be a stale answer
 * to "as sharp as this screen gets" a moment later. */
export const NATIVE_HEIGHT = 0;

/** The heights the row offers under NATIVE, tallest first.
 *
 * The ladder people already have in their heads — the heights a monitor is
 * sold as — rather than a set of fractions, because that is the whole point
 * of the row existing in here. It is walked tallest first so the row reads
 * downhill from NATIVE: every press is a picture that costs less.
 *
 * They are RENDER heights, not window sizes: the window stays where it is
 * and the frame is drawn at this many pixels tall and scaled up to fill it,
 * which is what a game means by the word and what the row's arrows do
 * instantly, mid-stage, with nothing rebuilt. */
export const RENDER_HEIGHTS = [2160, 1440, 1200, 1080, 900, 720, 540] as const;

/** One stop on the desktop RESOLUTION row. The id is the height as a word,
 * so the row is the same `StepRow` every other setting is. */
export type RenderHeightStop = { id: string; label: string };

/** The height a stop's id names — `NATIVE_HEIGHT` for anything else. */
export function renderHeightOf(id: string): number {
  const height = Number(id);
  return RENDER_HEIGHTS.includes(height as (typeof RENDER_HEIGHTS)[number])
    ? height
    : NATIVE_HEIGHT;
}

/** The row, cut to the window it is being read in.
 *
 * Only heights BELOW the window's own are offered, because a stop at or over
 * it is NATIVE spelled differently — the frame is never supersampled, so
 * "2160P" on a 1080p monitor would be a press that changes nothing, and a
 * ladder with dead rungs on it is a ladder a player stops trusting. On a
 * 1080p screen the row is four stops; on a 4K one it is seven.
 *
 * A window whose height is not known yet (a first render, a canvas with no
 * box) gets the whole ladder rather than none of it: an over-long row is a
 * cosmetic wrong that the next resize corrects, where an empty one is a
 * setting the player cannot reach.
 *
 * A height the player DID choose and this window has since grown past falls
 * off the row, so it reads NATIVE — which is what `renderHeightScale` has
 * made it anyway. The stored number is left alone: come back out of
 * fullscreen, or plug the big monitor in, and it is the choice again. */
export function renderHeightStops(windowHeight: number): RenderHeightStop[] {
  const known = windowHeight > 0;
  return [
    { id: String(NATIVE_HEIGHT), label: "NATIVE" },
    ...RENDER_HEIGHTS.filter((height) => !known || height < windowHeight).map((height) => ({
      id: String(height),
      label: `${height}P`,
    })),
  ];
}

/** What the renderer multiplies the device's own pixel ratio by, so a frame
 * `windowHeight` device pixels tall is drawn `renderHeight` tall instead.
 *
 * Never above 1: NATIVE is the ceiling, and a stop taller than the window is
 * one (see `renderHeightStops`). A stored height from a bigger monitor
 * therefore lands on the picture it asked for as closely as this screen can
 * give it, rather than on a supersampled frame nobody asked to pay for. */
export function renderHeightScale(renderHeight: number, windowHeight: number): number {
  if (renderHeight <= 0 || windowHeight <= 0) return 1;
  return Math.min(1, renderHeight / windowHeight);
}
