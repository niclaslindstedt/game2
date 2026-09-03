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
import { useState } from "preact/hooks";

import { playToggle, playUi } from "./audio/ui.ts";
import { Glyph, type GlyphName } from "./menu-glyphs.tsx";

/** One place a ladder can stand, and the sentence that says what standing
 * there buys. A stop with no hint of its own says the row's. */
export type Stop<T extends string> = { id: T; label: string; hint?: string };

/** Where a row sends its description when it is looked at. A page with a
 * caption bar passes its setter; the pause card passes nothing. */
export type OnHint = (hint: string | null) => void;

/** THE MARK A ROW LEADS WITH, where the page has one to give it. A word is
 * read; a mark is recognised, and a column of a dozen rows is scanned by
 * recognition rather than read top to bottom — which is what a page of
 * fourteen settings needs and a page of five does not. Optional for exactly
 * that reason: OPTIONS' rows name kinds of thing a drawing cannot say
 * ("RESOLUTION", "HEAD MOTION"), and a mark invented for one of those would
 * be a mark nobody learns. */
function KnobLabel({ glyph, label }: { glyph?: GlyphName; label: string }) {
  return (
    <span className="knob-label">
      {glyph && <Glyph name={glyph} className="knob-glyph" />}
      {/* The word in a box of its own so it can be TRUNCATED rather than
          run under the arrows: a row is sized by its value and its two
          targets, and the name is the only part of it that may give. */}
      <span className="knob-name">{label}</span>
    </span>
  );
}

/** A setting with NAMED answers — a picture, a camera, on or off. The arrows
 * wrap: the camera key wraps the same ladder, and on a pad an arrow that
 * does nothing at the end of a row reads as a row that has stopped
 * working. */
export function StepRow<T extends string>({
  label,
  glyph,
  stops,
  value,
  hint,
  onPick,
  onHint,
}: {
  label: string;
  glyph?: GlyphName;
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
      <KnobLabel glyph={glyph} label={label} />
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

/** A CONTINUOUS setting — a volume, or how hard a stage is built — drawn as
 * the thing it is: a track with the level filled along it and its reading
 * beside it. The arrows step it a tenth at a time, which is what a pad
 * presses; the track itself is a real range input, so a thumb or a mouse
 * drags it. The reading is a WORD wherever the value has one — silence is
 * a thing people choose, and so is a savage road — which is why `read` is
 * a parameter and the volume's OFF/percent is only its default. */
export function FadeRow({
  label,
  glyph,
  value,
  read = levelLabel,
  less = "quieter",
  more = "louder",
  hint,
  onChange,
  onHint,
}: {
  label: string;
  glyph?: GlyphName;
  /** 0–1. */
  value: number;
  /** What the value READS as beside the track. */
  read?: (value: number) => string;
  /** What the two arrows do, for the screen reader: a volume goes quieter
   * and louder, a difficulty easier and harder. */
  less?: string;
  more?: string;
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
      <KnobLabel glyph={glyph} label={label} />
      <div className="knob-ctl">
        <button
          type="button"
          className="knob-arrow"
          data-nav-step="left"
          aria-label={`${label}: ${less}`}
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
          <span className="knob-word knob-read">{read(value)}</span>
        </span>
        <button
          type="button"
          className="knob-arrow"
          data-nav-step="right"
          aria-label={`${label}: ${more}`}
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
  glyph,
  value,
  hint,
  disabled,
  onOpen,
  onHint,
}: {
  label: string;
  glyph?: GlyphName;
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
      <KnobLabel glyph={glyph} label={label} />
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

/** A setting that is A NUMBER and nothing else — the stage seed. Same
 * silhouette as every other row, so the seed reads as one more setting
 * rather than as a text field somebody has to type into, and it answers to
 * all four things a person wants to do with a number:
 *
 *   * the ARROWS walk it, one at a time, which is how you look at the road
 *     next door — and they wrap, because an arrow that does nothing at the
 *     end of a row reads as a row that has stopped working;
 *   * the FIELD is typed into, because a seed is passed between people and
 *     stepping to 481,205 one press at a time is not a control;
 *   * the DIE rolls a new one, because a player who wants a road they have
 *     never seen wants any of a million, not the next one along. It stands
 *     BEFORE the two arrows rather than past them: the pair of arrows is
 *     one control and reads as one, and a third press dropped on the end
 *     of them reads as a third arrow.
 *
 * The field keeps a DRAFT while it is being typed into and commits on blur
 * or on Enter. Rewriting the seed on every keystroke would rebuild the map
 * for "4", "42", "421" on the way to 4218 — three stages nobody asked for,
 * each of them a search — and would fight the caret while it did it. */
export function NumberRow({
  label,
  glyph,
  value,
  min,
  max,
  hint,
  rollHint,
  onValue,
  onRoll,
  onHint,
}: {
  label: string;
  glyph?: GlyphName;
  value: number;
  /** The travel, inclusive. The arrows wrap round it and a typed number is
   * clamped into it. */
  min: number;
  max: number;
  hint?: string;
  /** What the die does, in words — its tooltip and its label. */
  rollHint?: string;
  onValue: (value: number) => void;
  /** Offered only where there is something to roll. */
  onRoll?: () => void;
  onHint?: OnHint;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const describe = (): void => onHint?.(hint ?? null);
  const step = (dir: 1 | -1): void => {
    playToggle(dir > 0);
    setDraft(null);
    const span = max - min + 1;
    onValue(min + ((((value - min + dir) % span) + span) % span));
    describe();
  };
  /** What is in the field: what is being typed, or what the setting is. */
  const commit = (text: string): void => {
    setDraft(null);
    const digits = text.replace(/[^0-9]/g, "");
    // An emptied field is a CANCEL, not a zero: somebody clearing it to
    // type a new number and then thinking better of it gets their road
    // back rather than seed 1.
    if (digits === "") return;
    const next = Math.min(max, Math.max(min, Number(digits)));
    if (next !== value) onValue(next);
  };
  return (
    <div className="knob" data-nav-steps onPointerEnter={describe} onFocusCapture={describe}>
      <KnobLabel glyph={glyph} label={label} />
      <div className="knob-ctl">
        {onRoll && (
          <button
            type="button"
            className="knob-arrow knob-die"
            title={rollHint}
            aria-label={rollHint}
            onClick={() => {
              playUi("select");
              setDraft(null);
              onRoll();
              describe();
            }}
          >
            <Glyph name="dice" />
          </button>
        )}
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
          <input
            className="knob-word knob-field"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellcheck={false}
            aria-label={label}
            value={draft ?? String(value)}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onBlur={(e) => commit((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              // The way OUT of a field is the way out of everything else on
              // the page, so escape hands the keyboard back to the menu
              // rather than walking off the page mid-number.
              if (e.key === "Escape") {
                setDraft(null);
                (e.target as HTMLInputElement).blur();
                e.stopPropagation();
              }
            }}
          />
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

/** A handful of rows under one word. */
export function KnobGroup({
  title,
  glyph,
  children,
}: {
  title: string;
  glyph?: GlyphName;
  children: ComponentChildren;
}) {
  return (
    <section className="knob-group">
      <h3 className="knob-group-title">
        {glyph && <Glyph name={glyph} className="knob-group-glyph" />}
        {title}
      </h3>
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
