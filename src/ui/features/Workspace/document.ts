/**
 * The 2D editor's document: what a workspace tab actually contains, and what
 * undo, redo and (later) saving act on. Everything here is pure - the store
 * calls these through `document.edit()` so each gesture becomes one step.
 *
 * What is deliberately *not* here: hover, drag previews, the camera, the label
 * edit buffer, fit requests. Those belong to the view (see store/).
 */
import { createDocument, type DocumentStore } from "../../../lib/doc";
import { bondChem, chemistry, type AtomChem } from "../../../lib/chem/molecule";
import { placedAbbreviation } from "../../../lib/chem/abbreviationPlace";
import { isElementSymbol } from "../../../lib/roles/molblock";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import type { StyleChoice } from "../../../lib/chem/style";
import type { ArrowLook } from "../../../lib/chem/reactionArrow";
import type { Arrow, Atom, Bond, Caption, CarriedList, Drawn, Look3D, MarkAt, Model, Molecule3D, PdfItem, PictureItem, PictureToAdd, Plus, TextOf, Wire, WorkflowSet, WorkflowStep, WorkspaceText } from "./store/types";
import { ICON_NAME_WIDTH, pdfRoom, POINT } from "../../../lib/pdf/layout";
import { sheetOf, sheetRoom } from "./utils/textSheets";
import { printedSize } from "../../../lib/picture/image";
import { readerLine, sameAtoms, type Found, type Unread } from "../../../lib/calc/read";
import { readResults } from "../../../lib/calc/results";
import { newTextName } from "./utils/texts";
import { fitSets } from "./workflow/model";

export type WorkspaceDocument = {
  model: Model;
  arrows: Arrow[];
  /** The "+" signs of a reaction scheme. */
  pluses: Plus[];
  /** Words on the page: a reaction's reagents and conditions, or anything else. */
  captions?: Caption[];
  nextCaptionId?: number;
  /** A workflow on the page (docs/WORKFLOWS.md): its sets, steps and wires, numbered from one counter. */
  sets?: WorkflowSet[];
  steps?: WorkflowStep[];
  wires?: Wire[];
  nextWorkflowId?: number;
  /** Legacy global aromatic circles toggle. */
  aromaticEnabled: boolean;
  /** Per-ring aromatic circle flags, keyed by ring key. */
  aromaticRings: Record<string, boolean>;
  /** Ids are handed out from one counter shared by atoms and bonds. */
  nextId: number;
  nextArrowId: number;
  nextPlusId: number;
  /** Molecules in 3D standing on the page, beside what is drawn. */
  molecules3d?: Molecule3D[];
  nextMolecule3dId?: number;
  /**
   * The document's own drawing style; unset, it is drawn in the
   * application's. Saving to a MOL or SD file keeps the structure only.
   */
  style?: StyleChoice;
  /**
   * The atoms *Expand abbreviation* drew out last, which the Clean-up
   * straight after it leaves drawn out (chem/cleanUp). Not saved.
   */
  expanded?: number[];
  /** The texts it holds, read and edited in the column beside the canvas. */
  texts?: WorkspaceText[];
  nextTextId?: number;
  /** The PDFs on the page (docs/PDF.md). */
  pdfs?: PdfItem[];
  nextPdfId?: number;
  /** The pictures on the page (docs/PDF.md, *A picture*). */
  pictures?: PictureItem[];
  nextPictureId?: number;
};

/** Whether it holds nothing: no structure, arrow, "+" sign or words drawn, no molecule in 3D, no text, no workflow. */
export function isBlankDocument(doc: WorkspaceDocument): boolean {
  return (
    !doc.model.atoms.length &&
    !doc.arrows.length &&
    !doc.pluses.length &&
    !doc.captions?.length &&
    !doc.molecules3d?.length &&
    !doc.texts?.length &&
    !doc.pdfs?.length &&
    !doc.pictures?.length &&
    !doc.sets?.length &&
    !doc.steps?.length
  );
}

export function emptyWorkspaceDocument(): WorkspaceDocument {
  return {
    model: { atoms: [], bonds: [] },
    arrows: [],
    pluses: [],
    aromaticEnabled: false,
    aromaticRings: {},
    nextId: 1,
    nextArrowId: 1,
    nextPlusId: 1,
    molecules3d: [],
    nextMolecule3dId: 1,
  };
}

/**
 * Builds a document for a workspace tab. The tab's data may carry a file to
 * import (`payload`), which the view parses and applies, so the document
 * starts empty here - or files opened as text (`texts`), which it starts
 * holding.
 */
export function createWorkspaceDocument(data?: unknown): DocumentStore<WorkspaceDocument> {
  const opened = (data as { texts?: unknown } | null | undefined)?.texts;
  const texts = (Array.isArray(opened) ? (opened as Partial<WorkspaceText>[]) : []).flatMap((t) =>
    typeof t?.name === "string" && typeof t.text === "string"
      ? [{ name: t.name, text: t.text, ...(typeof t.path === "string" ? { path: t.path } : {}) }]
      : [],
  );
  // (PDFs opened on a canvas of their own: in a row from the middle of the page - and pictures likewise)
  const held = (data as { pdfs?: unknown } | null | undefined)?.pdfs;
  let doc = addTexts(emptyWorkspaceDocument(), texts).doc;
  for (const p of pdfsInRow(Array.isArray(held) ? held : [], { x: 0, y: 0 })) doc = addPdf(doc, p);
  const pictures = (data as { pictures?: unknown } | null | undefined)?.pictures;
  for (const p of picturesInRow(Array.isArray(pictures) ? (pictures as PictureToAdd[]) : [], { x: 0, y: 0 })) doc = addPicture(doc, p);
  // (each edit's sets grown to keep what is drawn on in them inside them, as part of it)
  return createDocument<WorkspaceDocument>(doc, { settle: fitSets });
}

/** PDFs held, as they go on the page: the first's top page in the middle of `at`, the others to its right, a little apart. */
/** A row of PDFs put down clear of those already on the page: moved along to the right, a place at a time, until none of them, nor their names, lies over another. */
export function clearOfPdfs<T extends Omit<PdfItem, "id">>(row: T[], others: readonly Omit<PdfItem, "id">[]): T[] {
  const room = (p: Omit<PdfItem, "id">) => pdfRoom(p);
  const taken = others.map(room);
  const step = ICON_NAME_WIDTH + NOMINAL_BOND_LENGTH;
  for (let n = 0; n < 200; n++) {
    const moved = row.map((p) => ({ ...p, x: p.x + n * step }));
    if (!moved.some((p) => taken.some((t) => overlaps(room(p), t)))) return moved;
  }
  return row;
}

const overlaps = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function pdfsInRow(held: readonly unknown[], at: { x: number; y: number }): Omit<PdfItem, "id">[] {
  const out: Omit<PdfItem, "id">[] = [];
  let x = at.x;
  for (const h of held as Partial<PdfItem>[]) {
    const pages = Array.isArray(h?.pages) ? h.pages.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v) && v > 0)) : [];
    if (typeof h?.name !== "string" || typeof h.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(h.sha256) || !pages.length) continue;
    // (each an icon at first, room for its name beside the next)
    const w = ICON_NAME_WIDTH;
    if (out.length) x += w / 2;
    out.push({ name: h.name, sha256: h.sha256, pages, x, y: at.y, page: 0, icon: true });
    x += w / 2 + NOMINAL_BOND_LENGTH;
  }
  return out;
}

// --- atoms and bonds -------------------------------------------------------

export function addAtom(
  doc: WorkspaceDocument,
  x: number,
  y: number,
  el = "C",
  r = 0.9,
): WorkspaceDocument {
  const atom: Atom = { id: doc.nextId, x, y, r, el };
  return {
    ...doc,
    nextId: doc.nextId + 1,
    model: { atoms: [...doc.model.atoms, atom], bonds: doc.model.bonds },
  };
}

export function addBond(
  doc: WorkspaceDocument,
  a: number,
  b: number,
  order: Bond["order"] = 1,
): WorkspaceDocument {
  const bond: Bond = {
    id: doc.nextId,
    a,
    b,
    order,
    stereo: "none",
    stereoOrient: "principle",
  };
  return {
    ...doc,
    nextId: doc.nextId + 1,
    model: { atoms: doc.model.atoms, bonds: [...doc.model.bonds, bond] },
  };
}

export function hasBond(doc: WorkspaceDocument, a: number, b: number): boolean {
  return doc.model.bonds.some(
    (bond) =>
      (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a),
  );
}

/** Bonds two existing atoms, unless they are the same atom or already bonded. */
export function connectAtoms(
  doc: WorkspaceDocument,
  a: number,
  b: number,
  order: Bond["order"] = 1,
): WorkspaceDocument {
  if (a === b || hasBond(doc, a, b)) return doc;
  return addBond(doc, a, b, order);
}

/** One step for the whole "extend a bond" gesture: new atom plus its bond. */
export function addAtomBonded(
  doc: WorkspaceDocument,
  baseId: number,
  x: number,
  y: number,
  el = "C",
  order: Bond["order"] = 1,
): WorkspaceDocument {
  const withAtom = addAtom(doc, x, y, el);
  return addBond(withAtom, baseId, withAtom.nextId - 1, order);
}

/** One step for drawing a fresh bond in empty space. */
export function addBondedPair(
  doc: WorkspaceDocument,
  first: { x: number; y: number; el?: string },
  second: { x: number; y: number; el?: string },
  order: Bond["order"] = 1,
): WorkspaceDocument {
  const withFirst = addAtom(doc, first.x, first.y, first.el ?? "C");
  const firstId = withFirst.nextId - 1;
  const withSecond = addAtom(withFirst, second.x, second.y, second.el ?? "C");
  return addBond(withSecond, firstId, withSecond.nextId - 1, order);
}

export function moveAtom(
  doc: WorkspaceDocument,
  id: number,
  x: number,
  y: number,
): WorkspaceDocument {
  const atoms = doc.model.atoms;
  const index = atoms.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const atom = atoms[index];
  if (atom.x === x && atom.y === y) return doc;
  const next = atoms.slice();
  next[index] = { ...atom, x, y };
  return { ...doc, model: { atoms: next, bonds: doc.model.bonds } };
}

/**
 * Atoms put where they are to go, together - a selection moved, turned or
 * turned over - and, where given, a depth changed and a bond's wedge made
 * hashes or the other way round; everything else about them kept.
 */
export function placeAtoms(
  doc: WorkspaceDocument,
  moves: readonly { id: number; x: number; y: number; z?: number }[],
  stereo: readonly Pick<Bond, "id" | "stereo">[] = [],
): WorkspaceDocument {
  const to = new Map(moves.map((m) => [m.id, m]));
  let changed = false;
  const atoms = doc.model.atoms.map((a) => {
    const m = to.get(a.id);
    if (!m || (m.x === a.x && m.y === a.y && (m.z === undefined || m.z === a.z))) return a;
    changed = true;
    return { ...a, x: m.x, y: m.y, ...(m.z !== undefined ? { z: m.z } : {}) };
  });
  const flip = new Map(stereo.map((b) => [b.id, b.stereo]));
  const bonds = doc.model.bonds.map((b) => {
    const s = flip.get(b.id);
    if (s === undefined || s === b.stereo) return b;
    changed = true;
    return { ...b, stereo: s };
  });
  return changed ? { ...doc, model: { atoms, bonds } } : doc;
}

/**
 * A stroke drawn out of atom `baseId`, in one edit: a bond to each of its
 * nodes in turn - a new carbon where a node has no atom, or the atom already
 * there (`atomId`), or one this stroke added before (`pathIndex`). A bond
 * that is already there is not drawn twice.
 */
export function addStroke(
  doc: WorkspaceDocument,
  baseId: number,
  nodes: readonly {
    x: number;
    y: number;
    atomId?: number;
    pathIndex?: number;
    from?: number;
  }[],
): WorkspaceDocument {
  if (!doc.model.atoms.some((a) => a.id === baseId)) return doc;
  let d = doc;
  const ids: number[] = [];
  // (a path index of -1 is the stroke's own start)
  const idOf = (i: number) => (i === -1 ? baseId : ids[i]);
  let from = baseId;
  for (const node of nodes) {
    if (node.from != null && idOf(node.from) != null) from = idOf(node.from);
    let to: number;
    if (node.atomId != null) to = node.atomId;
    else if (node.pathIndex != null && idOf(node.pathIndex) != null)
      to = idOf(node.pathIndex);
    else {
      d = addAtom(d, node.x, node.y);
      to = d.nextId - 1;
    }
    ids.push(to);
    d = connectAtoms(d, from, to);
    from = to;
  }
  return d;
}

/** A stroke that starts on empty space: a new atom at `start`, and the stroke from it, as one edit. */
export function addStrokeAt(
  doc: WorkspaceDocument,
  start: { x: number; y: number },
  nodes: Parameters<typeof addStroke>[2],
): WorkspaceDocument {
  if (!nodes.length) return doc;
  const d = addAtom(doc, start.x, start.y);
  return addStroke(d, d.nextId - 1, nodes);
}

/**
 * Atoms and bonds taken out, in one edit: an atom goes with its bonds, and a
 * carbon those left with no bonds at all goes too - a carbon is only there
 * as the meeting of its bonds, and on its own would be drawn as CH4. A
 * labelled atom, an O or an N, stays where it was.
 */
export function deleteParts(
  doc: WorkspaceDocument,
  atomIds: Iterable<number>,
  bondIds: Iterable<number>,
): WorkspaceDocument {
  const atomsGone = new Set(atomIds);
  const bondsGone = new Set(bondIds);
  const { atoms, bonds } = doc.model;
  for (const b of bonds) {
    if (atomsGone.has(b.a) || atomsGone.has(b.b)) bondsGone.add(b.id);
  }
  const left = bonds.filter((b) => !bondsGone.has(b.id));
  const stillBonded = new Set(left.flatMap((b) => [b.a, b.b]));
  for (const b of bonds) {
    if (!bondsGone.has(b.id)) continue;
    for (const end of [b.a, b.b]) {
      const atom = atoms.find((a) => a.id === end);
      if (atom && atom.el === "C" && !stillBonded.has(end)) atomsGone.add(end);
    }
  }
  const kept = atoms.filter((a) => !atomsGone.has(a.id));
  if (kept.length === atoms.length && left.length === bonds.length) return doc;
  return { ...doc, model: { atoms: kept, bonds: left } };
}

/**
 * A new layout for some of the structure, as edits: where each atom goes
 * (and its depth, where it is drawn in perspective; none, where it is not),
 * the wedges changed, and the H atoms drawn to carry a wedge - added, or
 * taken away with their bonds where no longer drawn.
 */
export type Relayout = {
  atoms: { id: number; x: number; y: number; z?: number; stereoCentre?: boolean }[];
  bonds: (Pick<Bond, "id" | "stereo" | "stereoOrient"> & { display?: Bond["display"] })[];
  /** H atoms to add, each bonded to `on`, the bond wedged as given. */
  added?: {
    x: number;
    y: number;
    on: number;
    stereo: NonNullable<Bond["stereo"]>;
    stereoOrient: NonNullable<Bond["stereoOrient"]>;
  }[];
  /** Atoms to take away, with their bonds. */
  removed?: number[];
};

/**
 * A new layout for some of the structure - a clean-up - in one edit: atoms
 * moved, wedges changed, H atoms added and taken away where the new layout
 * needs them. Nothing that would not change is touched.
 */
export function relayout(doc: WorkspaceDocument, change: Relayout): WorkspaceDocument {
  const to = new Map(change.atoms.map((a) => [a.id, a]));
  const gone = new Set(change.removed ?? []);
  let changed = gone.size > 0 || (change.added?.length ?? 0) > 0;
  // (marks put by hand, put back where the drawing puts them: they were put for the drawing as it was)
  const atoms = doc.model.atoms.flatMap((a): Atom[] => {
    if (gone.has(a.id)) return [];
    const p = to.get(a.id);
    if (!p) return [a];
    if (p.x === a.x && p.y === a.y && p.z === a.z && !!p.stereoCentre === !!a.stereoCentre && !a.chargeAt && !a.stereoAt) return [a];
    changed = true;
    const { z: _z, stereoCentre: _c, chargeAt: _q, stereoAt: _s, ...rest } = a;
    return [
      {
        ...rest,
        x: p.x,
        y: p.y,
        ...(p.z != null ? { z: p.z } : {}),
        ...(p.stereoCentre ? { stereoCentre: true } : {}),
      },
    ];
  });
  const patch = new Map(change.bonds.map((b) => [b.id, b]));
  const bonds = doc.model.bonds.flatMap((b): Bond[] => {
    if (gone.has(b.a) || gone.has(b.b)) return [];
    const p = patch.get(b.id);
    const display = p && "display" in p ? p.display : b.display;
    const laid = to.has(b.a) && to.has(b.b);
    if (laid && b.stereoAt && (!p || (p.stereo === b.stereo && p.stereoOrient === b.stereoOrient && display === b.display))) {
      changed = true;
      const { stereoAt: _at, ...kept } = b;
      return [kept];
    }
    if (!p || (p.stereo === b.stereo && p.stereoOrient === b.stereoOrient && display === b.display)) return [b];
    changed = true;
    const { display: _display, stereoAt: _at, ...rest } = b;
    return [{ ...rest, stereo: p.stereo, stereoOrient: p.stereoOrient, ...(display ? { display } : {}) }];
  });
  if (!changed) return doc;
  let nextId = doc.nextId;
  for (const h of change.added ?? []) {
    const id = nextId++;
    atoms.push({ id, x: h.x, y: h.y, r: 0.9, el: "H" });
    bonds.push({ id: nextId++, a: h.on, b: id, order: 1, stereo: h.stereo, stereoOrient: h.stereoOrient });
  }
  return { ...doc, nextId, model: { atoms, bonds } };
}

/**
 * An atom's chemistry set anew - its element or label, charge, radical and
 * isotope, each left off where it has none - leaving where it is alone.
 */
/**
 * An abbreviation drawn out as the atoms it stands for - as the file gave
 * them, turned to where its bond goes now, or the dictionary's, laid out
 * on from that bond - the labelled atom become the one it is attached by,
 * its bonds out leaving from the atoms they did. One undo step.
 */
export function expandAbbreviation(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const atoms = doc.model.atoms;
  const a = atoms.find((x) => x.id === id);
  if (!a) return doc;
  const touching = doc.model.bonds.filter((b) => b.a === id || b.b === id);
  const out = touching[0] ? atoms.find((x) => x.id === (touching[0].a === id ? touching[0].b : touching[0].a)) : undefined;
  const now = out ? { x: out.x - a.x, y: out.y - a.y } : null;
  const s = a.abbrev ?? placedAbbreviation(a.el, now, NOMINAL_BOND_LENGTH);
  if (!s || !s.atoms.length) return doc;
  // a file's: turned by as much as its bond out has turned since
  const turn = a.abbrev && s.toward && now ? Math.atan2(now.y, now.x) - Math.atan2(s.toward.y, s.toward.x) : 0;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const head = s.attach[0] ?? 0;
  let nextId = doc.nextId;
  const ids = s.atoms.map((_, k) => (k === head ? id : nextId++));
  const placed = s.atoms.map((p) => ({ x: a.x + p.x * cos - p.y * sin, y: a.y + p.x * sin + p.y * cos }));
  const atomOf = (k: number): Atom => {
    const { x: _x, y: _y, z, stereoCentre, ...chem } = s.atoms[k];
    return {
      id: ids[k],
      x: placed[k].x,
      y: placed[k].y,
      r: a.r,
      el: chem.el,
      ...chemistry(chem),
      // (in perspective, as Clean-up draws a cage)
      ...(z != null ? { z } : {}),
      ...(stereoCentre ? { stereoCentre: true } : {}),
    };
  };
  const nextAtoms = atoms.map((x) => (x.id === id ? atomOf(head) : x));
  s.atoms.forEach((_, k) => {
    if (k !== head) nextAtoms.push(atomOf(k));
  });
  const order = new Map(touching.map((b, k) => [b.id, k]));
  const nextBonds = doc.model.bonds.map((b) => {
    const k = order.get(b.id);
    if (k == null) return b;
    const at = s.attach[k] ?? head;
    const to = ids[at];
    const moved = b.a === id ? { ...b, a: to } : { ...b, b: to };
    // to a pi system's star: a haptic bond, to all its atoms; to a donor
    // that lends its pair, a coordination bond (drawn as it was)
    const pi = s.haptic?.find((h) => h.star === at);
    if (pi) return { ...moved, endpoints: pi.atoms.map((e) => ids[e]), attach: "all" as const, coordination: true };
    return s.lends?.[k] && !moved.dative ? { ...moved, coordination: true } : moved;
  });
  for (const b of s.bonds) {
    nextBonds.push({
      id: nextId++,
      a: ids[b.a1],
      b: ids[b.a2],
      order: b.order,
      stereo: b.stereo ?? "none",
      ...(b.stereoOrient ? { stereoOrient: b.stereoOrient } : {}),
      ...(b.display ? { display: b.display } : {}),
      ...bondChem(b),
      ...(b.endpoints ? { endpoints: b.endpoints.map((e) => ids[e]) } : {}),
    });
  }
  return { ...doc, nextId, model: { atoms: nextAtoms, bonds: nextBonds }, expanded: ids };
}

/** Atoms to show as one, labelled `label` where the atom `at` is (chem/cleanUp). */
export type WrittenAsLabel = { atoms: readonly number[]; at: number; label: string };

/**
 * Groups written by their labels, as Clean-up writes them: each group's
 * atoms - with one bond to the rest of the drawing, from `at` - shown as
 * the one atom `at`, labelled, standing for the group as the label does
 * (drawn out again as the dictionary draws it). A group that is not so
 * attached is left as it is.
 */
export function writtenAsLabels(doc: WorkspaceDocument, groups: readonly WrittenAsLabel[]): WorkspaceDocument {
  let atoms = doc.model.atoms;
  let bonds = doc.model.bonds;
  for (const g of groups) {
    const ids = new Set(g.atoms);
    const crossing = bonds.filter((b) => ids.has(b.a) !== ids.has(b.b) || b.endpoints?.some((e) => ids.has(e) !== ids.has(b.a)));
    if (crossing.length !== 1 || ![crossing[0].a, crossing[0].b].includes(g.at)) continue;
    // (a group named as an element is - Ts, Ac, Pr - holds the group: not the element)
    const outside = crossing[0].a === g.at ? crossing[0].b : crossing[0].a;
    const here = atoms.find((a) => a.id === g.at);
    const there = atoms.find((a) => a.id === outside);
    const toward = here && there ? { x: there.x - here.x, y: there.y - here.y } : null;
    const held = isElementSymbol(g.label) ? placedAbbreviation(g.label, toward, NOMINAL_BOND_LENGTH) : null;
    atoms = atoms.flatMap((a) =>
      a.id === g.at
        ? [{ id: a.id, x: a.x, y: a.y, r: a.r, el: g.label, ...(held ? { abbrev: { ...held, ...(toward ? { toward } : {}) } } : {}) }]
        : ids.has(a.id)
          ? []
          : [a],
    );
    bonds = bonds.filter((b) => !(ids.has(b.a) && ids.has(b.b)));
  }
  if (atoms === doc.model.atoms) return doc;
  return { ...doc, model: { atoms, bonds } };
}

/**
 * The atoms `ids` - a group with one bond to the rest of the drawing - shown
 * as one atom labelled `label` where the group is attached, holding them as
 * its abbreviation does (`abbrev`), so that *Expand abbreviation* draws them
 * out again as they were. Unchanged where the atoms are not such a group.
 */
export function contractToAbbreviation(
  doc: WorkspaceDocument,
  ids: ReadonlySet<number>,
  label: string,
): WorkspaceDocument {
  const inside = doc.model.atoms.filter((a) => ids.has(a.id));
  const crossing = doc.model.bonds.filter((b) => ids.has(b.a) !== ids.has(b.b));
  if (!inside.length || crossing.length !== 1) return doc;
  const out = crossing[0];
  const attachId = ids.has(out.a) ? out.a : out.b;
  const att = inside.find((a) => a.id === attachId)!;
  const other = doc.model.atoms.find((a) => a.id === (attachId === out.a ? out.b : out.a))!;
  const index = new Map(inside.map((a, i) => [a.id, i]));
  const inner = doc.model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
  const abbrev = {
    atoms: inside.map((a) => {
      const { abbrev: _abbrev, ...chem } = chemistry(a);
      return { el: a.el, ...chem, x: a.x - att.x, y: a.y - att.y };
    }),
    bonds: inner.map((b) => ({
      a1: index.get(b.a)!,
      a2: index.get(b.b)!,
      order: b.order,
      ...(b.stereo && b.stereo !== "none" ? { stereo: b.stereo } : {}),
      ...bondChem(b),
      // (a haptic bond's ends by index, as an abbreviation keeps them)
      ...(b.endpoints ? { endpoints: b.endpoints.map((e) => index.get(e)!).filter((e) => e != null) } : {}),
    })),
    attach: [index.get(attachId)!],
    toward: { x: other.x - att.x, y: other.y - att.y },
  };
  const atoms = doc.model.atoms
    .filter((a) => !ids.has(a.id) || a.id === attachId)
    .map((a) => (a.id === attachId ? { id: a.id, x: a.x, y: a.y, r: a.r, el: label, abbrev } : a));
  const bonds = doc.model.bonds.filter((b) => !(ids.has(b.a) && ids.has(b.b)));
  return { ...doc, model: { atoms, bonds } };
}

/**
 * The group a label names, laid out to hang where the atom `id` hangs - its
 * bond out turned toward the atom it is bound to - as the atom's own
 * (`abbrev`): what a group named as an element is holds, so that it is the
 * group and not the element (Ac, Pr, Ts, Fm, At).
 */
export function groupHeldAt(doc: WorkspaceDocument, id: number, label: string): AtomChem["abbrev"] {
  const a = doc.model.atoms.find((x) => x.id === id);
  const touching = doc.model.bonds.filter((b) => b.a === id || b.b === id);
  const out = a && touching[0] ? doc.model.atoms.find((x) => x.id === (touching[0].a === id ? touching[0].b : touching[0].a)) : undefined;
  const toward = a && out ? { x: out.x - a.x, y: out.y - a.y } : null;
  const s = placedAbbreviation(label, toward, NOMINAL_BOND_LENGTH);
  return s ? { ...s, ...(toward ? { toward } : {}) } : undefined;
}

export function setAtomChemistry(
  doc: WorkspaceDocument,
  id: number,
  chem: AtomChem,
  /** What was typed, where the label it was read as is not it (`Atom.typed`). */
  typed?: string,
): WorkspaceDocument {
  const atoms = doc.model.atoms;
  const index = atoms.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const was = atoms[index];
  // (all of what it is: what is given is the atom it is made - a new label
  // leaves no abbreviation, list or Rgroup of the old one behind)
  const same =
    was.el === chem.el &&
    JSON.stringify(chemistry(was)) === JSON.stringify(chemistry(chem)) &&
    was.typed === typed;
  if (same) return doc;
  const {
    charge: _q,
    radical: _r,
    isotope: _i,
    rgroups: _g,
    list: _l,
    valence: _v,
    hCount: _h,
    abbrev: _a,
    chargeAt,
    typed: _t,
    ...rest
  } = was;
  const next = atoms.slice();
  // (a charge put by hand stays where it was put while there is a charge - or a radical's dots - to put)
  const marked = (chem.charge ?? 0) !== 0 || !!chem.radical;
  next[index] = { ...rest, el: chem.el, ...chemistry(chem), ...(marked && chargeAt ? { chargeAt } : {}), ...(typed != null ? { typed } : {}) };
  return { ...doc, model: { atoms: next, bonds: doc.model.bonds } };
}

export function updateBond(
  doc: WorkspaceDocument,
  id: number,
  patch: Partial<Bond>,
): WorkspaceDocument {
  const bonds = doc.model.bonds;
  const index = bonds.findIndex((b) => b.id === id);
  if (index < 0) return doc;
  const bond = bonds[index];
  const merged = { ...bond, ...patch };
  const unchanged = (Object.keys(patch) as (keyof Bond)[]).every(
    (key) => bond[key] === merged[key],
  );
  if (unchanged) return doc;
  // A bond whose order or stereo is changed is the bond it is made: what
  // a file said it was besides - a query, a hydrogen or a coordination
  // bond, a double bond of either configuration - goes with the change.
  if ("order" in patch || "stereo" in patch) {
    for (const key of ["query", "hydrogen", "coordination"] as const) {
      if (!(key in patch)) delete merged[key];
    }
    if (merged.order !== 2 && merged.stereo === "either") merged.stereo = "none";
  }
  const next = bonds.slice();
  next[index] = merged;
  return { ...doc, model: { atoms: doc.model.atoms, bonds: next } };
}

/**
 * Drops the dragged atom onto another one: bonds that pointed at it are
 * rewired to the target, skipping duplicates and self-bonds.
 */
export function replaceDraggedAtomWith(
  doc: WorkspaceDocument,
  movingId: number,
  targetId: number,
): WorkspaceDocument {
  if (movingId === targetId) return doc;
  const bonds: Bond[] = [];
  for (const b of doc.model.bonds) {
    const other = b.a === movingId ? b.b : b.b === movingId ? b.a : null;
    if (other == null) {
      bonds.push(b);
      continue;
    }
    if (other === targetId) continue; // collapses onto the target
    const exists = bonds.some(
      (kept) =>
        (kept.a === targetId && kept.b === other) ||
        (kept.b === targetId && kept.a === other),
    );
    const alreadyInModel = hasBond(doc, targetId, other);
    if (exists || alreadyInModel) continue;
    bonds.push(b.a === movingId ? { ...b, a: targetId } : { ...b, b: targetId });
  }
  const atoms = doc.model.atoms.filter((a) => a.id !== movingId);
  return { ...doc, model: { atoms, bonds } };
}

// --- whole-model operations ------------------------------------------------

/** Replaces the content, e.g. opening a file: one undo step for the import. */
export function replaceModel(
  doc: WorkspaceDocument,
  next: Model,
): WorkspaceDocument {
  const maxId = Math.max(
    0,
    ...next.atoms.map((a) => a.id || 0),
    ...next.bonds.map((b) => b.id || 0),
  );
  return {
    ...doc,
    model: { atoms: next.atoms.slice(), bonds: next.bonds.slice() },
    arrows: [],
    nextArrowId: 1,
    pluses: [],
    nextPlusId: 1,
    captions: [],
    nextCaptionId: 1,
    molecules3d: [],
    nextMolecule3dId: 1,
    sets: [],
    steps: [],
    wires: [],
    nextWorkflowId: 1,
    aromaticEnabled: false,
    aromaticRings: {},
    nextId: Math.max(1, maxId + 1),
  };
}

/** Adds another structure alongside the current one, renumbering its ids. */
export function appendModel(
  doc: WorkspaceDocument,
  next: Model,
): WorkspaceDocument {
  if (next.atoms.length === 0 && next.bonds.length === 0) return doc;
  const idMap = new Map<number, number>();
  let cursor = doc.nextId;
  for (const a of next.atoms) idMap.set(a.id, cursor++);
  // its Sgroups made its own, apart from any of the same id already here
  const groups = new Map<number, number>();
  const groupId = (g: number) => {
    if (!groups.has(g)) groups.set(g, cursor++);
    return groups.get(g)!;
  };
  const atoms = next.atoms.map((a) => ({
    ...a,
    id: idMap.get(a.id)!,
    ...(a.sgroups
      ? {
          sgroups: a.sgroups.map((g) => ({
            ...g,
            id: groupId(g.id),
            ...(g.parent != null ? { parent: groupId(g.parent) } : {}),
          })),
        }
      : {}),
  }));
  const bonds = next.bonds.map((b) => ({
    ...b,
    id: cursor++,
    a: idMap.get(b.a) ?? b.a,
    b: idMap.get(b.b) ?? b.b,
    ...(b.endpoints ? { endpoints: b.endpoints.map((e) => idMap.get(e) ?? e) } : {}),
  }));
  return {
    ...doc,
    nextId: cursor,
    model: {
      atoms: [...doc.model.atoms, ...atoms],
      bonds: [...doc.model.bonds, ...bonds],
    },
  };
}

// --- arrows and pluses ----------------------------------------------------

/**
 * The arrows and "+" signs a file or a paste brings with it, where they lie
 * once placed: given ids of the document's own as they are added.
 */
export type ImportedScheme = {
  arrows?: Omit<Arrow, "id">[];
  pluses?: Omit<Plus, "id">[];
  /** Words, each over or under an arrow it brings by its place among them (`arrowAt`), where it is. */
  captions?: (Omit<Caption, "id" | "arrow"> & { arrowAt?: number })[];
  /** Molecules in 3D a file brings, where they are to stand - and, where it says, the frame each shows (an optimisation's last). */
  molecules3d?: (Omit<Molecule3D, "id"> & { frame?: number; list?: CarriedList })[];
};

/** The arrows and pluses drawn with a part - a paste, a document's record - as a scheme to add. */
export function schemeOf(part: Drawn): ImportedScheme {
  return {
    arrows: (part.arrows ?? []).map(({ id: _id, ...a }) => a),
    pluses: (part.pluses ?? []).map(({ id: _id, ...p }) => p),
    captions: (part.captions ?? []).map(({ id: _id, arrow, ...c }) => {
      const at = arrow == null ? -1 : (part.arrows ?? []).findIndex((a) => a.id === arrow);
      return at < 0 ? c : { ...c, arrowAt: at };
    }),
    // (how one was turned, and its frame, are the view's: not the document's)
    molecules3d: (part.molecules3d ?? []).map(({ turn: _turn, frame: _frame, list: _list, ...m }) => m),
  };
}

/** `doc` with the scheme's arrows and pluses added, if it brought any. */
export function withImportedScheme(
  doc: WorkspaceDocument,
  scheme?: ImportedScheme,
): WorkspaceDocument {
  let next = doc;
  // (the words over an arrow it brings are over that arrow, as it is numbered here)
  const firstArrow = doc.nextArrowId;
  for (const a of scheme?.arrows ?? []) {
    next = addArrow(next, a.x, a.y, a.angle, a.length);
    if (a.look) next = setArrowLook(next, next.nextArrowId - 1, a.look);
  }
  for (const p of scheme?.pluses ?? []) next = addPlus(next, p.x, p.y);
  for (const { arrowAt, ...c } of scheme?.captions ?? []) next = addCaption(next, { ...c, ...(arrowAt != null ? { arrow: firstArrow + arrowAt } : {}) });
  // (the frame each shows is the canvas's to keep, not the document's)
  for (const { frame: _frame, list: _list, ...m } of scheme?.molecules3d ?? []) next = addMolecule3d(next, m);
  return next;
}

// --- molecules in 3D ---------------------------------------------------------

export function addMolecule3d(doc: WorkspaceDocument, m: Omit<Molecule3D, "id">): WorkspaceDocument {
  const id = doc.nextMolecule3dId ?? 1;
  return { ...doc, molecules3d: [...(doc.molecules3d ?? []), { ...m, id }], nextMolecule3dId: id + 1 };
}

/**
 * What readers chosen to read an output as well found in it (lib/calc/
 * readings), joined to each molecule read from that output - by its
 * SHA-256 - that has not got it yet: each reader's results, kept as its
 * own, where the atoms it read are the molecule's, in the same order; what
 * belongs to frames only where it read as many; and a reader that could not
 * read it, said. The document as it was where there is nothing to join.
 */
export function withReadings(doc: WorkspaceDocument, bySource: Readonly<Record<string, readonly (Found | Unread)[]>>): WorkspaceDocument {
  let changed = false;
  const molecules3d = (doc.molecules3d ?? []).map((m) => {
    const readings = m.calc?.source ? bySource[m.calc.source.sha256] : undefined;
    if (!m.calc || !readings?.length) return m;
    let calc = m.calc;
    for (const r of readings) {
      // (a reader as a molecule keeps it: its id, then its version)
      const has = calc.readers.some((x) => x === r.from || x.startsWith(`${r.from} `)) || calc.unread?.some((u) => u.from === r.from);
      if (has) continue;
      const atoms = m.atoms.map((a) => a.el);
      if ("why" in r || !sameAtoms(r.output.atoms, atoms)) {
        const why = "why" in r ? r.why : "it read other atoms";
        calc = { ...calc, unread: [...(calc.unread ?? []), { from: r.from, why }] };
      } else {
        const frames = 1 + (m.frames?.length ?? 0);
        const read = (r.output.frames ?? []).filter((f) => Array.isArray(f) && f.length === 3 * atoms.length).length;
        const results = readResults(r.output.results, atoms.length, read === frames ? frames : 0, r.from);
        calc = { ...calc, readers: [...calc.readers, readerLine(r)], results: [...(calc.results ?? []), ...results] };
      }
    }
    if (calc === m.calc) return m;
    changed = true;
    return { ...m, calc };
  });
  return changed ? { ...doc, molecules3d } : doc;
}

/** A molecule in 3D tied to a drawing atom by atom (`drawnFrom`), the drawing as it is now (`drawnAs`). */
export function linkMolecule3d(doc: WorkspaceDocument, id: number, drawnFrom: (number | null)[], drawnAs: string): WorkspaceDocument {
  return {
    ...doc,
    molecules3d: (doc.molecules3d ?? []).map((m) => (m.id === id ? { ...m, drawnFrom, drawnAs } : m)),
  };
}

export function moveMolecule3d(doc: WorkspaceDocument, id: number, at: { x: number; y: number; z?: number }): WorkspaceDocument {
  return moveMolecules3d(doc, [{ id, at }]);
}

/**
 * Molecules in 3D moved: each to where `moves` says - and as high above the
 * page as it says, or as high as it was.
 */
export function moveMolecules3d(
  doc: WorkspaceDocument,
  moves: { id: number; at: { x: number; y: number; z?: number } }[],
): WorkspaceDocument {
  const to = new Map(moves.map((m) => [m.id, m.at]));
  return {
    ...doc,
    molecules3d: (doc.molecules3d ?? []).map((m) => {
      const at = to.get(m.id);
      if (!at) return m;
      const z = at.z ?? m.at.z;
      return { ...m, at: { x: at.x, y: at.y, ...(z != null ? { z } : {}) } };
    }),
  };
}

export function removeMolecule3d(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  return removeMolecules3d(doc, [id]);
}

export function removeMolecules3d(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  const kept = (doc.molecules3d ?? []).filter((m) => !gone.has(m.id));
  return kept.length === (doc.molecules3d ?? []).length ? doc : { ...doc, molecules3d: kept };
}

function withMolecule3d(doc: WorkspaceDocument, id: number, change: (m: Molecule3D) => Molecule3D): WorkspaceDocument {
  const all = doc.molecules3d ?? [];
  const i = all.findIndex((m) => m.id === id);
  if (i < 0) return doc;
  const next = change(all[i]);
  return next === all[i] ? doc : { ...doc, molecules3d: all.map((m, k) => (k === i ? next : m)) };
}

/** Molecules in 3D drawn in the 3D style's primary look, or its secondary. */
export function setLook3d(doc: WorkspaceDocument, ids: readonly number[], look: Look3D): WorkspaceDocument {
  return ids.reduce(
    (d, id) =>
      withMolecule3d(d, id, (m) => {
        if ((m.look ?? "primary") === look) return m;
        const { look: _was, ...rest } = m;
        return look === "primary" ? rest : { ...rest, look };
      }),
    doc,
  );
}

/**
 * A measurement of two, three or four of a molecule's atoms, by index -
 * none, where they are not, or the same atoms are measured already.
 */
export function addMeasure3d(doc: WorkspaceDocument, id: number, atoms: number[]): WorkspaceDocument {
  return withMolecule3d(doc, id, (m) => {
    const fits = atoms.length >= 2 && atoms.length <= 4 && new Set(atoms).size === atoms.length;
    if (!fits || atoms.some((a) => !Number.isInteger(a) || a < 0 || a >= m.atoms.length)) return m;
    const key = (xs: number[]) => (xs[0] <= xs[xs.length - 1] ? xs : [...xs].reverse()).join(",");
    const measures = m.measures ?? [];
    if (measures.some((x) => key(x.atoms) === key(atoms))) return m;
    const next = measures.reduce((n, x) => Math.max(n, x.id + 1), 1);
    return { ...m, measures: [...measures, { id: next, atoms: [...atoms] }] };
  });
}

/** A measurement's atoms put in another order - the same measurement, the same value: which side setting it moves. */
export function orderMeasure3d(doc: WorkspaceDocument, id: number, measure: number, atoms: number[]): WorkspaceDocument {
  return withMolecule3d(doc, id, (m) => {
    const x = (m.measures ?? []).find((k) => k.id === measure);
    // (the same atoms, either way along: the same measurement)
    const same = !!x && (x.atoms.join() === atoms.join() || x.atoms.join() === [...atoms].reverse().join());
    if (!x || !same || x.atoms.join() === atoms.join()) return m;
    return { ...m, measures: m.measures!.map((k) => (k.id === measure ? { ...k, atoms: [...atoms] } : k)) };
  });
}

/**
 * A molecule in 3D's atoms put in new places in one of its frames - its
 * shape edited (utils/edit3d) - and its stereo labels as they now are.
 */
export function setPlaces3d(doc: WorkspaceDocument, id: number, frame: number, xyz: readonly number[], stereo?: Molecule3D["stereo"]): WorkspaceDocument {
  return withMolecule3d(doc, id, (m) => {
    if (xyz.length !== 3 * m.atoms.length) return m;
    const next =
      frame <= 0 || !m.frames?.[frame - 1]
        ? { ...m, atoms: m.atoms.map((a, i) => ({ ...a, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })) }
        : { ...m, frames: m.frames.map((f, k) => (k === frame - 1 ? [...xyz] : f)) };
    return stereo ? { ...next, stereo } : next;
  });
}

export function removeMeasure3d(doc: WorkspaceDocument, id: number, measure: number): WorkspaceDocument {
  return withMolecule3d(doc, id, (m) => {
    const measures = (m.measures ?? []).filter((x) => x.id !== measure);
    return measures.length === (m.measures ?? []).length ? m : { ...m, measures };
  });
}

export function addArrow(
  doc: WorkspaceDocument,
  x: number,
  y: number,
  angle: number,
  length: number,
): WorkspaceDocument {
  const arrow: Arrow = { id: doc.nextArrowId, x, y, angle, length };
  return {
    ...doc,
    nextArrowId: doc.nextArrowId + 1,
    arrows: [...doc.arrows, arrow],
  };
}

export function updateArrow(
  doc: WorkspaceDocument,
  id: number,
  patch: Partial<Arrow>,
): WorkspaceDocument {
  const index = doc.arrows.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const next = doc.arrows.slice();
  const was = next[index];
  next[index] = { ...was, ...patch };
  // (the words over it, or under it, go where its middle goes)
  return withCaptionsBy({ ...doc, arrows: next }, new Map([[id, { x: next[index].x - was.x, y: next[index].y - was.y }]]));
}

/** `doc` with the arrow setting `look` for itself, in place of what it set. */
export function setArrowLook(
  doc: WorkspaceDocument,
  id: number,
  look: ArrowLook,
): WorkspaceDocument {
  const index = doc.arrows.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const next = doc.arrows.slice();
  const { look: _was, ...arrow } = next[index];
  next[index] = Object.keys(look).length ? { ...arrow, look } : arrow;
  return { ...doc, arrows: next };
}

export function removeArrow(
  doc: WorkspaceDocument,
  id: number,
): WorkspaceDocument {
  const arrows = doc.arrows.filter((a) => a.id !== id);
  return arrows.length === doc.arrows.length ? doc : withoutArrowsOf({ ...doc, arrows }, new Set([id]));
}

export function addPlus(doc: WorkspaceDocument, x: number, y: number): WorkspaceDocument {
  const pluses = doc.pluses ?? [];
  const nextPlusId = doc.nextPlusId ?? 1;
  return { ...doc, nextPlusId: nextPlusId + 1, pluses: [...pluses, { id: nextPlusId, x, y }] };
}

export function movePlus(doc: WorkspaceDocument, id: number, x: number, y: number): WorkspaceDocument {
  const pluses = doc.pluses ?? [];
  const index = pluses.findIndex((p) => p.id === id);
  if (index < 0) return doc;
  const next = pluses.slice();
  next[index] = { ...next[index], x, y };
  return { ...doc, pluses: next };
}

export function removePlus(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const pluses = (doc.pluses ?? []).filter((p) => p.id !== id);
  return pluses.length === (doc.pluses ?? []).length ? doc : { ...doc, pluses };
}

/** Where arrows, pluses and words go, by id - and pictures, and how they are turned; and texts' sheets, by their top left. */
export type MarkPlaces = {
  pictures?: { id: number; x: number; y: number; turn?: number }[];
  texts?: { id: number; x: number; y: number }[];
  arrows?: { id: number; x: number; y: number }[];
  pluses?: { id: number; x: number; y: number }[];
  captions?: { id: number; x: number; y: number }[];
  /** Molecules in 3D moved with the rest: where each now stands. */
  molecules3d?: { id: number; at: { x: number; y: number; z?: number } }[];
  /** A workflow's sets and steps moved with the rest: where each set's frame, and each step's card, now stands. */
  sets?: { id: number; x0: number; y0: number; x1: number; y1: number }[];
  steps?: { id: number; x: number; y: number }[];
  /** Charges and R, S, E and Z put by hand, turned with the rest: where each now stands from what it is of (`withMarksAt`). */
  markAts?: MarksAt;
};

/** Where marks put by hand stand from what they are of - each atom's charge and R or S, each bond's E or Z - none, put back. */
export type MarksAt = { atoms: { id: number; chargeAt?: MarkAt; stereoAt?: MarkAt }[]; bonds: { id: number; stereoAt?: MarkAt }[] };

/** `doc` with the arrows, pluses, molecules in 3D, sets and steps `places` names where it says. */
export function placeMarks(doc: WorkspaceDocument, places?: MarkPlaces): WorkspaceDocument {
  if (places?.markAts) return placeMarks(withMarksAt(doc, places.markAts), { ...places, markAts: undefined });
  if (places?.molecules3d?.length) return placeMarks(moveMolecules3d(doc, places.molecules3d), { ...places, molecules3d: [] });
  if (places?.texts?.length) {
    const at = new Map(places.texts.map((t) => [t.id, t]));
    const placed = { ...doc, texts: (doc.texts ?? []).map((t) => (at.has(t.id) && t.at ? { ...t, at: { x: at.get(t.id)!.x, y: at.get(t.id)!.y } } : t)) };
    return placeMarks(placed, { ...places, texts: [] });
  }
  if (places?.pictures?.length) {
    const at = new Map(places.pictures.map((p) => [p.id, p]));
    const placed = {
      ...doc,
      pictures: (doc.pictures ?? []).map((p) => {
        const q = at.get(p.id);
        if (!q) return p;
        const { turn: _, ...kept } = p;
        return { ...kept, x: q.x, y: q.y, ...turnOf(q.turn !== undefined ? q.turn : p.turn) };
      }),
    };
    return placeMarks(placed, { ...places, pictures: [] });
  }
  if (places?.sets?.length || places?.steps?.length) {
    const setAt = new Map((places.sets ?? []).map((b) => [b.id, b]));
    const stepAt = new Map((places.steps ?? []).map((s) => [s.id, s]));
    const placed = {
      ...doc,
      ...(doc.sets ? { sets: doc.sets.map((b) => (setAt.has(b.id) ? { ...b, ...setAt.get(b.id)!, id: b.id } : b)) } : {}),
      ...(doc.steps ? { steps: doc.steps.map((s) => (stepAt.has(s.id) ? { ...s, x: stepAt.get(s.id)!.x, y: stepAt.get(s.id)!.y } : s)) } : {}),
    };
    return placeMarks(placed, { ...places, sets: [], steps: [] });
  }
  if (!places?.arrows?.length && !places?.pluses?.length && !places?.captions?.length) return doc;
  const arrowAt = new Map((places.arrows ?? []).map((p) => [p.id, p]));
  const plusAt = new Map((places.pluses ?? []).map((p) => [p.id, p]));
  const captionAt = new Map((places.captions ?? []).map((p) => [p.id, p]));
  const at = <T extends { id: number; x: number; y: number }>(t: T, m: Map<number, { x: number; y: number }>): T => {
    const p = m.get(t.id);
    return p ? { ...t, x: p.x, y: p.y } : t;
  };
  // (words over an arrow moved, and not moved themselves, go as far as it went)
  const by = new Map<number, { x: number; y: number }>();
  for (const a of doc.arrows) {
    const p = arrowAt.get(a.id);
    if (p) by.set(a.id, { x: p.x - a.x, y: p.y - a.y });
  }
  const moved = {
    ...doc,
    arrows: doc.arrows.map((a) => at(a, arrowAt)),
    pluses: (doc.pluses ?? []).map((p) => at(p, plusAt)),
    ...(doc.captions ? { captions: doc.captions.map((c) => at(c, captionAt)) } : {}),
  };
  return withCaptionsBy(moved, by, new Set(captionAt.keys()));
}

/** Something a hand can put a mark of: an atom's charge, an atom's R or S, a bond's E or Z. */
export type MarkOf = { atom: number; kind: "charge" | "stereo" } | { bond: number };

/** `doc` with a mark put where a hand put it - `at`, from what it is of - or (null) back where the drawing puts it. */
export function putMark(doc: WorkspaceDocument, of: MarkOf, at: MarkAt | null): WorkspaceDocument {
  const same = (p?: MarkAt) => (p && at ? p.x === at.x && p.y === at.y : !p && !at);
  if ("bond" in of) {
    const b = doc.model.bonds.find((x) => x.id === of.bond);
    if (!b || same(b.stereoAt)) return doc;
    return withMarksAt(doc, { atoms: [], bonds: [{ id: b.id, ...(at ? { stereoAt: at } : {}) }] });
  }
  const a = doc.model.atoms.find((x) => x.id === of.atom);
  const key = of.kind === "charge" ? "chargeAt" : "stereoAt";
  if (!a || same(a[key])) return doc;
  return withMarksAt(doc, { atoms: [{ id: a.id, chargeAt: a.chargeAt, stereoAt: a.stereoAt, [key]: at ?? undefined }], bonds: [] });
}

/** `doc` with the marks of the atoms and bonds `marks` names standing where it says - those it leaves unset put back. */
export function withMarksAt(doc: WorkspaceDocument, marks: MarksAt): WorkspaceDocument {
  const atomAt = new Map(marks.atoms.map((m) => [m.id, m]));
  const bondAt = new Map(marks.bonds.map((m) => [m.id, m]));
  let changed = false;
  const same = (p?: MarkAt, q?: MarkAt) => (p && q ? p.x === q.x && p.y === q.y : !p && !q);
  const atoms = doc.model.atoms.map((a) => {
    const m = atomAt.get(a.id);
    if (!m || (same(a.chargeAt, m.chargeAt) && same(a.stereoAt, m.stereoAt))) return a;
    changed = true;
    const { chargeAt: _q, stereoAt: _s, ...rest } = a;
    return { ...rest, ...(m.chargeAt ? { chargeAt: m.chargeAt } : {}), ...(m.stereoAt ? { stereoAt: m.stereoAt } : {}) };
  });
  const bonds = doc.model.bonds.map((b) => {
    const m = bondAt.get(b.id);
    if (!m || same(b.stereoAt, m.stereoAt)) return b;
    changed = true;
    const { stereoAt: _s, ...rest } = b;
    return { ...rest, ...(m.stereoAt ? { stereoAt: m.stereoAt } : {}) };
  });
  return changed ? { ...doc, model: { atoms, bonds } } : doc;
}

/** `doc` without the atoms and bonds given, nor the arrows, pluses and words: what a cut takes. */
export function deleteDrawn(
  doc: WorkspaceDocument,
  atoms: Set<number>,
  bonds: Set<number>,
  arrows: Set<number>,
  pluses: Set<number>,
  captions: Set<number> = new Set(),
): WorkspaceDocument {
  const rest = atoms.size || bonds.size ? deleteParts(doc, atoms, bonds) : doc;
  const keptArrows = rest.arrows.filter((a) => !arrows.has(a.id));
  const keptPluses = (rest.pluses ?? []).filter((p) => !pluses.has(p.id));
  const keptCaptions = (rest.captions ?? []).filter((c) => !captions.has(c.id));
  if (
    keptArrows.length === rest.arrows.length &&
    keptPluses.length === (rest.pluses ?? []).length &&
    keptCaptions.length === (rest.captions ?? []).length
  ) {
    return rest;
  }
  return withoutArrowsOf({ ...rest, arrows: keptArrows, pluses: keptPluses, captions: keptCaptions }, arrows);
}

// --- words ---------------------------------------------------------------------

/** `doc` with words added where `c` says; they are numbered `nextCaptionId`. */
export function addCaption(doc: WorkspaceDocument, c: Omit<Caption, "id">): WorkspaceDocument {
  const id = doc.nextCaptionId ?? 1;
  return { ...doc, nextCaptionId: id + 1, captions: [...(doc.captions ?? []), { ...c, id }] };
}

/** `doc` with the words `id` changed: written anew, moved, put over an arrow or (null) taken from it. */
export function updateCaption(
  doc: WorkspaceDocument,
  id: number,
  patch: { text?: string; x?: number; y?: number; arrow?: number | null; width?: number | null; align?: "left" | "center" | "right" | "justify" },
): WorkspaceDocument {
  const captions = doc.captions ?? [];
  const index = captions.findIndex((c) => c.id === id);
  if (index < 0) return doc;
  const { arrow, width, align, ...rest } = patch;
  const was = captions[index];
  // (over the arrow it was over, unless said; as wide as it was, unless said - none, as its words)
  const link = arrow === undefined ? was.arrow : (arrow ?? undefined);
  const wide = width === undefined ? was.width : width != null && width > 0 ? width : undefined;
  // (centred, unless said otherwise)
  const lie = align === undefined ? was.align : align === "center" ? undefined : align;
  const { arrow: _was, width: _wide, align: _lie, ...kept } = was;
  const next: Caption = { ...kept, ...rest, ...(link != null ? { arrow: link } : {}), ...(wide != null ? { width: wide } : {}), ...(lie ? { align: lie } : {}) };
  if (next.text === was.text && next.x === was.x && next.y === was.y && next.arrow === was.arrow && next.width === was.width && next.align === was.align) return doc;
  const out = captions.slice();
  out[index] = next;
  return { ...doc, captions: out };
}

// --- PDFs ------------------------------------------------------------------

/** `doc` with a PDF on the page. */
export function addPdf(doc: WorkspaceDocument, pdf: Omit<PdfItem, "id">): WorkspaceDocument {
  const id = doc.nextPdfId ?? 1;
  return { ...doc, pdfs: [...(doc.pdfs ?? []), { ...pdf, id }], nextPdfId: id + 1 };
}

/** `doc` with a PDF moved, turned to another page, spread, its pages put back in their rows (`placed: null`), or made an icon - unchanged where it has no such PDF, or the page is none of its. */
export function updatePdf(
  doc: WorkspaceDocument,
  id: number,
  patch: Partial<Pick<PdfItem, "x" | "y" | "page" | "spread" | "icon">> & { reading?: PdfItem["reading"] | null; placed?: null },
): WorkspaceDocument {
  const pdf = doc.pdfs?.find((p) => p.id === id);
  if (!pdf) return doc;
  if (patch.page != null && (!Number.isInteger(patch.page) || patch.page < 0 || patch.page >= pdf.pages.length)) return doc;
  const { reading, placed, ...rest } = patch;
  const next: PdfItem = { ...pdf, ...rest };
  if (next.spread === false) delete next.spread;
  if (next.icon === false) delete next.icon;
  if (placed === null) {
    if (!pdf.placed) return doc;
    delete next.placed;
  }
  // (read no longer; or read from where it was, no further than its last page, neither far smaller nor far larger)
  if (reading === null) delete next.reading;
  else if (reading) next.reading = readingOf(reading, pdf.pages.length);
  return { ...doc, pdfs: doc.pdfs!.map((p) => (p.id === id ? next : p)) };
}

/**
 * `doc` with a page of a PDF put in a place of its own, its middle at
 * (x, y) on the page - kept from where the PDF lies, so that it goes with
 * it - on top of its other pages: unchanged where it has no such PDF or
 * page, or the page lies there already.
 */
export function placePdfPage(doc: WorkspaceDocument, id: number, page: number, x: number, y: number): WorkspaceDocument {
  const pdf = doc.pdfs?.find((p) => p.id === id);
  if (!pdf || !Number.isInteger(page) || page < 0 || page >= pdf.pages.length || !Number.isFinite(x) || !Number.isFinite(y)) return doc;
  const was = pdf.placed ?? [];
  const at = { page, x: x - pdf.x, y: y - pdf.y };
  const last = was[was.length - 1];
  if (last && last.page === page && last.x === at.x && last.y === at.y) return doc;
  const next: PdfItem = { ...pdf, placed: [...was.filter((q) => q.page !== page), at] };
  return { ...doc, pdfs: doc.pdfs!.map((p) => (p.id === id ? next : p)) };
}

/** `doc` without a PDF. */
/** Where a PDF is read in the column, as far as it can be: its pages there, at a size between a quarter and eight times the column's width. */
export function readingOf(r: { at: number; zoom: number }, pages: number): NonNullable<PdfItem["reading"]> {
  const at = Number.isFinite(r.at) ? Math.min(Math.max(0, r.at), Math.max(0, pages - 1) + 0.999) : 0;
  const zoom = Number.isFinite(r.zoom) ? Math.min(8, Math.max(0.25, r.zoom)) : 1;
  return { at, zoom };
}

export function removePdf(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  if (!doc.pdfs?.some((p) => p.id === id)) return doc;
  return { ...doc, pdfs: doc.pdfs.filter((p) => p.id !== id) };
}

// --- pictures ------------------------------------------------------------------

/** A turn kept as it is - an angle, from -π to π - and none where it is none. */
function turnOf(turn: number | undefined): { turn?: number } {
  if (!turn) return {};
  const t = Math.atan2(Math.sin(turn), Math.cos(turn));
  return Math.abs(t) < 1e-9 ? {} : { turn: t };
}

/**
 * Pictures held, as they go on the page: each as it would be printed
 * (lib/picture/image `printedSize`), the first's middle at `at`, the others
 * to its right, a bond apart.
 */
export function picturesInRow(held: readonly PictureToAdd[], at: { x: number; y: number }): Omit<PictureItem, "id">[] {
  const out: Omit<PictureItem, "id">[] = [];
  let x = at.x;
  for (const h of held) {
    if (typeof h?.name !== "string" || typeof h.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(h.sha256)) continue;
    if ((h.media !== "image/png" && h.media !== "image/jpeg") || !(h.width > 0) || !(h.height > 0)) continue;
    const size = printedSize(h);
    const w = size.w * POINT;
    if (out.length) x += w / 2;
    out.push({ name: h.name, sha256: h.sha256, media: h.media, px: [h.width, h.height], x, y: at.y, w, h: size.h * POINT, ...(h.from ? { from: h.from } : {}) });
    x += w / 2 + NOMINAL_BOND_LENGTH;
  }
  return out;
}

/** A row of pictures put down clear of what lies there - other pictures, PDFs and their names - moved along to the right until none lies over it. */
export function clearOfPictures<T extends Omit<PictureItem, "id">>(row: T[], doc: Pick<WorkspaceDocument, "pictures" | "pdfs">): T[] {
  if (!row.length) return row;
  const box = (p: Pick<PictureItem, "x" | "y" | "w" | "h" | "turn">) => {
    const c = Math.abs(Math.cos(p.turn ?? 0));
    const s = Math.abs(Math.sin(p.turn ?? 0));
    const hw = (p.w * c + p.h * s) / 2;
    const hh = (p.w * s + p.h * c) / 2;
    return { x0: p.x - hw, x1: p.x + hw, y0: p.y - hh, y1: p.y + hh };
  };
  const taken = [...(doc.pictures ?? []).map(box), ...(doc.pdfs ?? []).map(pdfRoom)];
  const step = Math.max(...row.map((p) => p.w)) / 2 + NOMINAL_BOND_LENGTH;
  for (let n = 0; n < 200; n++) {
    const moved = row.map((p) => ({ ...p, x: p.x + n * step }));
    if (!moved.some((p) => taken.some((t) => overlaps(box(p), t)))) return moved;
  }
  return row;
}

/** `doc` with a picture put on the page; it is numbered `nextPictureId`. */
export function addPicture(doc: WorkspaceDocument, picture: Omit<PictureItem, "id">): WorkspaceDocument {
  const id = doc.nextPictureId ?? 1;
  return { ...doc, pictures: [...(doc.pictures ?? []), { ...picture, id }], nextPictureId: id + 1 };
}

/** `doc` with the picture `id` moved, made larger or smaller - never to nothing - or turned. */
export function updatePicture(doc: WorkspaceDocument, id: number, patch: Partial<Pick<PictureItem, "x" | "y" | "w" | "h" | "turn">>): WorkspaceDocument {
  const was = doc.pictures?.find((p) => p.id === id);
  if (!was) return doc;
  const { turn, ...rest } = patch;
  const { turn: _, ...kept } = was;
  const next: PictureItem = { ...kept, ...rest, ...turnOf(turn !== undefined ? turn : was.turn) };
  if (!(next.w > 0) || !(next.h > 0) || ![next.x, next.y, next.w, next.h].every(Number.isFinite)) return doc;
  return { ...doc, pictures: doc.pictures!.map((p) => (p.id === id ? next : p)) };
}

/** `doc` without the pictures `ids`. */
export function removePictures(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  if (!doc.pictures?.some((p) => gone.has(p.id))) return doc;
  return { ...doc, pictures: doc.pictures.filter((p) => !gone.has(p.id)) };
}

export function removeCaption(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const captions = (doc.captions ?? []).filter((c) => c.id !== id);
  return captions.length === (doc.captions ?? []).length ? doc : { ...doc, captions };
}

/** `doc` with the words over each arrow `by` names moved as far as it says - but those `still` - as their arrow went. */
function withCaptionsBy(doc: WorkspaceDocument, by: Map<number, { x: number; y: number }>, still: ReadonlySet<number> = new Set()): WorkspaceDocument {
  if (!doc.captions?.some((c) => c.arrow != null && by.has(c.arrow) && !still.has(c.id))) return doc;
  return {
    ...doc,
    captions: doc.captions.map((c) => {
      const d = c.arrow != null && !still.has(c.id) ? by.get(c.arrow) : undefined;
      return d && (d.x || d.y) ? { ...c, x: c.x + d.x, y: c.y + d.y } : c;
    }),
  };
}

/** `doc` with the words over the arrows `gone` left where they are, over nothing. */
function withoutArrowsOf(doc: WorkspaceDocument, gone: ReadonlySet<number>): WorkspaceDocument {
  if (!doc.captions?.some((c) => c.arrow != null && gone.has(c.arrow))) return doc;
  return {
    ...doc,
    captions: doc.captions.map((c) => {
      if (c.arrow == null || !gone.has(c.arrow)) return c;
      const { arrow: _arrow, ...rest } = c;
      return rest;
    }),
  };
}

// --- aromatic circles ------------------------------------------------------

export function setAromaticEnabled(
  doc: WorkspaceDocument,
  enabled: boolean,
): WorkspaceDocument {
  return doc.aromaticEnabled === enabled
    ? doc
    : { ...doc, aromaticEnabled: enabled };
}

/** Gives the document its own drawing style, or (undefined) the application's. */
export function setDocumentStyle(
  doc: WorkspaceDocument,
  style: StyleChoice | undefined,
): WorkspaceDocument {
  if (doc.style === style) return doc;
  if (style === undefined) {
    const { style: _dropped, ...rest } = doc;
    return rest;
  }
  return { ...doc, style };
}

export function setRingEnabled(
  doc: WorkspaceDocument,
  key: string,
  enabled: boolean,
): WorkspaceDocument {
  if (!!doc.aromaticRings[key] === enabled) return doc;
  return { ...doc, aromaticRings: { ...doc.aromaticRings, [key]: enabled } };
}

// --- texts -------------------------------------------------------------------

/**
 * Texts added, each after those it holds, and the id of the last: one it
 * holds already - the same name and text - not added again, its id given;
 * one with no name, a new one, named (utils/texts `newTextName`).
 */
export function addTexts(
  doc: WorkspaceDocument,
  texts: readonly Omit<WorkspaceText, "id">[],
): { doc: WorkspaceDocument; last: number | null } {
  const held = (doc.texts ?? []).slice();
  let next = doc.nextTextId ?? Math.max(0, ...held.map((t) => t.id)) + 1;
  let last: number | null = null;
  for (const t of texts) {
    const same = held.find((h) => h.name === t.name && h.text === t.text);
    if (same) {
      last = same.id;
      continue;
    }
    held.push({ id: next, name: t.name || newTextName(held), text: t.text, ...(t.path ? { path: t.path } : {}), ...(t.at ? { at: t.at } : {}), ...(t.reading === false ? { reading: false as const } : {}), ...(t.icon ? { icon: true as const } : {}), ...(t.of ? { of: t.of } : {}) });
    last = next++;
  }
  if (held.length === (doc.texts ?? []).length) return { doc, last };
  return { doc: { ...doc, texts: held, nextTextId: next }, last };
}

/** A text changed to `text`. */
export function editText(doc: WorkspaceDocument, id: number, text: string): WorkspaceDocument {
  const at = (doc.texts ?? []).findIndex((t) => t.id === id);
  if (at < 0 || doc.texts![at].text === text) return doc;
  const texts = doc.texts!.slice();
  texts[at] = { ...texts[at], text };
  return { ...doc, texts };
}

/** A text taken out. */
export function removeText(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  if (!(doc.texts ?? []).some((t) => t.id === id)) return doc;
  return { ...doc, texts: doc.texts!.filter((t) => t.id !== id) };
}

/** A text's sheet made an icon, or shown full size again. */
export function setTextIcon(doc: WorkspaceDocument, id: number, icon: boolean): WorkspaceDocument {
  const at = (doc.texts ?? []).findIndex((t) => t.id === id);
  if (at < 0 || !doc.texts![at].at || !!doc.texts![at].icon === icon) return doc;
  const texts = doc.texts!.slice();
  const { icon: _, ...rest } = texts[at];
  texts[at] = icon ? { ...rest, icon: true } : rest;
  return { ...doc, texts };
}

/** What a text without a sheet is the text of, its body on the page: a step, or a molecule. */
export function setTextOf(doc: WorkspaceDocument, id: number, of: TextOf): WorkspaceDocument {
  const at = (doc.texts ?? []).findIndex((t) => t.id === id);
  if (at < 0 || doc.texts![at].at || JSON.stringify(doc.texts![at].of) === JSON.stringify(of)) return doc;
  const texts = doc.texts!.slice();
  texts[at] = { ...texts[at], of };
  return { ...doc, texts };
}

/** The texts `ids` taken out. */
export function removeTexts(doc: WorkspaceDocument, ids: ReadonlySet<number>): WorkspaceDocument {
  if (!ids.size || !(doc.texts ?? []).some((t) => ids.has(t.id))) return doc;
  return { ...doc, texts: doc.texts!.filter((t) => !ids.has(t.id)) };
}

/** A text read in the column, as a tab there - or not, its sheet on the page all of it. */
export function setTextReading(doc: WorkspaceDocument, id: number, reading: boolean): WorkspaceDocument {
  const at = (doc.texts ?? []).findIndex((t) => t.id === id);
  if (at < 0 || (doc.texts![at].reading !== false) === reading) return doc;
  const texts = doc.texts!.slice();
  const { reading: _, ...rest } = texts[at];
  texts[at] = reading ? rest : { ...rest, reading: false };
  return { ...doc, texts };
}

/**
 * Texts as they go on the page, each a sheet (utils/textSheets) made an
 * icon as a PDF is at first: the first's middle at `at`, the others to its
 * right, room for their names between them - all put down clear of what
 * lies there, pictures, PDFs and other sheets.
 */
export function textsInRow<T extends Omit<WorkspaceText, "id">>(texts: readonly T[], at: { x: number; y: number }, doc: Pick<WorkspaceDocument, "pictures" | "pdfs" | "texts">): (T & { at: { x: number; y: number }; icon: true })[] {
  const step = ICON_NAME_WIDTH + NOMINAL_BOND_LENGTH;
  // (each by its top left, its middle where it goes)
  const row = texts.map((t, i) => {
    const s = sheetOf(t.text, t.name);
    return { ...t, at: { x: at.x + i * step - s.w / 2, y: at.y + s.h / 2 }, icon: true as const };
  });
  const taken = [
    ...(doc.pictures ?? []).map((p) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 })),
    ...(doc.pdfs ?? []).map(pdfRoom),
    ...(doc.texts ?? []).flatMap((t) => sheetRoom(t) ?? []),
  ];
  for (let n = 0; n < 200; n++) {
    const moved = row.map((t) => ({ ...t, at: { x: t.at.x + n * step, y: t.at.y } }));
    if (!moved.some((t) => taken.some((b) => overlaps(sheetRoom(t)!, b)))) return moved;
  }
  return row;
}
