// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GPU CONTEXT'S LIFE — the one part of the render stack the page does not
// own. A browser reclaims a WebGL context from a tab it has put in the
// background, and a phone does it readily: rotating the screen in ANOTHER app
// and coming back to this one is the everyday way to lose one.
//
// Nothing is drawable in between, and nothing says so. three's `render` turns
// into a no-op, so the canvas keeps the last thing it was given — which, on a
// context that has gone, is nothing at all. The canvas is transparent, so what
// fills the screen is the page's own brand sky with the HUD floating on it:
// the "it went a solid colour" report. The seconds after are three re-uploading
// a stage's worth of geometry and recompiling every shader on the first frame
// that asks for them, which is the hang on the end of it.
//
// `preventDefault` on the loss is what makes it RECOVERABLE — a browser that
// sees the default action go through never offers the context back. three does
// it too; it is said here as well because this must not depend on which of the
// two listeners the browser runs first.
//
// DOM-free, like `thumb-guard.ts` beside it: the target is injected and typed
// structurally, so the rules below are checked by the root suite.

/** The listeners a watch needs from the canvas it watches. Typed structurally
 * so this module reads under the root tsconfig, which has no DOM. */
export type ContextTarget = {
  addEventListener: (type: string, listener: (event: ContextEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: ContextEvent) => void) => void;
};

/** The only thing either event is asked for. */
export type ContextEvent = { preventDefault?: () => void };

/** What the caller is told. Both arrive on the event, so both are synchronous
 * and neither may assume a frame has run in between. */
export type ContextHandlers = {
  /** The context is gone: stop drawing, and stop charging the player for a
   * run they cannot see. */
  onLost: () => void;
  /** …and it is back, on a FRESH buffer that has to be cut again before
   * anything draws into it — the box may have changed while the page was
   * away, and a rotation that happens in the background announces itself to
   * nobody. */
  onRestored: () => void;
};

export type GpuWatch = {
  /** True from the loss until the restore. */
  lost: () => boolean;
  dispose: () => void;
};

export function watchGpuContext(target: ContextTarget, handlers: ContextHandlers): GpuWatch {
  let gone = false;

  const onLost = (event: ContextEvent): void => {
    event.preventDefault?.();
    // Guarded because a browser is free to deliver the loss twice, and the
    // caller's answer to it is not idempotent — it pauses a run.
    if (gone) return;
    gone = true;
    handlers.onLost();
  };

  const onRestored = (): void => {
    if (!gone) return;
    gone = false;
    handlers.onRestored();
  };

  target.addEventListener("webglcontextlost", onLost);
  target.addEventListener("webglcontextrestored", onRestored);

  return {
    lost: () => gone,
    dispose: () => {
      target.removeEventListener("webglcontextlost", onLost);
      target.removeEventListener("webglcontextrestored", onRestored);
    },
  };
}
