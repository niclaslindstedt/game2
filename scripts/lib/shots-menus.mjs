// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MENU AND HUD SET: the main menu over its live bot demo, the campaign
// and Roam pages, the options, the score boards, the photo roll, the
// developer's map, and the HUD instruments on their own. Everything the
// player READS rather than drives.

/** The menu is up and its stage has had time to start moving. */
export async function menuUp(page) {
  await page.waitForSelector(".menu-card, .roam", { timeout: 90000 });
  await page.waitForTimeout(5000);
}

/** Press a front-door tile by its `data-menu` name. The tiles carry no
 * description any more, so matching on text would match the page's own
 * heading a moment later; the attribute is the stable handle. */
export async function tile(page, name) {
  await page.locator(`[data-menu='${name}']`).first().click();
  await page.waitForTimeout(300);
}

/** The campaign's stage grid. CAMPAIGN opens the country list only while
 * there is more than one country to list (see `campaignEntry` in
 * main-menu.tsx), so the list step is taken only if it is actually there. */
export async function stageGrid(page) {
  await tile(page, "campaign");
  const list = page.locator(".menu-location");
  if ((await list.count()) > 0) {
    await list.first().click();
    await page.waitForTimeout(400);
  }
}

export async function attractReady(page) {
  // The world builder is what the card is waiting for, and under software
  // rendering it takes as long as it takes.
  await page.waitForSelector(".splash-title", { timeout: 180000 });
  // Long enough for the reveal to finish and the cloth to get into its flap
  // rather than being caught at rest on its first frame.
  await page.waitForTimeout(1300);
  // The prompt blinks, and spends nearly half its cycle invisible — a shutter
  // racing it would come back empty as often as not. Hold it lit; a still
  // cannot show a blink either way.
  await page.evaluate("document.querySelector('.splash-prompt').style.animation = 'none'");
}

export async function menuShots(shot) {
  const { capture, racing } = shot;
  // ── The menu surfaces. The main menu runs a live bot demo under a drone
  // camera, so these want a few seconds on screen before the shutter: a
  // backdrop caught mid-build is not what a player sees.

  /** Playwright's per-click actionability checks outlast the chassis secret's
   * own window while a stage is being built, so the developer drum is
   * dispatched in one go. What is under test here is the menu, not the
   * pointer plumbing. Passed as SOURCE rather than a function, like the
   * `waitForFunction` calls above: this file lints as Node, where `document`
   * and `PointerEvent` do not exist. */
  const drumChassis = (page) =>
    page.evaluate(`(() => {
    const el = document.querySelector(".car-pick-stage");
    const box = el.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      el.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, composed: true, pointerId: 1,
        clientX: box.left + 100, clientY: box.top + 50,
      }));
    }
  })()`);

  // The attract card on its READY beat — the flags flapping, the title up and
  // the prompt asking for a press. Shot on `commit` rather than `load`, because
  // the card's own clock starts at first paint and can be spent before every
  // chunk has landed, and then held until the game behind it is actually
  // standing: nothing is on screen to look at before that.

  // The card at the three shapes its crest has to hold — the phone held
  // sideways being the one that has barely any height to hang it in.
  for (const [suffix, viewport] of [
    ["", { width: 1280, height: 720 }],
    ["-portrait", { width: 390, height: 844 }],
    ["-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(
      `shot-splash${suffix}`,
      viewport,
      attractReady,
      { splash: "1", start: "" },
      "commit",
    );
  }

  // The root menu at all three shapes it has to hold. The phone LANDSCAPE one
  // is the tightest surface in the whole app — very wide, barely 390px tall —
  // and the one screen that must never need a scroll to reach OPTIONS.
  for (const [name, viewport] of [
    ["shot-menu", { width: 1280, height: 720 }],
    ["shot-menu-portrait", { width: 390, height: 844 }],
    ["shot-menu-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(name, viewport, menuUp, { menu: "1" });
  }

  /** A CAMPAIGN PART-DRIVEN, written straight into the save before the page
   * boots. A location page with nothing on it is a page of padlocks: the
   * surface worth looking at is the one carrying what the boxes are for —
   * times, places, points, and a table with something on it. Three stages in
   * is where a player spends most of their time on this screen. */
  const PLAYED_IN = `localStorage.setItem(
  "scandi-flick-campaign",
  JSON.stringify({
    finished: ["taiga-1", "taiga-2", "taiga-3"],
    points: {
      "taiga-1": { you: 3, frostbite: 2, blink: 1 },
      "taiga-2": { blink: 3, you: 2, frostbite: 1 },
      "taiga-3": { you: 3, skarv: 2, granite: 1 },
    },
    best: { "taiga-1": 29.53, "taiga-2": 136.85, "taiga-3": 271.4 },
    places: { "taiga-1": { hard: 1 }, "taiga-2": { hard: 2 }, "taiga-3": { hard: 1 } },
  }),
)`;

  // Campaign: the location and its ladder, at the two shapes a phone holds it
  // in as well as on a laptop. Portrait is its own shot because the grid, the
  // head's standings press and the difficulty cards all change shape there.
  for (const [name, viewport] of [
    ["shot-menu-campaign", { width: 1280, height: 720 }],
    ["shot-menu-campaign-portrait", { width: 390, height: 844 }],
    ["shot-menu-campaign-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(
      name,
      viewport,
      async (page) => {
        await menuUp(page);
        await stageGrid(page);
        await page.waitForTimeout(2500);
      },
      { menu: "1" },
      "load",
      { initScript: PLAYED_IN },
    );
  }

  // THE TIME TRIAL, both of its steps. Its gate is the one that is not the
  // campaign's — a whole COUNTRY opens at once, the moment the campaign opens
  // the country — so the two surfaces worth a picture are the country list
  // (the taiga open on a save three stages in, the desert still behind the
  // table) and the grid behind it, where all six boxes are lit and only three
  // of them carry a time.
  for (const [name, step] of [
    ["shot-menu-timetrial", async (page) => await tile(page, "timetrial")],
    [
      "shot-menu-timetrial-stages",
      async (page) => {
        await tile(page, "timetrial");
        await page.locator(".menu-location").first().click();
      },
    ],
  ]) {
    await capture(
      name,
      { width: 1280, height: 720 },
      async (page) => {
        await menuUp(page);
        await step(page);
        await page.waitForTimeout(2500);
      },
      { menu: "1" },
      "load",
      { initScript: PLAYED_IN },
    );
  }

  // ...and the table behind the head's STANDINGS press, which is where
  // everything the old panel printed under the boxes now lives. Both shapes:
  // the page it cuts its rows to is measured off the room the modal has, and a
  // phone held sideways is the shape with none.
  for (const [name, viewport] of [
    ["shot-menu-standings", { width: 390, height: 844 }],
    ["shot-menu-standings-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(
      name,
      viewport,
      async (page) => {
        await menuUp(page);
        await stageGrid(page);
        await page.locator(".menu-head-act").click();
        // The pictures are real bodies on a stand, one per idle slot
        // (car-portraits.ts) — the board is worth photographing with them on.
        await page.waitForTimeout(9000);
      },
      { menu: "1" },
      "load",
      { initScript: PLAYED_IN },
    );
  }

  // The pre-race card: the stage picked, the car being chosen against its
  // spec sheet. Three shapes, because the sheet's two columns collapse to one
  // on a phone and the turntable has to keep its share of a 390px-tall
  // landscape screen — and the head's own reading moves with them, from the
  // corner on a wide card to under the title on a narrow one. A TIME TO BEAT
  // is seeded, since that reading is the thing being checked and a profile
  // that has never driven the stage has none.
  const SEEDED_BEST = `localStorage.setItem(
  "scandi-flick-campaign",
  JSON.stringify({ finished: [], points: {}, places: {}, best: { "taiga-1": 89.53 } }),
)`;
  for (const [name, viewport] of [
    ["shot-menu-car", { width: 1280, height: 720 }],
    ["shot-menu-car-portrait", { width: 390, height: 844 }],
    ["shot-menu-car-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(
      name,
      viewport,
      async (page) => {
        await menuUp(page);
        await stageGrid(page);
        await page.locator(".menu-level-open").first().click();
        // The turntable is a dynamic import that builds its own body: the
        // card is up long before there is a car standing on it.
        await page.waitForTimeout(3000);
      },
      { menu: "1" },
      "load",
      { initScript: SEEDED_BEST },
    );
  }

  // ...and the same card TURNED, which is a different picture from the one
  // above and has to be the same one. A phone rotated with a card already up
  // re-runs the whole layout against a shape nothing on the card was measured
  // for, and this is the card with a live render surface in it: a canvas is a
  // REPLACED element, so anything that lets the buffer's own aspect ratio
  // reach the layout closes a loop no later screen can break (styles.css,
  // `.car-pick-canvas`). What that failure looks like is the stand keeping
  // its portrait shape in a landscape pane, too tall by nearly half, with
  // START under the fold — and no shot taken at a fixed viewport can see it.
  // Compare against `shot-menu-car-landscape`; they must be the same card.
  await capture(
    "shot-menu-car-turned",
    { width: 390, height: 844 },
    async (page) => {
      await menuUp(page);
      await stageGrid(page);
      await page.locator(".menu-level-open").first().click();
      await page.waitForTimeout(3000);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(1200);
    },
    { menu: "1" },
    "load",
    { initScript: SEEDED_BEST },
  );

  // Roam: the map and the settings beside it, in the three shapes the page
  // has to stand in. The landscape phone is the binding one — the map, a
  // dozen rows and the way on, in 390 px of height.
  for (const [name, viewport] of [
    ["shot-menu-roam", { width: 1280, height: 720 }],
    ["shot-menu-roam-portrait", { width: 390, height: 844 }],
    ["shot-menu-roam-landscape", { width: 844, height: 390 }],
  ]) {
    await capture(
      name,
      viewport,
      async (page) => {
        await menuUp(page);
        await tile(page, "roam");
        await page.waitForTimeout(14000);
      },
      { menu: "1" },
    );
  }

  // OPTIONS: one page of knobs, in the three shapes it has to stand on — the
  // first two without scrolling, and a phone held sideways with as little of
  // it as the chrome can be talked out of. The pointer is parked on the
  // DETAIL row so the caption bar under the rows is photographed lit — it is
  // the page's only sentence, and a shot with it resting says nothing about
  // whether it reads.
  for (const [suffix, viewport] of [
    ["", { width: 1280, height: 720 }],
    ["-landscape", { width: 844, height: 390 }],
    ["-portrait", { width: 390, height: 844 }],
  ]) {
    await capture(
      `shot-menu-options${suffix}`,
      viewport,
      async (page) => {
        await menuUp(page);
        await tile(page, "options");
        await page.locator(".knob", { hasText: "DETAIL" }).hover();
        await page.waitForTimeout(500);
      },
      { menu: "1" },
    );
  }

  // ...and the keyboard's bindings behind its CONTROLS row: the longest page
  // in the menu, so it is the one whose grid has to be looked at.
  await capture(
    "shot-menu-keyboard",
    { width: 1280, height: 720 },
    async (page) => {
      await menuUp(page);
      await tile(page, "options");
      await page.locator(".knob-link", { hasText: "KEYBOARD" }).click();
      await page.waitForTimeout(500);
    },
    { menu: "1" },
  );

  // The new-build button, over the menu and over a run: a mark in the corner,
  // and both are places it can turn up. `?update=1` stands it up — a real
  // waiting worker needs a deploy to land on a device that already had the
  // app, which no capture pass can arrange. The armed shot presses it once,
  // which is the state where it says RESTART rather than just showing a mark.
  for (const [name, viewport, params, script] of [
    ["shot-update-button", { width: 1280, height: 720 }, { menu: "1" }, menuUp],
    ["shot-update-button-portrait", { width: 390, height: 844 }, { menu: "1" }, menuUp],
    ["shot-update-button-landscape", { width: 844, height: 390 }, { menu: "1" }, menuUp],
    ["shot-update-button-race", { width: 1280, height: 720 }, {}, racing],
    [
      "shot-update-button-armed",
      { width: 1280, height: 720 },
      { menu: "1" },
      async (page) => {
        await menuUp(page);
        await page.locator(".update-nudge").click();
        await page.waitForTimeout(300);
      },
    ],
  ]) {
    await capture(name, viewport, script, { ...params, update: "1" });
  }

  // The developer menu, and the campaign with its ladder opened up.
  await capture(
    "shot-menu-developer",
    { width: 1280, height: 720 },
    async (page) => {
      // The chassis secret lives on the pre-race card, which is where the car
      // is — Roam reaches it in one press, and two back out again.
      await menuUp(page);
      await tile(page, "roam");
      await page.waitForTimeout(2500);
      await page.locator(".menu-start").click();
      await page.waitForTimeout(2500);
      await drumChassis(page);
      await page.locator("[data-nav-back]").first().click();
      await page.waitForTimeout(600);
      await page.locator("[data-nav-back]").first().click();
      await page.waitForTimeout(600);
      await page.locator("[data-menu='developer']").click();
      await page.waitForTimeout(400);
    },
    { menu: "1" },
  );
}
