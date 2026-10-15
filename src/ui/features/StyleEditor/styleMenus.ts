import { STYLE_PRESETS, type DrawingStyle, type OwnStyle2D, type StyleChoice } from "../../../lib/chem/style";
import type { Role3D } from "../../../lib/chem/style3d";
import type { CardMenuItem } from "./CardMenu";

/** A style's menu's items, as it has a role or not and is the user's own or not. */
export function styleMenuItems3d(
  role: Role3D | null,
  own: boolean,
  run: { onUse: (role: Role3D) => void; onDuplicate: () => void; onExport: () => void; onRename: () => void; onDelete: () => void },
): CardMenuItem[] {
  return [
    { name: "Use as primary", run: () => run.onUse("primary"), disabled: role === "primary" },
    { name: "Use as secondary", run: () => run.onUse("secondary"), disabled: role === "secondary" },
    { name: "Duplicate", run: run.onDuplicate, divider: true },
    { name: "Export style…", run: run.onExport },
    ...(own ? [{ name: "Rename", run: run.onRename }, { name: "Delete", run: run.onDelete }] : []),
  ];
}

/** A drawing style's card: what it is called, what it is, and whose. */
export type PresetCard = { id: string; name: string; description: string; style: DrawingStyle; whose: "built" | "own" | "workspace" };

/**
 * The drawing styles to pick from: the built-in presets, the user's own
 * (`own`), and - where `choice` is an own style the user has not got here -
 * that one, as the workspace carries it.
 */
export function presetCards(own: readonly OwnStyle2D[], choice: StyleChoice): PresetCard[] {
  return [
    ...STYLE_PRESETS.map((p) => ({ ...p, whose: "built" as const })),
    ...own.map((o) => ({ id: o.id, name: o.name, description: "", style: o.style, whose: "own" as const })),
    ...(choice.own && !own.some((o) => o.id === choice.preset)
      ? [{ id: choice.preset, name: choice.own.name, description: "", style: choice.own.style, whose: "workspace" as const }]
      : []),
  ];
}
