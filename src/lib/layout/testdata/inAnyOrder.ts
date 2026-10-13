import { describe, expect, it } from "vitest";
import { layout2D, type Layout2D } from "../engine";
import type { LayoutInput } from "../perceive";
import { fromSmiles } from "./readBack";

/**
 * The molecule with its atoms - and its bonds, each either way round - in
 * another order, the same from the same seed: as another hand might have
 * drawn it, or another file listed it.
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
  const atoms = from.map((o) => {
    const a = g.atoms[o];
    return a.tetra ? { ...a, tetra: { neighbours: a.tetra.neighbours.map((n) => (n < 0 ? n : to[n])), volume: a.tetra.volume } } : a;
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
  return { atoms, bonds };
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

/**
 * Every molecule listed drawn alike with its atoms in any order: four
 * orders besides its SMILES's, each the same drawing (`layout2D` lays out
 * the molecule's own order, canonical.ts). (A list to a test file, the
 * lists side by side.)
 */
export function drawsAlikeInAnyOrder(list: string, molecules: readonly { name: string; smiles: string }[]): void {
  describe(`a drawing the same whatever order its atoms come in, on ${list}`, () => {
    // (five layouts of a large molecule take a while on a busy machine)
    it.each(molecules.map((m) => [m.name, m.smiles]))(
      "%s comes out the same in four other orders",
      (_, smiles) => {
        const g = fromSmiles(smiles);
        const seen = asSeen(g, layout2D(g));
        for (const seed of [1, 2, 3, 4]) {
          const other = shuffled(g, seed * 7919);
          expect(asSeen(other, layout2D(other)), `order ${seed}`).toBe(seen);
        }
      },
      120_000,
    );
  });
}
