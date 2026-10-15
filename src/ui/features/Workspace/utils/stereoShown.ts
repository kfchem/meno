/**
 * R and S, E and Z shown on what is asked (docs/EDITOR-2D.md, *R and S*):
 * what "Show" or "Hide" on a menu acts on - the atom, the bond or the
 * molecule in 3D right-clicked, or the selection there - and what it says.
 * A drawing's atom is offered where it could be a stereocentre (three bonds
 * or more), its bond where it is double; a molecule in 3D's, where it has a
 * label. Whatever the selection holds is taken together: "Hide" where all of
 * it is shown, else "Show".
 */
import { stereoShownOf } from "../document";
import type { Model, Molecule3D } from "../store/types";

/** What R and S, E and Z are shown on or hidden from: the drawing's atoms and bonds, by id; molecules in 3D's, by index - all of a molecule's, given none. */
export type StereoOf = { atoms: number[]; bonds: number[]; molecules: { id: number; atoms?: number[]; bonds?: number[] }[] };

/** What the menu offers: its words, whether it shows (or hides), and on what. */
export type StereoItem = { name: string; show: boolean; of: StereoOf };

/** What a menu was opened on, as far as this looks into it. */
export type StereoMenuAt = { kind: string | null; id: number | null; selection: "none" | "elsewhere" | "here"; atom?: number };

type Held = {
  model: Model;
  sel: { atoms: ReadonlySet<number>; bonds: ReadonlySet<number> };
  molecules3d: readonly Molecule3D[];
  sel3d: ReadonlySet<number>;
  chosen3d: { id: number; atoms: number[]; bonds: number[] } | null;
};

export function stereoItemFor(st: Held, at: StereoMenuAt): StereoItem | null {
  const degree = new Map<number, number>();
  for (const b of st.model.bonds) {
    degree.set(b.a, (degree.get(b.a) ?? 0) + 1);
    degree.set(b.b, (degree.get(b.b) ?? 0) + 1);
  }
  const atomById = new Map(st.model.atoms.map((a) => [a.id, a]));
  const bondById = new Map(st.model.bonds.map((b) => [b.id, b]));
  const centre = (id: number) => (degree.get(id) ?? 0) >= 3;
  const double = (id: number) => bondById.get(id)?.order === 2;
  const of: StereoOf = { atoms: [], bonds: [], molecules: [] };
  // (of a molecule in 3D: those given that have labels - all of them, given none)
  const in3d = (m: Molecule3D, atoms?: number[], bonds?: number[]) => {
    const st3 = m.stereo;
    if (!st3) return;
    const all = !atoms?.length && !bonds?.length;
    const a = all ? Object.keys(st3.atoms).map(Number) : (atoms ?? []).filter((i) => i in st3.atoms);
    const b = all ? Object.keys(st3.bonds).map(Number) : (bonds ?? []).filter((i) => i in st3.bonds);
    if (a.length || b.length) of.molecules.push({ id: m.id, atoms: a, bonds: b });
  };
  const molecule = (id: number | null) => st.molecules3d.find((m) => m.id === id);
  if (at.selection === "here") {
    of.atoms = [...st.sel.atoms].filter(centre);
    of.bonds = [...st.sel.bonds].filter(double);
    for (const id of st.sel3d) {
      const m = molecule(id);
      if (m) in3d(m);
    }
    const c = st.chosen3d;
    const cm = c && !st.sel3d.has(c.id) ? molecule(c.id) : undefined;
    if (cm && c && (c.atoms.length || c.bonds.length)) in3d(cm, c.atoms, c.bonds);
  } else if (at.kind === "atom" && at.id != null) {
    if (centre(at.id)) of.atoms = [at.id];
  } else if (at.kind === "bond" && at.id != null) {
    if (double(at.id)) of.bonds = [at.id];
  } else if (at.kind === "molecule3d") {
    const m = molecule(at.id);
    const c = st.chosen3d;
    if (m?.stereo) {
      // (the atom under the pointer, where it has a label; else what is chosen in it; else all of it)
      if (at.atom != null && at.atom in m.stereo.atoms) in3d(m, [at.atom], []);
      else if (c && c.id === m.id && (c.atoms.length || c.bonds.length)) in3d(m, c.atoms, c.bonds);
      else in3d(m);
    }
  }
  const atoms = of.atoms.length > 0 || of.molecules.some((g) => g.atoms?.length);
  const bonds = of.bonds.length > 0 || of.molecules.some((g) => g.bonds?.length);
  if (!atoms && !bonds) return null;
  const shown3d = (g: StereoOf["molecules"][number]) => {
    const s = stereoShownOf(molecule(g.id) ?? {}) ?? { atoms: [], bonds: [] };
    return (g.atoms ?? []).every((i) => s.atoms.includes(i)) && (g.bonds ?? []).every((i) => s.bonds.includes(i));
  };
  const allShown =
    of.atoms.every((id) => atomById.get(id)?.stereoShown) && of.bonds.every((id) => bondById.get(id)?.stereoShown) && of.molecules.every(shown3d);
  const what = atoms && bonds ? "R/S and E/Z" : atoms ? "R/S" : "E/Z";
  return { name: `${allShown ? "Hide" : "Show"} ${what}`, show: !allShown, of };
}
