/**
 * R and S, E and Z of a molecule in 3D, by Meno's own reading of the CIP
 * rules (docs/CIP.md), its configurations read from where its atoms are:
 * every atom of four bonds and every double bond its places give a
 * configuration (lib/chem/stereoOpen `configuredFrom`), and every atom of
 * three bonds whose lone pair keeps one by Meno's rule (lib/chem
 * `lonePairsIn3d`) - never the toolkit's list of which atoms are centres.
 * The CIP's own ranking decides which of them have a descriptor at all: a
 * CH2's two H are alike. A protonated amine's N keeps none, but where its
 * amine's would (lib/chem/lonePairCentres `protonatedAmineHeld`); a double
 * bond in a ring of seven atoms or fewer has no cis or trans of its own.
 */
import { isMetal } from "../../layout/perceive";
import type { IdentityInput } from "../identity";
import { protonatedAmineHeld } from "../lonePairCentres";
import { lonePairsIn3d } from "../lonePairsIn3d";
import { configuredFrom, type Place } from "../stereoOpen";
import { cipLabels } from "./index";

/** The elements of the third period on whose double bonds convention (b) takes as single (prepare.ts). */
const D_ORBITAL: ReadonlySet<string> = new Set(["P", "As", "Sb", "Bi", "S", "Se", "Te"]);

/** The smallest ring a double bond in which has a cis or trans of its own: eight atoms (rank.ts `OPEN_RING`). */
const OPEN_RING = 8;

/** A molecule in 3D as this reads it: its atoms, its bonds by their atoms' numbers from 0, and its places (x, y, z for each atom, in its order). */
export type In3d = { atoms: readonly { el: string; charge?: number; isotope?: number }[]; bonds: readonly { a1: number; a2: number; order: number }[]; xyz: readonly number[] };

/** Each centre's R, S, r or s and each double bond's E or Z, by atom and bond number: those that have one. */
export function cipIn3d(m: In3d): { atoms: Record<string, string>; bonds: Record<string, string> } {
  const n = m.atoms.length;
  const around: number[][] = m.atoms.map(() => []);
  m.bonds.forEach((b) => {
    around[b.a1]?.push(b.a2);
    around[b.a2]?.push(b.a1);
  });
  const places: Record<number, Place> = {};
  for (let i = 0; i < n; i++) places[i] = [m.xyz[3 * i], m.xyz[3 * i + 1], m.xyz[3 * i + 2]];
  const bonds = m.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order }));
  // (four single bonds - or a P's or an S's, its double bonds to O or S dipolar by CIP 1966 convention (b): a phosphine oxide's P, a sulfone's S)
  const single = (a: number) => D_ORBITAL.has(m.atoms[a].el) || m.bonds.every((b) => (b.a1 !== a && b.a2 !== a) || b.order === 1);
  const metal = (a: number) => isMetal(m.atoms[a].el);
  const held = protonatedAmineHeld(
    m.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0, hs: 0 })),
    bonds,
  );
  // the candidates: four single bonds to no metal (a protonated amine's N where its amine's is held), three and a lone pair, a double bond
  const four = m.atoms.flatMap((_, i) => (around[i].length === 4 && single(i) && !metal(i) && !around[i].some(metal) && held(i) !== false ? [i] : []));
  const three = m.atoms.flatMap((_, i) => (around[i].length === 3 ? [i] : []));
  const doubles = m.bonds.flatMap((b, i) => (b.order === 2 && around[b.a1].length > 1 && around[b.a2].length > 1 && ringThrough(around, b.a1, b.a2) >= OPEN_RING ? [i] : []));
  const read = configuredFrom(bonds, places, four, doubles);
  const pyramids = lonePairsIn3d(m.atoms, m.bonds, m.xyz, three).read;
  const tetra = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const c of read.centres) tetra.set(c.atom, { neighbours: c.neighbours, volume: c.sense });
  for (const [a, t] of pyramids) tetra.set(a, t);
  const stereo = new Map(read.doubles.map((d) => [d.bond, { refs: d.ends, cis: d.cis }]));
  const input: IdentityInput = {
    atoms: m.atoms.map((a, i) => ({ el: a.el, hs: 0, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), ...(tetra.has(i) ? { tetra: tetra.get(i)! } : {}) })),
    bonds: bonds.map((b, i) => ({ ...b, ...(stereo.has(i) ? { stereo: stereo.get(i)! } : {}) })),
  };
  const r = cipLabels(input, { centres: [...tetra.keys()], bonds: [...stereo.keys()] });
  const labels = (of: Map<number, unknown>) => Object.fromEntries([...of].flatMap(([k, v]) => (v && typeof v === "object" && "label" in v ? [[String(k), String(v.label)]] : [])));
  return { atoms: labels(r.centres), bonds: labels(r.bonds) };
}

/** The size of the smallest ring through the bond a-b, up to `OPEN_RING`; Infinity past it or in none. */
function ringThrough(around: readonly number[][], a: number, b: number): number {
  const far = new Map<number, number>([[a, 0]]);
  const queue = [a];
  while (queue.length) {
    const x = queue.shift()!;
    for (const y of around[x]) {
      if ((x === a && y === b) || far.has(y)) continue;
      far.set(y, far.get(x)! + 1);
      if (y === b) return far.get(y)! + 1;
      if (far.get(y)! < OPEN_RING) queue.push(y);
    }
  }
  return Infinity;
}
