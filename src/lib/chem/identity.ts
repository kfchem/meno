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
import { smallestRings } from "../layout/rings";

/** The bond order an aromatic ring's bonds are given for identity and symmetry, beside 1, 2 and 3. */
const AROMATIC = 4;

/**
 * The structure with its benzenoid rings' bonds as one order, whichever of
 * their Kekulé structures was drawn: Meno's rule for identity and
 * symmetry. A ring of six carbons or nitrogens is taken as aromatic where
 * each of its atoms has one double bond, to an atom in a ring - so it is
 * so in every Kekulé structure of the system (naphthalene's rings,
 * phenanthrene's middle one), and a quinone, its C=O outside the ring, is
 * not. The ring's bonds become `AROMATIC`. Benzene drawn either way is then
 * one structure, with its twelve symmetries rather than a Kekulé
 * structure's six; nothing else changes.
 */
export function aromaticForm(input: LayoutInput): LayoutInput {
  const n = input.atoms.length;
  const edges = input.bonds.map((b) => [b.a, b.b] as [number, number]);
  const rings = smallestRings(n, edges);
  const inRing = new Set(rings.flat());
  const doubles = input.atoms.map(() => [] as number[]);
  input.bonds.forEach((b) => {
    if (b.order !== 2) return;
    doubles[b.a].push(b.b);
    doubles[b.b].push(b.a);
  });
  const conjugated = (i: number) =>
    (input.atoms[i].el === "C" || input.atoms[i].el === "N") && doubles[i].length === 1 && inRing.has(doubles[i][0]) && !input.bonds.some((b) => b.order === 3 && (b.a === i || b.b === i));
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const aromatic = new Set<string>();
  for (const r of rings) {
    if (r.length !== 6 || !r.every(conjugated)) continue;
    r.forEach((a, k) => aromatic.add(key(a, r[(k + 1) % r.length])));
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
