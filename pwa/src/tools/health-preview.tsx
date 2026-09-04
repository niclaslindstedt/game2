// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CONDITION LAB — the car's health schematic in every state it can
// reach, at the size it is actually read at, over the colours it is
// actually read over.
//
// This instrument cannot be judged from the game, and that is the whole
// case for the page. To see the schematic amber you have to crash the car
// amber, which takes a stage, a corner and some luck; to see all four
// colours side by side you would have to crash it four times and remember
// what the last one looked like. Here every state is one cell, and the
// question that matters — can a driver tell these apart out of the corner
// of an eye at 140 km/h — is finally a question you can just look at.
//
// It renders the real component off real `CarDamage` ledgers, so a weight
// changed in car-health.ts moves this sheet and a colour changed in
// styles.css moves it too. THE STRIP AT THE BOTTOM is where the judging
// actually happens: the same states at the size a phone draws them, over
// gravel, tarmac, grass and a night sky — because a green that reads
// beautifully on this plate and vanishes over a sunlit gravel road is a
// green that has failed.

import { render } from "preact";
import { INTERNAL_SYSTEMS, TUNING, type CarDamage, type InternalSystem } from "@engine";

// The app's own stylesheet — the instrument is half CSS (the four tier
// rules, the sizes, the drop shadows), so a page that restated any of it
// would be judging a drawing the game does not draw.
import "../styles.css";
import { carHealth } from "../game/car-health.ts";
import { CarHealthPanel } from "../game/hud-health.tsx";

const CALL = TUNING.collision.callAt;
const FLAT = TUNING.collision.chassis.wheelFlat;
const ZONE = TUNING.collision.zoneMax;

/** A sound ledger, the shape a run starts with. */
function sound(): CarDamage {
  const systems = {} as Record<InternalSystem, number>;
  for (const system of INTERNAL_SYSTEMS) systems[system] = 0;
  return {
    zones: [0, 0, 0, 0, 0, 0, 0, 0],
    belly: 0,
    roof: 0,
    wear: 0,
    systems,
    wheels: [0, 0, 0, 0],
    broken: [],
    version: 0,
  };
}

function make(edit: (d: CarDamage) => void): CarDamage {
  const damage = sound();
  edit(damage);
  return damage;
}

/** THE STATES WORTH LOOKING AT. Each is a stage of a run that really
 * happens, in the order a bad run reaches them — a clean car, a clipped
 * verge, a tree taken on the nose, a landing dropped flat, a roll, and the
 * one at the end that is a run over where it stops. */
const CASES: { name: string; note: string; damage: CarDamage }[] = [
  { name: "sound", note: "off the line", damage: sound() },
  {
    name: "brushed",
    note: "clipped a marker post",
    damage: make((d) => {
      d.zones[1] = ZONE * 0.3;
      d.wear = 0.12;
      d.broken.push("mirrorR");
    }),
  },
  {
    name: "nose in",
    note: "a tree, square on",
    damage: make((d) => {
      d.zones[0] = ZONE;
      d.systems.engine = CALL.hurt + 0.1;
      d.systems.cooling = CALL.spent;
      d.broken.push("lampFL", "lampFR", "bumperF", "hood");
      d.wear = 0.4;
    }),
  },
  {
    name: "puncture",
    note: "a rock, front right on screen",
    damage: make((d) => {
      d.wheels[0] = FLAT + 0.1;
      d.zones[1] = ZONE * 0.5;
      d.wear = 0.2;
    }),
  },
  {
    name: "landed flat",
    note: "a jump taken too fast",
    damage: make((d) => {
      d.belly = ZONE * 0.8;
      d.systems.suspension = CALL.spent;
      d.systems.brakes = CALL.hurt;
      d.wear = 0.45;
    }),
  },
  {
    name: "rolled",
    note: "over, and back on its wheels",
    damage: make((d) => {
      d.roof = ZONE;
      d.zones[2] = ZONE * 0.9;
      d.zones[6] = ZONE * 0.7;
      d.wear = 0.8;
      d.systems.steering = CALL.spent;
      d.systems.gearbox = CALL.hurt;
      d.systems.suspension = CALL.hurt;
      d.systems.brakes = CALL.hurt;
      d.broken.push("glassF", "glassL", "doorL", "spoiler", "lampRL");
      d.wheels[3] = FLAT + 0.3;
    }),
  },
  {
    // FIVE marks, which is the row split's other shape: 3 over 2.
    name: "hanging on",
    note: "everything but the motor",
    damage: make((d) => {
      d.zones[0] = ZONE * 0.7;
      d.zones[5] = ZONE * 0.6;
      d.belly = ZONE * 0.6;
      d.wear = 0.7;
      d.systems.cooling = CALL.dead;
      d.systems.suspension = CALL.spent;
      d.systems.gearbox = CALL.spent;
      d.systems.brakes = CALL.hurt;
      d.systems.steering = CALL.hurt;
      d.broken.push("bumperF", "glassR", "lampFR");
      d.wheels[2] = FLAT + 0.2;
    }),
  },
  {
    name: "wreck",
    note: "the run is over where it stops",
    damage: make((d) => {
      d.zones = d.zones.map(() => ZONE);
      d.roof = ZONE;
      d.belly = ZONE;
      d.wear = 1;
      for (const system of INTERNAL_SYSTEMS) d.systems[system] = 1;
      d.wheels = [1, FLAT + 0.4, 1, FLAT + 0.2];
      d.broken.push(
        "hood",
        "hatch",
        "glassF",
        "glassB",
        "doorL",
        "doorR",
        "bumperF",
        "bumperR",
        "lampFL",
        "lampFR",
        "lampRL",
        "lampRR",
        "spoiler",
      );
    }),
  },
];

/** THE GROUNDS the strip is read over — the four the game actually puts
 * under this corner of the screen. */
const GROUNDS: { name: string; fill: string }[] = [
  { name: "gravel", fill: "#8a7f6b" },
  { name: "tarmac", fill: "#3b3d42" },
  { name: "grass", fill: "#5c7a3f" },
  { name: "night", fill: "#141d33" },
];

function Sheet() {
  return (
    <>
      <style>{`
        /* The app stylesheet pins the page to the shell's own height and
           stops it scrolling — right for a game that fills the window, and
           the reason a sheet taller than the window used to photograph as
           its first screenful and nothing else. */
        html, body { height: auto; overflow: visible; }
        body { margin: 0; padding: 18px; background: #0d1c38; color: #fff;
               font: 600 11px/1.2 system-ui, sans-serif; }
        h2 { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
             opacity: 0.7; margin: 22px 0 10px; font-weight: 700; }
        .grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 12px; }
        .cell { background: rgb(18 48 105 / 70%); border: 2px solid rgb(255 255 255 / 30%);
                border-radius: 10px; padding: 10px 6px 8px; display: flex;
                flex-direction: column; align-items: center; gap: 8px; }
        /* The instrument is placed absolutely off the top-right corner in the
           game, so each cell stands its own HUD-sized box for it to sit in —
           the same --hud-map the real layout spends. */
        .stand { position: relative; width: 120px; height: 150px; }
        .stand .hud-health { top: 0; right: 0; }
        .name { letter-spacing: 0.12em; text-transform: uppercase; }
        .note { opacity: 0.55; font-weight: 500; font-style: italic; text-align: center; }
        .strip { display: flex; gap: 0; border-radius: 10px; overflow: hidden; }
        .patch { position: relative; flex: 1; height: 110px; }
        .patch .hud { position: absolute; inset: 0; }
        .patch .hud-health { top: 4px; right: 4px; }
        .ground { position: absolute; left: 6px; bottom: 4px; opacity: 0.65;
                  letter-spacing: 0.1em; text-transform: uppercase; }
      `}</style>

      <h2>Every state, at desktop size</h2>
      <div className="grid">
        {CASES.map((state) => (
          <div key={state.name} className="cell">
            {/* `hud` because the tier colours and the sizes are declared on
                it — the instrument is never drawn outside one. */}
            <div className="hud stand">
              <CarHealthPanel health={carHealth(state.damage)} />
            </div>
            <span className="name">{state.name}</span>
            <span className="note">{state.note}</span>
          </div>
        ))}
      </div>

      <h2>...and at phone size, over the ground it is read over</h2>
      {CASES.map((state) => (
        <div key={state.name} className="strip" style={{ marginBottom: "8px" }}>
          {GROUNDS.map((ground) => (
            <div key={ground.name} className="patch" style={{ background: ground.fill }}>
              {/* The narrow-phone `--hud-map`, which is the smallest this
                  instrument is ever drawn at and therefore the only size
                  worth arguing about. */}
              <div className="hud" style={{ "--hud-map": "4.8rem" }}>
                <CarHealthPanel health={carHealth(state.damage)} />
              </div>
              <span className="ground">
                {ground.name} · {state.name}
              </span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

const host = document.getElementById("sheet");
if (host) render(<Sheet />, host);
// The screenshot pass waits on this rather than on a timeout.
(window as unknown as { __done?: boolean }).__done = true;
