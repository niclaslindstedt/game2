// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW MUCH CREAM A DEVICE HAS: a register of published GPU benchmark scores
// for the phones and tablets this game is played on, so a first launch can
// one day be told what it is running on instead of guessing.
//
// NOTHING READS THIS YET. The picture still ships on the fixed defaults in
// settings.ts (`DEFAULT_VIDEO`), and this file is the table those defaults
// would be picked FROM once a shell can say which device it is. It is here
// first, on its own, because the table is the hard part and it is worth
// having reviewed before any behaviour hangs off it.
//
// Where the model string would come from: the native shell can read one
// (`expo-device`'s `modelId` on iOS — "iPhone16,1" — and `modelName` on
// Android — "SM-S928B"/"Pixel 9 Pro"), and would hand it to the page over
// the WebView message channel like any other platform service. A browser
// cannot: iOS Safari's user agent says "iPhone" and nothing else, which is
// exactly the case `GPU_FAMILIES` below exists to answer.

/** WHAT THE NUMBERS ARE, and what they are not.
 *
 * Geekbench 6 GPU compute — Metal on Apple, Vulkan on Android — as the
 * approximate median of the scores published on the Geekbench browser's
 * device charts, rounded to the nearest 500. They are a RANKING, not a
 * measurement: a phone's own result moves several per cent with its
 * thermal state, and the charts move as more people submit.
 *
 * Two limits worth stating before anyone reads a number too closely:
 *
 * METAL AND VULKAN ARE DIFFERENT BENCHMARKS. Geekbench normalizes both
 * against the same baseline, so the two columns can be lined up to within
 * about a tier — which is all this table is for — but an iPhone and a
 * Galaxy that score the same do not draw the same frame, and no decision
 * here should turn on a difference of a few thousand points across the
 * platform line.
 *
 * COMPUTE IS NOT RASTERIZATION. This game is bound by pixels, draw calls
 * and bandwidth, not by compute kernels, and a compute score is only a
 * proxy for those. What it captures well is the thing that actually
 * separates these devices: which generation of GPU, and how many cores of
 * it. That is the question `RESOLUTION` and `DETAIL` are asking too.
 *
 * The unit is deliberately NOT the game's own benchmark (benchmark.ts),
 * which meters this machine drawing this game and is the honest answer.
 * A published score is what can be known BEFORE the first frame, which is
 * the only moment a default is worth choosing. */
export type GpuScore = number;

/** A GROUP of devices that perform alike — the answer for a device the
 * register has never heard of, which on the web is nearly all of them. */
export type GpuFamily =
  | "apple-phone-current"
  | "apple-phone-recent"
  | "apple-phone-old"
  | "apple-tablet-desktop-class"
  | "apple-tablet-phone-class"
  | "android-flagship-current"
  | "android-flagship-recent"
  | "android-flagship-old"
  | "android-upper-mid"
  | "android-mid"
  | "android-budget"
  | "unknown";

/** One device in the register. */
export type DeviceGpu = {
  /** The marketing name, matched case- and punctuation-insensitively. */
  name: string;
  /** Geekbench 6 GPU compute — Metal on Apple, Vulkan on Android. */
  score: GpuScore;
  /** Where the device falls when it is not matched by name. */
  family: GpuFamily;
  /** Apple's own machine identifiers, which is what a native shell can
   * actually read on iOS. Listed only where they are known for certain:
   * a device with none falls through to its family, which is a slightly
   * conservative answer rather than a wrong one. */
  machines?: string[];
};

/** THE REGISTER, richest first within each platform.
 *
 * Not every device ever made — the roster is the ones a rally game is
 * plausibly played on, spread far enough apart that a device between two
 * rows lands between two sensible answers. Everything else is a family. */
export const DEVICE_GPUS: DeviceGpu[] = [
  // ——— iPad. The desktop-class parts, which are a different game to the
  // phones: an M-series iPad has several times an iPhone's GPU and a screen
  // with several times the pixels to spend it on, so a big score there does
  // not mean as much slack as it looks like.
  { name: "iPad Pro (M5)", score: 68000, family: "apple-tablet-desktop-class" },
  { name: "iPad Pro (M4)", score: 57000, family: "apple-tablet-desktop-class" },
  { name: "iPad Air (M3)", score: 50000, family: "apple-tablet-desktop-class" },
  { name: "iPad Air (M2)", score: 45000, family: "apple-tablet-desktop-class" },
  { name: "iPad Pro (M2)", score: 45000, family: "apple-tablet-desktop-class" },
  { name: "iPad Air (M1)", score: 33000, family: "apple-tablet-desktop-class" },
  { name: "iPad Pro (M1)", score: 33000, family: "apple-tablet-desktop-class" },
  // ...and the A-series iPads, which are phones in a bigger case.
  { name: "iPad mini (7th generation)", score: 28000, family: "apple-tablet-phone-class" },
  { name: "iPad (11th generation)", score: 24500, family: "apple-tablet-phone-class" },
  { name: "iPad mini (6th generation)", score: 20000, family: "apple-tablet-phone-class" },
  { name: "iPad (10th generation)", score: 18500, family: "apple-tablet-phone-class" },

  // ——— iPhone. The PRO of a generation is a real step, not a badge: it is
  // an extra GPU core and a bigger memory budget, and it shows up here as
  // roughly a generation's worth of score over the plain phone beside it.
  { name: "iPhone 17 Pro Max", score: 40000, family: "apple-phone-current" },
  { name: "iPhone 17 Pro", score: 40000, family: "apple-phone-current" },
  { name: "iPhone Air", score: 36000, family: "apple-phone-current" },
  { name: "iPhone 17", score: 35000, family: "apple-phone-current" },
  {
    name: "iPhone 16 Pro Max",
    score: 33000,
    family: "apple-phone-current",
    machines: ["iPhone17,2"],
  },
  { name: "iPhone 16 Pro", score: 33000, family: "apple-phone-current", machines: ["iPhone17,1"] },
  { name: "iPhone 16 Plus", score: 30000, family: "apple-phone-current", machines: ["iPhone17,4"] },
  { name: "iPhone 16", score: 30000, family: "apple-phone-current", machines: ["iPhone17,3"] },
  { name: "iPhone 16e", score: 27000, family: "apple-phone-recent", machines: ["iPhone17,5"] },
  {
    name: "iPhone 15 Pro Max",
    score: 28000,
    family: "apple-phone-current",
    machines: ["iPhone16,2"],
  },
  { name: "iPhone 15 Pro", score: 28000, family: "apple-phone-current", machines: ["iPhone16,1"] },
  { name: "iPhone 15 Plus", score: 24500, family: "apple-phone-recent", machines: ["iPhone15,5"] },
  { name: "iPhone 15", score: 24500, family: "apple-phone-recent", machines: ["iPhone15,4"] },
  {
    name: "iPhone 14 Pro Max",
    score: 24500,
    family: "apple-phone-recent",
    machines: ["iPhone15,3"],
  },
  { name: "iPhone 14 Pro", score: 24500, family: "apple-phone-recent", machines: ["iPhone15,2"] },
  { name: "iPhone 14 Plus", score: 21500, family: "apple-phone-recent", machines: ["iPhone14,8"] },
  { name: "iPhone 14", score: 21500, family: "apple-phone-recent", machines: ["iPhone14,7"] },
  {
    name: "iPhone 13 Pro Max",
    score: 21500,
    family: "apple-phone-recent",
    machines: ["iPhone14,3"],
  },
  { name: "iPhone 13 Pro", score: 21500, family: "apple-phone-recent", machines: ["iPhone14,2"] },
  { name: "iPhone 13", score: 20000, family: "apple-phone-recent", machines: ["iPhone14,5"] },
  { name: "iPhone 13 mini", score: 20000, family: "apple-phone-recent", machines: ["iPhone14,4"] },
  {
    name: "iPhone SE (3rd generation)",
    score: 19500,
    family: "apple-phone-old",
    machines: ["iPhone14,6"],
  },
  { name: "iPhone 12 Pro Max", score: 18500, family: "apple-phone-old", machines: ["iPhone13,4"] },
  { name: "iPhone 12 Pro", score: 18500, family: "apple-phone-old", machines: ["iPhone13,3"] },
  { name: "iPhone 12", score: 18500, family: "apple-phone-old", machines: ["iPhone13,2"] },
  { name: "iPhone 12 mini", score: 18500, family: "apple-phone-old", machines: ["iPhone13,1"] },
  { name: "iPhone 11", score: 13500, family: "apple-phone-old" },

  // ——— Android, by the SoC that decides it. Named by a phone people can
  // recognise, because a register nobody can read is a register nobody
  // checks — the family under each is what actually catches the fifty other
  // handsets shipping the same chip.
  { name: "Snapdragon 8 Elite Gen 5", score: 30000, family: "android-flagship-current" },
  { name: "Galaxy S26 Ultra", score: 30000, family: "android-flagship-current" },
  { name: "Snapdragon 8 Elite", score: 24500, family: "android-flagship-current" },
  { name: "Galaxy S25 Ultra", score: 24500, family: "android-flagship-current" },
  { name: "Dimensity 9400", score: 21000, family: "android-flagship-current" },
  { name: "Snapdragon 8 Gen 3", score: 17500, family: "android-flagship-recent" },
  { name: "Galaxy S24 Ultra", score: 17500, family: "android-flagship-recent" },
  { name: "Exynos 2500", score: 16000, family: "android-flagship-recent" },
  { name: "Dimensity 9300", score: 15500, family: "android-flagship-recent" },
  { name: "Exynos 2400", score: 15000, family: "android-flagship-recent" },
  { name: "Galaxy S24", score: 15000, family: "android-flagship-recent" },
  { name: "Snapdragon 8 Gen 2", score: 14000, family: "android-flagship-recent" },
  { name: "Galaxy S23", score: 14000, family: "android-flagship-recent" },
  { name: "Tensor G5", score: 11000, family: "android-upper-mid" },
  { name: "Pixel 10 Pro", score: 11000, family: "android-upper-mid" },
  { name: "Snapdragon 8 Gen 1", score: 10000, family: "android-flagship-old" },
  { name: "Galaxy S22", score: 10000, family: "android-flagship-old" },
  { name: "Snapdragon 7+ Gen 3", score: 9500, family: "android-upper-mid" },
  { name: "Exynos 2200", score: 9000, family: "android-flagship-old" },
  { name: "Dimensity 8300", score: 9000, family: "android-upper-mid" },
  { name: "Tensor G4", score: 8500, family: "android-upper-mid" },
  { name: "Pixel 9 Pro", score: 8500, family: "android-upper-mid" },
  { name: "Pixel 9", score: 8500, family: "android-upper-mid" },
  { name: "Snapdragon 888", score: 8000, family: "android-flagship-old" },
  { name: "Tensor G3", score: 8000, family: "android-upper-mid" },
  { name: "Pixel 8 Pro", score: 8000, family: "android-upper-mid" },
  { name: "Pixel 8", score: 8000, family: "android-upper-mid" },
  { name: "Tensor G2", score: 7000, family: "android-upper-mid" },
  { name: "Pixel 7", score: 7000, family: "android-upper-mid" },
  { name: "Tensor", score: 6500, family: "android-upper-mid" },
  { name: "Pixel 6", score: 6500, family: "android-upper-mid" },
  { name: "Snapdragon 7 Gen 3", score: 5500, family: "android-mid" },
  { name: "Snapdragon 6 Gen 1", score: 3000, family: "android-budget" },
  { name: "Snapdragon 695", score: 2500, family: "android-budget" },
];

/** WHAT A FAMILY IS WORTH — the answer for a device not in the register,
 * which on the web is the normal case rather than the exotic one.
 *
 * Each is deliberately set NEAR THE BOTTOM of its group rather than at the
 * middle, because the two ways of being wrong do not cost the same. Guess
 * high and a phone that cannot hold the frame gets a picture it stutters
 * through, on the first stage, before the player knows there are settings
 * at all — the worst first impression the game can make. Guess low and a
 * strong phone gets a picture a touch plainer than it could manage, and one
 * row of the options page hands it straight back. So a family reads about
 * as its weakest common member, and the register above is what earns a
 * device the benefit of the doubt. */
export const GPU_FAMILIES: Record<GpuFamily, GpuScore> = {
  // The last two or three years of iPhone: an A17 Pro at worst.
  "apple-phone-current": 26000,
  // Roughly the A15/A16 span — every phone from about 2021 to 2023.
  "apple-phone-recent": 19500,
  // An A14 or older, down to the oldest iPhone the game will run on at all.
  "apple-phone-old": 12000,
  // An M-series iPad, and a great many pixels to spend it on.
  "apple-tablet-desktop-class": 32000,
  // An A-series iPad — a phone's GPU behind a tablet's screen, which is the
  // least comfortable combination in the whole table.
  "apple-tablet-phone-class": 18000,
  // The current flagship Androids: an 8 Gen 3 at worst.
  "android-flagship-current": 17000,
  // The 8 Gen 2 / Exynos 2400 span.
  "android-flagship-recent": 13000,
  // An 8 Gen 1 or 888 — fast for its day, and thermally unhappy.
  "android-flagship-old": 8000,
  // The Tensors and the 7-series: the biggest and most crowded group there
  // is, and the one it matters most not to over-promise.
  "android-upper-mid": 6500,
  "android-mid": 4000,
  "android-budget": 2000,
  // Nothing is known at all — a desktop browser, or a phone whose name says
  // nothing. The floor, and the reason `DEFAULT_VIDEO` is a fixed answer
  // rather than a computed one until a shell can do better than this.
  unknown: 2000,
};

/** BANDS, cheapest first: how much cream, in words.
 *
 * Four rather than three because the register spans a factor of thirty, and
 * because the game's own three picture rows are NOT what this is naming —
 * a band is a statement about the device, and which levers it should buy
 * back is a separate decision nothing has made yet. The boundaries sit in
 * the gaps in the table rather than on round numbers, so a generation of
 * phone does not straddle two of them. */
export type GpuBand = "weak" | "modest" | "strong" | "ample";

/** The lower bound of each band, richest first — the order `gpuBandOf`
 * walks it. */
export const GPU_BANDS: { id: GpuBand; from: GpuScore }[] = [
  // An M-series tablet, or the Pro half of the last two iPhone generations.
  { id: "ample", from: 26000 },
  // A flagship of the last few years, either platform.
  { id: "strong", from: 13000 },
  // The upper middle: a Tensor, an older flagship, a 7-series Snapdragon.
  { id: "modest", from: 5000 },
  // Everything under that, and everything unknown.
  { id: "weak", from: 0 },
];

/** Which band a score falls in. */
export function gpuBandOf(score: GpuScore): GpuBand {
  return GPU_BANDS.find((band) => score >= band.from)?.id ?? "weak";
}

/** Names compared with the case, the punctuation and the SPACING taken out,
 * so "iPhone 16 Pro", "iphone16 pro" and "IPHONE-16-PRO" are one device.
 *
 * The spacing is the part that is easy to forget and the part that bites:
 * nothing makes a platform write "iPhone 16" the way Apple's marketing
 * does, and an Android model code is written however its maker felt. So
 * every run of letters is cut from every run of digits before the
 * punctuation goes, which lands "iPhone16Pro", "iPhone 16 Pro" and the
 * machine identifier "iPhone17,1" on stable, distinct keys. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** WHAT A DEVICE IS WORTH, from whatever a shell managed to learn about it.
 *
 * `model` is the free-form string the platform gave us — a marketing name,
 * an Apple machine identifier, or a model code. `family` is the caller's
 * own reading of what KIND of device it is, used when the model matches
 * nothing; without one, an unrecognised device is `unknown`, which is the
 * floor.
 *
 * The match is exact-after-normalizing, never a prefix or a substring:
 * "iPhone 16" must not answer for "iPhone 16 Pro", and on this table it
 * would, since one name contains the other. A device the register does not
 * name is a job for the family, which is the whole reason there are
 * families. */
export function gpuScoreFor(model: string | undefined, family: GpuFamily = "unknown"): GpuScore {
  if (model) {
    const wanted = normalize(model);
    const hit = DEVICE_GPUS.find(
      (device) =>
        normalize(device.name) === wanted ||
        device.machines?.some((machine) => normalize(machine) === wanted),
    );
    if (hit) return hit.score;
  }
  return GPU_FAMILIES[family];
}
