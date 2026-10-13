import { describe, expect, it } from "vitest";
import { implicitHydrogens } from "../../chem/molecule";
import { kekuleOrders } from "../../chem/kekulize";
import { readSmiles } from "../../chem/smiles";
import { readStereo, sameConfiguration, type DrawnAtom, type DrawnBond } from "../drawn";
import { layout2D } from "../engine";
import { perceive, type LayoutInput } from "../perceive";

/** A molecule as its SMILES gives it: its bonds Kekulé, each atom's H, each centre's configuration. */
export function fromSmiles(smiles: string): LayoutInput {
  const s = readSmiles(smiles);
  const orders = kekuleOrders(s.atoms, s.bonds);
  const sum = s.atoms.map(() => 0);
  s.bonds.forEach((b, i) => {
    sum[b.a1] += orders[i];
    sum[b.a2] += orders[i];
  });
  return {
    atoms: s.atoms.map((a, i) => ({
      el: a.el,
      hs: a.hs ?? implicitHydrogens(a.el, sum[i], a.charge ?? 0),
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.tetra ? { tetra: a.tetra } : {}),
    })),
    bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
  };
}

/**
 * The stereocentres a drawing the engine makes with depth does not show as
 * given, read as Meno reads a drawing (drawn.ts): a centre in a solid shown
 * by the drawing itself, each atom where it is and as near the viewer as it
 * is; the rest by the H's and wedges the engine places. And read as a
 * reader sees its depth where the page shows it: a centre the solid shows
 * by its shape (in a six-membered ring drawn as a chair or a boat), with
 * three bonds or more into its ring system, each to an atom drawn with
 * depth, by where those atoms are and how near. None
 * where the molecule has no centre, or the drawing is flat throughout: that
 * is read by its wedges alone, as any reader reads it
 * (scripts/layout/stereo.py has RDKit read every one).
 */
function misread(input: LayoutInput): string[] {
  if (!input.atoms.some((a) => a.tetra)) return [];
  const out = layout2D(input);
  if (!out.depth.some((d) => d != null)) return [];
  const atoms: DrawnAtom[] = input.atoms.map((a, i) => ({
    x: out.x[i],
    y: out.y[i],
    el: a.el,
    hs: a.hs ?? 0,
    ...(out.depth[i] != null ? { z: out.depth[i]! } : {}),
    ...(out.solid[i] && a.tetra ? { centre: true } : {}),
  }));
  const bonds: DrawnBond[] = input.bonds.map(({ a, b, order }) => ({ a, b, order }));
  const drawnH = new Map<number, number>();
  for (const h of out.hydrogens) {
    atoms.push({ ...h.at, el: "H", hs: 0 });
    atoms[h.on] = { ...atoms[h.on], hs: atoms[h.on].hs - 1 };
    bonds.push({ a: h.on, b: atoms.length - 1, order: 1 });
    drawnH.set(h.on, atoms.length - 1);
  }
  for (const w of out.wedges) {
    const to = w.to === -1 ? drawnH.get(w.from) : w.to;
    const bond = bonds.find((b) => (b.a === w.from && b.b === to) || (b.b === w.from && b.a === to))!;
    bond.wedge = { narrow: w.from, stereo: w.stereo };
  }
  const read = readStereo(atoms, bonds);
  const { systemOf } = perceive(input);
  const at = (a: number) => [out.x[a], out.y[a], out.depth[a]!];
  return input.atoms.flatMap((a, c) => {
    if (!a.tetra) return [];
    const t = read.tetra.get(c);
    const drawn = out.solid[c] ? "in the solid" : out.depth[c] != null ? "with depth" : "flat";
    if (!t) return [`${a.el}${c} (${drawn}): no configuration shown`];
    if (!sameConfiguration(a.tetra, t, (n) => (n === drawnH.get(c) ? -1 : n))) return [`${a.el}${c} (${drawn}): the other configuration`];
    // (each three of them that span a volume - not three in one plane, a
    // flat ring's, which say nothing of depth - as the volume of the first
    // three says it: the same, or the other way, by which one is left out)
    // (by depth only where the page shows it: a centre the solid shows by
    // its shape, in a ring drawn as a chair or a boat - the engine draws
    // every other centre with a wedge, read above as wedges are)
    if (out.depth[c] == null || !out.solid[c]) return [];
    const known = a.tetra.neighbours.map((n, k) => [n, k] as const).filter(([n]) => n >= 0 && out.depth[n] != null && systemOf[n] === systemOf[c]);
    const turned = [0, 1, 2, 3].some((left) => {
      const three = known.filter(([, k]) => k !== left);
      if (three.length !== 3) return false;
      const [u, v, w] = three.map(([n]) => at(n).map((x, k) => x - at(c)[k]));
      const volume = u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
      return Math.abs(volume) > 1e-6 && Math.sign(volume) !== a.tetra!.volume * (left % 2 === 1 ? 1 : -1);
    });
    return turned ? [`${a.el}${c} (${drawn}): its depth shows the other configuration`] : [];
  });
}

/**
 * Every drawing the engine makes in perspective of the molecules listed - a
 * cage, a solid, a cage with rings fused flat onto it, a flat system with a
 * bridge across a ring - shows the molecule it was given: each stereocentre
 * as it is, the faces of its ring fusions and epoxides among them. The
 * engine draws a solid only with its configurations as given; this reads
 * back the drawing it hands over. (A list to a test file, the lists side by
 * side.)
 */
export function readsBackAsGiven(list: string, molecules: readonly { name: string; smiles: string }[]): void {
  describe(`a drawing in perspective, on ${list}`, () => {
    // (a large molecule's layout takes a while on a busy machine)
    it.each(molecules.map((m) => [m.name, m.smiles]))(
      "%s reads back as the molecule given",
      (_, smiles) => {
        expect(misread(fromSmiles(smiles))).toEqual([]);
      },
      60_000,
    );
  });
}
