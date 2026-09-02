// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How the shell CLASSIFIES a URL the WebView is about to load — asked on every
// navigation (App.tsx), and pure string work, which is why it lives here
// rather than in App.tsx: this module imports nothing, so the root suite can
// test it (tests/shell_navigation_test.ts) without standing up react-native.

/**
 * Is this navigation leaving the SITE — somewhere the shell serves nothing?
 *
 * The WebView is the whole app: no address bar, no back button, and
 * `allowsBackForwardNavigationGestures` is off because a swipe belongs to the
 * steering wheel. So a link to an off-site page (the main menu's version stamp
 * links the build's commit on GitHub) would replace the game with a web page
 * the player cannot leave without killing the app. App.tsx hands such a URL to
 * the system browser instead.
 *
 * Only http(s) is judged, and everything else is INTERNAL by default: the
 * WebView's own `about:blank`, `blob:` and `data:` loads must not be cancelled,
 * and cancelling an unrecognised scheme would break a navigation this shell has
 * no opinion about. A null `origin` is the source not having resolved yet, so
 * there is nothing for a URL to be outside of.
 *
 * Compared by ORIGIN rather than by prefix, so a lookalike host cannot pass by
 * starting with ours (`http://localhost:9007.evil.test/`) and a deep link into
 * our own site cannot fail by differing in its path.
 */
export function isExternalUrl(url: string, origin: string | null): boolean {
  if (!origin) return false;
  if (!/^https?:/i.test(url)) return false;
  let home: URL;
  try {
    home = new URL(origin);
  } catch {
    // Our OWN origin is the unparseable one — nothing can be judged against it,
    // and refusing every navigation would leave a blank shell.
    return false;
  }
  try {
    return new URL(url).origin !== home.origin;
  } catch {
    // An http(s) URL this runtime cannot parse (`http://localhost:9007.evil.test/`
    // — a port that isn't a number). It claims to be the web and cannot be shown
    // to be ours, and the WebView's own parser may well disagree with this one,
    // so it fails CLOSED: the load is cancelled and handed off rather than
    // trusted. `Linking.openURL` refusing it too is the correct end of that.
    return true;
  }
}
