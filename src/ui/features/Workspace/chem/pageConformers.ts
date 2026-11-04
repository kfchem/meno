/**
 * A stereoisomer's conformers as the page shows them (its *3D structure*:
 * docs/WORKSPACE.md, *Conformers kept*), from every one the conformer search
 * made, in the order it made them:
 * - lowest first, by their energies - or, where the molecule's are not given,
 *   by those of the model they were optimised in (a lighter metal standing
 *   in, eta rings held: `modelEnergies`) - else in the order they came;
 * - each conformer once, by Meno's one definition (`workflow/sameConformer`),
 *   each against those kept before it;
 * - each laid over the first by its heavy atoms, turned and moved, never
 *   reflected;
 * - their equivalent branches in the first's places (`settle`).
 * What was done is said in rows after the search's own. A workflow's
 * *Conformers* step gives every one the search made, as it made it: its
 * *Duplicates* and *Rank* steps keep each once and order them, where asked.
 */
import type { Conformers } from "../../../../lib/roles/client";
import { bestTurn, SAME_CONFORMER, Sameness } from "../workflow/sameConformer";
import { settleEquivalents } from "./settle";

export function asThePageShows(c: Conformers): Conformers {
  const { frames } = c;
  if (!frames.length) return c;
  const given = (e?: number[]) => (e?.length === frames.length ? e : undefined);
  const by = given(c.energies) ?? given(c.modelEnergies);
  const order = frames.map((_, i) => i);
  if (by) order.sort((x, y) => by[x] - by[y] || x - y);
  // (the one conformer kept once: lowest first, each only against those kept before it)
  const same = new Sameness(c.atoms, c.bonds, frames[0]);
  const marks = frames.map((f) => same.signature(f));
  const kept: number[] = [];
  for (const i of order) if (!kept.some((k) => same.bound(marks[i], marks[k]) <= SAME_CONFORMER && same.same(frames[i], frames[k]))) kept.push(i);
  // (each laid over the lowest by its heavy atoms, for the overlay)
  const heavy = c.atoms.flatMap((a, i) => (a.el !== "H" && a.el !== "*" ? [i] : []));
  const first = frames[kept[0]];
  const laid = kept.map((i, k) => (k === 0 ? [...first] : laidOver(frames[i], first, heavy)));
  // (the equivalent hydrogens and branches in the same places in each, as in the lowest)
  const settled = settleEquivalents(c.atoms, c.bonds, laid).map((f) => f.map((v) => Math.round(v * 1e4) / 1e4));
  const aside = frames.length - kept.length;
  const { modelEnergies: _model, ...rest } = c;
  return {
    ...rest,
    frames: settled,
    ...(c.energies && given(c.energies) ? { energies: kept.map((i) => c.energies![i]) } : {}),
    ...(c.method && !given(c.energies) && given(c.modelEnergies) ? { method: `${c.method}; ordered by the model's energies` } : {}),
    how: [
      ...(c.how ?? []),
      ...(aside ? [{ label: "The same", text: `${aside} set aside, each the same as one kept` }] : []),
      {
        label: "The same within",
        text: `${SAME_CONFORMER} Å, all atoms (H included)${same.capped ? ", atom against atom: too many ways it maps onto itself to try" : ", over its symmetries"}`,
      },
    ],
  };
}

/** Geometry `xyz` turned and moved to lie best over `onto` by the atoms `by`: every atom with them. */
function laidOver(xyz: readonly number[], onto: readonly number[], by: readonly number[]): number[] {
  if (!by.length) return [...xyz];
  const centre = (f: readonly number[]) => [0, 1, 2].map((d) => by.reduce((s, i) => s + f[3 * i + d], 0) / by.length);
  const pc = centre(xyz);
  const qc = centre(onto);
  const P = new Float64Array(by.flatMap((i) => [0, 1, 2].map((d) => xyz[3 * i + d] - pc[d])));
  const Q = new Float64Array(by.flatMap((i) => [0, 1, 2].map((d) => onto[3 * i + d] - qc[d])));
  const { turn } = bestTurn(P, Q);
  const out: number[] = [];
  for (let i = 0; i < xyz.length; i += 3) {
    const v = [xyz[i] - pc[0], xyz[i + 1] - pc[1], xyz[i + 2] - pc[2]];
    for (let d = 0; d < 3; d++) out.push(turn[d][0] * v[0] + turn[d][1] * v[1] + turn[d][2] * v[2] + qc[d]);
  }
  return out;
}
