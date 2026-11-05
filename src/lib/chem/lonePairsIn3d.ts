/**
 * The configurations a molecule in 3D has at its centres of three bonds -
 * a phosphine's P, an arsine's As, an N-chloro aziridine's N, each with a
 * lone pair for its fourth group - read from where its atoms are: Meno's
 * own reading, for which stereoisomer a conformer is, where the toolkit
 * that perceives the rest does not fix them from a geometry. Which such
 * atoms keep a configuration at all is Meno's rule on lone pairs
 * (lib/chem/lonePairCentres), as for a drawing and a SMILES.
 *
 * A centre is read only where its three bond angles add up to
 * `MOST_ANGLE_SUM` degrees or less. A pyramid inverts through the planar
 * form, its three angles then 360 degrees (Rauk, Allen and Mislow, Angew.
 * Chem. Int. Ed. Engl. 9, 400, 1970, Sec. 1, p. 400): a centre within 10
 * degrees of that is too close to flat to have a configuration - Meno's own
 * bound, wider than a geometry's noise and an N's conjugation flattening
 * it short of 360, far narrower than any pyramid that holds its
 * configuration. It is then not read, and stays unspecified.
 */
import { identityKey, type IdentityAtom } from "./identity";
import { AROMATIC_BOND, kekuleOrders } from "./kekulize";
import { lonePairCentres, lonePairOfThree } from "./lonePairCentres";

/** An atom of a molecule in 3D as this reads it. */
export type AtomIn3d = { el: string; charge?: number; isotope?: number };
/** A bond of a molecule in 3D, by its atoms' numbers from 0. */
export type BondIn3d = { a1: number; a2: number; order: number };

/** The most a centre's three bond angles may add up to, in degrees, for its configuration to be read (above): 10 short of flat's 360. */
export const MOST_ANGLE_SUM = 350;

/** What is read of a molecule in 3D at the centres asked (`lonePairsIn3d`). */
export type LonePairsRead = {
  /** The centres read, by atom number: their neighbours in the order of their bonds, and the sign of the volume those span seen from the centre. */
  read: Map<number, { neighbours: number[]; volume: 1 | -1 }>;
  /** The centres too close to flat to have a configuration, by atom number: the sum of their three bond angles, in degrees. */
  flat: Map<number, number>;
  /** The atoms asked that are no centre under the rule: three neighbours and a lone pair that keeps no configuration (a plain N-alkyl aziridine's N). */
  none: Set<number>;
  /**
   * The same for two molecules exactly when their constitution and the
   * configurations read are, whatever order their atoms are in:
   * lib/chem/identity's key of the molecule with those configurations and
   * no other. None, where none is read.
   */
  key: string | null;
};

/**
 * Of `asked` - centres the toolkit perceives, by atom number - those of
 * three bonds and a lone pair: each the rule keeps is read, by the sign of
 * the volume its three neighbours span seen from it (lib/layout/stereo's
 * `Tetrahedral`, in the order of the bonds), where its bond angles add up
 * to `MOST_ANGLE_SUM` or less, and is too close to flat where they add up
 * to more; each the rule keeps none is no centre. A centre whose three
 * bonds lie in one plane, all to one side of it, or any of whose atoms is
 * placed nowhere, is not read.
 */
export function lonePairsIn3d(atoms: readonly AtomIn3d[], bonds: readonly BondIn3d[], xyz: readonly number[], asked: readonly number[]): LonePairsRead {
  const around = atoms.map((): number[] => []);
  const orders = atoms.map(() => 0);
  for (const b of bonds) {
    if (b.a1 === b.a2 || !around[b.a1] || !around[b.a2]) continue;
    around[b.a1].push(b.a2);
    around[b.a2].push(b.a1);
    const o = b.order === 4 ? 1.5 : b.order;
    orders[b.a1] += o;
    orders[b.a2] += o;
  }
  // (every H an atom of its own in 3D: none left out)
  const keeps = lonePairCentres(
    atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0 })),
    bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  );
  const at = (i: number) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
  const read = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  const flat = new Map<number, number>();
  const none = new Set<number>();
  for (const c of asked) {
    if (around[c]?.length !== 3 || !lonePairOfThree(atoms[c].el, atoms[c].charge ?? 0, 3, orders[c], 0)) continue;
    if (!keeps(c)) {
      none.add(c);
      continue;
    }
    const o = at(c);
    const [u, v, w] = around[c].map((n) => at(n).map((x, k) => x - o[k]));
    if ([u, v, w].some((p) => p.some((x) => !Number.isFinite(x)) || Math.hypot(...p) === 0)) continue;
    const sum = angle(u, v) + angle(v, w) + angle(u, w);
    if (sum > MOST_ANGLE_SUM) {
      flat.set(c, sum);
      continue;
    }
    const volume = u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
    // (three bonds in one plane, all to one side: their angles short of 360, but no side the centre lies to)
    if (volume === 0) continue;
    read.set(c, { neighbours: [...around[c]], volume: volume > 0 ? 1 : -1 });
  }
  // (bonds marked aromatic - a file's type 4 - written out as a Kekulé structure first: identity takes the aromatic form of
  //  any one Kekulé structure - lib/chem/identity `aromaticForm` - never order 4 as given, so that one molecule read with its
  //  rings' bonds marked aromatic has the key it has read with them written out: a pyrrole's as much as a benzene's)
  const written = bonds.some((b) => b.order === AROMATIC_BOND) ? kekuleOrders(atoms.map((a) => ({ el: a.el, hs: 0, ...(a.charge ? { charge: a.charge } : {}) })), bonds) : bonds.map((b) => b.order);
  const key = read.size
    ? identityKey({
        atoms: atoms.map(
          (a, i): IdentityAtom => ({
            el: a.el,
            hs: 0,
            ...(a.charge ? { charge: a.charge } : {}),
            ...(a.isotope ? { isotope: a.isotope } : {}),
            ...(read.has(i) ? { tetra: read.get(i)! } : {}),
          }),
        ),
        bonds: bonds.map((b, k) => ({ a: b.a1, b: b.a2, order: written[k] })),
      })
    : null;
  return { read, flat, none, key };
}

/** The angle between two bonds from one atom, in degrees. */
function angle(p: readonly number[], q: readonly number[]): number {
  const cos = (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / (Math.hypot(...p) * Math.hypot(...q));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
