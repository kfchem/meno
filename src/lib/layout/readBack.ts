/**
 * A drawing the engine made read back, and set against the molecule it was
 * given (the maintainer's standing rule, 2026-10-21: a laid-out structure
 * must be the same molecule it was given, checked, not assumed, on every
 * path that lays out many at once). Read as Meno reads any drawing
 * (drawn.ts): by where its atoms are, its wedges and hashes, and the H's it
 * draws; its depth where it is drawn in perspective.
 */
import { identityText } from "../chem/identity";
import { readStereo, sameConfiguration, type DrawnAtom, type DrawnBond } from "./drawn";
import type { Layout2D } from "./engine";
import { perceive, type LayoutInput } from "./perceive";

/**
 * The double bonds a drawing shows the other way round: one the molecule
 * gives cis or trans, its two given neighbours drawn on the other sides of
 * it; one in a ring of seven atoms or fewer, cis as such a ring must be,
 * its neighbours round the ring drawn on opposite sides (it would read
 * trans). By where the atoms are on the page, as any reader sees them.
 */
export function turnedDoubleBonds(input: LayoutInput, out: { x: readonly number[]; y: readonly number[] }): string[] {
  const side = (a: number, b: number, n: number) =>
    Math.sign((out.x[b] - out.x[a]) * (out.y[n] - out.y[a]) - (out.y[b] - out.y[a]) * (out.x[n] - out.x[a]));
  const drawnCis = (a: number, b: number, p: number, q: number) => {
    const [sp, sq] = [side(a, b, p), side(a, b, q)];
    return sp === 0 || sq === 0 ? null : sp === sq;
  };
  const { rings } = perceive(input);
  return input.bonds.flatMap(({ a, b, order, stereo }) => {
    if (order !== 2) return [];
    if (stereo) {
      const [p, q] = input.bonds.some((e) => (e.a === a && e.b === stereo.refs[0]) || (e.b === a && e.a === stereo.refs[0])) ? stereo.refs : [stereo.refs[1], stereo.refs[0]];
      const cis = drawnCis(a, b, p, q);
      return cis === stereo.cis ? [] : [`${input.atoms[a].el}${a}=${input.atoms[b].el}${b}: drawn ${cis == null ? "with a neighbour on its line" : cis ? "cis" : "trans"}, given ${stereo.cis ? "cis" : "trans"}`];
    }
    const ring = rings.find((r) => r.length <= 7 && r.includes(a) && r.includes(b));
    if (!ring) return [];
    const n = ring.length;
    const beside = (v: number, other: number) => {
      const k = ring.indexOf(v);
      return [ring[(k + 1) % n], ring[(k - 1 + n) % n]].find((u) => u !== other)!;
    };
    return drawnCis(a, b, beside(a, b), beside(b, a)) === false ? [`${input.atoms[a].el}${a}=${input.atoms[b].el}${b}: in a ${n}-membered ring, drawn trans`] : [];
  });
}

/** The stereocentres a drawing with depth does not show as given (`misread`). */
export function misreadCentres(input: LayoutInput, out: Layout2D): string[] {
  const { atoms, bonds, drawnH } = drawnOf(input, out);
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

/** The drawing the engine made, as Meno reads drawings (drawn.ts): each atom where it is (and how near, in perspective), each H it draws an atom of its own, each wedge on its bond. */
export function drawnOf(input: LayoutInput, out: Layout2D): { atoms: DrawnAtom[]; bonds: DrawnBond[]; drawnH: Map<number, number> } {
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
  return { atoms, bonds, drawnH };
}

/** Two atoms nearer than this share of the drawing's bond length (its bonds' median) are on top of each other. */
const ON_TOP = 0.1;

/**
 * What a drawing of `input` the engine made (`out`) does not show as given,
 * each said in words; none where it is the molecule given:
 * - every atom where a number says, and none on top of another;
 * - each double bond the molecule gives cis or trans drawn so
 *   (`turnedDoubleBonds`), and none in a small ring drawn trans;
 * - each stereocentre shown as given, by wedges or by its depth
 *   (`misreadCentres`), and no configuration shown where the molecule
 *   gives none;
 * - and the molecule read back - its atoms, charges, H's, bonds and each
 *   configuration the drawing shows - the same structure as given, by its
 *   identity text (chem/identity), whatever order its atoms come in.
 */
export function notAsGiven(input: LayoutInput, out: Layout2D): string[] {
  const n = input.atoms.length;
  const said: string[] = [];
  for (let i = 0; i < n; i++) if (!Number.isFinite(out.x[i]) || !Number.isFinite(out.y[i])) said.push(`${input.atoms[i].el}${i}: not placed`);
  if (said.length) return said;
  // (by the median, which one bond drawn too short - or of no length - does not move)
  const lengths = input.bonds.map((b) => Math.hypot(out.x[b.a] - out.x[b.b], out.y[b.a] - out.y[b.b])).sort((p, q) => p - q);
  const bond = lengths.length ? lengths[lengths.length >> 1] : 0;
  if (bond > 0) {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.hypot(out.x[i] - out.x[j], out.y[i] - out.y[j]) < ON_TOP * bond) said.push(`${input.atoms[i].el}${i} and ${input.atoms[j].el}${j}: one on the other`);
  }
  said.push(...turnedDoubleBonds(input, out), ...misreadCentres(input, out));
  const { atoms, bonds, drawnH } = drawnOf(input, out);
  const read = readStereo(atoms, bonds);
  const onAxis = new Set((input.axes ?? []).flatMap((x) => x.atoms));
  for (const c of read.tetra.keys()) if (c < n && !input.atoms[c].tetra && !onAxis.has(c)) said.push(`${input.atoms[c].el}${c}: a configuration shown where none is given`);
  // (the molecule as the drawing gives it: the configurations it shows, the
  // double bonds' as given where the drawing shows them so - checked above)
  const back: LayoutInput = {
    ...input,
    atoms: input.atoms.map((a, c) => {
      const { tetra: _given, ...rest } = a;
      const t = read.tetra.get(c);
      return t ? { ...rest, tetra: { neighbours: t.neighbours.map((m) => (m === drawnH.get(c) ? -1 : m)), volume: t.volume } } : rest;
    }),
  };
  if (identityText(back) !== identityText(input)) said.push("read back, not the structure given");
  return said;
}
