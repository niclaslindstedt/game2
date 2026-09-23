// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// JavaScript injected into the game WebView. Three jobs, all invisible to the
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
//  2. RUMBLE_BRIDGE — carry the page's vibration asks out to the phone's own
//     haptics. The website decides what is felt and how big it is
//     (pwa/src/game/rumble.ts) and dispatches a DOM event describing each
//     pulse; a browser with a motor answers it itself, and a WKWebView — which
//     has no Vibration API at all — has this listener instead, relaying the
//     pulse over the message channel to src/haptics.ts. Injected BEFORE the
//     content for the same reason the flag is: a listener added after the
//     game's first frame is a pulse nobody hears.
//
//  3. VIEWPORT_HARDENING — make the page feel like an app, not a document:
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

/** Listens for the page's rumble asks and posts each one to the shell. The
 * event's name and its two fields are `SHELL_RUMBLE` in
 * `pwa/src/shell-host.ts`, and the message's shape is `parseRumble` in
 * `src/rumble.ts` — change one, change all three; `tests/rumble_test.ts`
 * holds them together. */
export const RUMBLE_BRIDGE = `(function () {
  try {
    window.addEventListener("sf-shell-rumble", function (event) {
      var pulse = event.detail || {};
      var post = window.ReactNativeWebView;
      if (!post) return;
      post.postMessage(
        JSON.stringify({ sf: "rumble", ms: pulse.ms, strength: pulse.strength }),
      );
    });
  } catch (e) {}
  true;
})();`;

/** Listens for the page's cloud asks and posts each one to the shell. The
 * event's name and the ask's shape are `SHELL_CLOUD` in
 * `pwa/src/shell-host.ts`, and the message is read by `parseCloudAsk` in
 * `src/cloud-save.ts` — change one, change all three. The answer comes back
 * the other way, through `injectJavaScript`. */
export const CLOUD_BRIDGE = `(function () {
  try {
    window.addEventListener("sf-shell-cloud", function (event) {
      var ask = event.detail || {};
      var post = window.ReactNativeWebView;
      if (!post) return;
      post.postMessage(
        JSON.stringify({
          sh: "cloud",
          action: ask.action,
          requestId: ask.requestId,
          data: ask.data,
        }),
      );
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
