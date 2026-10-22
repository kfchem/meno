import { editorLayoutOptions } from "../../layoutOptions";
import { leftTogether } from "../../utils/readNotes";
import { styleOf } from "../../../../../lib/chem/style";
import { wordsSet } from "../../../../../lib/chem/captions";
import { labelSetOf } from "../../../../../lib/chem/layout2d";
import type { ShowBox } from "../../utils/viewShow";
import { bondPtOf, labelPtOf, wordsKept } from "../../restyle";
import { restyledDrawn } from "../../utils/copyPaste";
import { useAppSettings } from "../../../../../lib/settings/appSettings";
import { bondKindPatch, type BondKindName } from "../../utils/bondKinds";
import { gestureStep } from "../../../../../lib/doc/document";
import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import { useReadings } from "../../../../../lib/calc/readings";
import type { ImportedScheme, WorkspaceDocument } from "../../document";
import type { ArrowLook } from "../../../../../lib/chem/reactionArrow";
import { ARROW_LENGTH_BONDS } from "../../../../../lib/chem/reactionScheme";
import { EditorState, Bond, Arrow, Model, Drawn, type ArrowAtomMap, type ArrowFormPatch, type MarkAt, type PushEnd } from "../types";
import { marksAtOf, turnedOver, turnedOverArrows } from "../../utils/selection";
import { turnedOverRest, turnOverMiddle } from "../../utils/turnOver";
import { endsRenamed } from "../../utils/cycles";
import { selectionScheme } from "../../utils/selectionScheme";
import { relinked } from "../../utils/drawnLink";
import { pictureBytes } from "../../../../../lib/picture/held";
import { resultKey } from "../../../../../lib/calc/results";
import type { SavedText, Workspace } from "../../utils/workspace";
import { StoreApi } from "zustand";
import { nextIdAfter } from "../../workflow/saved";
import { membersFound } from "../../workflow/model";
import { appendParts, NO_PARTS, removeParts } from "../../workflow/parts";
import { recordsShownAdded, recordsShownOf, shownModel } from "../../utils/stacks";
import { editAtTrueSize } from "../../utils/trueSize";
import { style3dOf } from "../../style3d";
import { hapticStars } from "../../chem/eta";
import { workspace3dOf } from "../../../../../lib/chem/workspaceStyle3d";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/**
 * After a deletion, nothing is under the pointer until it moves again, and
 * the selection holds only what is still there. The view stays where it is.
 */
function forgetDeleted(set: SetState) {
  set((prev: EditorState) => {
    const atoms = new Set(prev.model.atoms.map((a) => a.id));
    const bonds = new Set(prev.model.bonds.map((b) => b.id));
    return {
      ...prev,
      hovered: { atomId: null, bondId: null },
      sel: {
        atoms: new Set([...prev.sel.atoms].filter((id) => atoms.has(id))),
        bonds: new Set([...prev.sel.bonds].filter((id) => bonds.has(id))),
      },
    };
  });
}

/**
 * What `appendModel` (../../document) added to `model`, whose next id was
 * `start`: every atom and bond numbered from there on - ids are handed out
 * in order and never again, an Sgroup's among them - selected, so that it
 * can be dragged straight on.
 */
/**
 * Where the atoms numbered from `start` on lie, a bond's length round them
 * for their labels: what was just put down, to be shown (utils/viewShow).
 * None, where none were.
 */
export function addedBox(start: number, model: Model): ShowBox | null {
  const atoms = model.atoms.filter((a) => a.id >= start);
  if (!atoms.length) return null;
  const pad = NOMINAL_BOND_LENGTH;
  return {
    x0: Math.min(...atoms.map((a) => a.x)) - pad,
    x1: Math.max(...atoms.map((a) => a.x)) + pad,
    y0: Math.min(...atoms.map((a) => a.y)) - pad,
    y1: Math.max(...atoms.map((a) => a.y)) + pad,
  };
}

/** `box` taken out to the words on the page numbered from `start` on, as they are set in the workspace's style: a scheme's put down with its structures. */
function withWordsAdded(box: ShowBox | null, st: Pick<EditorState, "captions" | "docStyle">, start: number): ShowBox | null {
  const words = st.captions.filter((c) => c.id >= start);
  if (!words.length) return box;
  const opts = editorLayoutOptions(styleOf(st.docStyle));
  let out = box;
  for (const c of words) {
    const set = wordsSet(c, opts, labelSetOf(opts));
    const b = { x0: c.x - set.halfW, x1: c.x + set.halfW, y0: c.y - set.halfH, y1: c.y + set.halfH };
    out = out ? { x0: Math.min(out.x0, b.x0), x1: Math.max(out.x1, b.x1), y0: Math.min(out.y0, b.y0), y1: Math.max(out.y1, b.y1) } : b;
  }
  return out;
}

function added(start: number, model: Model): EditorState["sel"] {
  return {
    atoms: new Set(model.atoms.filter((a) => a.id >= start).map((a) => a.id)),
    bonds: new Set(model.bonds.filter((b) => b.id >= start).map((b) => b.id)),
  };
}

/**
 * Model edits go to the tab's document, which is what undo, redo and saving
 * act on. The store keeps a mirror of it for rendering (see ../index.tsx), so
 * components still read `model` and `arrows` exactly as before.
 *
 * Each action is one undo step, except where a gesture produces several edits
 * in a row - those share a coalesce key so a drag stays one step.
 */
/** What a press may change that a pinch begun with it takes back (`notePress`, `takeBackPress`): the selection, besides the document. */
const SELECTION_KEYS = ["sel", "selAnchor", "sel3d", "chosen3d", "selFlow", "pdfSel", "pdfBox", "selPictures", "selTexts", "selCaptions", "selPdfs", "selSlides", "selShapes", "selArrows", "selPluses", "selInks"] as const;
type PressNote = { depth: number; state: WorkspaceDocument; selection: Pick<EditorState, (typeof SELECTION_KEYS)[number]> };
/** The press noted last, by its document: none once taken back. */
const pressNotes = new WeakMap<DocumentStore<WorkspaceDocument>, PressNote>();

export const createModelSlice = (
  doc: DocumentStore<WorkspaceDocument>,
  set: SetState,
  get: GetState,
) => ({
  addAtom: (x: number, y: number, el: string = "C", r: number = 0.9) => {
    const id = doc.getState().nextId;
    doc.edit("add atom", (d) => ops.addAtom(d, x, y, el, r));
    return id;
  },

  addBond: (a: number, b: number, order: Bond["order"] = 1) => {
    const id = doc.getState().nextId;
    doc.edit("add bond", (d) => ops.addBond(d, a, b, order));
    return id;
  },

  connectAtoms: (
    a: number,
    b: number,
    order: Bond["order"] = 1,
  ): number | null => {
    const before = doc.getState();
    if (a === b || ops.hasBond(before, a, b)) return null;
    doc.edit("add bond", (d) => ops.connectAtoms(d, a, b, order));
    return before.nextId;
  },

  /** New atom plus the bond that holds it: one step for the whole gesture. */
  addAtomBonded: (
    baseId: number,
    x: number,
    y: number,
    el: string = "C",
    order: Bond["order"] = 1,
  ) => {
    const id = doc.getState().nextId;
    doc.edit("extend bond", (d) =>
      ops.addAtomBonded(d, baseId, x, y, el, order),
    );
    return id;
  },

  /** Two atoms and the bond between them: one step. */
  addBondedPair: (
    first: { x: number; y: number; el?: string },
    second: { x: number; y: number; el?: string },
    order: Bond["order"] = 1,
  ) => {
    doc.edit("draw bond", (d) => ops.addBondedPair(d, first, second, order));
  },

  replaceDraggedAtomWith: (movingId: number, targetId: number) => {
    doc.edit("merge atoms", (d) =>
      ops.replaceDraggedAtomWith(d, movingId, targetId),
    );
  },

  findAtomNear: (
    x: number,
    y: number,
    tol: number = NOMINAL_BOND_LENGTH * 0.3,
    excludeId: number | null = null,
  ): number | null => {
    let best: { id: number; d: number } | null = null;
    // (a haptic bond's star is no atom to land on: chem/eta)
    const stars = hapticStars(get().model);
    for (const a of get().model.atoms) {
      if ((excludeId != null && a.id === excludeId) || stars.has(a.id)) continue;
      const d = Math.hypot(x - a.x, y - a.y);
      if (d <= tol && (!best || d < best.d)) best = { id: a.id, d };
    }
    return best ? best.id : null;
  },

  moveAtoms: (moves: { id: number; x: number; y: number }[], gesture: string, marks?: ops.MarkPlaces) => {
    doc.edit("move atoms", (d) => ops.placeMarks(ops.placeAtoms(d, moves), marks), gestureStep(`move-atoms:${gesture}`));
  },

  dropMoveAtoms: (gesture: string) => {
    doc.drop(`move-atoms:${gesture}`);
  },

  turnSelectionOver: (axis: "vertical" | "horizontal") => {
    const { sel, model } = get();
    if (!sel.atoms.size) return;
    // (marks put by hand turned over with them)
    const markAts = marksAtOf(model, sel.atoms, (p) => (axis === "vertical" ? { x: -p.x, y: p.y } : { x: p.x, y: -p.y }));
    // (the arrows, "+" signs and words among them, and those selected for themselves, too - the words' places, their letters upright - as a drag takes them)
    const among = selectionScheme(get());
    const words = among.captions;
    // (all of it - and the pictures, texts' sheets, PDFs, slides, shapes and molecules in 3D selected with it - about the middle of all it moves, which so stays where it was)
    const mid = turnOverMiddle(get(), { arrows: among.arrows, pluses: among.pluses, captions: words })!;
    const over = turnedOver(model, sel.atoms, axis, mid);
    const mirrored = (p: { id: number; x: number; y: number }) => ({ id: p.id, x: axis === "vertical" ? 2 * mid.x - p.x : p.x, y: axis === "horizontal" ? 2 * mid.y - p.y : p.y });
    const scheme = { arrows: turnedOverArrows(among.arrows, mid, axis), pluses: among.pluses.map(mirrored), captions: words.map(mirrored) };
    // (and the electron-pushing arrows on it, each bent to its other side)
    doc.edit("turn over", (d) => ops.turnPushesOver(ops.placeMarks(ops.placeAtoms(d, over.atoms, over.bonds), { markAts, ...scheme, ...turnedOverRest(get(), axis, mid) }), sel.atoms));
  },

  putMark: (of: ops.MarkOf, at: MarkAt | null, gesture?: string) => {
    doc.edit(at ? "move mark" : "put mark back", (d) => ops.putMark(d, of, at), gesture ? gestureStep(`mark:${gesture}`) : undefined);
  },

  deleteSelection: () => {
    const { sel, sel3d, selFlow, selPictures, selTexts, selCaptions, selPdfs, selSlides, selShapes, selArrows, selPluses, selInks, selCycles, steps } = get();
    if (!sel.atoms.size && !sel.bonds.size && !sel3d.size && !selFlow.sets.size && !selFlow.steps.size && !selPictures.size && !selTexts.size && !selCaptions.size && !selPdfs.size && !selSlides.size && !selShapes.size && !selArrows.size && !selPluses.size && !selInks.size && !selCycles.size) return;
    // the arrows and pluses among it go with it, as with a cut, and those
    // selected for themselves; the molecules in 3D selected, and a
    // workflow's sets and steps, in the same step - but not a step running,
    // which is asked about on its own
    const among = selectionScheme(get());
    const ids = (xs: { id: number }[]) => new Set(xs.map((x) => x.id));
    const held = [...selFlow.sets].filter((id) => get().sets.find((b) => b.id === id)?.collection?.length);
    const idle = [...selFlow.steps].filter((id) => !steps.find((s) => s.id === id)?.running);
    const gone = steps.filter((s) => idle.includes(s.id));
    const deleted = doc.edit("delete selection", (d) =>
      removeParts(
        ops.removeCycles(
        ops.removeInks(
        ops.removeShapes(
        ops.removeSlides(
          ops.removePdfs(
            ops.removeTexts(
              ops.removePictures(ops.removeMolecules3d(ops.deleteDrawn(d, sel.atoms, sel.bonds, ids(among.arrows), ids(among.pluses), ids(among.captions)), sel3d), selPictures),
              selTexts,
            ),
            selPdfs,
          ),
          selSlides,
        ),
        selShapes,
        ),
        selInks,
        ),
        selCycles,
        ),
        // (but a set that holds its molecules itself, on no page: asked about first, after the rest)
        [...selFlow.sets].filter((id) => !held.includes(id)),
        idle,
      ),
    );
    // (those asked about: the selection's sets that hold their molecules themselves - so a selection of nothing else asks, not nothing)
    if (held.length) set({ askDeleteSet: held });
    if (!deleted) return;
    forgetDeleted(set);
    // (the steps' jobs' folders taken away, as when a step is deleted on its own)
    for (const s of gone) get().forgetStepJobs(s);
  },

  moveAtom: (id: number, x: number, y: number) => {
    doc.edit("move atom", (d) => ops.moveAtom(d, id, x, y), {
      coalesceKey: `move-atom:${id}`,
    });
  },

  setAtomNumbers: (of: Parameters<typeof ops.setAtomNumbers>[1], show: boolean) => {
    doc.edit(show ? "show atom numbers" : "hide atom numbers", (d) => ops.setAtomNumbers(d, of, show));
  },
  setAtomNumberKind: (molecules: readonly number[], kind: Parameters<typeof ops.setAtomNumberKind>[2]) => {
    doc.edit("atom numbers' kind", (d) => ops.setAtomNumberKind(d, molecules, kind));
  },

  setAtomMap: (arrowId: number, map: ArrowAtomMap | null) => {
    doc.edit("atom map", (d) => ops.setAtomMap(d, arrowId, map));
  },

  showAtomMap: (arrowId: number, shown: boolean) => {
    const map = get().arrows.find((a) => a.id === arrowId)?.atomMap;
    if (map) doc.edit(shown ? "show atom map" : "hide atom map", (d) => ops.setAtomMap(d, arrowId, { ...map, shown }));
  },

  otherAtomMap: (arrowId: number) => {
    const map = get().arrows.find((a) => a.id === arrowId)?.atomMap;
    if (map && map.maps.length > 1) doc.edit("other atom map", (d) => ops.setAtomMap(d, arrowId, { ...map, chosen: (map.chosen + 1) % map.maps.length, shown: true }));
  },

  setStereoShown: (of: Parameters<typeof ops.setStereoShown>[1], show: boolean) => {
    doc.edit(show ? "show R/S" : "hide R/S", (d) => ops.setStereoShown(d, of, show));
  },

  notePress: () => {
    const st = get();
    const selection = Object.fromEntries(SELECTION_KEYS.map((k) => [k, st[k]])) as PressNote["selection"];
    pressNotes.set(doc, { depth: doc.history().undoDepth, state: doc.getState(), selection });
  },

  takeBackPress: () => {
    const note = pressNotes.get(doc);
    pressNotes.delete(doc);
    get().endGestures();
    if (!note) return false;
    const back = doc.takeBackTo(note.depth, note.state);
    set((prev: EditorState) => ({ ...prev, ...note.selection }));
    return back;
  },

  drawStrokeAt: (start: { x: number; y: number }, nodes: Parameters<typeof ops.addStroke>[2]) => {
    doc.edit("draw chain", (d) => ops.addStrokeAt(d, start, nodes));
  },

  bindRing: (metal: number, ring: readonly number[]) => {
    doc.edit("bind ring", (d) => ops.bindRing(d, metal, ring));
  },

  drawStroke: (
    baseId: number,
    nodes: Parameters<typeof ops.addStroke>[2],
    kind: "bond" | "chain",
  ) => {
    doc.edit(kind === "chain" ? "draw chain" : "extend bond", (d) =>
      ops.addStroke(d, baseId, nodes),
    );
  },

  stepCharge: (id: number, step: 1 | -1) => {
    const atom = doc.getState().model.atoms.find((a) => a.id === id);
    if (!atom) return;
    const charge = (atom.charge ?? 0) + step;
    doc.edit("change charge", (d) => ops.setAtomChemistry(d, id, { ...atom, charge }));
  },

  stepCharges: (ids: Iterable<number>, step: 1 | -1) => {
    const want = new Set(ids);
    doc.edit("change charge", (d) =>
      d.model.atoms.filter((a) => want.has(a.id)).reduce((x, atom) => ops.setAtomChemistry(x, atom.id, { ...atom, charge: (atom.charge ?? 0) + step }), d),
    );
  },

  toggleRadical: (id: number) => {
    const atom = doc.getState().model.atoms.find((a) => a.id === id);
    if (!atom) return;
    doc.edit("change radical", (d) =>
      ops.setAtomChemistry(d, id, { ...atom, radical: atom.radical ? undefined : "doublet" }),
    );
  },

  deleteAtom: (id: number) => {
    if (doc.edit("delete atom", (d) => ops.deleteParts(d, [id], []))) {
      forgetDeleted(set);
    }
  },

  deleteBond: (id: number) => {
    if (doc.edit("delete bond", (d) => ops.deleteParts(d, [], [id]))) {
      forgetDeleted(set);
    }
  },

  relayout: (change: Parameters<typeof ops.relayout>[1], labels: readonly ops.WrittenAsLabel[] = []) => {
    // (laid out at true size - the places given are - and each structure shown as large as it was: utils/trueSize)
    const edited = doc.edit("clean up", (d) => editAtTrueSize(d, (t) => ops.relayout(labels.length ? ops.writtenAsLabels(t, labels) : t, change)));
    if (edited && labels.length) forgetDeleted(set);
  },

  justExpanded: () =>
    new Set(doc.history().undoLabel === "expand abbreviation" ? (doc.getState().expanded ?? []) : []),

  updateBond: (id: number, patch: Partial<Bond>) => {
    doc.edit("change bond", (d) => ops.updateBond(d, id, patch));
  },

  // (bonds chosen a kind from the right-click menu: all of them, one step)
  setBondsKind: (ids: readonly number[], kind: BondKindName) => {
    const patch = bondKindPatch(kind);
    doc.edit("change bonds' kind", (d) => ids.reduce((acc, id) => ops.updateBond(acc, id, patch), d));
  },

  setBondOrder: (id: number, order: Bond["order"]) => {
    doc.edit("change bond order", (d) => ops.updateBond(d, id, { order }));
  },

  setBondDoubleMode: (id: number, mode: NonNullable<Bond["doubleMode"]>) => {
    doc.edit("change double bond", (d) =>
      ops.updateBond(d, id, { doubleMode: mode }),
    );
  },

  setBondStereo: (id: number, stereo: NonNullable<Bond["stereo"]>) => {
    doc.edit("change stereo", (d) => ops.updateBond(d, id, { stereo }));
  },

  setBondStereoOrient: (
    id: number,
    orient: NonNullable<Bond["stereoOrient"]>,
  ) => {
    doc.edit("change stereo", (d) =>
      ops.updateBond(d, id, { stereoOrient: orient }),
    );
  },

  /**
   * The structure a tab opens with. That is where the document starts, not
   * an edit made to it: nothing to undo, nothing unsaved. Meno's own record
   * - an Office document's object opened again - brings its slides and its
   * writing by hand with it, numbered from the first.
   */
  openModel: (next: Model & Pick<Drawn, "inks" | "slides">, scheme?: ImportedScheme) => {
    const opened = ops.withImportedScheme(ops.replaceModel(doc.getState(), next), scheme);
    const withSlides = (next.slides ?? []).reduce((d, { id: _, ...s }) => ops.addSlide(d, s), opened);
    doc.reset(
      (next.inks ?? []).reduce((d, { id: _, ...k }) => ops.addInk(d, k), withSlides),
      "open structure",
    );
    get().forgetInteraction();
    // (each molecule in 3D showing the frame its file says - numbered from
    // the first, in order, as replaceModel left them to be - and each stack
    // of drawings the record marked, where it carries one: utils/stacks)
    const recordsShown = recordsShownOf(next.atoms);
    set((prev: EditorState) => ({ ...prev, frames3d: shownFrames(scheme, 1, {}), lists3d: shownLists(scheme, 1, {}), recordsShown, model: shownModel(prev.fullModel, recordsShown) }));
  },

  joinReadings: () => {
    doc.amend((d) => ops.withReadings(d, useReadings.getState().bySource));
  },

  openWorkspace: (ws: Workspace, start = false) => {
    const { drawn } = ws;
    // (its texts, those read - utils/workspace `readKept` - numbered from the first; a molecule one is of, by its place, as the molecules are numbered;
    // and those whose words could not be read after them, numbered on, kept as the file named them: store/types `LostText`)
    const read = ws.texts.filter((t) => t.text != null);
    const unread = ws.texts.filter((t) => t.text == null);
    const placed = (t: SavedText) => ({ ...(t.at ? { at: t.at } : {}), ...(t.point != null ? { point: t.point } : {}), ...(t.reading === false ? { reading: false as const } : {}), ...(t.icon ? { icon: true as const } : {}), ...(t.of ? { of: "step" in t.of ? t.of : { molecule: t.of.molecule + 1 } } : {}) });
    const texts = read.map((t, i) => ({ id: i + 1, name: t.name, text: t.text!, ...placed(t) }));
    const textsLost = unread.map((t, i) => ({ id: read.length + i + 1, name: t.name, sha256: t.sha256, ...placed(t) }));
    const shownSaved = ws.textShown != null ? ws.texts[ws.textShown] : undefined;
    const shown = shownSaved ? (shownSaved.text != null ? texts[read.indexOf(shownSaved)] : textsLost[unread.indexOf(shownSaved)])?.id ?? null : null;
    const opened = (d: WorkspaceDocument) => {
      const next = ops.withImportedScheme(ops.replaceModel(d, drawn), ops.schemeOf(drawn));
      // (a workflow's parts by their own ids, each set's members as the file said them: utils/workspace)
      const workflow = ws.workflow ? { ...ws.workflow, nextWorkflowId: nextIdAfter(ws.workflow) } : {};
      // (sets of a file saved before sets kept their members: what lies inside each frame, read once)
      return membersFound(ops.setDocumentStyle3d(ops.setDocumentStyle(
        {
          ...next,
          ...workflow,
          // (a page of its own: the view follows changes of style on one page, not from one page to another - FollowStyle)
          pageId: ops.newPageId(),
          aromaticEnabled: ws.aromaticEnabled,
          aromaticRings: ws.aromaticRings,
          texts,
          textsLost,
          nextTextId: ws.texts.length + 1,
          pdfs: ws.pdfs.map((p, i) => ({ ...p, id: i + 1 })),
          nextPdfId: ws.pdfs.length + 1,
          pictures: (drawn.pictures ?? []).map((p, i) => ({ ...p, id: i + 1 })),
          nextPictureId: (drawn.pictures ?? []).length + 1,
          slides: (drawn.slides ?? []).map((s, i) => ({ ...s, id: i + 1 })),
          nextSlideId: (drawn.slides ?? []).length + 1,
          inks: (drawn.inks ?? []).map((k, i) => ({ ...k, id: i + 1 })),
          nextInkId: (drawn.inks ?? []).length + 1,
        },
        // (a file saved without one: Settings' style, set as it is - fixed, not converted; opened in a tab, no change made)
        ws.style ?? useAppSettings.getState().drawingStyle,
      ),
        // (and its styles in 3D - a file saved before workspaces carried them: Settings' as it opens, fixed from then on)
        ws.style3d ?? workspace3dOf(useAppSettings.getState().style3d),
      ));
    };
    if (start) doc.reset(opened(doc.getState()), "open workspace");
    else doc.edit("open workspace", opened);
    get().forgetInteraction();
    // each molecule in 3D turned, and showing the frame, as it was saved -
    // numbered from the first, in order, as replaceModel left them to be
    const turns3d: EditorState["turns3d"] = {};
    const frames3d: EditorState["frames3d"] = {};
    const lists3d: EditorState["lists3d"] = {};
    // (and each stack showing the one it showed, as its stack is numbered now -
    // a stack of drawings, the record marked: utils/stacks)
    const recordsShown = recordsShownOf(drawn.atoms);
    const stacksShown: EditorState["stacksShown"] = {};
    const opened3d = doc.getState().molecules3d ?? [];
    (drawn.molecules3d ?? []).forEach((m, i) => {
      const stack = opened3d[i]?.stack;
      if (m.shown && stack) stacksShown[stack.id] = i + 1;
      if (m.turn) turns3d[i + 1] = m.turn;
      if (m.frame) frames3d[i + 1] = m.frame;
      // (a list open as it was saved, its row chosen and its surface's value)
      if (m.list) lists3d[i + 1] = { list: m.list.id, row: m.list.row, pointed: null, ...(m.list.iso != null ? { iso: m.list.iso } : {}) };
    });
    // (and its column showing the text or the PDF it showed, or closed)
    const pdfShown = ws.pdfShown != null ? ws.pdfShown + 1 : null;
    // (what its file held that could not be read: said on every save - and, opened as the document, its file kept beside the first saved over it; opened into one, never its file to keep)
    const leftOnOpen = start ? (ws.leftOut ? { left: ws.leftOut, kept: false } : null) : ws.leftOut ? { left: leftTogether(get().leftOnOpen?.left, ws.leftOut), kept: true } : get().leftOnOpen;
    set((prev: EditorState) => ({ ...prev, turns3d, frames3d, lists3d, stacksShown, recordsShown, model: shownModel(prev.fullModel, recordsShown), textShown: shown ?? texts[0]?.id ?? textsLost[0]?.id ?? null, pdfShown, textsOpen: shown != null || pdfShown != null, leftOnOpen }));
  },

  /** A file opened over what the canvas holds: one step, arrow and all. */
  replaceModel: (next: Model, scheme?: ImportedScheme) => {
    doc.edit("open structure", (d) =>
      ops.withImportedScheme(ops.replaceModel(d, next), scheme),
    );
    get().forgetInteraction();
    const recordsShown = recordsShownOf(next.atoms);
    set((prev: EditorState) => ({ ...prev, recordsShown, model: shownModel(prev.fullModel, recordsShown) }));
  },

  forgetInteraction: () => {
    // Interaction state does not survive a new structure - nor how the
    // molecules in 3D were turned, which the new ones' ids would take on.
    set((prev: EditorState) => ({
      ...prev,
      sel: { atoms: new Set(), bonds: new Set() },
      sel3d: new Set<number>(),
      selFlow: { sets: new Set<number>(), steps: new Set<number>() },
      chosen3d: null,
      hoveredSet: null,
      chosenSet: null,
      // (sets read as tables: of the old document's sets)
      setsRead: [],
      setTableShown: null,
      hoveredStep: null,
      hoveredWire: null,
      openStep: null,
      wireDrag: null,
      wireRefused: null,
      workflowMenu: null,
      turns3d: {},
      frames3d: {},
      hovered3d: null,
      hoveredMeasure3d: null,
      measureEdit3d: null,
      copied3d: null,
      hovered: { atomId: null, bondId: null },
      labelEdit: { active: false, atomId: null, value: "" },
      moveDrag: {
        active: false,
        atomId: null,
        pointer: null,
        mode: "snap",
        preview: null,
      },
      extend: { active: false, atomId: null, pointer: null, mode: "snap" },
      fitNonce: prev.fitNonce + 1,
    }));
  },

  pasteModel: (given: Drawn) => {
    // (from a workspace in another style: converted by its bond over this one's, about its middle - a record that says none, as it is)
    const converted = given.bondPt ? restyledDrawn(given, given.bondPt / bondPtOf(get().docStyle), style3dOf(get())) : given;
    // (and its words as large in print: those given no size at the labels' size it was copied in)
    const next = converted.labelPt && converted.captions?.length ? { ...converted, captions: wordsKept(converted.captions, converted.labelPt, labelPtOf(get().docStyle)) } : converted;
    const carried = next.molecules3d ?? [];
    const flow = next.flow ?? NO_PARTS;
    // (pictures pasted only where they are held: a copy carries them by what they are known by)
    const pictures = (next.pictures ?? []).filter((p) => pictureBytes(p.sha256));
    const words = next.captions ?? [];
    // (PDFs by their SHA-256, as Meno's cache holds them; texts' sheets whole)
    const pdfs = next.pdfs ?? [];
    const sheets = (next.sheets ?? []).filter((t) => t.at);
    // (slides last in the talk's order, as they were among themselves; shapes over those there are)
    const slides = next.slides ?? [];
    const shapes = next.shapes ?? [];
    // (writing by hand, each piece whole, over that there is)
    const inks = next.inks ?? [];
    // (arrows and "+" signs: a reaction's, or alone - one pointing at something)
    const arrows = next.arrows ?? [];
    const pluses = next.pluses ?? [];
    // (catalytic cycles, with what lies on them pasted with them)
    const cycles = next.cycles ?? [];
    if (!next.atoms.length && !carried.length && !flow.sets.length && !flow.steps.length && !pictures.length && !words.length && !pdfs.length && !sheets.length && !slides.length && !shapes.length && !inks.length && !arrows.length && !pluses.length && !cycles.length) return;
    const startCycle = doc.getState().nextCycleId ?? 1;
    const startArrow = doc.getState().nextArrowId;
    const startPlus = doc.getState().nextPlusId ?? 1;
    const startSlide = doc.getState().nextSlideId ?? 1;
    const startInk = doc.getState().nextInkId ?? 1;
    const startShape = doc.getState().nextShapeId ?? 1;
    const startPdf = doc.getState().nextPdfId ?? 1;
    let sheetIds: number[] = [];
    const start = doc.getState().nextId;
    const startCaption = doc.getState().nextCaptionId ?? 1;
    const start3d = doc.getState().nextMolecule3dId ?? 1;
    const startPicture = doc.getState().nextPictureId ?? 1;
    // (the pasted atoms numbered on from here, in their order: a molecule in
    // 3D pasted with its drawing is tied to the pasted drawing - and a
    // workflow's parts numbered on from its counter, wired as they were)
    const idOf = new Map(next.atoms.map((a, k) => [a.id, start + k]));
    // (and a cycle's gaps set by hand kept for what they were of, numbered anew)
    const wordsOf = new Map(words.map((w, k) => [w.id, startCaption + k]));
    const tied = {
      ...next,
      molecules3d: carried.map((m) => relinked(m, next, (id) => idOf.get(id))),
      ...(cycles.length ? { cycles: cycles.map((c) => endsRenamed(c, (id) => idOf.get(id), (id) => wordsOf.get(id))) } : {}),
    };
    let pastedFlow: { sets: number[]; steps: number[] } = { sets: [], steps: [] };
    const pasted = doc.edit("paste", (d) => {
      const model = next.atoms.length || carried.length ? ops.withImportedScheme(ops.appendModel(d, next), ops.schemeOf(tied)) : words.length || shapes.length || arrows.length || pluses.length || cycles.length ? ops.withImportedScheme(d, ops.schemeOf(tied)) : d;
      const withPictures = pictures.reduce((doc2, { id: _, ...p }) => ops.addPicture(doc2, p), model);
      const withPdfs = pdfs.reduce((doc2, { id: _, reading: _r, ...p }) => ops.addPdf(doc2, p), withPictures);
      const withSlides = inks.reduce((doc2, { id: _, ...k }) => ops.addInk(doc2, k), slides.reduce((doc2, { id: _, ...s }) => ops.addSlide(doc2, s), withPdfs));
      const { doc: drawn, ids: sheetsAdded } = ops.addSheets(withSlides, sheets.map(({ id: _, ...t }) => t));
      sheetIds = sheetsAdded;
      if (!flow.sets.length && !flow.steps.length) return drawn;
      const added = appendParts(drawn, flow);
      pastedFlow = added;
      return added.doc;
    });
    if (!pasted) return;
    // (a stack of drawings pasted showing the record it showed: utils/stacks)
    const recordsShown = { ...get().recordsShown, ...recordsShownAdded(next.atoms, doc.getState().model, (id) => idOf.get(id)) };
    const model = shownModel(get().fullModel, recordsShown);
    // the molecules in 3D pasted, numbered from there on in order: selected
    // with the rest, turned and showing the frame they were copied in
    const ids = carried.map((_, i) => start3d + i);
    const turns3d = { ...get().turns3d };
    const frames3d = { ...get().frames3d };
    carried.forEach((m, i) => {
      if (m.turn) turns3d[ids[i]] = m.turn;
      if (m.frame) frames3d[ids[i]] = m.frame;
    });
    set((prev: EditorState) => ({
      ...prev,
      recordsShown,
      model,
      sel: added(start, model),
      sel3d: new Set(ids),
      selPictures: new Set(pictures.map((_, i) => startPicture + i)),
      selPdfs: new Set(pdfs.map((_, i) => startPdf + i)),
      selSlides: new Set(slides.map((_, i) => startSlide + i)),
      selShapes: new Set(shapes.map((_, i) => startShape + i)),
      selInks: new Set(inks.map((_, i) => startInk + i)),
      selCycles: new Set(cycles.map((_, i) => startCycle + i)),
      // (the arrows and "+" signs pasted selected for themselves too: those among the atoms are carried with them, once)
      selArrows: new Set(arrows.map((_, i) => startArrow + i)),
      selPluses: new Set(pluses.map((_, i) => startPlus + i)),
      selTexts: new Set(sheetIds),
      // (the words pasted selected too: alone, they are all that is)
      selCaptions: new Set(words.map((_, i) => startCaption + i)),
      selFlow: { sets: new Set(pastedFlow.sets), steps: new Set(pastedFlow.steps) },
      chosen3d: null,
      turns3d,
      frames3d,
      selAnchor: null,
      hovered: { atomId: null, bondId: null },
    }));
  },

  putRead: (next: Model, scheme?: ImportedScheme) => {
    const start = doc.getState().nextId;
    const startCaption = doc.getState().nextCaptionId ?? 1;
    if (!doc.edit("read structure", (d) => ops.withImportedScheme(ops.appendModel(d, next), scheme))) return;
    // (selected, as what is pasted is, to be moved or put right straight on - a scheme's words with it, its compounds' numbers among them)
    const endCaption = doc.getState().nextCaptionId ?? 1;
    // (and shown: the view moved to take it in, where it is not seen whole - docs/WORKSPACE.md, *Putting things down*)
    const box = withWordsAdded(addedBox(start, get().model), get(), startCaption);
    set((prev: EditorState) => ({
      ...prev,
      ...(box ? { showRequest: { box, n: (prev.showRequest?.n ?? 0) + 1 } } : {}),
      sel: added(start, prev.model),
      selCaptions: new Set(Array.from({ length: endCaption - startCaption }, (_, i) => startCaption + i)),
      sel3d: new Set(),
      selPictures: new Set(),
      selAnchor: null,
      hovered: { atomId: null, bondId: null },
    }));
  },

  setFigureLit: (atom: number | null) => set((prev: EditorState) => (prev.figureLit === atom ? prev : { ...prev, figureLit: atom })),

  appendModel: (next: Model, scheme?: ImportedScheme) => {
    const start = doc.getState().nextId;
    const startCaption = doc.getState().nextCaptionId ?? 1;
    // (onto an empty page, it is opened - fitted, as a canvas opens; onto one with something on it, shown where it went)
    const before = get();
    const empty = !before.model.atoms.length && !before.pdfs.length && !before.pictures.length && !before.captions.length && !before.molecules3d.length && !before.texts.some((t) => t.at);
    const start3d = doc.getState().nextMolecule3dId ?? 1;
    const edited = doc.edit("add structure", (d) =>
      ops.withImportedScheme(ops.appendModel(d, next), scheme),
    );
    // (a stack of drawings it brings showing its first record: utils/stacks)
    const ids = new Map(next.atoms.map((a, k) => [a.id, start + k]));
    const recordsShown = edited ? { ...get().recordsShown, ...recordsShownAdded(next.atoms, doc.getState().model, (id) => ids.get(id)) } : get().recordsShown;
    const model = shownModel(get().fullModel, recordsShown);
    set((prev: EditorState) => ({
      ...prev,
      recordsShown,
      model,
      // (each molecule in 3D added showing the frame its file says)
      ...(edited ? { frames3d: shownFrames(scheme, start3d, prev.frames3d), lists3d: shownLists(scheme, start3d, prev.lists3d) } : {}),
      // (selected, as a paste is)
      // (as it is shown: of a stack of drawings it brings, the record shown - utils/stacks)
      ...(edited && next.atoms.length ? { sel: added(start, model), selAnchor: null } : {}),
      hovered: { atomId: null, bondId: null },
      ...(() => {
        const box = edited ? withWordsAdded(addedBox(start, model), get(), startCaption) : null;
        return empty || !box ? { fitNonce: prev.fitNonce + 1 } : { showRequest: { box, n: (prev.showRequest?.n ?? 0) + 1 } };
      })(),
    }));
  },

  addArrow: (
    x: number,
    y: number,
    angle: number = 0,
    length: number = NOMINAL_BOND_LENGTH * ARROW_LENGTH_BONDS,
  ) => {
    const id = doc.getState().nextArrowId;
    doc.edit("add arrow", (d) => ops.addArrow(d, x, y, angle, length));
    return id;
  },

  setHoveredPush: (id: number | null) => set({ hoveredPush: id }),

  setPushDraw: (draw: EditorState["pushDraw"]) => set({ pushDraw: draw }),

  addPush: (from: PushEnd, to: PushEnd, half: boolean) => {
    const id = doc.getState().nextPushId ?? 1;
    doc.edit("add electron arrow", (d) => ops.addPush(d, from, to, half));
    return id;
  },

  updatePush: (id: number, patch: Parameters<EditorState["updatePush"]>[1], gesture?: string) => {
    doc.edit("change electron arrow", (d) => ops.updatePush(d, id, patch), gesture ? gestureStep(`push:${id}:${gesture}`) : undefined);
  },

  removePush: (id: number) => {
    if (doc.edit("delete electron arrow", (d) => ops.removePush(d, id)))
      set((prev: EditorState) => (prev.hoveredPush === id ? { ...prev, hoveredPush: null } : prev));
  },

  addArrowBetween: (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const id = doc.getState().nextArrowId;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    doc.edit("add arrow", (d) => ops.addArrow(d, (from.x + to.x) / 2, (from.y + to.y) / 2, angle, length));
    return id;
  },

  setArrowForm: (ids: readonly number[], patch: ArrowFormPatch, gesture?: string) => {
    doc.edit("arrow", (d) => ops.setArrowForm(d, ids, patch), gesture ? { coalesceKey: `arrow-form:${gesture}` } : undefined);
  },

  updateArrow: (id: number, patch: Partial<Arrow>, gesture?: string) => {
    doc.edit("move arrow", (d) => ops.updateArrow(d, id, patch), gesture ? gestureStep(`arrow:${id}:${gesture}`) : { coalesceKey: `arrow:${id}:` });
  },

  addPlus: (x: number, y: number) => {
    const id = doc.getState().nextPlusId ?? 1;
    doc.edit("add plus", (d) => ops.addPlus(d, x, y));
    return id;
  },

  removeArrow: (id: number) => {
    doc.edit("delete arrow", (d) => ops.removeArrow(d, id));
  },

  movePlus: (id: number, x: number, y: number, gesture?: string) => {
    doc.edit("move plus", (d) => ops.movePlus(d, id, x, y), gesture ? gestureStep(`plus:${id}:${gesture}`) : { coalesceKey: `plus:${id}:` });
  },

  removePlus: (id: number) => {
    doc.edit("delete plus", (d) => ops.removePlus(d, id));
  },

  deleteDrawn: (part: Drawn, molecules3d: number[] = []) => {
    // (a workflow's parts cut with it - but not a step running, which is asked about on its own)
    const steps = get().steps.filter((s) => part.flow?.steps.some((x) => x.id === s.id) && !s.running);
    // (a set that holds its molecules itself, on no page, which a copy does not carry: left, said by the cut)
    const left = (part.flow?.sets ?? []).filter((b) => get().sets.find((x) => x.id === b.id)?.collection?.length).map((b) => b.id);
    const edited = doc.edit("cut", (d) =>
      removeParts(
        ops.removeInks(
        ops.removeShapes(
        ops.removeSlides(
        ops.removePictures(
          ops.removeMolecules3d(
            ops.deleteDrawn(
              d,
              new Set(part.atoms.map((a) => a.id)),
              new Set(part.bonds.map((b) => b.id)),
              new Set((part.arrows ?? []).map((a) => a.id)),
              new Set((part.pluses ?? []).map((p) => p.id)),
              new Set((part.captions ?? []).map((c) => c.id)),
            ),
            molecules3d,
          ),
          (part.pictures ?? []).map((p) => p.id),
        ),
        (part.slides ?? []).map((x) => x.id),
        ),
        (part.shapes ?? []).map((x) => x.id),
        ),
        (part.inks ?? []).map((x) => x.id),
        ),
        (part.flow?.sets ?? []).map((b) => b.id).filter((id) => !left.includes(id)),
        steps.map((s) => s.id),
      ),
    );
    if (!edited) return left.length;
    forgetDeleted(set);
    for (const s of steps) get().forgetStepJobs(s);
    return left.length;
  },

  expandAbbreviation: (id: number) => {
    // (one after another, they are one run of drawing out)
    const run = doc.history().undoLabel === "expand abbreviation" ? (doc.getState().expanded ?? []) : [];
    // (drawn out at true size, and shown as large as its structure: utils/trueSize)
    doc.edit("expand abbreviation", (d) => {
      const out = editAtTrueSize(d, (t) => ops.expandAbbreviation(t, id), id);
      return out === d ? d : { ...out, expanded: [...run, ...(out.expanded ?? [])] };
    });
  },

  contractToAbbreviation: (ids: ReadonlySet<number>, label: string) => {
    if (doc.edit("show as abbreviation", (d) => editAtTrueSize(d, (t) => ops.contractToAbbreviation(t, ids, label), [...ids][0]))) forgetDeleted(set);
  },

  setArrowLook: (id: number, look: ArrowLook, coalesceKey?: string) => {
    doc.edit("arrow style", (d) => ops.setArrowLook(d, id, look), { coalesceKey });
  },
});

/**
 * The frames shown, with each molecule in 3D a file brings showing the one
 * its file says - an optimisation's last - those molecules numbered from
 * `first`, in order.
 */
function shownFrames(scheme: ImportedScheme | undefined, first: number, shown: EditorState["frames3d"]): EditorState["frames3d"] {
  const out = { ...shown };
  (scheme?.molecules3d ?? []).forEach((m, i) => {
    if (m.frame) out[first + i] = m.frame;
  });
  return out;
}

/**
 * Each molecule in 3D added from a file, with a list its reader asked to be
 * shown as it comes (lib/calc/results `shown`) - a cube file's grids -
 * opened under it, that row chosen; numbered as `shownFrames` numbers them.
 */
function shownLists(scheme: ImportedScheme | undefined, first: number, open: EditorState["lists3d"]): EditorState["lists3d"] {
  const out = { ...open };
  (scheme?.molecules3d ?? []).forEach((m, i) => {
    const list = m.calc?.results?.find((r) => r.on === "list" && r.shown != null);
    if (list?.on === "list" && list.shown != null) out[first + i] = { list: resultKey(list), row: list.shown, pointed: null };
  });
  return out;
}
