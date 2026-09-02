// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE EAR IS — what each camera on the ladder does to the mix.
//
// The picture moves from the bumper to a helicopter and the sound has to
// move with it, or the chase camera is a cockpit with the roof off. Every
// number here is a multiplier on one part of the mix, read by the beds
// every frame and by the event router for the one-shots, and the whole
// table is the opinion about what a rally car sounds like from each seat:
//
//   * INSIDE the car the engine is the biggest thing in the world and it is
//     DARK — the cabin is a box that lets the bass in and keeps the exhaust
//     out. The tyres are felt through the floor more than heard, the wind
//     is a whisper at the seals, and the rain is ON THE SCREEN, an inch from
//     the ear, so it is the loudest it ever is.
//   * BEHIND the car the exhaust is what you hear of the engine, the tyres
//     are the surface being thrown at you, and the wind is the camera's own.
//   * HIGH ABOVE it the car is a small thing in a big country: the engine
//     is thin, the wind is gone, and the world — the birds, the trees, the
//     weather — is most of what there is.
//
// DOM-free, three-free, so the tests can read it and the audition page can
// switch seats without a renderer.

import type { PlayCamera } from "../settings.ts";

export type Listener = {
  /** The engine's own note: the hum, its octave and the bass under it. */
  engine: number;
  /** The exhaust and intake edge — the layer that is heard OUTSIDE. */
  exhaust: number;
  /** How bright the engine is, 0..1: the hum's lowpass is scaled by it. A
   * cabin is a lowpass. */
  tone: number;
  /** The rolling bed — the surface under the wheels. */
  tyres: number;
  /** The drift's scrub, the tarmac squeal, the wheelspin. */
  scrub: number;
  /** The car's own wind. */
  wind: number;
  /** The rain and the gale. */
  weather: number;
  /** The world — birds, insects, trees, the crowd, a train. */
  world: number;
  /** The wipers — only audible from inside the glass, and loudest with a
   * head behind the wheel. */
  wipers: number;
  /** Every one-shot the stage makes. */
  events: number;
  /** A pitch multiplier on those one-shots. Below 1 moves every filter
   * down with it: an impact heard through a cabin is a duller impact. */
  muffle: number;
};

export const LISTENERS: Record<PlayCamera, Listener> = {
  bumper: {
    engine: 0.8,
    exhaust: 0.7,
    tone: 0.9,
    tyres: 1.35,
    scrub: 1.2,
    wind: 1.3,
    weather: 1.1,
    world: 0.9,
    wipers: 0.35,
    events: 1.05,
    muffle: 1,
  },
  hood: {
    engine: 1,
    exhaust: 0.8,
    tone: 0.85,
    tyres: 1,
    scrub: 1,
    wind: 1,
    weather: 1.1,
    world: 0.85,
    wipers: 0.7,
    events: 1,
    muffle: 1,
  },
  cockpit: {
    engine: 1.15,
    exhaust: 0.55,
    tone: 0.45,
    tyres: 0.7,
    scrub: 0.75,
    wind: 0.5,
    weather: 1.3,
    world: 0.5,
    wipers: 1,
    events: 0.95,
    muffle: 0.88,
  },
  close: {
    engine: 0.95,
    exhaust: 1.1,
    tone: 1,
    tyres: 1.15,
    scrub: 1.15,
    wind: 1.1,
    weather: 1,
    world: 1,
    wipers: 0,
    events: 1,
    muffle: 1,
  },
  chase: {
    engine: 0.9,
    exhaust: 1.2,
    tone: 1,
    tyres: 1.05,
    scrub: 1.1,
    wind: 0.9,
    weather: 1,
    world: 1.05,
    wipers: 0,
    events: 1,
    muffle: 1,
  },
  far: {
    engine: 0.75,
    exhaust: 1.1,
    tone: 0.9,
    tyres: 1,
    scrub: 1.1,
    wind: 0.6,
    weather: 0.95,
    world: 1.2,
    wipers: 0,
    events: 0.9,
    muffle: 0.95,
  },
  heli: {
    engine: 0.6,
    exhaust: 0.9,
    tone: 0.75,
    tyres: 0.8,
    scrub: 1,
    wind: 0.35,
    weather: 0.9,
    world: 1.3,
    wipers: 0,
    events: 0.8,
    muffle: 0.9,
  },
  top: {
    engine: 0.65,
    exhaust: 0.9,
    tone: 0.8,
    tyres: 0.85,
    scrub: 1,
    wind: 0.4,
    weather: 0.9,
    world: 1.25,
    wipers: 0,
    events: 0.85,
    muffle: 0.9,
  },
};

/** The mix for a camera, or the chase view's for anything that is not on
 * the ladder (the menu's drone, the map). */
export function listenerFor(view: string | null | undefined): Listener {
  return (view && (LISTENERS as Record<string, Listener>)[view]) || LISTENERS.chase;
}
