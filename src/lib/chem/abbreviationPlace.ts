import { layout2D, type Layout2D } from "../layout/engine";
import type { LayoutInput } from "../layout/perceive";
import { abbreviationStructure } from "./abbreviations";
import { contractGraph, contractionTrials, hiddenIn, type Contraction } from "./contract";
import { wedgeNarrowAtom } from "./layout2d";
import type { GroupStructure, StructureBond } from "./ligands";
import { kekuleOrders } from "./kekulize";
import { implicitHydrogens, valenceOrder, type AbbreviationStructure, type AtomChem } from "./molecule";
import { readSmiles, type SmilesAtom } from "./smiles";

type P = { x: number; y: number };

/**
 * The atoms an abbreviation stands for, placed: laid out by Meno's own
 * engine, `bondLength` apart, and turned so that the bond into it runs on
 * from `neighbour` - where the atom it is bonded to is, from the label's
 * atom - through the label's atom, where its first attachment sits. Given
 * where each of two or more atoms it is bonded to is, all at that one atom
 * (an NMe in a chain, an NBoc in a ring), its own bonds there are set in
 * the widest opening between those, on its bisector, as a drawn
 * substituent's are (IUPAC GR-4.1.2).
 * Positions are from that atom (for one attached by nothing - a reagent, a
 * complex - from the middle of the whole), as an abbreviation from a file
 * has them. A pi system's star is set at its centre; a stereocentre is
 * drawn as Clean-up draws it, by the same engine. Nothing, for a label Meno
 * does not know.
 */
export function placedAbbreviation(
  label: string,
  neighbour: P | readonly P[] | null,
  bondLength: number,
): AbbreviationStructure | null {
  const s = abbreviationStructure(label);
  return s ? placedStructure(s, neighbour, bondLength) : null;
}

/** A structure laid out as `placedAbbreviation` lays out an abbreviation's. */
export function placedStructure(given: GroupStructure, neighbour: P | readonly P[] | null, bondLength: number): AbbreviationStructure {
  const s = drawnAsSaid(given);
  return placedFrom(given, s, layout2D(inputFor(s)), neighbour, bondLength);
}

/**
 * A structure as the dictionary pictures it: laid out as `placedStructure`
 * lays it out - a whole molecule (a reagent, a complex) with the groups a
 * chemist would write by name written so, as Clean-up writes them
 * (./contract): Grubbs I's phosphines as PCy3, not at a stereocentre or an
 * axis. A group or a ligand, attached to something, is its own picture,
 * drawn out.
 */
export function picturedStructure(given: GroupStructure, bondLength: number): AbbreviationStructure {
  // (a ligand's own picture has a star where it is bound)
  const bound = given.atoms.some((a, i) => a.el === "*" && !given.haptic?.some((h) => h.star === i));
  if (given.attach.length || bound) return placedStructure(given, null, bondLength);
  const keep = new Set([
    ...given.atoms.flatMap((a, i) => (a.tetra || a.isotope ? [i] : [])),
    ...(given.axes ?? []).flatMap((ax) => [...ax.atoms, ...ax.refs]),
  ]);
  const trials = contractionTrials(contractGraph(given.atoms, given.bonds), keep);
  let best: { given: GroupStructure; s: ReturnType<typeof drawnAsSaid>; laid: Layout2D; hidden: number } | null = null;
  for (let trial = trials.next(); !trial.done; ) {
    const written = writtenShort(given, trial.value);
    const s = drawnAsSaid(written);
    const input = inputFor(s);
    const laid = layout2D(input);
    const hidden = hiddenIn(input, laid);
    if (!best || hidden < best.hidden) best = { given: written, s, laid, hidden };
    trial = trials.next(hidden);
  }
  return placedFrom(best!.given, best!.s, best!.laid, null, bondLength);
}

/** A structure with these of its groups written as their labels: each one atom, where it was attached. */
function writtenShort(given: GroupStructure, cs: readonly Contraction[]): GroupStructure {
  if (!cs.length) return given;
  const groupOf = new Map<number, number>();
  cs.forEach((c, k) => c.atoms.forEach((a) => groupOf.set(a, k)));
  const label = new Map(cs.map((c) => [c.at, c.label]));
  const kept = given.atoms.map((_, i) => i).filter((i) => !groupOf.has(i) || label.has(i));
  const at = new Map(kept.map((i, k) => [i, k]));
  const to = (i: number) => at.get(i)!;
  return {
    atoms: kept.map((i): SmilesAtom => {
      if (label.has(i)) return { el: label.get(i)!, hs: 0 };
      const a = given.atoms[i];
      return a.tetra ? { ...a, tetra: { ...a.tetra, neighbours: a.tetra.neighbours.map((n) => (n < 0 ? n : to(n))) } } : a;
    }),
    bonds: given.bonds
      .filter((b) => !(groupOf.has(b.a1) && groupOf.get(b.a1) === groupOf.get(b.a2)))
      .map((b) => ({ ...b, a1: to(b.a1), a2: to(b.a2), ...(b.endpoints ? { endpoints: b.endpoints.map(to) } : {}) })),
    attach: given.attach.map(to),
    ...(given.haptic ? { haptic: given.haptic.map((h) => ({ star: to(h.star), atoms: h.atoms.map(to) })) } : {}),
    ...(given.lends ? { lends: given.lends } : {}),
    ...(given.axes
      ? {
          axes: given.axes.map((ax) => ({
            ...ax,
            atoms: [to(ax.atoms[0]), to(ax.atoms[1])] as const,
            refs: [to(ax.refs[0]), to(ax.refs[1])] as const,
          })),
        }
      : {}),
  };
}

/**
 * What the engine is given for a structure as a drawing shows it: its
 * atoms, their H and bonds, a carbon after them for its bond out where it
 * is attached, and its axes.
 */
function inputFor(s: ReturnType<typeof drawnAsSaid>): LayoutInput {
  const stars = new Map((s.haptic ?? []).map((h) => [h.star, h.atoms]));
  const head = s.attach[0] ?? 0;
  const from = s.atoms.length;
  // (a star given its pi system: the engine draws a ring of it face-on to
  // its metal, as Clean-up's does)
  return {
    atoms: [
      ...s.atoms.map((a, i) => ({
        el: a.el,
        ...(a.charge ? { charge: a.charge } : {}),
        hs: s.hs[i],
        ...(a.tetra ? { tetra: a.tetra } : {}),
        ...(stars.has(i) ? { pi: stars.get(i)! } : {}),
      })),
      { el: "C" },
    ],
    bonds: [
      ...s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.coordination ? 1 : b.order })),
      ...(s.attach.length ? [{ a: from, b: head, order: 1 }] : []),
    ],
    ...(s.axes?.length ? { axes: s.axes } : {}),
  };
}

/** A structure placed as `placedStructure` places it, from the engine's layout of it (`inputFor`). */
function placedFrom(
  given: GroupStructure,
  s: ReturnType<typeof drawnAsSaid>,
  laid: Layout2D,
  neighbour: P | readonly P[] | null,
  bondLength: number,
): AbbreviationStructure {
  const around = (Array.isArray(neighbour) ? neighbour : neighbour ? [neighbour as P] : []).filter((d) => Math.hypot(d.x, d.y) > 1e-9);
  const stars = new Map((s.haptic ?? []).map((h) => [h.star, h.atoms]));
  const head = s.attach[0] ?? 0;
  const from = s.atoms.length;
  // each star at its pi system's centre
  for (const [star, ring] of stars) {
    laid.x[star] = ring.reduce((t, k) => t + laid.x[k], 0) / ring.length;
    laid.y[star] = ring.reduce((t, k) => t + laid.y[k], 0) / ring.length;
  }
  // (in perspective: each atom's depth, and the centres the drawing itself shows)
  const atoms: { el: string; at: P; chem: Omit<Said, "hs" | "tetra" | "aromatic" | "cls">; depth?: number; shown?: boolean }[] =
    s.atoms.map((a, i) => {
      const { hs: _hs, tetra: _tetra, aromatic: _aromatic, cls: _cls, ...chem } = a;
      return {
        el: a.el,
        at: { x: laid.x[i], y: laid.y[i] },
        chem,
        ...(laid.depth[i] != null ? { depth: laid.depth[i]! } : {}),
        ...(laid.solid[i] && a.tetra ? { shown: true } : {}),
      };
    });
  const bonds: AbbreviationStructure["bonds"] = s.bonds.map((b) => ({
    a1: b.a1,
    a2: b.a2,
    order: (b.coordination ? 1 : b.order) as 1 | 2 | 3,
    ...(b.coordination ? { coordination: true } : {}),
    ...(b.endpoints ? { endpoints: b.endpoints, attach: "all" as const } : {}),
  }));
  // a ring seen in perspective: its near edges bold (a double bond's where
  // it is drawn as a single one - a ring face-on to its metal, drawn with
  // its circle)
  for (const [u, v] of laid.bold) {
    const b = bonds.find((x) => (x.a1 === u && x.a2 === v) || (x.a1 === v && x.a2 === u));
    if (b) b.display = "bold";
  }
  // a stereocentre's H the engine draws to carry its wedge
  const hydrogenOn = new Map<number, number>();
  for (const h of laid.hydrogens) {
    atoms.push({ el: "H", at: h.at, chem: { el: "H" } });
    hydrogenOn.set(h.on, atoms.length - 1);
    bonds.push({ a1: h.on, a2: atoms.length - 1, order: 1 });
  }
  // each wedge on its bond, its narrow end at its centre
  const degree = new Map<number, number>();
  const count = (i: number) => degree.set(i, (degree.get(i) ?? 0) + 1);
  for (const b of bonds) {
    count(b.a1);
    count(b.a2);
  }
  for (const at of s.attach) count(at);
  for (const w of laid.wedges) {
    const to = w.to === -1 ? hydrogenOn.get(w.from) : w.to;
    const b = bonds.find((x) => !x.endpoints && ((x.a1 === w.from && x.a2 === to) || (x.a1 === to && x.a2 === w.from)));
    if (!b) continue;
    b.stereo = w.stereo;
    const usual = wedgeNarrowAtom({ a1: b.a1, a2: b.a2, order: b.order, stereoOrient: "principle" }, degree);
    if (usual !== w.from) b.stereoOrient = "reverse";
  }
  // and a ring's bond toward the viewer, a wedge narrow at its far end
  // a cluster's metals in contact, dashed
  for (const [u, v] of laid.dashed) {
    const b = bonds.find((x) => (x.a1 === u && x.a2 === v) || (x.a1 === v && x.a2 === u));
    if (b) b.display = "dashed";
  }
  for (const [far, nearer] of laid.toward) {
    const b = bonds.find((x) => (x.a1 === far && x.a2 === nearer) || (x.a1 === nearer && x.a2 === far));
    if (!b) continue;
    b.display = "wedge";
    const usual = wedgeNarrowAtom({ a1: b.a1, a2: b.a2, order: b.order, stereoOrient: "principle" }, degree);
    if (usual !== far) b.stereoOrient = "reverse";
  }

  const into = { x: laid.x[head] - laid.x[from], y: laid.y[head] - laid.y[from] };
  // attached through a pi system: its centre as far again from the bond's
  // other end as the system is wide, so that its atoms keep clear of it
  const pi = stars.get(head);
  const reach = pi && around.length ? Math.max(...pi.map((k) => Math.hypot(laid.x[k] - laid.x[head], laid.y[k] - laid.y[head]))) : 0;
  const away = Math.hypot(into.x, into.y) || 1;
  // attached by nothing: its middle where the label was
  const xs = atoms.map((a) => a.at.x);
  const ys = atoms.map((a) => a.at.y);
  const at = s.attach.length
    ? { x: laid.x[head] - (into.x / away) * reach, y: laid.y[head] - (into.y / away) * reach }
    : { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  // the way the bond runs now: from the neighbour to the label's atom - or,
  // bonded at that atom to more than one, the way its own bonds there go
  // together, into the widest opening between those (bonded at more than
  // one of its atoms: on from all of them together)
  const among = around.length > 1 && s.attach.length === 1;
  const own = among ? ownWay(bonds, atoms, head) ?? into : into;
  const back = around.length > 1 ? together(around) ?? around[0] : around[0];
  const want = among ? widestOpening(around) : back && s.attach.length ? { x: -back.x, y: -back.y } : into;
  const turn = s.attach.length ? Math.atan2(want.y, want.x) - Math.atan2(own.y, own.x) : 0;
  const cos = Math.cos(turn) * bondLength;
  const sin = Math.sin(turn) * bondLength;
  return {
    atoms: atoms.map(({ at: p, chem, depth, shown }) => {
      const dx = p.x - at.x;
      const dy = p.y - at.y;
      return {
        ...chem,
        x: dx * cos - dy * sin,
        y: dx * sin + dy * cos,
        ...(depth != null ? { z: depth * bondLength } : {}),
        ...(shown ? { stereoCentre: true } : {}),
      };
    }),
    bonds,
    attach: s.attach,
    ...(s.haptic?.length ? { haptic: s.haptic } : {}),
    ...(given.lends?.some(Boolean) ? { lends: given.lends } : {}),
  };
}

/** The way an atom's bonds go together, from it (`together`). */
function ownWay(bonds: AbbreviationStructure["bonds"], atoms: readonly { at: P }[], at: number): P | null {
  const p = atoms[at].at;
  const out = bonds.flatMap((b) => {
    if (b.endpoints || (b.a1 !== at && b.a2 !== at)) return [];
    const q = atoms[b.a1 === at ? b.a2 : b.a1].at;
    return Math.hypot(q.x - p.x, q.y - p.y) > 1e-9 ? [{ x: q.x - p.x, y: q.y - p.y }] : [];
  });
  return together(out);
}

/** These directions together: the sum of them each as long as the other, or nothing where they cancel. */
function together(ds: readonly P[]): P | null {
  const sum = ds.reduce((t, d) => {
    const l = Math.hypot(d.x, d.y);
    return { x: t.x + d.x / l, y: t.y + d.y / l };
  }, { x: 0, y: 0 });
  return Math.hypot(sum.x, sum.y) > 1e-6 ? sum : null;
}

/** The bisector of the widest opening between these directions. */
function widestOpening(ds: readonly P[]): P {
  const t = ds.map((d) => Math.atan2(d.y, d.x)).sort((a, b) => a - b);
  let widest = -1;
  let at = 0;
  t.forEach((a, k) => {
    const gap = (k + 1 < t.length ? t[k + 1] : t[0] + 2 * Math.PI) - a;
    if (gap > widest + 1e-9) [widest, at] = [gap, a + gap / 2];
  });
  return { x: Math.cos(at), y: Math.sin(at) };
}

/** An atom of a structure, with what a drawing needs said of it besides. */
type Said = SmilesAtom & Pick<AtomChem, "radical" | "valence">;

/**
 * A structure as a drawing will show it, its atoms' hydrogens counted as
 * a drawing counts them (molecule.valenceOrder, implicitHydrogens): one
 * that says more than that - Bu3SnH's tin, a metal's hydride - has the
 * rest drawn as atoms; one that says fewer is a radical where it is one
 * short and bonded to nothing outside (TEMPO's oxygen, a neutral Cp*'s
 * ring), and else keeps the valence it has (a carbene's carbon). With each
 * atom's H as drawn.
 */
function drawnAsSaid(s: GroupStructure): GroupStructure & { atoms: Said[]; hs: number[] } {
  const atoms: Said[] = s.atoms.map((a) => ({ ...a }));
  const bonds: StructureBond[] = [...s.bonds];
  const sum = atoms.map(() => 0);
  for (const b of bonds) {
    sum[b.a1] += valenceOrder(b, atoms[b.a1].el);
    sum[b.a2] += valenceOrder(b, atoms[b.a2].el);
  }
  // (a bond out: a coordination bond where the atom lends its pair)
  s.attach.forEach((at, k) => {
    sum[at] += s.lends?.[k] ? valenceOrder({ order: 1, coordination: true }, atoms[at].el) : 1;
  });
  const outside = new Set(s.attach);
  // (a pi system's atom, bound face-on: one short is the ring's unpaired
  // electron - Cp* as a neutral ligand - drawn as the ring's circle is)
  const pi = new Set((s.haptic ?? []).flatMap((h) => h.atoms));
  const n = atoms.length;
  for (let i = 0; i < n; i++) {
    const a = atoms[i];
    if (a.hs == null || a.el === "*") continue;
    const usual = implicitHydrogens(a.el, sum[i], a.charge ?? 0);
    if (a.hs > usual) {
      for (let k = usual; k < a.hs; k++) {
        atoms.push({ el: "H", hs: 0 });
        bonds.push({ a1: i, a2: atoms.length - 1, order: 1 });
      }
    } else if (a.hs < usual) {
      if (usual - a.hs === 1 && !outside.has(i) && (a.el !== "C" || pi.has(i))) atoms[i] = { ...a, radical: "doublet" };
      else atoms[i] = { ...a, valence: sum[i] + a.hs };
    }
  }
  const hs = atoms.map((a, i) =>
    a.el === "*"
      ? 0
      : a.valence != null
        ? Math.max(0, a.valence - (sum[i] ?? 0))
        : implicitHydrogens(a.el, sum[i] ?? 0, a.charge ?? 0, a.radical),
  );
  return { ...s, atoms, bonds, hs };
}

/**
 * A structure in SMILES drawn out by Meno's own engine, `bondLength` apart -
 * an abbreviation's, its "*" where it is attached - for a picture of it:
 * atoms with ids from 1, an aromatic ring's bonds in Kekulé form. Null for
 * SMILES that does not read.
 */
export function drawnSmiles(
  smiles: string,
  bondLength: number,
): { atoms: (AtomChem & { id: number; x: number; y: number; z?: number })[]; bonds: { id: number; a: number; b: number; order: 1 | 2 | 3 }[] } | null {
  let read: ReturnType<typeof readSmiles>;
  try {
    read = readSmiles(smiles);
  } catch {
    return null;
  }
  if (!read.atoms.length) return null;
  const orders = kekuleOrders(read.atoms, read.bonds);
  const laid = layout2D({
    // (the "*" laid out as a carbon would be)
    atoms: read.atoms.map((a) => ({ el: a.el === "*" ? "C" : a.el, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: read.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
  });
  return {
    atoms: read.atoms.map((a, i) => ({
      id: i + 1,
      x: laid.x[i] * bondLength,
      y: laid.y[i] * bondLength,
      // (a cage's depth: a bond passing behind another is drawn broken there)
      ...(laid.depth[i] != null ? { z: laid.depth[i]! * bondLength } : {}),
      el: a.el,
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.isotope ? { isotope: a.isotope } : {}),
    })),
    bonds: read.bonds.map((b, i) => ({ id: read.atoms.length + i + 1, a: b.a1 + 1, b: b.a2 + 1, order: orders[i] as 1 | 2 | 3 })),
  };
}
