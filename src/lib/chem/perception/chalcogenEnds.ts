/**
 * End chalcogens on P, As, Sb, S, Se and Te, as identity compares them (part 13, U2; docs/WORKFLOWS-FOUNDATION.md,
 * *Which structures are the same is judged by Meno's identity*):
 * - an X+ with an O-, S-, Se-, Te- or N(-)-R on it, X one of those six with room for one more bond by its higher valence (5 for
 *   P, As, Sb; 6 for S, Se, Te), is written X=O (X=S, X=N-R): the uncharged form - a phosphine oxide drawn R3P=O and drawn
 *   R3P(+)-O(-), a sulfoxide drawn S=O and S(+)-O(-), are one structure (IUPAC 2013 P-93.2.3: the kind of bond to that oxygen does
 *   not matter). Never at N or any other atom of the second period: an amine N-oxide has no N=O form, a nitro group keeps its
 *   charges. A configuration at X is kept: the bond changes, not its neighbours;
 * - the end chalcogens on such a centre - each with no other atom, its bond single or double, at most its one negative charge -
 *   share their double bonds and charges between them: each is written with the same bond, uncharged, and the centre carries
 *   how many there were. So a phosphate diester anion drawn with its charge on one oxygen or on the other is one structure, and
 *   its two oxygens alike leave its P no centre (P-93.2.4); a phosphorothioate anion drawn with its charge on O or on S is one
 *   structure, its O and S still two elements - its P a centre (the text's own example);
 * - an end O-H (S-H, Se-H, Te-H) shares its hydrogen with the other ends of its own element on the centre, never with another
 *   element's: a phosphinic acid's =O and O-H are alike - its P no centre, as its anion's is - while a thio acid drawn P(=S)(O-H)
 *   and drawn P(=O)(S-H) stay two tautomers as drawn (IUPAC 2008 GR-10). Meno's own reading of P-93.2.4's one example of an acid
 *   whose oxygens differ only by isotope (the chemistry check's ruling): an isotope or an unpaired electron keeps an end apart.
 * Se and Te are named by the text (P-93.2.5); As and Sb are Meno's own extension, from P-93.2.2's "treated in the same manner".
 */
import type { ChemAtom, ChemBond } from "./graph";

/** The centres whose end chalcogens are alike, by the most bonds each has room for. */
const CENTRES: ReadonlyMap<string, number> = new Map([
  ["P", 5],
  ["As", 5],
  ["Sb", 5],
  ["S", 6],
  ["Se", 6],
  ["Te", 6],
]);
const CHALCOGENS: ReadonlySet<string> = new Set(["O", "S", "Se", "Te"]);

/** The bond of an end chalcogen whose double bonds and charges its centre's ends share (`chalcogenEnds`): no other bond's. */
export const SHARED_END = 6;

/** An element as written, identity's own marks taken off: a mass number (`^`), an unpaired electron (`.`), a centre's shared ends (`~`). */
export const elementOf = (el: string): string => el.replace(/[\^.~].*$/, "");

type Graph<A extends ChemAtom, B extends ChemBond> = { atoms: readonly A[]; bonds: readonly B[] };

/**
 * The structure with its end chalcogens on P, As, Sb, S, Se and Te written as identity compares them (see the file's header):
 * the uncharged form, then each centre's ends sharing their double bonds, charges and - within one element - hydrogens. The
 * same for every drawing of one structure, whatever the order of its atoms; `g` itself where nothing changes.
 */
export function chalcogenEnds<A extends ChemAtom, B extends ChemBond, G extends Graph<A, B>>(g: G): G {
  return endsShared(unchargedEnds(g));
}

/** Where each pass of `chalcogenEnds` starts: the structure's atoms and bonds copied to change, what is around each atom, and how each reads. */
function opened<A extends ChemAtom, B extends ChemBond>(g: Graph<A, B>) {
  const atoms: A[] = g.atoms.map((a) => ({ ...a }));
  const bonds: B[] = g.bonds.map((b) => ({ ...b }));
  const around: { to: number; bond: number }[][] = atoms.map(() => []);
  bonds.forEach((b, k) => {
    around[b.a].push({ to: b.b, bond: k });
    around[b.b].push({ to: b.a, bond: k });
  });
  const el = (i: number) => elementOf(atoms[i].el);
  // (already written so: not again)
  const shared = (i: number) => atoms[i].el.includes("~");
  const charge = (i: number) => atoms[i].charge ?? 0;
  const hs = (i: number) => atoms[i].hs ?? 0;
  const lone = (i: number) => !atoms[i].tetra && !atoms[i].pi;
  return { atoms, bonds, around, el, shared, charge, hs, lone };
}

/**
 * The uncharged form: X+ - Y(-) written X=Y, X one of the six centres with room for one more bond, Y an end chalcogen or an N
 * with one other atom (see the file's header). Before the aromatic form is worked out, which then reads one form.
 */
export function unchargedEnds<A extends ChemAtom, B extends ChemBond, G extends Graph<A, B>>(g: G): G {
  const { atoms, bonds, around, el, shared, charge, hs, lone } = opened<A, B>(g);
  let changed = false;
  // (the uncharged form: X+ - Y(-) written X=Y while X has room. Where X has more than one such Y and they are not all end
  //  chalcogens - which the sharing below makes alike, whichever is taken - none is taken: the choice would follow the order
  //  of the atoms)
  for (let x = 0; x < atoms.length; x++) {
    const most = CENTRES.get(el(x));
    if (most == null || shared(x)) continue;
    for (;;) {
      if (charge(x) <= 0) break;
      const orders = around[x].map((e) => bonds[e.bond].order);
      if (orders.some((o) => o < 1 || o > 3)) break;
      if (orders.reduce((s, o) => s + o, 0) + hs(x) + 1 > most) break;
      const ys = around[x].filter(({ to: y, bond }) => {
        if (bonds[bond].order !== 1 || charge(y) !== -1 || hs(y) || !lone(y)) return false;
        return (CHALCOGENS.has(el(y)) && around[y].length === 1) || (el(y) === "N" && around[y].length === 2);
      });
      if (!ys.length) break;
      const end = (e: { to: number }) => CHALCOGENS.has(el(e.to)) && around[e.to].length === 1;
      if (ys.length > 1 && !ys.every(end)) break;
      const { to: y, bond } = ys[0];
      bonds[bond] = { ...bonds[bond], order: 2 };
      atoms[x] = { ...atoms[x], charge: charge(x) - 1 };
      atoms[y] = { ...atoms[y], charge: 0 };
      changed = true;
    }
  }

  return changed ? { ...g, atoms, bonds } : g;
}

/** Each centre's end chalcogens sharing their double bonds and charges, and within one element their hydrogens (see the file's header). */
export function endsShared<A extends ChemAtom, B extends ChemBond, G extends Graph<A, B>>(g: G): G {
  const { atoms, bonds, around, el, shared, charge, hs, lone } = opened<A, B>(g);
  let changed = false;
  // (each centre's ends: double bonds and charges shared by all of them, hydrogens within one element)
  for (let x = 0; x < atoms.length; x++) {
    if (!CENTRES.has(el(x)) || shared(x)) continue;
    const kept = around[x].filter(({ to: y, bond }) => {
      if (!CHALCOGENS.has(el(y)) || around[y].length !== 1 || !lone(y)) return false;
      const o = bonds[bond].order;
      const q = charge(y);
      if (o === 1) return (q === 0 && hs(y) <= 1) || (q === -1 && !hs(y));
      return o === 2 && q === 0 && !hs(y);
    });
    if (kept.length < 2) continue;
    const said = (y: number, bond: number) => `${atoms[y].el}|${bonds[bond].order}|${charge(y)}|${hs(y)}`;
    if (new Set(kept.map(({ to, bond }) => said(to, bond))).size === 1) continue;
    const order = kept.reduce((s, { bond }) => s + bonds[bond].order, 0);
    const h = new Map<string, number>();
    for (const { to } of kept) if (hs(to)) h.set(atoms[to].el, (h.get(atoms[to].el) ?? 0) + hs(to));
    const hText = [...h].sort(([p], [r]) => (p < r ? -1 : p > r ? 1 : 0)).map(([e, n]) => `,h${e}${n}`).join("");
    // (how many ends, their double bonds, and their hydrogens by element: their charge follows, each end's bonds, charge and
    //  hydrogens making up its valence)
    atoms[x] = { ...atoms[x], el: `${atoms[x].el}~${kept.length},${order}${hText}` };
    for (const { to, bond } of kept) {
      bonds[bond] = { ...bonds[bond], order: SHARED_END };
      atoms[to] = { ...atoms[to], charge: 0, hs: 0 };
    }
    changed = true;
  }
  return changed ? { ...g, atoms, bonds } : g;
}

/**
 * The bonds of a structure whose ends share (`endsShared`) as a drawing of it would have them, for what asks only the centre: on
 * each centre, as many of its shared bonds double as its ends had double bonds, the rest single. Which of them is double is not
 * said by the structure and is not asked: the lone-pair rule reads a centre by its own bonds' orders and charge.
 */
export function endsAsDrawn<B extends ChemBond>(atoms: readonly ChemAtom[], bonds: readonly B[]): B[] {
  const doubles = atoms.map((a) => {
    const m = /~(\d+),(\d+)/.exec(a.el);
    return m ? Number(m[2]) - Number(m[1]) : 0;
  });
  return bonds.map((b) => {
    if (b.order !== SHARED_END) return b;
    const centre = atoms[b.a].el.includes("~") ? b.a : b.b;
    if (doubles[centre] > 0) {
      doubles[centre]--;
      return { ...b, order: 2 };
    }
    return { ...b, order: 1 };
  });
}
