/**
 * The configurations a molecule in 3D has at its centres of three bonds -
 * a phosphine's P, an arsine's As, an aziridine's N, each with a lone pair
 * for its fourth group - read from where its atoms are: Meno's own
 * reading, for which stereoisomer a conformer is, where the toolkit that
 * perceives the rest does not fix them from a geometry.
 */
import { identityKey, type IdentityAtom } from "./identity";

/** An atom of a molecule in 3D as this reads it. */
export type AtomIn3d = { el: string; charge?: number; isotope?: number };
/** A bond of a molecule in 3D, by its atoms' numbers from 0. */
export type BondIn3d = { a1: number; a2: number; order: number };

/**
 * Of `asked` - centres the toolkit perceives, by atom number - those of
 * three bonds, each with the sign of the volume its three neighbours span
 * seen from it (lib/layout/stereo's `Tetrahedral`, in the
 * order of the bonds); none where its four atoms lie flat (a volume of
 * nought, as lib/chem/stereoOpen `configuredFrom` takes one). And a key,
 * the same for two molecules exactly when their constitution and these
 * configurations are, whatever order their atoms are in: lib/chem/identity's
 * key of the molecule with these centres' configurations and no other.
 * None, where none of `asked` is read.
 */
export function lonePairsIn3d(
  atoms: readonly AtomIn3d[],
  bonds: readonly BondIn3d[],
  xyz: readonly number[],
  asked: readonly number[],
): { read: Map<number, { neighbours: number[]; volume: 1 | -1 }>; key: string } | null {
  const around = atoms.map((): number[] => []);
  for (const b of bonds) {
    around[b.a1]?.push(b.a2);
    around[b.a2]?.push(b.a1);
  }
  const at = (i: number) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
  const read = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const c of new Set(asked)) {
    if (around[c]?.length !== 3) continue;
    const o = at(c);
    const [u, v, w] = around[c].map((n) => at(n).map((x, k) => x - o[k]));
    if ([u, v, w].some((p) => p.some((x) => !Number.isFinite(x)))) continue;
    const volume = u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
    if (Math.abs(volume) < 1e-6) continue;
    read.set(c, { neighbours: [...around[c]], volume: volume > 0 ? 1 : -1 });
  }
  if (!read.size) return null;
  const key = identityKey({
    atoms: atoms.map(
      (a, i): IdentityAtom => ({
        el: a.el,
        hs: 0,
        ...(a.charge ? { charge: a.charge } : {}),
        ...(a.isotope ? { isotope: a.isotope } : {}),
        ...(read.has(i) ? { tetra: read.get(i)! } : {}),
      }),
    ),
    bonds: bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  });
  return { read, key };
}
