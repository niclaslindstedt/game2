// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CO-DRIVER'S STRIP — the calls across the top of the frame: the corner
// coming up, the corner behind it, and the two things that take the slot over
// when there is no corner to call because the car is not on the stage any
// more (lost in a field, or turned round on the road).
//
// IT CARRIES NO WORDS — not even a number of metres. A call is a SIGN: the
// road's own shape drawn off the stage, on a plate coloured by how much it is
// going to ask, fading up over the two seconds before the car commits and
// then INKING ITSELF IN along its own line as the thing is driven — solid at
// the exit, and gone the instant the car is past it. A corner is drawn as the
// stage's PLAN of that turn, cut to a point on the side it bends toward; a
// jump is drawn as its ELEVATION — the ramp, the estimated flight over the
// ground that falls away, and the landing — and fills up the ramp and through
// the air the same way. Every one of those is read out of the corner of an
// eye that never leaves the road, which is the only way a call is ever read
// at rally pace — lettering it adds nothing a glance already has and asks for
// the one thing there is no room for. The words survive as each plate's
// LABEL, for a reader who cannot see it. The two calls that are instructions
// rather than corners keep theirs on screen, because a sentence has no shape
// to be drawn as.
//
// WHERE the strip hangs is not its own to decide: `--pace-top` in styles.css
// stacks it under the mirror and under the split's band, off one number the
// HUD's root writes out (see `data-glass` in hud.tsx).

import type { JumpSize, TurnSeverity } from "@engine";

import { fillJump, fillSign, type JumpSign, type PacePoint, type PaceSign } from "./pace-shape.ts";
import { clamp } from "../lib/util.ts";

/** One co-driver call, already flipped into SCREEN space by the snapshot
 * (left means the road bends left through the windshield). */
export type HudPacenote =
  | {
      kind: "turn";
      dir: "left" | "right";
      severity: TurnSeverity;
      /** True when the turn holds long enough to earn the LONG modifier. */
      long: boolean;
      /** Seconds from the car to the turn entry at the speed it is doing (0
       * while inside the turn) — the clock the strip is timed on, and what
       * the call's opacity is read off. */
      eta: number;
      /** How much of the corner is behind the car: 0 on the approach, 1 at
       * the exit. The sign inks itself in along this (snapshot.ts). */
      fill: number;
      /** The corner's own shape, ready to draw in the sign's 100x100 box — the
       * stage's plan view of this turn, already in screen axes (pace-shape.ts). */
      sign: PaceSign;
    }
  | {
      kind: "jump";
      /** How much air the lip gives — the engine's own reading of the ramp
       * and the road past it (`jumpSize`), not of how fast the car is
       * going, so the call cannot change under the lift it asks for. */
      size: JumpSize;
      /** Seconds from the car to the takeoff lip, at the speed it is doing. */
      eta: number;
      /** How much of the jump is behind the car: 0 on the approach, 1 off
       * the end of the landing. The sign inks itself in along this — up the
       * ramp, then through the air (snapshot.ts). */
      fill: number;
      /** The lip's own shape, ready to draw in the sign's 100x100 box: the
       * ramp, the estimated flight over it, and the ground it lands on
       * (pace-shape.ts). */
      sign: JumpSign;
    };

/** The pacenote sign: the corner's own shape, drawn like a rally note board.
 * The line is the road — the approach at the bottom, the bend the way the
 * bend goes — with a heavy head on the exit. pace-shape.ts has squared both
 * up and fitted them to this 100x100 box, so all that is left here is the
 * hand they are drawn in: one chunky rounded stroke in the severity's
 * colour, and the head filled in the same. The stroke itself is CSS
 * (`.hud-pace-arrow path`) rather than an attribute here — see styles.css.
 *
 * THE CORNER FILLS AS IT IS DRIVEN, IN ITS OWN COLOUR. The sign is laid down
 * twice: once faint, which is the corner still to come, and once solid in the
 * severity's own colour, cut back to how much of the bend is behind the car.
 * So the sign COMES UP as it is driven — the road first, then the HEAD ITSELF
 * filling from its base to its point, over exactly the road the note covers.
 * It is the one moving thing on the strip and it moves the way the car does:
 * a driver who glances at a half-lit hairpin knows there is as much of it
 * left as there is behind, without reading anything. `fillSign` owns the
 * split between the two shapes and measures it off the sign.
 *
 * ONE COLOUR on the whole plate. The severity is not weakened by the ghost
 * under it — the plate's point is cut and filled solid in that same colour
 * from the moment the call goes up, and it is the point, not the drawn road,
 * that a braking driver reads the difficulty and the direction off. What the
 * road is left free to say is HOW FAR THROUGH. */
export function PacenoteArrow({ sign, fill }: { sign: PaceSign; fill: number }) {
  const line = `M ${sign.line.map((p) => p.join(" ")).join(" L ")}`;
  const lit = fillSign(sign, fill);
  return (
    <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
      <g className="hud-pace-road">
        <path d={line} />
        <polygon points={points(sign.head)} />
      </g>
      {fill > 0 && (
        <g className="hud-pace-fill">
          <path
            d={line}
            style={{
              strokeDasharray: `${lit.span}`,
              strokeDashoffset: `${lit.span - lit.lit}`,
            }}
          />
          {lit.head && <polygon points={points(lit.head)} />}
        </g>
      )}
    </svg>
  );
}

/** A polygon's points, in the attribute's own spelling. */
function points(shape: readonly PacePoint[]): string {
  return shape.map((p) => p.join(",")).join(" ");
}

/** A polyline as a path's `d`. */
function poly(line: readonly PacePoint[]): string {
  return `M ${line.map((p) => p.join(" ")).join(" L ")}`;
}

/** The dash that hides the part of a line the car has not reached. */
function dash(span: { span: number; lit: number }): Record<string, string> {
  return { strokeDasharray: `${span.span}`, strokeDashoffset: `${span.span - span.lit}` };
}

/** THE JUMP SIGN: the lip seen FROM THE SIDE — the road climbing the ramp,
 * the estimated flight arcing over the ground that drops away beneath it, and
 * the landing it comes back down to. Where a corner call is the stage's plan
 * view, a jump call is its elevation, and the two are told apart before either
 * is read: one is a bend, the other is a leap.
 *
 * THE ESTIMATE IS DRAWN AS AN ESTIMATE. The flight is a broken line — the
 * projection idiom off a trajectory diagram — where the road either side of
 * it is solid ground. So the sign says what it knows and what it is only
 * predicting, without a word on it.
 *
 * ...AND IT BECOMES FACT AS IT IS FLOWN. The same three parts the car is
 * actually on light in turn as the jump is taken: up the ramp, then along the
 * arc — solid now, over its own dashed estimate — then away down the landing.
 * The road UNDER the flight never lights, because the car is never on it, and
 * the daylight between the two is the jump. `fillJump` owns the split and
 * measures it off the stage's own metres.
 *
 * That daylight is also WASHED, under everything else. Two thin lines and the
 * space between them is a fine drawing at full size and nothing at all in the
 * strip's second slot, where the plate is dimmed by half and scaled to under
 * two thirds; the air as an AREA survives both, and how much of it there is
 * reads without being measured. */
export function JumpArrow({ sign, fill }: { sign: JumpSign; fill: number }) {
  // The ramp, the road under the flight and the landing meet end to end, so
  // the ground goes down as ONE line: three subpaths would put a round cap on
  // each joint and bead the road where it is meant to run on.
  const ground = poly([...sign.ramp, ...sign.gap.slice(1), ...sign.landing.slice(1)]);
  const flight = poly(sign.flight);
  const lit = fillJump(sign, fill);
  return (
    <svg className="hud-pace-arrow hud-pace-lip" viewBox="0 0 100 100" aria-hidden="true">
      <polygon className="hud-pace-airspace" points={points(sign.air)} />
      <g className="hud-pace-road">
        <path d={ground} />
        <path className="hud-pace-air" d={flight} />
      </g>
      {fill > 0 && (
        <g className="hud-pace-fill">
          <path d={poly(sign.ramp)} style={dash(lit.ramp)} />
          <path className="hud-pace-air" d={flight} style={dash(lit.flight)} />
          <path d={poly(sign.landing)} style={dash(lit.landing)} />
        </g>
      )}
    </svg>
  );
}

/** The co-driver's word for each severity. Nothing on the strip is lettered
 * — these are what the plate is LABELLED, for a reader who cannot see it. */
const SEVERITY_WORD: Record<TurnSeverity, string> = {
  soft: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
};

/** ...and for each size of jump. The middle one is unmodified on purpose:
 * half the lips on a stage are ordinary jumps, and a vocabulary that
 * qualifies every one of them has nothing left to say when a big one comes
 * up. The modifier IS the warning. */
const JUMP_WORD: Record<JumpSize, string> = {
  small: "SMALL JUMP",
  medium: "JUMP",
  big: "BIG JUMP",
};

/** THE CALL IN WORDS, for a reader who cannot see the sign — the plate's
 * accessible name, and the only place the vocabulary is spelled out.
 *
 * A jump's ESTIMATED LENGTH is quoted here and nowhere else. The sign draws
 * it — a longer flight is a longer arc over more fallen-away road — and a
 * driver reads that shape a great deal faster than they read a number. The
 * metres are for the reader the shape never reaches. */
function pacenoteText(note: HudPacenote): string {
  if (note.kind === "jump") return `${JUMP_WORD[note.size]}, ${Math.round(note.sign.length)} M`;
  return `${note.long ? "LONG " : ""}${SEVERITY_WORD[note.severity]} ${note.dir.toUpperCase()}`;
}

function PacenoteIcon({ note }: { note: HudPacenote }) {
  if (note.kind === "jump") return <JumpArrow sign={note.sign} fill={note.fill} />;
  return <PacenoteArrow sign={note.sign} fill={note.fill} />;
}

function pacenoteClass(note: HudPacenote): string {
  return note.kind === "jump" ? `hud-pace-jump-${note.size}` : `hud-pace-${note.severity}`;
}

/** The way home, in the co-driver's own slot. Off the road there is no next
 * corner to call — the road itself is the thing that has to be found again —
 * so the strip stops reading the stage and starts reading the way back. The
 * metres are the distance to the exact point the arrow over the car points
 * at, and that the reset key hands you directly. */
export function WayHomeCall({ distance }: { distance: number }) {
  return (
    <div className="hud-pace">
      <div className="hud-pace-call hud-pace-home">
        {/* A warning triangle, drawn in the co-driver strip's own hand —
            chunky rounded strokes, one color — so it reads as the same
            instrument as the corner calls it stands in for. */}
        <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M 50 17 L 89 83 L 11 83 Z" />
          <path d="M 50 41 L 50 60" />
          <circle cx="50" cy="72" r="6" />
        </svg>
        <span className="hud-pace-text">
          RETURN TO TRACK
          <span className="hud-pace-dist">{Math.round(distance)}m</span>
          {/* What the RESET key does, which is not the same as what the
              arrow points at: driving back keeps the road, and the key hands
              it back to the last split board (R28). A driver deciding between
              the two has to be told the price. */}
          <span className="hud-pace-cost">↺ LAST SPLIT</span>
        </span>
      </div>
    </div>
  );
}

/** Turned round and driving back up the stage, in the co-driver's slot. The
 * road is still under the wheels, so there is nothing to find and no
 * distance to quote — the whole call is one instruction and the mark that
 * says it without being read. */
export function TurnAroundCall() {
  return (
    <div className="hud-pace">
      <div className="hud-pace-call hud-pace-turn">
        {/* The U-turn off a road sign: up the near side, over the top, and
            back down the far one under a solid head. Drawn in the strip's
            own hand — one colour, chunky rounded strokes — so it reads as
            the same instrument as the corner calls it stands in for. */}
        <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M 76 86 L 76 42 A 24 24 0 0 0 28 42 L 28 54" />
          <polygon points="6,52 50,52 28,90" />
        </svg>
        <span className="hud-pace-text">TURN AROUND</span>
      </div>
    </div>
  );
}

/** How far out a call is at its faintest, and how close it has to come to
 * be fully lit — SECONDS to the corner, the same clock the strip is timed
 * on. The far end is CALL_LEAD in snapshot.ts, restated here because it is
 * also what the strip DRAWS: the snapshot decides when a sign goes up, and a
 * fade that started anywhere else would have the plate arriving before or
 * after it exists. Change one, change both. The near end is about where the
 * braking is already happening, so the call finishes arriving before it
 * matters. Seconds rather than metres because the fade IS the imminence, and
 * at 200 km/h a hundred metres is not imminent in the way it is at fifty. */
const CALL_FADE_FAR = 2;
const CALL_FADE_NEAR = 0.6;

/** The faintest the call being driven ever goes. Deliberately ABOVE the
 * next-corner plate's 0.5: however far off the corner is, the call that is
 * next is never dimmer than the one queued behind it. */
const CALL_FADE_FLOOR = 0.62;

/** The call's opacity, as a time: far off is faint, about to happen solid. */
function callFade(eta: number): number {
  const near = clamp((CALL_FADE_FAR - eta) / (CALL_FADE_FAR - CALL_FADE_NEAR), 0, 1);
  return CALL_FADE_FLOOR + (1 - CALL_FADE_FLOOR) * near;
}

/** The co-driver strip: the current call big, and — only when the next
 * corner lands inside four seconds of the car — that one small and half
 * transparent underneath, a hard left into an easy right, the way a crew
 * reads a stage. A corner further out than that is not on the strip at all;
 * the snapshot hands it over when the car gets to it.
 *
 * IT IS THE SIGNS ALONE, with no words on them. A sign that is the corner's
 * own shape carries the direction and the severity by BEING that corner, the
 * colour says the severity again, and the plate's point says the direction a
 * third time — so a driver whose eyes are on the road gets the whole call out
 * of the corner of one of them. Lettering it adds nothing a glance already
 * has and asks for the one thing rally pace has no room for, which is
 * reading. The words survive as the plate's label, for a reader who cannot
 * see it.
 *
 * HOW FAR OFF the corner is, is the call's OPACITY rather than a number of
 * metres beside it — and it is read in SECONDS, not metres, because a corner
 * two seconds away asks the same thing of a driver whatever speed those two
 * seconds were bought at. A distance printed on a sign has to be read and
 * then converted into a feeling of imminence; a sign that hardens as the
 * corner comes IS that feeling.
 *
 * ...and HOW FAR THROUGH it the car is, is the sign writing itself in as the
 * bend goes by, for the same reason. There is no bar and no clock: the sign
 * IS the instrument, it fills over exactly the road the note covers, and it
 * comes down the moment there is none of that road left. */
export function Pacenotes({ notes }: { notes: HudPacenote[] }) {
  const now = notes[0];
  const next = notes[1];
  return (
    <div className="hud-pace hud-pace-glyphs">
      <div
        className={`hud-pace-call ${pacenoteClass(now)}${
          now.kind === "turn" ? ` hud-pace-to-${now.dir}` : ""
        }`}
        style={{ opacity: callFade(now.eta) }}
        role="img"
        aria-label={pacenoteText(now)}
      >
        <PacenoteIcon note={now} />
      </div>
      {next && (
        <div
          className={`hud-pace-call hud-pace-next ${pacenoteClass(next)}${
            next.kind === "turn" ? ` hud-pace-to-${next.dir}` : ""
          }`}
          role="img"
          aria-label={pacenoteText(next)}
        >
          <PacenoteIcon note={next} />
        </div>
      )}
    </div>
  );
}
