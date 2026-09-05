// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CO-DRIVER'S STRIP — the calls across the top of the frame: the corner
// coming up, the corner behind it, and the two things that take the slot over
// when there is no corner to call because the car is not on the stage any
// more (lost in a field, or turned round on the road).
//
// IT CARRIES NO WORDS. A call is a SIGN: the corner's own shape drawn off the
// stage, on a plate coloured by how much the bend is going to ask and cut to a
// point on the side it turns toward, fading up as the corner comes. All three
// of those are read out of the corner of an eye that never leaves the road,
// which is the only way a call is ever read at rally pace — lettering it adds
// nothing a glance already has and asks for the one thing there is no room
// for. The words survive as each plate's LABEL, for a reader who cannot see
// it. The two calls that are instructions rather than corners keep theirs on
// screen, because a sentence has no shape to be drawn as.
//
// WHERE the strip hangs is not its own to decide: `--pace-top` in styles.css
// stacks it under the mirror and under the split's band, off one number the
// HUD's root writes out (see `data-glass` in hud.tsx).

import type { JumpSize, TurnSeverity } from "@engine";

import type { PaceSign } from "./pace-shape.ts";
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
      /** Meters from the car to the turn entry (0 while inside the turn). */
      distance: number;
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
      /** Meters from the car to the takeoff lip. */
      distance: number;
    };

/** The pacenote sign: the corner's own shape, drawn like a rally note board.
 * The line is the road — the approach at the bottom, the bend the way the
 * bend goes — with a heavy head on the exit. pace-shape.ts has squared both
 * up and fitted them to this 100x100 box, so all that is left here is the
 * hand they are drawn in: one chunky rounded stroke in the severity's
 * colour, and the head filled in the same. */
export function PacenoteArrow({ sign }: { sign: PaceSign }) {
  return (
    <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
      <path
        d={`M ${sign.line.map((p) => p.join(" ")).join(" L ")}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={sign.head.map((p) => p.join(",")).join(" ")} fill="currentColor" />
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
 * accessible name, and the only place the vocabulary is spelled out. */
function pacenoteText(note: HudPacenote): string {
  if (note.kind === "jump") return JUMP_WORD[note.size];
  return `${note.long ? "LONG " : ""}${SEVERITY_WORD[note.severity]} ${note.dir.toUpperCase()}`;
}

/** How high the ramp throws the arrow in the icon's 100x100 box, per size.
 * The road under it stays at 72 and the arrow always leaves at the same x,
 * so a bigger jump is drawn as a STEEPER ramp. The shape is the whole call —
 * there is no word beside it — and it is read at a glance from the corner of
 * an eye that is on the road. */
const JUMP_LAUNCH: Record<JumpSize, number> = { small: 52, medium: 35, big: 20 };

function PacenoteIcon({ note }: { note: HudPacenote }) {
  if (note.kind === "jump") {
    const top = JUMP_LAUNCH[note.size];
    return (
      <svg className="hud-pace-arrow" viewBox="0 0 100 100" aria-hidden="true">
        <path
          d={`M 15 72 L 39 72 L 55 ${top} L 77 ${top}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points={`76,${top - 18} 96,${top} 76,${top + 18}`} fill="currentColor" />
      </svg>
    );
  }
  return <PacenoteArrow sign={note.sign} />;
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
          <path
            d="M 50 17 L 89 83 L 11 83 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="11"
            strokeLinejoin="round"
          />
          <path d="M 50 41 L 50 60" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <circle cx="50" cy="72" r="6" fill="currentColor" />
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
          <path
            d="M 76 86 L 76 42 A 24 24 0 0 0 28 42 L 28 54"
            fill="none"
            stroke="currentColor"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon points="6,52 50,52 28,90" fill="currentColor" />
        </svg>
        <span className="hud-pace-text">TURN AROUND</span>
      </div>
    </div>
  );
}

/** How far out a call is at its faintest, and how close it has to come to
 * be fully lit, meters. The far end is the co-driver's own lead at speed
 * (CALL_LEAD_MAX in snapshot.ts); the near end is about where the braking is
 * already happening, so the call finishes arriving before it matters. */
const CALL_FADE_FAR = 150;
const CALL_FADE_NEAR = 30;

/** The faintest the call being driven ever goes. Deliberately ABOVE the
 * next-corner plate's 0.5: however far off the corner is, the call that is
 * next is never dimmer than the one queued behind it. */
const CALL_FADE_FLOOR = 0.62;

/** The call's opacity, as a distance: far is faint, near is solid. */
function callFade(distance: number): number {
  const near = clamp((CALL_FADE_FAR - distance) / (CALL_FADE_FAR - CALL_FADE_NEAR), 0, 1);
  return CALL_FADE_FLOOR + (1 - CALL_FADE_FLOOR) * near;
}

/** The co-driver strip: the current call big, and — only when the next
 * corner lands inside the same lead — that one small and half transparent
 * underneath, a hard left into an easy right, the way a crew reads a stage.
 * A corner further out than that is not on the strip at all; the snapshot
 * hands it over when the car gets to it.
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
 * metres beside it. A distance printed on a sign has to be read and then
 * converted into a feeling of imminence; a sign that hardens as the corner
 * comes IS that feeling. */
export function Pacenotes({ notes }: { notes: HudPacenote[] }) {
  const now = notes[0];
  const next = notes[1];
  return (
    <div className="hud-pace hud-pace-glyphs">
      <div
        className={`hud-pace-call ${pacenoteClass(now)}${
          now.kind === "turn" ? ` hud-pace-to-${now.dir}` : ""
        }`}
        style={{ opacity: callFade(now.distance) }}
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
