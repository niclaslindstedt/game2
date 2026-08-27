// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The instrument every sound in the game is played on: a small WebAudio
// synthesizer. Nothing ships as an audio file — a sound is a list of
// parameters, which keeps the app tiny, keeps it offline, and makes the
// sound design as diffable as the car specs.
//
// THE VOICE MODEL IS PSX-ERA, NOT 16-BIT, and the difference is the point.
// A chip voice is an oscillator with an envelope: bright, thin, unmistakably
// synthetic. A PlayStation-era rally game played SAMPLES through a filter —
// engines with grit in them, gravel that hisses rather than ticks, impacts
// with a body behind the crack. Four things in this synth exist to reach
// that register and none of them are chip:
//
//   * NOISE HAS A COLOUR. White noise is a hiss; brown noise is a rumble, and
//     a rumble is what a car on gravel, a wind and a distant impact are all
//     made of. Pink sits between them and is the tyre-roar band.
//   * NOISE HAS AN ENVELOPE. A chip's noise burst is a flat block that stops.
//     A real texture swells and holds — which is what lets a scrub, a slide
//     and a wind be built out of overlapping grains rather than out of ticks.
//   * FILTERS SWEEP. A static cutoff is a tone colour; a moving one is a
//     GESTURE — the whoosh past a rock, the spray leaving a ford, the body of
//     a crash opening up and closing again. This is the single biggest step
//     away from chip and it costs one extra ramp.
//   * OSCILLATORS DISTORT. `drive` folds a waveform through a shaper, which
//     is how a triangle becomes an engine instead of a flute. A sampled
//     engine's harmonics come from a real combustion event; a shaped triangle
//     is the cheapest honest approximation there is.
//
// Everything else is the classic arrangement: an attack/hold/decay envelope,
// a detuned second oscillator for width, delayed vibrato, stereo pan, and one
// shared feedback-delay bus every voice can send into so overlapping sounds
// sit in the same room.

// The types are NOT re-exported from here on purpose: a module that wanted
// only `ToneOptions` would pull this whole file — and `AudioContext` with it —
// into builds that have no browser. Everything that merely DESCRIBES a sound
// imports from `voice.ts`; this file is for making one.
import type { FilterOptions, NoiseColor, Synth } from "./voice.ts";

// The shared echo: a filtered feedback delay every voice can send into. One
// instance per context keeps overlapping sounds in the same room. Short and
// damped — this is a forest road, not a cathedral.
const ECHO_DELAY_S = 0.19;
const ECHO_FEEDBACK = 0.28;
const ECHO_DAMP_HZ = 2200;

// The master limiter: every voice (and the echo bus) sums into this
// compressor instead of connecting straight to the destination. A stage runs
// an engine bed, a tyre bed, wind, and whatever the car just hit, all at once,
// and their sum regularly exceeds full scale — which the destination renders
// as hard clipping. The threshold sits above any single sound's peak (volumes
// live in 0.02–0.1 ≈ −34…−20 dBFS), so isolated sounds pass untouched and only
// overlapping stacks get squeezed.
const LIMITER_THRESHOLD_DB = -12;
const LIMITER_KNEE_DB = 6;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_S = 0.002;
const LIMITER_RELEASE_S = 0.18;

// How long a "running" context's clock may sit still after a foreground or
// gesture event before it is declared a zombie (see probeZombie below). A
// genuinely running context advances currentTime every render quantum
// (~3 ms), so a third of a second of stillness is unambiguous.
const ZOMBIE_PROBE_MS = 350;

/** How many samples the waveshaper curve is drawn at. 1024 is past the point
 * where the steps are audible on any of these waveforms. */
const SHAPER_STEPS = 1024;

/** Is the page in the background right now? Treated as visible wherever there
 * is no document (a test, a headless host) so nothing is silenced by
 * accident. */
const pageHidden = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * The waveshaper transfer curve for a given drive, 0..1.
 *
 * A soft-clip (`tanh`-shaped) rather than a hard one: hard clipping folds
 * every harmonic in at once and reads as breakage, which is the sound of a
 * broken speaker rather than of an engine under load. The amount is
 * exponential in `drive` because the ear is — a linear knob spends most of its
 * travel in territory that all sounds the same.
 */
function shaperCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = Math.pow(2, 1 + 6 * drive) - 1;
  const curve = new Float32Array(SHAPER_STEPS);
  for (let i = 0; i < SHAPER_STEPS; i++) {
    const x = (i / (SHAPER_STEPS - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/**
 * Fill `data` with noise of the given colour, with a linear fade-out baked in
 * over the last `fadeFrom`..1 of the buffer.
 *
 * Pink and brown are one-pole filters over white rather than the textbook
 * multi-pole approximations: the spectral slope is what the ear reads, and one
 * pole gets it close enough that no listener could pick the difference out of
 * a car sliding sideways. Both are re-normalised, because an unnormalised
 * brown is roughly a tenth of white's level and every volume in the bank would
 * have to know which colour it was written for.
 */
function fillNoise(data: Float32Array, color: NoiseColor, fadeFrom: number): void {
  const n = data.length;
  if (color === "white") {
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  } else if (color === "pink") {
    // One pole at ~0.75 tilts the spectrum by about 3 dB/octave.
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.75 * last + 0.25 * white;
      data[i] = last * 3.2;
    }
  } else {
    // …and a pole at ~0.96 by about 6, which is a rumble.
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * white;
      data[i] = last * 11;
    }
  }
  // The tail fade lives in the buffer rather than in the gain node so a
  // one-shot burst always ends at zero, whatever envelope is over it.
  const fadeStart = Math.floor(n * fadeFrom);
  const fadeLen = Math.max(1, n - fadeStart);
  for (let i = fadeStart; i < n; i++) data[i] *= 1 - (i - fadeStart) / fadeLen;
}

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let echoInput: GainNode | null = null;
  let master: AudioNode | null = null;
  let listenersArmed = false;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let healAttempted = false;
  let rebuildOnGesture = false;
  /** Shaper curves are shared by drive, quantised — a curve per voice would
   * be a kilobyte of Float32 per grain of an engine bed. */
  const curves = new Map<number, Float32Array<ArrayBuffer>>();

  // iOS puts the context into a non-standard "interrupted" state on app
  // switch / lock; treat anything that isn't running or closed as resumable.
  // Never while the page is BACKGROUNDED, though: every revival path funnels
  // through here, and a resume that lands on a hidden page is the app playing
  // out loud from behind another one.
  const resumeCtx = (c: AudioContext): void => {
    if (pageHidden()) return;
    if (c.state !== "running" && c.state !== "closed") c.resume().catch(() => {});
  };

  // BACKGROUNDING THE APP MUST SILENCE IT — and only an explicit suspend does.
  // Switching to an app that makes no sound of its own interrupts nothing, so
  // the context stays "running" and the game plays on from behind it. It plays
  // SLOWLY, which is the tell: a hidden page's timers are throttled to about
  // 1 Hz, so a scheduler ticking every 90 ms fires once a second and the music
  // grinds along at a quarter speed out of an app nobody is looking at.
  // Suspending is also what hands the audio route back to the OS.
  const suspendCtx = (): void => {
    const c = ctx;
    if (!c || c.state !== "running" || typeof c.suspend !== "function") return;
    // A probe scheduled while visible would land on the suspended context and
    // read its (legitimately) frozen clock as a zombie.
    if (probeTimer !== null) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    healAttempted = false;
    c.suspend().catch(() => {});
  };

  /** Discard the current context and its per-context buses so `ensure` builds
   * a fresh one. Only ever called for a confirmed-dead context. */
  const teardown = (): void => {
    const old = ctx;
    ctx = null;
    master = null;
    echoInput = null;
    if (probeTimer !== null) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    healAttempted = false;
    if (old && old.state !== "closed" && typeof old.close === "function") {
      old.close().catch(() => {});
    }
  };

  // iOS WebKit sometimes hands back a ZOMBIE context after an app switch:
  // state reports "running" but the clock — and the output route — are dead.
  // resume() is a no-op on a "running" context, so no state-driven recovery
  // can catch it; watch the clock instead. If a running context's currentTime
  // hasn't moved ZOMBIE_PROBE_MS after a foreground/gesture event, first force
  // a suspend→resume cycle (which makes iOS re-activate the audio session, and
  // needs no gesture); if the clock is STILL frozen after that, flag the
  // context for replacement on the player's next touch.
  const probeZombie = (): void => {
    const c = ctx;
    if (!c || probeTimer !== null || c.state !== "running") return;
    if (pageHidden()) return; // a backgrounded context is meant to be frozen
    const t0 = c.currentTime;
    probeTimer = setTimeout(() => {
      probeTimer = null;
      if (ctx !== c || c.state !== "running") return;
      if (c.currentTime !== t0) {
        healAttempted = false; // clock moves — genuinely alive
        return;
      }
      if (!healAttempted && typeof c.suspend === "function") {
        healAttempted = true;
        c.suspend()
          // The page can go away mid-cycle; finishing the heal then would hand
          // a backgrounded app its sound back.
          .then(() => (pageHidden() ? undefined : c.resume()))
          .catch(() => {})
          .then(() => probeZombie()); // verify the heal actually took
      } else {
        rebuildOnGesture = true;
      }
    }, ZOMBIE_PROBE_MS);
  };

  // Wired once, against the live `ctx` binding rather than a specific context,
  // so they keep working across a zombie-context rebuild.
  const armListeners = (): void => {
    if (listenersArmed) return;
    listenersArmed = true;
    const onVisible = (): void => {
      if (document.visibilityState !== "visible") return;
      if (ctx) resumeCtx(ctx);
      probeZombie();
    };
    // The same event carries both directions — going away silences us, coming
    // back revives us.
    document.addEventListener("visibilitychange", () => {
      if (pageHidden()) suspendCtx();
      else onVisible();
    });
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("focus", onVisible);
    // A page being frozen, bfcached or navigated away doesn't always announce
    // itself through visibilitychange; `pagehide` is the backstop.
    window.addEventListener("pagehide", suspendCtx);
    // iOS revives an interrupted context only from a REAL user gesture — the
    // visibility resumes above are best-effort and routinely no-op there. Take
    // the player's very next touch ANYWHERE, captured so an overlay that stops
    // propagation cannot swallow it, and passive since nothing preventDefaults.
    const onGesture = (): void => {
      if (rebuildOnGesture) {
        // The old context is a confirmed zombie no resume could revive:
        // replace it here, inside the gesture — the only place iOS reliably
        // lets a fresh context start playing.
        rebuildOnGesture = false;
        teardown();
        const fresh = ensure();
        if (fresh) resumeCtx(fresh);
        return;
      }
      if (ctx) resumeCtx(ctx);
      probeZombie();
    };
    const gestureOpts = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", onGesture, gestureOpts);
    document.addEventListener("touchend", onGesture, gestureOpts);
  };

  // May a context start before the player has touched anything? Chromium is
  // the only engine that answers, and a browser grants the policy to an origin
  // with enough media engagement. Anything that cannot answer — Safari, iOS —
  // is treated as "no", because a context built outside a gesture there is one
  // no later gesture can revive.
  const autoplayAllowed = (): boolean => {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as Navigator & { getAutoplayPolicy?: (type: string) => string };
    if (typeof nav.getAutoplayPolicy !== "function") return false;
    try {
      return nav.getAutoplayPolicy("audiocontext") === "allowed";
    } catch {
      return false;
    }
  };

  const ensure = (): AudioContext | null => {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) {
      // A sound fired by a backgrounded page must not be what builds the one
      // context: born outside a gesture it lands in a state iOS will not
      // resume, and it would be born to play into another app anyway.
      if (pageHidden()) return null;
      ctx = new AudioContext();
      armListeners();
      const c = ctx;
      c.addEventListener("statechange", () => {
        if (ctx !== c) return; // a replaced context no longer speaks for us
        if (document.visibilityState === "visible") {
          resumeCtx(c);
          probeZombie();
        }
      });
    }
    return ctx;
  };

  const masterBus = (c: AudioContext): AudioNode => {
    if (!master) {
      if (typeof c.createDynamicsCompressor === "function") {
        const limiter = c.createDynamicsCompressor();
        limiter.threshold.value = LIMITER_THRESHOLD_DB;
        limiter.knee.value = LIMITER_KNEE_DB;
        limiter.ratio.value = LIMITER_RATIO;
        limiter.attack.value = LIMITER_ATTACK_S;
        limiter.release.value = LIMITER_RELEASE_S;
        limiter.connect(c.destination);
        master = limiter;
      } else {
        master = c.destination;
      }
    }
    return master;
  };

  const echoBus = (c: AudioContext): GainNode => {
    if (!echoInput) {
      echoInput = c.createGain();
      const delay = c.createDelay(1);
      delay.delayTime.value = ECHO_DELAY_S;
      const damp = c.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = ECHO_DAMP_HZ;
      const feedback = c.createGain();
      feedback.gain.value = ECHO_FEEDBACK;
      echoInput.connect(delay);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay);
      damp.connect(masterBus(c));
    }
    return echoInput;
  };

  /** Envelope → optional pan → master limiter (+ optional echo send). */
  const output = (c: AudioContext, gain: GainNode, pan: number, echo: number): void => {
    let tail: AudioNode = gain;
    if (pan !== 0 && typeof c.createStereoPanner === "function") {
      const panner = c.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(masterBus(c));
    if (echo > 0) {
      const send = c.createGain();
      send.gain.value = Math.min(1, echo);
      tail.connect(send);
      send.connect(echoBus(c));
    }
  };

  /** Insert the filter, sweeping its cutoff across the sound when asked. */
  const applyFilter = (
    c: AudioContext,
    source: AudioNode,
    filter: FilterOptions | undefined,
    t0: number,
    t1: number,
  ): AudioNode => {
    if (!filter) return source;
    const node = c.createBiquadFilter();
    node.type = filter.type;
    const from = Math.max(20, filter.frequency);
    node.frequency.setValueAtTime(from, t0);
    if (filter.to !== undefined && filter.to !== filter.frequency) {
      // Exponential, because cutoff is heard in octaves: a linear sweep from
      // 200 to 6000 Hz spends nine tenths of its travel above the octave the
      // ear was following.
      node.frequency.exponentialRampToValueAtTime(Math.max(20, filter.to), t1);
    }
    if (filter.q !== undefined) node.Q.value = filter.q;
    source.connect(node);
    return node;
  };

  /** The shaper for this drive, or null when the voice is clean. */
  const shaper = (c: AudioContext, drive: number): WaveShaperNode | null => {
    if (drive <= 0 || typeof c.createWaveShaper !== "function") return null;
    const key = Math.round(Math.min(1, drive) * 20) / 20;
    let curve = curves.get(key);
    if (!curve) {
      curve = shaperCurve(key);
      curves.set(key, curve);
    }
    const node = c.createWaveShaper();
    node.curve = curve;
    node.oversample = "2x";
    return node;
  };

  /**
   * The attack/hold/decay envelope, written onto `gain` between t0 and t1.
   * Shared by tone and noise so a pitched bed and a noise bed tile the same
   * way — the whole reason a slide's scrub can sit on top of an engine
   * without either of them pulsing against the other.
   */
  const envelope = (
    gain: GainNode,
    target: number,
    t0: number,
    t1: number,
    attackMs: number,
    holdMs: number,
  ): void => {
    // An exponential ramp may not touch zero — WebAudio throws rather than
    // silently flooring it — and a voice CAN legitimately arrive at zero: a
    // muted track in the audition page is a patch whose volume is 0. The floor
    // is far below anything audible, so a voice that lands on it is silence
    // either way; what it buys is that no caller has to know the rule.
    const peak = Math.max(1e-5, target);
    const durationMs = (t1 - t0) * 1000;
    let level = t0; // when the voice is up at `peak` and the decay may begin
    if (attackMs > 0) {
      level = t0 + Math.min(attackMs, durationMs * 0.5) / 1000;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, level);
    } else {
      gain.gain.setValueAtTime(peak, t0);
    }
    // THE HOLD NEEDS ITS OWN EVENT TO EXIST AT ALL: a ramp starts from the
    // time of the PREVIOUS automation point, so without this the decay below
    // would begin at the top of the attack and the voice would fall through
    // the sustain rather than sitting on it. A hair of the duration is always
    // left for the decay itself.
    if (holdMs > 0) {
      const decayFrom = Math.min(level + holdMs / 1000, t1 - 0.005);
      if (decayFrom > level) gain.gain.setValueAtTime(peak, decayFrom);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  };

  return {
    unlock() {
      const c = ensure();
      if (c) resumeCtx(c);
    },

    autostart() {
      // An existing context needs no permission — nudging it is what `resume`
      // already does, and it is the "came back" case.
      if (ctx) {
        resumeCtx(ctx);
        return;
      }
      if (!autoplayAllowed()) return;
      const c = ensure();
      if (c) resumeCtx(c);
    },

    resume() {
      // Only nudge a context that already exists — never create one here, so
      // this stays safe to call from a timer or event outside a user gesture.
      if (ctx) resumeCtx(ctx);
    },

    now() {
      // Never instantiate the context here: creating an AudioContext outside a
      // user gesture leaves it in a state iOS Safari will not reliably resume,
      // so a later unlock() could fail to reach "running" and every scheduler
      // reading this clock would stay silent. The context is created only in
      // unlock(), which runs from a real gesture.
      return ctx && ctx.state === "running" ? ctx.currentTime : null;
    },

    tone({
      type = "square",
      from,
      to = from,
      durationMs,
      volume = 0.06,
      delayMs = 0,
      at,
      attackMs = 0,
      holdMs = 0,
      detuneCents = 0,
      vibrato,
      pan = 0,
      echo = 0,
      filter,
      drive = 0,
    }) {
      const c = ensure();
      if (!c) return;
      if (c.state !== "running") {
        resumeCtx(c); // nudge a suspended context back; this one sound is
        return; //       dropped, but audio recovers for the next.
      }
      const t0 = at ?? c.currentTime + delayMs / 1000;
      const t1 = t0 + durationMs / 1000;

      // A detuned pair plays two half-loud oscillators around the pitch.
      const detunes = detuneCents > 0 ? [detuneCents, -detuneCents] : [0];
      const peak = detunes.length > 1 ? volume * 0.6 : volume;

      const gain = c.createGain();
      envelope(gain, peak, t0, t1, attackMs, holdMs);

      const mix = c.createGain(); // oscillators sum here, pre-shaper
      // Drive BEFORE the filter, which is the order a real signal chain uses
      // and the only one that sounds right: distorting after the filter puts
      // the new harmonics outside everything the filter was there to shape.
      let chain: AudioNode = mix;
      const shape = shaper(c, drive);
      if (shape) {
        // A shaper clips at ±1, so the oscillators have to arrive hot enough
        // to reach the curve's knee — the envelope's level is applied after.
        mix.gain.value = 1 + 6 * drive;
        chain.connect(shape);
        chain = shape;
      }
      applyFilter(c, chain, filter, t0, t1).connect(gain);
      output(c, gain, pan, echo);

      for (const cents of detunes) {
        const osc = c.createOscillator();
        osc.type = type;
        osc.detune.value = cents;
        osc.frequency.setValueAtTime(Math.max(1, from), t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t1);

        if (vibrato) {
          const lfo = c.createOscillator();
          lfo.frequency.value = vibrato.rateHz;
          const depth = c.createGain();
          const rise = t0 + (vibrato.delayMs ?? 0) / 1000;
          depth.gain.setValueAtTime(0, t0);
          depth.gain.linearRampToValueAtTime(vibrato.depthCents, Math.min(rise + 0.08, t1));
          lfo.connect(depth);
          depth.connect(osc.detune);
          lfo.start(t0);
          lfo.stop(t1);
        }

        osc.connect(mix);
        osc.start(t0);
        osc.stop(t1);
      }
    },

    noise({
      durationMs,
      volume = 0.05,
      delayMs = 0,
      at,
      color = "white",
      filter,
      attackMs = 0,
      holdMs = 0,
      pan = 0,
      echo = 0,
    }) {
      const c = ensure();
      if (!c) return;
      if (c.state !== "running") {
        resumeCtx(c);
        return;
      }
      const t0 = at ?? c.currentTime + delayMs / 1000;
      const t1 = t0 + durationMs / 1000;
      const length = Math.max(1, Math.floor((c.sampleRate * durationMs) / 1000));

      // TWO SHAPES, and asking for an envelope is what picks between them. A
      // bare burst fades LINEARLY across the whole buffer: that is a hit, and
      // it is the shape that ends cleanly at full duration. A voice that asked
      // for an attack or a hold is a GRAIN of a bed instead, so the gain node
      // does the shaping and the buffer stays flat until its last breath —
      // a baked fade under a hold would eat exactly the sustain it is for.
      const shaped = attackMs > 0 || holdMs > 0;
      const buffer = c.createBuffer(1, length, c.sampleRate);
      fillNoise(buffer.getChannelData(0), color, shaped ? 0.92 : 0);

      const source = c.createBufferSource();
      source.buffer = buffer;
      const gain = c.createGain();
      if (shaped) envelope(gain, volume, t0, t1, attackMs, holdMs);
      else gain.gain.setValueAtTime(volume, t0);
      applyFilter(c, source, filter, t0, t1).connect(gain);
      output(c, gain, pan, echo);
      source.start(t0);
    },
  };
}
