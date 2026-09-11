// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PICTURE OPTIONS, and WHAT EACH ONE ACTUALLY BUYS. The setting is one
// word — "low", "medium", "high" — and every renderer that reads it needs a
// number, a boolean or a pair; those tables are here, one per lever, each
// saying what the lever costs and what it is worth. Nothing here draws
// anything: it is the dictionary between a menu row and a draw call.

/** THE THIRTEEN LEVERS THE RENDERER READS, on FIVE rows the player turns.
 *
 * `resolution`, `drawDistance`, `lighting` and `sky` are their own rows
 * because they are their own decisions, and because each is paid for in a
 * different currency: how SHARP the picture is, how FAR into it you can
 * see, how much of it is LIT, and what the AIR over it is made of. Wanting one
 * without the others is the normal case rather than the exotic one — a retina
 * phone with a modest GPU wants every pixel and the fog pulled in, and a
 * laptop driving a big low-density screen wants the opposite. Tying them
 * together only ever charges a player for something they did not ask for.
 *
 * SKY and LIGHTING are their own rows for a sharper reason than either: both
 * are paid PER PIXEL rather than per object — the sky an octave of noise over
 * a third of the frame, a beam and its shadow lookup on every LIT pixel there
 * is — which is a completely different cost from everything on the DETAIL row
 * below. A machine that is submission-bound gets nothing from thinning the
 * forest and a great deal from a flat sky or a stage under one beam; a
 * machine that is fill-bound gets the opposite. Buried inside one preset,
 * neither player could reach the lever that was theirs.
 *
 * The remaining ten are HOW MUCH WORLD IS DRAWN, and they are one row
 * (`DETAIL_PRESETS`) because they are one judgement with one answer: they
 * all move together with how much headroom the machine has, and nobody has
 * an opinion about undergrowth density that is not also an opinion about
 * verge stones. */
export type VideoSettings = {
  /** Pixel-ratio ceiling — the single biggest lever on a weak GPU, and its
   * own player-facing row (RESOLUTION). Applies the moment it is set. */
  resolution: "low" | "medium" | "high";
  /** The SAME row, as the DESKTOP APP asks it: the height in device pixels
   * the frame is drawn at, or `NATIVE_HEIGHT` for the window's own. Only the
   * desktop shell offers it and only the desktop shell reads it — see
   * `desktop-video.ts` for why a window that belongs to the game gets a
   * question a browser tab cannot be asked. Applies the moment it is set. */
  renderHeight: number;
  /** How far the fog lets you see, which is the same thing as how much
   * stage is submitted: the world is culled at the fog's own far distance
   * (`DRAW_DISTANCE_SCALE`). Its own player-facing row (DISTANCE), and it
   * applies the moment it is set. */
  drawDistance: "near" | "normal" | "far";
  /** Particles, rain, the ambient life and the water on the driver's own
   * glass (`GLASS_RAIN`) — the transient FX budget. Part of DETAIL. */
  effects: "off" | "low" | "full";
  /** HOW MUCH OF A CAR IS BUILT for the sake of what is only visible up
   * close — the two things behind and on the glass, on one ladder because
   * they are one judgement: how much does a car you are looking AT deserve.
   *
   * The cabin: `off` is the solid car — every window an opaque panel with
   * nothing behind it and no wiper arms on it, the cheapest car there is,
   * and the only level that costs no extra draw call per car on the road.
   * `low` furnishes the read: the trim, the dash, the seats and the crew
   * sat in them. `full` adds the roll cage, the harnesses and a steering
   * wheel that turns with the front tyres.
   *
   * The grime film the wipers clear (`SCREEN_GRIME`) rides along: `off`
   * leaves every screen permanently clean, and both levels above it wet the
   * glass — a rival's at a resolution that costs 48 triangles rather than
   * 3,456, which is what makes giving it to a whole grid affordable at all.
   * The RAIN on the player's own windscreen (car/screen-rain.ts) rides the
   * same row for the same reason: it is one more thing on the glass, and a
   * player who has asked for clean screens is asking for clean screens. It
   * answers to the EFFECTS row as well (`GLASS_RAIN`), because drawing it
   * is the dearest pass in the frame.
   *
   * WHICH cars this row reaches is the `glass` row under it: the car being
   * driven always, the rest of the road only when that row says so.
   *
   * Applies to the NEXT stage built, like the undergrowth: both are
   * geometry, and geometry is decided when a car is made. */
  interior: "off" | "low" | "full";
  /** WHOSE WINDOWS CAN BE SEEN THROUGH: which cars on the road get the
   * cabin the INTERIOR row describes, with the wiper arms and the grime on
   * the screens that go with it. Part of DETAIL, and geometry like the
   * cabin, so it lands on the next stage built.
   *
   * Two stops because the cost is per car and the road can carry fifteen.
   * A cabin behind glass is a second cabin's worth of triangles and three
   * extra draw calls on every car that has one — the furniture, the glass
   * in the transparent pass, and the film over it — and on a rival read at
   * two hundred metres none of it is a car's worth of picture. `player` is
   * a grid where only the car being driven is built that way: every other
   * car is the solid one the INTERIOR row's `off` builds, whatever that row
   * says. `all` furnishes the whole entry list, which is what a rally looks
   * like from the car behind — and, being the stop only the top of DETAIL
   * reaches, it is also what turns the WORLD on in the glass rather than
   * only the gradient baked into it (`GLASS_REFLECT`). */
  glass: "player" | "all";
  /** WHOSE BODY FOLDS: which cars on the road are DISFIGURED by what they
   * hit — the panels bent into the shape of the impact, the paint scuffed
   * off the metal that folded, and the dark of the cabin painted into the
   * hole a door left. Part of DETAIL, and it applies the instant it is set:
   * nothing here is geometry, it is the same vertices re-derived from the
   * pristine copy every car keeps.
   *
   * It is the dearest thing on a car that is NOT paid per frame, and the
   * worst possible shape of cost: fifteen thousand vertices re-derived and
   * every face lit again, on the frame a car takes a hit. A pack of fifteen
   * trading paint off one green is that bill several times a second, and it
   * lands as a stutter exactly where the racing is closest.
   *
   * So three stops, on the split every per-car row here uses. `all` is the
   * whole entry list wearing its race: a rally an hour old is a field of
   * bent cars, and it is most of what says the last corner was survived
   * rather than driven. `player` bends the one car the damage is NEWS about
   * — the car being driven, whose every panel is two metres from the camera
   * and whose crush the HUD is reporting — and leaves the field straight.
   * `off` is a field of clean cars for the phone that would rather have the
   * frames.
   *
   * It does not reach what comes OFF a car: a bumper, a door, a pane and a
   * wheel leave on their own events whatever this row says, and a wheel
   * that has gone still drops its corner onto the hub. Those are cheap, and
   * a car that shrugs off a hit that tore its bonnet away would read as a
   * car nothing had happened to. */
  crumple: "off" | "player" | "all";
  /** WHOSE CAR MAY SHED A WHEEL: which cars on the road actually lose one
   * when the ledger says it has gone — the wheel off the hub, the corner
   * dropped onto it, and the car crooked from then on. Part of DETAIL, and
   * it applies the instant it is set.
   *
   * The row above it decides whether a wheel that HAS come off is thrown as
   * a rolling body or is simply gone (`LOOSE_WHEELS`, the EFFECTS row);
   * this one is the question before that, and it is the dearer of the two.
   * A shed wheel is a hub mesh and a material per corner, a body sitting
   * crooked on a fitted plane, and — where the row above allows it — a
   * whole extra rigid body rolling down the stage with its own contacts
   * against the ground, the car and everything standing in the way.
   *
   * Three stops, on the split every per-car row here uses. `all` is a rally
   * where anybody can be put out; `player` sheds only from the car being
   * driven, which is the one whose lost wheel is a fact the driver has to
   * read off the road, and leaves the field's wheels on; `off` keeps every
   * wheel on every car.
   *
   * A car whose wheels STICK still handles like the three-wheeler it is —
   * the ledger is the engine's and this changes nothing in it — so a rival
   * on a wheel it visually still has is a rival driving badly for reasons
   * the picture no longer shows. That is the trade, and at the two hundred
   * metres a rival is usually read at, it is a cheap one.
   *
   * The row only decides whether a wheel may LEAVE. One already gone has
   * gone: turning the row down does not bolt it back on, and turning it up
   * sheds what the ledger had already lost, without throwing it — nothing
   * flies off a car for a wheel it lost a corner ago. */
  wheelLoss: "off" | "player" | "all";
  /** HOW MUCH A FALLING SNOWFLAKE IS WORTH. Part of DETAIL, and it applies
   * the instant it is set — nothing here is geometry, it is one sheet of
   * point sprites and which shader is on it.
   *
   * Two stops, because the two things a flake can be given are one
   * judgement and one bill. `plain` is a soft round dot in the sky's own
   * light, which is what snow has always been and what a phone should be
   * drawing. `crystal` is the pair that makes a blizzard: the flakes are
   * LIT, summing the car-lamp register per particle in the vertex shader
   * the way the dust clouds do (dust-light.ts), so a night stage is a cone
   * of burning flakes in the beams instead of one flat sheet; and each one
   * near the glass is drawn as the CRYSTAL its temperature grows
   * (snow-crystal.ts) rather than as a blob.
   *
   * They ride one stop because they cost the same coin on the same
   * thousands of sprites — a loop over the lamp register on every flake in
   * the frame, and an atlas fetch and a bigger, alpha-blended sprite on the
   * near ones — and because neither is worth having without the other: an
   * unlit crystal at night is invisible, and a lit blob is a lit blob.
   *
   * Below the top stop the sheet also keeps its old floor of sky light
   * (`snowTone`'s `lit`): with no lamps reaching the flakes there is
   * nothing to see them by, and a night blizzard that is honestly dark is
   * a night blizzard nobody can tell is falling. */
  snow: "plain" | "crystal";
  /** How thickly the world is planted with the SOFT stuff — undergrowth,
   * shrubs, stumps. Part of DETAIL, and applies to the NEXT stage built.
   * The undergrowth only: the FOREST's own density is a generator dial the
   * player sets per stage, and this never touches it. */
  flora: "sparse" | "normal" | "lush";
  /** How much LOOSE STONE the ground is scattered with — the chippings
   * spilled across the road's edge that make it run out into the country
   * instead of ending at a line (R16, road-spill.ts), and the cobbles out in
   * the field beyond them. Its own row rather than a share of UNDERGROWTH
   * because it is the one detail lever that is not decoration: what it
   * thins is the transition at the road's edge, which is the thing a driver
   * looks straight down for a whole stage. Thousands of small instances, so
   * it is also the lever with the most frames in it after RESOLUTION. Part
   * of DETAIL, and applies to the NEXT stage built like the undergrowth. */
  ground: "plain" | "normal" | "rich";
  /** WHOSE WHEELS RAISE THE GROUND: the cloud a car TOWS down a loose stage
   * (plume.ts), the grit and the clods its wheels kick up, and the stones a
   * slide throws out sideways (drift-spray.ts). Part of DETAIL, and the one
   * lever on the row that applies the instant it is set rather than at the
   * next stage — none of it is geometry, it is particles spawned per frame
   * off a car that is moving.
   *
   * Three stops because the cost is not shared evenly between the cars on
   * the road. The player's own cloud IS the effect: it is what a loose
   * surface feels like from the seat, and the last of it to give up. The
   * field's is the same substance read from two hundred metres away — worth
   * a great deal to the picture (a rival is a plume over the trees a corner
   * before it is a car) and nothing at all to the driving, so it is the half
   * that goes first on a machine that is struggling: `player` is a stage
   * where only the car you are in is digging. `off` is both, for the phone
   * that would rather have the frames.
   *
   * It does not reach what a CRASH ploughs up, what a landing punches out,
   * or the smoke a tyre boils off tarmac: none of those is a cloud hanging
   * over the stage, they are the moment they belong to, and they ride the
   * EFFECTS budget with every other burst. */
  dust: "off" | "player" | "all";
  /** WHOSE PIPE SMOKES: the puffs off a tailpipe (fumes.ts) — the cloud a
   * car hangs on the line while it is revved, and the thinner one it trails
   * at pace. Part of DETAIL, and like the dust it applies the instant it is
   * set: an exhaust is not geometry, it is a pool spawned into per frame.
   *
   * Its own row rather than a share of the DUST one because the two answer
   * the same question about different substances and the answers do not have
   * to agree: rain settles what a wheel picks up and does nothing at all to
   * what an engine puts out, so a soaked stage where nobody is towing a
   * cloud is still a stage where a grid steams on the line.
   *
   * Three stops for the reason the dust has three. The player's own pipe is
   * read from a couple of metres away, out of the back of the car the frame
   * is drawn from, and it is what the engine looks like from the seat. The
   * field's is one shared pool feeding every crew in range — worth a great
   * deal on a start line and nothing to the driving, so it is the half that
   * goes first: `player` is a stage where only the car being driven smokes.
   * `off` is neither, for the phone that would rather have the frames.
   *
   * It does not reach the ENGINE SMOKE a holed radiator boils off the
   * bonnet: that is damage news the player has to be able to read, not
   * decoration, and it rides the EFFECTS budget with every other burst. */
  exhaust: "off" | "player" | "all";
  /** WHAT THE LIGHT COSTS: the beams the car's lamps throw on the world,
   * the shadow the sun throws under it, and how many of the field's lamps
   * the dust is lit by. Its own player-facing row (LIGHTING), and it applies
   * the instant it is set — every one of them is a light or a map, not
   * geometry.
   *
   * Its own row rather than a share of DETAIL for the reason SKY is one: no
   * object count on that row moves what a light costs, and nothing a light
   * does is cheaper for a thinner forest. It is also the one lever here a
   * player is likely to have a SEPARATE opinion about — the lamps and the
   * shadows are most of what a night stage looks like, and a machine that
   * cannot hold them can still hold a furnished field in daylight.
   *
   * The beams are the expensive half, and the reason the row exists. A
   * beam is a spotlight, and the world is Lambert under real lights: every
   * pixel of every lit surface — the whole terrain, every tree — pays for
   * each spotlight in the scene, whether the beam reaches it or not, and
   * a stage under a storm's ceiling has the lamps lit at noon. `full` is
   * the four beams a car actually has (two headlamps, two tail lamps, each
   * pair splayed so the pool it lays down is double-lobed). `normal` is one
   * beam per end on the centreline — half the cost, a rounder pool.
   * `lean` is the one headlamp beam a night stage needs to be driven at
   * all, and nothing behind the car but the lens's own glow.
   *
   * The sun's shadow rides the same ladder for the same reason: it is a
   * depth pass and a filtered lookup on every pixel of ground, worth
   * having on a machine with headroom and the first light to go on one
   * without. `lean` throws none. */
  lighting: "lean" | "normal" | "full";
  /** WHAT THE SKY IS MADE OF, and what the air does with the light. Its own
   * player-facing row (SKY), and it applies the instant it is set — the dome
   * is one mesh either way, and the ground reads the same fog chunk
   * whichever is up.
   *
   * `simple` is the arcade sky: a vertex-coloured gradient with a ring of
   * cumulus puffs floating in it and, under weather, a mesh ceiling with
   * scud tearing under it; the fog is distance alone. `layered` draws the
   * sky as a shader instead (sky-shader.ts): the cloud chart's sheets at
   * their real altitudes — cumulus a kilometre up, cirrus ten — foreshortened
   * into the haze, lit and shaded by where the sun is, the sun dimming when
   * one crosses it; with the valley mist lying in the low ground at dawn
   * and burning off, the sun glowing through it, and the country's own
   * shadow marched off the heightfield so a low sun stops at the ridge.
   * `full` reads the same sky at more octaves, lights every cloud's edges
   * by a second sample toward the sun, and throws the cumulus's shadows
   * across the ground.
   *
   * It is the dearest lever after RESOLUTION on a phone, because it is
   * paid per sky pixel — every octave of noise on a third of the frame —
   * which is why the design point stops one short of everything, and why it
   * is a row of its own rather than a share of DETAIL: no object count on
   * that row moves what this one costs, and nothing this one does is
   * cheaper for a thinner forest. */
  sky: "simple" | "layered" | "full";
};

/** What each stop of the SKY lever draws (sky-shader.ts, height-fog.ts):
 * whether the sky is the shader at all, the noise octaves a cloud sheet is
 * read at, how many sheets may be stacked, whether their edges take a
 * second sample toward the sun, whether the mist and the mountain's shadow
 * are drawn, and whether the clouds shadow the ground.
 *
 * `octaves` and `layers` are the two that decide what the sky COSTS, and
 * they multiply: every sheet in the stack is a whole field read at that
 * depth, on every sky pixel.
 *
 * Nine skies in ten are TWO sheets — a cumulus base with cirrus over it, or
 * a deck with its scud under it — and one in twenty-five is three. So a cap
 * only buys anything at two or one, and at one it buys half the sky: what
 * is left is the sheet the stage is actually driven under, which is the
 * `rank` the chart names rather than whichever happens to be lowest
 * (cloud-field.ts). A cirrus veil ten kilometres up hardly moves as the car
 * does; the cumulus over the road is the weather.
 *
 * `layered` and `full` agree on the count, and that is not an oversight:
 * two is the sky the chart draws anyway, so a cap above it never fires and
 * a cap below it costs every sky its second sheet. What separates the two
 * stops is how deep each sheet is READ (`octaves`) and whether its edges
 * take a second sample toward the sun — quality per sheet, where this is
 * how many there are.
 *
 * `simple` does not reach the dome at all — the arcade sky is a mesh ring
 * of puffs — so its cap is what a shader sky at that stop WOULD stand, and
 * costs nothing today. */
export const SKY_LOOK: Record<
  VideoSettings["sky"],
  {
    shader: boolean;
    octaves: number;
    layers: number;
    sunlit: boolean;
    mist: boolean;
    mountainShadow: boolean;
    cloudShadow: boolean;
  }
> = {
  simple: {
    shader: false,
    octaves: 0,
    layers: 1,
    sunlit: false,
    mist: false,
    mountainShadow: false,
    cloudShadow: false,
  },
  layered: {
    shader: true,
    octaves: 4,
    layers: 2,
    sunlit: false,
    mist: true,
    mountainShadow: true,
    cloudShadow: false,
  },
  full: {
    shader: true,
    octaves: 6,
    layers: 2,
    sunlit: true,
    mist: true,
    mountainShadow: true,
    cloudShadow: true,
  },
};

/** HOW MANY FRAMES A SECOND A PHONE IS ASKED FOR, at most.
 *
 * A ProMotion screen asks for a hundred and twenty, and answering costs
 * twice the GPU and twice the draw submission for a game that reads
 * identically at sixty — on a device with no fan and a battery, which is
 * where a heat complaint comes from. A sixty-hertz screen never reaches
 * this ceiling, so it is free there rather than a cut.
 *
 * Phones only (`FRAME_CAP_QUERY`): a machine with a real pointer is on
 * mains power and its owner may well have bought the high refresh rate on
 * purpose. The physics does not ride on it either way — that runs off its
 * own accumulator at `TUNING.physicsHz`, so a frame not drawn is a frame
 * with more steps in it, never a slower car. */
export const FRAME_HZ = 60;

/** Who the cap applies to. */
export const FRAME_CAP_QUERY = "(pointer: coarse)";

/** ...as the shortest gap between two drawn frames, ms, with a tolerance
 * under the interval. A sixty-hertz display does not deliver frames exactly
 * 16.67 ms apart, and at a hard floor the jitter alone would drop every few
 * and cap the phone that needed no help at fifty. Under it, sixty passes
 * every time and a hundred and twenty (8.3 ms) still cannot. */
export function frameFloorMs(): number {
  // Off `globalThis` rather than the bare global, because this module is
  // reachable from the ENGINE's own project, which is typed without a DOM —
  // and nothing headless is drawing frames, so no cap there anyway.
  const media = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  if (!media) return 0;
  return media(FRAME_CAP_QUERY).matches ? 1000 / FRAME_HZ - 2 : 0;
}

/** What share of the DEVICE'S OWN pixels each stop draws — a multiplier on
 * `devicePixelRatio`, not a ceiling over it.
 *
 * A ceiling asks the wrong question. `1` there meant one canvas pixel per
 * CSS pixel, which is the whole screen on a laptop and a NINTH of it on a
 * phone handing the page three device pixels per CSS pixel: the same row
 * bought a native picture on the machine with headroom and a soft one on
 * the machine that paid for a dense screen. Read as a share instead, every
 * stop means the same thing on every machine — HIGH is the screen the
 * device actually has, and each stop down halves the canvas in each axis:
 * a quarter of the pixels, then a sixteenth.
 *
 * Halving rather than some gentler step because this is the one row with
 * whole frames in it, and a stop that does not visibly buy anything is a
 * stop nobody would move to. Below HIGH the canvas is drawn smaller than
 * the screen and scaled up — blurry, and the difference between a phone
 * that holds 60 fps and one that does not. */
export const RESOLUTION_SCALE: Record<VideoSettings["resolution"], number> = {
  low: 0.25,
  medium: 0.5,
  high: 1,
};

/** The pixel ratio at or above which the frame is SUPERSAMPLED enough that
 * multisampling buys nothing worth its cost.
 *
 * A retina phone hands the page CSS pixels two or three device pixels wide.
 * Every edge in the frame is therefore already resolved finer than the
 * screen can show, and the 4x multisample buffer three asks for on top of
 * that is a second colour attachment the size of the frame, written on
 * every fragment and resolved once a frame — pure bandwidth on a tile GPU
 * with no fan, spent on an edge nobody can see at 460 ppi. A 1x display is
 * the opposite case: there the jaggies are the picture, and the buffer is
 * a quarter of the pixels to pay for it over.
 *
 * Read off the DEVICE rather than the RESOLUTION row, because the
 * multisample buffer is a property of the GL context and the context is
 * made once — a row the player moves mid-stage cannot re-make it, and a
 * phone that drops to MEDIUM to get its frames back is not a phone that
 * wants a multisample buffer handed back with them. */
export const ANTIALIAS_UNDER_RATIO = 2;

/** ...asked of the device the page is actually on. */
export function wantsAntialias(): boolean {
  const ratio = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return !(typeof ratio === "number" && ratio >= ANTIALIAS_UNDER_RATIO);
}

/** Multipliers on the environment preset's own fog distances. The fog IS
 * the draw distance: how far it lets the player see is also the radius the
 * world is culled at every frame (`world.cull` is handed `fogFar`), so
 * pulling it in is what stops a weak device from submitting half a stage it
 * cannot see through anyway.
 *
 * NEAR is a LOT nearer than the design point rather than a shade under it,
 * and that is the whole reason the stop exists. At two-thirds it was a
 * picture that looked like the tuned one and metered like it too — a stop a
 * player reaches for because the game is stuttering and puts back because
 * nothing happened. At this depth a clear day fogs out around two hundred
 * metres instead of five, and every road chunk and wild cell past that is
 * dropped before the frame is drawn rather than shaded into solid fog. It
 * cannot be pushed further without
 * closing the view in on the driver: the weather shortens the SAME fog
 * (sky.ts's per-weather fractions), so this is a multiplier ON one and the
 * two compound — which is what `environment.ts` keeps a floor under. */
export const DRAW_DISTANCE_SCALE: Record<VideoSettings["drawDistance"], number> = {
  near: 0.4,
  normal: 1,
  far: 1.45,
};

/** The nearest the DISTANCE row may ever bring the far fog, m.
 *
 * A hundred and fifty metres is about five seconds of road at rally pace,
 * which is the shortest sight line a corner can arrive out of and still be
 * a corner rather than an ambush. It exists because the SETTING and the
 * WEATHER shorten the same fog and compound: every stop of the row is well
 * past this on a clear sky, and what it catches is NEAR landing on the
 * weather that already takes the most (sky.ts's per-weather fractions). */
export const MIN_FOG_FAR = 150;

/** The fog a preset actually gets, once the player's DISTANCE row has had
 * its say — the whole policy in one place, so `environment.ts` applies it
 * rather than deciding it and the ladder can be read without a browser.
 *
 * The floor is on what the SETTING may take, never on what the weather may:
 * a preset already shorter than `MIN_FOG_FAR` keeps its own answer, so this
 * can only ever push the fog back OUT, and a storm stays as short as a storm
 * is. The near plane rides whatever ratio the far one landed on, so the fog
 * keeps its shape instead of thickening at one end when the floor bites. */
export function fogRangeFor(
  near: number,
  far: number,
  scale: number,
): { near: number; far: number } {
  const reach = Math.max(far * scale, Math.min(far, MIN_FOG_FAR));
  return { near: near * (reach / far), far: reach };
}

/** Particle-count and spawn-rate multiplier per effects level; `off` also
 * takes the rain and the ambient life out entirely. */
export const EFFECTS_SCALE: Record<VideoSettings["effects"], number> = {
  off: 0,
  low: 0.45,
  full: 1,
};

/** Whether a wheel torn off a car is thrown as a BODY — a rolling, bouncing
 * wheel with mass and grip (loose-wheel.ts), on every car on the road,
 * the field's included — or not thrown at all, leaving the hub. It rides
 * the particles' row: a wheel is stepped two hundred and forty times a
 * second while it is moving, the field can have a dozen loose at once,
 * and the picture that setting is cheapest on is the one that cannot
 * afford them. */
export const LOOSE_WHEELS: Record<VideoSettings["effects"], boolean> = {
  off: false,
  low: false,
  full: true,
};

/** Whether the RAIN ON THE DRIVER'S OWN WINDSCREEN (car/screen-rain.ts) is
 * drawn at all. It is the one effect that costs a copy of the whole frame
 * every frame it runs, and a shader solving five layers of beading per
 * pixel over most of the picture on top — the dearest line in the FX
 * budget, so the budget that is cut is the budget that goes without it.
 * The INTERIOR row still decides whether there is water on the glass to
 * draw (`SCREEN_GRIME`); this says whether the pass that draws it may run,
 * and it applies the instant it is set. */
export const GLASS_RAIN: Record<VideoSettings["effects"], boolean> = {
  off: false,
  low: false,
  full: true,
};

/** Whether the TV CAM HAS A FOCAL PLANE (camera-tv-lens.ts) — depth of field
 * under the one camera in the game that has any business with it.
 *
 * Every other view is a few metres off the car with everything worth looking
 * at at the same distance, where a pinhole lens is not a lie. A trackside
 * tripod is looking two hundred metres up the road on a long lens, and a long
 * lens has a focal plane you can see: the grass in front and the ridge behind
 * go soft and the car is the one sharp thing in the world.
 *
 * It is a copy of the frame and a gather over it, so it rides here with the
 * rest of the transients — and unlike them it is charged for only while the
 * TV cam is up. Any other camera pays nothing, target included. */
export const TV_BOKEH: Record<VideoSettings["effects"], boolean> = {
  off: false,
  low: false,
  full: true,
};

/** Whether the REAR-VIEW GLASS IS CURVED (mirror.ts) rather than a flat
 * pane — the bend across a real mirror that draws the middle of the strip
 * at something like its true size and squeezes the ends in. It is a second
 * pass over the mirror's own target, so it rides the EFFECTS budget with
 * the rest of the transients, and it applies the instant it is set. The
 * pass is a few hundred thousand pixels next to the whole scene the mirror
 * has just drawn a second time, but it is the mirror's pass it is added to,
 * and that pass is already the dearest thing in a driving frame. */
export const MIRROR_GLASS: Record<VideoSettings["effects"], boolean> = {
  off: false,
  low: false,
  full: true,
};

/** The player's option, as the detail level car-body.ts builds against. The
 * two are not one enum because the setting lives in a module the menus load
 * and the level lives in one that imports three.js. */
export const INTERIOR_DETAIL: Record<VideoSettings["interior"], "off" | "low" | "high"> = {
  off: "off",
  low: "low",
  full: "high",
};

/** Whether the road's glass gets dirty at all, off the same row. How FINELY
 * any one screen carries it is not this setting's business — that is decided
 * per car by whose it is (`FilmDetail`), because the car being driven is
 * read through and every other one is read at range. */
export const SCREEN_GRIME: Record<VideoSettings["interior"], boolean> = {
  off: false,
  low: true,
  full: true,
};

/** Which cars the INTERIOR row reaches at each stop of the GLASS row: the
 * car the frame is rendered FROM, and the rest of the entry list. A car it
 * does not reach is built solid — opaque windows, no cabin, no wiper arms,
 * no film — whatever the INTERIOR row says.
 *
 * A record rather than a comparison at the call sites, for the reason
 * `DUST_RAISED` is one: the field must never be furnished while the driven
 * car is not, or a grid of glass cabins around a solid car would read as a
 * bug in the car. */
export const GLASS_SEEN_THROUGH: Record<
  VideoSettings["glass"],
  { player: boolean; field: boolean }
> = {
  player: { player: true, field: false },
  all: { player: true, field: true },
};

/** WHETHER A WINDOW SHOWS THE WORLD, off the same row — the reflection
 * car/glass-reflect.ts strikes per pixel: the sky the pane is pointed at
 * this instant, the horizon lying across it at the angle it is raked, the
 * cloud sliding through and the sun smearing down the greenhouse as the car
 * turns. Below it every pane keeps the gradient baked into its vertices
 * (car/greenhouse.ts), which is paint and does not move with the car.
 *
 * It rides the GLASS row rather than one of its own because it is the same
 * question that row already asks — how much of a window is worth paying for
 * — and because `all` is the stop only DETAIL ▸ HIGH reaches, which is the
 * machine this is for. It is a few dozen instructions on window pixels and
 * nothing else: no pass, no target, no cube map, not one extra draw call, so
 * the whole entry list can carry it wherever one car could. It applies to a
 * car when it is BUILT, like the cabin behind the glass. */
export const GLASS_REFLECT: Record<VideoSettings["glass"], boolean> = {
  player: false,
  all: true,
};

/** Flora density multiplier — the scatter chance for everything the world
 * plants that the physics does not collide with. The engine's own trunk
 * field is never thinned: those are solid, and a tree you can hit but
 * cannot see is the worst bug this setting could buy. */
export const FLORA_SCALE: Record<VideoSettings["flora"], number> = {
  sparse: 0.4,
  normal: 1,
  lush: 1.5,
};

/** Loose-stone density multiplier — the road's spill and the litter beyond
 * it. `plain` is a third rather than nothing: the road's edge still has to
 * TRANSITION at every setting, because a hard line between gravel and grass
 * is a defect and not a level of detail. Everything this scales is a few
 * centimetres tall and drives straight over, so thinning it can never
 * change what a car hits. */
export const GROUND_SCALE: Record<VideoSettings["ground"], number> = {
  plain: 0.33,
  normal: 1,
  rich: 1.6,
};

/** Who is allowed to raise ground off the stage at each stop of the DUST
 * row, as the two questions the renderer actually has: the car the frame is
 * rendered FROM (its towed plume, its wheel kickup, its rooster tail), and
 * the rest of the entry list (the one cloud the whole field shares).
 *
 * A record rather than a pair of comparisons at the two call sites, because
 * the two must never disagree: a stage where the field is towing dust and
 * the player is not would read as a bug in the car. */
export const DUST_RAISED: Record<VideoSettings["dust"], { player: boolean; field: boolean }> = {
  off: { player: false, field: false },
  player: { player: true, field: false },
  all: { player: true, field: true },
};

/** WHOSE TRAIL IS LEFT IN THE SNOW (snow-marks.ts) — the two ruts a car
 * ploughs through a white stage, the crown it straddles between them and
 * the banks thrown out either side.
 *
 * It reads the DUST row, because it is the same question asked about the
 * same wheels. It does NOT read `DUST_RAISED`, because a mark is not a
 * cloud, and that row's own note is where the line is drawn: what it thins
 * is ground HANGING OVER the stage — spawned per frame, per car, for as
 * long as anyone is driving. A trail is the opposite shape of bill. It is
 * one mesh, built the first time a car touches snow and never again, a
 * fixed ring of stamps rewritten in place; and on a stage with no snow on
 * it nothing is ever allocated at all, so turning it off bought nothing on
 * most of the campaign.
 *
 * So THE CAR BEING DRIVEN ALWAYS MARKS THE SNOW, at every stop of the row,
 * `off` included. Two reasons, and only the second is about frames.
 *
 * The trail is the one drawn thing that reports a physical system the
 * engine runs whatever this says (`snowpack.ts`): the snow really is being
 * compressed under the wheels, the car really is being held back by
 * ploughing it, and a stage where all of that happens invisibly reads as a
 * car catching on nothing. And the trail is NAVIGATION as much as
 * decoration — a rut's floor is drawn in the pack's own colour, so the
 * line already driven is visibly the fast one and the slippery one, which
 * is the last thing to take away from a player who asked for fewer frames'
 * worth of scenery.
 *
 * The FIELD's trails are a different bill and go with the field's cloud:
 * one mesh per rival in range rather than one for the stage, which is
 * where this stops being nearly free. */
export const TRAIL_LEFT: Record<VideoSettings["dust"], { player: boolean; field: boolean }> = {
  off: { player: true, field: false },
  player: { player: true, field: false },
  all: { player: true, field: true },
};

/** WHOSE CAR MAY SHED A WHEEL, per the row above. The same split as the
 * dust, the exhaust and the fold, for the same reason: the cost is per car
 * and the road can carry fifteen, while a lost wheel means most on the one
 * car the driver has to keep on the road. */
export const WHEELS_LOST: Record<VideoSettings["wheelLoss"], { player: boolean; field: boolean }> =
  {
    off: { player: false, field: false },
    player: { player: true, field: false },
    all: { player: true, field: true },
  };

/** WHOSE BODY THE LEDGER IS BENT INTO, per the row above. Split the same
 * way the dust and the exhaust are, and for the same reason: the cost is
 * per car and the road can carry fifteen, while the value is nearly all on
 * the one car the camera is two metres behind. */
export const CRUMPLE_SEEN: Record<VideoSettings["crumple"], { player: boolean; field: boolean }> = {
  off: { player: false, field: false },
  player: { player: true, field: false },
  all: { player: true, field: true },
};

/** Whose pipe is allowed to smoke at each stop of the EXHAUST row, as the
 * same two questions the dust is asked: the car the frame is rendered FROM,
 * and the rest of the entry list. One record for the same reason DUST_RAISED
 * is one: a stage where the field is smoking and the car being driven is not
 * would read as a bug in the car.
 *
 * ...and a THIRD question the dust is never asked, because an exhaust is the
 * one cloud whose cost is set by the WEATHER rather than by the driving.
 * What a pipe puts out is mostly water, and water is invisible until the air
 * is cold enough to condense it (fumes.ts) — so the same car that costs
 * nothing on a summer stage hangs the thickest, longest-lived, most
 * overlapping sprites in the game off its bumper at ten below, and a winter
 * grid is eight of them at once. `vapour` is the share of that plume a stop
 * draws: full at the top, thinned in the middle, and moot at the bottom
 * where no pipe smokes at all.
 *
 * It thins the WATER and never the soot. What the pedal blows out of the
 * back of a car is a wisp at any stop and costs accordingly, and a machine
 * where standing on the throttle made no difference to the exhaust would
 * read as a bug rather than as a setting. */
export const EXHAUST_SEEN: Record<
  VideoSettings["exhaust"],
  { player: boolean; field: boolean; vapour: number }
> = {
  off: { player: false, field: false, vapour: 0 },
  player: { player: true, field: false, vapour: 0.55 },
  all: { player: true, field: true, vapour: 1 },
};

/** HOW MANY OF THE CAR'S OWN LAMPS ARE ACTUALLY THROWN at each stop of the
 * LIGHTING row: a CAP on the light sources the body authored (`car/lamps.ts`
 * derives them), spent strongest first. A beam is paid for on every lit
 * pixel in the frame, which makes this the one detail lever whose cost does
 * not go with how much of the world is on screen — so the ladder is a count
 * and not a quality.
 *
 * FULL is the car's whole complement, which is a different number per car
 * and the point of the row's top stop: a quad-headlight face throws its two
 * low beams AND its two driving beams, a car with a pod bar throws the bar,
 * and a car with one wide cluster each side throws the two it has. NORMAL is
 * the pair every car has, whichever pair of its own is strongest. LEAN is a
 * single beam on the centreline, opened out to stand in for the pair.
 *
 * The tail goes first as the row comes down, because a tail lamp is a
 * marker and not a driving light — the road AHEAD at night is the one pool a
 * driver actually needs, and the lamp still glows either way (car-mesh.ts's
 * bloom, which costs nothing per pixel).
 *
 * `brakes` is whether standing on the pedal is a LIGHT rather than only a
 * lens: the tail beams flare and the bloom over them goes with it. It rides
 * the same stop as the tail beams, because there is nothing to flare at the
 * bottom of the ladder. `field` is whether anybody but the car being driven
 * lights the world at all — the rivals' own lamps on the register the dust
 * clouds are lit from, which is what a rival ahead of you in the dark is
 * before it is a car. */
export const LAMP_BEAMS: Record<
  VideoSettings["lighting"],
  { head: number; tail: number; brakes: boolean; field: boolean }
> = {
  lean: { head: 1, tail: 0, brakes: false, field: false },
  normal: { head: 2, tail: 2, brakes: true, field: false },
  full: { head: 4, tail: 2, brakes: true, field: true },
};

/** How many CARS the dust is lit by at each stop — the player first, then
 * the nearest of the field (dust-light.ts hangs a head and a tail source
 * per car). Every particle in the frame runs the register in its vertex
 * shader, so a lamp fewer is a loop shorter for the whole cloud.
 *
 * The two stops that do not light the FIELD (`LAMP_BEAMS.field`) are the
 * driven car alone: the rivals' lamps are the only light anybody but the
 * player casts, so this ladder and that flag are one decision read twice. */
export const DUST_LAMP_CARS: Record<VideoSettings["lighting"], number> = {
  lean: 1,
  normal: 1,
  full: 4,
};
