import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { DocumentStore } from "../../../../lib/doc";
import { createWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Caption, EditorState, Model, PushArrow, PdfItem, PictureItem, RingFills, Sel, SelFlow, Shape, Slide, Wire, WireEnd, WorkflowSet, WorkflowStep, WorkspaceText } from "./types";
import { createModelSlice } from "./slices/modelSlice";
import { createSelectionSlice } from "./slices/selectionSlice";
import { createHoverSlice } from "./slices/hoverSlice";
import { createInteractionSlice, ended as noStroke, noMoveDrag } from "./slices/interactionSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createMolecules3dSlice, heldOf } from "./slices/molecules3dSlice";
import { createTextsSlice } from "./slices/textsSlice";
import { createCaptionsSlice } from "./slices/captionsSlice";
import { createPdfsSlice } from "./slices/pdfsSlice";
import { createPicturesSlice } from "./slices/picturesSlice";
import { createWorkflowSlice } from "./slices/workflowSlice";
import { createSlidesSlice } from "./slices/slidesSlice";
import { createShapesSlice } from "./slices/shapesSlice";
import { createRecordsSlice } from "./slices/recordsSlice";
import { shownModel } from "../utils/stacks";
import { turnsAcross } from "./turnJournal";
import { COLUMN_WIDTH, shownPdf, shownText } from "../utils/texts";

// Re-export types for backward compatibility
export * from "./types";

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

/**
 * The part of the store that mirrors the document. Components keep reading
 * `model`, `arrows` and the aromatic flags from the store, while the document
 * is what actually holds them - which is how undo and redo reach the canvas.
 */
function mirrorOf(doc: WorkspaceDocument, recordsShown: Readonly<Record<number, number>>) {
  return {
    // (of each stack of drawings, the record it shows: the canvas works on
    // that, the whole kept beside it for what keeps the document - utils/stacks)
    model: shownModel(doc.model, recordsShown),
    fullModel: doc.model,
    arrows: doc.arrows,
    pluses: doc.pluses ?? [],
    pushes: doc.pushes ?? NO_PUSHES,
    aromaticEnabled: doc.aromaticEnabled,
    aromaticRings: doc.aromaticRings,
    ringFills: doc.ringFills ?? NO_FILLS,
    nextId: doc.nextId,
    nextArrowId: doc.nextArrowId,
    nextPlusId: doc.nextPlusId ?? 1,
    captions: doc.captions ?? NO_CAPTIONS,
    nextCaptionId: doc.nextCaptionId ?? 1,
    molecules3d: doc.molecules3d ?? [],
    sets: doc.sets ?? NO_SETS,
    steps: doc.steps ?? NO_STEPS,
    wires: doc.wires ?? NO_WIRES,
    docStyle: doc.style,
    texts: doc.texts ?? NO_TEXTS,
    pdfs: doc.pdfs ?? NO_PDFS,
    pictures: doc.pictures ?? NO_PICTURES,
    slides: doc.slides ?? NO_SLIDES,
    shapes: doc.shapes ?? NO_SHAPES,
  };
}

/**
 * The atoms and bonds selected, kept to those the drawing still has: an undo
 * that takes back what was pasted, say, takes it out of the selection too -
 * else nothing would be seen selected and the keys and the menu would still
 * act on a selection.
 */
function drawingHeld(sel: Sel, model: Pick<Model, "atoms" | "bonds">): Sel {
  if (!sel.atoms.size && !sel.bonds.size) return sel;
  const atoms = new Set(model.atoms.map((a) => a.id));
  const bonds = new Set(model.bonds.map((b) => b.id));
  if ([...sel.atoms].every((id) => atoms.has(id)) && [...sel.bonds].every((id) => bonds.has(id))) return sel;
  return { atoms: new Set([...sel.atoms].filter((id) => atoms.has(id))), bonds: new Set([...sel.bonds].filter((id) => bonds.has(id))) };
}

/** The sets and steps selected, kept to those the document still has. */
function flowHeld(sel: SelFlow, sets: readonly WorkflowSet[], steps: readonly WorkflowStep[]): SelFlow {
  if (!sel.sets.size && !sel.steps.size) return sel;
  const setIds = new Set(sets.map((b) => b.id));
  const stepIds = new Set(steps.map((s) => s.id));
  if ([...sel.sets].every((id) => setIds.has(id)) && [...sel.steps].every((id) => stepIds.has(id))) return sel;
  return { sets: new Set([...sel.sets].filter((id) => setIds.has(id))), steps: new Set([...sel.steps].filter((id) => stepIds.has(id))) };
}

const NO_TEXTS: WorkspaceText[] = [];
const NO_PDFS: PdfItem[] = [];
const NO_PICTURES: PictureItem[] = [];
const NO_SLIDES: Slide[] = [];
const NO_SHAPES: Shape[] = [];

/** The pictures selected, kept to those the document still has. */
function picturesHeld(sel: Set<number>, pictures: readonly { id: number }[]): Set<number> {
  if (!sel.size) return sel;
  const ids = new Set(pictures.map((p) => p.id));
  return [...sel].every((id) => ids.has(id)) ? sel : new Set([...sel].filter((id) => ids.has(id)));
}
const NO_CAPTIONS: Caption[] = [];
const NO_PUSHES: PushArrow[] = [];
const NO_FILLS: RingFills = {};
const NO_SETS: WorkflowSet[] = [];
const NO_STEPS: WorkflowStep[] = [];
const NO_WIRES: Wire[] = [];
const NO_RECORDS: Record<number, number> = {};

/**
 * Mirrors the document into the store and keeps doing so. Returns the
 * unsubscribe, so a canvas that goes away stops listening - and one that comes
 * back (React StrictMode remounts it in dev) subscribes again and catches up
 * on whatever changed meanwhile.
 */
/**
 * What is under the pointer, kept while it is still on the page. An undo or
 * a redo can take away what the pointer rests on, and as the pointer has not
 * moved nothing else says so: its light would stay where it was, and a key
 * - a letter, Delete - act on what is gone.
 */
/** Whether what a wire comes out of - a set, a step - is still in the workflow. */
function wireEndThere(end: WireEnd, sets: readonly { id: number }[], steps: readonly { id: number }[]): boolean {
  return "set" in end ? sets.some((b) => b.id === end.set) : steps.some((x) => x.id === end.step);
}

function hoversHeld(prev: EditorState, now: ReturnType<typeof mirrorOf>) {
  const kept = (id: number | null, there: readonly { id: number }[]) => (id != null && !there.some((x) => x.id === id) ? null : id);
  const { atoms, bonds } = now.model;
  const atom = prev.hovered.atomId != null && !atoms.some((a) => a.id === prev.hovered.atomId);
  const bond = prev.hovered.bondId != null && !bonds.some((b) => b.id === prev.hovered.bondId);
  const molecule = (id: number) => now.molecules3d.find((m) => m.id === id);
  const { hovered3d: m3d, hoveredAtom3d: a3d, hoveredMeasure3d: q3d, hoveredMark: mark } = prev;
  return {
    hovered: atom || bond ? { atomId: atom ? null : prev.hovered.atomId, bondId: bond ? null : prev.hovered.bondId } : prev.hovered,
    hoveredPush: kept(prev.hoveredPush, now.pushes),
    hoveredArrow: kept(prev.hoveredArrow, now.arrows),
    hoveredPlus: kept(prev.hoveredPlus, now.pluses),
    hoveredCaption: kept(prev.hoveredCaption, now.captions),
    hoveredPdf: kept(prev.hoveredPdf, now.pdfs),
    hoveredPicture: kept(prev.hoveredPicture, now.pictures),
    hoveredSet: kept(prev.hoveredSet, now.sets),
    hoveredStep: kept(prev.hoveredStep, now.steps),
    hoveredWire: kept(prev.hoveredWire, now.wires),
    hovered3d: m3d && !molecule(m3d.id) ? null : m3d,
    hoveredAtom3d: a3d && !((molecule(a3d.id)?.atoms.length ?? 0) > a3d.atom) ? null : a3d,
    hoveredMeasure3d: q3d && !molecule(q3d.id)?.measures?.some((x) => x.id === q3d.measure) ? null : q3d,
    hoveredMark: mark && ("bond" in mark ? !bonds.some((b) => b.id === mark.bond) : !atoms.some((a) => a.id === mark.atom)) ? null : mark,
  };
}

export function connectStoreToDocument(
  store: EditorStore,
  doc: DocumentStore<WorkspaceDocument>,
): () => void {
  let was = doc.getState();
  const sync = () =>
    store.setState((prev) => {
      const now = doc.getState();
      const mirrored = mirrorOf(now, prev.recordsShown);
      // (a turn of several as one body undone or redone: their turns too)
      const turns = turnsAcross(doc, was, now);
      was = now;
      const held = {
        ...heldOf(prev, mirrored.molecules3d),
        sel: drawingHeld(prev.sel, mirrored.model),
        selAnchor: prev.selAnchor != null && !mirrored.model.atoms.some((a) => a.id === prev.selAnchor) ? null : prev.selAnchor,
        ...hoversHeld(prev, mirrored),
        // (a bond or a chain being drawn out of an atom, or an atom being dragged, that an undo
        // took away: let go - drawn on, it was a bond from nowhere, its new atom a lone CH4)
        extend: prev.extend.active && prev.extend.atomId != null && !mirrored.model.atoms.some((a) => a.id === prev.extend.atomId) ? noStroke : prev.extend,
        moveDrag: prev.moveDrag.active && !mirrored.model.atoms.some((a) => a.id === prev.moveDrag.atomId) ? noMoveDrag : prev.moveDrag,
        selFlow: flowHeld(prev.selFlow, mirrored.sets, mirrored.steps),
        // (Quick Add opened by a wire from a set or a step an undo took away: shut, its calculations being for nothing)
        quickAdd: prev.quickAdd?.wire && !wireEndThere(prev.quickAdd.wire, mirrored.sets, mirrored.steps) ? null : prev.quickAdd,
        selPictures: picturesHeld(prev.selPictures, mirrored.pictures),
        selPdfs: picturesHeld(prev.selPdfs, mirrored.pdfs),
        selCaptions: picturesHeld(prev.selCaptions, mirrored.captions ?? []),
        selSlides: picturesHeld(prev.selSlides, mirrored.slides),
        selShapes: picturesHeld(prev.selShapes, mirrored.shapes),
        hoveredShape: prev.hoveredShape != null && !mirrored.shapes.some((s) => s.id === prev.hoveredShape) ? null : prev.hoveredShape,
        hoveredSlide: prev.hoveredSlide != null && !mirrored.slides.some((s) => s.id === prev.hoveredSlide) ? null : prev.hoveredSlide,
        // (a talk given from slides an undo took away: ended; from fewer, at the last there is)
        presenting: !prev.presenting || !mirrored.slides.length ? null : prev.presenting.at < mirrored.slides.length ? prev.presenting : { at: mirrored.slides.length - 1 },
        // (sheets selected kept to those still on the page - and the one under the pointer, if it still is)
        selTexts: picturesHeld(prev.selTexts, (mirrored.texts ?? []).filter((t) => t.at)),
        hoveredText: prev.hoveredText != null && !(mirrored.texts ?? []).some((t) => t.id === prev.hoveredText && t.at) ? null : prev.hoveredText,
      };
      if (turns) {
        const turns3d = { ...(held.turns3d ?? prev.turns3d) };
        for (const [id, t] of Object.entries(turns)) {
          if (t) turns3d[Number(id)] = t;
          else delete turns3d[Number(id)];
        }
        held.turns3d = turns3d;
      }
      // (the text or the PDF its column shows, as they come and go: utils/texts)
      const texts = shownText(prev.texts, mirrored.texts, prev.textShown);
      const pdf = shownPdf(prev.pdfs, mirrored.pdfs, prev.pdfShown, texts);
      const textsOpen = (texts.shown != null || pdf.shown != null) && (texts.open ?? pdf.open ?? prev.textsOpen);
      return { ...prev, ...mirrored, ...held, textShown: texts.shown, pdfShown: pdf.shown, textsOpen };
    });
  sync();
  return doc.subscribe(sync);
}

export function createEditorStore(
  doc: DocumentStore<WorkspaceDocument>,
): EditorStore {
  const store = create<EditorState>((set, get) => ({
    // Document state, mirrored. Never written directly: the slices edit the
    // document and the subscription below brings the change back here.
    ...mirrorOf(doc.getState(), NO_RECORDS),
    // (a canvas opened for a text shows it)
    textShown: doc.getState().texts?.slice(-1)[0]?.id ?? null,
    textsOpen: !!doc.getState().texts?.length,
    cover: 0,
    columnWidth: COLUMN_WIDTH,
    pdfColumnWidth: null,
    pdfShown: null,
    litPdf: null,
    pdfFlight: null,
    pdfSel: null,
    pdfFind: null,
    menuAsk: null,
    pdfFlash: null,
    pdfWords: null,
    pdfBox: null,
    hoveredText: null,
    selTexts: new Set<number>(),
    selPdfs: new Set<number>(),
    textFlight: null,
    textToWrite: null,
    pdfPicture: null,

    // Ephemeral view state: hover, gestures, camera requests, edit buffers.
    sel: { atoms: new Set<number>(), bonds: new Set<number>() },
    selAnchor: null,
    boxSelect: { active: false, kind: "box", points: [] },
    hovered: { atomId: null, bondId: null },
    hovered3d: null,
    hoveredAtom3d: null,
    figureLit: null,
    turns3d: {},
    rising3d: {},
    overlay3d: {},
    lists3d: {},
    frames3d: {},
    stacksShown: {},
    recordsShown: NO_RECORDS,
    recordSwaps: {},
    sel3d: new Set<number>(),
    selFlow: { sets: new Set<number>(), steps: new Set<number>() },
    chosen3d: null,
    hoveredMeasure3d: null,
    measureEdit3d: null,
    hoveredArrow: null,
    hoveredPush: null,
    pushDraw: null,
    hoveredPlus: null,
    hoveredCaption: null,
    hoveredPdf: null,
    hoveredPicture: null,
    picturesLaid: new Set<number>(),
    selPictures: new Set<number>(),
    selCaptions: new Set<number>(),
    selSlides: new Set<number>(),
    hoveredSlide: null,
    selShapes: new Set<number>(),
    hoveredShape: null,
    shapeDraft: null,
    arrowDraft: null,
    presenting: null,
    guides: null,
    setGuides: (guides: EditorState["guides"]) => set({ guides }),
    hoveredMark: null,
    captionEdit: null,
    captionLeft: null,
    wordsWriting: null,
    quickAdd: null,
    hoveredSet: null,
    chosenSet: null,
    hoveredStep: null,
    hoveredWire: null,
    openStep: null,
    wireDrag: null,
    workflowMenu: null,
    askDeleteStep: null,
    askUndo: null,
    hoverPulse: { id: null, nonce: 0, until: 0 },
    pressHold: null,
    doubleClickBond: null,
    fitNonce: 0,
    autoFitSuspended: false,
    labelEdit: { active: false, atomId: null, value: "" },
    labelLeft: null,
    moveDrag: {
      active: false,
      atomId: null,
      pointer: null,
      mode: "snap",
      preview: null,
    },
    extend: { active: false, atomId: null, pointer: null, mode: "snap" },
    panHold: { active: false, pointerId: null },
    suppressDblClickUntil: 0,
    savedPath: null,
    openedName: null,

    ...createModelSlice(doc, set, get),
    ...createSelectionSlice(set),
    ...createHoverSlice(set),
    ...createUiSlice(doc, set, get),
    ...createInteractionSlice(set, get),
    ...createMolecules3dSlice(doc, set, get),
    ...createTextsSlice(doc, set, get),
    ...createCaptionsSlice(doc, set),
    ...createPdfsSlice(doc, set, get),
    ...createPicturesSlice(doc, set),
    ...createWorkflowSlice(doc, set, get),
    ...createSlidesSlice(doc, set, get),
    ...createShapesSlice(doc, set),
    ...createRecordsSlice(doc, set, get),
  }));

  return store;
}

/**
 * Each document's store, kept with the document: a canvas made again after
 * something failed - itself, its tab or the window (docs/ARCHITECTURE.md,
 * *When a part fails*) - takes up where it was, with the molecules in 3D
 * turned as they were, the column as it was and Save writing where it wrote.
 */
const storesOf = new WeakMap<DocumentStore<WorkspaceDocument>, EditorStore>();

/** The store a document is drawn from: made the first time it is asked for, the same one from then on. */
export function storeOf(doc: DocumentStore<WorkspaceDocument>): EditorStore {
  let store = storesOf.get(doc);
  if (!store) {
    store = createEditorStore(doc);
    storesOf.set(doc, store);
  }
  return store;
}

/** The stores that have taken what their canvas was opened with (hooks/useStructureEvents). */
const openedStores = new WeakSet<EditorStore>();

/**
 * Whether what a canvas was opened with - a file, a workspace - is still to
 * be taken into its store: true the first time it is asked, and never
 * again, however often the canvas is made; taken twice, the file would
 * stand in for everything done since.
 */
export function takeOpening(store: EditorStore): boolean {
  if (openedStores.has(store)) return false;
  openedStores.add(store);
  return true;
}

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorProvider({
  tabId,
  document,
  children,
}: {
  tabId: string;
  /**
   * The tab's document. Canvases outside the tab shell - the workflow
   * editor's sketch node - get one of their own, so they keep working.
   */
  document?: DocumentStore<WorkspaceDocument>;
  children: ReactNode;
}) {
  const doc = useMemo(
    () => document ?? createWorkspaceDocument(),
    // A different tab identity means a different canvas, so a canvas without a
    // document of its own gets a fresh one rather than keeping the old tab's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, tabId],
  );
  // One store per document (`storeOf`), not per tabId: an id is not bound to
  // be unique (a canvas embedded in another view may share one with
  // another), and a provider made again for the same document - its canvas
  // reloaded after it failed - finds the store as it was.
  const store = useMemo(() => storeOf(doc), [doc]);
  useEffect(() => connectStoreToDocument(store, doc), [store, doc]);
  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store)
    throw new Error("useEditorStore must be used within EditorProvider");
  return store;
}

export function useEditor<T = EditorState>(
  selector?: (s: EditorState) => T,
): T {
  const store = useEditorStore();
  // NOTE: this is a bound store hook; call it directly
  // When no selector is provided, return the entire state
  return (store as unknown as (sel?: (s: EditorState) => T) => T)(
    selector ?? ((s: EditorState) => s as unknown as T),
  );
}
