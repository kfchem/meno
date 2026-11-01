/**
 * A drawn structure made in 3D: its conformers, by the plugin that fills
 * that role (RDKit's: ETKDG, then MMFF94), set on the page as a molecule in
 * 3D that rises out of the drawing - laid over it at first, turned to match
 * it - and comes to rest beside it, tied to it atom by atom
 * (docs/WORKSPACE.md, stage 2).
 */
import { placesOf } from "../utils/edit3d";
import * as THREE from "three";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Style3D } from "../../../../lib/chem/style3d";
import type { DrawingStyle } from "../../../../lib/chem/style";
import type { ChemClient, Conformers, Like } from "../../../../lib/roles/client";
import type { OptionValues } from "../../../../lib/options";
import { conformersSoughtOf, RING_CONFORMERS, soughtNumber } from "../../../../lib/chem/conformersSought";
import type { ChemistrySettings } from "../../../../lib/settings/appSettings";
import { chemMolblock, isElementSymbol, molIndex } from "../../../../lib/roles/molblock";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { COORDINATION_BOND } from "../../../../lib/chem/molecule";
import { abbreviationOf } from "../../../../lib/chem/abbreviations";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { skeletonWhy } from "../../../../lib/chem/skeleton";
import { isSkeleton } from "../utils/completeness";
import { editorModelOf, processFileContent } from "../utils/io";
import type { Arrow, Model, Molecule3D, Plus, Turn3D } from "../store/types";
import { turnOnto } from "../utils/align3d";
import { signatureOf } from "../utils/drawnLink";
import { groupShape } from "../utils/groupShape";
import { bondsAt, lookOf, solidOf } from "../utils/molecule3d";
import { fragmentsHolding, laidOut, partOf } from "./cleanUp";
import { undrawnHydrogens } from "./drawing";
import { greatest, least } from "../../../../lib/chem/lists";
import { drawnBox } from "../../../../utils/importers";
import { etaBound } from "./etaBound";
import { factor } from "../../../../lib/units";
import { shownConformers } from "./shownConformers";

export { linkOf, signatureOf } from "../utils/drawnLink";

/**
 * How long a structure's conformers may take: a large one's, on a slow machine, minutes. Fifteen of them
 * since 2026-10-20, when how many are sought became the molecule's to say: a ciclosporin took 2.5 minutes
 * here and a vancomycin 2.4, which on a machine half as quick is past the five minutes this allowed before.
 * The chemist need not wait it out - Stop, while a 3D structure is being made, stops the plugin's worker
 * and lets the question go at once.
 */
export const CONFORMERS_MS = 15 * 60_000;
/** The room between a drawing and the molecule in 3D that rises out of it, and between molecules. */
const GAP = 1.5 * NOMINAL_BOND_LENGTH;

/**
 * A structure as the plugin is asked about it, and which of the drawing's
 * atoms and bonds each of the block's is; made again, where the one made
 * before has its atoms (`likeOf`).
 */
export type Block = {
  molblock: string;
  atoms: number[];
  bonds: number[];
  part: Model;
  like?: Like;
  /** Its bonds from a metal to a star at a ring's, chain's or double bond's centre, by atom place in the block as written: the metal and the atoms (`centresIn`). */
  centres?: { metal: number; atoms: number[] }[];
  /** Its coordination bonds - drawn as a dative arrow or as a coordination bond, a donor's to its metal - by place among its bonds as written, each written from the atom that lends its pair. */
  coordination?: number[];
};

/**
 * Whether the drawing still holds each block as it was when its 3D
 * structure was asked for: its atoms there, as they were, and the bonds
 * among them. Making one takes a while - and a question about its
 * stereochemistry may wait - and an undo meanwhile left a molecule of a
 * structure no longer drawn, tied to atoms gone, the undone step past
 * redoing. Edits elsewhere on the page do not count.
 */
export function blocksStill(blocks: readonly Block[], model: Model): boolean {
  return blocks.every((b) => groupShape(b.part, b.atoms) === groupShape(model, b.atoms));
}

/**
 * Whether a structure stands for a molecule to make in 3D: any with a bond;
 * and a lone atom that stands for more than itself (the maintainer,
 * 2026-10-13) - an element with the H it carries (C is CH4, O H2O, N NH3),
 * or a label Meno knows, written out as what it stands for (THF, DMSO,
 * MeOH, Et3N). A bare atom - Na+, Cl-, a lone metal, a label of nothing
 * known - is no molecule to make.
 */
export function standsForMolecule(part: Model): boolean {
  if (part.bonds.length > 0) return true;
  if (part.atoms.length !== 1) return false;
  const [a] = part.atoms;
  if (a.abbrev || !isElementSymbol(a.el)) return !!(a.abbrev || abbreviationOf(a.el));
  return (undrawnHydrogens(part).get(a.id) ?? 0) > 0;
}

/** The bare atoms among the structures that hold these atoms: left out of a 3D structure, one atom alone having none. */
export function bareAtomsOf(model: Model, atoms: Iterable<number>): Model["atoms"] {
  return fragmentsHolding(model, atoms)
    .map((ids) => partOf(model, ids))
    .filter((part) => !standsForMolecule(part))
    .map((part) => part.atoms[0]);
}

/** A bare atom as the chemist is told of it: its label and its charge - Na+, Cl−, Ca2+. */
function nameOf(a: Model["atoms"][number]): string {
  const q = a.charge ?? 0;
  return a.el + (q ? `${Math.abs(q) > 1 ? Math.abs(q) : ""}${q > 0 ? "+" : "\u2212"}` : "");
}

/**
 * What the chemist is told of the bare atoms left out of a 3D structure:
 * that one atom alone has none - by itself, where it was all there was;
 * else named, as counter-ions left out of a salt made in 3D.
 */
export function bareWords(bare: Model["atoms"], madeAny: boolean): string {
  if (!madeAny) return "One atom alone has no 3D structure.";
  return `${bareNames(bare)} ${bare.length > 1 ? "were" : "was"} left out: one atom alone has no 3D structure.`;
}

/** Bare atoms named, in a list: "Na+", "Na+ and Cl−", "Na+, Cl− and Ca2+". */
export function bareNames(bare: Model["atoms"]): string {
  const names = bare.map(nameOf);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/**
 * Whether a part is one a step on structures drawn is asked about, as it is
 * drawn: any that stands for a molecule (`standsForMolecule`), and a lone
 * atom of an element besides - Na+, Cl-, a lone metal, which has no 3D
 * structure but is part of what was drawn: a salt's counter-ion one of its
 * parts, counted in its weight. A label of nothing known alone has no
 * element to give.
 */
export function asDrawn(part: Model): boolean {
  if (standsForMolecule(part)) return true;
  const [a] = part.atoms;
  return part.atoms.length === 1 && !a.abbrev && isElementSymbol(a.el);
}

/** The structures that hold these atoms, each as the plugin is asked about it; a bare atom's none (`standsForMolecule`). */
export function blocksOf(model: Model, atoms: Iterable<number>, keep: (part: Model) => boolean = standsForMolecule): Block[] {
  return fragmentsHolding(model, atoms)
    .map((ids) => partOf(model, ids))
    .filter(keep)
    .map((part) => {
      // (a ring or chain bound to a metal through all its atoms, as one multi-centre bond: etaBound. A bare atom - Na+, a
      //  lone metal - as Meno counts it, with no hydrogens, which a reader would add to a lone Na: its valence written,
      //  none, where the drawing sets none of its own)
      const bare = !standsForMolecule(part);
      const asked = etaBound(bare ? { ...part, atoms: part.atoms.map((a) => ({ ...a, valence: a.valence ?? 0 })) } : part);
      const index = molIndex(asked);
      const molblock = chemMolblock(asked);
      const centres = centresIn(molblock);
      // (a dative arrow or a coordination bond between two atoms - not a multi-centre bond's to its star, which is none of the molecule's bonds)
      const coordination = index.bonds.flatMap((b, i) => ((b.dative || b.coordination) && !b.endpoints?.length ? [i] : []));
      return {
        ...(centres.length ? { centres } : {}),
        ...(coordination.length ? { coordination } : {}),
        molblock,
        // (the drawing's own atoms: the stars etaBound adds come after them, and are no atoms of the drawing)
        atoms: part.atoms.map((a) => a.id),
        bonds: index.bonds.map((b) => b.id),
        part,
      };
    });
}

/** The parts of a structure drawn, as a step on structures drawn is asked about them (`asDrawn`): a bare atom's too. */
export function drawnBlocksOf(model: Model, atoms: Iterable<number>): Block[] {
  return blocksOf(model, atoms, asDrawn);
}

/** What a structure leaves open: its stereocentres and double bonds drawn without a configuration, by id, and how many stereoisomers they make. */
export type Open = { atoms: number[]; bonds: number[]; isomers: number };

/** What `open_stereo` answers for `block`, in the drawing's ids. */
export function openIn(block: Block, answer: { atoms: number[]; bonds: number[]; isomers: number }): Open {
  return {
    atoms: answer.atoms.map((i) => block.atoms[i]).filter((id) => id != null),
    bonds: answer.bonds.map((i) => block.bonds[i]).filter((id) => id != null),
    isomers: answer.isomers,
  };
}

/**
 * A stereoisomer's conformers as a molecule in 3D: the lowest's coordinates
 * as its atoms, the rest as its frames, their energies; and the drawing's
 * atom each of its atoms is - none for a hydrogen made for it, or an atom
 * written out of an abbreviation. Made with others (`several`: all the
 * stereoisomers a drawing leaves open), it says which of its centres were
 * left open, for their R and S to tell it from the others; made alone, R and
 * S show only where they are asked for, as on the drawing.
 */
export function moleculeOf(c: Conformers, block: Block, several = false): Omit<Molecule3D, "id" | "at"> {
  // (a multi-centre bond's star, at its ring's centre, is no atom: left out, the rest numbered on - etaBound)
  const stars = new Set(c.stars ?? []);
  const kept = c.atoms.flatMap((_, i) => (stars.has(i) ? [] : [i]));
  const atomAt = new Map(kept.map((i, k) => [i, k]));
  const bondsKept = c.bonds.flatMap((b, i) => (atomAt.has(b.a1) && atomAt.has(b.a2) ? [i] : []));
  const bondAt = new Map(bondsKept.map((i, k) => [i, k]));
  const places = (f: number[]) => kept.flatMap((i) => [f[3 * i] ?? 0, f[3 * i + 1] ?? 0, f[3 * i + 2] ?? 0]);
  const first = places(c.frames[0] ?? []);
  const renumbered = (r: Record<string, string> | undefined, at: Map<number, number>) =>
    Object.fromEntries(Object.entries(r ?? {}).flatMap(([k, v]) => (at.has(Number(k)) ? [[String(at.get(Number(k))), v]] : [])));
  const chosen = { atoms: renumbered(c.chosen.atoms, atomAt), bonds: renumbered(c.chosen.bonds, bondAt) };
  // (its energies the force field's the plugin named - none where it used none)
  const energiesFrom = c.energies?.length && c.field && c.field !== "none" ? c.field : undefined;
  return {
    atoms: kept.map((i, k) => {
      const a = c.atoms[i];
      return {
        el: a.el,
        ...(a.charge ? { charge: a.charge } : {}),
        // (a radical as drawn: the plugin's answer says none, and a triplet is no singlet)
        ...(i < block.part.atoms.length && block.part.atoms[i].radical ? { radical: block.part.atoms[i].radical } : {}),
        x: first[3 * k],
        y: first[3 * k + 1],
        z: first[3 * k + 2],
      };
    }),
    // (a coordination bond as drawn: the CTfile's type, from the atom that lends its pair - the plugin's answer says single)
    bonds: bondsKept.map((i) => {
      const [a1, a2] = [atomAt.get(c.bonds[i].a1)!, atomAt.get(c.bonds[i].a2)!];
      return block.coordination?.includes(i) ? { a1, a2, order: COORDINATION_BOND } : { a1, a2, order: c.bonds[i].order };
    }),
    // (each multi-centre bond one stick from the metal to its atoms' centre, the star no atom: utils/molecule3d withCentres)
    ...centresOf(block, atomAt),
    ...(c.frames.length > 1 ? { frames: c.frames.slice(1).map(places) } : {}),
    energies: c.energies,
    drawnFrom: kept.map((i) => (i < block.part.atoms.length ? block.atoms[i] : null)),
    drawnAs: signatureOf(block.part, block.atoms),
    conformerSet: true,
    // (made from a drawing shown magnified: shown as large - docs/WORKSPACE.md, *Magnified display*)
    ...(block.part.atoms[0]?.magnified != null && block.part.atoms[0].magnified !== 1 ? { magnified: block.part.atoms[0].magnified } : {}),
    ...(c.how?.length || c.method || energiesFrom ? { made: { ...(c.method ? { method: c.method } : {}), how: c.how ?? [], ...(energiesFrom ? { energies: energiesFrom } : {}) } } : {}),
    stereo: {
      atoms: numbered(renumbered(c.cip?.atoms, atomAt)),
      bonds: numbered(renumbered(c.cip?.bonds, bondAt)),
      ...(several && (Object.keys(chosen.atoms).length || Object.keys(chosen.bonds).length)
        ? { chosen: { atoms: Object.keys(chosen.atoms).map(Number), bonds: Object.keys(chosen.bonds).map(Number) } }
        : {}),
    },
  };
}

/**
 * The multi-centre bonds of a block as it is written (`molblock`), each
 * its metal and the atoms it binds, by their place in the block - which is
 * their place in the plugin's answer: a ring drawn bound by one bond, and
 * one written out of a label (Cp on a metal, Cp2ZrCl2) alike.
 */
export function centresIn(molblock: string): { metal: number; atoms: number[] }[] {
  const ct = readMolfile(molblock);
  if (!ct) return [];
  return ct.bonds.flatMap((b) => {
    if (!b.endpoints?.length || b.attach === "any") return [];
    const metal = ct.atoms[b.a1]?.symbol === "*" ? b.a2 : b.a1;
    return b.endpoints.length >= 2 && !b.endpoints.includes(metal) ? [{ metal, atoms: [...b.endpoints] }] : [];
  });
}

/** A block's bonds to centres, by the molecule in 3D's atom index (`at`): those whose atoms it keeps. */
function centresOf(block: Block, at: Map<number, number>): Pick<Molecule3D, "centres"> {
  const centres = (block.centres ?? []).flatMap((c) =>
    at.has(c.metal) && c.atoms.every((i) => at.has(i)) ? [{ metal: at.get(c.metal)!, atoms: c.atoms.map((i) => at.get(i)!) }] : [],
  );
  return centres.length ? { centres } : {};
}

const numbered = (r: Record<string, string> | undefined): Record<number, string> =>
  Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [Number(k), v]));

/** A box on the page: from x0 to x1 across, y0 to y1 up. */
export type Box = { x0: number; x1: number; y0: number; y1: number };

/**
 * A molecule in 3D made from a drawing, turned to lie as near as it can over
 * the drawing's atoms: the turn, where its centre then is - over the drawing,
 * where it starts to rise - and how far it reaches from its centre, so
 * turned, across and up. And where each of its atoms starts, about that
 * centre, unturned: on its drawing's atom, flat on the page - a hydrogen made
 * for it on the atom it is bonded to - so that it rises out of the drawing.
 */
export type Turned = { turn: Turn3D; start: { x: number; y: number }; reach: Box; flat: number[]; height: number };

export function turnedOver(m: Omit<Molecule3D, "id" | "at">, model: Model, style: Style3D): Turned {
  const solid = solidOf({ ...m, id: 0, at: { x: 0, y: 0 } }, style);
  const places = solid.frames[0];
  const radii = solid.radii[lookOf(m)];
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const from: number[] = [];
  const to: number[] = [];
  (m.drawnFrom ?? []).forEach((id, i) => {
    const a = id == null ? undefined : byId.get(id);
    if (!a) return;
    from.push(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
    to.push(a.x, a.y);
  });
  const turn = turnOnto(from, to);
  const q = new THREE.Quaternion(...turn);
  const v = new THREE.Vector3();
  // over the drawing: the centre that lays its tied atoms' middle on theirs
  let mx = 0, my = 0, dx = 0, dy = 0;
  const k = from.length / 3;
  for (let i = 0; i < k; i++) {
    v.set(from[3 * i], from[3 * i + 1], from[3 * i + 2]).applyQuaternion(q);
    mx += v.x;
    my += v.y;
    dx += to[2 * i];
    dy += to[2 * i + 1];
  }
  const start = k ? { x: (dx - mx) / k, y: (dy - my) / k } : { x: 0, y: 0 };
  // each atom where it starts: its drawing's atom, on the page, turned back
  const back = q.clone().invert();
  const flat = Array.from(places);
  const onDrawing = new Set<number>();
  (m.drawnFrom ?? []).forEach((id, i) => {
    const a = id == null ? undefined : byId.get(id);
    if (!a) return;
    v.set(a.x - start.x, a.y - start.y, 0).applyQuaternion(back);
    flat.splice(3 * i, 3, v.x, v.y, v.z);
    onDrawing.add(i);
  });
  for (const b of m.bonds) {
    const [from, to] = onDrawing.has(b.a1) && !onDrawing.has(b.a2) ? [b.a1, b.a2] : onDrawing.has(b.a2) && !onDrawing.has(b.a1) ? [b.a2, b.a1] : [-1, -1];
    if (from < 0 || m.atoms[to].el !== "H") continue;
    flat.splice(3 * to, 3, flat[3 * from], flat[3 * from + 1], flat[3 * from + 2]);
  }
  const reach: Box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let i = 0; i < radii.length; i++) {
    v.set(places[3 * i], places[3 * i + 1], places[3 * i + 2]).applyQuaternion(q);
    reach.x0 = Math.min(reach.x0, v.x - radii[i]);
    reach.x1 = Math.max(reach.x1, v.x + radii[i]);
    reach.y0 = Math.min(reach.y0, v.y - radii[i]);
    reach.y1 = Math.max(reach.y1, v.y + radii[i]);
  }
  return { turn, start, reach, flat, height: solid.reach[lookOf(m)] };
}

/**
 * Where a drawn structure is on the page: its ink's box - its bonds and its
 * labels' letters (OH hangs right of its O), not only its atoms' centres
 * (utils/importers `drawnBox`) - with no room round it: what keeps clear of
 * it adds its own (docs/LOOK.md, *Room*).
 */
export function boxOf(part: Model): Box {
  if (!part.atoms.length) return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const b = drawnBox(part);
  return { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY };
}

const inside = (b: Box, view: Box) => b.x0 >= view.x0 && b.x1 <= view.x1 && b.y0 >= view.y0 && b.y1 <= view.y1;

/**
 * How a box on the page is seen when what is in it stands `height` above the
 * page - as high again at its top: as it is, by an orthographic camera (the
 * canvas's); by one in perspective `eyeHeight` over the view's middle,
 * larger, and further out from the middle.
 */
function seenAs(b: Box, view: Box, height: number, eyeHeight?: number): Box {
  if (eyeHeight == null) return b;
  const cx = (view.x0 + view.x1) / 2;
  const cy = (view.y0 + view.y1) / 2;
  const k = eyeHeight / Math.max(eyeHeight - 2 * height, 1);
  return { x0: cx + (b.x0 - cx) * k, x1: cx + (b.x1 - cx) * k, y0: cy + (b.y0 - cy) * k, y1: cy + (b.y1 - cy) * k };
}

/**
 * Where molecules in 3D made from a drawing come to rest: in a row beside
 * it - to its right, its left, below it or above it - clear of what stands
 * on the page already (`taken`: other drawings, arrows and "+" signs, other
 * molecules in 3D), the row going on out past any of it in its way; the
 * first of those sides where the whole row is in view, as the camera sees
 * it (`eyeHeight`, for one in perspective) - and whether it is, and where
 * the row then stands. In none, to its right.
 */
export function placeRow(
  items: Turned[],
  drawing: Box,
  view: Box | null,
  eyeHeight?: number,
  taken: readonly Box[] = [],
): { at: { x: number; y: number }[]; inView: boolean; box: Box } {
  const cx = (drawing.x0 + drawing.x1) / 2;
  const cy = (drawing.y0 + drawing.y1) / 2;
  const across = items.reduce((a, t) => a + t.reach.x1 - t.reach.x0, 0) + GAP * Math.max(0, items.length - 1);
  const tall = Math.max(...items.map((t) => t.reach.y1 - t.reach.y0));
  type Row = { at: { x: number; y: number }[]; box: Box };
  // each side: the row that far (`out`) beyond where it starts, and how
  // much further out it would have to go to clear a box in its way
  const sides: { row: (out: number) => Row; past: (row: Box, b: Box) => number }[] = [
    // right: from the drawing's right edge on, level with it
    {
      row: (out) => {
        let x = drawing.x1 + GAP + out;
        const at = items.map((t) => {
          const p = { x: x - t.reach.x0, y: cy };
          x = p.x + t.reach.x1 + GAP;
          return p;
        });
        return { at, box: { x0: drawing.x1 + GAP + out, x1: x - GAP, y0: cy - tall / 2, y1: cy + tall / 2 } };
      },
      past: (row, b) => b.x1 + GAP - row.x0,
    },
    // left: from its left edge back
    {
      row: (out) => {
        let x = drawing.x0 - GAP - out;
        const at = items.map((t) => {
          const p = { x: x - t.reach.x1, y: cy };
          x = p.x + t.reach.x0 - GAP;
          return p;
        });
        return { at, box: { x0: x + GAP, x1: drawing.x0 - GAP - out, y0: cy - tall / 2, y1: cy + tall / 2 } };
      },
      past: (row, b) => row.x1 - (b.x0 - GAP),
    },
    // below, and above: a row under it or over it, centred on it
    ...[-1, 1].map((side) => ({
      row: (out: number) => {
        let x = cx - across / 2;
        const edge = side < 0 ? drawing.y0 - GAP - out : drawing.y1 + GAP + out;
        const at = items.map((t) => {
          const p = { x: x - t.reach.x0, y: side < 0 ? edge - t.reach.y1 : edge - t.reach.y0 };
          x = p.x + t.reach.x1 + GAP;
          return p;
        });
        const y0 = side < 0 ? edge - tall : edge;
        return { at, box: { x0: cx - across / 2, x1: cx + across / 2, y0, y1: y0 + tall } };
      },
      past: (row: Box, b: Box) => (side < 0 ? row.y1 - (b.y0 - GAP) : b.y1 + GAP - row.y0),
    })),
  ];
  // (a side's row, gone on out past whatever is in its way)
  const clear = (side: (typeof sides)[number]): Row => {
    let out = 0;
    for (let tries = 0; tries <= taken.length; tries++) {
      const row = side.row(out);
      const hit = taken.filter((b) => overlaps(b, row.box));
      if (!hit.length) return row;
      out += Math.max(...hit.map((b) => side.past(row.box, b)));
    }
    return side.row(out);
  };
  const height = Math.max(...items.map((t) => t.height));
  const rows = sides.map(clear);
  for (const row of rows) {
    if (view && inside(seenAs(row.box, view, height, eyeHeight), view)) return { ...row, inView: true };
  }
  return { ...rows[0], inView: !view };
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * What stands on the page besides the drawing `except` - each other
 * structure drawn, each arrow and "+" sign - as boxes, for molecules in 3D
 * made from it to keep clear of; the molecules in 3D already there, seen
 * from above, the caller gives (`solids`).
 */
export function takenOnPage(
  page: { model: Model; arrows: readonly Arrow[]; pluses: readonly Plus[] },
  except: Iterable<number>,
  solids: readonly Box[] = [],
): Box[] {
  const skip = new Set(except);
  const around = new Map<number, number[]>();
  const bondsOn = new Map<number, Model["bonds"]>();
  for (const b of page.model.bonds) {
    around.set(b.a, [...(around.get(b.a) ?? []), b.b]);
    around.set(b.b, [...(around.get(b.b) ?? []), b.a]);
    for (const id of [b.a, b.b]) bondsOn.set(id, [...(bondsOn.get(id) ?? []), b]);
  }
  const byId = new Map(page.model.atoms.map((a) => [a.id, a]));
  const seen = new Set<number>();
  const boxes: Box[] = [];
  for (const a of page.model.atoms) {
    if (skip.has(a.id) || seen.has(a.id)) continue;
    // (one structure: its atoms, as its bonds join them)
    const part: Model["atoms"] = [];
    const todo = [a.id];
    seen.add(a.id);
    while (todo.length) {
      const id = todo.pop()!;
      part.push(byId.get(id)!);
      for (const n of around.get(id) ?? []) {
        if (seen.has(n) || skip.has(n) || !byId.has(n)) continue;
        seen.add(n);
        todo.push(n);
      }
    }
    // (with its bonds, which decide where its labels' letters go)
    boxes.push(boxOf({ atoms: part, bonds: [...new Set(part.flatMap((x) => bondsOn.get(x.id) ?? []))] }));
  }
  const pad = 0.4 * NOMINAL_BOND_LENGTH;
  for (const r of page.arrows) {
    // (its ends and the corners it turns at)
    const pts = arrowPoints(r);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    boxes.push({ x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad });
  }
  for (const p of page.pluses) boxes.push({ x0: p.x - 2 * pad, x1: p.x + 2 * pad, y0: p.y - 2 * pad, y1: p.y + 2 * pad });
  return [...boxes, ...solids];
}

/** A row of molecules in 3D starting where `at` is - where one made again stood - each after the last. */
export function rowFrom(items: Turned[], at: { x: number; y: number }): { x: number; y: number }[] {
  let x = at.x;
  return items.map((t, i) => {
    if (i > 0) x += items[i - 1].reach.x1 + GAP - t.reach.x0;
    return { x, y: at.y };
  });
}

/**
 * How many conformers the page tries of a block, as Settings has it
 * (*Conformers sought*): the chemist's number, or as many as the molecule
 * needs (lib/chem/conformersSought) - null where the block cannot be read.
 */
export function pageCount(block: Pick<Block, "molblock">, chosen: Pick<ChemistrySettings, "sought3d" | "count3d">): number | null {
  return soughtNumber({ sought: chosen.sought3d ?? "needed", count: chosen.count3d ?? RING_CONFORMERS }, () => conformersSoughtOf(block.molblock));
}

/**
 * Each stereoisomer asked for, its conformers made for the page - `count`
 * tried (`pageCount`), with the options the plugin takes for the role, as
 * chosen in Settings - as the page shows them: lowest first, each once,
 * laid over the first, alike atoms in like places (`asThePageShows`, in a
 * worker of its own: `shownConformers`). `onPage` asks the plugin to make
 * one of two enantiomers as the other's mirror image (docs/PLUGINS.md); a
 * workflow's *Conformers* step never sends it, and is given the program's
 * own.
 */
export async function conformersOf(chem: ChemClient, block: Block, isomers: "one" | "all", options: OptionValues = {}, count: number | null = null): Promise<Conformers[]> {
  const like = block.like ? { like: block.like } : {};
  const tries = count != null ? { count } : {};
  return shownConformers((await chem.request("conformers", { molblock: block.molblock, isomers, ...like, ...tries, options, onPage: true }, CONFORMERS_MS)).isomers);
}

const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

/**
 * A stereoisomer's conformers kept within `kcal` (kcal/mol) of the lowest,
 * as the canvas's 3D structure keeps them (docs/WORKSPACE.md, *Conformers
 * kept*); the rest set aside, and the window said with how they were made.
 * A force field can trap a ring in a minimum far above the rest - the
 * MMFF94 search of cyclooctane finds two some 66 and 77 kcal/mol up - which
 * nobody drawing a structure asks for. A workflow's conformer step keeps
 * every one: only an *Energy window* step sets any aside there. Without
 * energies none is set aside, and that is said.
 */
export function withinWindow(c: Conformers, kcal: number): Conformers {
  const energies = c.energies?.length === c.frames.length ? c.energies : undefined;
  const finite = energies?.filter(Number.isFinite) ?? [];
  if (!energies || !finite.length) return { ...c, how: [...(c.how ?? []), { label: "Energy window", text: "none: no energies" }] };
  const lowest = least(finite);
  const keep = energies.map((e) => !Number.isFinite(e) || (e - lowest) * KCAL_PER_HARTREE <= kcal + 1e-9);
  const aside = keep.filter((k) => !k).length;
  const said = { label: "Energy window", text: `within ${kcal} kcal/mol of the lowest${aside ? `, ${aside} above it set aside` : ""}` };
  return { ...c, frames: c.frames.filter((_, i) => keep[i]), energies: energies.filter((_, i) => keep[i]), how: [...(c.how ?? []), said] };
}

/**
 * Where a molecule in 3D made before from the drawing has the block's atoms,
 * by their index in the block: for it to be made again as it was where the
 * drawing leaves its configuration open.
 */
export function likeOf(block: Block, before: Pick<Molecule3D, "atoms" | "drawnFrom">): Like {
  const index = new Map<number, number>();
  before.drawnFrom?.forEach((id, i) => {
    if (id != null) index.set(id, i);
  });
  const like: Like = {};
  block.atoms.forEach((id, k) => {
    const a = before.atoms[index.get(id) ?? -1];
    if (a) like[k] = [a.x, a.y, a.z];
  });
  return like;
}

/**
 * A molecule in 3D drawn as a formula, by Meno's own engine (as a SMILES is):
 * the frame it shows, its heavy atoms, wedged as it is in 3D - its bonds'
 * orders found where it has none (all single, as a file of coordinates
 * gives them) - laid out in the style of the drawing it goes into, where
 * one is given. And which of the formula's atoms each of its atoms is: none
 * for a hydrogen; and whether its orders, wanted, are still unknown - not
 * found, and so drawn single. A skeleton - its hydrogens not there - is not
 * drawn: a formula says how every atom is protonated, and a skeleton does
 * not (lib/chem/skeleton).
 */
export async function formulaOf(chem: ChemClient, m: Molecule3D, frame: number, style?: DrawingStyle): Promise<{ model: Model; link: (number | null)[]; ordersUnknown: boolean }> {
  const { drawn, ordersUnknown } = await drawnOf(chem, m, frame);
  const model = await laidOut(drawn, style).catch(() => drawn);
  // (its heavy atoms came back in their order)
  let k = 0;
  const link = m.atoms.map((a) => (a.el === "H" ? null : (drawn.atoms[k++]?.id ?? null)));
  return { model, link, ordersUnknown };
}

/**
 * A molecule in 3D as the drawing `formulaOf` lays out: the frame it is
 * given, its heavy atoms in their order, wedged as it is in 3D, its bonds'
 * orders found where it has none - not yet laid out by Meno's engine - and
 * whether its orders, wanted, are still unknown. A skeleton - its hydrogens
 * not there - is refused here, for every caller: a drawing says how each
 * atom is protonated, and a skeleton does not (lib/chem/skeleton).
 */
export type Drawable = Pick<Molecule3D, "atoms" | "bonds" | "frames" | "bondsFrom" | "biopolymer" | "bondOrders" | "unknownOrders" | "chainOrders" | "wholeWithoutH">;
export async function drawnOf(chem: ChemClient, m: Drawable, frame: number): Promise<{ drawn: Model; ordersUnknown: boolean }> {
  if (isSkeleton(m)) throw new Error(skeletonWhy());
  // (the frame drawn: kept to the frames it has, as edit3d `placesOf`)
  const xyz = placesOf(m, frame);
  const atoms = m.atoms.map((a, i) => ({ el: a.el, charge: a.charge, radical: a.radical, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] }));
  // (with the bonds that frame has, where they go frame by frame)
  const bonds = bondsAt(m, frame);
  const wanted = bonds.length > 0 && bonds.every((b) => b.order === 1);
  const { molblock, perceived } = await chem.request("drawing_of", { molblock: writeMolfile3d(atoms, bonds), perceive: wanted });
  const drawn = editorModelOf((await processFileContent("formula.mol", molblock)).model);
  return { drawn, ordersUnknown: wanted && !perceived };
}

/** Where a formula drawn of a molecule in 3D goes: beside it, to its left, level with it. */
export function formulaPlace(m: Molecule3D, formula: Model, style: Style3D): { x: number; y: number } {
  const solid = solidOf(m, style);
  const xs = formula.atoms.map((a) => a.x);
  const width = xs.length ? greatest(xs) - least(xs) : 0;
  return { x: m.at.x - solid.reach[lookOf(m)] - GAP - width / 2, y: m.at.y };
}
