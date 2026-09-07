// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DESKTOP PICTURE'S RESOLUTION ROW — the one setting the game asks
// differently depending on what is showing the page. In a browser it is a
// share of the device's pixels; in the desktop app it is a height in them,
// and the ladder is cut to the window it is read in.

import { afterEach, describe, expect, it } from "vitest";

import {
  desktopPicture,
  renderHeightOf,
  renderHeightScale,
  renderHeightStops,
  NATIVE_HEIGHT,
  RENDER_HEIGHTS,
} from "../pwa/src/game/desktop-video.ts";
import { DEFAULT_VIDEO, freshSettings, loadSettings } from "../pwa/src/game/settings.ts";
import { SHELL_GLOBAL } from "../pwa/src/shell-host.ts";

/** Say a shell is showing the page — the same frozen word the desktop app's
 * initialization script defines, minus the freezing, so a test can put it
 * back. */
function showingIn(shell: string | undefined): void {
  const global = globalThis as unknown as Record<string, unknown>;
  if (shell === undefined) delete global[SHELL_GLOBAL];
  else global[SHELL_GLOBAL] = shell;
}

/** A localStorage that lives for one test — settings.ts reads the player's
 * own file, and Node has no such thing. */
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

afterEach(() => showingIn(undefined));

describe("which picture the page is offered", () => {
  it("is the desktop one in the desktop app and nowhere else", () => {
    expect(desktopPicture()).toBe(false);
    showingIn("native");
    expect(desktopPicture()).toBe(false);
    showingIn("tauri");
    expect(desktopPicture()).toBe(true);
  });
});

describe("the desktop resolution ladder", () => {
  it("opens on the window's own pixels and walks downhill from there", () => {
    const stops = renderHeightStops(2160);
    expect(stops[0].label).toBe("NATIVE");
    expect(renderHeightOf(stops[0].id)).toBe(NATIVE_HEIGHT);
    const heights = stops.slice(1).map((stop) => renderHeightOf(stop.id));
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
    expect(heights.every((height) => height > 0)).toBe(true);
  });

  // A stop at or above the window is NATIVE spelled differently — the frame
  // is never supersampled — and a rung that changes nothing is a rung a
  // player stops trusting the ladder for.
  it("offers only heights the window is actually taller than", () => {
    const stops = renderHeightStops(1080);
    expect(stops.map((stop) => stop.label)).toEqual(["NATIVE", "900P", "720P", "540P"]);
    // The tallest rung is dropped on the monitor it is named after: 2160P on
    // a 4K screen IS native.
    expect(renderHeightStops(2160).map((stop) => stop.label)).not.toContain("2160P");
    expect(renderHeightStops(4320).length).toBe(RENDER_HEIGHTS.length + 1);
  });

  // An over-long row is a cosmetic wrong the next resize corrects; an empty
  // one is a setting the player cannot reach.
  it("offers the whole ladder before the window has been measured", () => {
    expect(renderHeightStops(0).length).toBe(RENDER_HEIGHTS.length + 1);
  });

  it("reads a height back off its own stop and nothing else", () => {
    expect(renderHeightOf("1080")).toBe(1080);
    expect(renderHeightOf("0")).toBe(NATIVE_HEIGHT);
    // A height from another build's ladder, a hand-edited blob, and junk.
    expect(renderHeightOf("1337")).toBe(NATIVE_HEIGHT);
    expect(renderHeightOf("")).toBe(NATIVE_HEIGHT);
    expect(renderHeightOf("NATIVE")).toBe(NATIVE_HEIGHT);
  });
});

describe("what a named height costs the renderer", () => {
  it("draws the frame at exactly the height that was asked for", () => {
    expect(renderHeightScale(1080, 2160)).toBe(0.5);
    expect(2160 * renderHeightScale(720, 2160)).toBe(720);
  });

  // NATIVE is the ceiling: a stored height from the 4K monitor that is no
  // longer plugged in must not supersample the laptop screen it landed on.
  it("never draws more pixels than the window has", () => {
    expect(renderHeightScale(NATIVE_HEIGHT, 2160)).toBe(1);
    expect(renderHeightScale(2160, 1080)).toBe(1);
    expect(renderHeightScale(1080, 0)).toBe(1);
  });
});

describe("the height in the settings blob", () => {
  it("ships as the window's own", () => {
    expect(DEFAULT_VIDEO.renderHeight).toBe(NATIVE_HEIGHT);
    expect(freshSettings().video.renderHeight).toBe(NATIVE_HEIGHT);
  });

  // Snapped to the ladder for the reason every other stop is: a value the
  // arrows cannot reach is a picture the player could never get back to.
  it("lands anything off the ladder on the window's own", () => {
    stubStorage();
    localStorage.setItem(
      "scandi-flick-options",
      JSON.stringify({ video: { ...DEFAULT_VIDEO, renderHeight: 1337 } }),
    );
    expect(loadSettings().video.renderHeight).toBe(NATIVE_HEIGHT);
    localStorage.setItem(
      "scandi-flick-options",
      JSON.stringify({ video: { ...DEFAULT_VIDEO, renderHeight: 1080 } }),
    );
    expect(loadSettings().video.renderHeight).toBe(1080);
    // A blob from before the row existed carries no height at all.
    localStorage.setItem("scandi-flick-options", JSON.stringify({ video: { resolution: "low" } }));
    expect(loadSettings().video.renderHeight).toBe(NATIVE_HEIGHT);
  });
});
