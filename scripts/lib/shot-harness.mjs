// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HARNESS EVERY SCREENSHOT SCENE IS DRIVEN THROUGH: one page opened on
// the built site with the scene's query string, the waits that get the run
// to the MOMENT the picture is of (racing, a stage time, a speed, a
// pacenote, the lamps coming on), and the shutter itself — full frame or
// one element.
//
// It is a factory rather than a module of functions because a sweep shares
// one browser and one server, and because `only` (the command line's scene
// filter) has to reach every scene without being threaded through each of
// them.

import { join } from "node:path";

/** Every picture row at its top stop. The exhaust is the one effect whose
 * DETAIL row decides whether there is anything to photograph at all — a
 * grid at the shipped MEDIUM smokes out of one pipe, the player's — so the
 * scenes that ask for HIGH get the whole entry list working. Shared,
 * because the falling-weather set reads it for the opposite reason: the
 * lamps finding the flakes and the crystals near the glass both ride the
 * `snow` stop, and on the default preset that set photographs grey dots. */
export const RICH_PICTURE = `localStorage.setItem(
"scandi-flick-options",
JSON.stringify({
  video: {
    effects: "full",
    interior: "full",
    glass: "all",
    crumple: "all",
    wheelLoss: "all",
    flora: "rich",
    ground: "rich",
    dust: "all",
    exhaust: "all",
    snow: "crystal",
  },
}),
)`;

/** The race clock, read off the HUD and parsed back out of `M'SS"CC` —
 * the only honest cursor into how far a drive has actually got. Written as
 * a source string because every use of it runs inside the page. */
const READ_CLOCK = `(() => {
  const t = document.querySelector(".hud-clock-total")?.textContent;
  if (!t) return null;
  const m = /^(\\d+)'(\\d\\d)"(\\d\\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100 : null;
})()`;

/** Wait until the run is actually ticking — every driving scene starts here
 * rather than with a fixed countdown wait. Building the world takes several
 * seconds under software rendering, and the loop does not start until it is
 * done — a bare timeout from page load spends most of itself on the loading
 * screen and captures the start line however long it waits. */

/** Build the shutter for one sweep. `only` is the command line's scene
 * filter: a scene whose name matches none of the words in it is skipped
 * before its page is ever opened, which is what makes re-shooting one
 * surface seconds rather than minutes. */
export function createShooter({ browser, url, outDir, only, sceneDefaults }) {
  const SCENE_DEFAULTS = sceneDefaults;
  async function racing(page) {
    // The HUD is not in the DOM at all while the world builds, and an absent
    // clock must not read as a started run — which is why READ_CLOCK answers
    // null there rather than parsing an optional chain's `undefined` into a
    // number: `null > 0` is false, so the scene waits instead of starting to
    // press keys at the loading screen.
    // The longest wait in this file, and so the longest timeout: it covers
    // building the world AND the whole of the countdown behind it, where
    // `atLamps` below only covers the first of those. A software-rendered
    // night stage on four cores spends over a minute on the build alone.
    await page.waitForFunction(`${READ_CLOCK} > 0`, null, { timeout: 180000 });
  }

  /** Wait until the RUN's own clock has passed `seconds`. Under software
   * rendering the sim advances at a fraction of wall time, so a fixed
   * `waitForTimeout` lands at a different place on the stage on every machine;
   * the HUD timer is the only honest cursor into how far the drive has got. */
  async function atStageTime(page, seconds, timeout = 180000) {
    await page.waitForFunction(`${READ_CLOCK} >= ${seconds}`, null, { timeout });
  }

  /** Wait until the car has slowed past `kmh`. The finish's two moments are
   * both defined by where the car IS, and under software rendering the sim
   * advances at a fraction of wall time — so a `waitForTimeout` after the
   * flying finish lands somewhere different on every machine and usually
   * catches the car still at rally pace. The speedo is the honest cursor. */
  async function slowerThan(page, kmh) {
    await page.waitForFunction(
      `Number.parseInt(document.querySelector('.hud-speed-num')?.textContent ?? '999', 10) < ${kmh}`,
      null,
      { timeout: 180000 },
    );
  }

  /** Wait until the car is ON THE POWER — the speedo climbing over a pair of
   * samples, and past walking pace so a standing start does not qualify. The
   * HUD carries no throttle, and for anything that answers the PEDAL (the
   * exhaust's soot) that is the fact a scene has to wait for: `atOpenRoad`
   * says only that nothing is called, and a bot with nothing called may still
   * be settling the car or braking early. */
  async function onThePower(page) {
    const speed =
      "Number.parseInt(document.querySelector('.hud-speed-num')?.textContent ?? '0', 10)";
    await page.waitForFunction(
      `(() => {
      const now = ${speed};
      const was = window.__shotSpeed ?? 0;
      window.__shotSpeed = now;
      return now > 40 && now > was + 2;
    })()`,
      null,
      { timeout: 180000, polling: 400 },
    );
  }

  /** The run's own clock, seconds. */
  async function stageTime(page) {
    return (await page.evaluate(`${READ_CLOCK} ?? 0`)) ?? 0;
  }

  /** Wait until the co-driver has nothing to say — no corner inside the call's
   * lead, which is the harness's definition of OPEN ROAD: room ahead to brake
   * in, or to get the car straight before a scene asks something of it. The
   * stage the bot happens to be on decides where that lands, so a scene that
   * needs elbow room asks for it instead of counting seconds. */
  async function atOpenRoad(page) {
    await page.waitForFunction("!document.querySelector('.hud-pace-call')", null, {
      timeout: 180000,
    });
  }

  /** Wait until the co-driver CALLS the next corner, and say which way it
   * goes. The call goes up a couple of seconds out, so this is the turn-in
   * itself — a scene that turns on it turns the way the road is going rather
   * than across it. Returns at once if a call is already up. */
  async function atNextCall(page) {
    const handle = await page.waitForFunction(
      `(() => {
      const call = document.querySelector('.hud-pace-call');
      if (!call) return false;
      // The plate carries no words any more — the sign IS the call — so the
      // direction is read off its LABEL, which is where the co-driver's
      // vocabulary still lives (pacenoteText in hud.tsx).
      const text = call.getAttribute('aria-label') ?? '';
      return text.includes('LEFT') ? 'ArrowLeft' : text.includes('RIGHT') ? 'ArrowRight' : false;
    })()`,
      null,
      { timeout: 180000 },
    );
    return await handle.jsonValue();
  }

  async function capture(
    name,
    viewport,
    script,
    params = {},
    waitUntil = "load",
    pageOptions = {},
  ) {
    if (only.length > 0 && !only.some((f) => name.includes(f))) return;
    // `initScript` is page-side source run BEFORE the app loads — the only way
    // to photograph a surface that reads stored state on the way up, like the
    // high score board a results card is built around. It is not a page option,
    // so it comes off here rather than reaching `newPage`.
    const { initScript, ...options } = pageOptions;
    const page = await browser.newPage({ viewport, ...options });
    page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
    if (initScript) await page.addInitScript(initScript);
    await page.goto(`${url}?${new URLSearchParams({ ...SCENE_DEFAULTS, ...params })}`, {
      waitUntil,
    });
    if (waitUntil === "load") await page.waitForSelector("canvas.game-canvas");
    await script(page);
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`previews/${name}.png`);
    await page.close();
  }

  /** A close-up of one HUD element, captured at 4x so the instruments can be
   * JUDGED. The minimap is a few dozen pixels in a real frame — big enough to
   * check there for clipping, far too small to see whether its parts read
   * apart from each other. */
  async function captureElement(name, selector, script, params = {}) {
    if (only.length > 0 && !only.some((f) => name.includes(f))) return;
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 4,
    });
    page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
    await page.goto(`${url}?${new URLSearchParams({ ...SCENE_DEFAULTS, ...params })}`);
    await page.waitForSelector("canvas.game-canvas");
    await script(page);
    await page.locator(selector).screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`previews/${name}.png`);
    await page.close();
  }

  // Start grid, landscape + portrait. A `?start=1` link lands on the lights:
  // the establishing shot is ten seconds of camera every scene would otherwise
  // sit through, and it has scenes of its own below.
  /** Wait until the start gantry has `lamps` reds lit — the only cursor into
   * the countdown, whose own clock has not started yet. One lamp fills per
   * second, so the last one is the last second before green. */
  async function atLamps(page, lamps) {
    await page.waitForSelector(".hud-lights", { timeout: 120000 });
    await page.waitForFunction(
      `document.querySelectorAll('.hud-lamp-red').length >= ${lamps}`,
      null,
      { timeout: 120000 },
    );
  }

  return {
    capture,
    captureElement,
    racing,
    atStageTime,
    slowerThan,
    onThePower,
    stageTime,
    atOpenRoad,
    atNextCall,
    atLamps,
    browser,
    url,
    outDir,
    only,
  };
}
