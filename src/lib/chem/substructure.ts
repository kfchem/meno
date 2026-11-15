/**
 * Whether one structure holds another (docs/WORKFLOWS-FOUNDATION.md,
 * *Whether one structure holds another*):
 * each atom of the one asked for (the query) found, one to one, among the
 * atoms of the other (the target), with every bond between query atoms a
 * bond between theirs. A target's further atoms and bonds are no matter.
 *
 * Meno's rules for it, as identity's are where they meet (./identity):
 * - an atom matches an atom of its element, its charge, its mass number
 *   where it says one, and its unpaired electrons;
 * - a bond matches a bond of its order, aromatic rings in one form
 *   (`aromaticForm`) - however either was drawn of its Kekulé structures;
 * - a query's hydrogens are no condition, but for a hydrogen drawn as an
 *   atom: that asks for a hydrogen on its atom's match, drawn or not. Its
 *   hydrogens not drawn ask nothing: a methyl drawn as "C" is found in any
 *   carbon;
 * - configurations are not compared: a query is a constitution.
 *
 * Found by trying atoms in turn and going back where one does not fit,
 * each query atom tried after one it is bonded to, among those of its
 * element alone. A search that has tried `STEPS_MOST` placements stops,
 * and says it did not finish: never a "not found" it did not show.
 */
import type { LayoutBond } from "../layout/perceive";
import { aromaticForm, type IdentityAtom, type IdentityInput } from "./identity";

/** How many placements a search tries before it stops, saying so. */
export const STEPS_MOST = 1_000_000;

/**
 * A search's answer: found, with where - each query atom other than a
 * hydrogen drawn, by its place among the query's atoms, with its match's
 * among the target's - or not; and whether it finished.
 */
export type Holds = { found: true; map: [query: number, target: number][] } | { found: false; finished: boolean };

/** A structure as the search reads it: its atoms other than hydrogens drawn, each with the hydrogens it has (drawn or not) and those drawn on it; their bonds. */
type Graph = { atoms: (IdentityAtom & { hTotal: number; hDrawn: number; at: number })[]; around: { to: number; order: number }[][] };

const isPlainH = (a: IdentityAtom) => a.el === "H" && !a.isotope && !a.charge && !a.radical;

function graphOf(input: IdentityInput): Graph {
  const form = aromaticForm(input);
  const keep = form.atoms.map((a) => !isPlainH(a as IdentityAtom));
  const place = new Map<number, number>();
  const atoms: Graph["atoms"] = [];
  form.atoms.forEach((a, i) => {
    if (!keep[i]) return;
    place.set(i, atoms.length);
    atoms.push({ ...(a as IdentityAtom), hTotal: a.hs ?? 0, hDrawn: 0, at: i });
  });
  const around: Graph["around"] = atoms.map(() => []);
  for (const b of form.bonds as readonly LayoutBond[]) {
    const p = place.get(b.a);
    const q = place.get(b.b);
    if (p != null && q != null) {
      around[p].push({ to: q, order: b.order });
      around[q].push({ to: p, order: b.order });
    } else if (p != null || q != null) {
      // (a hydrogen drawn as an atom: one of its neighbour's)
      const heavy = atoms[(p ?? q)!];
      heavy.hTotal++;
      heavy.hDrawn++;
    }
  }
  return { atoms, around };
}

const atomFits = (q: Graph["atoms"][number], t: Graph["atoms"][number]) =>
  q.el === t.el && (q.charge ?? 0) === (t.charge ?? 0) && (q.isotope == null || q.isotope === t.isotope) && (q.radical ?? 0) === (t.radical ?? 0) && t.hTotal >= q.hDrawn;

/** Whether `target` holds `query`, as Meno's rules have it - and where. A query of no atom but hydrogens drawn holds nothing to find. */
export function holdsSubstructure(query: IdentityInput, target: IdentityInput, most = STEPS_MOST): Holds {
  const Q = graphOf(query);
  const T = graphOf(target);
  const n = Q.atoms.length;
  if (!n || n > T.atoms.length) return { found: false, finished: true };
  // (each query atom after one it is bonded to, where it has one: a breadth-first order, part by part)
  const order: number[] = [];
  const seen = new Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    seen[s] = true;
    const queue = [s];
    while (queue.length) {
      const i = queue.shift()!;
      order.push(i);
      for (const { to } of Q.around[i]) {
        if (seen[to]) continue;
        seen[to] = true;
        queue.push(to);
      }
    }
  }
  const map = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(T.atoms.length).fill(false);
  let steps = 0;
  let stopped = false;
  const fits = (i: number, t: number): boolean => {
    if (used[t] || !atomFits(Q.atoms[i], T.atoms[t]) || T.around[t].length < Q.around[i].length) return false;
    // (each bond to a query atom placed already: a bond of its order to that atom's match)
    for (const { to, order } of Q.around[i]) {
      if (map[to] < 0) continue;
      if (!T.around[t].some((b) => b.to === map[to] && b.order === order)) return false;
    }
    return true;
  };
  const place = (k: number): boolean => {
    if (k === n) return true;
    const i = order[k];
    // (where it is bonded to one placed: among that one's neighbours alone)
    const placedNeighbour = Q.around[i].find((b) => map[b.to] >= 0);
    const candidates = placedNeighbour ? T.around[map[placedNeighbour.to]].map((b) => b.to) : T.atoms.map((_, t) => t);
    for (const t of candidates) {
      if (++steps > most) {
        stopped = true;
        return false;
      }
      if (!fits(i, t)) continue;
      map[i] = t;
      used[t] = true;
      if (place(k + 1)) return true;
      map[i] = -1;
      used[t] = false;
      if (stopped) return false;
    }
    return false;
  };
  if (place(0)) return { found: true, map: map.map((t, i) => [Q.atoms[i].at, T.atoms[t].at]) };
  return { found: false, finished: !stopped };
}
