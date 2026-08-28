// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car picker: the car itself, turning on a stand, with an arrow either
// side of it. A row of name buttons tells you nothing about what you are
// about to drive — the shape does, so the shape is the control.
//
// The turntable's three.js lives in car-turntable.ts and is pulled in
// dynamically: this component is on the app shell's static import chain,
// and the entry script has a critical-path budget the render stack would
// blow on its own.

import { useEffect, useRef } from "react";
import { CARS, carById } from "@engine";

import type { CarTurntable } from "./car-turntable.ts";
import { DRIVE_LABELS } from "./car-stats.ts";
import { DEV_TAPS, DEV_TAP_WINDOW_MS } from "./settings.ts";

export function CarPicker({
  carId,
  onPick,
  onDeveloper,
}: {
  carId: string;
  onPick: (id: string) => void;
  /** Fired when the chassis has been drummed on DEV_TAPS times in quick
   * succession — the way into the developer menu. */
  onDeveloper?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const standRef = useRef<CarTurntable | null>(null);
  // The secret's whole state: how many taps are standing, and when the last
  // one landed. Refs, because a tap that is not the seventh must not
  // re-render the menu.
  const tapsRef = useRef(0);
  const lastTapRef = useRef(0);
  const spec = carById(carId);
  const index = Math.max(
    0,
    CARS.findIndex((c) => c.id === spec.id),
  );
  const step = (by: number): void => onPick(CARS[(index + by + CARS.length) % CARS.length].id);

  /** A press on the chassis. Taps only count while they keep coming inside
   * the window; a slow one starts the count over at one rather than at zero,
   * so a pause mid-drum costs the run and not the press.
   *
   * Timed by the EVENT's own stamp, never by `performance.now()`. The two
   * agree only on an idle main thread, and this control sits over a spinning
   * 3D stage that is anything but: the handler runs whenever the renderer
   * lets go of the thread, so reading the clock inside it measures the
   * frame budget rather than the drumming, and a player tapping steadily at
   * arm's length gets their run reset by a busy frame. `timeStamp` is when
   * the press HAPPENED, on the same time origin. */
  const tapChassis = (e: { timeStamp: number }): void => {
    if (!onDeveloper) return;
    const now = e.timeStamp > 0 ? e.timeStamp : performance.now();
    tapsRef.current = now - lastTapRef.current <= DEV_TAP_WINDOW_MS ? tapsRef.current + 1 : 1;
    lastTapRef.current = now;
    if (tapsRef.current < DEV_TAPS) return;
    tapsRef.current = 0;
    standRef.current?.celebrate();
    onDeveloper();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    void import("./car-turntable.ts").then(({ createCarTurntable }) => {
      if (disposed) return;
      standRef.current = createCarTurntable(canvas);
      standRef.current.setCar(carById(canvas.dataset.car ?? CARS[0].id));
    });
    const onResize = (): void => standRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      standRef.current?.dispose();
      standRef.current = null;
    };
    // Built once; the selected car flows in through the effect below, so a
    // pick swaps the body on the stand instead of tearing the canvas down.
  }, []);

  // The id also rides on the canvas so the turntable can pick it up if it
  // finishes loading after a pick has already happened.
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.dataset.car = spec.id;
    standRef.current?.setCar(spec);
  }, [spec]);

  return (
    <div className="car-pick-row">
      <div className="car-pick">
        <button
          type="button"
          className="car-pick-step"
          onClick={() => step(-1)}
          aria-label="Previous car"
        >
          ‹
        </button>
        <div
          className="car-pick-stage"
          onPointerDown={tapChassis}
          role="presentation"
          title="The car"
        >
          <canvas ref={canvasRef} className="car-pick-canvas" />
        </div>
        <button
          type="button"
          className="car-pick-step"
          onClick={() => step(1)}
          aria-label="Next car"
        >
          ›
        </button>
      </div>
      <span className="car-pick-name">{spec.name.toUpperCase()}</span>
      {/* Which wheels are driven is REAL physics here (TUNING.drivetrain),
          and it is the first thing about a rally car a player wants told.
          Three letters on the card, the words behind them on hover, for
          everyone who has never had to know them. */}
      <span className="car-pick-drive" title={DRIVE_LABELS[spec.drive].long}>
        {DRIVE_LABELS[spec.drive].short}
      </span>
    </div>
  );
}
