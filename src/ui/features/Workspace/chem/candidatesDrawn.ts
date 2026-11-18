/**
 * Where a structure drawn can carry a configuration that sets something (foundation part 13): its atoms and bonds by id. A
 * place is first one of the core's candidates, by shape (lib/chem/perception/stereo/candidates) - a centre its atom; a double
 * bond itself; a run of cumulated double bonds each of its double bonds; a biaryl's axis the drawing states, its bond - and then
 * a unit by Meno's identity: its configuration, as drawn and turned over, or not drawn and given each way, writes two
 * identities. So a neopentane's C, PPh3's P, a sulfone's S and an acetone oxime's C=N, candidates by shape whose two senses are
 * one structure, are none; a meso form's centres and a pseudoasymmetric centre are. Read as identity reads the structure
 * (chem/identityOf `identityInputOf`), its plain hydrogens counted on their atoms. Each place is asked only when it is asked
 * of, once.
 */
import { identity, type IdentityInput } from "../../../../lib/chem/identity";
import { candidates } from "../../../../lib/chem/perception/stereo/candidates";
import { hydrogensFolded, plainHydrogenAtoms } from "../../../../lib/chem/perception/fold";
import type { Model } from "../store/types";
import { identityInputOf } from "./identityOf";

/** A place of identity's input a configuration can be given at. */
type Place = { kind: "centre"; at: number } | { kind: "bond"; at: number } | { kind: "run"; ends: [number, number]; axis: boolean } | { kind: "biaryl"; atoms: [number, number] };

export function candidatesDrawn(part: Model): { atom: (id: number) => boolean; bond: (id: number) => boolean } {
  const { input, bondAt } = identityInputOf(part);
  const folded = plainHydrogenAtoms(input);
  // (each atom of the folded structure, by its place there: its place in identity's input, which is the drawing's order)
  const inputAt: number[] = [];
  input.atoms.forEach((_, i) => folded[i] || inputAt.push(i));
  const g = hydrogensFolded(input);
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const inputBond = new Map(input.bonds.map((b, k) => [pair(b.a, b.b), k]));
  const around: number[][] = input.atoms.map(() => []);
  for (const b of input.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const order = (p: number, q: number) => input.bonds[inputBond.get(pair(p, q)) ?? -1]?.order ?? 0;
  // (the drawing's atom or bond, by id, to the place it is part of)
  const atoms = new Map<number, Place>();
  const bonds = new Map<number, Place>();
  const bondIdOf = new Map<number, number>();
  part.bonds.forEach((b, k) => bondAt[k] >= 0 && bondIdOf.set(bondAt[k], b.id));
  const onBond = (p: number, q: number, place: Place) => {
    const k = inputBond.get(pair(p, q));
    const id = k == null ? undefined : bondIdOf.get(k);
    if (id != null) bonds.set(id, place);
  };
  // (a run's double bonds: from one end along double bonds to the other)
  const along = (from: number, to: number, place: Place) => {
    let at = from;
    let before = -1;
    while (at !== to) {
      const next = around[at].find((n) => n !== before && order(at, n) === 2);
      if (next == null) return;
      onBond(at, next, place);
      before = at;
      at = next;
    }
  };
  for (const c of candidates(g)) {
    if (c.kind === "centre") atoms.set(part.atoms[inputAt[c.at]].id, { kind: "centre", at: inputAt[c.at] });
    else if (c.kind === "bond") {
      const [p, q] = [inputAt[g.bonds[c.at].a], inputAt[g.bonds[c.at].b]];
      onBond(p, q, { kind: "bond", at: inputBond.get(pair(p, q))! });
    } else if (c.kind === "biaryl") {
      const ends: [number, number] = [inputAt[c.atoms[0]], inputAt[c.atoms[1]]];
      onBond(ends[0], ends[1], { kind: "biaryl", atoms: ends });
    } else {
      const ends: [number, number] = [inputAt[c.ends[0]], inputAt[c.ends[1]]];
      along(ends[0], ends[1], { kind: "run", ends, axis: c.kind === "axis" });
    }
  }
  const known = new Map<Place, boolean>();
  const unit = (place: Place | undefined): boolean => {
    if (!place) return false;
    if (!known.has(place)) known.set(place, setsSomething(input, around, order, place));
    return known.get(place)!;
  };
  return { atom: (id) => unit(atoms.get(id)), bond: (id) => unit(bonds.get(id)) };
}

/**
 * Whether a configuration at `place` sets something: given there as drawn and turned over - or, none drawn, given each way - the
 * structure writes two identities. Where identity's search was not complete two texts may be one structure, so the place is
 * then taken to set something: never the other way.
 */
function setsSomething(input: IdentityInput, around: readonly number[][], order: (p: number, q: number) => number, place: Place): boolean {
  const ways = waysOf(input, around, order, place);
  return ways.length === 2 && identity(ways[0]).text !== identity(ways[1]).text;
}

/** `input` with the configuration at `place` each way: the drawn one and it turned over, or, none drawn, each sense of one. */
function waysOf(input: IdentityInput, around: readonly number[][], order: (p: number, q: number) => number, place: Place): IdentityInput[] {
  // (a group on an end, besides `not` and the run's own double bonds)
  const groupOf = (end: number, not: number) => around[end].find((n) => n !== not && order(end, n) !== 2);
  if (place.kind === "centre") {
    const at = place.at;
    const t = input.atoms[at].tetra ?? { neighbours: [...around[at], ...((input.atoms[at].hs ?? 0) ? [-1] : [])], volume: 1 as const };
    return [1, -1].map((v) => ({ ...input, atoms: input.atoms.map((a, i) => (i === at ? { ...a, tetra: { ...t, volume: (v * t.volume) as 1 | -1 } } : a)) }));
  }
  if (place.kind === "bond") {
    const b = input.bonds[place.at];
    const p = around[b.a].find((n) => n !== b.b);
    const q = around[b.b].find((n) => n !== b.a);
    if (p == null || q == null) return [];
    const st = b.stereo ?? { refs: [p, q] as const, cis: true };
    return [true, false].map((same) => ({ ...input, bonds: input.bonds.map((x, k) => (k === place.at ? { ...x, stereo: { ...st, cis: same === st.cis } } : x)) }));
  }
  const ends = place.kind === "run" ? place.ends : place.atoms;
  const key = (xs: readonly number[]) => [...xs].sort((p, q) => p - q).join(",");
  if (place.kind === "biaryl" || place.axis) {
    const axes = input.axes ?? [];
    const k = axes.findIndex((x) => key(x.atoms) === key(ends));
    const p = groupOf(ends[0], ends[1]);
    const q = groupOf(ends[1], ends[0]);
    if (k < 0 && (p == null || q == null)) return [];
    const x = k >= 0 ? axes[k] : { atoms: ends, refs: [p!, q!] as const, sense: 1 as const };
    return [1, -1].map((s) => ({ ...input, axes: [...axes.filter((_, j) => j !== k), { ...x, sense: (s * x.sense) as 1 | -1 }] }));
  }
  const runs = input.cumulated ?? [];
  const k = runs.findIndex((x) => key(x.atoms) === key(ends));
  const p = groupOf(ends[0], -1);
  const q = groupOf(ends[1], -1);
  if (k < 0 && (p == null || q == null)) return [];
  const x = k >= 0 ? runs[k] : { atoms: ends, refs: [p!, q!] as const, cis: true };
  return [true, false].map((same) => ({ ...input, cumulated: [...runs.filter((_, j) => j !== k), { ...x, cis: same === x.cis }] }));
}
