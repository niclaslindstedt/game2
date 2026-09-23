// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The TypeScript face of the local CLOUD SAVE native module (ios/
// CloudSaveModule.swift): iCloud key-value storage. The save follows the Apple
// ID the device is already signed into — there is no separate account, nothing
// to sign into, and nobody to name.
//
// Loaded OPTIONALLY: a build without the native module (Expo Go, the web
// target) gets `null` here and the shell reports cloud save unavailable
// instead of crashing.

import { requireOptionalNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";

export type CloudSaveNativeModule = {
  /** Is there an iCloud account to save into? */
  isAvailable(): boolean;
  /** The stored blob, or null when this account has never saved. */
  getItem(key: string): Promise<string | null>;
  /** Write the blob; false when the store refused it (over quota). */
  setItem(key: string, value: string): Promise<boolean>;
  /** Another device wrote the store. */
  addListener(event: "onCloudChange", listener: () => void): EventSubscription;
};

/** The native module, or null in a build that doesn't carry it. */
export const CloudSave = requireOptionalNativeModule<CloudSaveNativeModule>("CloudSave");

export default CloudSave;
