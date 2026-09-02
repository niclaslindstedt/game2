// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A RACK OF LAYERS — the one piece of plumbing every bed shares.
//
// A bed is a table of layer specs, a table of glides, and a function from
// the state to a table of targets. This is what stands between that function
// and the synth: it builds each layer the first time it is asked for,
// rebuilds one whose context has gone away under it (the iOS zombie
// replacement), and steers every one toward its target on its own glide.
// It never throws and never blocks: a layer the synth cannot build yet — the
// context is still locked — is simply tried again next frame.

import type { Layer, LayerSpec, LayerTarget, Synth } from "../../lib/voice.ts";

export type Rack<K extends string> = {
  /** Steer every layer toward its target, building any that are missing. */
  apply: (targets: Record<K, LayerTarget>) => void;
  /** Tear every layer down; the next `apply` rebuilds them. */
  stop: () => void;
  /** How many layers are currently built and alive — for the tests. */
  live: () => number;
};

export function createRack<K extends string>(
  synth: Synth,
  specs: Record<K, LayerSpec>,
  glide: Record<K, number>,
): Rack<K> {
  const layers = new Map<K, Layer>();
  const names = Object.keys(specs) as K[];
  return {
    apply(targets) {
      for (const name of names) {
        let layer = layers.get(name);
        if (!layer || !layer.alive()) {
          const fresh = synth.layer(specs[name]);
          if (!fresh) {
            layers.delete(name);
            continue;
          }
          layers.set(name, fresh);
          layer = fresh;
        }
        layer.set(targets[name], glide[name]);
      }
    },
    stop() {
      for (const layer of layers.values()) layer.stop();
      layers.clear();
    },
    live() {
      let n = 0;
      for (const layer of layers.values()) if (layer.alive()) n++;
      return n;
    },
  };
}
