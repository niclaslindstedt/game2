// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Options, in three tabs:
//
//   HUD      — which instruments are on screen. Speed, gear and the
//              countdown are not offered: those are the game.
//   VIDEO    — the levers that buy frames on a weak device (resolution,
//              draw distance, the effects budget, how thickly the world is
//              planted).
//   CONTROLS — only what the device can actually use. A desktop rebinds
//              keys; a touch device chooses which thumb steers and what
//              each drag off the pedal anchor does. A laptop with a
//              touchscreen reports both and is offered both.
//
// Every change applies the moment it is made and is persisted by the app;
// there is no OK button to forget to press.

import { useEffect, useState } from "react";

import { OptionRow } from "./menu.tsx";
import {
  DEFAULT_KEYS,
  DEFAULT_TOUCH,
  HUD_TOGGLES,
  KEY_ACTIONS,
  PEDAL_DIRS,
  assignPedalDir,
  deviceControls,
  keyLabel,
  type KeyAction,
  type PedalDir,
  type Settings,
} from "./settings.ts";

export type OptionsTab = "hud" | "video" | "controls";

const TABS: { id: OptionsTab; label: string }[] = [
  { id: "hud", label: "HUD" },
  { id: "video", label: "VIDEO" },
  { id: "controls", label: "CONTROLS" },
];

type OptionsProps = {
  tab: OptionsTab;
  onTab: (tab: OptionsTab) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onBack: () => void;
};

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`opt-toggle ${on ? "opt-toggle-on" : ""}`}
      onClick={onToggle}
      aria-pressed={on}
    >
      <span className="opt-toggle-text">
        <b>{label}</b>
        <span className="opt-toggle-hint">{hint}</span>
      </span>
      <span className="opt-switch" aria-hidden="true">
        <span className="opt-switch-knob" />
      </span>
    </button>
  );
}

function HudTab({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  return (
    <div className="opt-list">
      <div className="menu-sub">Switch off what you do not need on screen</div>
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
        label="FOREST"
        options={[
          { id: "sparse", label: "SPARSE" },
          { id: "normal", label: "NORMAL" },
          { id: "lush", label: "LUSH" },
        ]}
        value={video.flora}
        onPick={(flora) => set({ flora })}
      />
      <div className="opt-note">Forest density applies to the next stage you start.</div>
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
  const gesture = (action: "brake" | "handbrake" | "boost", label: string) => (
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
      {gesture("boost", "BOOST")}
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

function ControlsTab({ settings, onSettings }: Pick<OptionsProps, "settings" | "onSettings">) {
  // Probed once per mount: a device does not grow a keyboard while the
  // options page is open, and re-probing on every render would churn.
  const [device] = useState(deviceControls);
  return (
    <div className="opt-list">
      {device.keyboard && <KeyboardSection settings={settings} onSettings={onSettings} />}
      {device.touch && <TouchSection settings={settings} onSettings={onSettings} />}
    </div>
  );
}

export function OptionsPage({ tab, onTab, settings, onSettings, onBack }: OptionsProps) {
  return (
    <div className="menu-card menu-card-wide">
      <button type="button" className="menu-back" onClick={onBack}>
        ‹ MAIN MENU
      </button>
      <div className="menu-title">OPTIONS</div>
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
      {tab === "video" && <VideoTab settings={settings} onSettings={onSettings} />}
      {tab === "controls" && <ControlsTab settings={settings} onSettings={onSettings} />}
    </div>
  );
}
