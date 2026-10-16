/**
 * Styles as a file holds them (docs/FILE-IO.md, *What a .meno holds*): a
 * Meno file of kind "style" carries `style.json` - drawing styles and
 * styles for molecules in 3D, each with its name and the whole of it - so
 * that a lab can share its styles. What does not read is left out, each
 * setting as the settings file reads it.
 */
import { type DrawingStyle } from "./style";
import { acceptDrawingStyle, ownName } from "./styleFields";
import { acceptLook3d, type MoleculeLook } from "./style3d";

export type StyleFile = {
  drawing: { name: string; style: DrawingStyle }[];
  molecules3d: { name: string; look: MoleculeLook }[];
};

/** The most styles of either kind a file holds. */
export const STYLE_FILE_MOST = 100;

/** Styles as a file's JSON. */
export function styleFileText(f: StyleFile): string {
  return JSON.stringify({ format: "meno-style", version: 1, drawing: f.drawing, molecules3d: f.molecules3d }, null, 1);
}

/** Styles from a file's JSON: each that reads, with a name, at most `STYLE_FILE_MOST` of each; none where it is no such JSON. */
export function readStyleFileText(text: string): StyleFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { drawing?: unknown; molecules3d?: unknown };
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).slice(0, STYLE_FILE_MOST) : []);
  const drawing = list(r.drawing).flatMap((d) => {
    const n = ownName((d as { name?: unknown } | null)?.name);
    return n ? [{ name: n, style: acceptDrawingStyle((d as { style?: unknown }).style) }] : [];
  });
  const molecules3d = list(r.molecules3d).flatMap((d) => {
    const n = ownName((d as { name?: unknown } | null)?.name);
    return n ? [{ name: n, look: acceptLook3d((d as { look?: unknown }).look) }] : [];
  });
  return drawing.length || molecules3d.length ? { drawing, molecules3d } : null;
}

/** What a style file holds, said: its styles' names - "Lab figures", or "Lab figures and Group 3D". */
export function styleFileName(f: StyleFile): string {
  const names = [...f.drawing.map((d) => d.name), ...f.molecules3d.map((d) => d.name)];
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
