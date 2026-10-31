import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { writeRxnfile, type WriterModel } from "../../../../lib/chem/molWriter";
import { arrowEnds, reactionRoles } from "../../../../lib/chem/reactionScheme";
import type { Drawn } from "../store/types";
import { mapMarks, mapStanding } from "./atomMap";
import { forFlatReaders } from "./drawing";

/** How near an arrow's tail or point a structure is drawn, at most, for the arrow to show its reaction: in bonds. */
const NEAR_BONDS = 5;

/**
 * The drawing's arrows that show a reaction: those with a structure drawn
 * before their tail or past their point, near it - a reactant or a product
 * - whatever their kind, an RXN file holding none. An arrow alone, on a
 * slide, shows none.
 */
export function reactionArrows(drawn: Drawn): NonNullable<Drawn["arrows"]> {
  const arrows = drawn.arrows ?? [];
  if (!arrows.length || !drawn.atoms.length) return [];
  const near = NEAR_BONDS * NOMINAL_BOND_LENGTH;
  return arrows.filter((a) => {
    const { from, to } = arrowEnds(a);
    const u = { x: Math.cos(a.angle), y: Math.sin(a.angle) };
    return drawn.atoms.some((p) => {
      const along = (p.x - from.x) * u.x + (p.y - from.y) * u.y;
      if (along <= 0) return Math.hypot(p.x - from.x, p.y - from.y) < near;
      if (along >= a.length) return Math.hypot(p.x - to.x, p.y - to.y) < near;
      return false;
    });
  });
}

/** Why the drawing cannot be written as an RXN file - it holds one reaction - or null if it can. */
export function notOneReaction(drawn: Drawn): string | null {
  const arrows = reactionArrows(drawn).length;
  if (arrows === 1) return null;
  return arrows === 0
    ? "An RXN file holds a reaction: draw it with its arrow, and what reacts or what it gives beside it."
    : `An RXN file holds one reaction, and the drawing has ${arrows} arrows.`;
}

/**
 * The drawing as an RXN file: each molecule a reactant, a product or a
 * reagent by where it is drawn against the arrow (lib/chem/reactionScheme) -
 * a plain reaction, whatever the arrow's kind - its atom map's numbers and
 * reacting centres written, where its arrow has a map of it as drawn, shown
 * or not (chem/atomMap) -
 * a cage drawn in perspective given its wedges as a MOL file is; in V3000
 * where `version` asks, else in V2000 where V2000 holds it. Throws, saying
 * why, where the drawing is not one reaction.
 */
export function reactionFileText(drawn: Drawn, title?: string, version: "V3000" | "auto" = "auto"): string {
  const why = notOneReaction(drawn);
  if (why) throw new Error(why);
  const arrow = reactionArrows(drawn)[0];
  const flat = forFlatReaders(withMapMarks(drawn, arrow));
  const roles = reactionRoles(flat, arrow, drawn.pluses ?? [], NOMINAL_BOND_LENGTH);
  const molecule = (ids: number[]): WriterModel => {
    const inside = new Set(ids);
    return {
      atoms: flat.atoms.filter((a) => inside.has(a.id)),
      bonds: flat.bonds.filter((b) => inside.has(b.a) && inside.has(b.b)),
    };
  };
  return writeRxnfile(
    {
      reactants: roles.reactants.map(molecule),
      products: roles.products.map(molecule),
      reagents: roles.reagents.map(molecule),
    },
    { title, version },
  );
}

/** The drawing with what the arrow's atom map shows written on its atoms and bonds, where the map is of it as it is drawn; else as it is. */
function withMapMarks(drawn: Drawn, arrow: Pick<NonNullable<Drawn["arrows"]>[number], "atomMap">): Drawn {
  const map = arrow.atomMap;
  if (!map || mapStanding(arrow, drawn) !== "ready") return drawn;
  const { numbers, centres } = mapMarks(map, drawn);
  return {
    ...drawn,
    atoms: drawn.atoms.map((a) => (numbers.has(a.id) ? { ...a, map: numbers.get(a.id) } : a)),
    bonds: drawn.bonds.map((b) => (centres.has(b.id) ? { ...b, reactingCentre: centres.get(b.id) } : b)),
  };
}

/**
 * What a reaction SMILES is made from, of the drawing (Copy as SMILES): its
 * reaction as an RXN file holds it (`reactionFileText`) - the worker writes
 * it "reactants>agents>products" - or why it holds none to write: more than
 * one arrow, or nothing on one side of it. None where the drawing shows no
 * reaction, which is written as a SMILES of its molecules. Never a mixture
 * of a reaction's molecules, as if they were one (2026-10-22).
 */
export function reactionForSmiles(drawn: Drawn): { rxn: string } | { why: string } | null {
  const arrows = reactionArrows(drawn);
  if (!arrows.length) return null;
  if (arrows.length > 1) return { why: `a reaction SMILES holds one reaction, and the selection has ${arrows.length} arrows: copy its steps one at a time` };
  const flat = forFlatReaders(drawn);
  const roles = reactionRoles(flat, arrows[0], drawn.pluses ?? [], NOMINAL_BOND_LENGTH);
  if (!roles.reactants.length || !roles.products.length)
    return { why: `the arrow has nothing ${roles.reactants.length ? "after it - no product" : "before it - no reactant"} to write as a reaction` };
  return { rxn: reactionFileText(drawn) };
}
