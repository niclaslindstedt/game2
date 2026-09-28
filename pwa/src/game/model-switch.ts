// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHETHER A BUILD DRAWS THE MODELLED CARS — read in one place by the page
// (`car-models.ts`) and by the build that packs them (`pwa/models-plugin.ts`),
// which cannot share anything heavier. ON unless the switch says otherwise:
// `VITE_MODEL_CARS=0` (or `off`, `false`, `no`) draws the code-built cars
// again — in the environment, the root `.env`, or a CI secret of the same
// name. Unset or empty is on.

export function modelSwitch(value: unknown): boolean {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  return !["0", "off", "false", "no"].includes(v);
}
