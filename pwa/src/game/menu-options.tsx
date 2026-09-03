// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// OPTIONS — one page, eleven rows, reached from the front door only.
//
//   PICTURE   — how sharp, how much and how far, as three rows.
//   SOUND     — the two faders.
//   HUD       — the instrument panel on or off, and the rear-view glass.
//   DRIVING   — the camera a stage opens on, and whether the driver's head
//               moves. NOT the gearbox: that is asked where it is decided,
//               on the pre-race card beside the car's own numbers, and the
//               answer is simply remembered (`settings.gearbox`).
//   CONTROLS  — only what the device can use: which thumb steers on glass,
//               and a door each to the keyboard's and the controller's
//               bindings, which are pages of their own.
//
// Every row is the same knob (menu-knobs.tsx) and nothing else: no sentence
// under it, no caption bar, no OK button — a row whose name and three stops
// do not say what it does is a row that needs a better name. Every change
// applies the moment it is made. The page is not offered over a held run:
// the pause card carries the handful of knobs a player stops mid-stage for
// (menu.tsx), and everything else waits for the menu.

import { useEffect, useRef, useState } from "react";

import { captureAxis, captureSource, type PadFrame } from "./gamepad.ts";
import { deviceControls, holdPad, readPadFrames } from "./input.ts";
import { MenuHead } from "./menu.tsx";
import {
  BindRow,
  Caption,
  FadeRow,
  KnobGroup,
  LinkRow,
  StepRow,
  type Stop,
} from "./menu-knobs.tsx";
import {
  DEFAULT_KEYS,
  DEFAULT_PAD,
  DEFAULT_SETTINGS,
  DETAIL_PRESETS,
  DETAIL_STOPS,
  DISTANCE_STOPS,
  KEY_ACTIONS,
  PAD_ACTIONS,
  PLAY_CAMERAS,
  RESOLUTION_STOPS,
  clonePad,
  detailOf,
  freshSettings,
  keyLabel,
  padAxisLabel,
  padSourceLabel,
  type KeyAction,
  type PadAction,
  type PadSettings,
  type Settings,
} from "./settings.ts";

/** The pages behind the CONTROLS doors. */
export type OptionsSub = "keyboard" | "controller";

type OptionsProps = {
  /** Which sub-page is open, if any — a step of the page rather than a page
   * of its own, so BACK from it lands on the rows it was opened from. */
  sub: OptionsSub | null;
  onSub: (sub: OptionsSub | null) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onBack: () => void;
};

/** What every page here is handed: the blob, and the way to change it. */
type Shared = { settings: Settings; onSettings: (settings: Settings) => void };

const ON_OFF: Stop<"off" | "on">[] = [
  { id: "off", label: "OFF" },
  { id: "on", label: "ON" },
];

const onOff = (on: boolean): "off" | "on" => (on ? "on" : "off");

const THUMBS: Stop<"left" | "right">[] = [
  { id: "left", label: "LEFT THUMB" },
  { id: "right", label: "RIGHT THUMB" },
];

/** What the browser currently says is plugged in. Polled rather than
 * listened for: `gamepadconnected` is the only event a pad ever fires, and
 * a pad that was already there before this page opened never fires it. Ten
 * times a second is instant to a human and nothing to a phone, and the
 * summary is compared before it is stored so the card is not re-rendered
 * for a stick sitting still. */
function usePadPresence(): { connected: boolean; standard: boolean; name: string } {
  const [pads, setPads] = useState(() => summarise(readPadFrames()));
  useEffect(() => {
    const tick = (): void => {
      const next = summarise(readPadFrames());
      setPads((was) =>
        was.connected === next.connected && was.standard === next.standard && was.name === next.name
          ? was
          : next,
      );
    };
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, []);
  return pads;
}

function summarise(frames: PadFrame[]): { connected: boolean; standard: boolean; name: string } {
  const first = frames[0];
  if (!first) return { connected: false, standard: false, name: "" };
  // The id is the driver's own string and can run to sixty characters of
  // vendor and product hex. The name is a caption, not a datasheet.
  const name = first.id.replace(/\s*\([^)]*\)\s*$/, "").slice(0, 32);
  return { connected: true, standard: first.standard, name: name || "Controller" };
}

/** THE PAGE. */
export function OptionsPage({ sub, onSub, settings, onSettings, onBack }: OptionsProps) {
  if (sub === "keyboard") {
    return <KeyboardPage settings={settings} onSettings={onSettings} onBack={() => onSub(null)} />;
  }
  if (sub === "controller") {
    return (
      <ControllerPage settings={settings} onSettings={onSettings} onBack={() => onSub(null)} />
    );
  }
  return <MainPage settings={settings} onSettings={onSettings} onSub={onSub} onBack={onBack} />;
}

function MainPage({
  settings,
  onSettings,
  onSub,
  onBack,
}: Shared & { onSub: (sub: OptionsSub) => void; onBack: () => void }) {
  // Probed once per mount: a device does not grow a keyboard while the
  // options page is open, and re-probing on every render would churn.
  const [device] = useState(deviceControls);
  const pads = usePadPresence();
  const set = (patch: Partial<Settings>): void => onSettings({ ...settings, ...patch });
  return (
    <div className="menu-card menu-card-options">
      <MenuHead back={onBack} backLabel="MENU" title="OPTIONS" />
      {/* Two columns on anything wide enough, packed by ROW COUNT rather
          than by subject order — five a side and six with the controller's
          — so a laptop holds the whole page without scrolling and neither
          column ends short. */}
      <div className="knob-groups">
        <div className="knob-col">
          {/* Three rows, not one, because they are three different costs:
              how many pixels, how much world, how far away. A machine can
              be short of one and rich in another — a dense phone screen
              that wants every pixel and would rather lose the far ridges
              is the ordinary case, not the exotic one. */}
          <KnobGroup title="PICTURE">
            <StepRow
              label="RESOLUTION"
              stops={RESOLUTION_STOPS}
              value={settings.video.resolution}
              onPick={(resolution) => set({ video: { ...settings.video, resolution } })}
            />
            <StepRow
              label="DETAIL"
              stops={DETAIL_STOPS}
              value={detailOf(settings.video)}
              onPick={(detail) => set({ video: { ...settings.video, ...DETAIL_PRESETS[detail] } })}
            />
            <StepRow
              label="DISTANCE"
              stops={DISTANCE_STOPS}
              value={settings.video.drawDistance}
              onPick={(drawDistance) => set({ video: { ...settings.video, drawDistance } })}
            />
          </KnobGroup>
          <KnobGroup title="DRIVING">
            <StepRow
              label="CAMERA"
              stops={PLAY_CAMERAS}
              value={settings.camera}
              onPick={(id) => set({ camera: id })}
            />
            <StepRow
              label="HEAD MOTION"
              stops={ON_OFF}
              value={onOff(settings.view.headMotion > 0)}
              onPick={(id) =>
                set({
                  view: {
                    ...settings.view,
                    headMotion: id === "on" ? DEFAULT_SETTINGS.view.headMotion : 0,
                  },
                })
              }
            />
          </KnobGroup>
        </div>
        <div className="knob-col">
          <KnobGroup title="SOUND">
            <FadeRow
              label="EFFECTS"
              value={settings.audio.sfx}
              onChange={(sfx) => set({ audio: { ...settings.audio, sfx } })}
            />
            <FadeRow
              label="MUSIC"
              value={settings.audio.music}
              onChange={(music) => set({ audio: { ...settings.audio, music } })}
            />
          </KnobGroup>
          <KnobGroup title="HUD">
            <StepRow
              label="HUD"
              stops={ON_OFF}
              value={onOff(settings.hud.on)}
              onPick={(id) => set({ hud: { ...settings.hud, on: id === "on" } })}
            />
            <StepRow
              label="REAR VIEW"
              stops={ON_OFF}
              value={onOff(settings.hud.mirror)}
              onPick={(id) => set({ hud: { ...settings.hud, mirror: id === "on" } })}
            />
          </KnobGroup>
          <KnobGroup title="CONTROLS">
            {device.touch && (
              <StepRow
                label="STEER WITH"
                stops={THUMBS}
                value={settings.touch.steerSide}
                onPick={(steerSide) => set({ touch: { ...settings.touch, steerSide } })}
              />
            )}
            {device.keyboard && (
              <LinkRow
                label="KEYBOARD"
                value={`${KEY_ACTIONS.length} KEYS`}
                onOpen={() => onSub("keyboard")}
              />
            )}
            <LinkRow
              label="CONTROLLER"
              value={pads.connected ? pads.name.toUpperCase() : "NONE FOUND"}
              disabled={!pads.connected}
              onOpen={() => onSub("controller")}
            />
          </KnobGroup>
        </div>
      </div>
      {/* The developer flags are not settings, and a reset that took the
          developer menu away again would be a reset that hides a door. */}
      <button
        type="button"
        className="opt-reset"
        onClick={() =>
          onSettings({ ...freshSettings(), developer: settings.developer, dev: settings.dev })
        }
      >
        RESTORE DEFAULTS
      </button>
    </div>
  );
}

/** THE KEYBOARD. Pressing a row arms a capture-phase key listener; the next
 * key becomes the whole binding for that action. Escape backs out without
 * changing anything — otherwise pause would be the only action a player
 * could never escape from rebinding. */
function KeyboardPage({ settings, onSettings, onBack }: Shared & { onBack: () => void }) {
  const [listening, setListening] = useState<KeyAction | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent): void => {
      // Capture phase, and the propagation stops here: the input manager
      // listens on the same window and would otherwise drive the car with
      // the very key being bound, and the menu's own Escape would walk out
      // of the page instead of out of the capture.
      e.preventDefault();
      e.stopPropagation();
      setListening(null);
      if (e.code === "Escape") return;
      onSettings({ ...settings, keys: { ...settings.keys, [listening]: [e.code] } });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, settings, onSettings]);

  return (
    <div className="menu-card menu-card-options" onPointerLeave={() => setHint(null)}>
      <MenuHead back={onBack} backLabel="OPTIONS" title="KEYBOARD" />
      <div className="knob-binds">
        {KEY_ACTIONS.map((entry) => (
          <BindRow
            key={entry.id}
            label={entry.label}
            bound={settings.keys[entry.id].map(keyLabel).join(" / ") || "UNBOUND"}
            listening={listening === entry.id}
            prompt="PRESS A KEY…"
            hint={`Press the row, then the key you want on ${entry.label}. Escape keeps what is there`}
            onListen={() => setListening(listening === entry.id ? null : entry.id)}
            onHint={setHint}
          />
        ))}
      </div>
      <Caption
        text={hint}
        fallback="Press a row, then the key. One key replaces the whole binding"
      />
      <button
        type="button"
        className="opt-reset"
        onClick={() => onSettings({ ...settings, keys: { ...DEFAULT_KEYS } })}
      >
        RESET KEYS
      </button>
    </div>
  );
}

/** Wait for the player to move something, and say what they moved. The
 * baseline is taken the moment the row starts listening, so a trigger that
 * rests at half travel or a stick that rests off centre is the FLOOR rather
 * than the answer — only a real move off wherever it was sitting counts.
 *
 * rAF rather than the 10 Hz poll above: this one is a person pressing a
 * button and expecting the row to answer, and a tenth of a second late
 * reads as a button that did not work. */
function usePadCapture(active: boolean, onCapture: (frames: PadFrame[], base: PadFrame[]) => void) {
  const handler = useRef(onCapture);
  handler.current = onCapture;
  useEffect(() => {
    if (!active) return;
    // The pad is this row's while it listens. Without that, binding CAMERA
    // to START fires pause on the way past, and the player lands back in
    // the run holding a card they never asked for.
    holdPad(true);
    const baseline = readPadFrames();
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      handler.current(readPadFrames(), baseline);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      holdPad(false);
    };
  }, [active]);
}

/** THE CONTROLLER. Its rows exist only while there IS one — a pad that has
 * never been touched has no buttons anyone can name — and unplugged
 * mid-page it says how to come back. */
function ControllerPage({ settings, onSettings, onBack }: Shared & { onBack: () => void }) {
  const pads = usePadPresence();
  const [hint, setHint] = useState<string | null>(null);
  /** Which row is waiting for a press — an action, `"steer"` for the axis,
   * or nothing. */
  const [listening, setListening] = useState<PadAction | "steer" | null>(null);
  const pad = settings.pad;
  const setPad = (next: PadSettings): void => onSettings({ ...settings, pad: next });

  // A pad unplugged mid-rebind leaves a row listening to nothing.
  useEffect(() => {
    if (!pads.connected) setListening(null);
  }, [pads.connected]);

  usePadCapture(listening !== null && pads.connected, (frames, base) => {
    if (listening === null) return;
    if (listening === "steer") {
      const found = captureAxis(frames, base);
      if (!found) return;
      setListening(null);
      setPad({
        ...pad,
        bindings: { ...pad.bindings, steerAxis: found.axis, steerInvert: found.invert },
      });
      return;
    }
    const source = captureSource(frames, base);
    if (!source) return;
    setListening(null);
    // The whole binding, replaced by the one control that was offered —
    // exactly what the keyboard's rows do with the one key that was pressed.
    setPad({
      ...pad,
      bindings: { ...pad.bindings, sources: { ...pad.bindings.sources, [listening]: [source] } },
    });
  });

  const line = pads.connected
    ? `${pads.name}${pads.standard ? "" : " — no standard layout, so its buttons are numbered"}`
    : "Plug in or pair a controller and press one of its buttons";

  return (
    <div className="menu-card menu-card-options" onPointerLeave={() => setHint(null)}>
      <MenuHead back={onBack} backLabel="OPTIONS" title="CONTROLLER" sub={line} />
      {pads.connected && (
        <div className="knob-binds">
          <BindRow
            label="STEERING"
            bound={padAxisLabel(pad.bindings.steerAxis, pad.bindings.steerInvert, pads.standard)}
            listening={listening === "steer"}
            prompt="STEER RIGHT…"
            hint="Press the row, then push the stick you steer with to the right"
            onListen={() => setListening(listening === "steer" ? null : "steer")}
            onHint={setHint}
          />
          {PAD_ACTIONS.map((entry) => (
            <BindRow
              key={entry.id}
              label={entry.label}
              bound={
                pad.bindings.sources[entry.id]
                  .map((source) => padSourceLabel(source, pads.standard))
                  .join(" / ") || "UNBOUND"
              }
              listening={listening === entry.id}
              prompt="PRESS A BUTTON…"
              hint={padHint(entry.id)}
              onListen={() => setListening(listening === entry.id ? null : entry.id)}
              onHint={setHint}
            />
          ))}
        </div>
      )}
      <Caption
        text={hint}
        fallback="Press a row, then the button. MENU rows are how the pad walks these cards"
      />
      {pads.connected && (
        <button type="button" className="opt-reset" onClick={() => setPad(clonePad(DEFAULT_PAD))}>
          RESET CONTROLLER
        </button>
      )}
    </div>
  );
}

/** What a pad row is FOR, where the name alone does not say. */
function padHint(action: PadAction): string {
  switch (action) {
    case "restart":
    case "menu":
      return "Unbound on purpose: PAUSE opens a card with this on it, and it is not a press worth making by accident mid-stage";
    case "next":
      return "Takes each screen's own way on, wherever the cursor is — held down from the front door it lands on a start line";
    case "confirm":
      return "Presses whatever the cursor is on";
    case "back":
      return "The way out of any card";
    case "navUp":
    case "navDown":
      return "Sideways in a menu is the same pair that steers, so only up and down are listed";
    case "throttle":
    case "brake":
      return "Analogue on a trigger — half a trigger is half the pedal, which is what makes a slide catchable";
    default:
      return "Press the row, then the button you want on it";
  }
}
