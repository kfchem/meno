import type { Layout2D } from "../engine";
import type { LayoutInput } from "../perceive";

/**
 * The molecule with its atoms - its bonds, each either way round, and each
 * centre's neighbours - in another order, the same from the same seed: as
 * another hand might have drawn it, or another file listed it.
 */
export function shuffled(g: LayoutInput, seed: number): LayoutInput {
  let x = seed;
  const next = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  // (each atom's new place)
  const to = g.atoms.map((_, i) => i);
  for (let i = to.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [to[i], to[j]] = [to[j], to[i]];
  }
  const from = new Array<number>(to.length);
  to.forEach((t, o) => (from[t] = o));
  // (and each centre's neighbours in another order, its volume turned with
  // each swap: the same configuration, written as another file writes it)
  const atoms = from.map((o) => {
    const a0 = g.atoms[o];
    // (a star's pi system by its atoms' new places)
    const a = a0.pi ? { ...a0, pi: a0.pi.map((m) => to[m]) } : a0;
    if (!a.tetra) return a;
    const ns = a.tetra.neighbours.map((n) => (n < 0 ? n : to[n]));
    let volume = a.tetra.volume;
    const heavy = ns.filter((n) => n >= 0);
    for (let i = heavy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      if (i !== j) {
        [heavy[i], heavy[j]] = [heavy[j], heavy[i]];
        volume = (volume === 1 ? -1 : 1) as 1 | -1;
      }
    }
    return { ...a, tetra: { neighbours: [...heavy, ...ns.filter((n) => n < 0)], volume } };
  });
  const bonds = g.bonds.map((b) => {
    const stereo = b.stereo && { ...b.stereo, refs: [to[b.stereo.refs[0]], to[b.stereo.refs[1]]] as [number, number] };
    if (next() < 0.5) return { ...b, a: to[b.a], b: to[b.b], ...(stereo ? { stereo } : {}) };
    return { ...b, a: to[b.b], b: to[b.a], ...(stereo ? { stereo: { ...stereo, refs: [stereo.refs[1], stereo.refs[0]] as [number, number] } } : {}) };
  });
  for (let i = bonds.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [bonds[i], bonds[j]] = [bonds[j], bonds[i]];
  }
  // (and each axis of chirality, its atoms and references where they now are)
  const axes = g.axes?.map((x) => ({ ...x, atoms: [to[x.atoms[0]], to[x.atoms[1]]] as const, refs: [to[x.refs[0]], to[x.refs[1]]] as const }));
  return { atoms, bonds, ...(axes ? { axes } : {}) };
}

/**
 * A drawing as a reader sees it, whatever order its atoms are listed in:
 * each atom's element where it is (and how near, in perspective), each
 * bond between the places it joins, each H the engine draws, each wedge.
 */
export function asSeen(g: LayoutInput, out: Layout2D): string {
  const r = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
  const at = (i: number) => `${r(out.x[i])},${r(out.y[i])}`;
  return [
    g.atoms.map((a, i) => `${a.el}@${at(i)}${out.depth[i] != null ? `~${r(out.depth[i]!)}` : ""}`).sort(),
    g.bonds.map((b) => `${[at(b.a), at(b.b)].sort().join("-")}:${b.order}`).sort(),
    out.hydrogens.map((h) => `H:${at(h.on)}>${r(h.at.x)},${r(h.at.y)}`).sort(),
    out.wedges.map((w) => `${at(w.from)}>${w.to < 0 ? "H" : at(w.to)}:${w.stereo}`).sort(),
  ]
    .map((part) => part.join(" "))
    .join(" | ");
}

/** The shuffled orders a molecule is drawn in beside its SMILES's own (the seeds of `shuffled`). */
export const SHUFFLE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => k * 7919);

/**
 * Cages of three-bonded CH whose atoms ranks refined by their neighbours
 * never part, though they are not all alike: a choice between their atoms
 * no rank can settle.
 */
export const tiedCages = [
  { name: "cuneane", smiles: "C12C3C4C3C2C5C4C51" },
  { name: "basketane", smiles: "C12C3C4C5C3C2C5C4CC1" },
  // (pentacyclo[4.4.0.0(2,4).0(3,8).0(5,7)]dec-9-ene)
  { name: "snoutene", smiles: "C12C3C4C3C5C2C5C4C=C1" },
] as const;
