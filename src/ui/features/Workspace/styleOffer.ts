/**
 * Whether a workspace is asked to take Settings' styles (docs/WORKSPACE.md,
 * *Drawing style*): Settings' are for new workspaces, and a workspace keeps
 * its own - but a style changed in Settings while it is open is offered to
 * it, once, by a question over its canvas (SettingsStyleAsk). Asked only
 * where Settings has changed since the workspace was opened, or since it
 * was last answered: a workspace drawn in another style - someone else's,
 * or saved in one - is never asked about for that alone.
 */
import { STYLE_PRESETS, type StyleChoice } from "../../../lib/chem/style";
import type { Style3DChoice } from "../../../lib/chem/style3d";
import { workspace3dOf, type Workspace3D } from "../../../lib/chem/workspaceStyle3d";

/** A value as a key: its fields in order, however they were made or read. */
export function keyOf(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(keyOf).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${keyOf((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** A workspace's styles in 3D as asked about: its two looks, primary and secondary. (Its light travels with it, and is changed from its own Styles card.) */
export type Roles3D = Pick<Workspace3D, "primary" | "secondary">;

/** Settings' styles as a workspace would take them: the drawing style, and the 3D styles in their roles. */
export type SettingsStyles = { drawing: StyleChoice; roles: Roles3D };

export function settingsStylesOf(drawing: StyleChoice, style3d: Style3DChoice): SettingsStyles {
  const ws = workspace3dOf(style3d);
  return { drawing, roles: { primary: ws.primary, secondary: ws.secondary } };
}

/** A drawing style's name as Settings shows it - a user's own by its name - and said to be changed where it is. */
export function drawingName(c: StyleChoice): string {
  const name = c.own?.name ?? STYLE_PRESETS.find((p) => p.id === c.preset)?.name ?? c.preset;
  return Object.keys(c.changes ?? {}).length ? `${name}, changed` : name;
}

/** Two looks' names, primary then secondary. */
export const rolesName = (r: Roles3D) => `${r.primary.name} and ${r.secondary.name}`;

/** What a workspace is asked: for each kind of style that differs from Settings', its name now and Settings'. */
export type StyleAsk = { drawing?: { now: string; settings: string }; d3?: { now: string; settings: string } };

/**
 * What to ask a workspace in `ws`'s styles, Settings' being `settings`, and
 * answered (or opened) when Settings' were `answered` (`keyOf`): nothing
 * where Settings' are as they were then, or where they are now the
 * workspace's own.
 */
export function styleAsk(ws: { style: StyleChoice; style3d: Workspace3D }, settings: SettingsStyles, answered: string): StyleAsk | null {
  if (keyOf(settings) === answered) return null;
  const drawing = keyOf(ws.style) !== keyOf(settings.drawing);
  const d3 = keyOf({ primary: ws.style3d.primary, secondary: ws.style3d.secondary }) !== keyOf(settings.roles);
  if (!drawing && !d3) return null;
  return {
    ...(drawing ? { drawing: { now: drawingName(ws.style), settings: drawingName(settings.drawing) } } : {}),
    ...(d3 ? { d3: { now: rolesName(ws.style3d), settings: rolesName(settings.roles) } } : {}),
  };
}
