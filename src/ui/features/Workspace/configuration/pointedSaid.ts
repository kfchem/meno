import type { ChemMarks } from "../chem/marks";
import type { Model } from "../store/types";

// Why an R, S, E or Z asked for is not there, said where the pointer rests on its atom or bond (docs/EDITOR-2D.md, *Meno's own*): the
// words and the place they stand, apart from the component that draws them (components/ChemMarks2D). Nothing else is said on a wedge or
// an atom: a wedge and an R or S speak for themselves.

/**
 * What is said under the atom or bond the pointer rests on, and where: where its R, S, E or Z is asked for and it has none, why - or
 * that its Z or E turns in the mirror image; at the atom, or the bond's middle, where each is drawn (`placeOf`), with the extent it is to
 * stand clear of (`w`, `h`: a bond's, from end to end). Null where nothing is said.
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
  const text = shown ? marks?.said?.get(key) : undefined;
  if (!text) return null;
  const p = placeOf(atom ? atom.id : bond!.a);
  const q = bond ? placeOf(bond.b) : p;
  if (!p || !q) return null;
  // (the box it stands clear of: the bond's whole extent, so that the words are under all of it, not over its far end; an atom's, none)
  return { key, text, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
}
