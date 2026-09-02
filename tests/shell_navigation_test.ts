// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native shell's URL classification (native/src/navigation.ts) — what the
// WebView keeps and what it hands to the player's own browser.
//
// This is worth a test rather than an eyeball because BOTH mistakes are silent
// and neither shows up on the website: let an off-site link through and the
// game is replaced by a page with no back button, and the player's only exit is
// to kill the app (a stage in progress goes with it); cancel one navigation too
// many and the game itself never loads.
import { describe, expect, it } from "vitest";

import { NATIVE_FLAG } from "../native/src/injected.ts";
import { isExternalUrl } from "../native/src/navigation.ts";
import { SHELL_GLOBAL, shellHost } from "../pwa/src/shell-host.ts";

const ORIGIN = "http://localhost:9007";

describe("the shell's word", () => {
  it("is written into the global the page probes, and the page knows the word", () => {
    // The injected script is a source string, so this holds the two halves of
    // the seam together the way tests/tauri_test.ts holds the desktop app's:
    // the global's NAME, and a WORD `shellHost` answers with rather than null.
    expect(NATIVE_FLAG).toContain(`"${SHELL_GLOBAL}"`);
    const word = /value:\s*"([a-z]+)"/.exec(NATIVE_FLAG)?.[1];
    expect(word).toBe("native");
    const globals = globalThis as unknown as Record<string, unknown>;
    expect(shellHost()).toBeNull();
    globals[SHELL_GLOBAL] = word;
    try {
      expect(shellHost()).toBe("native");
    } finally {
      delete globals[SHELL_GLOBAL];
    }
  });
});

describe("isExternalUrl", () => {
  it("keeps the site itself in the WebView", () => {
    expect(isExternalUrl(`${ORIGIN}/`, ORIGIN)).toBe(false);
    expect(isExternalUrl(`${ORIGIN}/index.html?seed=42`, ORIGIN)).toBe(false);
    expect(isExternalUrl(`${ORIGIN}/?roam=1&layer=water`, ORIGIN)).toBe(false);
  });

  it("sends an off-site link out to the browser", () => {
    // The version stamp's commit link, and anything else that leaves the site.
    expect(isExternalUrl("https://github.com/niclaslindstedt/game2/commit/abc", ORIGIN)).toBe(true);
    expect(isExternalUrl("http://example.invalid/", ORIGIN)).toBe(true);
  });

  it("compares the ORIGIN, so a lookalike host cannot pass as ours", () => {
    expect(isExternalUrl(`${ORIGIN}.evil.test/`, ORIGIN)).toBe(true);
    expect(isExternalUrl(`${ORIGIN}@evil.test/`, ORIGIN)).toBe(true);
    // A different PORT on the same host is a different origin too.
    expect(isExternalUrl("http://localhost:9006/", ORIGIN)).toBe(true);
  });

  it("leaves the WebView's own non-http loads alone", () => {
    // Cancelling any of these would break a navigation the shell has no
    // opinion about — `about:blank` is part of the initial load.
    expect(isExternalUrl("about:blank", ORIGIN)).toBe(false);
    expect(isExternalUrl("data:text/html,<p>hi", ORIGIN)).toBe(false);
    expect(isExternalUrl("blob:http://localhost:9007/abc", ORIGIN)).toBe(false);
  });

  it("treats nothing as external before the source resolves", () => {
    expect(isExternalUrl("https://example.invalid/", null)).toBe(false);
  });

  it("fails CLOSED on an http URL it cannot parse", () => {
    // It claims to be the web and cannot be shown to be ours, and the WebView's
    // own parser may disagree with this one — so it is cancelled, not trusted.
    expect(isExternalUrl("http://[", ORIGIN)).toBe(true);
  });

  it("does not refuse everything when OUR origin is the broken one", () => {
    // Judging is impossible either way; a blank shell is the worse failure.
    expect(isExternalUrl(`${ORIGIN}/`, "not a url")).toBe(false);
  });
});
