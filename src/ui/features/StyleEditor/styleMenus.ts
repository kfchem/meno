import { STYLE_PRESETS, type DrawingStyle, type OwnStyle2D, type StyleChoice } from "../../../lib/chem/style";
import { withRole, type Role3D, type Style3DChoice } from "../../../lib/chem/style3d";
import type { CardMenuItem } from "./CardMenu";

/**
 * `choice` with style `id` given `role` (the one there going to the list, or to the other slot where `id` had it), and
 * the style the editor sets and shows then: that one - so that the preview beside the slots shows what was chosen at once.
 */
export function givenRole(choice: Style3DChoice, role: Role3D, id: string): { next: Style3DChoice; shown: string } {
  return { next: withRole(choice, role, id), shown: id };
}

/** A style's menu's items, as it has a role or not and is the user's own or not. */
export function styleMenuItems3d(
  role: Role3D | null,
  own: boolean,
  run: { onUse: (role: Role3D) => void; onDuplicate: () => void; onExport: () => void; onRename: () => void; onDelete?: () => void },
): CardMenuItem[] {
  return [
    { name: "Use as primary", run: () => run.onUse("primary"), disabled: role === "primary" },
    { name: "Use as secondary", run: () => run.onUse("secondary"), disabled: role === "secondary" },
    { name: "Duplicate", run: run.onDuplicate, divider: true },
    { name: "Export style…", run: run.onExport },
    ...(own ? [{ name: "Rename", run: run.onRename }, ...(run.onDelete ? [{ name: "Delete", run: run.onDelete }] : [])] : []),
  ];
}

/** A drawing style's card: what it is known by among the cards (`key`), its preset's id, what it is called, what it is, and whose. */
export type PresetCard = { key: string; id: string; name: string; description: string; style: DrawingStyle; whose: "built" | "own" | "workspace" };

/** Whether two drawing styles are the same, setting by setting. */
export function sameDrawingStyle(a: DrawingStyle, b: DrawingStyle): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof DrawingStyle>;
  return [...keys].every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/** The card of `choice` among `presetCards`: a built-in preset's; the user's own, where the workspace carries it as it is; else the workspace's own. */
export function chosenCard(own: readonly OwnStyle2D[], choice: StyleChoice): string {
  if (!choice.own) return choice.preset;
  const mine = own.find((o) => o.id === choice.preset);
  return mine && mine.name === choice.own.name && sameDrawingStyle(mine.style, choice.own.style) ? mine.id : `workspace:${choice.preset}`;
}

/**
 * The drawing styles to pick from: the built-in presets, the user's own
 * (`own`), and - where `choice` carries an own style that is not one of
 * them as it is (made on another computer, or changed here since) - that
 * one, as the workspace carries it, a card of its own.
 */
export function presetCards(own: readonly OwnStyle2D[], choice: StyleChoice): PresetCard[] {
  const carried = choice.own && chosenCard(own, choice) !== choice.preset ? choice.own : null;
  return [
    ...STYLE_PRESETS.map((p) => ({ ...p, key: p.id, whose: "built" as const })),
    ...own.map((o) => ({ key: o.id, id: o.id, name: o.name, description: "", style: o.style, whose: "own" as const })),
    ...(carried ? [{ key: `workspace:${choice.preset}`, id: choice.preset, name: carried.name, description: "", style: carried.style, whose: "workspace" as const }] : []),
  ];
}
