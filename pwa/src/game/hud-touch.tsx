// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TOUCH CONTROLS — the two thumb zones the phone drives the car with.
//
// They are a HUD surface but not a HUD readout: everything here writes
// straight into the input manager between snapshots, at pointer rate,
// rather than being drawn from the ~12 Hz snapshot the rest of the HUD
// reads. That is the whole reason they sit in their own module — and it is
// what the two rules below protect.
//
// TWO THINGS EVERY ZONE HERE OWES:
//
// - It must LET GO. A control that trusts only its own pointerup is one
//   that eventually sticks, with the axis it wrote outliving the run.
//   `thumb-guard.ts` is every way a grip has to be able to end, and no zone
//   may hold a finger without one.
// - It must answer at POINTER rate. The wheel's rotation and the pedal's
//   anchor are written onto refs and the DOM directly; nothing in here
//   re-renders to move, because a thumb feeling a 12 Hz wheel is a thumb
//   feeling a broken game.

import { useEffect, useMemo, useRef } from "react";

import type { InputManager } from "./input.ts";
import { createPedalGesture } from "./pedal-gesture.ts";
import type { PedalDir, TouchSettings } from "./settings.ts";
import type { ShiftWindow } from "./shift-window.ts";
import { createThumbGuard } from "./thumb-guard.ts";
import { clamp } from "../lib/util.ts";

/** Capture the pointer so a drag that leaves the zone keeps steering; a
 * pointer that cannot be captured (synthetic, already released) is fine —
 * the zone still tracks it by id. */
function capturePointer(e: { currentTarget: EventTarget | null; pointerId: number }): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* see above */
  }
}

/** Ask the DOM whether a finger is still on the glass. Capture is the only
 * one who knows: the browser drops it the moment a touch ends, whether or
 * not it ever told us the touch ended. This is what a zone's guard checks
 * before refusing a new claim, and what its watchdog ticks on. */
function stillDown(zone: EventTarget | null): (pointerId: number) => boolean {
  const el = zone as HTMLElement | null;
  return (pointerId) => el?.hasPointerCapture(pointerId) ?? false;
}

/** Thumb travel (px) from the anchor for full steering lock — the wheel's
 * whole throw. Long enough that holding a line is a push, not a switch. */
const WHEEL_REACH_PX = 70;
/** The throw is shaped `travel ** this`, so the first centimetre of thumb
 * buys less lock than the last. A slight steer is then a target a thumb can
 * actually hit instead of the twitch either side of centre — but only just
 * past linear: the car's own response carries the rest, and a stronger curve
 * here only makes the top of the throw feel like a cliff of its own. */
const WHEEL_THROW_CURVE = 1.15;
/** The rim has weight: it never teleports to the thumb, it turns toward it.
 * This is the floor rate in lock/second — what a fingertip nudge earns... */
const WHEEL_TURN_FLOOR = 1.8;
/** ...and this is what each unit of gap between thumb and rim adds on top,
 * so a committed shove reaches full lock in about a sixth of a second while
 * a wobble that is corrected before the rim catches up barely steers at all.
 * The engine's own rack (TUNING.steering.rackRate) lags again behind this,
 * and the two delays STACK: what the thumb feels is the sum, so neither can
 * be tuned for weight on its own. */
const WHEEL_TURN_GAIN = 12;
/** Rim rotation at full lock, degrees — also the fill arc's full sweep. */
const WHEEL_LOCK_DEG = 120;

/** The directions a hint arrow can be drawn in, and what each bound action
 * is called on it — "DRIFT" rather than "HANDBRAKE", because that is what
 * the player is reaching for it to do. */
const PEDAL_HINT_DIRS: PedalDir[] = ["up", "down", "left", "right"];
const PEDAL_HINT_WORD: Record<Exclude<PedalMode, "gas">, string> = {
  brake: "BRAKE",
  handbrake: "DRIFT",
};
/** ...and what a FLICK in that direction is worth in the manual box. Only
 * the two vertical ones carry one, and they carry it on top of whatever
 * pedal is bound there: the same drag is both, and which one it turns out
 * to be is decided by how long the thumb stays (pedal-gesture.ts). */
const PEDAL_FLICK_WORD: Partial<Record<PedalDir, string>> = {
  up: "GEAR +",
  down: "GEAR −",
};

/** The left thumb: touching anywhere anchors a steering wheel under the
 * finger; dragging sideways turns it and releasing recenters. The rim does
 * not snap to the thumb — it chases it at a rate set by the gap between the
 * two, which is what makes a small drag a small steer and a hard one
 * unambiguous. A blue arc fills the rim from 12 o'clock to the marker, so
 * the lock actually commanded is readable at a glance mid-drift.
 * Screen-space: right = +1 (input.ts flips the sign for the engine once).
 * Written straight into the input manager and the wheel's DOM from the
 * pointer events and one rAF loop; the 12 Hz HUD re-render never touches
 * these styles. */
export function SteerZone({
  touch,
  side,
}: {
  touch: InputManager["touch"];
  side: "left" | "right";
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<SVGCircleElement>(null);
  const originRef = useRef(0);
  /** Where the thumb is asking the rim to be, and where the rim has got to. */
  const targetRef = useRef(0);
  const steerRef = useRef(0);
  const frameRef = useRef(0);
  const lastRef = useRef(0);

  const setSteer = (value: number): void => {
    steerRef.current = value;
    touch.steer = value;
    const deg = value * WHEEL_LOCK_DEG;
    wheelRef.current?.style.setProperty("--turn", `${deg.toFixed(1)}deg`);
    const fill = fillRef.current;
    if (fill) {
      // pathLength=360 makes the dash units degrees. SVG's zero is 3
      // o'clock and sweeps clockwise, so a right turn starts a -90° arc at
      // 12; a left turn starts where the marker now is and sweeps back up
      // to 12, which paints the same wedge on the other side.
      fill.setAttribute("transform", `rotate(${(deg < 0 ? -90 + deg : -90).toFixed(1)} 50 50)`);
      fill.setAttribute("stroke-dasharray", `${Math.abs(deg).toFixed(1)} 360`);
    }
  };

  /** Turn the rim toward the thumb. Runs only while a finger is down — the
   * thumb can hold still, so pointer events alone would stall the chase. */
  const spin = (now: number): void => {
    frameRef.current = requestAnimationFrame(spin);
    const dt = Math.min(0.05, (now - lastRef.current) / 1000);
    lastRef.current = now;
    const gap = targetRef.current - steerRef.current;
    const step = (WHEEL_TURN_FLOOR + WHEEL_TURN_GAIN * Math.abs(gap)) * dt;
    setSteer(Math.abs(gap) <= step ? targetRef.current : steerRef.current + Math.sign(gap) * step);
  };
  const stopSpin = (): void => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  };

  /** Centre the wheel and put it away. Everything it touches is a ref, so
   * the guard can call it from a window event or an unmount just as safely
   * as the pointerup does. */
  const letGo = (): void => {
    stopSpin();
    targetRef.current = 0;
    setSteer(0);
    if (wheelRef.current) wheelRef.current.style.display = "none";
  };
  const letGoRef = useRef(letGo);
  letGoRef.current = letGo;
  const guard = useMemo(() => createThumbGuard(() => letGoRef.current(), window), []);
  useEffect(() => () => guard.dispose(), [guard]);

  return (
    <div
      className={`hud-zone hud-zone-${side}`}
      onPointerDown={(e) => {
        // The first finger owns the wheel; a second touch on this half is
        // ignored rather than re-anchoring the steering under the first —
        // unless the first is a finger the browser never told us about,
        // which is what the guard refuses to keep believing in.
        capturePointer(e);
        if (!guard.claim(e.pointerId, stillDown(e.currentTarget))) return;
        originRef.current = e.clientX;
        const wheel = wheelRef.current;
        if (wheel) {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          wheel.style.left = `${e.clientX - box.left}px`;
          wheel.style.top = `${e.clientY - box.top}px`;
          wheel.style.display = "block";
        }
        targetRef.current = 0;
        setSteer(0);
        lastRef.current = performance.now();
        if (!frameRef.current) frameRef.current = requestAnimationFrame(spin);
      }}
      onPointerMove={(e) => {
        if (!guard.owns(e.pointerId)) return;
        const travel = clamp((e.clientX - originRef.current) / WHEEL_REACH_PX, -1, 1);
        targetRef.current = Math.sign(travel) * Math.abs(travel) ** WHEEL_THROW_CURVE;
      }}
      onPointerUp={(e) => guard.release(e.pointerId)}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      // Capture taken away mid-drag: whatever the browser does with the rest
      // of that touch, this zone is no longer hearing about it.
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={wheelRef} className="hud-wheel" aria-hidden="true">
        {/* The rim is a circle: rotating it would show nothing, so it stays
            in the still layer and carries the fill arc, which measures from
            a fixed 12 o'clock. Only the spokes and the marker turn. */}
        <svg className="hud-wheel-svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="11" />
          <circle
            ref={fillRef}
            className="hud-wheel-fill"
            cx="50"
            cy="50"
            r="43"
            fill="none"
            strokeWidth="11"
            pathLength={360}
            strokeDasharray="0 360"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <svg className="hud-wheel-svg hud-wheel-spokes" viewBox="0 0 100 100">
          {/* Three spokes in a T: the bar across 9–3 and the stem down to
              6, the way a flat-bottom sport wheel is built. It leaves the
              top of the rim clear, which is where the fill arc starts. */}
          <path
            d="M11 50 L89 50 M50 50 L50 89"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="10" fill="currentColor" />
          <rect x="46" y="1" width="8" height="12" rx="2" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

type PedalMode = "gas" | "brake" | "handbrake";

/** The pedal thumb: touching anywhere is GAS; dragging off the anchor does
 * whatever the player has bound to that direction (gas stays on through
 * the handbrake — that is what makes it a drift tool). Sliding back inside
 * the deadzone returns to plain gas; releasing lets everything go. The
 * anchored hint arrows light the active gesture.
 *
 * In the manual box the same thumb also takes the gears: a vertical FLICK —
 * a stab off the anchor and straight back off the glass — is a shift, up
 * for up and down for down, so a driver never has to leave the throttle to
 * find a button. Two modules own the judgement behind it, and both are
 * DOM-free so the tests can read them: pedal-gesture.ts decides whether a
 * drag was a flick or the pedal bound to the same direction (time is what
 * separates them), and shift-window.ts decides whether the gear it asks for
 * is one the revs will take. */
export function PedalZone({
  touch,
  layout,
  side,
  shift,
  onShift,
}: {
  touch: InputManager["touch"];
  layout: TouchSettings;
  side: "left" | "right";
  /** Which gears a flick may take right now, or null in the automatic box —
   * which ignores a flick rather than fighting the gearbox for a gear it is
   * about to take straight back. */
  shift: ShiftWindow | null;
  onShift: (dir: 1 | -1) => void;
}) {
  /** The player's direction map, inverted: which action each drag means.
   * Plain gas is never in here — it is what a drag that lands on a direction
   * nothing is bound to falls back to. */
  const byDir: Partial<Record<PedalDir, Exclude<PedalMode, "gas">>> = {
    [layout.brake]: "brake",
    [layout.handbrake]: "handbrake",
  };
  const hintRef = useRef<HTMLDivElement>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const gesture = useMemo(() => createPedalGesture(), []);
  /** The thumb's travel off its anchor, and WHEN the browser says it got
   * there. The event's own `timeStamp`, never a clock read inside the
   * handler: these listeners queue behind whatever the canvas is doing, so
   * a reading taken here measures the frame budget rather than the flick. */
  const drag = (e: {
    clientX: number;
    clientY: number;
    timeStamp: number;
  }): [number, number, number] => [
    e.clientX - originRef.current.x,
    e.clientY - originRef.current.y,
    e.timeStamp,
  ];

  /** Put the pedals where the thumb is asking, and light the arrow it is
   * pulling TOWARD. The highlight is keyed off the DIRECTION rather than
   * off the action, because the arrows are drawn per direction: keying it
   * off the action would light the wrong one for every player who moved a
   * gesture off where it shipped, and light nothing at all for a direction
   * that only carries a gear. */
  const setMode = (mode: PedalMode | null, dir: PedalDir | null = null): void => {
    touch.throttle = mode !== null && mode !== "brake";
    touch.brake = mode === "brake";
    touch.handbrake = mode === "handbrake";
    const hint = hintRef.current;
    if (hint) hint.dataset.dir = dir ?? "";
  };
  /** Lift every pedal. Like the wheel's, this has to be safe to run when
   * nothing is held: a lost pointerup here is throttle nobody asked for. */
  const letGo = (): void => {
    setMode(null);
    if (hintRef.current) hintRef.current.style.display = "none";
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
        const hint = hintRef.current;
        if (hint) {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          hint.style.left = `${e.clientX - box.left}px`;
          hint.style.top = `${e.clientY - box.top}px`;
          hint.style.display = "block";
        }
        gesture.press();
        setMode("gas");
      }}
      onPointerMove={(e) => {
        if (!guard.owns(e.pointerId)) return;
        const dir = gesture.move(...drag(e));
        // A direction nothing is bound to stays gas, so a sloppy thumb
        // never brakes by accident — and an up-flick never lifts off.
        setMode(dir === null ? "gas" : (byDir[dir] ?? "gas"), dir);
      }}
      onPointerUp={(e) => {
        // Read the gear off the lift BEFORE the guard drops the gesture —
        // and off the zone's own pointerup, which is the one end event that
        // is a finger deliberately leaving the glass rather than a control
        // being taken away from it.
        if (guard.owns(e.pointerId)) {
          const gear = gesture.lift(...drag(e));
          if (gear === 1 && shift?.up) onShift(1);
          else if (gear === -1 && shift?.down) onShift(-1);
        }
        guard.release(e.pointerId);
      }}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={hintRef} className="hud-pedal-hint" aria-hidden="true">
        {PEDAL_HINT_DIRS.map((dir) => {
          const mode = byDir[dir];
          // The gear sits nearest the arrow and the pedal hard against the
          // thumb, so a direction carrying both reads outward in the order
          // the thumb performs them: the stab, then the hold.
          const gear = shift ? PEDAL_FLICK_WORD[dir] : undefined;
          const words = [gear, mode && PEDAL_HINT_WORD[mode]];
          const shown = words.filter((word): word is string => Boolean(word));
          if (shown.length === 0) return null;
          // A gear the revs will not take is still NAMED — the hint is where
          // the gesture is taught, and a word that came and went with the
          // engine speed would teach nothing. It is the colour that says
          // whether the flick would land, so a thumb already on the throttle
          // can read the answer without trying it.
          const armed = shift && ((dir === "up" && shift.up) || (dir === "down" && shift.down));
          return (
            <span key={dir} className={`hud-hint hud-hint-${dir}`}>
              <i className={`hud-hint-arrow hud-hint-arrow-${dir}`} />
              {shown.map((word) => (
                <span
                  key={word}
                  className={
                    word === gear ? `hud-hint-gear ${armed ? "hud-hint-armed" : ""}` : undefined
                  }
                >
                  {word}
                </span>
              ))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
