/**
 * A structure's identity and symmetry (docs/WORKFLOWS-FOUNDATION.md, PR 2),
 * from the canonical numbering Clean-up writes its layouts by
 * (src/lib/layout/canonical.ts):
 * - its identity: the structure written in its own order - the same for
 *   the same structure however its atoms are numbered, another for any
 *   other, a chiral one's mirror image included - and a short key of it;
 * - its atoms' orbits under the automorphisms found, and those
 *   automorphisms; and the group they generate, counted up to a cap.
 * Identity never replaces an entry's fixed numbering: it is worked out
 * from it, once per structure.
 */
import { canonicalText, symmetryOrbits as orbitsAsDrawn } from "../layout/canonical";
import type { LayoutInput } from "../layout/perceive";

/** The bond order a bond its Kekulé structures disagree on is given for identity and symmetry, beside 1, 2 and 3. */
const AROMATIC = 4;

/**
 * The structure with every bond whose order its Kekulé structures disagree
 * on given one order, whichever of them was drawn: Meno's rule for identity
 * and symmetry. A structure's double bonds pair its atoms off (a perfect
 * matching of those with one); another Kekulé structure of it differs by
 * an alternating cycle - single and double bonds in turn, round a ring.
 * So a bond is drawn now single, now double exactly where it lies on such a
 * cycle, and those bonds become `AROMATIC`: benzene's, naphthalene's,
 * phenanthrene's and azulene's ring bonds, a pyridine's, cyclooctatetraene's.
 * A bond on no such cycle keeps its order, as every Kekulé structure has it:
 * pyrrole's, furan's and thiophene's (they have one Kekulé structure), a
 * quinone's (its C=O is no part of a cycle), azulene's middle bond. Which
 * bonds lie on an alternating cycle is the structure's, not the drawing's,
 * so every Kekulé structure of one structure comes to the same form, and
 * its identity cannot split by how its rings were drawn.
 */
export function aromaticForm(input: LayoutInput): LayoutInput {
  const n = input.atoms.length;
  // (each atom's partner by its one double bond, where it has exactly one and no triple bond)
  const mate = new Array<number>(n).fill(-1);
  const doubles = new Array<number>(n).fill(0);
  const triple = new Array<boolean>(n).fill(false);
  for (const b of input.bonds) {
    if (b.order === 2) {
      doubles[b.a]++;
      doubles[b.b]++;
      mate[b.a] = b.b;
      mate[b.b] = b.a;
    } else if (b.order === 3) triple[b.a] = triple[b.b] = true;
  }
  const paired = (i: number) => doubles[i] === 1 && !triple[i] && mate[i] >= 0 && doubles[mate[i]] === 1 && !triple[mate[i]];
  // (the single bonds between paired atoms: what an alternating cycle's other half runs along)
  const singles: number[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    if (b.order === 1 && paired(b.a) && paired(b.b)) {
      singles[b.a].push(b.b);
      singles[b.b].push(b.a);
    }
  }
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const aromatic = new Set<string>();
  // a single bond u-v lies on an alternating cycle where, from v's partner, single and double bonds in
  // turn reach a single bond into u's partner (u - v = v' - ... - u' = u)
  for (const b of input.bonds) {
    if (b.order !== 1 || !paired(b.a) || !paired(b.b) || mate[b.a] === b.b) continue;
    const [u, v] = [b.a, b.b];
    const goal = mate[u];
    const seen = new Set<number>([mate[v]]);
    const queue = [mate[v]];
    let found = false;
    while (queue.length && !found) {
      const x = queue.shift()!;
      for (const y of singles[x]) {
        if (y === goal) {
          found = true;
          break;
        }
        if (y === u || y === v) continue;
        const next = mate[y];
        if (next === u || next === v || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (!found) continue;
    aromatic.add(key(u, v));
    aromatic.add(key(u, mate[u]));
    aromatic.add(key(v, mate[v]));
  }
  if (!aromatic.size) return input;
  return { ...input, bonds: input.bonds.map((b) => (aromatic.has(key(b.a, b.b)) ? { ...b, order: AROMATIC } : b)) };
}

/** The structure written in its own order (`canonicalText`): the same text for the same structure, whatever order its atoms are in. */
export function identityText(input: LayoutInput): string {
  return canonicalText(aromaticForm(input));
}

/**
 * A structure's identity as a short key: its identity text hashed (FNV-1a,
 * twice over, 64 bits as hex). Two structures with the same key are the
 * same structure but by a collision far less likely than a typo; where it
 * matters, the texts are compared.
 */
export function identityKey(input: LayoutInput): string {
  const text = identityText(input);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Each atom's orbit (atoms an automorphism takes onto each other share
 * one, numbered the same whatever the order of the atoms), the
 * automorphisms found, and whether the search was complete (layout's
 * `symmetryOrbits`: where it was not, some orbits are split, never joined
 * wrongly) - of the structure's aromatic form, so that a benzene ring's
 * atoms are alike whichever Kekulé structure was drawn.
 */
export function symmetryOrbits(input: LayoutInput): ReturnType<typeof orbitsAsDrawn> {
  return orbitsAsDrawn(aromaticForm(input));
}

/** How many automorphisms `automorphismGroup` lists at most, unless told otherwise. */
export const GROUP_CAP = 10_000;

/**
 * The automorphism group the automorphisms found generate: every product of
 * them, the identity first, each a permutation of the atoms (atom to atom);
 * listed up to `cap` - `complete` false where there were more. Every
 * symmetric comparison of two geometries (an RMSD over the molecule's
 * symmetries) takes the least over these.
 */
export function automorphismGroup(generators: readonly (readonly number[])[], n: number, cap = GROUP_CAP): { members: number[][]; complete: boolean } {
  const identity = Array.from({ length: n }, (_, i) => i);
  const key = (p: readonly number[]) => p.join(",");
  const seen = new Set([key(identity)]);
  const members = [identity];
  for (let k = 0; k < members.length; k++) {
    for (const g of generators) {
      // (g after the member: atom a goes where the member takes it, then where g takes that)
      const product = members[k].map((x) => g[x]);
      const kp = key(product);
      if (seen.has(kp)) continue;
      if (members.length >= cap) return { members, complete: false };
      seen.add(kp);
      members.push(product);
    }
  }
  return { members, complete: true };
}
