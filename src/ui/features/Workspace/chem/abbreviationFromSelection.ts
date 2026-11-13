import { implicitHydrogens } from "../../../../lib/chem/molecule";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import { writeSmiles, type SmilesAtomOut } from "../../../../lib/chem/smiles";
import type { Model } from "../store/types";

/**
 * The selected atoms as an abbreviation's structure: SMILES from a "*" where
 * the one bond out of them leaves - the atom on its other end - with each
 * atom's hydrogens as the drawing has them. Or why they cannot be one: they
 * must be held together by their bonds, have exactly one bond to the rest
 * of the drawing, and be elements, none an abbreviation or other label.
 * Wedges are not kept: an abbreviation's structure has no stereo - and
 * where its bonds, or its bond out, show any, that is said (`notKept`),
 * never passed over.
 */
export function abbreviationFromSelection(
  model: Model,
  ids: ReadonlySet<number>,
): { smiles: string; notKept?: string } | { problem: string } {
  const inside = model.atoms.filter((a) => ids.has(a.id));
  if (!inside.length) return { problem: "Select the atoms the abbreviation stands for." };
  const crossing = model.bonds.filter((b) => ids.has(b.a) !== ids.has(b.b));
  if (crossing.length !== 1) {
    return {
      problem:
        crossing.length === 0
          ? "Select a group with one bond to the rest of the structure: where it is attached."
          : `The selection has ${crossing.length} bonds to the rest of the structure; an abbreviation has one.`,
    };
  }
  const labelled = inside.find((a) => !isElementSymbol(a.el) || a.abbrev || a.list || a.rgroups?.length);
  if (labelled) return { problem: `${labelled.el} is a label, not an element: expand it first.` };
  const inner = model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
  // held together?
  const reached = new Set([inside[0].id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const b of inner) {
      if (reached.has(b.a) !== reached.has(b.b)) {
        reached.add(reached.has(b.a) ? b.b : b.a);
        grew = true;
      }
    }
  }
  if (reached.size !== inside.length) return { problem: "The selected atoms are not all bonded together." };

  const out = crossing[0];
  const attach = ids.has(out.a) ? out.a : out.b;
  // the "*" first, then the atoms in the order they are drawn
  const index = new Map(inside.map((a, i) => [a.id, i + 1]));
  const bonds = [
    { a1: 0, a2: index.get(attach)!, order: out.order },
    ...inner.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order })),
  ];
  const sums = new Map<number, number>();
  for (const b of bonds) {
    sums.set(b.a1, (sums.get(b.a1) ?? 0) + b.order);
    sums.set(b.a2, (sums.get(b.a2) ?? 0) + b.order);
  }
  const atoms: SmilesAtomOut[] = [
    { el: "*", hs: 0 },
    ...inside.map((a, i) => ({
      el: a.el,
      hs: a.hCount ?? implicitHydrogens(a.el, sums.get(i + 1) ?? 0, a.charge ?? 0, a.radical),
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.isotope ? { isotope: a.isotope } : {}),
    })),
  ];
  const smiles = writeSmiles(atoms, bonds, 0);
  const notKept = stereoNotKept([...inner, out]);
  return notKept ? { smiles, notKept } : { smiles };
}

/**
 * What of the stereo its bonds show an abbreviation does not keep, in plain
 * words: "Its wedges are not kept: an abbreviation has no stereo." - its
 * wedges and hashes, its wavy bonds, its double bonds drawn crossed - or
 * none, where they show none.
 */
export function stereoNotKept(bonds: readonly Pick<Model["bonds"][number], "stereo">[]): string | null {
  const has = (...kinds: string[]) => bonds.some((b) => b.stereo != null && kinds.includes(b.stereo));
  const kinds = [has("up", "down") ? "wedges" : "", has("wavy") ? "wavy bonds" : "", has("either") ? "crossed double bonds" : ""].filter(Boolean);
  if (!kinds.length) return null;
  const said = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;
  return `Its ${said} are not kept: an abbreviation has no stereo.`;
}
