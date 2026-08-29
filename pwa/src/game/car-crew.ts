// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO IS IN THE CAR. The cabin behind the glass had two identical dummies in
// it: one pale helmet, one accent-coloured one, the same shoulders under
// both. A field of fifteen cars carried the same two people fifteen times.
//
// This is the roster that fixes that — sixteen crews, authored as CARICATURE
// rather than as anatomy. At the range a cabin is actually read at, a person
// is a silhouette and two colours: how wide the shoulders are, how far the
// head sits above them, whether there is hair round it and what colour the
// helmet is. So those are the knobs, exaggerated well past life, because
// half a metre of glass and a tinted pane take most of the difference back
// out again.
//
// Every character is somebody in `engine/sim/rivals.ts`: Granite is built
// like the corner she refuses to rotate for, Skarv has the cormorant's neck,
// Diesel does not fit behind his own wheel. The player gets their own, in the
// app's colours. One spare drives for any start-list slot that is not one of
// the campaign's named crews.
//
// THE MAP READER is deliberately not a caricature: one model, sat in every
// car in the field, holding the road book that is the whole reason a rally
// car has a second seat. What they DO carry is the crew's own gear colours —
// a driver and their co-driver are one team, and the pair of them in matching
// overalls is what says so through the side glass.
//
// Pure data — no three.js import — so Node tooling (scripts/car-preview.mjs)
// and the tests read it the same way they read car-styles.ts. The geometry it
// drives is `pwa/src/game/car/crew.ts`.

/** What is on the head, which is the single most legible thing about a
 * person seen through a car window.
 *
 * `full` is the modern full-face lid: a dome, a chin bar and a visor, and
 * no hair shows at all. `open` is the open-face one, so whatever hair the
 * character has bursts out under it. `cap` is not competition equipment and
 * is not meant to be — it is one old man who has never worn anything else.
 * `bare` is a head, and belongs to the two drivers whose hair IS the
 * caricature. */
export type HelmetStyle = "full" | "open" | "cap" | "bare";

/** The hair, by SHAPE rather than by cut — what is left of a hairstyle at
 * thirty pixels is its outline. Anything under a `full` helmet is hidden, so
 * a character wearing one can carry whatever hair suits their close-up. */
export type HairStyle =
  /** Shaved, or bald. */
  | "none"
  /** A close, tidy cut that follows the skull. */
  | "crop"
  /** A shaggy mop over the ears. */
  | "mop"
  /** Piled high — height first, width second. */
  | "bouffant"
  /** A round cloud, as wide as it is tall. */
  | "afro"
  /** Long, falling past the shoulders on both sides. */
  | "mane"
  /** Short on top, long down the neck. The rally haircut. */
  | "mullet"
  /** Gathered into a knot on top. */
  | "bun"
  /** Bald on top with a puff over each ear. */
  | "tuft";

/** What is on the face. A moustache is two thirds of a caricature and costs
 * one box. */
export type FaceHair = "none" | "moustache" | "beard" | "chops";

/** A crew's colours. The first three are the GEAR — the overalls, the stripe
 * up the sleeves and over the lid, and the helmet shell — and they are the
 * crew's signature: authored to sit beside the paint the car wears
 * (car-livery.ts) without repeating it, because a suit is not bodywork.
 * `skin` and `hair` are the person rather than the team, and travel with the
 * character instead of with the entry. */
export type CrewColors = {
  suit: number;
  trim: number;
  helmet: number;
  skin: number;
  hair: number;
};

/** One person, as a set of multipliers on a standard human sat in a bucket
 * seat. Every one of them is 1 for a middling adult, and the roster spends
 * most of its range: this is a game where the fat driver has to read as the
 * fat one through a tinted window. */
export type CrewCharacter = {
  id: string;
  /** Who this is, for whoever is looking at the contact sheet. */
  name: string;
  /** How high the head sits over the seat — height, and slouch with it. */
  stature: number;
  /** Shoulder width. */
  shoulders: number;
  /** How far round the middle: widens the torso and hangs a belly over the
   * lap that the tall thin ones do not have. */
  girth: number;
  /** Head size, helmet and all. A big head on narrow shoulders is a
   * different person from the same head on wide ones. */
  head: number;
  /** Neck length. Under 1 the head sits on the shoulders. */
  neck: number;
  /** How far forward they lean over the wheel, rad. The attackers hunch
   * into it; the ones who have seen it all sit back. */
  lean: number;
  helmet: HelmetStyle;
  hair: HairStyle;
  face?: FaceHair;
  colors: CrewColors;
};

/** The map reader — one model, every car. Middling everything, because the
 * character in the passenger seat is the DRIVER's: the pair is read as a
 * team, and a co-driver with a silhouette of their own competes with the
 * person whose stage it is. Their colours are handed in per crew. */
const MAP_READER: Omit<CrewCharacter, "colors"> = {
  id: "map-reader",
  name: "Map reader",
  stature: 0.98,
  shoulders: 1,
  girth: 1,
  head: 1,
  neck: 1,
  // Head down over the book, which is where a co-driver's is for the whole
  // stage and the one pose that says what they are doing.
  lean: 0.3,
  helmet: "full",
  hair: "crop",
};

/** The sixteen. Ordered player first, then the campaign's fourteen crews in
 * start order, then the privateer who fills any other slot. */
export const CREW_CHARACTERS: CrewCharacter[] = [
  {
    id: "player",
    name: "You",
    stature: 1,
    shoulders: 1.02,
    girth: 0.98,
    head: 1,
    neck: 1,
    lean: 0.2,
    helmet: "full",
    hair: "crop",
    // The app's own sky blue over its own deep blue: the one crew in the
    // field wearing the colours on the boot screen.
    colors: { suit: 0x1b3560, trim: 0xf6f3ea, helmet: 0x3fa9f5, skin: 0xe0a878, hair: 0x3a2a1e },
  },
  {
    id: "frostbite",
    name: "Elina Roine",
    // Long, narrow and dead upright: nothing about her is slouched and
    // nothing is wasted.
    stature: 1.08,
    shoulders: 0.9,
    girth: 0.84,
    head: 0.96,
    neck: 1.15,
    lean: 0.04,
    helmet: "full",
    hair: "bun",
    colors: { suit: 0x27324a, trim: 0xd8e2ee, helmet: 0xeef3f8, skin: 0xefcbae, hair: 0xd8c9a8 },
  },
  {
    id: "blink",
    name: "Aron Tahti",
    // Wiry, folded over the wheel, and a mop of hair out of an open lid —
    // the one crew in the field who is not looking where he is going.
    stature: 0.96,
    shoulders: 0.92,
    girth: 0.86,
    head: 1.02,
    neck: 0.9,
    lean: 0.42,
    helmet: "open",
    hair: "mop",
    colors: { suit: 0x24406e, trim: 0xe23c78, helmet: 0x2f6bd4, skin: 0xd9a074, hair: 0x2a2018 },
  },
  {
    id: "scrapper",
    name: "Kaisa Ahonen",
    // Short and square, elbows out, sat too close to everything.
    stature: 0.9,
    shoulders: 1.2,
    girth: 1.06,
    head: 1,
    neck: 0.75,
    lean: 0.34,
    helmet: "full",
    hair: "crop",
    colors: { suit: 0x2a2e34, trim: 0xd4581c, helmet: 0xe86a1e, skin: 0xc98a5e, hair: 0x1d1712 },
  },
  {
    id: "metronome",
    name: "Otto Lindqvist",
    // Ramrod and thin, in the tidiest gear in the paddock: he has never once
    // been surprised and he does not intend to start.
    stature: 1.06,
    shoulders: 0.94,
    girth: 0.88,
    head: 0.98,
    neck: 1.1,
    lean: 0.06,
    helmet: "open",
    hair: "crop",
    colors: { suit: 0xdad9d2, trim: 0xc4211d, helmet: 0xf2efe6, skin: 0xe8bd97, hair: 0x585148 },
  },
  {
    id: "skarv",
    name: "Halvard Sund",
    // The cormorant: a small head a very long way up a very long neck,
    // looking further ahead than anybody.
    stature: 1.14,
    shoulders: 0.88,
    girth: 0.82,
    head: 0.88,
    neck: 1.7,
    lean: 0.1,
    helmet: "full",
    hair: "crop",
    colors: { suit: 0x123f47, trim: 0xe8663c, helmet: 0x1a8e99, skin: 0xd6a279, hair: 0x241c16 },
  },
  {
    id: "sanna",
    name: "Sanna Hult",
    // Bleached bouffant, no helmet at all, leaning into a slide she has
    // been in since the first junction. The recklessness is the silhouette.
    stature: 0.98,
    shoulders: 0.96,
    girth: 0.9,
    head: 1,
    neck: 1,
    lean: 0.4,
    helmet: "bare",
    hair: "bouffant",
    colors: { suit: 0x50205a, trim: 0xb8e02c, helmet: 0x8c2f8f, skin: 0xe9c2a2, hair: 0xf0e2a8 },
  },
  {
    id: "granite",
    name: "Pirjo Laine",
    // Enormous across, no neck whatsoever, and about as likely to rotate as
    // the corner she is braking for.
    stature: 0.96,
    shoulders: 1.32,
    girth: 1.18,
    head: 1.04,
    neck: 0.45,
    lean: 0.14,
    helmet: "full",
    hair: "none",
    colors: { suit: 0x3a3f46, trim: 0xdd6412, helmet: 0xb2b8c0, skin: 0xc08858, hair: 0x30271f },
  },
  {
    id: "anvil",
    name: "Yrjo Palo",
    // The biggest crew in the field in every direction, in a lid that only
    // just went on.
    stature: 1.02,
    shoulders: 1.3,
    girth: 1.34,
    head: 1.14,
    neck: 0.6,
    lean: 0.24,
    // An open lid, because the mutton chops are the point of him and a
    // full-face one draws over every last one of them.
    helmet: "open",
    hair: "none",
    face: "chops",
    colors: { suit: 0x1b2f5e, trim: 0xe8dc3c, helmet: 0x1b3f8f, skin: 0xd39b6c, hair: 0x51371f },
  },
  {
    id: "kettle",
    name: "Liina Marttinen",
    // Short, round, and ginger out of both sides of an open helmet. One
    // degree off boiling, and it shows in the face.
    stature: 0.86,
    shoulders: 1.06,
    girth: 1.22,
    head: 1.06,
    neck: 0.6,
    lean: 0.3,
    helmet: "open",
    hair: "tuft",
    colors: { suit: 0x21356b, trim: 0xe8b820, helmet: 0xe8b820, skin: 0xefb490, hair: 0xd4691a },
  },
  {
    id: "diesel",
    name: "Mika Kervinen",
    // Does not fit behind his own wheel, and the moustache arrives at the
    // corner before he does.
    stature: 0.94,
    shoulders: 1.16,
    girth: 1.42,
    head: 1.06,
    neck: 0.5,
    lean: 0.12,
    helmet: "open",
    hair: "mullet",
    face: "moustache",
    colors: { suit: 0x3d4658, trim: 0xd44b2a, helmet: 0xe0c14a, skin: 0xcf9364, hair: 0x2e2118 },
  },
  {
    id: "oldsnow",
    name: "Vidar Fjell",
    // Stooped, white-bearded, and wearing a flat cap in a competition car
    // because he has worn one in every car he has ever driven.
    stature: 0.88,
    shoulders: 1.02,
    girth: 1.04,
    head: 1,
    neck: 0.7,
    lean: 0.16,
    helmet: "cap",
    hair: "mane",
    face: "beard",
    colors: { suit: 0x6b1a2b, trim: 0xd2a13c, helmet: 0x6d5b43, skin: 0xe0b48e, hair: 0xe8e4dc },
  },
  {
    id: "birch",
    name: "Tor Backlund",
    // Spindly, folded into a car two sizes small for him, and perfectly
    // tidy about it.
    stature: 1.2,
    shoulders: 0.84,
    girth: 0.76,
    head: 0.92,
    neck: 1.3,
    lean: 0.1,
    helmet: "full",
    hair: "crop",
    colors: { suit: 0xd6cfb8, trim: 0x7a4420, helmet: 0xe8e2d0, skin: 0xecc2a0, hair: 0xa8895c },
  },
  {
    id: "moth",
    name: "Nea Virtala",
    // Small, with an enormous cloud of hair out of an open lid — most of
    // what you see of her is the hair, and most of her stage is the scenery.
    stature: 0.88,
    shoulders: 0.86,
    girth: 0.86,
    head: 0.94,
    neck: 0.95,
    lean: 0.26,
    helmet: "open",
    hair: "afro",
    colors: { suit: 0x1d4a37, trim: 0xa8d030, helmet: 0x2d6b4c, skin: 0xa86b45, hair: 0x1a1410 },
  },
  {
    id: "sprat",
    name: "Rasmus Oberg",
    // The tail of the field: middling everything, in the plainest gear
    // anybody has ever bought. The line the rest are measured against.
    stature: 0.94,
    shoulders: 0.98,
    girth: 1,
    head: 1,
    neck: 0.95,
    lean: 0.2,
    helmet: "full",
    hair: "crop",
    colors: { suit: 0x4a4f57, trim: 0xf2efe6, helmet: 0xd8dce2, skin: 0xdfae82, hair: 0x4a3826 },
  },
  {
    id: "privateer",
    name: "Club privateer",
    // Whoever turns up in a slot the campaign never named: a mullet, a
    // borrowed lid and last year's overalls.
    stature: 1,
    shoulders: 1.06,
    girth: 1.08,
    head: 1,
    neck: 0.9,
    lean: 0.22,
    helmet: "open",
    hair: "mullet",
    face: "moustache",
    colors: { suit: 0x5a6270, trim: 0xd8b23a, helmet: 0xc9ced5, skin: 0xd9a074, hair: 0x6b4a2a },
  },
];

const BY_ID = new Map(CREW_CHARACTERS.map((c) => [c.id, c]));

/** The crew sat in one car: who is driving, who is reading, and the colours
 * they are both wearing. The map reader is handed the driver's own gear —
 * the two of them are one team, and that is the only thing about a passenger
 * seat that can be read at speed. */
export type CrewLook = {
  driver: CrewCharacter;
  coDriver: CrewCharacter;
};

function look(character: CrewCharacter): CrewLook {
  return { driver: character, coDriver: { ...MAP_READER, colors: character.colors } };
}

/** The character a named campaign crew drives as. Total: a crew with no
 * character authored for it gets the privateer rather than an empty seat. */
export function crewLookFor(crewId: string): CrewLook {
  return look(BY_ID.get(crewId) ?? BY_ID.get("privateer")!);
}

/** The player's own crew. */
export function playerCrewLook(): CrewLook {
  return look(BY_ID.get("player")!);
}

/** Every character the roster carries an id for — what the crew contact
 * sheet renders, and what the test holds against `RIVALS`. */
export const CREW_IDS = CREW_CHARACTERS.map((c) => c.id);
