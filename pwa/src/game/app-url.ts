// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERY QUERY PARAMETER THE APP READS. The debug overlay's REPRO line is
// written from the same set (`debug-info.ts`), so a reader and its writer
// move together: a link cut off the overlay has to stand the frame it
// names back up. Everything here is read ONCE at load — a pose or a map
// frame re-applied every frame would make the camera impossible to move.

import type { MapPose } from "./camera.ts";
import type { FreeFlyPose } from "./camera-free.ts";
import { placeFromQuery } from "./place-url.ts";
import { type PlayMode } from "./menu.tsx";
import { MAP_LAYERS, type MapLayerId } from "./map-layers.ts";
import { findLevel } from "./campaign.ts";
import { type DevSettings, type ViewSettings } from "./settings.ts";

/** Everyone gets the same opening stage on a given day; the menu's demo
 * rolls on from it, and Roam starts there. */
export function dailySeed(): number {
  return Math.floor(Date.now() / 86_400_000);
}

export const RACE_KEY = "scandi-flick-race-settings";

/** ?bot=1 (tooling): the bot drives the run until a control is touched, and
 * then hands the wheel over for good. Blind key presses can only ever reach
 * the first corner, so this is how a scripted scene gets to a PLACE on the
 * stage — a sealed section, a ford, a jump — and takes over there. */
export function autopilotRequested(): boolean {
  return new URLSearchParams(location.search).get("bot") === "1";
}

/** ?update=1 (tooling): show the new-build button as if a worker were
 * waiting. A real one only appears after a deploy has actually landed on a
 * device that already had the app, which is not a state a screenshot pass
 * can reach — and an interface nobody can look at is an interface nobody
 * maintains. The second press still reloads, so the escape hatch is
 * honest. */
export function updateNudgeForced(): boolean {
  return new URLSearchParams(location.search).get("update") === "1";
}

/** ?mirrorhz=N (tooling): hold the rear-view mirror at that refresh rate
 * instead of letting the measured frame rate choose it (mirror-pace.ts).
 * `make profile` is what needs it: the harness rasterizes in software at a
 * handful of frames a second, so an adaptive mirror falls to its floor and
 * the draw calls that come back describe the governor rather than the
 * renderer. */
export function mirrorHzFromUrl(): number | null {
  const raw = Number(new URLSearchParams(location.search).get("mirrorhz"));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** ?laps=N (tooling): race a circuit over this many laps instead of the
 * rule book's three. A scripted pass has to REACH a finish to photograph
 * one, and three laps of anything is a long time to hold a browser open. */
export function lapsOverride(): number | null {
  const raw = Number(new URLSearchParams(location.search).get("laps"));
  return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : null;
}

/** ?mode= ?level= ?at= ?paused=1 (tooling): WHERE a `?start=1` link opens.
 * `mode=headsup` opens on a GRID, with the field entered and the whole of it
 * on the road at once, rather than alone on a Roam stage — the grid's own
 * three settings come from the player's HEADS UP page, exactly as they do
 * when a person starts one. `level=` enters the run on a campaign stage, in
 * the campaign unless `mode=` says a time trial, so it has a book to keep
 * and points to pay; and `at=` stands the run at a MOMENT of it — mid-stage,
 * a step short of the line, stopped with a dead engine — instead of on the
 * lights (place-url.ts, over engine/game/place.ts). Read once, like the
 * camera poses below: a link names the frame it was cut for. */
export const URL_PLACE = placeFromQuery(location.search);

/** The discipline a link opens in: what it asked for, else the campaign on
 * a link that named a level, else Roam. A heads-up link with a level on it
 * is a heads-up race on that stage, exactly as the HEADS UP page enters
 * one. */
export function modeFromUrl(): { mode: PlayMode; levelId?: string } {
  const level = URL_PLACE.levelId ? findLevel(URL_PLACE.levelId) : null;
  const mode = URL_PLACE.mode ?? (level ? "campaign" : "roam");
  return level && mode !== "roam" ? { mode, levelId: level.level.id } : { mode };
}

/** ?debug=1 / ?god=1 (tooling, and the repro line the debug overlay prints):
 * force the developer tools on for this launch whatever is in storage. A
 * screenshot has to reproduce on a machine that has never had the developer
 * menu let out — otherwise the one person who can check a repro is the one
 * who reported it. */
export function devFromUrl(): Partial<DevSettings> {
  const params = new URLSearchParams(location.search);
  const dev: Partial<DevSettings> = {};
  if (params.get("debug") === "1") dev.debug = true;
  if (params.get("god") === "1") dev.god = true;
  // …and `?record=1`, so a scripted pass can collect a drive without anybody
  // having found the developer menu on the machine it runs on.
  if (params.get("record") === "1") dev.record = true;
  return dev;
}

/** ?gx= ?gy= ?gz= ?gyaw= ?gpitch= — where to park god mode's camera, in the
 * units camera-free.ts flies in (meters, radians). Absent components are
 * left wherever the rig already was; a URL with none of them just turns
 * flying on where the run starts. */
export function poseFromUrl(): Partial<FreeFlyPose> {
  const params = new URLSearchParams(location.search);
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  return { x: num("gx"), y: num("gy"), z: num("gz"), yaw: num("gyaw"), pitch: num("gpitch") };
}

/** ?maz= ?mpitch= ?mzoom= ?mpanx= ?mpanz= — where to park the ROAM MAP's
 * camera, in the units it is steered in (radians, a multiplier on the
 * framing standoff, metres off the stage's centre). The other half of the
 * map's own repro line (map-debug.ts): a picture of a generator defect is
 * only worth taking if somebody else can stand in front of it. */
export function mapPoseFromUrl(): Partial<MapPose> {
  const params = new URLSearchParams(location.search);
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    az: num("maz"),
    pitch: num("mpitch"),
    zoom: num("mzoom"),
    panX: num("mpanx"),
    panZ: num("mpanz"),
  };
}

/** ?layer= — which of the generator's layers the map opens painted with,
 * and `?mapfull=1` for the map filling the screen. Both are the DEVELOPER'S
 * MAP VIEWER (menu-map-viewer.tsx) and nothing a player has, so both open
 * that page rather than Roam, and both let the developer menu out for this
 * launch exactly as `?debug=1` does. */
export function mapLayerFromUrl(): MapLayerId | null {
  const raw = new URLSearchParams(location.search).get("layer");
  return MAP_LAYERS.some((l) => l.id === raw) ? (raw as MapLayerId) : null;
}

export function mapFullFromUrl(): boolean {
  return new URLSearchParams(location.search).get("mapfull") === "1";
}

/** The build this frame came out of — the first thing to check when a
 * screenshot and the current tree disagree about what the game does. */

/** ?seat= ?reach= ?vfov= ?headmotion= — the in-car view's four knobs, in the
 * units OPTIONS ▸ VIEW moves them in (metres, metres, degrees, a scale on
 * the head). The tooling sweeps these to shoot a contact sheet of variants
 * without a rebuild; a missing one keeps whatever the player has stored. */
export function viewFromUrl(): Partial<ViewSettings> {
  const params = new URLSearchParams(location.search);
  const view: Partial<ViewSettings> = {};
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const seat = num("seat");
  if (seat !== undefined) view.seat = seat;
  const reach = num("reach");
  if (reach !== undefined) view.reach = reach;
  const fov = num("vfov");
  if (fov !== undefined) view.fov = fov;
  const head = num("headmotion");
  if (head !== undefined) view.headMotion = head;
  return view;
}

/** The player's options, with the URL's developer flags laid over them. A
 * repro link arrives on a machine that has never drummed on the chassis, so
 * it lets the developer menu out as well as the tools — otherwise the boxes
 * come up and there is no way to switch them off again. */

/** Where a `?g…=` link wants god mode's camera parked. Read once: it names
 * the frame the link was made from, and re-applying it every time the
 * camera came back would make the flight impossible to leave. */
export const URL_POSE = poseFromUrl();

/** ?freefov= — the LENS god mode's camera wears, deg of vertical fov, or 0
 * for the design one. three's fov is vertical, so a very wide viewport opens
 * the HORIZONTAL field instead of showing more of the same lens, and past
 * about 150° across the ground domes and anything near the edge shears. A
 * tool shooting a wide strip (scripts/biome-preview.mjs) asks for a longer
 * lens here and gets a panorama instead of a fisheye. */
export const URL_FREE_FOV = (() => {
  const raw = new URLSearchParams(location.search).get("freefov");
  const deg = Number(raw);
  return raw !== null && Number.isFinite(deg) && deg > 0 && deg < 180 ? deg : 0;
})();

/** ?air= — how far the world is DRAWN for this frame, m, or 0 for the
 * driving distances. OPTIONS ▸ VIDEO's draw distance only scales the fog
 * preset, and its longest setting is still sized to a driver's eye a metre
 * off the road; a camera two hundred metres up with the horizon in frame is
 * looking at kilometres, and on any of them the ground and the roads on it
 * stop partway out with open haze past the end. A still can afford to draw
 * what a run cannot, so the tools ask for it outright. */
export const URL_AIR = (() => {
  const raw = new URLSearchParams(location.search).get("air");
  const m = Number(raw);
  return raw !== null && Number.isFinite(m) && m > 0 && m <= 20000 ? m : 0;
})();

/** ?tvstand= — hold the TV mode on its TRIPODS for the whole stage.
 *
 * The mode is normally a broadcast: the chase boom down the road, cutting to
 * a trackside camera for a tight corner and flying back out at the exit
 * (camera-tv-cut.ts). That is what a replay wants and the opposite of what a
 * SCRIPTED STILL wants — a frame staged at a given point on a given seed has
 * to come from the same lens every time it is taken, and a director choosing
 * per corner makes the showcase's trackside shots a coin toss between a
 * tripod and a boom. So the harness pins the gallery outright, the way it
 * pins the seed and the hour (scripts/lib/shots-showcase.mjs).
 *
 * A pin, not a setting: nothing in the game offers it, because a player
 * watching a whole stage from tripods is the thing the director exists to
 * stop. */
export const URL_TV_STAND = new URLSearchParams(location.search).get("tvstand") === "1";

/** ...and where a `?m…=` link wants the ROAM MAP framed. Read once for the
 * same reason: it names the picture the link was cut from, and re-applying
 * it every frame would make the map impossible to move. */
export const URL_MAP_POSE = mapPoseFromUrl();

/** THE TRAINING GROUND as a stage spec. There is only one of it — the
 * place is authored (`mapgen/arena.ts`), the conditions are fixed, and the
 * only thing a player chooses is the car — so it is stated once here and
 * read by the menu's way in and by a `?mode=training` link alike. */
