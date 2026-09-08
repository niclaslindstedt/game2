// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TV CAM'S LENS — depth of field, and the only post-process pass in the
// game that is not the mirror's.
//
// It exists because of what the TV cam IS. Every other camera is a few metres
// off the car and everything worth looking at is the same distance away, so a
// pinhole lens is not a lie. A trackside tripod is looking at a car two
// hundred metres up the road through everything in between, on a long lens
// (camera-tv.ts opens down to `TV.fovMin`), and a long lens has a focal plane
// you can SEE: the grass in front of the camera and the ridge behind the
// stage both go soft, and the one thing in the world that is sharp is the
// car. That separation is most of what makes a broadcast frame read as a
// broadcast frame rather than as a screenshot from further away.
//
// It costs one full-screen pass and one depth texture, and it is charged for:
// it runs only under the TV cam and only on DETAIL ▸ EFFECTS ▸ FULL, which is
// the same budget the mirror's curved glass and the screen rain ride on. Any
// other camera, or any lesser budget, draws to the canvas exactly as before
// and pays nothing at all — not even the target.
//
// The blur is a gather, and gathers have one classic failure: a sharp
// foreground smeared into a blurred background because the background's wide
// disc reached over and sampled it. `weigh` is the fix — a tap only counts
// toward a disc it is itself blurry enough to belong in — and it is the
// reason each tap reads depth as well as colour.

import * as THREE from "three";

/** The lens, as numbers. */
export const TV_LENS = {
  /** How much defocus a fully out-of-focus subject gets, as a share of the
   * FRAME HEIGHT rather than in pixels: the blur has to look the same on a
   * phone and on a desktop, and a radius in pixels does not. */
  spread: 0.006,
  /** The ceiling on that, same units. A disc wider than this stops reading as
   * a lens and starts reading as a smear — and every tap of it is a texture
   * read, so it is the cost ceiling too. */
  maxSpread: 0.012,
  /** Taps per pixel. A golden-angle spiral, so the disc fills evenly at any
   * count and there is no ring to see; sixteen is where a moving frame stops
   * showing the individual samples. */
  taps: 16,
  /** How far either side of the focal distance stays sharp, as a share of
   * that distance. Without it the car itself is the only thing in focus and
   * the wheels at the near end of it are already soft, which reads as a
   * mis-focus rather than as depth. */
  hold: 0.16,
};

/** A full-screen triangle's worth of quad, and the camera that draws it. */
const QUAD_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Colour in, colour out, with the circle of confusion solved per pixel from
 * the depth buffer. `viewDepth` is the standard perspective un-projection —
 * the renderer's depth buffer is the ordinary one, not logarithmic. */
const FRAGMENT = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float focus;
uniform float spread;
uniform float maxSpread;
uniform float hold;
varying vec2 vUv;

const int TAPS = ${TV_LENS.taps};
const float GOLDEN = 2.39996323;

float viewDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - ndc * (far - near));
}

/** The circle of confusion at a point, in pixels. Relative rather than
 * absolute: what matters is how far out of focus a thing is compared with how
 * far away it is, which is why the far country saturates at one disc while
 * a leaf in front of the lens goes to the ceiling. */
float coc(vec2 uv, float height) {
  float z = viewDepth(uv);
  float off = abs(z - focus) / max(z, 1.0);
  off = max(0.0, off - hold);
  return min(off * spread * height, maxSpread * height);
}

void main() {
  float height = 1.0 / texel.y;
  float radius = coc(vUv, height);
  vec3 sum = texture2D(tColor, vUv).rgb;
  float weight = 1.0;
  // Under a pixel of disc there is nothing to gather: the in-focus band is
  // the one place this pass is free, and on a long lens it is the car, which
  // is the thing being looked at.
  if (radius >= 1.0) {
    for (int i = 0; i < TAPS; i++) {
      float t = (float(i) + 0.5) / float(TAPS);
      float r = sqrt(t);
      float a = float(i) * GOLDEN;
      vec2 at = vUv + vec2(cos(a), sin(a)) * r * radius * texel;
      // A tap only counts toward a disc it is itself blurry enough to belong
      // in. Without this the sharp car bleeds outward into the soft country
      // behind it and wears a halo — the one artefact that makes a gather
      // look like a bug rather than like a lens.
      float w = step(r * radius - 1.0, coc(at, height));
      sum += texture2D(tColor, at).rgb * w;
      weight += w;
    }
  }
  gl_FragColor = vec4(sum / weight, 1.0);
  // THE LAST LINE, AND THE ONE THAT IS NOT OPTIONAL. Drawing the scene into a
  // render target instead of onto the canvas moves this pass in front of the
  // one thing three.js does for free at the end of a frame: the conversion
  // out of the working colour space into the canvas's. Tone mapping already
  // happened — it lives in each material's own shader, so it went into the
  // target with the pixels — but the encode did not, and a linear frame
  // written to an sRGB canvas is a frame that comes out visibly DARK. It is
  // not subtle and it is not a lighting bug: it is this line missing.
  #include <colorspace_fragment>
}
`;

export type TvLens = {
  /** Draw `scene` through the lens, focused `focus` metres out. Falls back to
   * an ordinary draw when the pass cannot be stood up. */
  draw: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    focus: number,
    width: number,
    height: number,
  ) => void;
  /** Give the target back. Called when the view leaves the TV cam or the
   * effects budget drops — a full-size colour and depth pair is real memory,
   * and a camera nobody is looking through should not be holding one. */
  dispose: () => void;
};

export function createTvLens(): TvLens {
  let target: THREE.WebGLRenderTarget | null = null;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      texel: { value: new THREE.Vector2(1, 1) },
      near: { value: 0.25 },
      far: { value: 900 },
      focus: { value: 50 },
      spread: { value: TV_LENS.spread },
      maxSpread: { value: TV_LENS.maxSpread },
      hold: { value: TV_LENS.hold },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);

  const dispose = (): void => {
    target?.depthTexture?.dispose();
    target?.dispose();
    target = null;
    material.uniforms.tColor.value = null;
    material.uniforms.tDepth.value = null;
  };

  return {
    dispose,
    draw: (renderer, scene, camera, focus, width, height) => {
      const ratio = renderer.getPixelRatio();
      const px = Math.max(2, Math.round(width * ratio));
      const py = Math.max(2, Math.round(height * ratio));
      if (!target) {
        const depth = new THREE.DepthTexture(px, py);
        depth.type = THREE.UnsignedIntType;
        target = new THREE.WebGLRenderTarget(px, py, { depthTexture: depth });
      } else if (target.width !== px || target.height !== py) {
        target.setSize(px, py);
      }

      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);

      const uniforms = material.uniforms;
      uniforms.tColor.value = target.texture;
      uniforms.tDepth.value = target.depthTexture;
      (uniforms.texel.value as THREE.Vector2).set(1 / px, 1 / py);
      uniforms.near.value = camera.near;
      uniforms.far.value = camera.far;
      uniforms.focus.value = Math.max(1, focus);
      renderer.render(quadScene, QUAD_CAMERA);
    },
  };
}
