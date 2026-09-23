// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE, the shell half — the transport between the page and the
// platform's cloud, and nothing else.
//
// WHAT IS SAVED AND HOW TWO DEVICES RECONCILE IS THE WEBSITE'S (see
// pwa/src/game/cloud-save.ts: best per course, furthest progress). The shell
// moves an opaque string in and out of iCloud key-value storage and reports
// what happened. That split is the point: a second platform is a new module
// behind the same four messages, with no change to the game.
//
// The protocol is `SHELL_CLOUD` / `SHELL_CLOUD_EVENT` in
// `pwa/src/shell-host.ts` — change one, change both; `tests/shell_test.ts`
// holds the names together.
//
//   page → shell   { sh: "cloud", action: "status" | "load" | "save", … }
//   shell → page   a `sh-shell-cloud-event` CustomEvent, dispatched by
//                  `injectJavaScript`
//
// An unavailable cloud is not an error: a rider signed out of iCloud plays a
// device-local game, and the page is told so once rather than being left to
// time out.

import CloudSave from "../modules/cloud-save";

/** The one key the save lives under inside the store. Changing it after
 * release orphans every rider's save, so it is spelled out once. */
const SAVE_KEY = "scandi-flick-save";

/** What the page asked for. Anything else on the channel is not ours. */
export type CloudAsk =
  | { action: "status"; requestId: string }
  | { action: "load"; requestId: string }
  | { action: "save"; requestId: string; data: string };

/** Read one message off the channel, or null when it is not a cloud ask.
 * Deliberately strict: the page can post whatever it likes, and none of it
 * may reach the cloud by accident. */
export function parseCloudAsk(raw: string): CloudAsk | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const m = parsed as Record<string, unknown>;
  if (m.sh !== "cloud" || typeof m.requestId !== "string") return null;
  if (m.action === "status" || m.action === "load") {
    return { action: m.action, requestId: m.requestId };
  }
  if (m.action === "save" && typeof m.data === "string") {
    return { action: "save", requestId: m.requestId, data: m.data };
  }
  return null;
}

/** The JavaScript that hands one answer back to the page. Built here rather
 * than in the component so the shape stays beside the protocol it belongs
 * to. Must evaluate to a primitive — iOS aborts an injected script that does
 * not. */
export function cloudReply(reply: Record<string, unknown>): string {
  return `(function () {
    try {
      window.dispatchEvent(
        new CustomEvent("sf-shell-cloud-event", { detail: ${JSON.stringify(reply)} }),
      );
    } catch (e) {}
    true;
  })();`;
}

/** Serve one ask, and hand back the reply to inject. Never throws: a cloud
 * that refused is an answer, not a crash. */
export async function serveCloudAsk(ask: CloudAsk): Promise<string> {
  const { requestId } = ask;
  if (!CloudSave) {
    // A build without the native module — Expo Go, or a shell built with
    // EXPO_PUBLIC_CLOUD_SAVE=off. The game stays device-local.
    return cloudReply({ event: ask.action, requestId, ok: false, available: false, data: null });
  }
  try {
    if (ask.action === "status") {
      return cloudReply({
        event: "status",
        requestId,
        ok: true,
        available: CloudSave.isAvailable(),
      });
    }
    if (ask.action === "load") {
      const data = await CloudSave.getItem(SAVE_KEY);
      return cloudReply({ event: "load", requestId, ok: true, data });
    }
    const wrote = await CloudSave.setItem(SAVE_KEY, ask.data);
    // `false` is the store refusing the write — over quota, most likely. The
    // page shows it rather than reporting a save that never happened.
    return cloudReply({
      event: "save",
      requestId,
      ok: wrote,
      ...(wrote ? {} : { reason: "the iCloud store refused the write" }),
    });
  } catch (error) {
    return cloudReply({
      event: ask.action,
      requestId,
      ok: false,
      data: null,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Tell the page another device wrote the store, so it pulls and merges. */
export function cloudChanged(): string {
  return cloudReply({ event: "changed" });
}

/** Hear the store change underneath us. Returns a hand-back; a build with no
 * native module subscribes to nothing and hands back a no-op. */
export function onCloudChange(told: () => void): () => void {
  if (!CloudSave) return () => {};
  const subscription = CloudSave.addListener("onCloudChange", told);
  return () => subscription.remove();
}
