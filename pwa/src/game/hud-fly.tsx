// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GOD MODE'S TOUCH CONTROLS — the same two halves of the screen the car is
// driven with, holding a flight instead.
//
// The reason this exists at all: god mode's keyboard (WASD, the arrows, the
// mouse) is not on a phone, and the driving zones that ARE on a phone are
// wired to a car that god mode has just parked. Without these, switching the
// tool on hands a handheld a steering wheel and a throttle that do nothing
// and no way at all to move the camera — the tool is simply unreachable on
// the device the game is installed on.
//
// The two rules hud-touch.tsx owns hold here word for word, and for the same
// reasons: every zone must LET GO (`thumb-guard.ts`, armed five ways), and
// every zone must answer at POINTER rate — nothing in here re-renders to
// move, because the HUD around it repaints at ~12 Hz and a camera aimed at
// 12 Hz is a camera nobody can aim.
//
// SIGN BOUNDARY: everything written here is SCREEN-space, matching
// `FreeFlyMove` — `right` is strafe to the right of the picture, `yaw` is
// positive turning right, `pitch` is positive looking up. The one crossing
// into world space stays in camera-free.ts.

import { useEffect, useMemo, useRef } from "react";

import { TOUCH_LOOK_RATE } from "./camera-free.ts";
import { capturePointer, stillDown } from "./hud-touch.tsx";
import type { InputManager } from "./input.ts";
import { createThumbGuard } from "./thumb-guard.ts";

/** What the fly zones write into — the input manager's own surface, so a
 * zone never has to know what a camera is. */
type FlyTouch = InputManager["flyTouch"];

/** Thumb travel (px) from the anchor for full stick deflection. Shorter
 * than the steering wheel's throw: a camera is flown in bursts between
 * places to stand, where a wheel is held for a whole corner. */
const STICK_REACH_PX = 56;

/** The left thumb: touching anywhere anchors a stick under the finger, and
 * pushing it flies the rig — up the screen is forward (where the camera is
 * looking, pitch included), sideways is a level strafe. Releasing stops it.
 *
 * A ring with a knob rather than the driving zone's wheel: this is a
 * two-axis push, and a rim that turns would say the wrong thing about what
 * the thumb is doing. */
export function FlyStickZone({ fly, side }: { fly: FlyTouch; side: "left" | "right" }) {
  const ringRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const originRef = useRef({ x: 0, y: 0 });

  /** Push the rig, and put the knob where the thumb is asking. Clamped to
   * the unit DISC rather than per axis, so a diagonal shove is not worth
   * more than a straight one — the same bargain camera-free.ts strikes when
   * it normalises the move it is handed. */
  const setPush = (dx: number, dy: number): void => {
    const x = dx / STICK_REACH_PX;
    const y = dy / STICK_REACH_PX;
    const reach = Math.max(1, Math.hypot(x, y));
    fly.right = x / reach;
    fly.forward = -y / reach;
    const knob = knobRef.current;
    if (knob) {
      const px = (fly.right * STICK_REACH_PX).toFixed(1);
      const py = (-fly.forward * STICK_REACH_PX).toFixed(1);
      knob.style.transform = `translate(${px}px, ${py}px)`;
    }
  };

  const letGo = (): void => {
    fly.right = 0;
    fly.forward = 0;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
    if (ringRef.current) ringRef.current.style.display = "none";
  };
  const letGoRef = useRef(letGo);
  letGoRef.current = letGo;
  const guard = useMemo(() => createThumbGuard(() => letGoRef.current(), window), []);
  useEffect(() => () => guard.dispose(), [guard]);

  return (
    <div
      className={`hud-zone hud-zone-${side}`}
      onPointerDown={(e) => {
        capturePointer(e);
        if (!guard.claim(e.pointerId, stillDown(e.currentTarget))) return;
        originRef.current = { x: e.clientX, y: e.clientY };
        const ring = ringRef.current;
        if (ring) {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          ring.style.left = `${e.clientX - box.left}px`;
          ring.style.top = `${e.clientY - box.top}px`;
          ring.style.display = "block";
        }
        setPush(0, 0);
      }}
      onPointerMove={(e) => {
        if (!guard.owns(e.pointerId)) return;
        setPush(e.clientX - originRef.current.x, e.clientY - originRef.current.y);
      }}
      onPointerUp={(e) => guard.release(e.pointerId)}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={ringRef} className="hud-fly-stick" aria-hidden="true">
        <div className="hud-fly-ring" />
        <div ref={knobRef} className="hud-fly-knob" />
      </div>
    </div>
  );
}

/** The other thumb: a drag AIMS. Relative like the mouse under pointer lock
 * — each move banks the travel since the last one and the camera consumes
 * it — rather than absolute like the stick, because a look has no centre to
 * come back to and a thumb has only a few centimetres of glass to give.
 * Dragging up looks up, which is what the mouse does when it is not
 * inverted. */
export function FlyLookZone({ fly, side }: { fly: FlyTouch; side: "left" | "right" }) {
  const lastRef = useRef({ x: 0, y: 0 });
  // Nothing to let go OF — a look is a delta, and by the time the finger
  // leaves it has already been spent. The guard is here for `owns`, which
  // is what stops a second thumb aiming the camera out from under the
  // first, and for the releases the browser never delivers.
  const guard = useMemo(() => createThumbGuard(() => undefined, window), []);
  useEffect(() => () => guard.dispose(), [guard]);

  return (
    <div
      className={`hud-zone hud-zone-${side}`}
      onPointerDown={(e) => {
        capturePointer(e);
        if (!guard.claim(e.pointerId, stillDown(e.currentTarget))) return;
        lastRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!guard.owns(e.pointerId)) return;
        fly.yaw += (e.clientX - lastRef.current.x) * TOUCH_LOOK_RATE;
        fly.pitch -= (e.clientY - lastRef.current.y) * TOUCH_LOOK_RATE;
        lastRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => guard.release(e.pointerId)}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="hud-fly-hint" aria-hidden="true">
        DRAG TO LOOK
      </div>
    </div>
  );
}

/** A button that means something for as long as it is held — the altitude
 * pair. Guarded like the zones: a finger that leaves the glass without
 * saying so must not leave the camera climbing for the rest of the session,
 * and on this surface there is no gravity to bring it back down. */
function HoldButton({
  label,
  title,
  onHold,
}: {
  label: string;
  title: string;
  onHold: (on: boolean) => void;
}) {
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  const guard = useMemo(() => createThumbGuard(() => holdRef.current(false), window), []);
  useEffect(() => () => guard.dispose(), [guard]);
  return (
    <button
      type="button"
      className="hud-fly-btn"
      aria-label={title}
      title={title}
      onPointerDown={(e) => {
        capturePointer(e);
        if (!guard.claim(e.pointerId, stillDown(e.currentTarget))) return;
        onHold(true);
      }}
      onPointerUp={(e) => guard.release(e.pointerId)}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** The rest of the flight, as buttons: the two things a pair of thumbs
 * already busy with a stick and a look cannot also express. Altitude is a
 * HOLD — the rig climbs while the finger is down — and the cruise speed is
 * a pair of notches, the same dial the mouse wheel and the -/= keys turn.
 *
 * It stands up the outer edge of the LOOK half, where the thumb that aims
 * already is and where no instrument sits in either orientation. */
export function FlyDial({ fly, side }: { fly: FlyTouch; side: "left" | "right" }) {
  return (
    <div className={`hud-fly-dial hud-fly-dial-${side}`}>
      <HoldButton
        label="▲"
        title="Climb"
        onHold={(on) => {
          fly.up = on ? 1 : 0;
        }}
      />
      <HoldButton
        label="▼"
        title="Descend"
        onHold={(on) => {
          fly.up = on ? -1 : 0;
        }}
      />
      <button
        type="button"
        className="hud-fly-btn"
        aria-label="Slower"
        title="Slower"
        onPointerDown={() => {
          fly.steps -= 1;
        }}
      >
        −
      </button>
      <button
        type="button"
        className="hud-fly-btn"
        aria-label="Faster"
        title="Faster"
        onPointerDown={() => {
          fly.steps += 1;
        }}
      >
        +
      </button>
    </div>
  );
}

/** The whole surface: a stick under one thumb, the look under the other,
 * and the dial between them. Which half is which follows the player's
 * DRIVING choice — the hand that steers is the hand that flies, so nothing
 * has to be re-learned when the camera comes off the car. */
export function FlyControls({ fly, stickSide }: { fly: FlyTouch; stickSide: "left" | "right" }) {
  const lookSide = stickSide === "left" ? "right" : "left";
  return (
    <>
      <FlyStickZone fly={fly} side={stickSide} />
      <FlyLookZone fly={fly} side={lookSide} />
      <FlyDial fly={fly} side={lookSide} />
    </>
  );
}
