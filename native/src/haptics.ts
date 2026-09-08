// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TAPTIC ENGINE — the effect half of the haptics bridge, and the only
// file in the shell that touches the phone's haptics.
//
// Every decision is next door in `rumble.ts`: what the page asked for, how
// hard it should feel, how many taps it is worth. This takes the burst that
// comes back and plays it, which is the whole of what a shell is allowed to
// do with a feature the website owns.

import * as Haptics from "expo-haptics";

import { rumbleBurst, type Rumble, type TapStyle } from "./rumble";

const STYLES: Record<TapStyle, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

/** Play one pulse. Fire-and-forget on purpose: a tap that arrives late is
 * worse than no tap, so nothing here is awaited and nothing is queued — the
 * page's own ledger already refuses to ask for two at once
 * (`pwa/src/game/rumble.ts`), and a device that refuses a tap simply does
 * not make one. */
export function playRumble(pulse: Rumble): void {
  const burst = rumbleBurst(pulse);
  const tap = (): void => {
    Haptics.impactAsync(STYLES[burst.style]).catch(() => {});
  };
  tap();
  for (let i = 1; i < burst.count; i++) setTimeout(tap, i * burst.gapMs);
}
