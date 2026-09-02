// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KNOBS every settings surface is built from — the options page and the
// pause card's strip alike — as ONE silhouette: the setting's name on the
// left, its value on the right between two arrows, and under the value a row
// of pips saying where on its ladder the value stands.
//
// One shape for every setting is what the best console settings screens
// have in common, and it is the whole reason a player can read this page
// without reading it: every row answers to the same two presses, sideways
// moves the value, and nothing has to be explained twice. A switch is a
// two-stop ladder and a volume is a ladder with the stops drawn as a track,
// so even those are the same row.
//
// The rows carry no sentence of their own. A row that explains itself is
// height, and a page of them is a page that scrolls on a phone; the
// explanation goes to ONE caption bar the page owns (`Caption`), which reads
// whichever row the pointer or the cursor is on. On a pad, the cursor is
// menu-nav.ts's: `data-nav-steps` makes each row one stop on its walk, and
// sideways over it presses the arrows.

import type { ComponentChildren } from "preact";

import { playToggle, playUi } from "./audio/ui.ts";

/** One place a ladder can stand, and the sentence that says what standing
 * there buys. A stop with no hint of its own says the row's. */
export type Stop<T extends string> = { id: T; label: string; hint?: string };

/** Where a row sends its description when it is looked at. A page with a
 * caption bar passes its setter; the pause card passes nothing. */
export type OnHint = (hint: string | null) => void;

/** A setting with NAMED answers — a picture, a camera, on or off. The arrows
 * wrap: the camera key wraps the same ladder, and on a pad an arrow that
 * does nothing at the end of a row reads as a row that has stopped
 * working. */
export function StepRow<T extends string>({
  label,
  stops,
  value,
  hint,
  onPick,
  onHint,
}: {
  label: string;
  stops: Stop<T>[];
  value: T;
  /** The row's own sentence, for stops that have none. */
  hint?: string;
  onPick: (id: T) => void;
  onHint?: OnHint;
}) {
  const at = Math.max(
    0,
    stops.findIndex((stop) => stop.id === value),
  );
  // Belt and braces: an id off the ladder lands on its first stop rather
  // than on nothing, which is what the max above is for.
  const current = stops[at];
  const describe = (): void => onHint?.(current.hint ?? hint ?? null);
  const step = (dir: 1 | -1): void => {
    const to = (at + dir + stops.length) % stops.length;
    // The switch sounds like what it is about to BECOME — up the ladder is
    // up in pitch — because two presses that sound the same tell the player
    // nothing they could not already see.
    playToggle(to > at);
    onPick(stops[to].id);
    onHint?.(stops[to].hint ?? hint ?? null);
  };
  return (
    <div className="knob" data-nav-steps onPointerEnter={describe} onFocusCapture={describe}>
      <span className="knob-label">{label}</span>
      <div className="knob-ctl">
        <button
          type="button"
          className="knob-arrow"
          data-nav-step="left"
          aria-label={`${label}: previous`}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <span className="knob-value">
          <span className="knob-word">{current.label}</span>
          <span className="knob-pips" aria-hidden="true">
            {stops.map((stop, i) => (
              <i key={stop.id} className={`knob-pip ${i === at ? "knob-pip-on" : ""}`} />
            ))}
          </span>
        </span>
        <button
          type="button"
          className="knob-arrow"
          data-nav-step="right"
          aria-label={`${label}: next`}
          onClick={() => step(1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

/** A CONTINUOUS setting — a volume — drawn as the thing it is: a track with
 * the level filled along it and the number beside it. The arrows step it a
 * tenth at a time, which is what a pad presses; the track itself is a real
 * range input, so a thumb or a mouse drags it. The bottom of the travel is
 * a WORD, not a number: silence is a thing people choose. */
export function FadeRow({
  label,
  value,
  hint,
  onChange,
  onHint,
}: {
  label: string;
  /** 0–1. */
  value: number;
  hint?: string;
  onChange: (value: number) => void;
  onHint?: OnHint;
}) {
  const describe = (): void => onHint?.(hint ?? null);
  const set = (next: number): void =>
    onChange(Math.min(1, Math.max(0, Math.round(next * 100) / 100)));
  const nudge = (by: number): void => {
    // The tick IS the point on a volume fader: it is an effect, so the
    // effects level is heard at the level being set. Capped inside playUi,
    // so a drag is a run of ticks rather than a buzz.
    playUi("move");
    set(value + by);
  };
  return (
    <div className="knob" data-nav-steps onPointerEnter={describe} onFocusCapture={describe}>
      <span className="knob-label">{label}</span>
      <div className="knob-ctl">
        <button
          type="button"
          className="knob-arrow"
          data-nav-step="left"
          aria-label={`${label}: quieter`}
          onClick={() => nudge(-0.1)}
        >
          ‹
        </button>
        <span className="knob-value knob-fade">
          <input
            className="knob-range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value}
            aria-label={label}
            style={`--fill: ${Math.round(value * 100)}%`}
            onInput={(e) => {
              playUi("move");
              set(Number((e.target as HTMLInputElement).value));
            }}
          />
          <span className="knob-word knob-read">{levelLabel(value)}</span>
        </span>
        <button
          type="button"
          className="knob-arrow"
          data-nav-step="right"
          aria-label={`${label}: louder`}
          onClick={() => nudge(0.1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

/** A fader's readout. OFF rather than 0% because it is a state and not a
 * quantity — "0%" reads as a setting that did not take. */
export function levelLabel(value: number): string {
  return value <= 0 ? "OFF" : `${Math.round(value * 100)}%`;
}

/** A row that OPENS a page — the keyboard's bindings, the controller's —
 * with what is behind it summarised where a value would stand. */
export function LinkRow({
  label,
  value,
  hint,
  disabled,
  onOpen,
  onHint,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Nothing behind the door yet — no pad plugged in. The row still says
   * so, because a row that is simply absent reads as a feature that does
   * not exist. */
  disabled?: boolean;
  onOpen: () => void;
  onHint?: OnHint;
}) {
  const describe = (): void => onHint?.(hint ?? null);
  return (
    <button
      type="button"
      className="knob knob-link"
      disabled={disabled}
      onPointerEnter={describe}
      onFocus={describe}
      onClick={() => {
        playUi("select");
        onOpen();
      }}
    >
      <span className="knob-label">{label}</span>
      <span className="knob-ctl">
        <span className="knob-value">
          <span className="knob-word">{value}</span>
        </span>
        <span className="knob-arrow knob-arrow-go" aria-hidden="true">
          ›
        </span>
      </span>
    </button>
  );
}

/** One rebindable action — a key, or a button on a pad. The row is the
 * press: it arms a capture, and the next thing pressed becomes the whole
 * binding. Same silhouette as every other row, so a player who has just
 * moved a fader does not have to learn a second idea to move a key. */
export function BindRow({
  label,
  bound,
  listening,
  prompt,
  hint,
  onListen,
  onHint,
}: {
  label: string;
  /** What is on the action now, as the player reads it off their hardware. */
  bound: string;
  listening: boolean;
  /** What the row says while it waits. */
  prompt: string;
  hint?: string;
  onListen: () => void;
  onHint?: OnHint;
}) {
  const describe = (): void => onHint?.(hint ?? null);
  return (
    <button
      type="button"
      className={`knob knob-bind ${listening ? "knob-bind-listening" : ""}`}
      onPointerEnter={describe}
      onFocus={describe}
      onClick={() => {
        playUi(listening ? "back" : "select");
        onListen();
      }}
    >
      <span className="knob-label">{label}</span>
      <span className="knob-value">
        <span className="knob-word">{listening ? prompt : bound}</span>
      </span>
    </button>
  );
}

/** A handful of rows under one word. */
export function KnobGroup({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section className="knob-group">
      <h3 className="knob-group-title">{title}</h3>
      <div className="knob-rows">{children}</div>
    </section>
  );
}

/** The page's one sentence — whichever row is being looked at, or the
 * page's own line while none is. Always rendered, even empty, so the card
 * does not change height as the pointer crosses it. */
export function Caption({ text, fallback }: { text: string | null; fallback: string }) {
  return (
    <div className={`knob-caption ${text ? "knob-caption-on" : ""}`} aria-live="polite">
      {text ?? fallback}
    </div>
  );
}
