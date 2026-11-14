/**
 * A structure laid out by Meno's own engine (lib/layout, docs/LAYOUT-2D.md):
 * what the engine is given - the graph, and the stereochemistry the drawing
 * shows, read out of it - and what its layout comes to as edits to the
 * drawing.
 *
 * The engine draws an H where a stereocentre needs one to carry its wedge,
 * and leaves it out elsewhere, so an H drawn on a stereocentre is taken as
 * that centre's H, not as an atom: laid out, it is kept if the engine draws
 * one there, and taken away if not. A cage comes out in perspective, its
 * atoms with a depth, its stereocentres shown by the drawing itself.
 *
 * The new drawing is read back before anything is changed: it has to say
 * the stereochemistry the old one said.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelTrims, layoutMolecule, showsLabel } from "../../../../lib/chem/layout2d";
import { chemistry } from "../../../../lib/chem/molecule";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { readStereo, sameConfiguration, straightEnds, unreadWhy } from "../../../../lib/layout/drawn";
import { lonePairCentres } from "../../../../lib/chem/lonePairCentres";
import type { Layout2D, LayoutInput } from "../../../../lib/layout/engine";
import { etaBondedAtomByAtom, isMetal, type CisTrans } from "../../../../lib/layout/perceive";
import { allylCurve } from "../../../../lib/chem/allylArc";
import { allylChain } from "./eta";
import type { Tetrahedral } from "../../../../lib/layout/stereo";
import { relayout, emptyWorkspaceDocument, type Relayout } from "../document";
import type { Bond, Model } from "../store/types";
import { degrees, drawingOf } from "./drawing";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { greatest } from "../../../../lib/chem/lists";

export type LayoutJob = {
  input: LayoutInput;
  /** The model atom each of the input's atoms is - but the stars the engine is given for rings bound atom by atom, after them. */
  ids: number[];
  /** Each ring or chain bound so: its metal and its atoms, by id - made one bond to its centre as it is laid out. */
  bound?: { metal: number; atoms: number[] }[];
  /** The H atoms taken as their centre's own H, by the centre's input index. */
  folded: Map<number, number[]>;
  /** The axes and cumulenes of `input` are the structure's own text's, given in place of what its drawing says (`laidOut`): the drawing's reading of them is not to be kept. */
  given?: true;
  /**
   * The double bonds the structure's own text leaves without a configuration, drawn straight on so that they state none (`laidOut`), by their
   * atoms' ids ("a,b", the smaller first): what a plugin's drawing of them said is not to be kept.
   */
  opened?: readonly string[];
};

/**
 * What the engine is given for `part`: its atoms (but for the H of its
 * stereocentres), their H, bonds and charges - none, as the editor has
 * none yet - and the stereochemistry the drawing shows.
 */
/** Each atom's bonds, by their places in `bonds`. */
function bondsAt(bonds: readonly { a: number; b: number }[]): Map<number, number[]> {
  const bondsOf = new Map<number, number[]>();
  bonds.forEach((b, k) => {
    bondsOf.set(b.a, [...(bondsOf.get(b.a) ?? []), k]);
    bondsOf.set(b.b, [...(bondsOf.get(b.b) ?? []), k]);
  });
  return bondsOf;
}

/**
 * The atoms, by their places in the drawing, with a wedge that could make
 * them a stereocentre but says nothing that can be read: wedge and hashes
 * drawn opposite each other, or an atom of three bonds at which a wedge
 * states no configuration - an amine's N, a plain N-alkyl aziridine's, a B:
 * none whose lone pair
 * keeps one (lib/chem/lonePairCentres; a sulfoxide's S, a phosphine's P,
 * an aziridine's N are read, lib/layout/drawn).
 */
export function unreadWedges(drawing: ReturnType<typeof drawingOf>, stereo: ReturnType<typeof readStereo>): number[] {
  const bondsOf = bondsAt(drawing.bonds);
  const out = new Set<number>();
  // (a centre by its lone pair drawn with two bonds, its H carried - a secondary phosphine's P: a centre its wedge cannot state)
  const keepsPyramid = lonePairCentres(drawing.atoms, drawing.bonds);
  for (const b of drawing.bonds) {
    const c = b.wedge?.narrow;
    // (an axis of chirality's end, either: its wedge says how the axis turns)
    if (c == null || stereo.tetra.has(c) || stereo.axes.some((ax) => ax.atoms.includes(c))) continue;
    const n = bondsOf.get(c)?.length ?? 0;
    if ((n >= 3 && drawing.atoms[c].hs <= 1) || (n === 2 && drawing.atoms[c].hs === 1 && keepsPyramid(c))) out.add(c);
  }
  return [...out];
}

/**
 * Each star at a haptic bond's end, by its place in `part`: the pi system
 * it stands for, its atoms by their places - which the engine draws round
 * it (a ring face-on to its metal), as it does a written-out label's.
 */
export function piSystems(part: Model, drawing: ReturnType<typeof drawingOf>): Map<number, number[]> {
  const pi = new Map<number, number[]>();
  for (const b of part.bonds) {
    if (!b.endpoints?.length || b.attach === "any") continue;
    const star = [b.a, b.b].map((id) => drawing.index.get(id)!).find((i) => i != null && part.atoms[i].el === "*");
    const atoms = b.endpoints.map((id) => drawing.index.get(id)).filter((i): i is number => i != null);
    if (star != null && atoms.length === b.endpoints.length) pi.set(star, atoms);
  }
  return pi;
}

export function layoutJob(part: Model): LayoutJob {
  const drawing = drawingOf(part);
  const stereo = readStereo(drawing.atoms, drawing.bonds);
  const { tetra, cisTrans, axes, cumulated } = stereo;
  // (a double bond drawn straight at an end, its configuration not given: that end kept straight - IUPAC 2006 ST-4.4 - so that
  //  what is laid out leaves it unsaid too, rather than saying one or the other)
  const straight = straightEnds(drawing.atoms, drawing.bonds);
  const bondsOf = bondsAt(drawing.bonds);
  // A wedge at an atom that could be a stereocentre, but says nothing the
  // engine can take: laid out, it would be lost, so it is not laid out.
  const unread = unreadWedges(drawing, stereo);
  if (unread.length) {
    throw new Error(
      `the wedges at ${part.atoms[unread[0]].el} do not say its configuration in a way Clean-up can keep ` +
        `(${unreadWhy(drawing.atoms, drawing.bonds, unread[0])}), so nothing was moved`,
    );
  }
  // an H on a stereocentre, bonded to nothing else: the centre's own
  const foldedInto = new Map<number, number>();
  part.atoms.forEach((a, h) => {
    const mine = bondsOf.get(h) ?? [];
    if (a.el !== "H" || mine.length !== 1) return;
    const b = drawing.bonds[mine[0]];
    const c = b.a === h ? b.b : b.a;
    if (b.order === 1 && part.atoms[c].el !== "H" && tetra.has(c)) foldedInto.set(h, c);
  });
  const kept = part.atoms.map((_, i) => i).filter((i) => !foldedInto.has(i));
  const at = new Map(kept.map((i, k) => [i, k]));
  const folded = new Map<number, number[]>();
  for (const [h, c] of foldedInto) folded.set(at.get(c)!, [...(folded.get(at.get(c)!) ?? []), part.atoms[h].id]);

  const configuration = (c: number): Tetrahedral | undefined => {
    const t = tetra.get(c);
    if (!t) return undefined;
    const order = t.neighbours.map((n) => (n === -1 || foldedInto.has(n) ? -1 : at.get(n)!));
    // the H last, as the engine has it: each place it moves turns the sense
    const h = order.indexOf(-1);
    if (h < 0) return { neighbours: order, volume: t.volume };
    const moves = order.length - 1 - h;
    const neighbours = [...order.slice(0, h), ...order.slice(h + 1), -1];
    return { neighbours, volume: (moves % 2 ? -t.volume : t.volume) as 1 | -1 };
  };
  // a star at a haptic bond's end: the pi system it stands for (an H of a stereocentre is none of one)
  const pi = new Map<number, number[]>();
  for (const [star, atoms] of piSystems(part, drawing)) if (atoms.every((i) => at.has(i))) pi.set(star, atoms.map((i) => at.get(i)!));
  const input: LayoutInput = {
    atoms: kept.map((i) => {
      const t = configuration(i);
      return {
        el: part.atoms[i].el,
        ...(part.atoms[i].charge ? { charge: part.atoms[i].charge } : {}),
        hs: drawing.atoms[i].hs + (folded.get(at.get(i)!)?.length ?? 0),
        ...(t ? { tetra: t } : {}),
        ...(pi.has(i) ? { pi: pi.get(i)! } : {}),
        ...(straight.has(i) ? { linear: true } : {}),
      };
    }),
    bonds: drawing.bonds.flatMap((b, k) => {
      if (foldedInto.has(b.a) || foldedInto.has(b.b)) return [];
      const ct = cisTrans.get(k);
      const stereo: CisTrans | undefined =
        ct && at.has(ct.refs[0]) && at.has(ct.refs[1])
          ? { refs: [at.get(ct.refs[0])!, at.get(ct.refs[1])!], cis: ct.cis }
          : undefined;
      return [{ a: at.get(b.a)!, b: at.get(b.b)!, order: b.order, ...(stereo ? { stereo } : {}) }];
    }),
    ...(axes.length
      ? {
          axes: axes.map((ax) => ({
            atoms: [at.get(ax.atoms[0])!, at.get(ax.atoms[1])!] as const,
            refs: [at.get(ax.refs[0])!, at.get(ax.refs[1])!] as const,
            sense: ax.sense,
          })),
        }
      : {}),
    ...(cumulated.length
      ? {
          cumulated: cumulated.map((x) => ({
            atoms: [at.get(x.atoms[0])!, at.get(x.atoms[1])!] as const,
            refs: [at.get(x.refs[0])!, at.get(x.refs[1])!] as const,
            cis: x.cis,
          })),
        }
      : {}),
  };
  const ids = kept.map((i) => part.atoms[i].id);
  // A ring bound to a metal atom by atom - ferrocene drawn by hand, a bond
  // from the iron to each carbon - or a chain of three or more (an allyl)
  // is given to the engine as a haptic bond's is, a star at its centre
  // bonded to the metal, and laid out face-on (the maintainer, 2026-10-13);
  // laid out, the bonds to its atoms become that one bond (chem/eta, the
  // maintainer, 2026-10-17).
  const bound = etaBondedAtomByAtom(input);
  if (!bound.length) return { input, ids, folded };
  const dropped = new Set(bound.flatMap((r) => r.bonds));
  const atoms = [...input.atoms];
  const bonds = input.bonds.filter((_, i) => !dropped.has(i));
  for (const r of bound) {
    atoms.push({ el: "*", hs: 0, pi: r.ring });
    bonds.push({ a: atoms.length - 1, b: r.metal, order: 1 });
  }
  const systems = bound.map((r) => ({ metal: ids[r.metal], atoms: r.ring.map((a) => ids[a]) }));
  return { input: { ...input, atoms, bonds }, ids, folded, bound: systems };
}

const pairKey = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

/**
 * The engine's layout of `job` as edits to `model`: the part where it was
 * - its middle kept - but laid out afresh, at the style's bond length;
 * its wedges, and only those, the ones the engine draws; each H the engine
 * draws the centre's own, where it had one, and new where not; the rest of
 * its H taken away. Given the drawing's `style`, a bond from a label to one
 * at a terminal atom is drawn long enough for the two (roomForLabels).
 * Throws, changing nothing, if the new drawing would not say the
 * stereochemistry the old one said.
 */
export function relayoutFrom(model: Model, part: Model, job: LayoutJob, given: Layout2D, style?: DrawingStyle): Relayout {
  const { input, ids } = job;
  // (the drawing's own atoms: the stars given for rings bound atom by atom are not)
  const n = ids.length;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  // (a four-bond metal's donors opposite each other as they were drawn: transplatin cleaned up is transplatin)
  const laid = oppositesKept(ids.map((id) => byId.get(id)!), input, given);
  // at the style's bond length, whatever the drawing's was - a structure put
  // down too large or too small, read from a figure at a wrong scale, comes
  // to the workspace's one style (the maintainer, 2026-10-27): the engine's
  // bond is 1
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const k = NOMINAL_BOND_LENGTH;
  const was = ids.map((id) => byId.get(id)!);
  const mid = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
  const ox = mid(was.map((a) => a.x));
  const oy = mid(was.map((a) => a.y));
  const nx = mid(laid.x.slice(0, n));
  const ny = mid(laid.y.slice(0, n));
  const place = (x: number, y: number) => ({ x: ox + (x - nx) * k, y: oy + (y - ny) * k });

  const atoms: Relayout["atoms"] = ids.map((id, i) => ({
    id,
    ...place(laid.x[i], laid.y[i]),
    ...(laid.depth[i] != null ? { z: laid.depth[i]! * k } : {}),
    ...(laid.solid[i] && input.atoms[i].tetra ? { stereoCentre: true } : {}),
  }));
  // each star at its pi system's centre, as a written-out label's: cod's
  // C=C, as well as a ring
  input.atoms.forEach((a, i) => {
    if (i < n && a.pi?.length) atoms[i] = { ...atoms[i], x: mid(a.pi.map((j) => atoms[j].x)), y: mid(a.pi.map((j) => atoms[j].y)) };
  });
  // the H the engine draws: a centre's own where it had one
  const spare = new Map([...job.folded].map(([c, hs]) => [c, [...hs]]));
  const hydrogenOf = new Map<number, number | { added: number }>();
  const added: NonNullable<Relayout["added"]> = [];
  for (const h of laid.hydrogens) {
    const own = spare.get(h.on)?.shift();
    const p = place(h.at.x, h.at.y);
    if (own != null) {
      atoms.push({ id: own, ...p });
      hydrogenOf.set(h.on, own);
    } else {
      hydrogenOf.set(h.on, { added: added.length });
      added.push({ ...p, on: ids[h.on], stereo: "none" });
    }
  }
  const removed = [...spare.values()].flat();

  // the wedges: those the engine draws, and no others in the part
  const gone = new Set(removed);
  const inPart = new Set(part.atoms.map((a) => a.id));
  const wedgeOn = new Map<number, { stereo: "up" | "down"; narrow: number }>();
  for (const w of laid.wedges) {
    const from = ids[w.from];
    const to = w.to === -1 ? hydrogenOf.get(w.from)! : ids[w.to];
    if (typeof to === "object") {
      const h = added[to.added];
      h.stereo = w.stereo;
      h.narrow = from;
      continue;
    }
    const bond = model.bonds.find((b) => (b.a === from && b.b === to) || (b.a === to && b.b === from));
    // (a wedge on a single bond only: one put on a double or triple bond - at an atom with too many bonds, say - is no wedge)
    if (bond && bond.order === 1) wedgeOn.set(bond.id, { stereo: w.stereo, narrow: from });
  }
  // a ring in perspective (face-on to a metal, or turned on its bond): its
  // near edges bold, a bond toward the viewer a wedge narrow at its far
  // end, the rest of it plain
  const boldOnes = new Set(laid.bold.map(([u, v]) => pairKey(ids[u], ids[v])));
  // (and a cluster's metals in contact, dashed)
  const dashedOnes = new Set(laid.dashed.map(([u, v]) => pairKey(ids[u], ids[v])));
  const farEnd = new Map(laid.toward.map(([u, v]) => [pairKey(ids[u], ids[v]), ids[u]]));
  const display = (b: Bond): Pick<Bond, "display" | "narrow"> | null => {
    const u = indexOf.get(b.a);
    const v = indexOf.get(b.b);
    if (u == null || v == null || laid.depth[u] == null || laid.depth[v] == null || b.endpoints?.length) return null;
    const key = pairKey(b.a, b.b);
    const far = farEnd.get(key);
    if (far != null) {
      return b.display === "wedge" && b.narrow === far ? null : { display: "wedge", narrow: far };
    }
    const want = boldOnes.has(key) ? "bold" : dashedOnes.has(key) ? "dashed" : undefined;
    return want === b.display || (!want && b.display !== "bold" && b.display !== "wedge") ? null : { display: want };
  };
  const bonds: Relayout["bonds"] = model.bonds.flatMap((b): Relayout["bonds"] => {
    if (!inPart.has(b.a) || !inPart.has(b.b) || gone.has(b.a) || gone.has(b.b)) return [];
    const w = wedgeOn.get(b.id);
    const d = display(b);
    if (w) return [{ id: b.id, stereo: w.stereo, narrow: w.narrow, ...d }];
    if (b.stereo === "up" || b.stereo === "down") return [{ id: b.id, stereo: "none", ...d }];
    if (d) return [{ id: b.id, stereo: b.stereo, narrow: b.narrow, ...d }];
    return [];
  });
  // each η3-allyl posed as the maintainer draws one (2026-10-18): its
  // middle carbon away from its metal, its arc towards it
  const systems = [
    ...(job.bound ?? []),
    ...part.bonds.flatMap((b) => {
      if (!b.endpoints?.length || b.attach === "any") return [];
      const star = byId.get(b.b)?.el === "*" ? b.b : b.a;
      return [{ metal: star === b.b ? b.a : b.b, atoms: b.endpoints, star }];
    }),
  ];
  const posed = poseAllyls(atoms, added, part, systems, style);
  // each ring or chain bound to its metal atom by atom: one bond to its
  // centre - an allyl's, its arc's middle - for the bonds to its atoms (chem/eta)
  const eta: NonNullable<Relayout["eta"]> = [];
  if (job.bound?.length) {
    const placedAt = new Map(atoms.map((a) => [a.id, a]));
    for (const sys of job.bound) {
      const inSys = new Set(sys.atoms);
      const drop = part.bonds.filter((b) => (b.a === sys.metal && inSys.has(b.b)) || (b.b === sys.metal && inSys.has(b.a))).map((b) => b.id);
      const at = sys.atoms.map((id) => placedAt.get(id)!);
      const chain = allylChain({ endpoints: sys.atoms }, part.bonds);
      const metal = placedAt.get(sys.metal);
      const centre = chain && metal ? allylCurve(placedAt.get(chain[0])!, placedAt.get(chain[1])!, placedAt.get(chain[2])!).middle : { x: mid(at.map((a) => a.x)), y: mid(at.map((a) => a.y)) };
      eta.push({ metal: sys.metal, atoms: sys.atoms, bonds: drop, ...centre });
    }
  }
  const dropped = new Set(eta.flatMap((e) => e.bonds));
  const change: Relayout = { atoms, bonds: dropped.size ? bonds.filter((b) => !dropped.has(b.id)) : bonds, added, removed, ...(eta.length ? { eta } : {}) };
  if (style) roomForLabels(part, change, style);
  if (style && posed.length) allylLinesSeen(part, change, style, posed);
  // (and never a layout with two atoms on each other, or an atom on a bond,
  // where the drawing had none: a picture that misstates the structure - a
  // bond hidden under another, its wedge with it - is worse than the old one)
  if (overlapsMade(part, change).length) {
    throw new Error("the structure could not be laid out without putting one atom on another or on a bond, so nothing was moved");
  }
  const differs = stereoDiffers(part, change, job);
  if (differs === "gained") {
    throw new Error("laid out, the structure would show a configuration its drawing does not state - a double bond drawn straight on, say - so nothing was moved");
  }
  if (differs) {
    throw new Error("the structure could not be laid out keeping its stereochemistry, so nothing was moved");
  }
  return change;
}

/**
 * How near, as a share of a drawing's bond, two atoms are taken to be on
 * each other, or an atom on a bond. Atoms not bonded sit half a bond and
 * more apart in any drawing the engine makes - a ring's across, a crowded
 * branch's - so a tenth of a bond is no drawing's spacing, only atoms laid
 * on each other (as the engine's first placement of a bridged ring system
 * with a large ring could leave them, 2026-10-27).
 */
export const ON_EACH_OTHER = 0.1;

/**
 * What `change` puts on each other in `part` that the drawing did not:
 * each two atoms closer than ON_EACH_OTHER of a bond ("a|b"), and each atom
 * that close to a bond it is not an end of, along its middle ("a@b-c") - by
 * ids, an H the change adds by its place among `added`, negative. Stars of
 * haptic bonds, and haptic bonds, are left out: they lie over their pi
 * systems by design.
 */
export function overlapsMade(part: Model, change: Relayout): string[] {
  const gone = new Set(change.removed ?? []);
  const unbonded = new Set((change.eta ?? []).flatMap((e) => e.bonds));
  const star = new Set(part.atoms.filter((a) => a.el === "*").map((a) => a.id));
  const was = new Map(part.atoms.filter((a) => !star.has(a.id)).map((a) => [a.id, { x: a.x, y: a.y }]));
  const now = new Map([...was].filter(([id]) => !gone.has(id)));
  for (const a of change.atoms) if (now.has(a.id)) now.set(a.id, { x: a.x, y: a.y });
  (change.added ?? []).forEach((h, i) => now.set(-1 - i, { x: h.x, y: h.y }));
  const plain = part.bonds.filter((b) => !b.endpoints?.length && !star.has(b.a) && !star.has(b.b));
  const bondsWere = plain.map((b) => [b.a, b.b] as const);
  const bondsNow = [
    ...plain.filter((b) => !gone.has(b.a) && !gone.has(b.b) && !unbonded.has(b.id)).map((b) => [b.a, b.b] as const),
    ...(change.added ?? []).map((h, i) => [h.on, -1 - i] as const),
  ];
  const before = new Set(onEachOther(was, bondsWere));
  return onEachOther(now, bondsNow).filter((k) => !before.has(k));
}

/** Atoms on each other, and atoms on bonds, in a drawing (overlapsMade): within ON_EACH_OTHER of its own middle bond. */
function onEachOther(at: Map<number, { x: number; y: number }>, bonds: readonly (readonly [number, number])[]): string[] {
  const lengths = bonds
    .map(([a, b]) => (at.has(a) && at.has(b) ? Math.hypot(at.get(a)!.x - at.get(b)!.x, at.get(a)!.y - at.get(b)!.y) : 0))
    .filter((l) => l > 0)
    .sort((p, q) => p - q);
  const bond = lengths[lengths.length >> 1] || NOMINAL_BOND_LENGTH;
  const near = ON_EACH_OTHER * bond;
  // (atoms by cells a bond wide: each looked for only near where it is)
  const cell = (v: number) => Math.floor(v / bond);
  const grid = new Map<string, number[]>();
  for (const [id, p] of at) {
    const key = `${cell(p.x)},${cell(p.y)}`;
    const here = grid.get(key);
    if (here) here.push(id);
    else grid.set(key, [id]);
  }
  const within = (x0: number, y0: number, x1: number, y1: number) => {
    const found: number[] = [];
    for (let cx = cell(x0); cx <= cell(x1); cx++) for (let cy = cell(y0); cy <= cell(y1); cy++) found.push(...(grid.get(`${cx},${cy}`) ?? []));
    return found;
  };
  const out: string[] = [];
  for (const [id, p] of at)
    for (const other of within(p.x - near, p.y - near, p.x + near, p.y + near)) {
      if (other <= id) continue;
      const q = at.get(other)!;
      if (Math.hypot(p.x - q.x, p.y - q.y) < near) out.push(`${id}|${other}`);
    }
  for (const [a, b] of bonds) {
    const p = at.get(a);
    const q = at.get(b);
    if (!p || !q) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) continue;
    for (const id of within(Math.min(p.x, q.x) - near, Math.min(p.y, q.y) - near, Math.max(p.x, q.x) + near, Math.max(p.y, q.y) + near)) {
      if (id === a || id === b) continue;
      const r = at.get(id)!;
      const along = ((r.x - p.x) * dx + (r.y - p.y) * dy) / len;
      if (along < near || len - along < near) continue;
      if (Math.abs((r.x - p.x) * dy - (r.y - p.y) * dx) / len < near) out.push(`${id}@${Math.min(a, b)}-${Math.max(a, b)}`);
    }
  }
  return out;
}

/**
 * Each η3-allyl among `systems` (a metal and the atoms it binds as one -
 * three in a chain) posed as the maintainer draws one (2026-10-18): the
 * ligand it is part of - what is bonded to it, but for its metal - turned
 * whole about the middle of its end carbons so that its middle carbon
 * points away from its metal - its delocalisation curve (lib/chem/allylArc)
 * inside it, on the metal's side - and moved so that the metal's line is
 * seen `LINE_SEEN` of the allyl's own bond long, from past the metal's label
 * (as the style draws it, whichever way it reaches) to short of the
 * curve. A
 * ligand bonded to another metal too, or to its own by another way, is left
 * as it is laid out. `atoms` and `added` (hydrogens new to the drawing) are
 * moved in place.
 */
/** How long the metal's line to an η3-allyl's curve is seen after Clean-up, as a share of the allyl's bond. */
const LINE_SEEN = 0.7;

function poseAllyls(
  atoms: Relayout["atoms"],
  added: NonNullable<Relayout["added"]>,
  part: Model,
  systems: readonly { metal: number; atoms: readonly number[]; star?: number }[],
  style?: DrawingStyle,
): Posed[] {
  const posed: Posed[] = [];
  if (!systems.length) return posed;
  // (where the metal's line starts, past its label, and where it stops, short of the curve: as the drawing will have them)
  const opts = style ? editorLayoutOptions(style, { minLinePx: 0 }) : null;
  const zoom = style ? (style.bondLengthPt * 96) / 72 / NOMINAL_BOND_LENGTH : 1;
  const past = (metalEl: string, u: { x: number; y: number }) =>
    opts
      ? labelTrims([{ id: 0, x: 0, y: 0, el: metalEl }, { id: 1, x: u.x, y: u.y, el: "*" }], { a1: 0, a2: 1, order: 1, endpoints: [1] }, opts, zoom).a
      : null;
  const margin = opts ? (opts.labelMarginPx ?? opts.fontPx * 0.16) : 0;
  const el = new Map(part.atoms.map((a) => [a.id, a.el]));
  const at = new Map(atoms.map((a, i) => [a.id, i]));
  for (const sys of systems) {
    const chain = allylChain({ endpoints: [...sys.atoms] }, part.bonds);
    const mi = at.get(sys.metal);
    if (!chain || mi == null || chain.some((id) => !at.has(id))) continue;
    // the ligand: what is bonded to the chain, not through a metal or a haptic bond
    const ligand = new Set<number>(chain);
    const queue = [...chain];
    let alone = true;
    while (queue.length && alone) {
      const u = queue.shift()!;
      for (const b of part.bonds) {
        if (b.endpoints?.length || (b.a !== u && b.b !== u)) continue;
        const v = b.a === u ? b.b : b.a;
        if (v === sys.metal || ligand.has(v)) continue;
        if (isMetal(el.get(v) ?? "")) {
          alone = false;
          break;
        }
        ligand.add(v);
        queue.push(v);
      }
    }
    if (!alone) continue;
    const p = (id: number) => atoms[at.get(id)!];
    const [e1, m, e2] = chain.map(p);
    const metal = atoms[mi];
    const chord = Math.hypot(e2.x - e1.x, e2.y - e1.y);
    if (chord < 1e-9) continue;
    // (its own bond, as laid out)
    const bond = (Math.hypot(m.x - e1.x, m.y - e1.y) + Math.hypot(m.x - e2.x, m.y - e2.y)) / 2;
    const c = { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 };
    // (towards the ligand from its metal, and the way its middle carbon points now)
    const cx = (e1.x + m.x + e2.x) / 3 - metal.x;
    const cy = (e1.y + m.y + e2.y) / 3 - metal.y;
    const d = Math.hypot(cx, cy);
    if (d < 1e-9) continue;
    const u = { x: cx / d, y: cy / d };
    const theta = Math.atan2(u.y, u.x) - Math.atan2(m.y - c.y, m.x - c.x);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // (turned about the end carbons' middle; then moved so that the metal's line is seen LINE_SEEN of a bond long between
    // its label and the curve - a label reaching further one side than the other, Pd's "d", taken as drawn; with no style,
    // the curve's middle a bond and a half from the metal)
    const turn = (q: { x: number; y: number }) => {
      const x = q.x - c.x;
      const y = q.y - c.y;
      return { x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos };
    };
    const [t1, tm, t2] = [e1, m, e2].map(turn);
    // (the curve as the drawing will have it: a double bond's spacing in the style from the chain)
    const middle = allylCurve(t1, tm, t2, opts?.doubleOffsetPx).middle;
    const start = past(el.get(sys.metal) ?? "", u);
    const far = start == null ? 1.5 * bond : start + LINE_SEEN * bond + margin;
    const shift = { x: metal.x + u.x * far - middle.x, y: metal.y + u.y * far - middle.y };
    const move = (q: { x: number; y: number }) => {
      const r = turn(q);
      return { x: r.x + shift.x, y: r.y + shift.y };
    };
    for (const id of ligand) {
      const i = at.get(id);
      if (i != null) atoms[i] = { ...atoms[i], ...move(atoms[i]) };
    }
    for (const h of added) if (ligand.has(h.on)) Object.assign(h, move(h));
    posed.push({ metal: sys.metal, chain, ligand: [...ligand], u });
    if (sys.star != null && at.has(sys.star)) {
      const [f1, fm, f2] = chain.map(p);
      atoms[at.get(sys.star)!] = { ...atoms[at.get(sys.star)!], ...allylCurve(f1, fm, f2).middle };
    }
  }
  return posed;
}

/** An η3-allyl `poseAllyls` posed: its metal, its chain, the ligand it is part of, and the way from the metal to it. */
type Posed = { metal: number; chain: number[]; ligand: number[]; u: { x: number; y: number } };

/**
 * Each allyl `poseAllyls` posed moved along its metal's line until that line
 * is seen `LINE_SEEN` of the allyl's bond long as `style` draws it: laid
 * out as the canvas draws it, the line measured from past the metal's label
 * - wherever the label's rules put it - to short of the curve.
 */
function allylLinesSeen(part: Model, change: Relayout, style: DrawingStyle, posed: readonly Posed[]): void {
  const after = relayout({ ...emptyWorkspaceDocument(), model: part, nextId: nextFree(part) }, change).model;
  const lay = drawnAs(after, style);
  const opts = editorLayoutOptions(style, { minLinePx: 0 });
  const margin = opts.labelMarginPx ?? opts.fontPx * 0.16;
  const at = new Map(after.atoms.map((a) => [a.id, a]));
  const placed = new Map(change.atoms.map((a, i) => [a.id, i]));
  for (const { metal, chain, ligand, u } of posed) {
    const [e1, m, e2] = chain.map((id) => at.get(id));
    if (!e1 || !m || !e2 || !at.has(metal)) continue;
    const middle = allylCurve(e1, m, e2, opts.doubleOffsetPx).middle;
    const line = lay.lines.find((l) => Math.abs(Math.hypot(l.x2 - middle.x, l.y2 - middle.y) - margin) < 1e-6);
    if (!line) continue;
    const bond = (Math.hypot(m.x - e1.x, m.y - e1.y) + Math.hypot(m.x - e2.x, m.y - e2.y)) / 2;
    const by = LINE_SEEN * bond - Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    const shift = (q: { x: number; y: number }) => ({ x: q.x + u.x * by, y: q.y + u.y * by });
    const own = new Set(ligand);
    for (const id of ligand) {
      const i = placed.get(id);
      if (i != null) change.atoms[i] = { ...change.atoms[i], ...shift(change.atoms[i]) };
    }
    for (const h of change.added ?? []) if (own.has(h.on)) Object.assign(h, shift(h));
    for (const e of change.eta ?? []) if (e.metal === metal && e.atoms.every((id) => own.has(id))) Object.assign(e, shift(e));
  }
}

/**
 * A bond from a label to a label at a terminal atom - O-3H, Mg-Br - drawn
 * long enough for the two to keep their margins: where they would take
 * more of it than their room (lib/chem/layout2d `labelTrims`, as drawing it
 * goes by), the terminal atom set out along it until they fit. The engine
 * lays out bonds of one length, knowing nothing of a style's labels; this is
 * Clean-up's, never done to a bond as drawn. Its way out stays as it was,
 * and so does what any centre says.
 */
function roomForLabels(part: Model, change: Relayout, style: DrawingStyle): void {
  // (none drawn out unless a label at a terminal atom has a label beside it: most structures have none)
  const opts = editorLayoutOptions(style, { minLinePx: 0 });
  const labelled = new Set(part.atoms.filter((a) => showsLabel({ el: a.el, ...chemistry(a) }, opts)).map((a) => a.id));
  const ends = degrees(part.bonds);
  if (!part.bonds.some((b) => labelled.has(b.a) && labelled.has(b.b) && (ends.get(b.a) === 1 || ends.get(b.b) === 1))) return;
  const after = relayout({ ...emptyWorkspaceDocument(), model: part, nextId: nextFree(part) }, change).model;
  const crowded = drawnAs(after, style).crowded;
  if (!crowded?.length) return;
  const degree = degrees(after.bonds);
  const at = new Map(after.atoms.map((a) => [a.id, a]));
  const placed = new Map(change.atoms.map((a, i) => [a.id, i]));
  for (const { atoms: [p, q], need } of crowded) {
    const end = degree.get(q) === 1 ? q : degree.get(p) === 1 ? p : null;
    const k = end != null ? placed.get(end) : undefined;
    if (end == null || k == null) continue;
    const from = at.get(end === q ? p : q)!;
    const to = at.get(end)!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-9 || need <= length) continue;
    // (a hair over, so that the two are seen to fit, not to share what is left)
    const s = (need * (1 + 1e-6)) / length;
    change.atoms[k] = { ...change.atoms[k], x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
  }
}

/** `m` laid out as the canvas draws it in `style`: its labels where they are drawn, and the bonds they crowd. */
function drawnAs(m: Model, style: DrawingStyle) {
  const atoms = m.atoms.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    el: a.el,
    ...chemistry(a),
    ...(a.z != null ? { z: a.z } : {}),
    ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}),
  }));
  const bonds = layoutBonds(m.bonds, new Map(m.atoms.map((a, i) => [a.id, i])));
  // (at the style's own size on the page, as a picture of it is made)
  return layoutMolecule(atoms, bonds, editorLayoutOptions(style, { minLinePx: 0 }), (style.bondLengthPt * 96) / 72 / NOMINAL_BOND_LENGTH);
}

/**
 * Whether `part`, changed as `change` has it, shows other stereochemistry
 * than it shows now (`stereoChange`), what the engine was asked to show by
 * `job` - the drawing's own, or a SMILES's given in its place - not
 * counted as gained.
 */
function stereoDiffers(part: Model, change: Relayout, job: LayoutJob): "changed" | "gained" | null {
  const doc = { ...emptyWorkspaceDocument(), model: part, nextId: nextFree(part) };
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  const cumulated = new Set((job.input.cumulated ?? []).map((x) => pair(job.ids[x.atoms[0]], job.ids[x.atoms[1]])));
  const axes = new Set((job.input.axes ?? []).map((ax) => pair(job.ids[ax.atoms[0]], job.ids[ax.atoms[1]])));
  return stereoChange(
    part,
    relayout(doc, change).model,
    {
      centres: new Set(job.input.atoms.flatMap((a, k) => (a.tetra ? [job.ids[k]] : []))),
      doubles: new Set([...job.input.bonds.flatMap((b) => (b.stereo ? [pair(job.ids[b.a], job.ids[b.b])] : [])), ...cumulated]),
      axes,
    },
    job.given || job.opened?.length ? { doubles: new Set([...(job.given ? cumulated : []), ...(job.opened ?? [])]), axes: job.given ? axes : new Set<string>() } : undefined,
  );
}

/**
 * Whether a drawing `after` shows the stereochemistry `was` shows - its
 * centres, double bonds and axes, by atom id - and none `was` does not
 * state (`stereoChange`).
 */
export function sameStereo(was: Model, after: Model): boolean {
  return stereoChange(was, after) === null;
}

/**
 * How a drawing `after` differs in stereochemistry from `was`, by atom id:
 * "changed" where a configuration `was` shows is lost or turned, "gained"
 * where `after` shows one `was` does not state - a centre, a double bond or
 * an axis drawn so that it says none (readStereo), and not in `asked` -
 * which would be the layout's choice, not the structure's; null where it
 * shows the same. Only where `was` is drawn: atoms not yet placed - all on
 * one point, a SMILES's before it is laid out - state nothing to keep.
 */
function stereoChange(was: Model, after: Model, asked?: { centres: Set<number>; doubles: Set<string>; axes: Set<string> }, given?: { doubles: Set<string>; axes: Set<string> }): "changed" | "gained" | null {
  const place = new Map(was.atoms.map((a) => [a.id, a]));
  const drawnApart = (...ids: number[]) => ids.some((id) => ids.some((other) => Math.hypot(place.get(id)!.x - place.get(other)!.x, place.get(id)!.y - place.get(other)!.y) > 1e-6));
  const before = stereoOf(was);
  const now = stereoOf(after);
  for (const [c, t] of before.centres) {
    const u = now.centres.get(c);
    if (!u || !sameConfiguration(t, u)) return "changed";
  }
  for (const [key, d] of before.doubles) {
    // (an odd cumulene's cis or trans the structure's own text gives: what its drawing said of it is not kept)
    if (given?.doubles.has(key)) continue;
    const e = now.doubles.get(key);
    // (read against the other group on an end, the reading turns)
    if (!e || (e.cis !== d.cis) !== ((e.refs[0] !== d.refs[0]) !== (e.refs[1] !== d.refs[1]))) return "changed";
  }
  for (const [key, sense] of before.axes) if (!given?.axes.has(key) && now.axes.get(key) !== sense) return "changed";
  const ends = (key: string) => key.split(",").map(Number).filter((id) => place.has(id));
  for (const [c, t] of now.centres) if (!before.centres.has(c) && !asked?.centres.has(c) && place.has(c) && drawnApart(c, ...t.neighbours.filter((n) => place.has(n)))) return "gained";
  for (const key of now.doubles.keys()) if (!before.doubles.has(key) && !asked?.doubles.has(key) && drawnApart(...ends(key))) return "gained";
  for (const key of now.axes.keys()) if (!before.axes.has(key) && !asked?.axes.has(key) && drawnApart(...ends(key))) return "gained";
  return null;
}

/**
 * The stereochemistry `m` shows, by atom id: an H drawn on its own on a
 * centre counted as the centre's H (-1), each double bond's groups given
 * from its lower id's end first, and each axis's sense taken against the
 * lowest-id neighbour at each end.
 */
function stereoOf(m: Model) {
  const d = drawingOf(m);
  const ids = m.atoms.map((a) => a.id);
  const { tetra, cisTrans, axes: drawnAxes, cumulated } = readStereo(d.atoms, d.bonds);
  const degree = degrees(m.bonds);
  const asId = (n: number) => (n === -1 || (m.atoms[n].el === "H" && degree.get(ids[n]) === 1) ? -1 : ids[n]);
  const centres = new Map<number, Tetrahedral>(
    [...tetra].map(([c, t]) => [ids[c], { neighbours: t.neighbours.map(asId), volume: t.volume }]),
  );
  const doubles = new Map<string, { refs: [number, number]; cis: boolean }>();
  for (const [k, ct] of cisTrans) {
    const b = d.bonds[k];
    const [a, z] = [ids[b.a], ids[b.b]];
    const refs: [number, number] = a < z ? [ids[ct.refs[0]], ids[ct.refs[1]]] : [ids[ct.refs[1]], ids[ct.refs[0]]];
    doubles.set(a < z ? `${a},${z}` : `${z},${a}`, { refs, cis: ct.cis });
  }
  // (an odd cumulene's as a double bond's, by its ends)
  for (const x of cumulated) {
    const [a, z] = [ids[x.atoms[0]], ids[x.atoms[1]]];
    const refs: [number, number] = a < z ? [ids[x.refs[0]], ids[x.refs[1]]] : [ids[x.refs[1]], ids[x.refs[0]]];
    doubles.set(a < z ? `${a},${z}` : `${z},${a}`, { refs, cis: x.cis });
  }
  // (an end's other neighbours: but the other end, a biaryl's, or the cumulated double bond it runs on through, an allene's)
  const bonded = (x: number, y: number) => d.bonds.some((b) => (b.a === x && b.b === y) || (b.a === y && b.b === x));
  const through = (x: number, end: number) => {
    if (bonded(x, end)) return end;
    const run = d.bonds.find((b) => b.order >= 2 && (b.a === x || b.b === x));
    return run ? (run.a === x ? run.b : run.a) : end;
  };
  const others = (x: number, end: number) => {
    const skip = through(x, end);
    return d.bonds.flatMap((b) => (b.a === x && b.b !== skip ? [b.b] : b.b === x && b.a !== skip ? [b.a] : []));
  };
  const lowest = (x: number, not: number) => others(x, not).reduce((p, q) => (ids[p] < ids[q] ? p : q));
  const axes = new Map<string, number>();
  for (const ax of drawnAxes) {
    const [i, j] = ax.atoms;
    // (against the other neighbour at an end, the sense turns)
    const sense = ax.sense * (ax.refs[0] === lowest(i, j) ? 1 : -1) * (ax.refs[1] === lowest(j, i) ? 1 : -1);
    axes.set(ids[i] < ids[j] ? `${ids[i]},${ids[j]}` : `${ids[j]},${ids[i]}`, sense);
  }
  return { centres, doubles, axes };
}

/** The first id no atom or bond of `model` has. */
export function nextFree(model: Model): number {
  return Math.max(0, greatest(model.atoms.map((a) => a.id)), greatest(model.bonds.map((b) => b.id))) + 1;
}

/**
 * `laid`, with each four- or six-bond metal's donors standing opposite each
 * other as they do in the drawing (`was`, in the job's order): where the
 * layout set them otherwise - like donors side by side, cisplatin for a
 * transplatin drawn, a cis-[CoCl2(NH3)4]+ for the trans - donors change
 * places, a pair at a time. Two donors of one atom each change places with
 * all they carry, turned about the metal (a turn: every wedge on them says
 * what it said); a chelate's two donors change places by mirroring the
 * chelate across the line between them, its wedges turned over with it, so
 * that each of its centres keeps its configuration (trans-Pt(gly)2). Which
 * stand opposite is the pairing nearest straight lines, however far from
 * straight the drawing is - a transplatin put down with its N-Pt-N at 145
 * degrees is trans still - and none where another pairing is about as
 * near (within 20 degrees all told): the drawing does not say it, and the
 * layout's stands. Kept: each pair drawn across plainly across, and with
 * six none drawn side by side; or six spokes drawn, laid out as two lines
 * and two side by side, where that picture reads only as the isomer drawn
 * (cis-[Co(en)2Cl2]+). Refused, saying so, where no move keeps it. Not at
 * a metal drawn in perspective, nor by mirroring a chelate drawn so, nor
 * where a change would need a donor of a larger chelate to move.
 */
/** How near, in bonds, two atoms of a metal's different donors may lie before the one's groups are turned clear (`oppositesKept`). */
const CROWDED = 0.75;

export function oppositesKept(was: readonly { x: number; y: number }[], input: LayoutInput, laid: Layout2D): Layout2D {
  const near = input.atoms.map(() => [] as number[]);
  for (const { a, b } of input.bonds) {
    near[a].push(b);
    near[b].push(a);
  }
  const x = [...laid.x];
  const y = [...laid.y];
  let hydrogens = laid.hydrogens;
  let wedges = laid.wedges;
  let changed = false;
  // (each metal whose donors changed places, with its donors and their units: to clear any two put side by side that now lie on
  // each other)
  const moved: { m: number; donors: number[]; units: Set<number>[] }[] = [];
  for (let m = 0; m < was.length; m++) {
    const donors = near[m];
    const n = donors.length;
    if (!isMetal(input.atoms[m].el) || (n !== 4 && n !== 6) || laid.depth[m] != null || donors.some((d) => d >= was.length)) continue;
    // (each donor's unit: what it carries, reached not through the metal - a chelate's, its donors' together)
    const reach = donors.map((d) => {
      const seen = new Set([d]);
      for (const todo = [d]; todo.length; ) {
        for (const v of near[todo.pop()!]) {
          if (v === m || seen.has(v)) continue;
          seen.add(v);
          todo.push(v);
        }
      }
      return seen;
    });
    const unit = donors.map((_, i) => donors.findIndex((e) => reach[i].has(e)));
    // (a unit drawn in perspective - a phosphine's phenyls turned - is turned about the metal as any is; mirrored, it would show
    // its other face, so a chelate drawn so is not)
    const inDepth = (i: number) => [...reach[i]].some((a) => laid.depth[a] != null);
    // (which stands opposite which, by the angles round the metal: each donor's partner in the pairing whose straightest pair is
    // straightest - then its next, and with six its last; none where another pairing is about as straight, pair by pair)
    const pairing = (px: readonly number[], py: readonly number[]): number[] | null => {
      if (donors.some((d) => Math.hypot(px[d] - px[m], py[d] - py[m]) < 1e-6)) return null;
      const angle = donors.map((d) => Math.atan2(py[d] - py[m], px[d] - px[m]));
      const off = (i: number, j: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(angle[i] - angle[j]), Math.cos(angle[i] - angle[j]))));
      const all: { partner: number[]; offs: number[] }[] = [];
      const pair = (left: number[], partner: number[], offs: number[]) => {
        if (!left.length) return void all.push({ partner: [...partner], offs: [...offs].sort((p, q) => p - q) });
        const [i, ...rest] = left;
        for (const j of rest) {
          partner[i] = j;
          partner[j] = i;
          pair(
            rest.filter((k) => k !== j),
            partner,
            [...offs, off(i, j)],
          );
        }
      };
      pair(
        donors.map((_, i) => i),
        donors.map(() => -1),
        [],
      );
      const before = (p: number[], q: number[]) => {
        for (let k = 0; k < p.length; k++) if (p[k] !== q[k]) return p[k] - q[k];
        return 0;
      };
      all.sort((p, q) => before(p.offs, q.offs));
      // (a tie - every pair of the next pairing within 20 degrees as straight as the best's - leaves the layout's pairing, saying
      // nothing: an isomer nobody gave, where the centre is surely square planar; there it is to be the cross marked "Which donors are
      // next to each other is not given", as a centre laid out with none given is)
      const told = all[0].offs.some((v, k) => all[1].offs[k] - v > (20 * Math.PI) / 180);
      return told ? all[0].partner : null;
    };
    const drawn = pairing(
      was.map((a) => a.x),
      was.map((a) => a.y),
    );
    if (!drawn) continue;
    const angleOf = (i: number) => Math.atan2(y[donors[i]] - y[m], x[donors[i]] - x[m]);
    const refused = () => new Error("the structure could not be laid out keeping its metal's donors opposite each other as drawn, so nothing was moved");
    const offOf = (p: number, q: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q))));
    // (what the drawing says: the pairs of its pairing drawn across - more than a right angle apart - and those drawn side by side, which
    // it says are not: a flat cis-[Co(en)2Cl2]+'s two Cl, 30 degrees apart)
    const drawnAngle = donors.map((d) => Math.atan2(was[d].y - was[m].y, was[d].x - was[m].x));
    const pairsOf = (partner: readonly number[]) => partner.flatMap((j, i) => (i < j ? [[i, j] as const] : []));
    const across = pairsOf(drawn).filter(([i, j]) => offOf(drawnAngle[i], drawnAngle[j]) < Math.PI / 2);
    // (with four, the two left are across wherever the other two are: only six can be drawn with two beside each other and still say it)
    const beside = n === 6 ? pairsOf(drawn).filter(([i, j]) => offOf(drawnAngle[i], drawnAngle[j]) >= Math.PI / 2) : [];
    // (the layout's places round the metal, in turn, and which stands plainly across which - within 30 degrees of a line - as laid out;
    // a place with none across, one of two set side by side, is loose)
    const slotOrder = donors.map((_, i) => i).sort((p, q) => angleOf(p) - angleOf(q));
    const slotAngle = slotOrder.map(angleOf);
    const slotOf = donors.map((_, i) => slotOrder.indexOf(i));
    const opposite = slotAngle.map((a, s) => {
      let t = -1;
      slotAngle.forEach((b, u) => {
        if (u !== s && offOf(a, b) < Math.PI / 6 && (t < 0 || offOf(a, b) < offOf(a, slotAngle[t]))) t = u;
      });
      return t;
    });
    const lines = opposite.flatMap((t, s) => (s < t && opposite[t] === s ? [[s, t] as const] : []));
    const loose = slotAngle.map((_, s) => s).filter((s) => !lines.some(([p, q]) => p === s || q === s));
    // (each donor's kind: what it is, read out from it through its unit, the metal left out - a chelate's two ends told apart where they
    // differ (glycinate's N and O), alike where they do not (ethylenediamine's two N))
    const kind = donors.map((d, i) => {
      const seen = new Map([[d, 0]]);
      const layers: string[][] = [[input.atoms[d].el]];
      for (let todo = [d], depth = 1; todo.length; depth++) {
        const next: number[] = [];
        for (const a of todo) {
          for (const v of near[a]) {
            if (v === m || seen.has(v) || !reach[i].has(v)) continue;
            seen.set(v, depth);
            next.push(v);
            (layers[depth] ??= []).push(input.atoms[v].el + (near[v].includes(m) ? "*" : ""));
          }
        }
        todo = next;
      }
      return layers.map((l) => [...l].sort().join(",")).join("/");
    });
    const pairKind = (p: number, q: number) => [kind[p], kind[q]].sort().join("|");
    const said = across.map(([i, j]) => pairKind(i, j)).sort().join(" ; ");
    // (a picture keeps the drawing where each pair drawn across stands plainly across in it, and none drawn side by side does;
    // or - six donors drawn as six spokes, the layout setting four of them as two lines and two side by side, as it lays out
    // cis-[Co(en)2Cl2]+ - where the picture can be read only as the isomer drawn: one of its two lines truly across, the ends of the
    // other each across one of the two side by side, read either way the same kinds across as the drawing (cis-[Co(en)2Cl2]+ drawn
    // with six spokes, laid out so, is cis; trans-M(gly)2Cl2's or an N-across-N cis-M(gly)2Cl2's picture so laid out would not say it)
    const keeps = (at: readonly number[]) => {
      const donorAt = new Array<number>(n);
      at.forEach((s, i) => (donorAt[s] = i));
      if (across.every(([i, j]) => opposite[at[i]] === at[j]) && beside.every(([i, j]) => opposite[at[i]] !== at[j])) return true;
      if (n !== 6 || across.length !== 3 || lines.length !== 2 || loose.length !== 2) return false;
      const [u, v] = loose.map((s) => donorAt[s]);
      return lines.every(([p, q], k) => {
        const [r, t] = lines[1 - k].map((s) => donorAt[s]);
        const one = [pairKind(donorAt[p], donorAt[q]), pairKind(u, r), pairKind(v, t)].sort().join(" ; ");
        const other = [pairKind(donorAt[p], donorAt[q]), pairKind(u, t), pairKind(v, r)].sort().join(" ; ");
        return one === said && other === said;
      });
    };
    // (each unit - a single donor with all it carries, or a chelate's - may be turned round the places, and a chelate of two mirrored,
    // for a picture that keeps the drawing; the fewest units moved, then the shortest turns. Where none does - trans-[Co(en)2Cl2]+,
    // the layout having no two places across for its Cl - nothing is laid out, saying so: never another isomer)
    const groups = [...new Set(unit)].map((u) => donors.map((_, i) => i).filter((i) => unit[i] === u));
    type Move = { turn: number; mirror: boolean };
    let best: { moves: Move[]; cost: number } | null = null;
    const choose = (g: number, moves: Move[], taken: Set<number>, at: number[]) => {
      if (g === groups.length) {
        if (!keeps(at)) return;
        const cost = moves.filter((v) => v.turn || v.mirror).length * 100 + moves.reduce((t, v) => t + Math.min(v.turn, n - v.turn), 0);
        if (!best || cost < best.cost) best = { moves: [...moves], cost };
        return;
      }
      const members = groups[g];
      const mirrors = members.length === 2 && !inDepth(members[0]) ? [false, true] : [false];
      for (const mirror of mirrors) {
        for (let turn = 0; turn < n; turn++) {
          const slots = members.map((i, k) => ((mirror ? slotOf[members[1 - k]] : slotOf[i]) + turn) % n);
          if (slots.some((t) => taken.has(t))) continue;
          const next = [...at];
          members.forEach((i, k) => (next[i] = slots[k]));
          choose(g + 1, [...moves, { turn, mirror }], new Set([...taken, ...slots]), next);
        }
      }
    };
    choose(0, [], new Set(), donors.map(() => -1));
    if (!best) throw refused();
    const chosen: Move[] = (best as { moves: Move[] }).moves;
    if (chosen.every((v) => !v.turn && !v.mirror)) continue;
    groups.forEach((members, g) => {
      const { turn, mirror } = chosen[g];
      if (!turn && !mirror) return;
      const atoms = new Set(members.flatMap((i) => [...reach[i]]));
      // (a chelate of two mirrored across the line between its donors, its wedges turned over: its two donors change places)
      if (mirror) {
        const a1 = angleOf(members[0]);
        const phi = a1 + Math.atan2(Math.sin(angleOf(members[1]) - a1), Math.cos(angleOf(members[1]) - a1)) / 2;
        const [c2, s2] = [Math.cos(2 * phi), Math.sin(2 * phi)];
        const mirrored = (px: number, py: number) => {
          const [vx, vy] = [px - x[m], py - y[m]];
          return { x: x[m] + vx * c2 + vy * s2, y: y[m] + vx * s2 - vy * c2 };
        };
        for (const a of atoms) ({ x: x[a], y: y[a] } = mirrored(x[a], y[a]));
        hydrogens = hydrogens.map((h) => (atoms.has(h.on) ? { ...h, at: mirrored(h.at.x, h.at.y) } : h));
        wedges = wedges.map((w) => (atoms.has(w.from) ? { ...w, stereo: w.stereo === "up" ? "down" : "up" } : w));
      }
      // (then the unit turned about the metal, its first donor onto its place: a turn, so every wedge on it says what it said)
      const first = members[0];
      const target = ((mirror ? slotOf[members[1]] : slotOf[first]) + turn) % n;
      const t = slotAngle[target] - angleOf(first);
      const turned = (px: number, py: number) => ({
        x: x[m] + (px - x[m]) * Math.cos(t) - (py - y[m]) * Math.sin(t),
        y: y[m] + (px - x[m]) * Math.sin(t) + (py - y[m]) * Math.cos(t),
      });
      for (const a of atoms) ({ x: x[a], y: y[a] } = turned(x[a], y[a]));
      hydrogens = hydrogens.map((h) => (atoms.has(h.on) ? { ...h, at: turned(h.at.x, h.at.y) } : h));
    });
    const before: boolean = changed;
    changed = true;
    if (changed) moved.push({ m, donors, units: reach });
    changed ||= before;
  }
  if (!changed) return laid;
  // (donors put side by side that were not - two phosphines' rings, cis-PtCl2(PCy3)2 - can lie on each other: each single donor's
  // groups turned about it, its bond to the metal as it is, up to 60 degrees either way, to where they are clearest of the others)
  for (const { m, donors, units } of moved) {
    const room = (u: number) => {
      let r = Infinity;
      for (const a of units[u]) for (let v = 0; v < units.length; v++) if (v !== u) for (const b of units[v]) r = Math.min(r, Math.hypot(x[a] - x[b], y[a] - y[b]));
      for (const a of units[u]) if (a !== donors[u]) r = Math.min(r, Math.hypot(x[a] - x[m], y[a] - y[m]));
      return r;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let u = 0; u < donors.length; u++) {
        const d = donors[u];
        if (units[u].size < 2 || donors.some((e, v) => v !== u && units[u].has(e)) || room(u) >= CROWDED) continue;
        const group = [...units[u]].filter((a) => a !== d);
        const home = group.map((a) => ({ x: x[a], y: y[a] }));
        const turn = (t: number) =>
          group.forEach((a, k) => {
            const [vx, vy] = [home[k].x - x[d], home[k].y - y[d]];
            x[a] = x[d] + vx * Math.cos(t) - vy * Math.sin(t);
            y[a] = y[d] + vx * Math.sin(t) + vy * Math.cos(t);
          });
        let best = { t: 0, r: room(u) };
        for (let deg = 10; deg <= 60; deg += 10) {
          for (const t of [(deg * Math.PI) / 180, (-deg * Math.PI) / 180]) {
            turn(t);
            const r = room(u);
            if (r > best.r + 1e-9) best = { t, r };
          }
        }
        turn(best.t);
        if (best.t) {
          const inGroup = new Set(group);
          // (an H turned with its atom, the same turn about the donor)
          hydrogens = hydrogens.map((h) => {
            if (!inGroup.has(h.on)) return h;
            const [vx, vy] = [h.at.x - x[d], h.at.y - y[d]];
            return { ...h, at: { x: x[d] + vx * Math.cos(best.t) - vy * Math.sin(best.t), y: y[d] + vx * Math.sin(best.t) + vy * Math.cos(best.t) } };
          });
        }
      }
    }
  }
  return { ...laid, x, y, hydrogens, wedges };
}
