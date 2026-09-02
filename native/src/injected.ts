// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// JavaScript injected into the game WebView. Two jobs, both invisible to the
// game's own code:
//
//  1. NATIVE_FLAG — names this shell to the page BEFORE the game boots, on
//     the one global every shell shares (`__SF_SHELL__`, read by
//     pwa/src/shell-host.ts; the desktop app writes "tauri" there the same
//     way). The web app reads it on its very first render to turn the PWA
//     update lifecycle off: the shell bundles the game and ships updates
//     through the store, so there is no service worker to install and no "a
//     new version is ready" card to show — a player updates by downloading a
//     new build, never by an in-page reload. Frozen, like the desktop one, so
//     nothing on the page can later claim to be a browser.
//
//  2. VIEWPORT_HARDENING — make the page feel like an app, not a document:
//     kill the long-press callout/selection and rubber-band scroll that a raw
//     WKWebView still allows even with the website's own viewport meta.
//
// Every script must be an IIFE ending in `true;` — iOS requires an injected
// script to evaluate to a primitive, or it warns and aborts.

/** Runs via `injectedJavaScriptBeforeContentLoaded` — before the game's own
 * scripts, so the flag exists by the time the app's first module reads it. */
export const NATIVE_FLAG = `(function () {
  try {
    Object.defineProperty(window, "__SF_SHELL__", {
      value: "native",
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch (e) {}
  true;
})();`;

/** Runs via `injectedJavaScript` — after the document exists — to append a
 * small stylesheet that suppresses the iOS long-press callout and text
 * selection (except in inputs, so the score board's initials still take a
 * keyboard) and blocks overscroll bounce. */
export const VIEWPORT_HARDENING = `(function () {
  try {
    var css =
      "html,body{overscroll-behavior:none;touch-action:none;}" +
      "*:not(input):not(textarea){-webkit-touch-callout:none !important;" +
      "-webkit-user-select:none !important;user-select:none !important;}";
    var style = document.createElement("style");
    style.setAttribute("data-sf-app", "");
    style.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}
  true;
})();`;
