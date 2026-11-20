import type { ChemMarks } from "../chem/marks";
import type { Model } from "../store/types";
import { readingOf, type Reading } from "./changes";
import { atomSaid, bondSaid } from "./said";

// What a look states, said where the pointer rests on an atom or a bond (docs/EDITOR-2D.md, *What a look states*): the words and the
// place they stand, apart from the component that draws them (components/ChemMarks2D).

/** What the look the pointer rests on states (configuration/said), the drawing read once for each model it is asked of. */
const readings = new WeakMap<Model, Reading>();
/** Whether a drawing has any look a word could be said of: a wedge, a wavy bond, a bold or dashed line, or depth. */
export function hasLooks(model: Model): boolean {
  return model.bonds.some((b) => (b.stereo && b.stereo !== "none") || b.display) || model.atoms.some((a) => a.z != null);
}

function lookSaid(model: Model, atom: number | undefined, bond: number | undefined, marks: ChemMarks | null): string | null {
  if (!hasLooks(model)) return null;
  let reading = readings.get(model);
  if (!reading) readings.set(model, (reading = readingOf(model)));
  const label = (key: string) => {
    const id = Number(key.slice(key.indexOf("-") + 1));
    return key.startsWith("centre-") ? marks?.centres.get(id) : marks?.doubleBonds.get(id);
  };
  return atom != null ? atomSaid(model, reading, atom, label) : bond != null ? bondSaid(model, reading, bond, label) : null;
}

/**
 * What is said under the atom or bond the pointer rests on, and where: its own words where its R, S, E or Z is shown with some - why
 * it has none - else what its look states (configuration/said); at the atom, or the bond's middle, where each is drawn (`placeOf`), with
 * the extent it is to stand clear of (`w`, `h`: a bond's, from end to end).
 * Null where nothing is said. Whether the drawing shows any R, S or other mark at all does not enter into it.
 */
export function pointedSaid(
  model: Model,
  marks: ChemMarks | null,
  hoveredAtom: number | null | undefined,
  hoveredBond: number | null | undefined,
  placeOf: (id: number) => { x: number; y: number } | undefined,
): { key: string; text: string; x: number; y: number; w: number; h: number } | null {
  const atom = hoveredAtom != null ? model.atoms.find((a) => a.id === hoveredAtom) : undefined;
  const bond = !atom && hoveredBond != null ? model.bonds.find((b) => b.id === hoveredBond) : undefined;
  const key = atom ? `centre-${atom.id}` : bond ? `bond-${bond.id}` : null;
  if (!key) return null;
  const shown = atom ? atom.stereoShown : bond?.stereoShown;
  const text = (shown && marks?.said?.get(key)) || lookSaid(model, atom?.id, bond?.id, marks);
  if (!text) return null;
  const p = placeOf(atom ? atom.id : bond!.a);
  const q = bond ? placeOf(bond.b) : p;
  if (!p || !q) return null;
  // (the box it stands clear of: the bond's whole extent, so that the words are under all of it, not over its far end; an atom's, none)
  return { key, text, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
}
