// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rear-view mirror: a second pass over the same scene, taken from the
// CAR looking back, drawn as a strip of glass at the top of the frame — or,
// from the driver's seat, put into the physical mirror hanging in the
// windscreen (car/cockpit.ts).
//
// It is bolted to the body, not to the camera. Whichever way the player is
// watching the run from — hood, chase, heli, straight down over the roof —
// the strip shows the same thing: the road behind the car, from the car.
// That is the whole point of it. A mirror that swung around with the
// camera would answer a different question every time the camera key was
// pressed, and none of them the one being asked.
//
// THE LENS STANDS ON THE MIRROR'S OWN GLASS, inside the cabin, looking back
// through the car: what it sees is the road through the backlight, the film
// the stage has thrown on that glass, and nothing else — the lens is opened
// no wider than the window (below), so the lining round it never gets into
// the strip. A lens raised over the roof would show a cleaner road than the
// driver could, and the whole point of a dirty back window is that the
// mirror is where you find out about it.
//
// The image is FLIPPED left-for-right, because that is what a mirror does
// and what the player's hands expect: something coming up the inside on the
// left has to appear on the left of the glass. The flip is why the pass
// goes through a render target rather than straight into a scissored
// viewport — negating the projection's x would reverse every triangle's
// winding and turn the world inside out, so the scene is drawn upright into
// a texture and the texture is what gets reversed.
//
// HOW WIDE it looks, and how far up the window it is pointed, are not
// properties of the mirror at all: they are properties of the CAR, because
// the backlight is the aperture the whole picture comes through and every
// body has a different one. The mount carries both answers, fitted to that
// body's own rear pane in car/mirror-fit.ts.
//
// HOW OFTEN the glass is refilled and HOW FAR it sees are not here: they are
// not properties of the mirror but of the machine drawing it, and they move
// while a stage is being driven. mirror-pace.ts owns both, and the renderer
// hands the answers in — the rate to `fill`'s caller, the reach to `aim`.

import * as THREE from "three";
import type { GameState } from "@engine";

import type { MirrorMount } from "./car-body.ts";

/** Width over height of the glass. Wide and shallow, like the real thing:
 * what a mirror is for is who is beside and behind, and the sky above them
 * is not information.
 *
 * Exported because the COCKPIT hangs a physical mirror in the top of its
 * windscreen and shows this same image in it (car/cockpit.ts): a pane built
 * at any other shape stretches the picture, and the mirror camera only ever
 * renders one.  */
export const MIRROR_ASPECT = 3.2;
const ASPECT = MIRROR_ASPECT;

/** How wide the glass is, as a fraction of the canvas — one number for a
 * landscape frame and one for a portrait one. They are not the same number
 * because the two frames have different room: landscape has a clear span
 * between the clock and the minimap, portrait has almost none, so the
 * portrait strip goes wider and drops below that row instead.
 *
 * PARITY with `.hud` in pwa/src/styles.css, which restates these to hang the
 * co-driver's calls under the glass rather than across it. */
const WIDTH_WIDE = 0.21;
const WIDTH_TALL = 0.52;

/** How far down from the top edge the glass hangs, as a fraction of canvas
 * height. Landscape tucks under the top edge; portrait clears the clock and
 * the minimap that already own that corner. */
const TOP_WIDE = 0.022;
const TOP_TALL = 0.135;

/** THE CURVE IN THE GLASS. A rear-view mirror is not a flat pane: it is
 * bent across its width so a strip of glass a hand wide can answer for a
 * whole road, and everything about how one reads comes from that — the
 * middle at something like its true size, the sides drawn in and squeezed,
 * a horizon that bows rather than ruling straight across.
 *
 * `bulge` is how much bigger the middle of the strip is drawn than its
 * ends: 0 is a flat pane, 0.3 is the middle a third larger. `bow` is the
 * same curve read up the glass, and it is much the gentler of the two
 * because the strip is over three times as wide as it is tall — a mirror
 * bent as hard vertically as horizontally would be a fairground one.
 *
 * Both are pinned at the LEFT AND RIGHT EDGES of the glass, so the warp
 * only ever reaches INWARD for what it draws. That is what makes it safe:
 * the lens is opened exactly as far as the backlight (car/mirror-fit.ts),
 * and a curve that sampled outward would go looking for road in the pillar
 * beside the window.
 *
 * `rim` is how far in from the edge the glass turns into its housing, as a
 * fraction of the strip's HEIGHT so the falloff is the same width of glass
 * top and side, and `rimShade` how dark it goes there. */
export const GLASS = { bulge: 0.3, bow: 0.09, rim: 0.3, rimShade: 0.22 } as const;

/** Where the lens stands on a car with no cockpit to hang a mirror in — a
 * ghost, a tool's bare body — m above the driver's own eye, and how far
 * below level it looks, rad. High enough to clear the roof, so it looks
 * over the car rather than into the back of its cabin. */
const RISE = 0.5;
const AIM_DOWN = 0.02;

/** ...and how wide it looks from up there, deg of horizontal field. There
 * is no backlight in front of a lens over the roof and so nothing to fit
 * it to, so it takes the field a fitted one comes out at (18°–46°, and
 * every car in the catalog in the middle of that): the picture must not
 * change scale because the car being driven happens to have no cabin. */
const FOV_OPEN = 26;

/** The frame around the glass, CSS px, and its colour. Dark and thin: it is
 * there to separate the mirror from the sky behind it, and a heavy chrome
 * bezel would be the biggest thing on the screen. */
const BEZEL = 3;
const BEZEL_COLOR = 0x161a20;

/** Ceiling on the target's width, device px. The glass is drawn at the
 * screen's own resolution below it — anything softer turns the one car that
 * matters into a smudge — and the cap is what stops a 3× phone from paying
 * for a strip wider than the road it is showing. */
const MAX_WIDTH = 1024;

export type MirrorRect = { x: number; y: number; width: number; height: number };

export type RearMirror = {
  /** The camera the mirror pass draws with — handed to the world's cull so
   * the scenery behind the car is still in the pool when it is asked for. */
  camera: THREE.PerspectiveCamera;
  /** Aim it from the car for this frame. `mount` is where the glass hangs
   * in the car, what it is tilted at and how wide it may look, car-local
   * (the cockpit's own mirror, or `fallbackMount` on a car without one),
   * and `frame` is the body object those metres are measured in — the car's
   * own sprung chassis (`mirrorFrame` in car-mesh.ts), or null when there
   * is no car drawn to hang the lens on. `far` is how far the mirror is
   * allowed to see — the forward view's fog
   * distance times the reach of the rung in force (mirror-pace.ts) — and
   * the fog is pulled in to the same fraction around the pass, so the world
   * leaves this frustum where the air had already gone solid rather than
   * being cut off in mid-view. */
  aim: (state: GameState, mount: MirrorMount, frame: THREE.Object3D | null, far: number) => void;
  /** Whether the glass is CURVED (`GLASS` above) rather than a flat pane.
   * It is a second pass over the strip, so it rides the video options'
   * EFFECTS row (`MIRROR_GLASS` in settings.ts) with the rest of the FX
   * budget, and it applies the moment it is set. */
  setGlass: (on: boolean) => void;
  /** Where the glass sits on a `w`×`h` canvas, CSS px from its top-left. */
  rect: (w: number, h: number) => MirrorRect;
  /** Render the road behind into the mirror's own target. Split from the
   * composite below because the picture has TWO homes now: the HUD's strip,
   * which is drawn over the finished frame, and the cockpit's physical
   * mirror, which is geometry inside the scene and therefore needs the
   * texture ready BEFORE the frame is drawn rather than after. */
  fill: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, w: number, h: number) => void;
  /** Draw the strip over the frame already in the buffer. */
  composite: (renderer: THREE.WebGLRenderer, w: number, h: number) => void;
  /** The image itself, for the cockpit's pane to sample. Already reversed
   * left-for-right by the texture's own transform. */
  texture: THREE.Texture;
  dispose: () => void;
};

const UP = new THREE.Vector3(0, 1, 0);

/** Where the lens stands on a car with no mirror of its own: over the
 * driver's eye on the centreline, looking back and a touch down. */
export function fallbackMount(driverEyeY: number): MirrorMount {
  const y = driverEyeY + RISE;
  return {
    at: { x: 0, y, z: 0 },
    look: { x: 0, y: y - Math.tan(AIM_DOWN) * 10, z: -10 },
    fov: FOV_OPEN,
  };
}

export function createMirror(): RearMirror {
  const camera = new THREE.PerspectiveCamera(20, ASPECT, 0.3, 800);

  // What everything else in the game samples: the finished glass. The scene
  // is drawn into it directly while the pane is flat, and into `sceneTarget`
  // and bent into it once the pane is curved — either way this is the
  // texture the HUD's strip and the cockpit's own mirror were handed at
  // build time, so the curve can be switched mid-stage without either of
  // them learning that anything changed.
  const target = new THREE.WebGLRenderTarget(2, 2);
  let sceneTarget: THREE.WebGLRenderTarget | null = null;
  let curved = false;
  // The glass is what gets reversed. A negative repeat with the offset that
  // puts it back in range is the whole flip — the scene itself is drawn the
  // right way round, so every triangle keeps the winding it was built with.
  const glassMap = target.texture;
  glassMap.wrapS = THREE.RepeatWrapping;
  glassMap.repeat.x = -1;
  glassMap.offset.x = 1;

  // The strip is composited by an orthographic pass over the finished
  // frame: the bezel first, then the glass inset into it.
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plane = new THREE.PlaneGeometry(2, 2);
  const bezelMaterial = new THREE.MeshBasicMaterial({
    color: BEZEL_COLOR,
    depthTest: false,
    depthWrite: false,
  });
  const glassMaterial = new THREE.MeshBasicMaterial({
    map: glassMap,
    depthTest: false,
    depthWrite: false,
  });
  // THE CURVE, as the pass that resolves the scene into the glass. It is a
  // sampling shader rather than geometry because the picture has two homes
  // — the HUD's strip and the pane hanging in the cockpit's windscreen —
  // and bending the TEXTURE is the only place that reaches both.
  const warpMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null as THREE.Texture | null },
      bulge: { value: GLASS.bulge },
      bow: { value: GLASS.bow },
      rim: { value: GLASS.rim },
      rimShade: { value: GLASS.rimShade },
      aspect: { value: ASPECT },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D map;
      uniform float bulge;
      uniform float bow;
      uniform float rim;
      uniform float rimShade;
      uniform float aspect;
      varying vec2 vUv;
      void main() {
        // The glass, -1..1 across and up. The curve is read off the width
        // alone — a mirror is bent across, not around — so both axes are
        // drawn in by how far ACROSS the glass the pixel is, and both are
        // pinned where that is the edge.
        vec2 p = vUv * 2.0 - 1.0;
        float x2 = p.x * p.x;
        vec2 src = vec2(
          p.x * (1.0 + bulge * x2) / (1.0 + bulge),
          p.y * (1.0 + bow * x2) / (1.0 + bow)
        );
        vec3 c = texture2D(map, src * 0.5 + 0.5).rgb;
        // ...and the glass turning away into its housing at the rim. The
        // band is stated up the glass and divided by the aspect across it,
        // so it is the same width of glass on all four sides.
        vec2 e = abs(p);
        float lit = min(
          1.0 - smoothstep(1.0 - rim / aspect, 1.0, e.x),
          1.0 - smoothstep(1.0 - rim, 1.0, e.y)
        );
        gl_FragColor = vec4(c * (1.0 - rimShade * (1.0 - lit)), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const warpScene = new THREE.Scene();
  const warp = new THREE.Mesh(plane, warpMaterial);
  warp.frustumCulled = false;
  warpScene.add(warp);

  const bezel = new THREE.Mesh(plane, bezelMaterial);
  const glass = new THREE.Mesh(plane, glassMaterial);
  bezel.renderOrder = 0;
  glass.renderOrder = 1;
  bezel.frustumCulled = false;
  glass.frustumCulled = false;
  quadScene.add(bezel, glass);

  // THE LENS IS BOLTED TO THE BODY, and it is bolted to the body the drawn
  // car is actually in rather than to a second copy of the body's chain
  // worked out here. `frame` is that car's own sprung chassis, so the
  // springs' heave, the loft off a brow, the load pitch, the engine's
  // tremble and a corner riding on its bare hub are all already in its
  // matrix — and a lens that took some of those and not others would slide
  // about inside its own housing, which is exactly what a mirror bumping
  // over rough ground looks like.
  const at = new THREE.Vector3();
  const look = new THREE.Vector3();
  const frameUp = new THREE.Vector3();

  const rect = (w: number, h: number): MirrorRect => {
    const width = Math.round(w * (w > h ? WIDTH_WIDE : WIDTH_TALL));
    const height = Math.round(width / ASPECT);
    return {
      x: Math.round((w - width) / 2),
      y: Math.round(h * (w > h ? TOP_WIDE : TOP_TALL)),
      width,
      height,
    };
  };

  const aim = (
    state: GameState,
    mount: MirrorMount,
    frame: THREE.Object3D | null,
    far: number,
  ): void => {
    if (frame) {
      // The car has only been POSED this frame — three settles world
      // matrices when it renders, which has not happened yet — so the chain
      // above the chassis is walked here rather than trusted.
      frame.updateWorldMatrix(true, false);
      at.set(mount.at.x, mount.at.y, mount.at.z).applyMatrix4(frame.matrixWorld);
      look.set(mount.look.x, mount.look.y, mount.look.z).applyMatrix4(frame.matrixWorld);
      // ...and the body's own up, not the world's: a mirror in a car on its
      // side shows a picture on its side, because that is where the glass
      // is. Column 1 of the matrix is the body's y axis.
      frameUp.setFromMatrixColumn(frame.matrixWorld, 1).normalize();
    } else {
      // No car drawn to stand the lens on — the mount is placed against the
      // bare state instead. There is no body here to disagree with, so the
      // heading is the whole of the chain that matters.
      const car = state.car;
      at.set(mount.at.x, mount.at.y, mount.at.z).applyAxisAngle(UP, car.heading);
      look.set(mount.look.x, mount.look.y, mount.look.z).applyAxisAngle(UP, car.heading);
      at.set(at.x + car.x, at.y + car.y, at.z + car.z);
      look.set(look.x + car.x, look.y + car.y, look.z + car.z);
      frameUp.copy(UP);
    }
    camera.position.copy(at);
    camera.up.copy(frameUp);
    camera.lookAt(look);

    // How wide the car lets it look. three's fov is VERTICAL; what the
    // mount states is how much road the glass shows to either side, which
    // is the number the backlight decides.
    camera.far = far;
    camera.fov = (Math.atan(Math.tan((mount.fov * Math.PI) / 360) / ASPECT) * 360) / Math.PI;
    camera.updateProjectionMatrix();
  };

  const fill = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, w: number, h: number): void => {
    const box = rect(w, h);
    const ratio = renderer.getPixelRatio();
    const px = Math.min(MAX_WIDTH, Math.max(2, Math.round(Math.max(box.width, 8) * ratio)));
    const py = Math.max(2, Math.round(px / ASPECT));
    if (target.width !== px || target.height !== py) target.setSize(px, py);

    const previousTarget = renderer.getRenderTarget();
    renderer.setScissorTest(false);
    if (curved) {
      // Drawn flat first and bent second. The scene's own target carries no
      // texture transform: the left-for-right flip belongs on the glass
      // everybody samples, and applying it here would reverse the picture
      // twice.
      if (!sceneTarget) sceneTarget = new THREE.WebGLRenderTarget(px, py);
      if (sceneTarget.width !== px || sceneTarget.height !== py) sceneTarget.setSize(px, py);
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      warpMaterial.uniforms.map.value = sceneTarget.texture;
      renderer.setRenderTarget(target);
      renderer.render(warpScene, quadCamera);
    } else {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }
    renderer.setRenderTarget(previousTarget);
  };

  /** Switch the curve on or off. The pane the curve needs is only paid for
   * while it is on: turning it off gives the memory back rather than
   * keeping a second full-size target warm for a setting nobody chose. */
  const setGlass = (on: boolean): void => {
    if (on === curved) return;
    curved = on;
    if (!on) {
      sceneTarget?.dispose();
      sceneTarget = null;
      warpMaterial.uniforms.map.value = null;
    }
  };

  const composite = (renderer: THREE.WebGLRenderer, w: number, h: number): void => {
    const box = rect(w, h);
    if (box.width < 2 || box.height < 2) return;
    // WebGL's origin is the BOTTOM-left; the rect is measured from the top.
    const y = h - box.y - box.height;
    const inset = Math.min(BEZEL, Math.floor(box.height / 4));
    glass.scale.set(1 - (2 * inset) / box.width, 1 - (2 * inset) / box.height, 1);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setViewport(box.x, y, box.width, box.height);
    renderer.setScissor(box.x, y, box.width, box.height);
    renderer.setScissorTest(true);
    renderer.render(quadScene, quadCamera);
    renderer.setScissorTest(false);
    renderer.autoClear = autoClear;
    renderer.setViewport(0, 0, w, h);
  };

  const dispose = (): void => {
    target.dispose();
    sceneTarget?.dispose();
    plane.dispose();
    bezelMaterial.dispose();
    glassMaterial.dispose();
    warpMaterial.dispose();
  };

  return { camera, aim, setGlass, rect, fill, composite, texture: glassMap, dispose };
}
