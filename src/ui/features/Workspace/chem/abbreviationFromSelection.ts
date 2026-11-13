import { implicitHydrogens } from "../../../../lib/chem/molecule";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import { writeSmiles, type SmilesAtomOut } from "../../../../lib/chem/smiles";
import type { Model } from "../store/types";
import { readStereo } from "../../../../lib/layout/drawn";
import { drawingOf } from "./drawing";

/**
 * The selected atoms as an abbreviation's structure: SMILES from a "*" where
 * the one bond out of them leaves - the atom on its other end - with each
 * atom's hydrogens as the drawing has them. Or why they cannot be one: they
 * must be held together by their bonds, have exactly one bond to the rest
 * of the drawing, and be elements, none an abbreviation or other label.
 * Wedges are not kept: an abbreviation's structure has no stereo - and
 * where its bonds, or its bond out, show any - marked, or a double bond's
 * cis or trans by how it is drawn - or its atoms' places give its
 * configuration with no wedge (a cage drawn in depth, a centre a
 * perspective drawing or projection shows: `z`, `stereoCentre`), that is
 * said (`notKept`), never passed over.
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
  const notKept = stereoNotKept([...inner, out], cisTransDrawn(model, ids, [...inner, out]), inside.some((a) => a.z != null || a.stereoCentre));
  return notKept ? { smiles, notKept } : { smiles };
}

/**
 * Whether a double bond among `bonds` - or a cumulene whose atoms are all
 * the group's - has its cis or trans stated by how it is drawn, as Meno
 * reads a drawing's stereo (lib/layout/drawn `readStereo`: a group off the
 * bond's line at each end, outside a ring of up to seven).
 */
function cisTransDrawn(model: Model, ids: ReadonlySet<number>, bonds: readonly Model["bonds"][number][]): boolean {
  const drawing = drawingOf(model);
  const stereo = readStereo(drawing.atoms, drawing.bonds);
  const at = (id: number) => drawing.index.get(id);
  const pairs = new Set(bonds.map((b) => [at(b.a), at(b.b)].sort().join("-")));
  const stated = [...stereo.cisTrans.keys()].some((k) => pairs.has([drawing.bonds[k].a, drawing.bonds[k].b].sort().join("-")));
  return stated || stereo.cumulated.some((c) => c.atoms.every((i) => ids.has(model.atoms[i].id)));
}

/**
 * What of the stereo its drawing shows an abbreviation does not keep, in
 * plain words: "Its wedges are not kept: an abbreviation has no stereo." -
 * its wedges and hashes, its wavy bonds, its double bonds drawn crossed;
 * the cis or trans its double bonds are drawn in (`cisTrans`); and the
 * configuration its atoms' places give with no wedge - in depth, or a
 * centre a perspective drawing or projection shows (`placed`) - or none,
 * where it shows none.
 */
export function stereoNotKept(bonds: readonly Pick<Model["bonds"][number], "stereo">[], cisTrans = false, placed = false): string | null {
  const has = (...kinds: string[]) => bonds.some((b) => b.stereo != null && kinds.includes(b.stereo));
  const kinds = [has("up", "down") ? "wedges" : "", has("wavy") ? "wavy bonds" : "", has("either") ? "crossed double bonds" : ""].filter(Boolean);
  const and = (xs: readonly string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const said = [
    ...(kinds.length ? [`its ${and(kinds)}`] : []),
    ...(cisTrans ? ["the cis or trans of its double bonds"] : []),
    ...(placed ? ["the configuration its atoms' places give"] : []),
  ];
  if (!said.length) return null;
  // (one of its marks is many; the cis or trans, or the configuration, alone is one)
  const many = said.length > 1 || kinds.length > 0;
  const text = and(said);
  return `${text[0].toUpperCase()}${text.slice(1)} ${many ? "are" : "is"} not kept: an abbreviation has no stereo.`;
}
