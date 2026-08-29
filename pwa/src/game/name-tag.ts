// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NAME TAGS — the plate that says WHO the car in front of you is.
//
// A rival you never catch is a time on a results sheet. A rival you catch,
// sit behind for half a corner and then have to get past is a character, and
// the only thing standing between those two is knowing that the yellow car
// you are about to lean on is Kettle. That is all this module is for.
//
// It knows nothing about rivals. A tag is a LABEL, a colour and a point in
// the world: the campaign's field hangs one on each crew (field-cars.ts) and
// the time trial hangs one on the ghost, and whatever puts other people's
// cars on the road next hands it the same three things. Nothing here may
// learn what a bot is.
//
// Two decisions carry the whole look:
//
//   CONSTANT ON SCREEN. The plate is the same height in the frame whether
//   the car is ten metres ahead or a hundred and fifty — a name that shrank
//   with distance would be unreadable exactly when it is the only way to
//   tell who is up there. `sizeAttenuation: false` is what does it: three
//   multiplies the sprite's scale by its own view depth, so the division by
//   distance cancels and the size left over is an ANGLE.
//
//   ONLY WHERE THE CAR IS. The plate is depth-tested like everything else in
//   the world, so a crew behind a hill or round the far side of a stand of
//   spruce is not named. Drawing tags over the world instead — the usual
//   trick, and the first thing tried here — puts three names across a frame
//   with no cars in it at all: the stagger keeps the field spread over
//   hundreds of metres of a road that bends through a forest, so "in range"
//   and "in sight" are almost never the same thing. What is left is a name
//   that appears when its car does.

import * as THREE from "three";

import { PALETTE } from "../identity.ts";
import { legible } from "../lib/util.ts";

/** The layer tags are drawn on, and the reason they have one. The rear-view
 * mirror (mirror.ts) is a second pass over this same scene, reversed
 * left-for-right — every word in it comes out backwards. So the tag goes on
 * a layer of its own and only the forward camera is told to draw it; the
 * mirror keeps the default mask and never sees one. */
export const TAG_LAYER = 1;

/** How tall the whole plate stands in the frame, as a fraction of viewport
 * height. Big enough to read one word at a glance while driving, small
 * enough that two crews side by side are two tags rather than a wall. */
const TAG_SCREEN = 0.055;

/** How far away a car is still worth naming, m, and the band the plate
 * comes up over. Inside `DRAW_RANGE` in field-cars.ts, because past this a
 * rally car is a few pixels of dust-coloured fuzz and its name is a word
 * hanging over the scenery — and comfortably outside the reach of a catch,
 * so the crew you are closing on is named while there is still road left to
 * do something about it. */
const TAG_RANGE = 220;
const TAG_FADE = 50;

/** How high the plate hangs over the car's own origin, m — clear of the
 * roof of every body in the roster, with the pointer's tip left down in the
 * gap so the tag reads as belonging to the car under it — and high enough to
 * clear the hay bales and the boards standing around a start control, which
 * the depth test would otherwise cut the plate against. A world offset under
 * a plate that does NOT shrink with distance, so a tag close up floats over
 * its car and one far away sits down on it, which is the right way round:
 * near, there is room; far, the only question is whose roof it is. */
const TAG_LIFT = 2.3;

// The plate, in texture pixels. Authored at a size that survives a 3× phone
// screen: the tag is drawn at about 5% of the frame's height, so a 1440 px
// tall screen asks for roughly 80 device pixels of it and anything smaller
// than this arrives soft.
const PLATE_H = 96;
/** The triangle under the plate, pointing back down at the roof. */
const POINT_H = 22;
const POINT_W = 26;
const PAD_X = 22;
/** The start-number badge, and the gap between it and the name. */
const BADGE = 62;
const BADGE_GAP = 16;
/** How far the ink's shadow is thrown, px — the HUD's own offset, scaled to
 * this canvas. Cheap depth, and it is what keeps white lettering readable
 * over a pale sky when the plate itself is translucent. */
const INK_DROP = 4;

const NAME_FONT = `700 58px "Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`;
const BADGE_FONT = `700 44px "Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`;

/** The plate itself: dark enough that white lettering holds over a bright
 * sky, translucent enough that it never reads as a solid box in the world. */
const PLATE_FILL = "rgba(12,17,26,0.68)";

/** What a tag is dressed in. */
export type TagLook = {
  /** The car's own colour — the badge and the rule under the name take it,
   * so the plate and the body under it are recognised as one thing. Handed
   * in raw; `legible` below is what makes sure it can be seen. */
  color: number;
  /** Everything the tag draws, multiplied by this — a ghost's plate is as
   * see-through as the ghost. 0–1, default 1. */
  fade?: number;
};

/** The ink on the badge: the plate's own dark, so a numeral is always read
 * against a colour `legible` has lifted above it. */
const BADGE_INK = "#0c111a";

/** What a car with no paint of its own is dressed in — the time trial's
 * ghost. The cold pale wash that says "not really there" everywhere else in
 * this world, held under a real crew's plate so a car that is actually out
 * there always wins the frame when the two are on the road together. */
export const GHOST_LOOK: TagLook = { color: 0xdff1ff, fade: 0.62 };

export type NameTag = {
  /** Hung in the scene by whoever owns the car. */
  sprite: THREE.Sprite;
  /** Put it over a car at `x,y,z` — the body's own origin, not its roof —
   * as seen through `camera`, which is also what the range is measured
   * from. Takes the plate off itself once nobody could read it. */
  place: (x: number, y: number, z: number, camera: THREE.PerspectiveCamera) => void;
  /** Off, whatever the range says: switched off in the options, a view with
   * no cars in it, a crew that is not on the road. */
  hide: () => void;
  dispose: () => void;
};

/** Paint one plate. The canvas is only as wide as the name needs, so a tag
 * is never a box of empty dark either side of a short word. */
function paintPlate(label: string, badge: string | null, look: TagLook): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) throw new Error("2d context unavailable");
  measure.font = NAME_FONT;
  const textW = Math.ceil(measure.measureText(label).width);
  const badgeW = badge ? BADGE + BADGE_GAP : 0;
  canvas.width = PAD_X * 2 + badgeW + textW + INK_DROP;
  canvas.height = PLATE_H + POINT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  const w = canvas.width;

  ctx.fillStyle = PLATE_FILL;
  ctx.fillRect(0, 0, w, PLATE_H);
  // The pointer is the plate's own colour continuing downward: one shape,
  // so it never reads as a separate arrow parked under a separate box.
  ctx.beginPath();
  ctx.moveTo(w / 2 - POINT_W / 2, PLATE_H);
  ctx.lineTo(w / 2 + POINT_W / 2, PLATE_H);
  ctx.lineTo(w / 2, PLATE_H + POINT_H);
  ctx.closePath();
  ctx.fill();

  // The car's colour, along the bottom of the plate — the tell that survives
  // being read at the edge of vision, before the word itself is.
  const color = legible(look.color);
  ctx.fillStyle = color;
  ctx.fillRect(0, PLATE_H - 7, w, 7);

  let x = PAD_X;
  if (badge) {
    const top = (PLATE_H - BADGE) / 2;
    ctx.fillStyle = color;
    ctx.fillRect(x, top, BADGE, BADGE);
    ctx.fillStyle = BADGE_INK;
    ctx.font = BADGE_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge, x + BADGE / 2, top + BADGE / 2 + 2, BADGE - 8);
    x += BADGE + BADGE_GAP;
  }

  ctx.font = NAME_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const baseline = (PLATE_H - 7) / 2 + 2;
  ctx.fillStyle = PALETTE.hudShadow;
  ctx.fillText(label, x + INK_DROP, baseline + INK_DROP);
  ctx.fillStyle = PALETTE.hudInk;
  ctx.fillText(label, x, baseline);
  return canvas;
}

/** A plate reading `label`, with `badge` (a start number, a place — anything
 * short) in the coloured square at its left when there is one. */
export function createNameTag(label: string, badge: string | null, look: TagLook): NameTag {
  const canvas = paintPlate(label.toUpperCase(), badge, look);
  const map = new THREE.CanvasTexture(canvas);
  // Lettering is the one thing in this world that is NOT better chunky: the
  // plate spends most of its life being minified, and nearest-filtering a
  // word down to forty pixels wide turns it into speckle. Mipmaps and linear
  // filtering are what keep it a word.
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    // Tested against the world so a car out of sight is not named, but
    // never WRITTEN: a plate is a label over the scene, not a hole in it.
    depthWrite: false,
    // Constant angular size: three multiplies the scale by the sprite's own
    // view depth when attenuation is off, which cancels the perspective
    // divide. The scale below is therefore an angle, not a length.
    sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.layers.set(TAG_LAYER);
  // Drawn after the world's own transparencies, and anchored by its POINT
  // rather than its middle, so the tip lands on the roof and the plate
  // stacks upward from there.
  sprite.renderOrder = 20;
  sprite.center.set(0.5, 0);
  sprite.visible = false;
  const aspect = canvas.width / canvas.height;
  const fade = look.fade ?? 1;

  return {
    sprite,
    place: (x, y, z, camera) => {
      const eye = camera.position;
      const range = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
      const shown = Math.min(1, Math.max(0, (TAG_RANGE - range) / TAG_FADE)) * fade;
      sprite.visible = shown > 0.01;
      if (!sprite.visible) return;
      material.opacity = shown;
      sprite.position.set(x, y + TAG_LIFT, z);
      // The plate's screen height as the angle it subtends: a sprite of
      // scale s with attenuation off covers `s / (2 tan(fov/2))` of the
      // frame, so the scale that covers a given fraction is that inverted.
      // Read off the CURRENT vertical fov, because portrait and landscape do
      // not share one here and a tag has to be the same size in both.
      const height = 2 * TAG_SCREEN * Math.tan((camera.fov * Math.PI) / 360);
      sprite.scale.set(height * aspect, height, 1);
    },
    hide: () => {
      sprite.visible = false;
    },
    dispose: () => {
      map.dispose();
      material.dispose();
    },
  };
}
