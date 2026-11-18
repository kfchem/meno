/**
 * Where a structure drawn can carry a configuration, by the core's candidates (lib/chem/perception/stereo/candidates,
 * foundation part 13): its atoms and bonds by id. A centre is its atom; a double bond, itself; a run of cumulated double
 * bonds, each of its double bonds; a biaryl's axis the drawing states, its bond. Read as identity reads the structure
 * (chem/identityOf `identityInputOf`), its plain hydrogens counted on their atoms.
 */
import { candidates } from "../../../../lib/chem/perception/stereo/candidates";
import { hydrogensFolded, plainHydrogenAtoms } from "../../../../lib/chem/perception/fold";
import type { Model } from "../store/types";
import { identityInputOf } from "./identityOf";

export function candidatesDrawn(part: Model): { atoms: Set<number>; bonds: Set<number> } {
  const { input, bondAt } = identityInputOf(part);
  const folded = plainHydrogenAtoms(input);
  // (each atom of the folded structure, by its place there: the drawing's atom id)
  const idAt: number[] = [];
  input.atoms.forEach((_, i) => folded[i] || idAt.push(part.atoms[i].id));
  const g = hydrogensFolded(input);
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const placeOf = new Map(idAt.map((id, k) => [id, k]));
  const bondId = new Map<string, number>();
  const orders = new Map<string, number>();
  part.bonds.forEach((b, k) => {
    if (bondAt[k] < 0) return;
    const p = placeOf.get(b.a);
    const q = placeOf.get(b.b);
    if (p == null || q == null) return;
    bondId.set(pair(p, q), b.id);
    orders.set(pair(p, q), b.order);
  });
  const atoms = new Set<number>();
  const bonds = new Set<number>();
  const add = (p: number, q: number) => {
    const id = bondId.get(pair(p, q));
    if (id != null) bonds.add(id);
  };
  // (a run's double bonds: from one end along double bonds to the other)
  const around = g.atoms.map(() => [] as number[]);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const run = (from: number, to: number) => {
    let at = from;
    let before = -1;
    while (at !== to) {
      const next = around[at].find((n) => n !== before && orders.get(pair(at, n)) === 2);
      if (next == null) return;
      add(at, next);
      before = at;
      at = next;
    }
  };
  for (const c of candidates(g)) {
    if (c.kind === "centre") atoms.add(idAt[c.at]);
    else if (c.kind === "bond") add(g.bonds[c.at].a, g.bonds[c.at].b);
    else if (c.kind === "biaryl") add(c.atoms[0], c.atoms[1]);
    else run(c.ends[0], c.ends[1]);
  }
  return { atoms, bonds };
}
