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
import { configuredFrom, runsFrom3d, type Place } from "../perception/stereo/from3d";
import type { Axial, Cumulated } from "../perception/stereo/types";
import { cipLabels } from "./index";
import { factsOf, OPEN_RING } from "../perception/facts";

/** The elements of the third period on whose double bonds convention (b) takes as single (prepare.ts). */
const D_ORBITAL: ReadonlySet<string> = new Set(["P", "As", "Sb", "Bi", "S", "Se", "Te"]);

/** A molecule in 3D as this reads it: its atoms, its bonds by their atoms' numbers from 0, and its places (x, y, z for each atom, in its order). */
export type In3d = { atoms: readonly { el: string; charge?: number; isotope?: number }[]; bonds: readonly { a1: number; a2: number; order: number }[]; xyz: readonly number[] };

/**
 * Why a unit of a molecule in 3D has no descriptor: its groups nearly in a plane, so that its places give it no sense (`flat`, under
 * stereo/geometry `FLAT_VOLUME_3D`); an N that exchanges its H (`exchanges`); or the CIP's own why - the structure too large to work
 * out, a group it depends on not told apart. Never for an atom or a bond that is no unit: two of its groups alike.
 */
export type In3dWhy = "flat" | "exchanges" | "large" | "unsure" | "open";

/** What a molecule in 3D says of its configurations (`cipIn3d`): each unit's descriptor, by atom and bond number - and, of a unit with none, why. */
export type In3dLabels = { atoms: Record<string, string>; bonds: Record<string, string>; said?: { atoms: Record<string, In3dWhy>; bonds: Record<string, In3dWhy> } };

/**
 * Each centre's R, S, r or s and each double bond's E or Z, by atom and bond number: those that have one; and of each unit that has none
 * though it is one, why (`said`): its groups nearly in a plane, an N that exchanges its H, or the CIP's why.
 */
export function cipIn3d(m: In3d): In3dLabels {
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
  const fourAll = m.atoms.flatMap((_, i) => (around[i].length === 4 && single(i) && !metal(i) && !around[i].some(metal) ? [i] : []));
  const four = fourAll.filter((i) => held(i) !== false);
  const three = m.atoms.flatMap((_, i) => (around[i].length === 3 ? [i] : []));
  // (a cumulated double bond, an allene's or a butatriene's, is no unit of its own: its run's, perception/stereo/from3d `runsFrom3d`. The other tests already keep one
  //  from getting a label, so this guard has no case where it shows - it says what a unit here is)
  const doublesAt = m.atoms.map((_, i) => m.bonds.filter((b) => b.order === 2 && (b.a1 === i || b.a2 === i)).length);
  const ringed = factsOf({ atoms: m.atoms, bonds });
  const doubles = m.bonds.flatMap((b, i) =>
    b.order === 2 && around[b.a1].length > 1 && around[b.a2].length > 1 && doublesAt[b.a1] === 1 && doublesAt[b.a2] === 1 && !ringed.inRingSmallerThan(i, OPEN_RING) ? [i] : [],
  );
  const read = configuredFrom(bonds, places, four, doubles);
  const pyramids = lonePairsIn3d(m.atoms, m.bonds, m.xyz, three).read;
  const tetra = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const c of read.centres) tetra.set(c.atom, { neighbours: c.neighbours, volume: c.sense });
  for (const [a, t] of pyramids) tetra.set(a, t);
  const stereo = new Map(read.doubles.map((d) => [d.bond, { refs: d.ends, cis: d.cis }]));
  const { axes, cumulated, shownOn } = runsFrom3d(around, m.bonds, places);
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
  // (a unit with no descriptor, said why: the CIP's own why - but none for one whose groups are alike, which is no unit)
  const said = { atoms: {} as Record<string, In3dWhy>, bonds: {} as Record<string, In3dWhy> };
  const why = (v: unknown): In3dWhy | null => (v && typeof v === "object" && "why" in v && v.why !== "alike" ? (v.why as In3dWhy) : null);
  for (const [k, v] of r.centres) if (why(v)) said.atoms[String(k)] = why(v)!;
  for (const [k, v] of r.bonds) if (why(v)) said.bonds[String(k)] = why(v)!;
  // (and a candidate its places gave no sense - nearly flat - or an N that exchanges its H: a unit where, given either sense, the CIP names
  //  it - asked so apart, its sense one taken for the asking, never shown)
  const flat = fourAll.filter((i) => !tetra.has(i));
  const flatDoubles = doubles.filter((i) => !stereo.has(i));
  if (flat.length || flatDoubles.length) {
    const asked: IdentityInput = {
      ...input,
      atoms: input.atoms.map((a, i) => (flat.includes(i) ? { ...a, tetra: { neighbours: [...around[i]], volume: 1 as const } } : a)),
      bonds: input.bonds.map((b, i) => {
        if (!flatDoubles.includes(i)) return b;
        const na = around[b.a].find((x) => x !== b.b);
        const nb = around[b.b].find((x) => x !== b.a);
        return na != null && nb != null ? { ...b, stereo: { refs: [na, nb] as [number, number], cis: true } } : b;
      }),
    };
    const t = cipLabels(asked, { centres: flat, bonds: flatDoubles });
    const named = (v: unknown) => !!v && typeof v === "object" && "label" in v;
    for (const i of flat) if (named(t.centres.get(i))) said.atoms[String(i)] = held(i) === false ? "exchanges" : "flat";
    for (const i of flatDoubles) if (named(t.bonds.get(i))) said.bonds[String(i)] = "flat";
  }
  const anySaid = Object.keys(said.atoms).length + Object.keys(said.bonds).length > 0;
  return { atoms: labels(r.centres), bonds: { ...labels(r.bonds), ...runs }, ...(anySaid ? { said } : {}) };
}

/** Each allene's axis and each odd cumulene's cis or trans of a molecule in 3D, read from where its atoms are (perception/stereo/from3d `runsFrom3d`), by atom number. */
export function runsIn3dOf(m: In3d): { axes: Axial[]; cumulated: Cumulated[] } {
  const around: number[][] = m.atoms.map(() => []);
  m.bonds.forEach((b) => {
    around[b.a1]?.push(b.a2);
    around[b.a2]?.push(b.a1);
  });
  const places: Record<number, Place> = {};
  for (let i = 0; i < m.atoms.length; i++) places[i] = [m.xyz[3 * i], m.xyz[3 * i + 1], m.xyz[3 * i + 2]];
  const { axes, cumulated } = runsFrom3d(around, m.bonds, places);
  return { axes, cumulated };
}

/** An axis's descriptor as the page shows it (docs/CIP.md, *Axes*): M is Ra, P is Sa. */
const AXIS_SHOWN: Record<string, string | undefined> = { M: "Ra", P: "Sa", m: "ra", p: "sa" };
