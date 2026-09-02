// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native shell. It is deliberately thin: a full-bleed WebView over the copy
// of the game bundled inside the app, so the app looks and plays exactly like
// the website, plus the one thing a browser can't give iOS on its own — an
// audio session that lets the game's synthesized sound play through the
// ringer switch. Platform services (haptics, cloud save, achievements, a
// share sheet) are bridges to be added one at a time on top of this, each
// as its own module under src/ and a flag on the message channel below.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import * as SplashScreen from "expo-splash-screen";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";

import { BRAND_BG, REMOTE_GAME_URL } from "./src/config";
import { NATIVE_FLAG, VIEWPORT_HARDENING } from "./src/injected";
import { startLocalServer, type LocalServer } from "./src/local-server";
import { isExternalUrl } from "./src/navigation";

// Keep the native splash up until the WebView paints its first frame, so the
// player never sees a white flash or a half-loaded page.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const canGoBack = useRef(false);
  // The URL the WebView loads: the local server's origin once it is up, or the
  // remote override when EXPO_PUBLIC_GAME_URL is set. null until resolved, so
  // the splash/loader holds until there is something to show.
  const [uri, setUri] = useState<string | null>(null);
  const serverRef = useRef<LocalServer | null>(null);

  // Resolve where to load from: the bundled site over a local HTTP server by
  // default (self-contained, offline), or a remote URL when overridden. Held
  // in a stable callback so RETRY can re-run it after a failure.
  const startSource = useCallback(async () => {
    setFailed(false);
    setLoaded(false);
    if (REMOTE_GAME_URL) {
      setUri(REMOTE_GAME_URL);
      return;
    }
    try {
      if (!serverRef.current) {
        serverRef.current = await startLocalServer();
      }
      setUri(serverRef.current.origin);
    } catch {
      setFailed(true);
    }
  }, []);

  // Start the source on mount; tear the server down on unmount.
  useEffect(() => {
    void startSource();
    return () => {
      void serverRef.current?.stop();
      serverRef.current = null;
    };
  }, [startSource]);

  // Route the game's audio through a playback session so it is audible even
  // when the ringer switch is silenced — a game should sound like a game.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Android hardware back navigates the WebView history instead of closing the
  // app, until there's nowhere left to go back to (then default: exit).
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onNavStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
  }, []);

  // Keep the WebView on the site and hand anything else to the player's own
  // browser — see `isExternalUrl`. Returning false cancels the navigation, so
  // the game stays exactly where it was while the link opens elsewhere.
  const onShouldStartLoad = useCallback(
    (req: WebViewNavigation) => {
      if (!isExternalUrl(req.url, uri)) return true;
      void Linking.openURL(req.url).catch(() => {});
      return false;
    },
    [uri],
  );

  const reveal = useCallback(() => {
    setLoaded(true);
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const retry = useCallback(() => {
    // A loaded page that errored just needs a reload; a failure before the
    // source resolved (e.g. the local server never started) re-runs startup.
    if (uri) {
      setFailed(false);
      setLoaded(false);
      webRef.current?.reload();
    } else {
      void startSource();
    }
  }, [uri, startSource]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {uri && (
        <WebView
          ref={webRef}
          source={{ uri }}
          originWhitelist={["*"]}
          style={styles.web}
          // The game manages its own audio start on first touch; let it play
          // inline without a gesture gate on the media element itself.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Make it feel native: no rubber-band bounce, no page scroll (the
          // game owns the whole viewport and scrolls nothing), no accidental
          // history swipes — a swipe belongs to the steering wheel.
          bounces={false}
          scrollEnabled={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          allowsBackForwardNavigationGestures={false}
          // Kill WKWebView's input accessory bar (the ▲▼/done strip above the
          // keyboard) — on a landscape phone it eats a third of the little
          // space the keyboard leaves, and the high score board's initials
          // have nothing to navigate between.
          hideKeyboardAccessoryView
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          setSupportMultipleWindows={false}
          // No HTTP cache: the site is served from local disk, so caching buys
          // nothing — and a cached index.html from a previous bundle would
          // reference hashed chunks that no longer exist in the new webroot,
          // which surfaces as a silent black screen when a lazily-loaded
          // chunk 404s. (Saves are storage, not cache — they persist.)
          cacheEnabled={false}
          // Persist the game's localStorage saves (campaign progress, the
          // score boards, the ghost, the options) across launches.
          domStorageEnabled
          javaScriptEnabled
          // The shell flag must exist before the game's scripts read it; the
          // hardening runs once the document is up.
          injectedJavaScriptBeforeContentLoaded={NATIVE_FLAG}
          injectedJavaScript={VIEWPORT_HARDENING}
          onNavigationStateChange={onNavStateChange}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          onLoadEnd={reveal}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
        />
      )}

      {!loaded && !failed && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffd23e" />
        </View>
      )}

      {failed && (
        <View style={styles.overlay}>
          <Text style={styles.title}>The stage is closed</Text>
          <Text style={styles.body}>
            {REMOTE_GAME_URL
              ? "The game needs a connection to load. Check your network and try again."
              : "The game couldn't start up. Try again."}
          </Text>
          <Pressable style={styles.button} onPress={retry}>
            <Text style={styles.buttonText}>RETRY</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// The overlay's colours are the arcade palette (pwa/src/identity.ts): the sky
// behind, chalk-white text, the sun on the button.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_BG },
  web: { flex: 1, backgroundColor: BRAND_BG },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND_BG,
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { color: "#f6f3ea", fontSize: 20, fontWeight: "700" },
  body: { color: "#dff1ff", fontSize: 14, textAlign: "center", lineHeight: 20 },
  button: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: "#ffd23e",
    borderRadius: 6,
  },
  buttonText: { color: "#123069", fontWeight: "700", letterSpacing: 1 },
});
