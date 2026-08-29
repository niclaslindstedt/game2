// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Field-of-view arithmetic for a viewport that is not the shape the numbers
// were authored against.
//
// three.js's `fov` is VERTICAL, so a fixed number collapses the horizontal
// field on a narrow viewport: a phone held upright would see about 30° across,
// and every degree of yaw would sweep three times more of the frame width than
// it does in landscape — steering and drift READ as wildly amplified even
// though nothing about the game changed. Below the reference aspect the
// HORIZONTAL field is held instead (hor+), so a turn sweeps the same share of
// the frame whichever way the device is held.

/** Aspect ratio the game's fov numbers are tuned against (landscape). */
export const REF_ASPECT = 16 / 9;

/** Vertical fov ceiling on narrow viewports, deg — where hor+ stops before a
 * phone held upright turns into a fisheye. */
export const MAX_VFOV = 110;

/** The vertical fov that gives `designFov`'s horizontal field at `aspect`.
 * At or above the reference aspect the design number is already vertical and
 * comes back untouched.
 *
 * `cap` is where hor+ is allowed to stop for a particular shot, and a shot
 * looking through an APERTURE needs its own: the cockpit's windscreen
 * subtends a fixed 28° or so whatever the viewport is, so a phone held
 * upright opening the frame to the full ceiling turns a view of the road
 * into a view of the headliner. Buying the horizontal field back costs less
 * there than spending it on roof. */
export function verticalFovFor(designFov: number, aspect: number, cap = MAX_VFOV): number {
  if (!(aspect < REF_ASPECT)) return designFov;
  const halfH = Math.atan(Math.tan((designFov * Math.PI) / 360) * REF_ASPECT);
  return Math.min(cap, (Math.atan(Math.tan(halfH) / aspect) * 360) / Math.PI);
}
