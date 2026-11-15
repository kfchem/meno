import { vdwRadius } from "../../../../lib/chem/elements";
import { bestTurn } from "../workflow/sameConformer";

/**
 * The parts of a structure, largest first (by heavy atoms, then by first
 * atom): each a fragment of it, an eta ring's one with its metal's (`eta`:
 * each ring's metal and atoms) - each part its atoms' indices, in order.
 */
export function partsOf(atoms: readonly { el: string }[], bonds: readonly { a1: number; a2: number }[], eta: readonly { metal: number; atoms: readonly number[] }[] = []): number[][] {
  const part = atoms.map((_, i) => i);
  const root = (i: number): number => (part[i] === i ? i : (part[i] = root(part[i])));
  for (const b of bonds) part[root(b.a1)] = root(b.a2);
  for (const e of eta) for (const c of e.atoms) part[root(c)] = root(e.metal);
  const groups = new Map<number, number[]>();
  atoms.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));
  const heavy = (g: number[]) => g.filter((i) => atoms[i].el !== "H").length;
  return [...groups.values()].sort((p, q) => heavy(q) - heavy(p) || p[0] - q[0]);
}

/**
 * A search's conformers of a structure of more than one part - a salt, a
 * mixture - its parts set side by side, not on one another: each conformer's
 * parts turned as the first conformer's are, part by part (laid best over
 * it, atom by atom: Horn's quaternion, workflow/sameConformer), and set
 * along x, largest first, each beyond the parts before it, the gap between
 * the two atoms that face each other across it the sum of their van der
 * Waals radii (lib/chem/elements; a star none). Each part is embedded where
 * the others are and optimised with nothing between parts counted, so that
 * they lay on one another - a salt's two ions at 0.00 Å: where they lie
 * against each other is no result of the method, and is not given as one.
 * Its rows say so (*Parts*). One part: as it came.
 */
export function partsSideBySide<T extends { atoms: readonly { el: string }[]; frames: number[][]; how?: { label: string; text: string }[] }>(c: T, parts: readonly number[][]): T {
  if (parts.length < 2 || !c.frames.length) return c;
  const radius = c.atoms.map((a) => (a.el === "*" ? 0 : vdwRadius(a.el)));
  const first = c.frames[0];
  const frames = c.frames.map((frame, k) => {
    const f = [...frame];
    if (k > 0)
      for (const part of parts) {
        if (part.length < 2) continue;
        const centre = (g: readonly number[]) => [0, 1, 2].map((d) => part.reduce((s, i) => s + g[3 * i + d], 0) / part.length);
        const [pc, qc] = [centre(f), centre(first)];
        const P = new Float64Array(part.flatMap((i) => [0, 1, 2].map((d) => f[3 * i + d] - pc[d])));
        const Q = new Float64Array(part.flatMap((i) => [0, 1, 2].map((d) => first[3 * i + d] - qc[d])));
        const { turn } = bestTurn(P, Q);
        for (const i of part) {
          const v = [f[3 * i] - pc[0], f[3 * i + 1] - pc[1], f[3 * i + 2] - pc[2]];
          for (let d = 0; d < 3; d++) f[3 * i + d] = turn[d][0] * v[0] + turn[d][1] * v[1] + turn[d][2] * v[2] + qc[d];
        }
      }
    const placed = [...parts[0]];
    for (const part of parts.slice(1)) {
      const a = placed.reduce((p, i) => (f[3 * i] + radius[i] > f[3 * p] + radius[p] ? i : p));
      const b = part.reduce((p, i) => (f[3 * i] - radius[i] < f[3 * p] - radius[p] ? i : p));
      const shift = f[3 * a] + radius[a] - (f[3 * b] - radius[b]);
      for (const i of part) f[3 * i] += shift;
      placed.push(...part);
    }
    return f.map((v) => Math.round(v * 1e4) / 1e4);
  });
  const said = { label: "Parts", text: `${parts.length}, side by side: where they lie against each other is not modelled` };
  // (said before how many were kept, where that is said)
  const how = c.how ? (c.how.some((r) => r.label === "Kept") ? c.how.flatMap((r) => (r.label === "Kept" ? [said, r] : [r])) : [...c.how, said]) : undefined;
  return { ...c, frames, ...(how ? { how } : {}) };
}
