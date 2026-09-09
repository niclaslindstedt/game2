// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SET THAT IS NOT ON THE ROAD: the jumps and the flight off them, the
// landings, the crashes, and every camera the player can watch any of it
// from — including the ones a driver never uses, which is where a car in
// the air actually reads. Same harness as the driving set
// (`shot-harness.mjs`); a different half of the same stage.

export async function airShots(shot) {
  const { capture, captureElement, racing, atStageTime, slowerThan, atNextCall, atLamps } = shot;
  /** Wheels off the ground. `data-air` on the HUD root is the engine's own
   * verdict that the car is flying, read the same way `data-off` is: nothing
   * is drawn from it, so the frame is the game rather than the tooling.
   *
   * The budget is WALL time and the sim runs at a fraction of it under
   * software rendering: seed 28's opening lip is ten seconds of stage and a
   * full minute of waiting on this machine. Too short a wait does not fail —
   * it photographs the car still on the road and says the jump was never
   * reachable, which is a jump scene quietly turned into a driving one. */
  async function inTheAir(page) {
    await page.waitForSelector(".hud[data-air]", { timeout: 120000 });
  }

  // In the air, straight and crossed up. Seed 28 opens with a long straight
  // into a lip, so both are a matter of holding the throttle; the sideways one
  // turns into the launch, which is what puts roll in the body. The camera has
  // to hold its frame through both — a jump that pulls the camera back reads
  // as small, and it is the biggest moment in the stage.
  for (const [name, steer] of [
    ["shot-air", null],
    ["shot-air-sideways", "ArrowRight"],
  ]) {
    await capture(
      name,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        if (steer) {
          // A flick just before the lip, not a held turn: the car has to be
          // crossed up AT the launch, and still on the road when it gets there.
          await page.waitForTimeout(7900);
          await page.keyboard.down(steer);
          await page.waitForTimeout(260);
          await page.keyboard.up(steer);
        }
        try {
          await inTheAir(page);
          await page.waitForTimeout(260);
        } catch {
          console.log(`  (${name}: never left the ground)`);
        }
      },
      { seed: "28" },
    );
  }

  // TOUCHDOWN: the frame just after a flight lands, while the springs are
  // still swallowing it. The body is squatted onto its stops and the wheels
  // and the shadow are flat on the road — the car having WEIGHT is visible
  // here or it is visible nowhere.
  await capture(
    "shot-slam",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      try {
        await inTheAir(page);
        await page.waitForSelector(".hud:not([data-air])", { timeout: 60000 });
        // Well under the springs' own period: a shot a beat later catches a
        // settled car, which proves nothing about the beat before it.
        await page.waitForTimeout(90);
      } catch {
        console.log("  (shot-slam: never left the ground)");
      }
    },
    { seed: "28" },
  );

  // Off the road and into the hillside. The ground is a solid like any trunk:
  // a face too steep to climb takes the pace, folds the nose and rocks the car
  // on its springs. The camera trails DOWN the slope behind it, which is where
  // a chase cam at roof height would otherwise be inside the hill.
  await capture("shot-bank", { width: 1280, height: 720 }, async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(2600);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(2400);
  });

  // Portrait at speed (touch HUD hidden on desktop; portrait shows scale).
  await capture("shot-speed-portrait", { width: 390, height: 844 }, async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4500);
  });

  // The touch controls, which only a coarse pointer ever sees — the desktop
  // shots above hide them by media query. A thumb dragged partway across the
  // left zone and HELD: the rim chases the thumb instead of snapping to it, so
  // the blue arc from 12 o'clock is the lock the car is actually being given.
  await capture(
    "shot-touch-steer",
    { width: 390, height: 844 },
    async (page) => {
      await racing(page);
      const zone = await page.locator(".hud-zone-left").boundingBox();
      const x = zone.x + zone.width * 0.5;
      const y = zone.y + zone.height * 0.6;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 46, y, { steps: 10 });
      // Long enough for the rim to have caught up — a shot taken mid-chase
      // measures the harness's timing, not the control.
      await page.waitForTimeout(700);
    },
    {},
    "load",
    { hasTouch: true, isMobile: true },
  );

  // The pedal thumb, held on the anchor: the hints around it are the only place
  // the player is ever told which drag does what, so the shot exists to check
  // they say the right words in the right directions — and, in the MANUAL box,
  // that the gear flicks beside the thumb clear every one of them.
  //
  // It is taken with the gear RUN OUT (the throttle held long enough for the
  // shift light) so the arrows are caught in both states at once: the up one
  // lit, because the gear is there to take, and the down one faint, because
  // first has nothing under it.
  await capture(
    "shot-touch-pedals",
    { width: 390, height: 844 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(3500);
      const zone = await page.locator(".hud-zone-right").boundingBox();
      await page.mouse.move(zone.x + zone.width * 0.5, zone.y + zone.height * 0.55);
      await page.mouse.down();
      await page.waitForTimeout(400);
    },
    { gearbox: "manual" },
    "load",
    { hasTouch: true, isMobile: true },
  );

  // The gear flick, caught at full stretch — the frame between the stab and the
  // release that takes the gear. The throttle is still on under it: a thumb
  // reaching for a shift never lifts off, which is the whole point of the
  // gesture.
  await capture(
    "shot-touch-shift",
    { width: 390, height: 844 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(3500);
      const zone = await page.locator(".hud-zone-right").boundingBox();
      const x = zone.x + zone.width * 0.5;
      const y = zone.y + zone.height * 0.55;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 60, { steps: 6 });
    },
    { gearbox: "manual" },
    "load",
    { hasTouch: true, isMobile: true },
  );

  // GOD MODE ON A PHONE. The developer tool's own thumb zones: a push stick
  // where the wheel would be, drag-to-look on the other half, and the dial
  // between them. Without these a handheld gets the driving controls over a
  // car god mode has just parked — a tool that does not exist on the device
  // it is needed on. The thumb is held off the stick's centre, so the shot
  // carries what the rig is being asked for as well as where the controls sit.
  await capture(
    "shot-touch-god",
    { width: 390, height: 844 },
    async (page) => {
      // Not `racing()`: god mode HOLDS the run, so the clock never leaves
      // zero and a scene that waited for it would wait for ever.
      await page.waitForSelector(".hud-fly-dial", { timeout: 120000 });
      const zone = await page.locator(".hud-zone-left").boundingBox();
      const x = zone.x + zone.width * 0.5;
      const y = zone.y + zone.height * 0.6;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 34, y - 42, { steps: 8 });
      await page.waitForTimeout(500);
    },
    { god: "1" },
    "load",
    { hasTouch: true, isMobile: true },
  );

  // Reverse: the brake held once the car has stopped, so the gear reads R and
  // the speedo is climbing again with the car going the other way.
  await capture("shot-reverse", { width: 1280, height: 720 }, async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(4000);
  });

  // Deep into a short stage, portrait: the minimap's route, the car on it, and
  // a gauge with a real fraction of the stage filled in.
  await capture(
    "shot-map-portrait",
    { width: 390, height: 844 },
    async (page) => {
      await page.keyboard.down("ArrowUp");
      await racing(page);
      await page.waitForTimeout(20000);
    },
    { length: "short" },
  );

  // The camera ladder, one shot per angle, all at the same pace on the same
  // stretch so the proportions can be compared side by side: how big the car
  // is in frame, where it sits vertically, and how much road each one gives
  // the driver. `?camera=` pins the angle rather than counting presses of the
  // camera key — a press count silently shoots the wrong camera the day the
  // ladder grows.
  for (const angle of ["bumper", "hood", "cockpit", "close", "chase", "far", "heli", "top"]) {
    await capture(
      `shot-cam-${angle}`,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await page.waitForTimeout(4500);
      },
      { camera: angle },
    );
  }

  // The two in-car views on a phone held upright. Their own shots because
  // hor+ opens the frame vertically on a narrow viewport, and every degree of
  // that opening lands half of itself at the BOTTOM — which from the scuttle
  // is bonnet and from the seat is fascia.
  for (const angle of ["cockpit", "hood"]) {
    await capture(
      `shot-cam-${angle}-portrait`,
      { width: 390, height: 844 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await page.waitForTimeout(4500);
      },
      { camera: angle },
    );
  }

  // The cockpit after dark, which is the one condition it is authored for
  // separately: a closed cabin gets no light, so the room goes to almost
  // nothing and the two instruments — which answer to nothing the sky does —
  // are the only lit thing in the car.
  await capture(
    "shot-cam-cockpit-night",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4500);
    },
    { camera: "cockpit", tod: "night" },
  );

  // THE COCKPIT IN THE RAIN, which is the one place in the game where the
  // glass itself is the thing being looked at (car/screen-rain.ts). Three
  // shots, because the effect is a cycle and one frame of a cycle proves
  // nothing:
  //
  //   `wet` is the screen a few seconds in, driven by the bot so the car is
  //   at a pace where the airflow is carrying the water UP the glass. The
  //   acceptance test is beading with the world visibly BENT through it — a
  //   drop that is only a pale spot is a drop that is not refracting.
  //
  //   `storm` is the same at the top of the weather, where the screen is
  //   beading again before the arm has finished its stroke. What has to read
  //   there is the arc: a clean fan cut out of a streaming screen, with the
  //   corners the blade cannot reach still running.
  //
  //   `parked` is the car standing still on the grid before the flag, which
  //   is the opposite half of the same model: no air over the scuttle, so the
  //   water creeps DOWN the screen instead of up it, and the drops are round
  //   rather than drawn out into tears.
  for (const scene of [
    { name: "wet", at: 8, params: { weather: "rain", bot: "1" } },
    { name: "storm", at: 12, params: { weather: "storm", bot: "1" } },
  ]) {
    await capture(
      `shot-cockpit-rain-${scene.name}`,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await atStageTime(page, scene.at);
      },
      { camera: "cockpit", ...scene.params },
    );
  }
  await capture(
    "shot-cockpit-rain-parked",
    { width: 1280, height: 720 },
    async (page) => {
      // Before the clock starts there is no clock to wait on, so this one is
      // the exception that waits on the wall: long enough for the world to
      // build and for the screen to have gone over.
      await page.waitForTimeout(25000);
    },
    { camera: "cockpit", weather: "storm" },
  );

  // The cockpit in a corner, which is where three of its four moving parts
  // are: the wheel on lock, the needles up, and the driver's head leaned into
  // the turn against a horizon that is not levelling with the car.
  await capture(
    "shot-cam-cockpit-turn",
    { width: 1280, height: 720 },
    async (page) => {
      await racing(page);
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(4000);
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(950);
    },
    { camera: "cockpit" },
  );

  // THE VIEW KNOBS, as a contact sheet. The four numbers OPTIONS ▸ VIEW moves
  // are the ones this camera is developed against, so the sweep is the loop:
  // change a default in camera-eye.ts or car/cockpit.ts, shoot the row, look
  // at where the fascia, the rim and the header rail actually land. Every
  // variant is the same seed at the same pace, so only the framing moves.
  for (const variant of [
    { name: "seat-low", seat: -0.05 },
    { name: "seat-high", seat: 0.05 },
    { name: "reach-back", reach: -0.08 },
    { name: "reach-fwd", reach: 0.08 },
    { name: "fov-narrow", vfov: -8 },
    { name: "fov-wide", vfov: 8 },
  ]) {
    const { name, ...knobs } = variant;
    await capture(
      `shot-cockpit-${name}`,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await page.waitForTimeout(4500);
      },
      {
        camera: "cockpit",
        ...Object.fromEntries(Object.entries(knobs).map(([k, v]) => [k, String(v)])),
      },
    );
  }

  // The same three distant rigs mid-turn, which is where their sway lives:
  // the swing is sprung, so a committed turn should have thrown the camera
  // out to the OUTSIDE of it rather than leaving it square behind the car. A
  // still cannot show the settle, but it can show that the offset is there.
  for (const angle of ["far", "heli", "top"]) {
    await capture(
      `shot-cam-${angle}-turn`,
      { width: 1280, height: 720 },
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await page.waitForTimeout(4000);
        await page.keyboard.down("ArrowRight");
        await page.waitForTimeout(950);
      },
      { camera: angle },
    );
  }

  // The in-race menu, opened the way a player opens it — by tapping the
  // minimap — in both orientations, since the card is the same width in each.
  for (const [name, viewport] of [
    ["shot-pause", { width: 1280, height: 720 }],
    ["shot-pause-portrait", { width: 390, height: 844 }],
  ]) {
    await capture(name, viewport, async (page) => {
      await page.keyboard.down("ArrowUp");
      await racing(page);
      await page.waitForTimeout(6000);
      await page.keyboard.up("ArrowUp");
      await page.click(".hud-minimap");
      await page.waitForSelector(".hud-pause");
      await page.waitForTimeout(400);
    });
  }

  // THE HUD OFF: the clean frame the switch promises, with the pause chip the
  // only chrome left on it. The switch is the player's own, so the scene
  // writes the blob and reloads before it races — there is no URL for it,
  // because a stored choice is what it is.
  await capture("shot-hud-off", { width: 1280, height: 720 }, async (page) => {
    await page.evaluate(
      `localStorage.setItem("scandi-flick-options", JSON.stringify({ hud: { on: false, mirror: true } }))`,
    );
    await page.reload();
    await page.waitForSelector("canvas.game-canvas");
    await page.keyboard.down("ArrowUp");
    // No clock to read with the HUD down: the run is given the seconds the
    // world takes to build and the lights take to go, and then some.
    await page.waitForTimeout(24000);
    await page.keyboard.up("ArrowUp");
  });

  // THE HUD AT NIGHT — the same chrome under its own dip switch (the night
  // dressing in styles.css, off `data-night`). Its own scene rather than a
  // note on the night DRIVING shot because what is judged here is the
  // foreground and not the road: the ink off full white, the arcade navy gone
  // to black behind every glyph and under every plate, the dial backlit
  // rather than printed, the gear plate turned over — and the one colour that
  // must not have moved anywhere, which is the red. Shot with a corner called,
  // since the co-driver's sign is the largest block of colour on the screen
  // and the piece the dressing has most to say about. Both reference
  // viewports: in portrait the whole right-hand column stacks down one edge.
  for (const [name, viewport] of [
    ["shot-hud-night", { width: 1280, height: 720 }],
    ["shot-hud-night-portrait", { width: 390, height: 844 }],
  ]) {
    await capture(
      name,
      viewport,
      async (page) => {
        await racing(page);
        await page.keyboard.down("ArrowUp");
        await atNextCall(page);
      },
      { tod: "night" },
    );
  }

  // THE COUNTDOWN AT NIGHT — the one frame that holds a LIT signal against the
  // night dressing, and the reason it is here: the dressing shipped painting
  // every bulb on the gantry dark, because `.hud[data-night] .hud-lamp`
  // out-specifies `.hud-lamp-red` three classes to one. It failed silently —
  // the glow is a `box-shadow` and survived a rule that only named
  // `background`, so the countdown still pulsed and still threw red light onto
  // the road with three dead bulbs sitting inside it, and no driving scene
  // looks at a gantry. Anything that dims a resting element while a STATE has
  // to stay bright is checked here.
  await capture(
    "shot-hud-night-grid",
    { width: 1280, height: 720 },
    async (page) => {
      await atLamps(page, 2);
    },
    { tod: "night" },
  );

  // The same card on a phone held sideways — the one shape where its knobs
  // pair up two abreast, and the one where it would otherwise be taller than
  // the screen.
  await capture("shot-pause-landscape", { width: 844, height: 390 }, async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(6000);
    await page.keyboard.up("ArrowUp");
    await page.click(".hud-minimap");
    await page.waitForSelector(".hud-pause");
    await page.waitForTimeout(400);
  });

  // ...and the same card opened during the ESTABLISHING SHOT, which is the one
  // moment the HUD has something of its own in the middle of the screen — so
  // the scene asks for that shot with `?shot=1`. The acceptance test is that
  // the caption under the establishing shot is BEHIND the card rather than
  // printed through its title, which is what a pause card with no layer of its
  // own does: the HUD's centre column claims one to clear the thumb zones, and
  // coming later in the DOM does not beat that.
  await capture(
    "shot-pause-start",
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForSelector(".hud-start-shot");
      await page.click(".hud-minimap");
      await page.waitForSelector(".hud-pause");
      await page.waitForTimeout(400);
    },
    { shot: "1" },
  );

  // The minimap close up, with a stage's worth of gauge on it.
  await captureElement(
    "shot-instrument-minimap",
    ".hud-minimap-dock",
    async (page) => {
      await page.keyboard.down("ArrowUp");
      await racing(page);
      await page.waitForTimeout(22000);
    },
    { length: "short" },
  );

  // The instrument panel, close up. It is a FIXED cast — revs, gear, speed —
  // and this shot is what says so: nothing that comes and goes belongs in this
  // corner, because every phone width is sized to exactly these three.
  //
  // What a broken car has to SAY is not photographed here: the machinery calls
  // out in the news column in the OTHER bottom corner (`damageCall` in
  // hud.tsx), which is a separate element and not in this crop. The call is an
  // ordinary `.hud-flash` — the same one a lap time and a clean-air call go up
  // in — so there is nothing about its look that this sweep does not already
  // photograph.
  await captureElement("shot-instrument-cluster", ".hud-speed", async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(6000);
  });

  // THE WRECK. Full throttle up the opening straight and then hard left off
  // the road into whatever stands there, held until the car has been stopped
  // by it; the shutter waits a couple of seconds for the debris to land and
  // the smoke to rise. The acceptance test is that the car LOOKS like what
  // happened to it: a nose that is no longer there rather than a bumper pushed
  // in, the panels torn rather than scaled, the glass gone from its frames, a
  // wheel down or off, and — if the hit was square and fast enough to kill the
  // engine — steam or smoke off the bonnet and the RETIRED card over it. The
  // second frame is the same wreck a few seconds later, which is where the
  // card lands if the engine died, and where a car that lived is sitting
  // crooked on what it has left.
  async function wreck(page, turn = "ArrowLeft", at = 5) {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await atStageTime(page, at);
    if (turn) await page.keyboard.down(turn);
    await slowerThan(page, 25);
    if (turn) await page.keyboard.up(turn);
    await page.waitForTimeout(2500);
  }
  await capture("shot-crash", { width: 1280, height: 720 }, wreck, { difficulty: "hard" });
  await capture(
    "shot-crash-after",
    { width: 1280, height: 720 },
    async (page) => {
      await wreck(page);
      await page.keyboard.up("ArrowUp");
      await page.waitForTimeout(6000);
    },
    { difficulty: "hard" },
  );
  // ...and STRAIGHT ON at the first corner, which is where a head-on comes
  // from: the car meets whatever stands outside the bend nose first.
  await capture(
    "shot-crash-headon",
    { width: 1280, height: 720 },
    async (page) => {
      await wreck(page, null, 3);
      await page.keyboard.up("ArrowUp");
      await page.waitForTimeout(6000);
    },
    { difficulty: "hard" },
  );
  // The same wreck from over the car, where the nose can actually be seen.
  await capture(
    "shot-crash-headon-heli",
    { width: 1280, height: 720 },
    async (page) => {
      await wreck(page, null, 3);
      await page.keyboard.up("ArrowUp");
      await page.waitForTimeout(6000);
    },
    { difficulty: "hard", camera: "heli" },
  );
}
