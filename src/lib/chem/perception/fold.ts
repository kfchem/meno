/**
 * A structure's plain hydrogens folded into the atoms they are on (foundation part 12, design 3.5): the one test of a plain hydrogen
 * (`plainHydrogen`) and the one fold (`hydrogensFolded`), its configuration carried. Moved here unchanged from lib/chem/identity (part
 * 12d), which re-exports the fold under its name, so its importers do not change.
 */
import type { ChemAtom, ChemBond } from "./graph";
import type { Axial, Cumulated, Tetrahedral } from "./stereo/types";
import type { Radical } from "./hydrogens";
import { drawnRoundMetal } from "./elements";
import { runsThrough } from "./stereo/runs";

/** An atom the fold reads: the core's, and what keeps a hydrogen an atom of its own - one isotope in particular, unpaired electrons, a map to a reaction's atom. */
export type FoldedAtom = ChemAtom & { isotope?: number; radical?: Radical; mapped?: true };
/** A structure the fold reads: its atoms and bonds, and the configurations that ride on them. */
export type FoldedInput = {
  atoms: readonly FoldedAtom[];
  bonds: readonly ChemBond[];
  axes?: readonly Axial[];
  cumulated?: readonly Cumulated[];
  arrangements?: readonly { metal: number; pairs: readonly (readonly [number, number])[] }[];
};

/** A metal, as the fold keeps a hydride on one an atom: one ligands are drawn round (./elements `drawnRoundMetal`). */
const isMetal = (el: string): boolean => drawnRoundMetal.has(el);

/**
 * The structure with each plain hydrogen atom counted as one of its
 * neighbour's hydrogens, as a structure drawn without it has it: R1 = H is
 * the compound drawn without that H. A hydrogen stays an atom where it is
 * any of these:
 * - charged, with unpaired electrons, or one isotope in particular
 *   (deuterium, tritium);
 * - mapped to an atom of a reaction;
 * - bonded to another hydrogen (H2), or by anything but one single bond;
 * - bonded to more than one atom (bridging), or to none;
 * - on a metal (a hydride ligand);
 * - one of a pi system bound to a metal.
 *
 * A plain hydrogen that sets a configuration is folded in with the
 * configuration kept, carried over to the atom it is on: a stereocentre's
 * hydrogen becomes its implicit one, last among its neighbours, the sense
 * turned for each place it moves; where a double bond's or an axis's
 * configuration is set by it, by its end's other neighbour instead, the
 * sense turned. Where nothing is left to carry it - a centre with two
 * hydrogens, a double bond's end with two - there was no configuration, and
 * none is kept. Folding never depends on the order of the atoms.
 */
export function hydrogensFolded<I extends FoldedInput>(input: I): I {
  const n = input.atoms.length;
  const around: { to: number; order: number }[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    around[b.a].push({ to: b.b, order: b.order });
    around[b.b].push({ to: b.a, order: b.order });
  }
  const folded = plainHydrogenAtoms(input);
  if (!folded.some(Boolean)) return input;
  const kept = input.atoms.map((_, i) => i).filter((i) => !folded[i]);
  const at = new Map(kept.map((i, k) => [i, k]));
  const extra = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) if (folded[i]) extra[around[i][0].to]++;

  // (a stereocentre's: its folded hydrogen its implicit one, last; two or more hydrogens, no stereocentre)
  const centre = (t: Tetrahedral): Tetrahedral | undefined => {
    const hs = t.neighbours.filter((m) => m < 0 || folded[m]).length;
    if (hs === 0) return { neighbours: t.neighbours.map((m) => at.get(m)!), volume: t.volume };
    if (hs > 1) return undefined;
    const h = t.neighbours.findIndex((m) => m < 0 || folded[m]);
    const moves = t.neighbours.length - 1 - h;
    const rest = t.neighbours.filter((_, k) => k !== h).map((m) => at.get(m)!);
    return { neighbours: [...rest, -1], volume: (moves % 2 ? -t.volume : t.volume) as 1 | -1 };
  };
  // (a reference atom folded: its end's other neighbour instead, the sense turned - none, where that end has no other)
  const instead = (end: number, ref: number, other: number): number | null => {
    const left = around[end].map((e) => e.to).filter((m) => m !== ref && m !== other);
    if (left.length !== 1 || folded[left[0]] || input.atoms[end].hs) return null;
    return left[0];
  };
  const atoms = kept.map((i) => {
    const { tetra, pi, ...a } = input.atoms[i];
    const t = tetra && centre(tetra);
    // (a star's pi system by its atoms' new places, as every other reference is: none of them is folded)
    return { ...a, ...(extra[i] ? { hs: (a.hs ?? 0) + extra[i] } : {}), ...(t ? { tetra: t } : {}), ...(pi ? { pi: pi.map((m) => at.get(m)!) } : {}) };
  });
  const bonds = input.bonds.flatMap((b): ChemBond[] => {
    if (folded[b.a] || folded[b.b]) return [];
    const { stereo, ...rest } = b;
    const bond = { ...rest, a: at.get(b.a)!, b: at.get(b.b)! };
    if (!stereo) return [bond];
    let [p, q] = stereo.refs;
    let cis = stereo.cis;
    for (const [end, other, which] of [
      [b.a, b.b, 0],
      [b.b, b.a, 1],
    ] as const) {
      const ref = which === 0 ? p : q;
      if (!folded[ref]) continue;
      const by = instead(end, ref, other);
      if (by == null) return [bond];
      if (which === 0) p = by;
      else q = by;
      cis = !cis;
    }
    return [{ ...bond, stereo: { refs: [at.get(p)!, at.get(q)!], cis } }];
  });
  // (the atom an axis's or a cumulene's end runs on through: its cumulated double bond's - ./stereo/runs)
  const runsOn = (end: number) => runsThrough(around[end]) ?? -1;
  const axes = (input.axes ?? []).flatMap((x): Axial[] => {
    const refs = [...x.refs];
    let sense = x.sense;
    for (const k of [0, 1] as const) {
      if (!folded[refs[k]]) continue;
      // (the other end, a biaryl's; an allene's end runs on through its cumulated double bond)
      const end = x.atoms[k];
      const by = instead(end, refs[k], runsThrough(around[end], x.atoms[1 - k]) ?? -1);
      if (by == null) return [];
      refs[k] = by;
      sense = -sense as 1 | -1;
    }
    return [{ atoms: [at.get(x.atoms[0])!, at.get(x.atoms[1])!], refs: [at.get(refs[0])!, at.get(refs[1])!], sense }];
  });
  // (an odd cumulene's, as a double bond's)
  const cumulated = (input.cumulated ?? []).flatMap((x): Cumulated[] => {
    const refs = [...x.refs];
    let cis = x.cis;
    for (const k of [0, 1] as const) {
      if (!folded[refs[k]]) continue;
      const by = instead(x.atoms[k], refs[k], runsOn(x.atoms[k]));
      if (by == null) return [];
      refs[k] = by;
      cis = !cis;
    }
    return [{ atoms: [at.get(x.atoms[0])!, at.get(x.atoms[1])!], refs: [at.get(refs[0])!, at.get(refs[1])!], cis }];
  });
  // (a metal's donors by their new places: no plain hydrogen is one - a hydride on a metal is kept)
  const arrangements = input.arrangements?.map((x) => ({ metal: at.get(x.metal)!, pairs: x.pairs.map(([p, q]) => [at.get(p)!, at.get(q)!] as const) }));
  return { atoms, bonds, ...(input.axes ? { axes } : {}), ...(input.cumulated ? { cumulated } : {}), ...(arrangements ? { arrangements } : {}) } as unknown as I;
}

/**
 * Which atoms are plain hydrogens - those `hydrogensFolded` folds in, each as its words there say: the one test of a plain hydrogen. Its
 * variants elsewhere answer other questions, each named (a geometric end, a proton counted, a hydrogen a match ignores the map of).
 */
export function plainHydrogenAtoms(input: FoldedInput): boolean[] {
  const around: { to: number; order: number }[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    around[b.a].push({ to: b.b, order: b.order });
    around[b.b].push({ to: b.a, order: b.order });
  }
  const inPi = new Set(input.atoms.flatMap((a) => a.pi ?? []));
  const onAxis = new Set([...(input.axes ?? []), ...(input.cumulated ?? [])].flatMap((x) => x.atoms));
  return input.atoms.map((a, i) => {
    if (a.el !== "H" || a.charge || a.isotope || a.radical || a.mapped || a.hs || a.tetra || a.pi || inPi.has(i) || onAxis.has(i)) return false;
    if (around[i].length !== 1 || around[i][0].order !== 1) return false;
    const on = input.atoms[around[i][0].to];
    return on.el !== "H" && !isMetal(on.el);
  });
}

/** Whether atom `atom` is a plain hydrogen (`plainHydrogenAtoms`). */
export function plainHydrogen(input: FoldedInput, atom: number): boolean {
  return plainHydrogenAtoms(input)[atom] ?? false;
}
