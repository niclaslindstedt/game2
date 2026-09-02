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
//     A real texture swells and holds.
//   * FILTERS SWEEP. A static cutoff is a tone colour; a moving one is a
//     GESTURE — the whoosh past a rock, the spray leaving a ford, the body of
//     a crash opening up and closing again.
//   * OSCILLATORS SATURATE. `drive` folds a waveform through a soft curve,
//     which is how a triangle becomes an engine instead of a flute.
//
// AND THE BEDS ARE NOT ONE-SHOTS. The engine, the tyres, the wind and the
// weather are LAYERS: node graphs built once and steered with smoothed
// parameter automation on the audio thread (`layer()`). That is the whole
// difference between this instrument and a sampler being asked to fake a
// continuous sound out of overlapping grains — a layer has no cadence to
// tile, no phase to align, no backlog to fire when the main thread stalls,
// and it costs the audio thread a fixed handful of nodes instead of a
// hundred and fifty fresh ones a second. A stalled frame leaves it holding
// its last value; it never leaves a hole.
//
// Everything else is the classic arrangement: an attack/hold/decay envelope,
// a detuned second oscillator for width, delayed vibrato, stereo pan, and one
// shared feedback-delay bus every voice can send into so overlapping sounds
// sit in the same room.

// The types are NOT re-exported from here on purpose: a module that wanted
// only `ToneOptions` would pull this whole file — and `AudioContext` with it —
// into builds that have no browser. Everything that merely DESCRIBES a sound
// imports from `voice.ts`; this file is for making one.
import {
  envelopeShape,
  safeCutoff,
  shaperPush,
  shaperSteepness,
  type FilterOptions,
  type NoiseColor,
  type Synth,
} from "./voice.ts";

// The shared echo: a filtered feedback delay every voice can send into. One
// instance per context keeps overlapping sounds in the same room. Short and
// damped — this is a forest road, not a cathedral.
const ECHO_DELAY_S = 0.19;
const ECHO_FEEDBACK = 0.28;
const ECHO_DAMP_HZ = 2200;

// The master limiter: every voice (and the echo bus) sums into this
// compressor instead of connecting straight to the destination. A stage runs
// an engine, a tyre bed, wind, and whatever the car just hit, all at once,
// and their sum can exceed full scale — which the destination renders as
// hard clipping. The threshold sits above any single sound's peak (volumes
// live in 0.02–0.1 ≈ −34…−20 dBFS), so isolated sounds pass untouched and only
// overlapping stacks get squeezed.
//
// A SLOW-ISH one, deliberately. A limiter with a two-millisecond attack
// reacts INSIDE a cycle of the 30–60 Hz bass the engine bed lives on and
// modulates it, which is distortion nobody asked for. Five milliseconds and
// a gentle knee leave the bass alone and still catch a crash.
const LIMITER_THRESHOLD_DB = -10;
const LIMITER_KNEE_DB = 12;
const LIMITER_RATIO = 12;
const LIMITER_ATTACK_S = 0.005;
const LIMITER_RELEASE_S = 0.25;

// How long a "running" context's clock may sit still after a foreground or
// gesture event before it is declared a zombie (see probeZombie below). A
// genuinely running context advances currentTime every render quantum
// (~3 ms), so a third of a second of stillness is unambiguous.
const ZOMBIE_PROBE_MS = 350;

/** How many samples the waveshaper curve is drawn at. 1024 is past the point
 * where the steps are audible on any of these waveforms. */
const SHAPER_STEPS = 1024;

/**
 * HOW MUCH NOISE IS KEPT PER COLOUR, seconds. Noise is generated ONCE per
 * colour and every voice — a one-shot burst or a looping layer — reads a
 * random window of it. Four seconds is long enough that two voices never
 * audibly share a stretch, and costs under a megabyte per colour.
 */
const NOISE_POOL_S = 4;

/** The saturation curve every LAYER is folded through. One curve, at a
 * middling steepness: how hard a layer is driven is the gain in FRONT of
 * it (`LayerTarget.grit`), which is a smooth parameter where swapping a
 * curve under a running signal is a step. */
const LAYER_DRIVE = 0.6;

/** How far `grit` can push a layer into its curve: the pre-gain runs from a
 * clean 0.35 to this. The floor is under the curve's knee, so a layer with
 * no grit is a layer that is not being shaped at all. */
const GRIT_PUSH = 4;

/** A layer parameter that has moved less than this is not re-scheduled: the
 * automation timeline is a list, and sixty frames a second of no-ops on
 * thirty layers is a list nobody wants to walk. */
const SET_EPSILON = 1e-4;

/** How long after the output route changes — a headset connecting, a car
 * stereo picking the phone up — before the audio session is re-seated. Long
 * enough for the OS to have finished switching; short enough that the gap
 * reads as the switch itself. */
const ROUTE_RESEAT_MS = 250;

/** Is the page in the background right now? Treated as visible wherever there
 * is no document (a test, a headless host) so nothing is silenced by
 * accident. */
const pageHidden = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

/** The waveshaper transfer curve for a given drive, 0..1 — a normalised
 * `tanh`, see `shaperSteepness`. */
function shaperCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = shaperSteepness(drive);
  const curve = new Float32Array(SHAPER_STEPS);
  for (let i = 0; i < SHAPER_STEPS; i++) {
    const x = (i / (SHAPER_STEPS - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/**
 * Fill `data` with noise of the given colour.
 *
 * Pink and brown are one-pole filters over white rather than the textbook
 * multi-pole approximations: the spectral slope is what the ear reads, and one
 * pole gets it close enough that no listener could pick the difference out of
 * a car sliding sideways. Both are re-normalised, because an unnormalised
 * brown is roughly a tenth of white's level and every volume in the bank would
 * have to know which colour it was written for. Brown is also HIGHPASSED at
 * a few hertz on the way out: a one-pole brown wanders below the audio band,
 * and a limiter reacting to a wander nobody can hear pumps everything else.
 *
 * Called once per colour per context — see `noisePool`. The shape of a burst
 * is the GAIN node's business; nothing is baked into the samples, because
 * samples that carry an envelope cannot be shared.
 */
function fillNoise(data: Float32Array, color: NoiseColor, sampleRate: number): void {
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
    // …and a pole at ~0.96 by about 6, which is a rumble — with the drift
    // under the audio band taken back out by a one-pole highpass at 8 Hz.
    const hp = Math.exp((-2 * Math.PI * 8) / sampleRate);
    let last = 0;
    let dcIn = 0;
    let dcOut = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * white;
      const sample = last * 11;
      dcOut = hp * (dcOut + sample - dcIn);
      dcIn = sample;
      data[i] = dcOut;
    }
  }
}

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let echoInput: GainNode | null = null;
  let master: AudioNode | null = null;
  let listenersArmed = false;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let reseatTimer: ReturnType<typeof setTimeout> | null = null;
  let healAttempted = false;
  let rebuildOnGesture = false;
  /** Shaper curves are shared by drive, quantised — a curve per voice would
   * be a kilobyte of Float32 per note of a score. */
  const curves = new Map<number, Float32Array<ArrayBuffer>>();
  /** One long buffer of each colour, read at a random offset by every noise
   * voice. Cleared with the context that owns them. */
  const pools = new Map<NoiseColor, AudioBuffer>();

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
   * a fresh one. Only ever called for a confirmed-dead context. Every layer
   * built on the old one reports itself dead and its owner rebuilds it. */
  const teardown = (): void => {
    const old = ctx;
    ctx = null;
    master = null;
    echoInput = null;
    pools.clear(); // an AudioBuffer belongs to the context that made it
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

  // THE OUTPUT ROUTE CHANGED UNDER A RUNNING CONTEXT — a headset connected,
  // a car stereo picked the phone up, an earbud came out. iOS keeps the
  // context "running" through that and does not always re-seat the audio
  // session on the new route, and what comes out of the new route while it
  // is un-seated is the sound the player reports as crackle. A suspend →
  // resume cycle is the documented way to make the platform re-open the
  // session, it needs no gesture, and on a route that did switch cleanly it
  // costs a quarter of a second of quiet nobody notices under the switch.
  const reseatRoute = (): void => {
    if (reseatTimer !== null) clearTimeout(reseatTimer);
    reseatTimer = setTimeout(() => {
      reseatTimer = null;
      const c = ctx;
      if (!c || c.state !== "running" || pageHidden()) return;
      if (typeof c.suspend !== "function") return;
      c.suspend()
        .then(() => (pageHidden() ? undefined : c.resume()))
        .catch(() => {})
        .then(() => probeZombie());
    }, ROUTE_RESEAT_MS);
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
    // The route watch. `devicechange` is the one signal a page gets that the
    // output moved; browsers that withhold it simply never fire it.
    const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (devices && typeof devices.addEventListener === "function") {
      devices.addEventListener("devicechange", reseatRoute);
    }
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
      // "balanced" rather than the default "interactive": the render buffer
      // is a few tens of milliseconds instead of the smallest the hardware
      // offers, which is nothing against the latency a Bluetooth link adds
      // anyway and is the difference between a buffer that survives a busy
      // frame and one that underruns — an underrun is a crackle, and the
      // main thread here is also drawing a forest.
      ctx = new AudioContext({ latencyHint: "balanced" });
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

  /** Envelope → optional pan → master limiter (+ optional echo send). Returns
   * the panner when one was made, so a layer can steer it. */
  const output = (
    c: AudioContext,
    gain: GainNode,
    pan: number,
    echo: number,
    alwaysPan = false,
  ): StereoPannerNode | null => {
    let tail: AudioNode = gain;
    let panner: StereoPannerNode | null = null;
    if ((pan !== 0 || alwaysPan) && typeof c.createStereoPanner === "function") {
      panner = c.createStereoPanner();
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
    return panner;
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
    // HELD UNDER NYQUIST, and the rate is the LIVE context's — see
    // `safeCutoff`. A cutoff past half the sample rate is not a bright filter,
    // it is undefined coefficients, and on the 16 kHz session iOS hands a
    // Bluetooth headset that is every hi-hat in the game screaming.
    const from = safeCutoff(filter.frequency, c.sampleRate);
    node.frequency.setValueAtTime(from, t0);
    const to = filter.to === undefined ? from : safeCutoff(filter.to, c.sampleRate);
    if (to !== from) {
      // Exponential, because cutoff is heard in octaves: a linear sweep from
      // 200 to 6000 Hz spends nine tenths of its travel above the octave the
      // ear was following.
      node.frequency.exponentialRampToValueAtTime(to, t1);
    }
    if (filter.q !== undefined) node.Q.value = filter.q;
    source.connect(node);
    return node;
  };

  /** This context's noise of a given colour, generated on first use. */
  const noisePool = (c: AudioContext, color: NoiseColor): AudioBuffer => {
    let pool = pools.get(color);
    if (!pool || pool.sampleRate !== c.sampleRate) {
      pool = c.createBuffer(1, Math.ceil(c.sampleRate * NOISE_POOL_S), c.sampleRate);
      fillNoise(pool.getChannelData(0), color, c.sampleRate);
      pools.set(color, pool);
    }
    return pool;
  };

  /** The shaper for this drive, or null when the voice is clean. `oversample`
   * is what keeps the new harmonics from folding back down as aliasing; the
   * few layers that run for a whole stage can afford the expensive setting. */
  const shaper = (
    c: AudioContext,
    drive: number,
    oversample: OverSampleType = "2x",
  ): WaveShaperNode | null => {
    if (drive <= 0 || typeof c.createWaveShaper !== "function") return null;
    const key = Math.round(Math.min(1, drive) * 20) / 20;
    let curve = curves.get(key);
    if (!curve) {
      curve = shaperCurve(key);
      curves.set(key, curve);
    }
    const node = c.createWaveShaper();
    node.curve = curve;
    node.oversample = oversample;
    return node;
  };

  /**
   * Play the gain curve `voice.ts` describes onto a real GainNode. The SHAPE
   * lives there (`envelopeShape`) because it is the part worth reading and
   * testing without a browser; all that is left here is writing it down.
   */
  const envelope = (
    gain: GainNode,
    target: number,
    t0: number,
    t1: number,
    attackMs: number,
    holdMs: number,
    decay: "exp" | "lin" = "exp",
  ): void => {
    for (const point of envelopeShape(target, t0, t1, attackMs, holdMs, decay)) {
      if (point.ramp === "set") gain.gain.setValueAtTime(point.value, point.at);
      else if (point.ramp === "lin") gain.gain.linearRampToValueAtTime(point.value, point.at);
      else gain.gain.exponentialRampToValueAtTime(point.value, point.at);
    }
  };

  /** Steer one AudioParam toward `value` over the time constant `tau`, only
   * when it has actually moved — see `SET_EPSILON`. */
  const steer = (
    param: AudioParam,
    last: number,
    value: number,
    at: number,
    tau: number,
  ): number => {
    if (Math.abs(value - last) <= SET_EPSILON * Math.max(1, Math.abs(value))) return last;
    param.setTargetAtTime(value, at, Math.max(0.005, tau));
    return value;
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
      gain.gain.value = 0;
      envelope(gain, peak, t0, t1, attackMs, holdMs, "exp");

      const mix = c.createGain(); // oscillators sum here, pre-shaper
      // Drive BEFORE the filter, which is the order a real signal chain uses
      // and the only one that sounds right: distorting after the filter puts
      // the new harmonics outside everything the filter was there to shape.
      let chain: AudioNode = mix;
      const shape = shaper(c, drive);
      if (shape) {
        // The curve does nothing to a signal that never reaches its knee —
        // the gain in front of it is what "drive" is.
        mix.gain.value = shaperPush(drive);
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

      // TWO SHAPES, and asking for an envelope is what picks between them. A
      // bare burst fades LINEARLY to nothing across its whole length: that is
      // a hit. A voice that asked for an attack or a hold is a swell, and
      // gets the exponential tail a note has.
      const shaped = attackMs > 0 || holdMs > 0;
      const gain = c.createGain();
      envelope(gain, volume, t0, t1, attackMs, holdMs, shaped ? "exp" : "lin");

      // A WINDOW ONTO THE SHARED POOL, not a buffer of this voice's own — see
      // NOISE_POOL_S. The offset is random so no two voices read the same
      // stretch (identical noise twice over is a comb filter, and an ear hears
      // it as a pitch); the loop is only there so a sound longer than the pool
      // still has samples to play.
      const buffer = noisePool(c, color);
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const offset = Math.random() * buffer.duration;
      applyFilter(c, source, filter, t0, t1).connect(gain);
      output(c, gain, pan, echo);
      source.start(t0, offset);
      // The pool never runs out, so the voice has to be told where to end.
      source.stop(t1);
    },

    layer(spec) {
      const c = ensure();
      if (!c || c.state !== "running") return null;
      const owner = c;
      const t0 = c.currentTime;

      // The chain's tail: level → pan → master (+ echo). Built first so the
      // source can be wired into whatever sits in front of it.
      const gain = c.createGain();
      gain.gain.value = 0;
      const panner = output(c, gain, 0, spec.echo ?? 0, true);

      let filterNode: BiquadFilterNode | null = null;
      if (spec.filter) {
        filterNode = c.createBiquadFilter();
        filterNode.type = spec.filter.type;
        filterNode.frequency.value = safeCutoff(1000, c.sampleRate);
        if (spec.filter.q !== undefined) filterNode.Q.value = spec.filter.q;
        filterNode.connect(gain);
      }
      const head: AudioNode = filterNode ?? gain;

      const oscillators: OscillatorNode[] = [];
      const sources: AudioScheduledSourceNode[] = [];
      let push: GainNode | null = null;
      if (spec.kind === "tone") {
        const mix = c.createGain();
        let chain: AudioNode = mix;
        if ((spec.drive ?? 0) > 0) {
          // A fixed curve pushed by a steerable gain — see `LAYER_DRIVE`.
          // Normalised back down after the curve so `grit` changes the
          // timbre far more than the level.
          const shape = shaper(c, LAYER_DRIVE, "4x");
          if (shape) {
            push = mix;
            mix.gain.value = 0.35;
            const trim = c.createGain();
            trim.gain.value = 0.7;
            chain.connect(shape);
            shape.connect(trim);
            chain = trim;
          }
        }
        chain.connect(head);
        const width = spec.detuneCents ?? 0;
        const detunes = width > 0 ? [width, -width] : [0];
        for (const cents of detunes) {
          const osc = c.createOscillator();
          osc.type = spec.type ?? "triangle";
          osc.detune.value = cents;
          osc.frequency.value = 100;
          if (spec.vibrato) {
            const lfo = c.createOscillator();
            lfo.frequency.value = spec.vibrato.rateHz;
            const depth = c.createGain();
            depth.gain.value = spec.vibrato.depthCents;
            lfo.connect(depth);
            depth.connect(osc.detune);
            lfo.start(t0);
            sources.push(lfo);
          }
          osc.connect(mix);
          osc.start(t0);
          oscillators.push(osc);
          sources.push(osc);
        }
      } else {
        const buffer = noisePool(c, spec.color ?? "white");
        const source = c.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(head);
        source.start(t0, Math.random() * buffer.duration);
        sources.push(source);
      }

      // What each parameter was last steered to, so a frame that changes
      // nothing schedules nothing.
      const pairScale = oscillators.length > 1 ? 0.6 : 1;
      let lastLevel = 0;
      let lastHz = 100;
      let lastCutoff = filterNode ? filterNode.frequency.value : 0;
      let lastPush = 0.35;
      let lastPan = 0;
      let stopped = false;

      return {
        set(target, glideS) {
          if (stopped || ctx !== owner || owner.state === "closed") return;
          const now = owner.currentTime;
          lastLevel = steer(
            gain.gain,
            lastLevel,
            Math.max(0, target.level) * pairScale,
            now,
            glideS,
          );
          if (target.hz !== undefined && oscillators.length > 0) {
            const hz = Math.max(1, target.hz);
            if (hz !== lastHz) {
              // A pitch moves on a shorter constant than a level: the ear
              // follows a glide far more closely than a fade, and a rev
              // that lags the needle by a tenth reads as a slow engine.
              for (const osc of oscillators) osc.frequency.setTargetAtTime(hz, now, glideS * 0.5);
              lastHz = hz;
            }
          }
          if (target.cutoff !== undefined && filterNode) {
            lastCutoff = steer(
              filterNode.frequency,
              lastCutoff,
              safeCutoff(target.cutoff, owner.sampleRate),
              now,
              glideS,
            );
          }
          if (target.grit !== undefined && push) {
            const amount = 0.35 + (GRIT_PUSH - 0.35) * Math.min(1, Math.max(0, target.grit));
            lastPush = steer(push.gain, lastPush, amount, now, glideS);
          }
          if (target.pan !== undefined && panner) {
            lastPan = steer(
              panner.pan,
              lastPan,
              Math.max(-1, Math.min(1, target.pan)),
              now,
              glideS,
            );
          }
        },
        stop() {
          if (stopped) return;
          stopped = true;
          if (owner.state === "closed") return;
          const now = owner.currentTime;
          // Out over a few hundredths rather than at once — a layer cut at
          // full level is the step every other part of this file avoids.
          gain.gain.setTargetAtTime(0, now, 0.02);
          for (const source of sources) {
            try {
              source.stop(now + 0.15);
            } catch {
              // Already stopped, or the context went away under it.
            }
          }
        },
        alive: () => !stopped && ctx === owner && owner.state !== "closed",
      };
    },
  };
}
