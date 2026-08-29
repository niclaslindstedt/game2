// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Options, in four tabs:
//
//   HUD      — which camera a run opens on, and which instruments are on
//              screen. Speed, gear and the countdown are not offered:
//              those are the game.
//   AUDIO    — the two faders, in five steps rather than as a continuous
//              slider: every other control on this screen is a row of
//              choices, and a volume nobody can quite reproduce is worse
//              than one they can name.
//   VIDEO    — the levers that buy frames on a weak device (resolution,
//              draw distance, the effects budget, how thickly the world is
//              planted).
//   CONTROLS — the gearbox, which every car in the roster will take either
//              way, plus only what the device can actually use: a desktop
//              rebinds keys; a touch device chooses which thumb steers and
//              what each drag off the pedal anchor does; and a device with a
//              CONTROLLER on it maps that. A laptop with a touchscreen
//              reports both and is offered both, and the pad section appears
//              the moment a pad does.
//
// Every change applies the moment it is made and is persisted by the app;
// there is no OK button to forget to press.

import { useEffect, useRef, useState } from "react";

import { captureAxis, captureSource, type PadFrame } from "./gamepad.ts";
import { deviceControls, holdPad, readPadFrames } from "./input.ts";
import { GearboxRow, MenuHead, OptionRow, ToggleRow } from "./menu.tsx";
import {
  DEFAULT_KEYS,
  DEFAULT_PAD,
  DEFAULT_TOUCH,
  HUD_TOGGLES,
  KEY_ACTIONS,
  PAD_ACTIONS,
  PAD_DEADZONES,
  PEDAL_DIRS,
  PLAY_CAMERAS,
  assignPedalDir,
  clonePad,
  keyLabel,
  padAxisLabel,
  padSourceLabel,
  type KeyAction,
  type PadAction,
  type PadSettings,
  type PedalDir,
  type PlayCamera,
  type Settings,
} from "./settings.ts";

export type OptionsTab = "hud" | "audio" | "video" | "controls";

const TABS: { id: OptionsTab; label: string }[] = [
  { id: "hud", label: "HUD" },
  { id: "audio", label: "AUDIO" },
  { id: "video", label: "VIDEO" },
  { id: "controls", label: "CONTROLS" },
];

/** The fader's stops. Five is enough to mix with and few enough to hit with
 * a thumb; OFF is a real stop rather than the bottom of a ramp, because
 * "no music" is a thing people want and not a very quiet thing. */
const LEVELS: { id: string; label: string }[] = [
  { id: "0", label: "OFF" },
  { id: "0.25", label: "25" },
  { id: "0.5", label: "50" },
  { id: "0.75", label: "75" },
  { id: "1", label: "100" },
];

/** The nearest stop to a stored value — a build that changes the ladder must
 * still show something sensible for a volume set on the old one. */
function nearestLevel(value: number): string {
  let best = LEVELS[0];
  for (const level of LEVELS) {
    if (Math.abs(Number(level.id) - value) < Math.abs(Number(best.id) - value)) best = level;
  }
  return best.id;
}

type OptionsProps = {
  tab: OptionsTab;
  onTab: (tab: OptionsTab) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onBack: () => void;
};

function HudTab({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  const camera = PLAY_CAMERAS.find((cam) => cam.id === settings.camera) ?? PLAY_CAMERAS[0];
  return (
    <div className="opt-list">
      <div className="menu-sub">Where you watch from, and what is on screen</div>
      <OptionRow
        label="CAMERA"
        options={PLAY_CAMERAS}
        value={settings.camera}
        onPick={(id: PlayCamera) => onSettings({ ...settings, camera: id })}
      />
      <div className="opt-note">
        {camera.hint} — every stage starts here, and the camera key still walks the whole ladder
        from wherever you set it.
      </div>
      <div className="opt-toggles">
        {HUD_TOGGLES.map((toggle) => (
          <ToggleRow
            key={toggle.id}
            label={toggle.label}
            hint={toggle.hint}
            on={settings.hud[toggle.id]}
            onToggle={() =>
              onSettings({
                ...settings,
                hud: { ...settings.hud, [toggle.id]: !settings.hud[toggle.id] },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function AudioTab({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  const audio = settings.audio;
  const set = (patch: Partial<Settings["audio"]>): void =>
    onSettings({ ...settings, audio: { ...audio, ...patch } });
  return (
    <div className="opt-list">
      <div className="menu-sub">Everything is synthesized — the game ships no audio files</div>
      <OptionRow
        label="EFFECTS"
        options={LEVELS}
        value={nearestLevel(audio.sfx)}
        onPick={(id) => set({ sfx: Number(id) })}
      />
      <OptionRow
        label="MUSIC"
        options={LEVELS}
        value={nearestLevel(audio.music)}
        onPick={(id) => set({ music: Number(id) })}
      />
      <div className="opt-note">
        The engine, the tyres, the wind and the slide are all effects — turning them off leaves the
        stage silent apart from the score.
      </div>
    </div>
  );
}

function VideoTab({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  const video = settings.video;
  const set = (patch: Partial<Settings["video"]>): void =>
    onSettings({ ...settings, video: { ...video, ...patch } });
  return (
    <div className="opt-list">
      <div className="menu-sub">Turn these down if the game does not run smoothly</div>
      <OptionRow
        label="RESOLUTION"
        options={[
          { id: "low", label: "LOW" },
          { id: "medium", label: "MEDIUM" },
          { id: "high", label: "HIGH" },
        ]}
        value={video.resolution}
        onPick={(resolution) => set({ resolution })}
      />
      <OptionRow
        label="DRAW DISTANCE"
        options={[
          { id: "near", label: "NEAR" },
          { id: "normal", label: "NORMAL" },
          { id: "far", label: "FAR" },
        ]}
        value={video.drawDistance}
        onPick={(drawDistance) => set({ drawDistance })}
      />
      <OptionRow
        label="EFFECTS"
        options={[
          { id: "off", label: "OFF" },
          { id: "low", label: "LOW" },
          { id: "full", label: "FULL" },
        ]}
        value={video.effects}
        onPick={(effects) => set({ effects })}
      />
      <OptionRow
        label="CAR INTERIORS"
        options={[
          { id: "off", label: "OFF" },
          { id: "low", label: "LOW" },
          { id: "full", label: "FULL" },
        ]}
        value={video.interior}
        onPick={(interior) => set({ interior })}
      />
      <OptionRow
        label="UNDERGROWTH"
        options={[
          { id: "sparse", label: "SPARSE" },
          { id: "normal", label: "NORMAL" },
          { id: "lush", label: "LUSH" },
        ]}
        value={video.flora}
        onPick={(flora) => set({ flora })}
      />
      <div className="opt-note">
        INTERIORS is what is behind the glass — trim, seats and a crew on LOW, plus the roll cage
        and a steering wheel that turns on FULL. OFF puts the old solid windows back. Applies to the
        next stage you start.
      </div>
      <div className="opt-note">
        Grass, shrubs and stumps between the trees — the cheapest frames on this page. The trees you
        can HIT are always drawn, so this never makes a stage easier; how thickly the forest itself
        stands is Roam&apos;s FOREST dial. Applies to the next stage you start.
      </div>
    </div>
  );
}

/** One rebindable action. Pressing it arms a capture-phase key listener;
 * the next key becomes the whole binding for that action. Escape backs out
 * without changing anything — otherwise pause would be the only action a
 * player could never escape from rebinding. */
function KeyRow({
  action,
  label,
  codes,
  listening,
  onListen,
}: {
  action: KeyAction;
  label: string;
  codes: string[];
  listening: boolean;
  onListen: (action: KeyAction | null) => void;
}) {
  return (
    <div className="opt-key">
      <span className="opt-key-label">{label}</span>
      <button
        type="button"
        className={`opt-key-bind ${listening ? "opt-key-listening" : ""}`}
        onClick={() => onListen(listening ? null : action)}
      >
        {listening ? "PRESS A KEY…" : codes.map(keyLabel).join(" / ") || "UNBOUND"}
      </button>
    </div>
  );
}

function KeyboardSection({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  const [listening, setListening] = useState<KeyAction | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent): void => {
      // Capture phase, and the propagation stops here: the input manager
      // listens on the same window and would otherwise drive the car with
      // the very key being bound.
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
    <div className="opt-section">
      <div className="opt-section-title">KEYBOARD</div>
      <div className="opt-keys">
        {KEY_ACTIONS.map((entry) => (
          <KeyRow
            key={entry.id}
            action={entry.id}
            label={entry.label}
            codes={settings.keys[entry.id]}
            listening={listening === entry.id}
            onListen={setListening}
          />
        ))}
      </div>
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

function TouchSection({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  const touch = settings.touch;
  const pedalSide = touch.steerSide === "left" ? "RIGHT" : "LEFT";
  const gesture = (action: "brake" | "handbrake", label: string) => (
    <OptionRow
      key={action}
      label={label}
      options={PEDAL_DIRS}
      value={touch[action]}
      onPick={(dir: PedalDir) =>
        onSettings({ ...settings, touch: assignPedalDir(touch, action, dir) })
      }
    />
  );
  return (
    <div className="opt-section">
      <div className="opt-section-title">TOUCH</div>
      <OptionRow
        label="STEER WITH"
        options={[
          { id: "left", label: "LEFT THUMB" },
          { id: "right", label: "RIGHT THUMB" },
        ]}
        value={touch.steerSide}
        onPick={(steerSide) => onSettings({ ...settings, touch: { ...touch, steerSide } })}
      />
      <div className="opt-note">
        Touching the {pedalSide.toLowerCase()} half is the throttle. Drag off it to do these instead
        — each direction can only hold one, so picking a taken one swaps them.
      </div>
      {gesture("brake", "BRAKE")}
      {gesture("handbrake", "HANDBRAKE")}
      <button
        type="button"
        className="opt-reset"
        onClick={() => onSettings({ ...settings, touch: { ...DEFAULT_TOUCH } })}
      >
        RESET TOUCH
      </button>
    </div>
  );
}

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

/** One rebindable pad action. Same shape as the keyboard's row next to it —
 * the two are the same job, and a player who has just rebound a key should
 * not have to learn a second idea to rebind a button. */
function PadRow({
  label,
  bound,
  listening,
  prompt,
  divider,
  onListen,
}: {
  label: string;
  bound: string;
  listening: boolean;
  prompt: string;
  /** Draw a rule above this row — where the car's controls end. */
  divider?: boolean;
  onListen: () => void;
}) {
  return (
    <div className={`opt-key ${divider ? "opt-key-divide" : ""}`}>
      <span className="opt-key-label">{label}</span>
      <button
        type="button"
        className={`opt-key-bind ${listening ? "opt-key-listening" : ""}`}
        onClick={onListen}
      >
        {listening ? prompt : bound}
      </button>
    </div>
  );
}

/** The controller. It is offered only where there IS one — a pad that has
 * never been touched has no buttons anyone can name and no rows worth
 * printing — and in its place there is one line saying how to make it
 * appear, because a section that is simply absent reads as a feature that
 * does not exist. */
function GamepadSection({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  const pads = usePadPresence();
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

  if (!pads.connected) {
    return (
      <div className="opt-section">
        <div className="opt-section-title">CONTROLLER</div>
        <div className="opt-note">
          Plug in or pair a controller and press one of its buttons — it appears here to be mapped.
          Out of the box the triggers are the pedals (right gas, left brake), A is the handbrake, X
          switches camera and the shoulders shift.
        </div>
      </div>
    );
  }

  return (
    <div className="opt-section">
      <div className="opt-section-title">CONTROLLER</div>
      <div className="opt-note">
        {pads.name}
        {pads.standard ? "" : " — this pad reports no standard layout, so its buttons are numbered"}
      </div>
      <ToggleRow
        label="CONTROLLER"
        hint="Off ignores the pad completely — the way out if one drives by itself"
        on={pad.enabled}
        onToggle={() => setPad({ ...pad, enabled: !pad.enabled })}
      />
      <ToggleRow
        label="HIDE TOUCH CONTROLS"
        hint="Takes the on-screen wheel and pedal away while a controller is connected"
        on={pad.hideTouch}
        onToggle={() => setPad({ ...pad, hideTouch: !pad.hideTouch })}
      />
      <div className="opt-keys">
        <PadRow
          label="STEERING"
          bound={padAxisLabel(pad.bindings.steerAxis, pad.bindings.steerInvert, pads.standard)}
          listening={listening === "steer"}
          prompt="STEER RIGHT…"
          onListen={() => setListening(listening === "steer" ? null : "steer")}
        />
        {PAD_ACTIONS.map((entry) => (
          <PadRow
            key={entry.id}
            label={entry.label}
            // The menu rows are the same job on the other side of the game,
            // so they are the same rows — a rule and a word in the note
            // below say where the car stops and the cards start.
            divider={entry.menu === true && entry.id === "confirm"}
            bound={
              pad.bindings.sources[entry.id]
                .map((source) => padSourceLabel(source, pads.standard))
                .join(" / ") || "UNBOUND"
            }
            listening={listening === entry.id}
            prompt="PRESS A BUTTON…"
            onListen={() => setListening(listening === entry.id ? null : entry.id)}
          />
        ))}
      </div>
      <div className="opt-note">
        The MENU rows are how a controller walks the cards — the d-pad and the stick move the
        cursor, SELECT presses what it is on, BACK is the way out. Sideways in a menu is the same
        pair that steers, so only up and down are listed. MAIN MENU and RESTART STAGE ship unbound
        on purpose: PAUSE opens a card that has both on it, and neither is a press worth making by
        accident mid-stage.
      </div>
      <OptionRow
        label="STICK DEADZONE"
        options={PAD_DEADZONES}
        value={nearestDeadzone(pad.bindings.deadzone)}
        onPick={(id) => setPad({ ...pad, bindings: { ...pad.bindings, deadzone: Number(id) } })}
      />
      <div className="opt-note">
        How far the stick has to leave centre before the car turns. Raise it if the car wanders down
        a straight with nobody touching it. The triggers are analogue — half a trigger is half the
        pedal, which is what makes a slide catchable on a pad.
      </div>
      <button type="button" className="opt-reset" onClick={() => setPad(clonePad(DEFAULT_PAD))}>
        RESET CONTROLLER
      </button>
    </div>
  );
}

/** The nearest stop to a stored deadzone, so a value set on another build's
 * ladder still lights a button. */
function nearestDeadzone(value: number): string {
  let best = PAD_DEADZONES[0];
  for (const stop of PAD_DEADZONES) {
    if (Math.abs(Number(stop.id) - value) < Math.abs(Number(best.id) - value)) best = stop;
  }
  return best.id;
}

/** The camera the player carries. It is on this tab and not on HUD because
 * what it actually is, is a KEY and a button — the picture it takes has no
 * HUD in it at all. Off stops both; the gallery stays where it is, because
 * the pictures already taken are still the player's. */
function ScreenshotSection({
  settings,
  onSettings,
}: Pick<OptionsProps, "settings" | "onSettings">) {
  const key = settings.keys.screenshot.map(keyLabel).join(" / ") || "the bound key";
  return (
    <div className="opt-section">
      <div className="opt-section-title">SCREENSHOTS</div>
      <ToggleRow
        label="SCREENSHOTS"
        hint={`${key}, or the shutter on the HUD — kept in MAIN MENU ▸ GALLERY`}
        on={settings.screenshots}
        onToggle={() => onSettings({ ...settings, screenshots: !settings.screenshots })}
      />
    </div>
  );
}

/** The gearbox, offered for every car in the roster rather than baked into
 * one of them. It is the one control choice that changes what the CAR does
 * rather than what a button does, so it sits at the top of the tab and on
 * its own, above the bindings — and again on the pre-race card, which is
 * where the same question is actually being asked. */
function GearboxSection({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  return (
    <div className="opt-section">
      <div className="opt-section-title">GEARBOX</div>
      <GearboxRow
        label="SHIFTING"
        gearbox={settings.gearbox}
        onGearbox={(gearbox) => onSettings({ ...settings, gearbox })}
      />
    </div>
  );
}

function ControlsTab({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  // Probed once per mount: a device does not grow a keyboard while the
  // options page is open, and re-probing on every render would churn.
  const [device] = useState(deviceControls);
  return (
    <div className="opt-list">
      <GearboxSection settings={settings} onSettings={onSettings} />
      <ScreenshotSection settings={settings} onSettings={onSettings} />
      {device.keyboard && <KeyboardSection settings={settings} onSettings={onSettings} />}
      <GamepadSection settings={settings} onSettings={onSettings} />
      {device.touch && <TouchSection settings={settings} onSettings={onSettings} />}
    </div>
  );
}

export function OptionsPage({ tab, onTab, settings, onSettings, onBack }: OptionsProps) {
  return (
    <div className="menu-card menu-card-wide">
      <MenuHead back={onBack} backLabel="MAIN MENU" title="OPTIONS" />
      <div className="opt-tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`opt-tab ${entry.id === tab ? "opt-tab-active" : ""}`}
            onClick={() => onTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tab === "hud" && <HudTab settings={settings} onSettings={onSettings} />}
      {tab === "audio" && <AudioTab settings={settings} onSettings={onSettings} />}
      {tab === "video" && <VideoTab settings={settings} onSettings={onSettings} />}
      {tab === "controls" && <ControlsTab settings={settings} onSettings={onSettings} />}
    </div>
  );
}
