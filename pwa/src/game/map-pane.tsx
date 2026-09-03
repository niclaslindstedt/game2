// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WINDOW ONTO THE MAP — the one element both map surfaces are built
// around: Roam, where a stage is chosen by looking at the country it runs
// through, and the developer's MAP VIEWER, where the same country is read
// layer by layer.
//
// It draws NOTHING. The game canvas is behind the whole DOM layer and the
// renderer scissors the map view into exactly this element's rectangle
// (`setMapRect`), so the pane is a HOLE: give it a background and the map
// disappears. It measures where it is, hands that up, and takes the drags,
// wheels and pinches that steer the map camera.

import { useEffect, useRef, type ReactNode } from "react";

export type MapRect = { x: number; y: number; width: number; height: number };

/** How far the map turns and tilts per pixel dragged, radians. */
const DRAG_TURN = 0.006;
const DRAG_TILT = 0.004;
/** Wheel travel to zoom: the standoff is multiplied by e^(deltaY · this), so
 * a notch either way is the same proportion in and out, and a trackpad's
 * fine-grained deltas stay fine-grained. */
const WHEEL_ZOOM = 0.0016;

export type MapView = {
  /** Turn, tilt and zoom the map camera (radians, radians, multiplier). */
  onMove: (dAz: number, dPitch: number, zoomBy: number) => void;
  /** Walk the map sideways, in fractions of the pane the drag crossed. */
  onPan: (dxFrac: number, dyFrac: number) => void;
  /** Back to the framing that holds the whole stage. */
  onReset: () => void;
};

/** The window onto the map, and the handle on it.
 *
 * It draws nothing itself: it measures where it is and hands that up, and
 * the canvas behind shows through the hole. Measured with a ResizeObserver
 * rather than once on mount, because the pane MOVES whenever the card
 * reflows — a rotation, a length label growing a second line, a phone's URL
 * bar retracting — and a map drawn where the pane used to be is worse than
 * no map at all.
 *
 * Its input is wired natively rather than through JSX props for two reasons
 * a synthetic handler cannot give: a wheel listener has to be non-passive to
 * stop the page scrolling under the gesture, and a drag has to survive the
 * pointer leaving the pane, which is what setPointerCapture is for. */
export function MapPane({
  onMapRect,
  view,
  full,
  children,
}: {
  onMapRect: (rect: MapRect | null) => void;
  view: MapView;
  /** Blown up to the whole viewport — the developer's full-screen map. */
  full: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reportRef = useRef(onMapRect);
  reportRef.current = onMapRect;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const box = el.getBoundingClientRect();
      reportRef.current({ x: box.left, y: box.top, width: box.width, height: box.height });
    };
    measure();
    // A resize can move the pane without resizing it (the card recentres),
    // and on a phone the whole split SCROLLS under it — neither is a resize
    // of the pane, so the observer alone would leave the map drawn where the
    // pane used to be. Scroll is captured, because the element that scrolls
    // is an ancestor and scroll does not bubble.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("scroll", measure, true);

    /** Every finger or button currently down on the pane, so a second one
     * turns the drag into a pinch without losing the first. */
    const down = new Map<number, { x: number; y: number }>();
    /** The last pinch span, px — 0 while there is nothing to compare to. */
    let span = 0;
    const spanOf = (): number => {
      const [a, b] = [...down.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    /** ...and where the pair's midpoint was, so two fingers can WALK the map
     * as well as pinch it: the span is the zoom, the midpoint is the pan, and
     * the two are read off the same gesture because that is how a map is
     * handled everywhere else on a touchscreen. */
    let mid = { x: 0, y: 0 };
    const midOf = (): { x: number; y: number } => {
      const [a, b] = [...down.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    /** The pane's own size, for turning a drag in pixels into the fraction of
     * the view it crossed — which is what the camera pans in. */
    const paneW = (): number => el.clientWidth || 1;
    const paneH = (): number => el.clientHeight || 1;

    /** Whether a press landed on one of the map's own CONTROLS rather than
     * on the map.
     *
     * This is load-bearing, and its absence is invisible until somebody
     * presses a button: the pane captures the pointer so a drag survives
     * leaving it (setPointerCapture), and a capture taken on a press that
     * started inside a child redirects that press's pointerup to the PANE —
     * so the child never completes a click, and the button is dead without
     * ever looking it. The developer strip lives inside the pane precisely
     * so it moves with it into full screen, which puts every one of its
     * buttons behind this check. */
    const onControl = (e: Event): boolean =>
      e.target instanceof Element && e.target.closest("[data-map-ui]") !== null;

    const onDown = (e: PointerEvent): void => {
      if (onControl(e)) return;
      // The middle button is a pan here, not the browser's autoscroll.
      if (e.button === 1) e.preventDefault();
      el.setPointerCapture(e.pointerId);
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 2) {
        span = spanOf();
        mid = midOf();
      }
    };
    const onMove = (e: PointerEvent): void => {
      const was = down.get(e.pointerId);
      if (!was) return;
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size >= 2) {
        // Two fingers: the SPAN zooms and the MIDPOINT walks. Turning on
        // either would spin the map every time a pinch was not perfectly
        // symmetric, which is every pinch.
        const now = spanOf();
        if (span > 0 && now > 0) viewRef.current.onMove(0, 0, span / now);
        span = now;
        const here = midOf();
        viewRef.current.onPan((here.x - mid.x) / paneW(), (here.y - mid.y) / paneH());
        mid = here;
        return;
      }
      const dx = e.clientX - was.x;
      const dy = e.clientY - was.y;
      // HOLD CMD/CTRL — or drag with the middle button — TO WALK THE MAP.
      // Turning is what a player wants (the stage is the subject and the
      // camera goes round it); panning is what somebody chasing a defect
      // wants, because the defect is not in the middle of the stage. Both
      // are the same drag, and the modifier picks between them.
      if (e.ctrlKey || e.metaKey || (e.buttons & 4) !== 0) {
        viewRef.current.onPan(dx / paneW(), dy / paneH());
        return;
      }
      // Drag the LAND: pulling right walks the camera the other way round the
      // stage, and pulling down lays the map flatter, toward the angle that
      // shows what the hills actually do.
      viewRef.current.onMove(-dx * DRAG_TURN, -dy * DRAG_TILT, 1);
    };
    const onUp = (e: PointerEvent): void => {
      down.delete(e.pointerId);
      span = down.size === 2 ? spanOf() : 0;
      if (down.size === 2) mid = midOf();
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // A trackpad's pinch arrives as a ctrl-held wheel, and a mouse wheel
      // held under the same key is the same gesture by hand: both are the
      // zoom this pane already had, so the modifier is spent on the DRAG
      // (above) rather than on inverting the wheel.
      viewRef.current.onMove(0, 0, Math.exp(e.deltaY * WHEEL_ZOOM));
    };
    // ...and two quick presses on a control are two presses of that control,
    // not a request to reframe the map underneath it.
    const onDouble = (e: MouseEvent): void => {
      if (!onControl(e)) viewRef.current.onReset();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDouble);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("scroll", measure, true);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDouble);
      reportRef.current(null);
    };
  }, []);

  // Everything the pane says about itself stacks along its FOOT, inside the
  // pane and therefore inside the frame: the gesture hint, then whatever
  // tools the caller put in it. The hint used to ride the top right corner,
  // where a phone's status bar and its rounded corner between them ate it —
  // it is the one row that has to be read before anything else here can be
  // used, so it goes where the rest of the controls are.
  //
  // The hint must not eat the gesture it advertises, hence pointer-events:
  // none. The developer's tools go in the same stack, which is why the pane
  // takes children at all: they belong to the map, so they move with it when
  // the pane is blown up to the whole screen.
  return (
    <div ref={ref} className={full ? "roam-map roam-map-full" : "roam-map"} aria-label="Stage map">
      <div className="roam-map-foot">
        <span className="roam-map-hint">DRAG TO TURN · TILT · ZOOM · ⌘/CTRL-DRAG TO PAN</span>
        {children}
      </div>
    </div>
  );
}
