// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR, AS A SCHEMATIC — how it is feeling, in one glance under the map.
//
// The rest of the damage model is SAID: a line goes up in the middle of the
// screen the moment a part crosses a line, and then it ages out and the
// driver is on their own again. That is the right way to break news and the
// wrong way to hold a state, because the question a driver asks on the way
// into the next corner is not "what just happened" but "what have I got
// left" — and nothing on the screen answered it.
//
// So: a plan of the car, drawn as flat as it can be drawn and still be a
// car. It is deliberately NOT the rendered body — a little photograph of a
// hatchback at this size is a grey smudge, and the one thing this instrument
// has to do is be read out of the corner of an eye at 140 km/h. Blocks with
// gaps between them, four colours, no words.
//
// GREEN is well, YELLOW is damaged, ORANGE is very damaged, RED is broken —
// and those four are the ledger's own lines, not a separate opinion about
// them (car-health.ts). Under the car, one icon per piece of machinery with
// something wrong with it, in the same four colours and with no caption:
// the bonnet is one block because there is no drawing that would fit the
// radiator, the gearbox and the rack inside it, so they are said again
// underneath instead.

import type { JSX } from "preact";

import type { InternalSystem } from "@engine";

import type { CarHealth, HealthPanel, HealthTier } from "./car-health.ts";

/** THE PLAN, in a 64 x 108 box with the nose UP. Everything is a block: the
 * four panels down the body, four wheels standing off its flanks, and a
 * lamp pair at each end. The gaps between them are what make it read as an
 * exploded diagram rather than as one car-shaped blob, so they are wide —
 * about two units, which is still a visible line when the whole box is
 * forty pixels tall on a phone. */
const PANEL_SHAPES: Record<HealthPanel, string> = {
  nose: "18,11 46,11 50,32 14,32",
  screen: "14,34 50,34 51,47 13,47",
  cabin: "13,49 51,49 51,77 13,77",
  tail: "13,79 51,79 48,97 16,97",
};

/** The four wheels in SCREEN order (front-left, front-right, rear-left,
 * rear-right as the player sees them — car-health.ts owns the flip), as
 * [x, y] of each block's top-left corner. */
const WHEEL_AT: [number, number][] = [
  [2, 21],
  [53, 21],
  [2, 64],
  [53, 64],
];

/** ...and the lamps, same order: a pair across the nose, a pair across the
 * tail. They are the one part of the car that is only ever green or red —
 * a headlamp is bolted on or it is glass on the road behind you. */
const LAMP_AT: [number, number][] = [
  [17, 3],
  [36, 3],
  [17, 99],
  [36, 99],
];

/** The class that colours one piece. One name per tier, so the whole
 * language of the instrument is four rules in the stylesheet. */
function tierClass(tier: HealthTier): string {
  return `hud-hp-${tier}`;
}

export function CarHealthPanel({ health }: { health: CarHealth }): JSX.Element {
  return (
    <div className={`hud-health ${tierClass(health.worst)}`}>
      <svg
        className="hud-health-car"
        viewBox="0 0 64 108"
        role="img"
        aria-label={`Car condition: ${WORST_LABEL[health.worst]}`}
      >
        {/* The shadow the blocks stand on. It is the outline of the whole
            car rather than of any one panel, which is what keeps a car
            missing its bonnet reading as a car with a hole in it. */}
        <rect className="hud-health-plate" x="11.5" y="9.5" width="41" height="89" rx="7" />
        {LAMP_AT.map(([x, y], i) => (
          <rect
            key={`lamp${i}`}
            className={`hud-health-lamp ${tierClass(health.lamps[i])}`}
            x={x}
            y={y}
            width="11"
            height="6"
            rx="2"
          />
        ))}
        {WHEEL_AT.map(([x, y], i) => (
          <rect
            key={`wheel${i}`}
            className={`hud-health-wheel ${tierClass(health.wheels[i])}`}
            x={x}
            y={y}
            width="9"
            height="20"
            rx="3"
          />
        ))}
        {(Object.keys(PANEL_SHAPES) as HealthPanel[]).map((panel) => (
          <polygon
            key={panel}
            className={`hud-health-panel ${tierClass(health.panels[panel])}`}
            points={PANEL_SHAPES[panel]}
          />
        ))}
      </svg>
      {/* WHAT IS WRONG UNDER THE PANELS, and only what is: a sound car draws
          an empty row, so the row filling up is itself the news. No words —
          the middle of the screen already said them once, in the sentence
          this is the standing reminder of. */}
      <div className="hud-health-systems">
        {health.systems.map(({ system, tier }) => (
          <span
            key={system}
            className={`hud-health-icon ${tierClass(tier)}`}
            title={`${SYSTEM_LABEL[system]}: ${WORST_LABEL[tier]}`}
          >
            <SystemMark system={system} />
          </span>
        ))}
      </div>
    </div>
  );
}

const WORST_LABEL: Record<HealthTier, string> = {
  ok: "good",
  hurt: "damaged",
  spent: "badly damaged",
  dead: "broken",
};

const SYSTEM_LABEL: Record<InternalSystem, string> = {
  engine: "Engine",
  cooling: "Radiator",
  suspension: "Suspension",
  gearbox: "Gearbox",
  steering: "Steering",
  brakes: "Brakes",
};

/** ONE MARK PER SYSTEM, in a 24x24 box stroked in `currentColor` — the same
 * hand as the menu's glyphs (menu-glyphs.tsx) and for the same reasons: an
 * emoji is a different picture in every shell and an icon font is a download
 * that can fail. They live here rather than on that roster because these are
 * never in a menu: they are read at speed, over a road, at about ten pixels
 * tall, which is a different drawing problem and a heavier line. */
function SystemMark({ system }: { system: InternalSystem }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4">
      {SYSTEM_MARKS[system]}
    </svg>
  );
}

const SYSTEM_MARKS: Record<InternalSystem, JSX.Element> = {
  // The block, its cam cover and the bellhousing off the back of it.
  engine: (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 11h11v8h-11z" />
      <path d="M7 11V7.5h4.5V11" />
      <path d="M14.5 13h4v6" />
    </g>
  ),
  // The radiator, said as its core: a matrix with its tubes showing.
  cooling: (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16v13H4z" />
      <path d="M9 8.5v7M15 8.5v7" />
    </g>
  ),
  // A coil between its plates.
  suspension: (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 4h11M6.5 20h11" />
      <path d="M8 7l8 2.5-8 2.5 8 2.5-8 2.5" />
    </g>
  ),
  // The gate, with the lever standing in it.
  gearbox: (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8v10M12 8v10M18 8v10M6 8h12" />
      <circle cx="12" cy="5.5" r="2.2" />
    </g>
  ),
  // The wheel the driver is holding, and its hub.
  steering: (
    <g strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M4 12h5.6M14.4 12H20M12 14.4V20" />
    </g>
  ),
  // The disc, and the caliper over it.
  brakes: (
    <g strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10.5" cy="12" r="7" />
      <circle cx="10.5" cy="12" r="2.2" />
      <path d="M17 8.5h3.5v7H17" />
    </g>
  ),
};
