// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROLL OF CAR PORTRAITS — every crew's car, shot once and kept.
//
// The result sheet shows a picture of each car beside its crew, and a
// picture is the one thing a results card must not build while the player
// is looking at it: the catalog builder is real geometry, a field is fifteen
// of them, and fifteen bodies built on the frame the card comes up on is a
// card that comes up late. So the pictures are taken AHEAD of the card —
// the field is warmed the moment it is entered, one car per idle slot,
// under the establishing shot and the first corners of the stage, where
// nothing on screen is waiting on them — and the card only ever reads what
// is already on the roll. A car that was somehow never shot is shot on the
// same terms when it is asked for, and the row it belongs to fills in when
// the picture lands.
//
// The roll is keyed by what a portrait IS — the car, and the paint scheme
// its crew wears (car-livery.ts reads that off the crew and the door
// number) — so Frostbite's coupe is one picture for the whole campaign, and
// a re-run stage costs nothing. The stand that takes the pictures
// (car-portrait.ts) owns three.js and is loaded when the first is due; it is
// torn down again once the queue is empty, so it holds a WebGL context only
// while it has something to shoot.

import { carById } from "@engine";

import { liveryForCrew } from "./car-livery.ts";
import type { PortraitStand } from "./car-portrait.ts";

/** What a portrait is of. `you` is the player's own car in its own colours
 * — the paint the catalog gives it, not a scheme off the field. */
export type PortraitSubject = {
  carId: string;
  crewId: string;
  number: number;
  you: boolean;
};

/** One line of the roll per subject. */
export function portraitKey(subject: PortraitSubject): string {
  return subject.you
    ? `you:${subject.carId}`
    : `${subject.crewId}:${subject.number}:${subject.carId}`;
}

/** The pictures, as data URLs, by key. */
const roll = new Map<string, string>();

/** What is waiting to be shot, in the order it was asked for. Keys rather
 * than subjects on the queue so a subject asked for twice is shot once. */
const queue: PortraitSubject[] = [];
const queued = new Set<string>();

/** Who wants to know when a picture lands. */
const listeners = new Set<() => void>();

let stand: PortraitStand | null = null;
let loading: Promise<void> | null = null;
let pending = false;

/** The picture of `subject`, or null while it is still on the queue. Asking
 * is also ordering: a subject not on the roll is queued, so a sheet that
 * reads its rows warms whatever the field did not. */
export function portraitOf(subject: PortraitSubject): string | null {
  const key = portraitKey(subject);
  const shot = roll.get(key);
  if (shot !== undefined) return shot;
  warmPortraits([subject]);
  return null;
}

/** Order pictures of every subject not already on the roll. */
export function warmPortraits(subjects: readonly PortraitSubject[]): void {
  for (const subject of subjects) {
    const key = portraitKey(subject);
    if (roll.has(key) || queued.has(key)) continue;
    queued.add(key);
    queue.push(subject);
  }
  if (queue.length > 0) schedule();
}

/** Be told each time a picture lands. Returns the way to stop. */
export function onPortraits(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One shot per slack in the frame. An idle callback where the browser has
 * one, so a stage being driven never gives a frame up to a picture; with a
 * timeout, so a machine that never goes idle still gets its pictures before
 * the card needs them. */
function schedule(): void {
  if (pending) return;
  pending = true;
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => void shootNext(), { timeout: 800 });
  } else {
    setTimeout(() => void shootNext(), 40);
  }
}

async function shootNext(): Promise<void> {
  pending = false;
  const subject = queue.shift();
  if (!subject) {
    // Nothing left: the stand and its context go, and come back the next
    // time a field is entered.
    stand?.dispose();
    stand = null;
    return;
  }
  const key = portraitKey(subject);
  if (!stand) {
    loading ??= import("./car-portrait.ts").then(({ createPortraitStand }) => {
      stand = createPortraitStand();
    });
    try {
      await loading;
    } catch {
      // No stand — the chunk did not arrive, or the device has no context
      // to spare. The sheet reads perfectly well without its pictures, so
      // the queue is simply left where it is rather than retried in a loop.
      loading = null;
      return;
    }
    loading = null;
  }
  if (stand) {
    const spec = carById(subject.carId);
    const paint = subject.you ? undefined : liveryForCrew(subject.crewId, subject.number);
    roll.set(key, stand.shoot(spec, paint));
  }
  queued.delete(key);
  for (const listener of listeners) listener();
  // The next one, on the next slack — never back to back, which would be
  // the fifteen-body frame this whole module exists to avoid.
  schedule();
}
