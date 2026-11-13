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
import { torsionSense, type Axial, type Cumulated } from "../../layout/stereo";
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
  // (a cumulated double bond, an allene's or a butatriene's, is no unit of its own: its run's, `runsIn3d`. The other tests already keep one
  //  from getting a label, so this guard has no case where it shows - it says what a unit here is)
  const doublesAt = m.atoms.map((_, i) => m.bonds.filter((b) => b.order === 2 && (b.a1 === i || b.a2 === i)).length);
  const doubles = m.bonds.flatMap((b, i) =>
    b.order === 2 && around[b.a1].length > 1 && around[b.a2].length > 1 && doublesAt[b.a1] === 1 && doublesAt[b.a2] === 1 && ringThrough(around, b.a1, b.a2) >= OPEN_RING ? [i] : [],
  );
  const read = configuredFrom(bonds, places, four, doubles);
  const pyramids = lonePairsIn3d(m.atoms, m.bonds, m.xyz, three).read;
  const tetra = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const c of read.centres) tetra.set(c.atom, { neighbours: c.neighbours, volume: c.sense });
  for (const [a, t] of pyramids) tetra.set(a, t);
  const stereo = new Map(read.doubles.map((d) => [d.bond, { refs: d.ends, cis: d.cis }]));
  const { axes, cumulated, shownOn } = runsIn3d(around, m.bonds, places);
  const input: IdentityInput = {
    atoms: m.atoms.map((a, i) => ({ el: a.el, hs: 0, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), ...(tetra.has(i) ? { tetra: tetra.get(i)! } : {}) })),
    bonds: bonds.map((b, i) => ({ ...b, ...(stereo.has(i) ? { stereo: stereo.get(i)! } : {}) })),
    ...(axes.length ? { axes } : {}),
    ...(cumulated.length ? { cumulated } : {}),
  };
  const r = cipLabels(input, { centres: [...tetra.keys()], bonds: [...stereo.keys()], axes: axes.map((_, k) => k), cumulated: cumulated.map((_, k) => k) });
  const labels = (of: Map<number, unknown>) => Object.fromEntries([...of].flatMap(([k, v]) => (v && typeof v === "object" && "label" in v ? [[String(k), String(v.label)]] : [])));
  // (an allene's axis and an odd cumulene's shown on the first double bond of its run, as the drawing shows them: Ra or Sa, E or Z)
  const runs: Record<string, string> = {};
  for (const [k, v] of r.axes) if ("label" in v && AXIS_SHOWN[v.label]) runs[String(shownOn.axes[k])] = AXIS_SHOWN[v.label]!;
  for (const [k, v] of r.cumulated) if ("label" in v) runs[String(shownOn.cumulated[k])] = v.label;
  return { atoms: labels(r.centres), bonds: { ...labels(r.bonds), ...runs } };
}

/** An axis's descriptor as the page shows it (docs/CIP.md, *Axes*): M is Ra, P is Sa. */
const AXIS_SHOWN: Record<string, string | undefined> = { M: "Ra", P: "Sa", m: "ra", p: "sa" };

/**
 * Each run of cumulated double bonds whose ends have two other neighbours
 * each, read from the places: an allene's axis (an even number of double
 * bonds) by the sign of the torsion from a group at one end to one at the
 * other, an odd cumulene's cis or trans by whether those two stand on one
 * side of the run; none where they are in line, or square (flat or
 * twisted half way, as no such run is). Each with the first double bond of
 * its run, to be shown on. A biaryl's axis is not read: every biaryl is
 * twisted in 3D, whether or not its turn is held.
 */
function runsIn3d(
  around: readonly number[][],
  bonds: readonly { a1: number; a2: number; order: number }[],
  places: Readonly<Record<number, Place>>,
): { axes: Axial[]; cumulated: Cumulated[]; shownOn: { axes: number[]; cumulated: number[] } } {
  const orderOf = new Map(bonds.map((b, i) => [b.a1 < b.a2 ? `${b.a1},${b.a2}` : `${b.a2},${b.a1}`, i]));
  const bondOf = (a: number, b: number) => orderOf.get(a < b ? `${a},${b}` : `${b},${a}`);
  const order = (a: number, b: number) => bonds[bondOf(a, b) ?? -1]?.order ?? 0;
  const middle = (x: number) => around[x].length === 2 && around[x].every((n) => order(x, n) === 2);
  const out = { axes: [] as Axial[], cumulated: [] as Cumulated[], shownOn: { axes: [] as number[], cumulated: [] as number[] } };
  around.forEach((_, i) => {
    if (middle(i)) return;
    for (const m of around[i]) {
      if (order(i, m) !== 2 || !middle(m)) continue;
      const run = [i, m];
      while (middle(run[run.length - 1]) && run.length <= around.length) run.push(around[run[run.length - 1]].find((x) => x !== run[run.length - 2])!);
      const j = run[run.length - 1];
      if (j < i) continue;
      const near = around[i].filter((n) => n !== run[1]);
      const far = around[j].filter((n) => n !== run[run.length - 2]);
      if (near.length !== 2 || far.length !== 2) continue;
      const [p, q] = [Math.min(...near), Math.min(...far)];
      if ([p, i, j, q].some((x) => !places[x])) continue;
      const [P, I, J, Q] = [places[p], places[i], places[j], places[q]];
      const first = bondOf(i, m)!;
      if (run.length % 2 === 1) {
        const sense = torsionSense(P, I, J, Q);
        if (sense) {
          out.axes.push({ atoms: [i, j], refs: [p, q], sense });
          out.shownOn.axes.push(first);
        }
        continue;
      }
      // (the two groups off the run's line: the same side, cis)
      const axis = [J[0] - I[0], J[1] - I[1], J[2] - I[2]];
      const off = (X: Place, from: Place) => {
        const v = [X[0] - from[0], X[1] - from[1], X[2] - from[2]];
        const t = (v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]) / (axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 || 1);
        return [v[0] - t * axis[0], v[1] - t * axis[1], v[2] - t * axis[2]];
      };
      const [u, w] = [off(P, I), off(Q, J)];
      const dot = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
      if (Math.abs(dot) < 0.5 * Math.hypot(...u) * Math.hypot(...w)) continue;
      out.cumulated.push({ atoms: [i, j], refs: [p, q], cis: dot > 0 });
      out.shownOn.cumulated.push(first);
    }
  });
  return out;
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
