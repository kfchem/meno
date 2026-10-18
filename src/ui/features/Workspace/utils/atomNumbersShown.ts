/**
 * Atom numbers shown on what is asked (docs/WORKSPACE.md, *Atom numbers*),
 * as R and S are (./stereoShown): what "Show" or "Hide" on a menu acts on -
 * the molecule in 3D right-clicked, or the atoms chosen in it, or the
 * selection there; and the atom right-clicked, alone - and what each says;
 * and the kinds of number offered, where those it acts on show some.
 */
import { ATOM_NUMBER_KINDS, numbersShownOn, type AtomNumberKind } from "./atomNumbers";
import type { Molecule3D } from "../store/types";

/** What atom numbers are shown on or hidden from: molecules in 3D, by id, and their atoms, by index - all of a molecule's, given none. */
export type NumbersOf = { id: number; atoms?: number[] }[];

/** What the menu offers: its words, whether it shows (or hides), and on what; and the kinds of number to choose from, and on which molecules. */
export type NumbersItems = {
  items: { name: string; show: boolean; of: NumbersOf }[];
  kinds: { name: string; kind: AtomNumberKind; checked: boolean; molecules: number[] }[];
};

/** What a menu was opened on, as far as this looks into it. */
export type NumbersMenuAt = { kind: string | null; id: number | null; selection: "none" | "elsewhere" | "here"; atom?: number };

type Held = {
  molecules3d: readonly Molecule3D[];
  sel3d: ReadonlySet<number>;
  chosen3d: { id: number; atoms: number[]; bonds: number[] } | null;
};

export function numbersItemsFor(st: Held, at: NumbersMenuAt): NumbersItems | null {
  const molecule = (id: number | null) => st.molecules3d.find((m) => m.id === id);
  const of: NumbersOf = [];
  let alone: { id: number; atom: number } | null = null;
  const c = st.chosen3d;
  if (at.selection === "here") {
    for (const id of st.sel3d) if (molecule(id)) of.push({ id });
    const cm = c && !st.sel3d.has(c.id) ? molecule(c.id) : undefined;
    if (cm && c && c.atoms.length) of.push({ id: c.id, atoms: [...c.atoms] });
  } else if (at.kind === "molecule3d") {
    const m = molecule(at.id);
    if (m) {
      // (the atoms chosen in it; else all of it - and the atom right-clicked, alone)
      if (c && c.id === m.id && c.atoms.length) of.push({ id: m.id, atoms: [...c.atoms] });
      else {
        of.push({ id: m.id });
        if (at.atom != null && at.atom >= 0 && at.atom < m.atoms.length) alone = { id: m.id, atom: at.atom };
      }
    }
  }
  if (!of.length) return null;
  const shown = (g: { id: number; atoms?: number[] }) => {
    const m = molecule(g.id);
    if (!m) return true;
    const on = numbersShownOn(m);
    return (g.atoms ?? m.atoms.map((_, i) => i)).every((i) => on[i] === 1);
  };
  const all = of.every(shown);
  const items: NumbersItems["items"] = [{ name: `${all ? "Hide" : "Show"} atom numbers`, show: !all, of }];
  if (alone) {
    const one = shown({ id: alone.id, atoms: [alone.atom] });
    items.push({ name: `${one ? "Hide" : "Show"} this atom's number`, show: !one, of: [{ id: alone.id, atoms: [alone.atom] }] });
  }
  // (the kinds, where those it acts on show numbers and could show another kind)
  const showing = of.map((g) => molecule(g.id)).filter((m): m is Molecule3D => !!m?.atomNumbers);
  const offered = ATOM_NUMBER_KINDS.filter((k) => showing.some((m) => k.has(m)));
  const kinds =
    showing.length && offered.length > 1
      ? offered.map((k) => ({ name: k.name, kind: k.kind, checked: showing.every((m) => m.atomNumbers!.kind === k.kind), molecules: showing.map((m) => m.id) }))
      : [];
  return { items, kinds };
}
