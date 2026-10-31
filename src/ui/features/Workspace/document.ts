/**
 * The 2D editor's document: what a workspace tab actually contains, and what
 * undo, redo and (later) saving act on. Everything here is pure - the store
 * calls these through `document.edit()` so each gesture becomes one step.
 *
 * What is deliberately *not* here: hover, drag previews, the camera, the label
 * edit buffer, fit requests. Those belong to the view (see store/).
 */
import { numbersWith, type AtomNumberKind } from "./utils/atomNumbers";
import { createDocument, type DocumentStore } from "../../../lib/doc";
import { bondChem, chemistry, type AtomChem } from "../../../lib/chem/molecule";
import { placedAbbreviation, placedStructure } from "../../../lib/chem/abbreviationPlace";
import type { GroupStructure } from "../../../lib/chem/ligands";
import { isElementSymbol } from "../../../lib/roles/molblock";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { DEFAULT_STYLE_CHOICE, styleOf, type StyleChoice } from "../../../lib/chem/style";
import { groupTurn } from "./utils/expandPlace";
import { magnificationWithin } from "./utils/magnified";
import { magnifiedTo, oneMagnificationEach } from "../../../lib/chem/magnified2d";
import { DEFAULT_WORKSPACE_3D, type Workspace3D } from "../../../lib/chem/workspaceStyle3d";
import { pathLength, pointAlong, type ArrowLook } from "../../../lib/chem/reactionArrow";
import { arrowPoints } from "../../../lib/chem/reactionScheme";
import { mapAtoms, mapMarks, mapStanding } from "./chem/atomMap";
import { etaHeld } from "./chem/eta";
import type { Arrow, ArrowAtomMap, ArrowFormPatch, Atom, Bond, Caption, CarriedList, Drawn, Look3D, MarkAt, Model, Molecule3D, PdfItem, PictureItem, PictureToAdd, Plus, PushArrow, PushEnd, RingFills, CaptionPatch, Ink, InkLook, Shape, ShapePatch, Slide, TextOf, Wire, WorkflowSet, WorkflowStep, WorkspaceText, LostText } from "./store/types";
import { sha256Hex } from "../../../lib/binary/sha256";
import { ringKeyOf, ringThere } from "./utils/rings";
import { addedStacks, freshRecordsId, freshStackId, settledRecords, unmarked } from "./utils/stacks";
import type { WordsMark } from "../../../lib/chem/captions";
import { isBox, moved as shapeMoved } from "../../../lib/chem/shapes";
import { GAP_MOST, type Cycle, type CycleBranch } from "../../../lib/chem/cycle";
import type { InkStroke } from "../../../lib/chem/ink";
import { ICON_NAME_WIDTH, pdfRoom, POINT, scaleOf } from "../../../lib/pdf/layout";
import { sheetOf, sheetRoom } from "./utils/textSheets";
import { PICTURE_MEDIA, printedSize } from "../../../lib/picture/image";
import { readerLine, sameAtoms, type Found, type Unread } from "../../../lib/calc/read";
import { readResults } from "../../../lib/calc/results";
import { inMenosForm, type CalcInfo } from "../../../lib/calc/output";
import { newTextName } from "./utils/texts";
import { fitSets, membersSettled } from "./workflow/model";

export type WorkspaceDocument = {
  model: Model;
  arrows: Arrow[];
  /** The "+" signs of a reaction scheme. */
  pluses: Plus[];
  /** The electron-pushing arrows, each from and to atoms and bonds by id. */
  pushes?: PushArrow[];
  nextPushId?: number;
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
  /** The rings filled with a colour, by ring key (`RingFills`). */
  ringFills?: RingFills;
  /** Ids are handed out from one counter shared by atoms and bonds. */
  nextId: number;
  nextArrowId: number;
  nextPlusId: number;
  /** Molecules in 3D standing on the page, beside what is drawn. */
  molecules3d?: Molecule3D[];
  nextMolecule3dId?: number;
  /**
   * The workspace's drawing style, its one: every structure on it is drawn
   * in it. Fixed as the workspace is made - Settings' then, which is for
   * new workspaces only - and changed from its canvas (docs/WORKSPACE.md,
   * *Drawing style*). Saving to a MOL or SD file keeps the structure only.
   */
  /**
   * Which page this is, where it was opened from a file: a new one each time,
   * kept through its edits and its changes of style - so that the view
   * follows a change of style on one page (components/FollowStyle), not the
   * going over to another. Never saved.
   */
  pageId?: number;
  style: StyleChoice;
  /**
   * Its styles in 3D, as its drawing style: its primary and its secondary,
   * each whole, and its light - fixed as it is made, Settings' then, and
   * changed from its canvas (lib/chem/workspaceStyle3d; docs/WORKSPACE.md,
   * *Styles in 3D*).
   */
  style3d: Workspace3D;
  /**
   * The atoms *Expand abbreviation* drew out last, which the Clean-up
   * straight after it leaves drawn out (chem/cleanUp). Not saved.
   */
  expanded?: number[];
  /** The texts it holds, read and edited in the column beside the canvas. */
  texts?: WorkspaceText[];
  /** The texts its file was to hold that could not be read, shown in the column as what they are (store/types `LostText`); their ids the texts'. */
  textsLost?: LostText[];
  nextTextId?: number;
  /** The PDFs on the page (docs/PDF.md). */
  pdfs?: PdfItem[];
  nextPdfId?: number;
  /** The pictures on the page (docs/PDF.md, *A picture*). */
  pictures?: PictureItem[];
  nextPictureId?: number;
  /** The slides on the page, in the order a talk shows them (docs/PRESENTING.md). */
  slides?: Slide[];
  nextSlideId?: number;
  /** The shapes on the page, from the back (docs/PRESENTING.md, *Shapes*). */
  shapes?: Shape[];
  nextShapeId?: number;
  /** Writing by hand on the page, each piece of it in the order written (docs/PRESENTING.md, *Handwriting*). */
  inks?: Ink[];
  nextInkId?: number;
  /** Catalytic cycles on the page (lib/chem/cycle; docs/EDITOR-2D.md, *Catalytic cycles*). */
  cycles?: Cycle[];
  nextCycleId?: number;
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
    !doc.textsLost?.length &&
    !doc.pdfs?.length &&
    !doc.pictures?.length &&
    !doc.slides?.length &&
    !doc.shapes?.length &&
    !doc.inks?.length &&
    !doc.cycles?.length &&
    !doc.sets?.length &&
    !doc.steps?.length
  );
}

/** An empty workspace in `style` - by default Meno's own, for a document that is only worked on, never shown. */
let pages = 0;
/** A page's id, new (`pageId`). */
export const newPageId = (): number => ++pages;

export function emptyWorkspaceDocument(style: StyleChoice = DEFAULT_STYLE_CHOICE, style3d: Workspace3D = DEFAULT_WORKSPACE_3D): WorkspaceDocument {
  return {
    style,
    style3d,
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
 * Builds a document for a workspace tab, in `style` and `style3d` -
 * Settings' as it is made, given by whoever makes it (views/registry):
 * this module reads no settings. The tab's data may carry a file to import (`payload`), which
 * the view parses and applies, so the document starts empty here - or
 * files opened as text (`texts`), which it starts holding.
 */
export function createWorkspaceDocument(data?: unknown, style: StyleChoice = DEFAULT_STYLE_CHOICE, style3d: Workspace3D = DEFAULT_WORKSPACE_3D): DocumentStore<WorkspaceDocument> {
  const opened = (data as { texts?: unknown } | null | undefined)?.texts;
  const texts = (Array.isArray(opened) ? (opened as Partial<WorkspaceText>[]) : []).flatMap((t) =>
    typeof t?.name === "string" && typeof t.text === "string"
      ? [{ name: t.name, text: t.text, ...(typeof t.path === "string" ? { path: t.path } : {}) }]
      : [],
  );
  // (PDFs opened on a canvas of their own: in a row from the middle of the page - and pictures likewise)
  const held = (data as { pdfs?: unknown } | null | undefined)?.pdfs;
  let doc = addTexts(emptyWorkspaceDocument(style, style3d), texts).doc;
  for (const p of pdfsInRow(Array.isArray(held) ? held : [], { x: 0, y: 0 })) doc = addPdf(doc, p);
  const pictures = (data as { pictures?: unknown } | null | undefined)?.pictures;
  for (const p of picturesInRow(Array.isArray(pictures) ? (pictures as PictureToAdd[]) : [], { x: 0, y: 0 })) doc = addPicture(doc, p);
  // (each edit's sets grown to keep what is drawn on in them inside them, as
  // part of it - and its stacks of drawings kept whole: utils/stacks)
  // (its history held to about 100 MB: what a step costs is the atoms and
  // bonds it copies - the lists a drawing's edit makes anew, not those it
  // shares with the step before; the maintainer, 2026-10-13)
  return createDocument<WorkspaceDocument>(doc, { settle: (next, before) => withRecordsSettled(membersSettled(fitSets(withOneMagnification(next, before), before), before), before), cost: stepCost });
}

/** What keeping a workspace's state in its history costs beyond the one before it: the atom and bond lists it does not share with it. */
export function stepCost(state: WorkspaceDocument, before: WorkspaceDocument | undefined): number {
  const { atoms, bonds } = state.model;
  return (atoms !== before?.model.atoms ? atoms.length : 0) + (bonds !== before?.model.bonds ? bonds.length : 0);
}

/**
 * `doc` with each structure of its drawing shown at one magnification, as
 * an edit leaves it (lib/chem/magnified2d `oneMagnificationEach`): two
 * structures joined, atoms added to one, take the one most of its atoms
 * say. As it was where its drawing did not change.
 */
export function withOneMagnification(doc: WorkspaceDocument, before?: WorkspaceDocument): WorkspaceDocument {
  if (before && doc.model === before.model) return doc;
  if (!doc.model.atoms.some((a) => a.magnified != null)) return doc;
  const atoms = oneMagnificationEach(doc.model.atoms, doc.model.bonds);
  return atoms === doc.model.atoms ? doc : { ...doc, model: { ...doc.model, atoms: atoms as Atom[] } };
}

/**
 * Structures in 2D shown `k` times as large as they are (docs/WORKSPACE.md,
 * *Magnified display*): each structure holding one of the atoms `ids`,
 * about its own centre - held where it is shown, its atoms so many times as
 * far apart, each saying so. At 1, at their true size again.
 */
export function setMagnified2d(doc: WorkspaceDocument, ids: readonly number[], k: number): WorkspaceDocument {
  const to = magnificationWithin(k);
  const atoms = magnifiedTo(doc.model.atoms, doc.model.bonds, new Set(ids), to);
  return atoms.every((a, i) => a === doc.model.atoms[i]) ? doc : { ...doc, model: { ...doc.model, atoms } };
}

/** `doc` with the atoms `ids` that were read from a figure said to have been checked against it, or not (FigureSpot `checked`). */
export function setFigureChecked(doc: WorkspaceDocument, ids: readonly number[], checked: boolean): WorkspaceDocument {
  const these = new Set(ids);
  let changed = false;
  const atoms = doc.model.atoms.map((a) => {
    if (!these.has(a.id) || !a.seen || !!a.seen.checked === checked) return a;
    changed = true;
    const { checked: _was, ...seen } = a.seen;
    return { ...a, seen: checked ? { ...seen, checked: true as const } : seen };
  });
  return changed ? { ...doc, model: { ...doc.model, atoms } } : doc;
}

/** `doc` with its stacks of drawings kept whole as an edit leaves them (utils/stacks `settledRecords`). */
export function withRecordsSettled(doc: WorkspaceDocument, before?: WorkspaceDocument): WorkspaceDocument {
  if (before && doc.model === before.model) return doc;
  // (a haptic bond held to its ring, its star at the ring's centre: chem/eta)
  const model = etaHeld(settledRecords(doc.model, before?.model), before?.model);
  return model === doc.model ? doc : { ...doc, model };
}

/**
 * A part's haptic bonds kept to the ring they bind: where a bond's
 * endpoints are not all atoms of the part, the bond binds no ring and keeps
 * none (a plain bond to its star). Left as they were, endpoints named atoms
 * gone, drawn from nowhere, and a set round the complex took a frame of
 * NaN (a document fuzzer, 2026-10-13). An edit to the
 * drawing takes such a bond away with its star instead (chem/eta `etaHeld`).
 */
export function endpointsHeld(model: Model): Model {
  if (!model.bonds.some((b) => b.endpoints?.length)) return model;
  const there = new Set(model.atoms.map((a) => a.id));
  let changed = false;
  const bonds = model.bonds.map((b) => {
    if (!b.endpoints?.length || b.endpoints.every((e) => there.has(e))) return b;
    changed = true;
    const { endpoints: _gone, attach: _attach, ...rest } = b;
    return rest as Bond;
  });
  return changed ? { ...model, bonds } : model;
}

/**
 * Metal `metal` bound to `ring` through all its atoms: one bond from the
 * metal to a star at the ring's centre, its endpoints the ring's atoms, as
 * the CTfile's multi-centre bond is (ATTACH=ALL; chem/eta). Nothing, where
 * an atom is missing or the metal is one of them.
 */
export function bindRing(doc: WorkspaceDocument, metal: number, ring: readonly number[]): WorkspaceDocument {
  const at = new Map(doc.model.atoms.map((a) => [a.id, a]));
  if (!at.has(metal) || ring.length < 2 || ring.includes(metal) || !ring.every((id) => at.has(id))) return doc;
  const star = doc.nextId;
  const x = ring.reduce((s, id) => s + at.get(id)!.x, 0) / ring.length;
  const y = ring.reduce((s, id) => s + at.get(id)!.y, 0) / ring.length;
  const bond: Bond = { id: star + 1, a: metal, b: star, order: 1, coordination: true, endpoints: [...ring], attach: "all", stereo: "none", stereoOrient: "principle" };
  return {
    ...doc,
    nextId: star + 2,
    model: { atoms: [...doc.model.atoms, { id: star, x, y, r: 0.9, el: "*" }], bonds: [...doc.model.bonds, bond] },
  };
}

/** A row of PDFs put down clear of those already on the page: moved along to the right, a place at a time, until none of them, nor their names, lies over another. */
export function clearOfPdfs<T extends Omit<PdfItem, "id">>(row: T[], others: readonly Omit<PdfItem, "id">[]): T[] {
  const room = (p: Omit<PdfItem, "id">) => pdfRoom(p);
  const taken = others.map(room);
  const step = ICON_NAME_WIDTH * scaleOf(row[0] ?? {}) + NOMINAL_BOND_LENGTH;
  for (let n = 0; n < 200; n++) {
    const moved = row.map((p) => ({ ...p, x: p.x + n * step }));
    if (!moved.some((p) => taken.some((t) => overlaps(room(p), t)))) return moved;
  }
  return row;
}

const overlaps = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** PDFs held, as they go on the page, laid at `point` (the workspace's, lib/pdf/layout `pointFor`): the first's top page in the middle of `at`, the others to its right, a little apart. */
export function pdfsInRow(held: readonly unknown[], at: { x: number; y: number }, point = POINT): Omit<PdfItem, "id">[] {
  const out: Omit<PdfItem, "id">[] = [];
  let x = at.x;
  for (const h of held as Partial<PdfItem>[]) {
    const pages = Array.isArray(h?.pages) ? h.pages.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v) && v > 0)) : [];
    if (typeof h?.name !== "string" || typeof h.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(h.sha256) || !pages.length) continue;
    // (each an icon at first, room for its name beside the next)
    const w = (ICON_NAME_WIDTH * point) / POINT;
    if (out.length) x += w / 2;
    out.push({ name: h.name, sha256: h.sha256, pages, x, y: at.y, page: 0, icon: true, ...(point !== POINT ? { point } : {}) });
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
  // (each bond's ends by id, not looked for among every atom: everything
  // selected in a drawing of 28 000 atoms took 10.5 s that way)
  const byId = new Map(atoms.map((a) => [a.id, a]));
  for (const b of bonds) {
    if (!bondsGone.has(b.id)) continue;
    for (const end of [b.a, b.b]) {
      const atom = byId.get(end);
      if (atom && atom.el === "C" && !stillBonded.has(end)) atomsGone.add(end);
    }
  }
  const kept = atoms.filter((a) => !atomsGone.has(a.id));
  if (kept.length === atoms.length && left.length === bonds.length) return doc;
  return withPushesOn({ ...doc, model: { atoms: kept, bonds: left } });
}

/**
 * `doc` without these atoms and the bonds to them - and nothing else: an
 * atom of another left without a bond stays, as a step's results taken away
 * leave what the chemist drew (workflow/run `emptied`). The electron-pushing
 * arrows on them go with them.
 */
export function withoutAtoms(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  const atoms = doc.model.atoms.filter((a) => !gone.has(a.id));
  if (atoms.length === doc.model.atoms.length) return doc;
  return withPushesOn({ ...doc, model: { atoms, bonds: doc.model.bonds.filter((b) => !gone.has(b.a) && !gone.has(b.b)) } });
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
  /**
   * Rings and chains bound to a metal atom by atom, each made one bond from
   * the metal to a new star at (`x`, `y`), its endpoints `atoms`, for the
   * bonds `bonds` (chem/eta).
   */
  eta?: { metal: number; atoms: number[]; bonds: number[]; x: number; y: number }[];
};

/**
 * A new layout for some of the structure - a clean-up - in one edit: atoms
 * moved, wedges changed, H atoms added and taken away where the new layout
 * needs them. Nothing that would not change is touched.
 */
export function relayout(doc: WorkspaceDocument, change: Relayout): WorkspaceDocument {
  const to = new Map(change.atoms.map((a) => [a.id, a]));
  const gone = new Set(change.removed ?? []);
  const unbonded = new Set((change.eta ?? []).flatMap((e) => e.bonds));
  let changed = gone.size > 0 || (change.added?.length ?? 0) > 0 || (change.eta?.length ?? 0) > 0;
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
    if (gone.has(b.a) || gone.has(b.b) || unbonded.has(b.id)) return [];
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
    // (up, down and wavy on a single bond only: a double or triple bond keeps its own)
    const wedge = p.stereo === "up" || p.stereo === "down" || p.stereo === "wavy";
    const stereo = wedge && b.order !== 1 ? b.stereo : p.stereo;
    return [{ ...rest, stereo, stereoOrient: stereo === p.stereo ? p.stereoOrient : b.stereoOrient, ...(display ? { display } : {}) }];
  });
  if (!changed) return doc;
  let nextId = doc.nextId;
  for (const h of change.added ?? []) {
    const id = nextId++;
    atoms.push({ id, x: h.x, y: h.y, r: 0.9, el: "H" });
    bonds.push({ id: nextId++, a: h.on, b: id, order: 1, stereo: h.stereo, stereoOrient: h.stereoOrient });
  }
  for (const e of change.eta ?? []) {
    const star = nextId++;
    atoms.push({ id: star, x: e.x, y: e.y, r: 0.9, el: "*" });
    bonds.push({ id: nextId++, a: e.metal, b: star, order: 1, coordination: true, endpoints: [...e.atoms], attach: "all", stereo: "none", stereoOrient: "principle" });
  }
  // (electron-pushing arrows on what was laid out bent as Meno bends them again, as marks are put back)
  const pushes = (doc.pushes ?? []).map((p) => {
    if (!p.bend || !pushAtoms(doc, p).every((id) => to.has(id))) return p;
    const { bend: _bend, ...rest } = p;
    return rest;
  });
  return withPushesOn({ ...doc, nextId, model: { atoms, bonds }, ...(doc.pushes ? { pushes } : {}) });
}

/**
 * An abbreviation drawn out as the atoms it stands for - as the file gave
 * them, turned to where its bond goes now, or the dictionary's, laid out
 * on from that bond - the labelled atom become the one it is attached by,
 * its bonds out leaving from the atoms they did. One undo step. Given a
 * `group`, that group is drawn out in its place, laid out as the
 * dictionary's are: what Enumerate joins each R group by
 * (workflow/enumerate), one function for both.
 */
export function expandAbbreviation(doc: WorkspaceDocument, id: number, group?: GroupStructure): WorkspaceDocument {
  const atoms = doc.model.atoms;
  const a = atoms.find((x) => x.id === id);
  if (!a) return doc;
  const touching = doc.model.bonds.filter((b) => b.a === id || b.b === id);
  const out = touching[0] ? atoms.find((x) => x.id === (touching[0].a === id ? touching[0].b : touching[0].a)) : undefined;
  const now = out ? { x: out.x - a.x, y: out.y - a.y } : null;
  // (laid out away from all the atom's bonds together - out of a ring, from a ring's atom, in the widest opening between its bonds - not on
  // along the first alone)
  const all = touching.flatMap((b) => {
    const o = atoms.find((x) => x.id === (b.a === id ? b.b : b.a));
    return o ? [{ x: o.x - a.x, y: o.y - a.y }] : [];
  });
  const inward = all.length > 1 ? all : now;
  const s = group ? placedStructure(group, inward, NOMINAL_BOND_LENGTH) : (a.abbrev ?? placedAbbreviation(a.el, inward, NOMINAL_BOND_LENGTH));
  if (!s || !s.atoms.length) return doc;
  // a file's: turned by as much as its bond out has turned since
  const turn = a.abbrev && s.toward && now ? Math.atan2(now.y, now.x) - Math.atan2(s.toward.y, s.toward.x) : 0;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const head = s.attach[0] ?? 0;
  let nextId = doc.nextId;
  const ids = s.atoms.map((_, k) => (k === head ? id : nextId++));
  const laid = s.atoms.map((p) => ({ x: a.x + p.x * cos - p.y * sin, y: a.y + p.x * sin + p.y * cos }));
  // (set down in free space - clear of the drawing's atoms, bonds and labels, out of the label's own ring - turned, or mirrored, only where
  // it is not as it was laid out: utils/expandPlace)
  const placed = (() => {
    if (s.attach.length > 1 || s.haptic?.length) return laid;
    const group = laid.filter((_, k) => k !== head);
    if (!group.length) return laid;
    const mid = group.reduce((p, q) => ({ x: p.x + q.x / group.length, y: p.y + q.y / group.length }), { x: 0, y: 0 });
    const mirrorable = !s.bonds.some((b) => b.stereo && b.stereo !== "none") && !s.atoms.some((x) => x.stereoCentre);
    const t = groupTurn(doc.model, id, laid[head], group, s.bonds.map((b) => [laid[b.a1], laid[b.a2]] as [{ x: number; y: number }, { x: number; y: number }]), { x: mid.x - laid[head].x, y: mid.y - laid[head].y }, styleOf(doc.style), mirrorable);
    if (!t.turn && !t.mirror) return laid;
    const h = laid[head];
    const ax = (() => {
      const l = Math.hypot(mid.x - h.x, mid.y - h.y) || 1;
      return { x: (mid.x - h.x) / l, y: (mid.y - h.y) / l };
    })();
    return laid.map((p) => {
      let x = p.x - h.x;
      let y = p.y - h.y;
      if (t.mirror) {
        const along = x * ax.x + y * ax.y;
        x = 2 * along * ax.x - x;
        y = 2 * along * ax.y - y;
      }
      return { x: h.x + x * Math.cos(t.turn) - y * Math.sin(t.turn), y: h.y + x * Math.sin(t.turn) + y * Math.cos(t.turn) };
    });
  })();
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
  return withPushesOn({ ...doc, model: { atoms, bonds } });
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
  return withPushesOn({ ...doc, model: { atoms, bonds } });
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

/**
 * An atom's chemistry set anew - its element or label, charge, radical and
 * isotope, each left off where it has none - leaving where it is alone.
 */
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
    // (a wedge, hashes or a wavy line say something of a single bond's end
    // alone: a double or triple bond made one, or given one, carries none -
    // the API put them there, and a file or Clean-up then read a wedge on
    // a multiple bond)
    if (merged.order !== 1 && (merged.stereo === "up" || merged.stereo === "down" || merged.stereo === "wavy")) merged.stereo = "none";
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
  // (its electron-pushing arrows with it: an end on the atom dragged now on
  // the one it was dropped on, and those on a bond that collapsed, or come
  // to point at where they leave, gone - as a delete leaves them; they were
  // left on what was gone, drawn no more and dropped on reopening)
  const onto = (e: PushEnd): PushEnd =>
    "atom" in e ? (e.atom === movingId ? { atom: targetId } : e) : "gap" in e ? { gap: [e.gap[0] === movingId ? targetId : e.gap[0], e.gap[1] === movingId ? targetId : e.gap[1]] } : e;
  const pushes = doc.pushes?.map((p) => ({ ...p, from: onto(p.from), to: onto(p.to) })).filter((p) => JSON.stringify(p.from) !== JSON.stringify(p.to));
  return withPushesOn({ ...doc, model: { atoms, bonds }, ...(pushes ? { pushes } : {}) });
}

// --- whole-model operations ------------------------------------------------

/** Replaces the content, e.g. opening a file: one undo step for the import. */
export function replaceModel(
  doc: WorkspaceDocument,
  next: Model & { pushes?: readonly PushArrow[]; ringFills?: RingFills },
): WorkspaceDocument {
  const maxId = Math.max(
    0,
    ...next.atoms.map((a) => a.id || 0),
    ...next.bonds.map((b) => b.id || 0),
  );
  return {
    ...doc,
    // (which record each stack of drawings shows is the view's, not the document's)
    model: { atoms: unmarked(next.atoms), bonds: next.bonds.slice() },
    arrows: [],
    nextArrowId: 1,
    pluses: [],
    nextPlusId: 1,
    ...pushesOf(next.pushes, next),
    captions: [],
    nextCaptionId: 1,
    shapes: [],
    nextShapeId: 1,
    molecules3d: [],
    nextMolecule3dId: 1,
    sets: [],
    steps: [],
    wires: [],
    nextWorkflowId: 1,
    aromaticEnabled: false,
    aromaticRings: {},
    ringFills: { ...(next.ringFills ?? {}) },
    nextId: Math.max(1, maxId + 1),
  };
}

/** Adds another structure alongside the current one, renumbering its ids. */
export function appendModel(
  doc: WorkspaceDocument,
  next: Model & { pushes?: readonly PushArrow[]; ringFills?: RingFills },
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
  // (a stack of drawings it brings numbered after the document's own; one record copied out of its stack, that record alone)
  const atoms = addedStacks(next.atoms, freshRecordsId(doc.model.atoms)).map((a) => ({
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
  const bondMap = new Map<number, number>();
  // (a haptic bond pasted without its whole ring goes, with its star: it
  // would bind the ring copied from, and a star alone is no atom - chem/eta)
  const starless = new Set<number>();
  for (const b of next.bonds) {
    if (!b.endpoints?.length || b.endpoints.every((e) => idMap.has(e))) continue;
    for (const e of [b.a, b.b]) if (next.atoms.some((a) => a.id === e && a.el === "*")) starless.add(idMap.get(e)!);
  }
  const bonds = next.bonds.flatMap((b) => {
    const { endpoints, attach, ...rest } = b;
    const whole = !!endpoints?.length && endpoints.every((e) => idMap.has(e));
    const a = idMap.get(b.a) ?? b.a;
    const z = idMap.get(b.b) ?? b.b;
    if (starless.has(a) || starless.has(z)) return [];
    const id = cursor++;
    bondMap.set(b.id, id);
    return [
      {
        ...rest,
        id,
        a,
        b: z,
        ...(whole ? { endpoints: endpoints!.map((e) => idMap.get(e)!), ...(attach ? { attach } : {}) } : {}),
      },
    ];
  });
  // (its electron-pushing arrows with it, on its atoms' and bonds' new ids)
  const moved = (e: PushEnd): PushEnd | null => {
    if ("atom" in e) return idMap.has(e.atom) ? { atom: idMap.get(e.atom)! } : null;
    if ("bond" in e) return bondMap.has(e.bond) ? { bond: bondMap.get(e.bond)! } : null;
    return idMap.has(e.gap[0]) && idMap.has(e.gap[1]) ? { gap: [idMap.get(e.gap[0])!, idMap.get(e.gap[1])!] } : null;
  };
  let pushId = doc.nextPushId ?? 1;
  const pushes = (next.pushes ?? []).flatMap((p) => {
    const from = moved(p.from);
    const to = moved(p.to);
    return from && to ? [{ ...p, id: pushId++, from, to }] : [];
  });
  // (its rings' fills with it, by its atoms' new ids)
  const fills = Object.entries(next.ringFills ?? {}).flatMap(([key, color]) => {
    const ids = key.split("-").map((id) => idMap.get(Number(id)));
    return ids.every((id) => id != null) ? [[ringKeyOf(ids as number[]), color] as const] : [];
  });
  return {
    ...doc,
    nextId: cursor,
    model: {
      atoms: [...doc.model.atoms, ...(starless.size ? atoms.filter((a) => !starless.has(a.id)) : atoms)],
      bonds: [...doc.model.bonds, ...bonds],
    },
    ...(pushes.length ? { pushes: [...(doc.pushes ?? []), ...pushes], nextPushId: pushId } : {}),
    ...(fills.length ? { ringFills: { ...(doc.ringFills ?? {}), ...Object.fromEntries(fills) } } : {}),
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
  /** Shapes, from the back. */
  shapes?: Omit<Shape, "id">[];
  /** Catalytic cycles. */
  cycles?: Omit<Cycle, "id">[];
  /** Words, each over or under an arrow it brings by its place among them (`arrowAt`), where it is. */
  captions?: (Omit<Caption, "id" | "arrow"> & { arrowAt?: number })[];
  /** Molecules in 3D a file brings, where they are to stand - and, where it says, the frame each shows (an optimisation's last). */
  molecules3d?: (Omit<Molecule3D, "id"> & { frame?: number; list?: CarriedList; shown?: true })[];
};

/** The arrows and pluses drawn with a part - a paste, a document's record - as a scheme to add. */
export function schemeOf(part: Drawn): ImportedScheme {
  return {
    arrows: (part.arrows ?? []).map(({ id: _id, ...a }) => a),
    pluses: (part.pluses ?? []).map(({ id: _id, ...p }) => p),
    shapes: (part.shapes ?? []).map(({ id: _id, ...s }) => s),
    cycles: (part.cycles ?? []).map(({ id: _id, ...c }) => c),
    captions: (part.captions ?? []).map(({ id: _id, arrow, ...c }) => {
      const at = arrow == null ? -1 : (part.arrows ?? []).findIndex((a) => a.id === arrow);
      return { ...c, ...(at >= 0 ? { arrowAt: at } : {}) };
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
  for (const { x, y, angle, length, ...rest } of scheme?.arrows ?? []) next = addArrow(next, x, y, angle, length, rest);
  for (const p of scheme?.pluses ?? []) next = addPlus(next, p.x, p.y);
  for (const sh of scheme?.shapes ?? []) next = addShape(next, sh);
  for (const cy of scheme?.cycles ?? []) next = addCycle(next, cy);
  for (const { arrowAt, ...c } of scheme?.captions ?? []) next = addCaption(next, { ...c, ...(arrowAt != null ? { arrow: firstArrow + arrowAt } : {}) });
  // (the frame each shows is the canvas's to keep, not the document's; a
  // stack it brings, numbered after the document's own - utils/stacks)
  // (a stack of one - one pasted out of its stack - is that molecule alone)
  const counts = new Map<number, number>();
  for (const m of scheme?.molecules3d ?? []) if (m.stack) counts.set(m.stack.id, (counts.get(m.stack.id) ?? 0) + 1);
  const stacks = new Map<number, number>();
  for (const { frame: _frame, list: _list, shown: _shown, stack, ...m } of scheme?.molecules3d ?? []) {
    if (stack && (counts.get(stack.id) ?? 0) > 1 && !stacks.has(stack.id)) stacks.set(stack.id, freshStackId(next.molecules3d ?? []));
    const id = stack ? stacks.get(stack.id) : undefined;
    next = addMolecule3d(next, stack && id != null ? { ...m, stack: { ...stack, id } } : m);
  }
  return next;
}

// --- molecules in 3D ---------------------------------------------------------

export function addMolecule3d(doc: WorkspaceDocument, m: Omit<Molecule3D, "id">): WorkspaceDocument {
  return addMolecules3d(doc, [m]);
}

/** Molecules in 3D added at once, each given the next id in turn: the page's molecules copied once, however many. */
export function addMolecules3d(doc: WorkspaceDocument, ms: readonly Omit<Molecule3D, "id">[]): WorkspaceDocument {
  if (!ms.length) return doc;
  const first = doc.nextMolecule3dId ?? 1;
  return { ...doc, molecules3d: [...(doc.molecules3d ?? []), ...ms.map((m, i) => ({ ...m, id: first + i }))], nextMolecule3dId: first + ms.length };
}

/**
 * What readers chosen to read an output as well found in it (lib/calc/
 * readings), joined to each molecule read from that output - by its
 * SHA-256 - that has not got it yet: each reader's results, kept as its
 * own, where the atoms it read are the molecule's, in the same order; what
 * belongs to frames only where it read as many; and a reader that could not
 * read it, said. The document as it was where there is nothing to join.
 */
/**
 * What a reader read of one job of a file that holds several: the job of
 * that number, where it read the file job by job; where it read the file as
 * one, that - its end - for the last job, and nothing for the others.
 * Where the molecule is no job of several, what it read.
 */
export function readingOfJob(found: Found, job: CalcInfo["job"]): Found | null {
  if (!job) return found;
  const jobs = Array.isArray(found.output.jobs) && found.output.jobs.length > 1 ? found.output.jobs : null;
  if (!jobs) return job.number === job.of ? found : null;
  const own = jobs.find((j) => j.job?.number === job.number);
  return own ? { ...found, output: own } : null;
}

export function withReadings(doc: WorkspaceDocument, bySource: Readonly<Record<string, readonly (Found | Unread)[]>>): WorkspaceDocument {
  let changed = false;
  const molecules3d = (doc.molecules3d ?? []).map((m) => {
    const readings = m.calc?.source ? bySource[m.calc.source.sha256] : undefined;
    if (!m.calc || !readings?.length) return m;
    let calc = m.calc;
    for (const found of readings) {
      // (a reader as a molecule keeps it: its id, then its version)
      const has = calc.readers.some((x) => x === found.from || x.startsWith(`${found.from} `)) || calc.unread?.some((u) => u.from === found.from);
      if (has) continue;
      // (of a file of several jobs, what the reader read of this molecule's job)
      const r = "why" in found ? found : readingOfJob(found, m.calc.job);
      if (!r) continue;
      const atoms = m.atoms.map((a) => a.el);
      if ("why" in r || !sameAtoms(r.output.atoms, atoms)) {
        const why = "why" in r ? r.why : "it read other atoms";
        calc = { ...calc, unread: [...(calc.unread ?? []), { from: r.from, why }] };
      } else {
        const frames = 1 + (m.frames?.length ?? 0);
        const read = (r.output.frames ?? []).filter((f) => Array.isArray(f) && f.length === 3 * atoms.length).length;
        const results = inMenosForm(readResults(r.output.results, atoms.length, read === frames ? frames : 0, r.from), r.output);
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
  // (one of a stack moved, the rest of it with it: they stand in one place - utils/stacks)
  const all = doc.molecules3d ?? [];
  const by = new Map<number, { dx: number; dy: number }>();
  for (const m of all) {
    const at = to.get(m.id);
    if (at && m.stack && !m.stack.spread && !by.has(m.stack.id)) by.set(m.stack.id, { dx: at.x - m.at.x, dy: at.y - m.at.y });
  }
  for (const m of all) {
    const d = m.stack && !m.stack.spread && !to.has(m.id) ? by.get(m.stack.id) : undefined;
    if (d) to.set(m.id, { x: m.at.x + d.dx, y: m.at.y + d.dy });
  }
  return {
    ...doc,
    molecules3d: all.map((m) => {
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
  if (kept.length === (doc.molecules3d ?? []).length) return doc;
  // (a stack left with one molecule is that molecule alone)
  const left = new Map<number, number>();
  for (const m of kept) if (m.stack) left.set(m.stack.id, (left.get(m.stack.id) ?? 0) + 1);
  return {
    ...doc,
    molecules3d: kept.map((m) => {
      if (!m.stack || (left.get(m.stack.id) ?? 0) > 1) return m;
      const { stack: _alone, ...rest } = m;
      return rest;
    }),
  };
}

/** A stack's molecules laid out as a grid: each where `places` says, by id, all of them shown (utils/stacks). */
export function spreadStack(doc: WorkspaceDocument, stack: number, places: ReadonlyMap<number, { x: number; y: number }>): WorkspaceDocument {
  return {
    ...doc,
    molecules3d: (doc.molecules3d ?? []).map((m) => {
      if (m.stack?.id !== stack) return m;
      const at = places.get(m.id) ?? m.at;
      return { ...m, at: { x: at.x, y: at.y, ...(m.at.z != null ? { z: m.at.z } : {}) }, stack: { id: stack, spread: true } };
    }),
  };
}

/** A stack's molecules, laid out as a grid, stacked again: all of them at `at`. */
export function gatherStack(doc: WorkspaceDocument, stack: number, at: { x: number; y: number }): WorkspaceDocument {
  return {
    ...doc,
    molecules3d: (doc.molecules3d ?? []).map((m) => {
      if (m.stack?.id !== stack) return m;
      const { z: _z, ...was } = m.at;
      return { ...m, at: { ...was, x: at.x, y: at.y }, stack: { id: stack } };
    }),
  };
}

/** A stack of drawings laid out as a grid: each record moved as `moves` says, by record, and every one shown. */
export function spreadRecords(doc: WorkspaceDocument, stack: number, moves: ReadonlyMap<number, { dx: number; dy: number }>): WorkspaceDocument {
  return recordsMoved(doc, stack, moves, true);
}

/** A stack of drawings, laid out as a grid, stacked again: each record moved as `moves` says, by record. */
export function gatherRecords(doc: WorkspaceDocument, stack: number, moves: ReadonlyMap<number, { dx: number; dy: number }>): WorkspaceDocument {
  return recordsMoved(doc, stack, moves, false);
}

function recordsMoved(doc: WorkspaceDocument, stack: number, moves: ReadonlyMap<number, { dx: number; dy: number }>, spread: boolean): WorkspaceDocument {
  let changed = false;
  const atoms = doc.model.atoms.map((a) => {
    if (a.stack?.id !== stack) return a;
    changed = true;
    const m = moves.get(a.stack.record) ?? { dx: 0, dy: 0 };
    const { spread: _spread, ...kept } = a.stack;
    return { ...a, x: a.x + m.dx, y: a.y + m.dy, stack: spread ? { ...kept, spread: true as const } : kept };
  });
  return changed ? { ...doc, model: { atoms, bonds: doc.model.bonds } } : doc;
}

function withMolecule3d(doc: WorkspaceDocument, id: number, change: (m: Molecule3D) => Molecule3D): WorkspaceDocument {
  const all = doc.molecules3d ?? [];
  const i = all.findIndex((m) => m.id === id);
  if (i < 0) return doc;
  const next = change(all[i]);
  return next === all[i] ? doc : { ...doc, molecules3d: all.map((m, k) => (k === i ? next : m)) };
}

/** A molecule in 3D as `change` makes it: what is found or given of it (its bond orders, its hydrogens: utils/completeness). */
export function changeMolecule3d(doc: WorkspaceDocument, id: number, change: (m: Molecule3D) => Molecule3D): WorkspaceDocument {
  return withMolecule3d(doc, id, change);
}

/**
 * Molecules in 3D shown `k` times as large as they are (docs/WORKSPACE.md,
 * *Magnified display*), each about its own place - at 1, at their true size
 * again. Kept within its bounds (utils/magnified).
 */
export function setMagnified3d(doc: WorkspaceDocument, ids: readonly number[], k: number): WorkspaceDocument {
  const to = magnificationWithin(k);
  const one = to === 1;
  return ids.reduce(
    (d, id) =>
      withMolecule3d(d, id, (m) => {
        if ((m.magnified ?? 1) === (one ? 1 : to)) return m;
        const { magnified: _was, ...rest } = m;
        return one ? rest : { ...rest, magnified: to };
      }),
    doc,
  );
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

/** The stereocentres and double bonds a molecule in 3D shows the labels of: those asked for on it, or - none asked for - those its drawing left open. */
export function stereoShownOf(m: Pick<Molecule3D, "stereo">): { atoms: number[]; bonds: number[] } | null {
  return m.stereo?.shown ?? m.stereo?.chosen ?? null;
}

/**
 * Which R and S, E and Z are shown (docs/EDITOR-2D.md, *R and S*), set for
 * the drawing's atoms and bonds given, by id, and the molecules in 3D's, by
 * index - shown, or not. A molecule in 3D given with no atoms and no bonds
 * is given all of its stereocentres and double bonds. A drawing and the
 * molecule in 3D made from it each keep their own.
 */
export function setStereoShown(
  doc: WorkspaceDocument,
  of: { atoms?: readonly number[]; bonds?: readonly number[]; molecules?: readonly { id: number; atoms?: readonly number[]; bonds?: readonly number[] }[] },
  show: boolean,
): WorkspaceDocument {
  const atoms = new Set(of.atoms ?? []);
  const bonds = new Set(of.bonds ?? []);
  const flagged = <T extends { id: number; stereoShown?: true }>(x: T, given: Set<number>): T => {
    if (!given.has(x.id) || !!x.stereoShown === show) return x;
    if (show) return { ...x, stereoShown: true as const };
    const { stereoShown: _s, ...rest } = x;
    return rest as T;
  };
  let out = doc;
  if (atoms.size || bonds.size) {
    const model = { ...doc.model, atoms: doc.model.atoms.map((a) => flagged(a, atoms)), bonds: doc.model.bonds.map((b) => flagged(b, bonds)) };
    if (model.atoms.some((a, i) => a !== doc.model.atoms[i]) || model.bonds.some((b, i) => b !== doc.model.bonds[i])) out = { ...out, model };
  }
  for (const g of of.molecules ?? []) {
    out = withMolecule3d(out, g.id, (m) => {
      const st = m.stereo;
      if (!st) return m;
      const all = !g.atoms?.length && !g.bonds?.length;
      const ga = all ? Object.keys(st.atoms).map(Number) : (g.atoms ?? []).filter((i) => i in st.atoms);
      const gb = all ? Object.keys(st.bonds).map(Number) : (g.bonds ?? []).filter((i) => i in st.bonds);
      const was = stereoShownOf(m) ?? { atoms: [], bonds: [] };
      const next = (now: number[], given: number[]) => (show ? [...new Set([...now, ...given])].sort((x, y) => x - y) : now.filter((i) => !given.includes(i)));
      const shown = { atoms: next(was.atoms, ga), bonds: next(was.bonds, gb) };
      if (st.shown && shown.atoms.join() === st.shown.atoms.join() && shown.bonds.join() === st.shown.bonds.join()) return m;
      return { ...m, stereo: { ...st, shown } };
    });
  }
  return out;
}

/**
 * Atom numbers (docs/WORKSPACE.md, *Atom numbers*) shown on the molecules
 * in 3D given, by id - on the atoms given, by index, or all of a molecule's,
 * given none - or hidden from them; of the kind each shows, or its atoms'
 * order where it shows none yet.
 */
export function setAtomNumbers(doc: WorkspaceDocument, of: readonly { id: number; atoms?: readonly number[] }[], show: boolean): WorkspaceDocument {
  let out = doc;
  for (const g of of) {
    out = withMolecule3d(out, g.id, (m) => {
      const next = numbersWith(m, g.atoms?.length ? g.atoms : null, show);
      if (JSON.stringify(next ?? null) === JSON.stringify(m.atomNumbers ?? null)) return m;
      if (next) return { ...m, atomNumbers: next };
      const { atomNumbers: _n, ...rest } = m;
      return rest;
    });
  }
  return out;
}

/** The kind of number the molecules in 3D given, by id, show, where they show any. */
export function setAtomNumberKind(doc: WorkspaceDocument, molecules: readonly number[], kind: AtomNumberKind): WorkspaceDocument {
  let out = doc;
  for (const id of molecules) out = withMolecule3d(out, id, (m) => (m.atomNumbers && m.atomNumbers.kind !== kind ? { ...m, atomNumbers: { ...m.atomNumbers, kind } } : m));
  return out;
}

/**
 * An arrow given its reaction's atom map (chem/atomMap) - or, null, its map
 * taken away - with what the map shows on the drawing put there or taken
 * off: each heavy atom's map number, and the reacting centres of the bonds
 * it makes, breaks or changes in order - where the map is shown, complete,
 * and of the drawing as it is. The atoms of the map before and of the new
 * one lose the numbers and centres they had; one step.
 */
export function setAtomMap(doc: WorkspaceDocument, arrowId: number, map: ArrowAtomMap | null): WorkspaceDocument {
  const arrow = doc.arrows.find((a) => a.id === arrowId);
  if (!arrow) return doc;
  const before = arrow.atomMap;
  const inside = new Set<number>([...(before ? mapAtoms(before) : []), ...(map ? mapAtoms(map) : [])]);
  const marks = map && map.shown && mapStanding({ atomMap: map }, doc.model) === "ready" ? mapMarks(map, doc.model) : null;
  const atoms = doc.model.atoms.map((a) => {
    if (!inside.has(a.id)) return a;
    const n = marks?.numbers.get(a.id);
    if (n === a.map) return a;
    const { map: _m, ...rest } = a;
    return n ? { ...rest, map: n } : rest;
  });
  const bonds = doc.model.bonds.map((b) => {
    if (!inside.has(b.a) || !inside.has(b.b)) return b;
    const c = marks?.centres.get(b.id);
    if (c === b.reactingCentre) return b;
    const { reactingCentre: _c, ...rest } = b;
    return c ? { ...rest, reactingCentre: c } : rest;
  });
  const arrows = doc.arrows.map((a) => {
    if (a.id !== arrowId) return a;
    const { atomMap: _a, ...rest } = a;
    return map ? { ...rest, atomMap: map } : rest;
  });
  return { ...doc, arrows, model: { ...doc.model, atoms, bonds } };
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
  /** What else it is: its look, form and colour, as a file or a copy brings them. */
  rest: Omit<Arrow, "id" | "x" | "y" | "angle" | "length"> = {},
): WorkspaceDocument {
  const arrow: Arrow = { ...rest, id: doc.nextArrowId, x, y, angle, length };
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
  // (the words over it, or under it, go where its middle goes - or, where it turns or turned, its line)
  if (was.corners?.length || next[index].corners?.length) return withWordsAlong({ ...doc, arrows: next }, [[was, next[index]]]);
  return withCaptionsBy({ ...doc, arrows: next }, new Map([[id, { x: next[index].x - was.x, y: next[index].y - was.y }]]));
}

/**
 * Where words stand by an arrow's line through `points`, its tail first: how
 * far along the line the point they are by is - the point it passes level
 * with them, measured along its tail-to-point chord, the nearest where it
 * passes more than once; its end, where they lie past it - and how far
 * from that point they are, along the chord and across it.
 */
function wordsAnchor(points: readonly { x: number; y: number }[], p: { x: number; y: number }): { s: number; along: number; across: number } {
  const o = points[0];
  const end = points[points.length - 1];
  const l = Math.hypot(end.x - o.x, end.y - o.y) || 1;
  const u = { x: (end.x - o.x) / l, y: (end.y - o.y) / l };
  const chord = (q: { x: number; y: number }) => ({ x: (q.x - o.x) * u.x + (q.y - o.y) * u.y, y: -(q.x - o.x) * u.y + (q.y - o.y) * u.x });
  const at = chord(p);
  const cs = points.map(chord);
  let best: { s: number; along: number; across: number } | null = null;
  let gone = 0;
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1];
    const b = cs[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(b.x - a.x) > 1e-12 && (at.x - a.x) * (at.x - b.x) <= 0) {
      const t = (at.x - a.x) / (b.x - a.x);
      const across = at.y - (a.y + (b.y - a.y) * t);
      if (!best || Math.abs(across) < Math.abs(best.across)) best = { s: gone + len * t, along: 0, across };
    }
    gone += len;
  }
  if (best) return best;
  // (past an end: by that end)
  const first = cs[0];
  const last = cs[cs.length - 1];
  const tail = Math.hypot(at.x - first.x, at.y - first.y) <= Math.hypot(at.x - last.x, at.y - last.y);
  const e = tail ? first : last;
  return { s: tail ? 0 : gone, along: at.x - e.x, across: at.y - e.y };
}

/**
 * `doc` with the words by each arrow changed from `was` to `now` going with
 * the point of its line they are by - as far along it, as a share of it -
 * and as far from it, along its chord and across it: words over a stretch
 * stay over it as a corner is made, moved or taken away, or the arrow
 * grows or turns.
 */
function withWordsAlong(doc: WorkspaceDocument, changed: readonly (readonly [Arrow, Arrow])[]): WorkspaceDocument {
  const by = new Map(changed.map(([was, now]) => [now.id, { was: arrowPoints(was), now: arrowPoints(now) }]));
  if (!doc.captions?.some((c) => c.arrow != null && by.has(c.arrow))) return doc;
  return {
    ...doc,
    captions: doc.captions.map((c) => {
      const line = c.arrow != null ? by.get(c.arrow) : undefined;
      if (!line) return c;
      const was = pathLength(line.was);
      const k = wordsAnchor(line.was, c);
      const at = pointAlong(line.now, was > 0 ? (k.s / was) * pathLength(line.now) : 0).at;
      const o = line.now[0];
      const end = line.now[line.now.length - 1];
      const l = Math.hypot(end.x - o.x, end.y - o.y) || 1;
      const u = { x: (end.x - o.x) / l, y: (end.y - o.y) / l };
      const x = at.x + u.x * k.along - u.y * k.across;
      const y = at.y + u.y * k.along + u.x * k.across;
      return Math.abs(x - c.x) > 1e-12 || Math.abs(y - c.y) > 1e-12 ? { ...c, x, y } : c;
    }),
  };
}

/**
 * `doc` with the arrows `ids` given what `patch` says - a kind, heads, an
 * equilibrium's full heads, dashes, a weight, corners, a colour - each set
 * as it says, or (null, "regular", 1 head, false) taken away.
 */
export function setArrowForm(doc: WorkspaceDocument, ids: readonly number[], patch: ArrowFormPatch): WorkspaceDocument {
  const want = new Set(ids);
  let changed = false;
  const arrows = doc.arrows.map((a) => {
    if (!want.has(a.id)) return a;
    const next: Arrow = { ...a };
    const put = <K extends keyof Arrow>(k: K, v: Arrow[K] | undefined) => {
      if (v === undefined) delete next[k];
      else next[k] = v;
    };
    if (patch.kind !== undefined) put("kind", patch.kind ?? undefined);
    if (patch.heads !== undefined) put("heads", patch.heads === 2 ? 2 : undefined);
    if (patch.full !== undefined) put("full", patch.full ? true : undefined);
    if (patch.dash !== undefined) put("dash", patch.dash ? true : undefined);
    if (patch.weight !== undefined) put("weight", patch.weight === "regular" ? undefined : patch.weight);
    if (patch.corners !== undefined) put("corners", patch.corners?.length ? patch.corners : undefined);
    if (patch.color !== undefined) put("color", patch.color ?? undefined);
    changed ||= JSON.stringify(next) !== JSON.stringify(a);
    return next;
  });
  if (!changed) return doc;
  // (straightened, or given corners: the words by it go with its line)
  const bent = arrows.flatMap((next, i) => (JSON.stringify(next.corners) !== JSON.stringify(doc.arrows[i].corners) ? [[doc.arrows[i], next] as const] : []));
  return withWordsAlong({ ...doc, arrows }, bent);
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

// --- electron-pushing arrows -----------------------------------------------

/** The atoms an end stands on, by id: an atom, a bond's two, a gap's two. */
export function endAtoms(doc: Pick<WorkspaceDocument, "model">, e: PushEnd): number[] {
  if ("atom" in e) return [e.atom];
  if ("gap" in e) return [...e.gap];
  const b = doc.model.bonds.find((x) => x.id === e.bond);
  return b ? [b.a, b.b] : [];
}

/** The atoms an electron-pushing arrow stands on, at either end. */
export function pushAtoms(doc: Pick<WorkspaceDocument, "model">, p: PushArrow): number[] {
  return [...endAtoms(doc, p.from), ...endAtoms(doc, p.to)];
}

/** Whether an end is still drawn: its atom, its bond, its gap's two atoms - not bonded to each other. */
function endIsThere(doc: Pick<WorkspaceDocument, "model">, e: PushEnd): boolean {
  const has = (id: number) => doc.model.atoms.some((a) => a.id === id);
  if ("atom" in e) return has(e.atom);
  if ("bond" in e) return doc.model.bonds.some((b) => b.id === e.bond);
  return e.gap[0] !== e.gap[1] && has(e.gap[0]) && has(e.gap[1]);
}

/** `doc` without the electron-pushing arrows whose ends are gone. */
function withPushesOn(doc: WorkspaceDocument): WorkspaceDocument {
  const pushes = doc.pushes ?? [];
  const kept = pushes.filter((p) => endIsThere(doc, p.from) && endIsThere(doc, p.to));
  return kept.length === pushes.length ? doc : { ...doc, pushes: kept };
}

/** The electron-pushing arrows a file or a record brings, those whose ends are in `model`, numbered from one. */
function pushesOf(pushes: readonly PushArrow[] | undefined, model: Model): Pick<WorkspaceDocument, "pushes" | "nextPushId"> {
  const kept = (pushes ?? []).filter((p) => endIsThere({ model }, p.from) && endIsThere({ model }, p.to)).map((p, i) => ({ ...p, id: i + 1 }));
  return { pushes: kept, nextPushId: kept.length + 1 };
}

/** `doc` with an electron-pushing arrow from `from` to `to`, numbered `nextPushId`. */
export function addPush(doc: WorkspaceDocument, from: PushEnd, to: PushEnd, half: boolean): WorkspaceDocument {
  if (!endIsThere(doc, from) || !endIsThere(doc, to) || JSON.stringify(from) === JSON.stringify(to)) return doc;
  const id = doc.nextPushId ?? 1;
  return { ...doc, nextPushId: id + 1, pushes: [...(doc.pushes ?? []), { id, from, to, ...(half ? { half: true as const } : {}) }] };
}

/** `doc` with the electron-pushing arrow `id` changed: its head, its bend (null: as Meno bends it), its ends, its lone pair's dots, whether an anion's arrow leaves from a lone pair. */
export function updatePush(
  doc: WorkspaceDocument,
  id: number,
  patch: { half?: boolean; bend?: PushArrow["bend"] | null; from?: PushEnd; to?: PushEnd; noPair?: boolean; fromPair?: boolean },
): WorkspaceDocument {
  const pushes = doc.pushes ?? [];
  const i = pushes.findIndex((p) => p.id === id);
  if (i < 0) return doc;
  const was = pushes[i];
  const { half: _h, bend: _b, noPair: _n, fromPair: _f, ...rest } = was;
  const half = patch.half ?? !!was.half;
  const bend = patch.bend === undefined ? was.bend : (patch.bend ?? undefined);
  const noPair = patch.noPair ?? !!was.noPair;
  const fromPair = patch.fromPair ?? !!was.fromPair;
  const next: PushArrow = {
    ...rest,
    from: patch.from ?? was.from,
    to: patch.to ?? was.to,
    ...(half ? { half: true } : {}),
    ...(bend ? { bend } : {}),
    ...(noPair ? { noPair: true } : {}),
    ...(fromPair ? { fromPair: true } : {}),
  };
  if (!endIsThere(doc, next.from) || !endIsThere(doc, next.to) || JSON.stringify(next.from) === JSON.stringify(next.to)) return doc;
  if (JSON.stringify(next) === JSON.stringify(was)) return doc;
  const out = pushes.slice();
  out[i] = next;
  return { ...doc, pushes: out };
}

export function removePush(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const pushes = (doc.pushes ?? []).filter((p) => p.id !== id);
  return pushes.length === (doc.pushes ?? []).length ? doc : { ...doc, pushes };
}

/** `doc` with the electron-pushing arrows on the atoms `ids` alone turned over with them: each bent to its other side. */
export function turnPushesOver(doc: WorkspaceDocument, ids: ReadonlySet<number>): WorkspaceDocument {
  if (!doc.pushes?.some((p) => p.bend)) return doc;
  return {
    ...doc,
    pushes: doc.pushes.map((p) => (p.bend && pushAtoms(doc, p).every((id) => ids.has(id)) ? { ...p, bend: { along: p.bend.along, out: -p.bend.out } } : p)),
  };
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

/** Where arrows, pluses and words go, by id - and pictures, and how they are turned; texts' sheets, by their top left; PDFs, by where they lie. */
export type MarkPlaces = {
  pictures?: { id: number; x: number; y: number; turn?: number }[];
  pdfs?: { id: number; x: number; y: number }[];
  texts?: { id: number; x: number; y: number }[];
  /** Arrows moved with the rest: where each one's middle now is - and, carried round or turned over with it, which way it points and its corners. */
  arrows?: { id: number; x: number; y: number; angle?: number; corners?: readonly { along: number; across: number }[] }[];
  pluses?: { id: number; x: number; y: number }[];
  captions?: { id: number; x: number; y: number }[];
  /** Molecules in 3D moved with the rest: where each now stands. */
  molecules3d?: { id: number; at: { x: number; y: number; z?: number } }[];
  /** A workflow's sets and steps moved with the rest: where each set's frame, and each step's card, now stands. */
  sets?: { id: number; x0: number; y0: number; x1: number; y1: number }[];
  steps?: { id: number; x: number; y: number }[];
  /** Slides moved with the rest: where each one's middle now is. */
  slides?: { id: number; x: number; y: number }[];
  /** Writing by hand moved or carried round with the rest: each piece's strokes where they now are. */
  inks?: { id: number; strokes: InkStroke[] }[];
  /** Catalytic cycles moved, sized, carried round or turned over with the rest: where each one's middle now is, and its radius, the way it goes and its arrows in and out. */
  cycles?: { id: number; x: number; y: number; r?: number; ccw?: true; branches?: CycleBranch[]; ends?: Record<string, number> }[];
  /** Shapes moved or carried round with the rest: where each now lies. */
  shapes?: { id: number; x0: number; y0: number; x1: number; y1: number }[];
  /** Charges and R, S, E and Z put by hand, turned with the rest: where each now stands from what it is of (`withMarksAt`). */
  markAts?: MarksAt;
};

/** Where marks put by hand stand from what they are of - each atom's charge and R or S, each bond's E or Z - none, put back. */
export type MarksAt = { atoms: { id: number; chargeAt?: MarkAt; stereoAt?: MarkAt }[]; bonds: { id: number; stereoAt?: MarkAt }[] };

/** `doc` with the arrows, pluses, molecules in 3D, sets and steps `places` names where it says. */
export function placeMarks(doc: WorkspaceDocument, places?: MarkPlaces): WorkspaceDocument {
  if (places?.markAts) return placeMarks(withMarksAt(doc, places.markAts), { ...places, markAts: undefined });
  if (places?.molecules3d?.length) return placeMarks(moveMolecules3d(doc, places.molecules3d), { ...places, molecules3d: [] });
  if (places?.pdfs?.length) {
    const at = new Map(places.pdfs.map((p) => [p.id, p]));
    const placed = { ...doc, pdfs: (doc.pdfs ?? []).map((p) => (at.has(p.id) ? { ...p, x: at.get(p.id)!.x, y: at.get(p.id)!.y } : p)) };
    return placeMarks(placed, { ...places, pdfs: [] });
  }
  if (places?.inks?.length) {
    const at = new Map(places.inks.map((p) => [p.id, p.strokes]));
    const placed = { ...doc, inks: (doc.inks ?? []).map((k) => (at.has(k.id) ? { ...k, strokes: at.get(k.id)! } : k)) };
    return placeMarks(placed, { ...places, inks: [] });
  }
  if (places?.cycles?.length) {
    const at = new Map(places.cycles.map((p) => [p.id, p]));
    const put = (c: Cycle): Cycle => {
      const p = at.get(c.id)!;
      // (the way it goes and its arrows, where they are said: a turn-over turns them)
      const { ccw: _w, ends: _e, ...rest } = c;
      const ccw = "branches" in p || "ccw" in p ? p.ccw : c.ccw;
      const ends = "ends" in p ? p.ends : c.ends;
      return { ...rest, x: p.x, y: p.y, r: p.r ?? c.r, ...(ccw ? { ccw } : {}), ...("branches" in p ? { branches: p.branches } : {}), ...(ends ? { ends } : {}) };
    };
    const placed = { ...doc, cycles: (doc.cycles ?? []).map((c) => (at.has(c.id) ? put(c) : c)) };
    return placeMarks(placed, { ...places, cycles: [] });
  }
  if (places?.shapes?.length) {
    const at = new Map(places.shapes.map((p) => [p.id, p]));
    const placed = {
      ...doc,
      shapes: (doc.shapes ?? []).map((sh) => {
        const q = at.get(sh.id);
        return q ? { ...sh, x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 } : sh;
      }),
    };
    return placeMarks(placed, { ...places, shapes: [] });
  }
  if (places?.slides?.length) {
    const at = new Map(places.slides.map((p) => [p.id, p]));
    const placed = { ...doc, slides: (doc.slides ?? []).map((s) => (at.has(s.id) ? { ...s, x: at.get(s.id)!.x, y: at.get(s.id)!.y } : s)) };
    return placeMarks(placed, { ...places, slides: [] });
  }
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
    arrows: doc.arrows.map((a) => {
      const p = arrowAt.get(a.id);
      return p ? { ...a, x: p.x, y: p.y, ...(p.angle != null ? { angle: p.angle } : {}), ...(p.corners ? { corners: p.corners.map((c) => ({ ...c })) } : {}) } : a;
    }),
    pluses: (doc.pluses ?? []).map((p) => at(p, plusAt)),
    ...(doc.captions ? { captions: doc.captions.map((c) => at(c, captionAt)) } : {}),
  };
  return withCaptionsBy(moved, by, new Set(captionAt.keys()));
}

/** Something a hand can put a mark of: an atom's charge, an atom's R or S, a bond's E or Z. */
export type MarkOf = { atom: number; kind: "charge" | "stereo" } | { bond: number };

/** `doc` with a mark put where a hand put it - `at`, from what it is of - or (null) back where the drawing puts it. */
/** How far from what it is of a mark put by hand is read, in ems of the labels: farther, it is put back (utils/copyPaste); put, it goes no farther. */
export const MARK_REACH = 50;

export function putMark(doc: WorkspaceDocument, of: MarkOf, given: MarkAt | null): WorkspaceDocument {
  // (no farther than a mark is read back from a file or a copy - dragged
  // farther, it was put back on reopening, or on pasting)
  const far = given ? Math.hypot(given.x, given.y) : 0;
  const at = given && far >= MARK_REACH ? { x: (given.x * (MARK_REACH - 0.01)) / far, y: (given.y * (MARK_REACH - 0.01)) / far } : given;
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
  patch: CaptionPatch,
): WorkspaceDocument {
  const captions = doc.captions ?? [];
  const index = captions.findIndex((c) => c.id === id);
  if (index < 0) return doc;
  const { arrow, width, align, size, font, lines, marks, ...rest } = patch;
  const was = captions[index];
  // (over the arrow it was over, unless said; as wide as it was, unless said - none, as its words)
  const link = arrow === undefined ? was.arrow : (arrow ?? undefined);
  const wide = width === undefined ? was.width : width != null && width > 0 ? width : undefined;
  // (centred, unless said otherwise)
  const lie = align === undefined ? was.align : align === "center" ? undefined : align;
  // (its own size, unless said - none, the labels'; its letters marked as they were, unless said - none, plain)
  const sized = size === undefined ? was.size : size != null && size > 0 ? size : undefined;
  // (its own typeface and line spacing, unless said - none, the labels' and single)
  const face = font === undefined ? was.font : font || undefined;
  const spaced = lines === undefined ? was.lines : lines != null && lines > 0 && lines !== 1 ? lines : undefined;
  const marked = marks === undefined ? was.marks : marks.length ? marks : undefined;
  const { arrow: _was, width: _wide, align: _lie, size: _size, font: _font, lines: _lines, marks: _marks, ...kept } = was;
  const next: Caption = {
    ...kept,
    ...rest,
    ...(link != null ? { arrow: link } : {}),
    ...(wide != null ? { width: wide } : {}),
    ...(lie ? { align: lie } : {}),
    ...(sized != null ? { size: sized } : {}),
    ...(face ? { font: face } : {}),
    ...(spaced != null ? { lines: spaced } : {}),
    ...(marked ? { marks: marked } : {}),
  };
  const sameMarks = JSON.stringify(next.marks ?? []) === JSON.stringify(was.marks ?? []);
  if (next.text === was.text && next.x === was.x && next.y === was.y && next.arrow === was.arrow && next.width === was.width && next.align === was.align && next.size === was.size && next.font === was.font && next.lines === was.lines && sameMarks) return doc;
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

/** `doc` without the PDFs `ids`. */
export function removePdfs(doc: WorkspaceDocument, ids: ReadonlySet<number>): WorkspaceDocument {
  if (!ids.size || !(doc.pdfs ?? []).some((p) => ids.has(p.id))) return doc;
  return { ...doc, pdfs: doc.pdfs!.filter((p) => !ids.has(p.id)) };
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
export function picturesInRow(held: readonly PictureToAdd[], at: { x: number; y: number }, point = POINT): Omit<PictureItem, "id">[] {
  const out: Omit<PictureItem, "id">[] = [];
  let x = at.x;
  for (const h of held) {
    if (typeof h?.name !== "string" || typeof h.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(h.sha256)) continue;
    if (!PICTURE_MEDIA.includes(h.media) || !(h.width > 0) || !(h.height > 0)) continue;
    const size = printedSize(h);
    const w = size.w * point;
    if (out.length) x += w / 2;
    out.push({ name: h.name, sha256: h.sha256, media: h.media, px: [h.width, h.height], x, y: at.y, w, h: size.h * point, ...(h.from ? { from: h.from } : {}) });
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

/** `doc` with the words `ids` marked as `marksFor` says for each - their letters set otherwise - unchanged where nothing changes. */
export function markCaptions(doc: WorkspaceDocument, ids: Iterable<number>, marksFor: (c: Caption) => WordsMark[]): WorkspaceDocument {
  const take = new Set(ids);
  let changed = false;
  const captions = (doc.captions ?? []).map((c) => {
    if (!take.has(c.id)) return c;
    const marks = marksFor(c);
    if (JSON.stringify(marks) === JSON.stringify(c.marks ?? [])) return c;
    changed = true;
    const { marks: _was, ...kept } = c;
    return marks.length ? { ...kept, marks } : kept;
  });
  return changed ? { ...doc, captions } : doc;
}

// --- slides ----------------------------------------------------------------------

/** `doc` with a slide put on the page, last in the talk's order; it is numbered `nextSlideId`. */
export function addSlide(doc: WorkspaceDocument, slide: Omit<Slide, "id">): WorkspaceDocument {
  if (![slide.x, slide.y, slide.w, slide.h].every(Number.isFinite) || !(slide.w > 0) || !(slide.h > 0)) return doc;
  const id = doc.nextSlideId ?? 1;
  return { ...doc, slides: [...(doc.slides ?? []), { ...slide, id }], nextSlideId: id + 1 };
}

/** `doc` with the slide `id` moved, made larger or smaller - never to nothing - or shown with the page about it, or not. */
export function updateSlide(doc: WorkspaceDocument, id: number, patch: Partial<Pick<Slide, "x" | "y" | "w" | "h">> & { around?: boolean }): WorkspaceDocument {
  const was = doc.slides?.find((s) => s.id === id);
  if (!was) return doc;
  const { around, ...place } = patch;
  const { around: _, ...kept } = was;
  const next: Slide = { ...kept, ...place, ...((around ?? was.around) ? { around: true as const } : {}) };
  if (!(next.w > 0) || !(next.h > 0) || ![next.x, next.y, next.w, next.h].every(Number.isFinite)) return doc;
  return { ...doc, slides: doc.slides!.map((s) => (s.id === id ? next : s)) };
}

/** `doc` with the slide `id` at `to` in the talk's order, from 0 - the others moving up or down one. */
export function orderSlide(doc: WorkspaceDocument, id: number, to: number): WorkspaceDocument {
  const slides = doc.slides ?? [];
  const from = slides.findIndex((s) => s.id === id);
  const at = Math.max(0, Math.min(slides.length - 1, Math.round(to)));
  if (from < 0 || at === from) return doc;
  const rest = slides.filter((s) => s.id !== id);
  return { ...doc, slides: [...rest.slice(0, at), slides[from], ...rest.slice(at)] };
}

/** `doc` without the slides `ids`. */
export function removeSlides(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  if (!doc.slides?.some((s) => gone.has(s.id))) return doc;
  return { ...doc, slides: doc.slides.filter((s) => !gone.has(s.id)) };
}

// --- shapes ----------------------------------------------------------------------

/** How far *Box around these* stands clear of what it is round: a third of a bond. */
export const SHAPE_PAD = NOMINAL_BOND_LENGTH / 3;

const finite = (...xs: number[]) => xs.every(Number.isFinite);

/** `doc` with a shape put on the page, over the others; it is numbered `nextShapeId`. A box with no room, or a line with no length, is not. */
export function addShape(doc: WorkspaceDocument, shape: Omit<Shape, "id">): WorkspaceDocument {
  const { x0, y0, x1, y1 } = shape;
  if (!finite(x0, y0, x1, y1) || (shape.radius != null && !finite(shape.radius))) return doc;
  if (isBox(shape.kind) ? !(x1 > x0 && y1 > y0) : x0 === x1 && y0 === y1) return doc;
  const id = doc.nextShapeId ?? 1;
  return { ...doc, shapes: [...(doc.shapes ?? []), { ...shape, id }], nextShapeId: id + 1 };
}

/** `s` as `patch` changes it: a line as wide as the bonds', plain and no colour of its own being what a shape has when it says nothing. */
function patched(s: Shape, patch: ShapePatch): Shape {
  const { width, dash, stroke, fill, ...place } = patch;
  const { width: w0, dash: d0, stroke: s0, fill: f0, ...rest } = s;
  const w = width === undefined ? w0 : width != null && width > 0 && Number.isFinite(width) ? width : undefined;
  const d = dash === undefined ? d0 : dash || undefined;
  const st = stroke === undefined ? s0 : (stroke ?? undefined);
  const f = fill === undefined ? f0 : (fill ?? undefined);
  // (square corners: no radius kept)
  const { radius: r0, ...kept } = { ...rest, ...place };
  const r = r0 != null && r0 > 0 && rest.kind === "rect" ? r0 : undefined;
  return { ...kept, ...(r ? { radius: r } : {}), ...(w ? { width: w } : {}), ...(d ? { dash: true as const } : {}), ...(st ? { stroke: st } : {}), ...(f ? { fill: f } : {}) };
}

const sameShape = (a: Shape, b: Shape) => JSON.stringify(a) === JSON.stringify(b);

/**
 * `doc` with the shape `id` changed as `patch` says - never to a box with no
 * room, nor to a line with no length (as `addShape` and the reader refuse
 * one: a line's end dragged onto its other end was kept, then lost on
 * saving).
 */
export function updateShape(doc: WorkspaceDocument, id: number, patch: ShapePatch): WorkspaceDocument {
  const was = doc.shapes?.find((x) => x.id === id);
  if (!was) return doc;
  const next = patched(was, patch);
  const roomless = isBox(next.kind) ? !(next.x1 > next.x0 && next.y1 > next.y0) : next.x0 === next.x1 && next.y0 === next.y1;
  if (!finite(next.x0, next.y0, next.x1, next.y1) || roomless || sameShape(was, next)) return doc;
  return { ...doc, shapes: doc.shapes!.map((x) => (x.id === id ? next : x)) };
}

/** `doc` with the shapes `ids` changed alike as `patch` says - their look, not where they are. */
export function restyleShapes(doc: WorkspaceDocument, ids: Iterable<number>, patch: Pick<ShapePatch, "width" | "dash" | "stroke" | "fill">): WorkspaceDocument {
  const take = new Set(ids);
  let changed = false;
  const shapes = (doc.shapes ?? []).map((x) => {
    if (!take.has(x.id)) return x;
    const next = patched(x, patch);
    if (sameShape(x, next)) return x;
    changed = true;
    return next;
  });
  return changed ? { ...doc, shapes } : doc;
}

/** `doc` with the shapes `ids` over all the others (`front`), or under them, in the order they were among themselves. */
export function orderShapes(doc: WorkspaceDocument, ids: Iterable<number>, front: boolean): WorkspaceDocument {
  const take = new Set(ids);
  const shapes = doc.shapes ?? [];
  const taken = shapes.filter((x) => take.has(x.id));
  const rest = shapes.filter((x) => !take.has(x.id));
  const next = front ? [...rest, ...taken] : [...taken, ...rest];
  return next.every((x, i) => x === shapes[i]) ? doc : { ...doc, shapes: next };
}

// --- writing by hand -----------------------------------------------------------

const sameLook = (a: InkLook, b: InkLook) => a.pen === b.pen && a.width === b.width && (a.color ?? null) === (b.color ?? null);

/** `doc` with a stroke written: on the piece `join` where that is in the same pen, else a piece of its own, numbered `nextInkId`. */
export function addInkStroke(doc: WorkspaceDocument, look: InkLook, stroke: InkStroke, join?: number | null): WorkspaceDocument {
  if (stroke.points.length < 3 || !stroke.points.every(Number.isFinite)) return doc;
  const piece = join != null ? doc.inks?.find((k) => k.id === join) : undefined;
  if (piece && sameLook(piece, look)) return { ...doc, inks: doc.inks!.map((k) => (k.id === piece.id ? { ...k, strokes: [...k.strokes, stroke] } : k)) };
  const id = doc.nextInkId ?? 1;
  return { ...doc, inks: [...(doc.inks ?? []), { id, pen: look.pen, width: look.width, ...(look.color ? { color: look.color } : {}), strokes: [stroke] }], nextInkId: id + 1 };
}

/** `doc` with a piece of writing added whole - pasted, say - numbered `nextInkId`. */
export function addInk(doc: WorkspaceDocument, piece: Omit<Ink, "id">): WorkspaceDocument {
  if (!piece.strokes.length) return doc;
  const id = doc.nextInkId ?? 1;
  return { ...doc, inks: [...(doc.inks ?? []), { ...piece, id }], nextInkId: id + 1 };
}

/** `doc` with a stroke written on page `page` of the PDF `pdf`: on its piece `join` (by place) where that is on the same page in the same pen, else a piece of its own. */
export function addPdfInkStroke(doc: WorkspaceDocument, pdf: number, page: number, look: InkLook, stroke: InkStroke, join?: number | null): WorkspaceDocument {
  const p = doc.pdfs?.find((x) => x.id === pdf);
  if (!p || page < 0 || page >= p.pages.length || stroke.points.length < 3 || !stroke.points.every(Number.isFinite)) return doc;
  const inks = p.inks ?? [];
  const piece = join != null ? inks[join] : undefined;
  const next =
    piece && piece.page === page && sameLook(piece, look)
      ? inks.map((k, i) => (i === join ? { ...k, strokes: [...k.strokes, stroke] } : k))
      : [...inks, { page, pen: look.pen, width: look.width, ...(look.color ? { color: look.color } : {}), strokes: [stroke] }];
  return { ...doc, pdfs: doc.pdfs!.map((x) => (x.id === pdf ? { ...x, inks: next } : x)) };
}

/** `doc` without the strokes `cuts` names on PDFs' pages - a piece left with none, gone. */
export function removePdfInkStrokes(doc: WorkspaceDocument, cuts: readonly { pdf: number; piece: number; index: number }[]): WorkspaceDocument {
  if (!cuts.length || !doc.pdfs?.length) return doc;
  let changed = false;
  const pdfs = doc.pdfs.map((p) => {
    const mine = cuts.filter((c) => c.pdf === p.id);
    if (!mine.length || !p.inks?.length) return p;
    const inks = p.inks.flatMap((k, i) => {
      const gone = new Set(mine.filter((c) => c.piece === i).map((c) => c.index));
      if (!gone.size) return [k];
      changed = true;
      const strokes = k.strokes.filter((_, j) => !gone.has(j));
      return strokes.length ? [{ ...k, strokes }] : [];
    });
    if (inks.length === p.inks.length && !changed) return p;
    const { inks: _was, ...rest } = p;
    return inks.length ? { ...rest, inks } : rest;
  });
  return changed ? { ...doc, pdfs } : doc;
}

/** `doc` without the strokes `cuts` names - a piece left with none, gone. */
export function removeInkStrokes(doc: WorkspaceDocument, cuts: readonly { id: number; index: number }[]): WorkspaceDocument {
  if (!cuts.length || !doc.inks?.length) return doc;
  const gone = new Map<number, Set<number>>();
  for (const c of cuts) gone.set(c.id, (gone.get(c.id) ?? new Set()).add(c.index));
  let changed = false;
  const inks = doc.inks.flatMap((k) => {
    const g = gone.get(k.id);
    if (!g) return [k];
    const strokes = k.strokes.filter((_, i) => !g.has(i));
    if (strokes.length === k.strokes.length) return [k];
    changed = true;
    return strokes.length ? [{ ...k, strokes }] : [];
  });
  return changed ? { ...doc, inks } : doc;
}

/** `doc` with the pieces `ids` in `color` - or, null, the pen's own. */
export function colourInks(doc: WorkspaceDocument, ids: Iterable<number>, color: string | null): WorkspaceDocument {
  const take = new Set(ids);
  let changed = false;
  const inks = (doc.inks ?? []).map((k) => {
    if (!take.has(k.id) || (k.color ?? null) === color) return k;
    changed = true;
    const { color: _was, ...rest } = k;
    return color ? { ...rest, color } : rest;
  });
  return changed ? { ...doc, inks } : doc;
}

/** `doc` without the pieces of writing `ids`. */
export function removeInks(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  if (!doc.inks?.some((k) => gone.has(k.id))) return doc;
  return { ...doc, inks: doc.inks.filter((k) => !gone.has(k.id)) };
}

// --- catalytic cycles --------------------------------------------------------

/** `doc` with a catalytic cycle put on the page; it is numbered `nextCycleId`. One with no radius is not. */
export function addCycle(doc: WorkspaceDocument, cycle: Omit<Cycle, "id">): WorkspaceDocument {
  if (!finite(cycle.x, cycle.y, cycle.r) || !(cycle.r > 0)) return doc;
  const id = doc.nextCycleId ?? 1;
  return { ...doc, cycles: [...(doc.cycles ?? []), { ...cycle, id }], nextCycleId: id + 1 };
}

/** A change to a cycle: which way it goes, its arrows coming in and going out, its colour (null: none of its own), its arrows' gap (null: Meno's) and the gaps set by hand at their ends (`endKey`; a null, that end's taken away). */
export type CyclePatch = { ccw?: boolean; branches?: CycleBranch[]; color?: string | null; gap?: number | null; ends?: Record<string, number | null> };

/** `doc` with the cycle `id` changed as `patch` says. */
export function updateCycle(doc: WorkspaceDocument, id: number, patch: CyclePatch): WorkspaceDocument {
  const at = (doc.cycles ?? []).findIndex((c) => c.id === id);
  if (at < 0) return doc;
  const { ccw: _w, branches: _b, color: _c, gap: _g, ends: _e, ...rest } = doc.cycles![at];
  const was = doc.cycles![at];
  const gap = patch.gap === undefined ? was.gap : patch.gap ?? undefined;
  const ends = { ...(was.ends ?? {}) };
  for (const [k, v] of Object.entries(patch.ends ?? {})) {
    if (v == null || !Number.isFinite(v)) delete ends[k];
    else ends[k] = Math.min(GAP_MOST, Math.max(0, v));
  }
  const ccw = patch.ccw === undefined ? was.ccw : patch.ccw || undefined;
  const branches = patch.branches === undefined ? was.branches : patch.branches.length ? patch.branches : undefined;
  const color = patch.color === undefined ? was.color : patch.color ?? undefined;
  const next: Cycle = {
    ...rest,
    ...(ccw ? { ccw: true as const } : {}),
    ...(branches ? { branches } : {}),
    ...(color ? { color } : {}),
    ...(gap != null && Number.isFinite(gap) ? { gap: Math.min(GAP_MOST, Math.max(0, gap)) } : {}),
    ...(Object.keys(ends).length ? { ends } : {}),
  };
  return { ...doc, cycles: doc.cycles!.map((c, i) => (i === at ? next : c)) };
}

export function removeCycles(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  if (!doc.cycles?.some((c) => gone.has(c.id))) return doc;
  return { ...doc, cycles: doc.cycles.filter((c) => !gone.has(c.id)) };
}

/** `doc` without the shapes `ids`. */
export function removeShapes(doc: WorkspaceDocument, ids: Iterable<number>): WorkspaceDocument {
  const gone = new Set(ids);
  if (!doc.shapes?.some((x) => gone.has(x.id))) return doc;
  return { ...doc, shapes: doc.shapes.filter((x) => !gone.has(x.id)) };
}

/** Where the shape `s` lies moved by `d`, as `MarkPlaces` says it. */
export function shapePlace(s: Shape, d: { x: number; y: number }): NonNullable<MarkPlaces["shapes"]>[number] {
  const m = shapeMoved(s, d);
  return { id: s.id, x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 };
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

// --- colour ----------------------------------------------------------------

/**
 * `doc` with the atoms and bonds `parts` names given `color` - drawn in it
 * (`which` "color"), or highlighted in it - or (null) none; and its
 * electron-pushing arrows drawn in it.
 */
export function colourParts(
  doc: WorkspaceDocument,
  parts: { atoms: Iterable<number>; bonds: Iterable<number>; pushes?: Iterable<number> },
  which: "color" | "highlight",
  color: string | null,
): WorkspaceDocument {
  const atomIds = new Set(parts.atoms);
  const bondIds = new Set(parts.bonds);
  let changed = false;
  const paint = <T extends { id: number; color?: string; highlight?: string }>(x: T, named: ReadonlySet<number>): T => {
    if (!named.has(x.id) || (x[which] ?? null) === color) return x;
    changed = true;
    const { [which]: _was, ...rest } = x;
    return (color ? { ...rest, [which]: color } : rest) as T;
  };
  const atoms = doc.model.atoms.map((a) => paint(a, atomIds));
  const bonds = doc.model.bonds.map((b) => paint(b, bondIds));
  const pushIds = new Set(which === "color" ? (parts.pushes ?? []) : []);
  const pushes = pushIds.size ? (doc.pushes ?? []).map((p) => paint(p, pushIds)) : doc.pushes;
  return changed ? { ...doc, model: { atoms, bonds }, ...(pushes ? { pushes } : {}) } : doc;
}

/** `doc` with the rings `keys` filled with `color`, or (null) not. */
export function fillRings(doc: WorkspaceDocument, keys: readonly string[], color: string | null): WorkspaceDocument {
  const was = doc.ringFills ?? {};
  const next = { ...was };
  // (a ring no longer drawn - undone away under an open colour card - is
  // given nothing: its fill was a step that changed nothing to be seen,
  // and came back on the next ring drawn with its atoms' ids)
  for (const k of keys.filter((key) => ringThere(doc.model, key))) {
    if (color) next[k] = color;
    else delete next[k];
  }
  return keys.every((k) => was[k] === next[k]) ? doc : { ...doc, ringFills: next };
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

/**
 * The workspace in drawing style `style`, set as it is - nothing on the page
 * converted: as a file saved without one is given Settings'. A change of
 * style from the canvas converts the page with it (./restyle
 * `restyledDocument`).
 */
export function setDocumentStyle(doc: WorkspaceDocument, style: StyleChoice): WorkspaceDocument {
  return doc.style === style ? doc : { ...doc, style };
}

/** The workspace in styles in 3D `style3d`, set as they are: its molecules drawn in them. */
export function setDocumentStyle3d(doc: WorkspaceDocument, style3d: Workspace3D): WorkspaceDocument {
  return doc.style3d === style3d ? doc : { ...doc, style3d };
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

/** A text as it is held: its lines ended "\n", however its file ended them - Windows writes "\r\n". */
const heldText = (text: string) => text.replace(/\r\n?/g, "\n");

/**
 * Texts added, each after those it holds, and the id of the last: one it
 * holds already - the same name and text - not added again, its id given;
 * one with no name, a new one, named (utils/texts `newTextName`). One that
 * could not be read whose words these are - the same SHA-256 - is had
 * again: it goes, the text come in its place in the column.
 */
export function addTexts(
  doc: WorkspaceDocument,
  texts: readonly Omit<WorkspaceText, "id">[],
): { doc: WorkspaceDocument; last: number | null } {
  const held = (doc.texts ?? []).slice();
  let next = doc.nextTextId ?? Math.max(0, ...held.map((t) => t.id)) + 1;
  let last: number | null = null;
  for (const t of texts) {
    const text = heldText(t.text);
    const same = held.find((h) => h.name === t.name && h.text === text);
    if (same) {
      last = same.id;
      continue;
    }
    held.push({ id: next, name: t.name || newTextName(held), text, ...(t.path ? { path: t.path } : {}), ...(t.at ? { at: t.at } : {}), ...(t.point != null ? { point: t.point } : {}), ...(t.reading === false ? { reading: false as const } : {}), ...(t.icon ? { icon: true as const } : {}), ...(t.of ? { of: t.of } : {}) });
    last = next++;
  }
  if (held.length === (doc.texts ?? []).length) return { doc, last };
  const lost = doc.textsLost?.length ? lostNotHad(doc.textsLost, held.slice((doc.texts ?? []).length)) : doc.textsLost;
  return { doc: { ...doc, texts: held, nextTextId: next, ...(lost !== doc.textsLost ? { textsLost: lost } : {}) }, last };
}

/** Of the texts that could not be read, those whose words none of `come` is: one it is, had again, gone. */
function lostNotHad(lost: readonly LostText[], come: readonly WorkspaceText[]): LostText[] {
  const utf8 = new TextEncoder();
  // (as a file keeps a text: its words, as they are held, as UTF-8)
  const had = new Set(come.map((t) => sha256Hex(utf8.encode(t.text))));
  const left = lost.filter((t) => !had.has(t.sha256));
  return left.length === lost.length ? (lost as LostText[]) : left;
}

/** A text that could not be read taken out. */
export function removeLostText(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  if (!(doc.textsLost ?? []).some((t) => t.id === id)) return doc;
  return { ...doc, textsLost: doc.textsLost!.filter((t) => t.id !== id) };
}

/** A text changed to `text`. */
export function editText(doc: WorkspaceDocument, id: number, typed: string): WorkspaceDocument {
  const text = heldText(typed);
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

/**
 * Texts' sheets pasted: each a text of its own, even where the workspace
 * holds the same, its sheet where it says, not read in the column - its
 * id, as it is added, among `ids`.
 */
export function addSheets(doc: WorkspaceDocument, sheets: readonly Omit<WorkspaceText, "id">[]): { doc: WorkspaceDocument; ids: number[] } {
  const held = (doc.texts ?? []).slice();
  let next = doc.nextTextId ?? Math.max(0, ...held.map((t) => t.id)) + 1;
  const ids: number[] = [];
  for (const t of sheets) {
    if (!t.at) continue;
    held.push({ id: next, name: t.name || newTextName(held), text: heldText(t.text), at: t.at, reading: false, ...(t.icon ? { icon: true as const } : {}) });
    ids.push(next++);
  }
  return ids.length ? { doc: { ...doc, texts: held, nextTextId: next }, ids } : { doc, ids };
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
export function textsInRow<T extends Omit<WorkspaceText, "id">>(texts: readonly T[], at: { x: number; y: number }, doc: Pick<WorkspaceDocument, "pictures" | "pdfs" | "texts">, point = POINT): (T & { at: { x: number; y: number }; icon: true; point?: number })[] {
  const step = (ICON_NAME_WIDTH * point) / POINT + NOMINAL_BOND_LENGTH;
  // (each by its top left, its middle where it goes; laid at `point`, the workspace's)
  const row = texts.map((t, i) => {
    const s = sheetOf(t.text, t.name, point);
    return { ...t, at: { x: at.x + i * step - s.w / 2, y: at.y + s.h / 2 }, icon: true as const, ...(point !== POINT ? { point } : {}) };
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
