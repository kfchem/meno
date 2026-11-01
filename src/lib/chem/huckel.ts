/**
 * The bonds of Hückel rings: rings of single and double bonds in turn, each
 * atom with one double bond, of 4n + 2 atoms - a benzene ring's, a
 * pyridine's, every one of a naphthalene's. Which of them a Kekulé structure
 * makes double is no part of a molecule's shape or of which of its atoms are
 * alike. A cyclooctatetraene's ring, of 4n, is none: its double bonds stay
 * where they are, as a pyrrole's do.
 */
import type { LayoutInput } from "../layout/perceive";

/** The order a Hückel ring's bonds are all given (`huckelForm`): as lib/chem/identity's aromatic bonds. */
const AROMATIC = 4;
/** The most steps the search for one bond's Hückel ring takes; past it, the bond keeps its order: two alike can then be told apart, never two unlike made one. */
const RING_STEPS = 100_000;

const pairKey = (x: number, y: number) => (x < y ? `${x},${y}` : `${y},${x}`);

/** The bonds of Hückel rings, each by its atoms ("a,b", the lower first). */
export function huckelBonds(n: number, bonds: readonly { a: number; b: number; order: number }[]): Set<string> {
  const mate = new Array<number>(n).fill(-1);
  const doubles = new Array<number>(n).fill(0);
  const triple = new Array<boolean>(n).fill(false);
  for (const b of bonds) {
    if (b.order === 2) {
      doubles[b.a]++;
      doubles[b.b]++;
      mate[b.a] = b.b;
      mate[b.b] = b.a;
    } else if (b.order === 3) triple[b.a] = triple[b.b] = true;
  }
  const paired = (i: number) => doubles[i] === 1 && !triple[i];
  const singles: number[][] = Array.from({ length: n }, () => []);
  for (const b of bonds) {
    if (b.order === 1 && paired(b.a) && paired(b.b)) {
      singles[b.a].push(b.b);
      singles[b.b].push(b.a);
    }
  }
  const found = new Set<string>();
  for (const b of bonds) {
    if (b.order !== 1 || !paired(b.a) || !paired(b.b) || found.has(pairKey(b.a, b.b))) continue;
    // (u - v = v' - y = z - ... - u' = u: from v', a single bond and a double in turn, m times, then a single bond
    //  into u' - a ring of 2m + 4 atoms, 4n + 2 where m is odd)
    const [u, v] = [b.a, b.b];
    const goal = mate[u];
    const on = new Set([u, v, mate[v]]);
    const ring = [u, v, mate[v]];
    let steps = 0;
    const walk = (x: number, m: number): boolean => {
      for (const y of singles[x]) {
        if (++steps > RING_STEPS) return false;
        if (y === goal) {
          if (m % 2 === 1) return true;
          continue;
        }
        const z = mate[y];
        if (on.has(y) || on.has(z)) continue;
        on.add(y).add(z);
        ring.push(y, z);
        if (walk(z, m + 1)) return true;
        ring.length -= 2;
        on.delete(y);
        on.delete(z);
      }
      return false;
    };
    if (!walk(mate[v], 0)) continue;
    ring.push(goal);
    ring.forEach((x, k) => found.add(pairKey(x, ring[(k + 1) % ring.length])));
  }
  return found;
}

/** The structure with its Hückel rings' bonds aromatic, the rest as they are. */
export function huckelForm(input: LayoutInput): LayoutInput {
  const found = huckelBonds(
    input.atoms.length,
    input.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
  );
  if (!found.size) return input;
  return { ...input, bonds: input.bonds.map((b) => (found.has(pairKey(b.a, b.b)) ? { ...b, order: AROMATIC } : b)) };
}
