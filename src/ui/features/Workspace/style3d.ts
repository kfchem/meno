import { useMemo } from "react";
import { look3dPreset, style3dOf, type Role3D, type Style3D, type Style3DChoice } from "../../../lib/chem/style3d";
import { useAppSettings } from "../../../lib/settings/appSettings";

// (one look for one choice, so that what is worked out for a look is kept)
let last: { choice: Style3DChoice; style: Style3D } | null = null;
const styleFor = (choice: Style3DChoice): Style3D => {
  if (last?.choice !== choice) last = { choice, style: style3dOf(choice) };
  return last.style;
};

/** How molecules in 3D look and turn now: the app's 3D style, from Settings. */
export function currentStyle3D(): Style3D {
  return styleFor(useAppSettings.getState().style3d);
}

/** The same, for a component: it draws again as Settings change it. */
export function useStyle3D(): Style3D {
  const choice = useAppSettings((s) => s.style3d);
  return useMemo(() => styleFor(choice), [choice]);
}

/** The names of the styles the primary and the secondary look are, from Settings: what a switch to either is called. */
export function useStyleNames3D(): Record<Role3D, string> {
  const primary = useAppSettings((s) => s.style3d.primary);
  const secondary = useAppSettings((s) => s.style3d.secondary);
  return useMemo(() => ({ primary: look3dPreset(primary).name, secondary: look3dPreset(secondary).name }), [primary, secondary]);
}
