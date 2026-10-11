import { Canvas } from "@react-three/fiber";
import { useEditor, useEditorStore, EditorProvider } from "./store";
import { selectedOf } from "./store/slices/selectionSlice";
import { useStructureEvents } from "./hooks/useStructureEvents";
import { useCanvasSetup } from "./hooks/useCanvasSetup";
import {
  Atoms2D,
  Bonds2D,
  PanZoom2D,
  FitToContent2D,
  JoinCaps2D,
  BondsPick2D,
  AtomsHoverRings2D,
  ExtendPreview2D,
  HoldProgress2D,
  ChainGuide2D,
  MovePreview2D,
  Arrows2D,
  Pluses2D,
  AromaticCircles2D,
  Wedges2D,
  Labels2D,
  LabelTyping2D,
  HoverOverlay2D,
  ChemMarks2D,
  SnapArc2D,
  Selection2D,
} from "./components";
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CANVAS_RESIZE, DURATION, EASE_SLIDE, FADE, RISE } from "../../theme/motion";
import DocumentStylePanel from "./DocumentStylePanel";
import ArrowStylePanel from "./ArrowStylePanel";
import SaveAbbreviationPanel from "./SaveAbbreviationPanel";
import { abbreviationFromSelection } from "./chem/abbreviationFromSelection";
import { chainFrom } from "./components/chainFrom";
import { structureFromSmiles } from "./chem/fromSmiles";
import ExportCard, { type Offered3D } from "./ExportCard";
import { findOutput, outputOf } from "../../../lib/calc/asks";
import type { CalcSource } from "../../../lib/calc/output";
import { setTextTaker } from "../../views/texts";
import { setPdfTaker } from "../../views/pdfs";
import { setPictureTaker } from "../../views/pictures";
import TextColumn from "./TextColumn";
import ConfirmDiscard from "../../layouts/ConfirmDiscard";
import NameDialog from "../../layouts/NameDialog";
import { ErrorBoundary, StoppedCard } from "../../layouts/ErrorBoundary";
import { flowOf, procedureParts, type FlowParts } from "./workflow/parts";
import { procedureNeeds, proceduresSaved, saveProcedure, suggestedName } from "./workflow/procedures";
import { knownOf, pluginWriters, WRITERS, type Writer } from "../../../lib/io/writers";
import { anyPluginById, WRITER_PLUGINS } from "../../../lib/calc/catalog";
import { addPlugin, useReaders } from "../../../lib/calc/workers";
import { offeredNames, writtenOf } from "./utils/written";
import { carriedOf } from "./utils/workspace";
import PartMenu, { type CanvasCommand, type MenuMolecule3D, type MenuTarget } from "./PartMenu";
import { currentStyle3D, useStyle3D, useStyleNames3D } from "./style3d";
import { askToOpen } from "../../layouts/commands";
import { bondsAt, chosenPath, frameOf, lookOf, poseOf, seenBounds, solidOf } from "./utils/molecule3d";
import { movingAtoms, movingFor } from "./utils/edit3d";
import { abbreviationOf } from "../../../lib/chem/abbreviations";
import { isElementSymbol } from "../../../lib/roles/molblock";

/** No atoms or bonds: the same array each time, so that nothing redraws for it. */
const NO_IDS: number[] = [];

/** Whether an atom is an abbreviation that can be drawn out: a file's, one typed as a group named as an element is (Ac), or one the dictionary knows. */
function expandable(a: { el: string; abbrev?: unknown } | undefined): boolean {
  return !!a && (!!a.abbrev || (!isElementSymbol(a.el) && !!abbreviationOf(a.el)));
}
import { useClipboardActions } from "./clipboardActions";
import {
  chargeStep,
  clipboardIntent,
  isCleanUpKey,
  isDeleteKey,
  isFitKey,
  isDeselectKey,
  isFindKey,
  isSelectAllKey,
  saveIntent,
  shortcutLabel,
} from "../../../lib/doc/shortcuts";
import { chemWorker, rolePlugin, useChem } from "../../../lib/roles/worker";
import { roleOptionsRole } from "../../../lib/plugins/roles";
import { valuesOf } from "../../../lib/options";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { cleanUp } from "./chem/cleanUp";
import { useChemMarks } from "./chem/useChemMarks";
import { exportKindOf, exportKinds, holdsOfDrawn, useFileActions, type Holds } from "./fileActions";
import { setSaver } from "../../../lib/doc/savers";
import { useReadings } from "../../../lib/calc/readings";
import { CANVAS_DPR } from "./constants";
import { startingZoom } from "./layoutOptions";
import { useDrawingStyle } from "./useDrawingStyle";
import { DrawnLayoutProvider } from "./components/DrawnLayout";
import { useOfficeLink } from "./hooks/useOfficeLink";
import { useDropZone } from "../../../lib/drop";
import type { DocumentStore } from "../../../lib/doc";
import type { WorkspaceDocument } from "./document";
import { EYE_HEIGHT, eyeOf } from "./utils/page";
import Molecules3D from "./components/Molecules3D";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import QuickAdd from "./QuickAdd";
import Captions2D from "./components/Captions2D";
import Pdfs2D from "./components/Pdfs2D";
import Pictures2D from "./components/Pictures2D";
import TextSheets2D from "./components/TextSheets2D";
import PdfColumn from "./components/PdfColumn";
import { goBack, isBackKey, readerOf } from "./components/pdfColumnReader";
import { selectedWords, selects } from "./utils/pdfSelection";
import { runFind } from "./components/pdfFind";
import { setCanvasPlace } from "./components/wordsDrag";
import { copyBox, putBox } from "./components/boxDrag";
import { marksBetween, textOf } from "../../../lib/pdf/text";
import { writeClipboard } from "../../../lib/clipboard";
import { PdfPictures } from "./components/pdfPictures";
import { FollowCover, PageHtmlLayer } from "./components/coverLayer";
import CaptionTyping2D from "./components/CaptionTyping2D";
import { ChargeHolds2D } from "./components/MarkHold2D";
import Workflow2D from "./components/Workflow2D";
import PageScale from "./components/PageScale";
import GuideStructure from "./components/GuideStructure";
import { guideNotice } from "../../../lib/plugins/guides";
import { selectionFrame } from "./workflow/selectionSet";
import { offeredSteps } from "./workflow/offered";
import { PORT_DOWN } from "./workflow/look";
import OpenStereo2D from "./components/OpenStereo2D";
import LinkedHover2D from "./components/LinkedHover2D";
import Ask3D from "./Ask3D";
import { blocksOf, boxOf, conformersOf, formulaOf, formulaPlace, likeOf, linkOf, moleculeOf, openIn, placeRow, rowFrom, takenOnPage, turnedOver, type Block, type Box, type Open } from "./chem/make3d";
import { centredAt } from "./utils/copyPaste";
import { Remake3D } from "./components/remake3d";
import { turnOnto } from "./utils/align3d";
import type { Drawn, Molecule3D, PictureFrom, WordsFrom } from "./store/types";
import { resultKey, resultsOn } from "../../../lib/calc/results";
import { titled } from "../../../lib/calc/sources";
import { missingFor } from "./workflow/doers";
import { openSettingsAt } from "../SettingsPanel/section";

function WorkspaceContent({
  active,
  tabId,
  initialPayload,
  initialFilename,
  initialKind,
  initialPath,
  officeId,
  ownTab,
  nameTab,
  styleOpen,
  toggleStyle,
  openArrowStyle,
  openSaveAbbreviation,
  fadeIn,
}: {
  active: boolean;
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
  /** What the payload is, where whoever opened it said (lib/io/kinds). */
  initialKind?: string;
  /** Where the file opened in it is, where Open said. */
  initialPath?: string;
  /** The object in a document this canvas was opened from (lib/ole). */
  officeId?: number;
  /** Whether the canvas is a tab's own, which offers the app's menu its commands. */
  ownTab: boolean;
  /**
   * Names the canvas's tab after the file it is saved as. (One opened from
   * a document keeps that document's name.)
   */
  nameTab?: (label: string) => void;
  /** Whether the drawing-style panel is open beside the canvas. */
  styleOpen: boolean;
  toggleStyle: () => void;
  /** A reaction arrow's own style, in the panel beside the canvas. */
  openArrowStyle: (id: number) => void;
  /** The selected group saved as an abbreviation, in the panel beside the canvas. */
  openSaveAbbreviation: (ids: number[], smiles: string) => void;
  /** Whether it fades into view: made again after it failed (CanvasBoundary). */
  fadeIn?: boolean;
}) {
  const fitNonce = useEditor((s) => s.fitNonce);
  const requestFit = useEditor((s) => s.requestFit);
  // (a canvas opened from a document keeps that document's name)
  const named = officeId == null ? nameTab : undefined;

  // the column over the canvas's right side, and the layer the page's HTML goes in, cut off where it begins
  const cover = useEditor((s) => s.cover);
  const [htmlLayer, setHtmlLayer] = useState<HTMLDivElement | null>(null);
  const guideStructure = useRef<HTMLDivElement>(null);
  // (where PDFs opened go: the middle of what is in view, as a paste - set once the events are known)
  const pdfTarget = useRef<() => { x: number; y: number }>(() => ({ x: 0, y: 0 }));
  const {
    camRef,
    domRef,
    handleDoubleClick,
    handleWrapperMouseMove,
    handleWrapperMouseLeave,
    handleWrapperClick,
    dropZone,
    importError,
    dismissImportError,
    handleMouseDownCapture,
    clientToWorld,
    pasteTarget,
  } = useStructureEvents(initialPayload, initialFilename, officeId == null, initialKind, initialPath);
  pdfTarget.current = pasteTarget;
  useOfficeLink(officeId);

  const onCreated = useCanvasSetup(camRef, domRef);

  // Save and export. Ctrl/Cmd+S belongs to the tab in front, like undo.
  const files = useFileActions(named);
  const { save, saveAs } = files;
  // (a tab's own canvas can be saved as its tab is closed)
  useEffect(() => (ownTab ? setSaver(tabId, save) : undefined), [ownTab, tabId, save]);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const intent = saveIntent(e);
      if (!intent) return;
      e.preventDefault();
      void (intent === "save" ? save() : saveAs());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, save, saveAs]);
  // the plugins that fill the chemistry roles: their marks on the structure
  // and R/S on request; and clean-up, by Meno's own layout engine (chem/cleanUp)
  const store = useEditorStore();
  // (a structure selected: a guide's step waiting for it goes on)
  useEffect(() => store.subscribe((s, prev) => void (s.sel.atoms.size && !prev.sel.atoms.size && guideNotice("selected"))), [store]);
  // (a tab's own, unless it is a document's, holds texts opened while it is in front: ui/views/texts)
  useEffect(
    () => (ownTab && officeId == null ? setTextTaker(tabId, (texts) => store.getState().addTexts(texts, pdfTarget.current())) : undefined),
    [ownTab, officeId, tabId, store],
  );
  // (and PDFs and pictures opened, on its page where it is looked at: docs/PDF.md)
  useEffect(
    () => (ownTab && officeId == null ? setPdfTaker(tabId, (pdfs) => store.getState().addPdfs(pdfs, pdfTarget.current())) : undefined),
    [ownTab, officeId, tabId, store],
  );
  useEffect(
    () => (ownTab && officeId == null ? setPictureTaker(tabId, (pictures) => void store.getState().addPictures(pictures, pdfTarget.current())) : undefined),
    [ownTab, officeId, tabId, store],
  );
  // What readers reading an output as well find, joined to each molecule
  // read from it as it comes - or as the molecule comes to stand here
  // (lib/calc/readings).
  const sources = useEditor((s) => s.molecules3d.map((m) => m.calc?.source?.sha256 ?? "").join(","));
  useEffect(() => {
    store.getState().joinReadings();
    return useReadings.subscribe(() => store.getState().joinReadings());
  }, [store, sources]);
  const model = useEditor((s) => s.model);
  const marks = useChemMarks(model, active);
  const chemistry = useAppSettings((s) => s.chemistry);
  const procedures = useAppSettings((s) => s.procedures);
  const setChemistry = useAppSettings((s) => s.setChemistry);
  const chem = useChem();
  const [chemError, setChemError] = useState<string | null>(null);
  const cleaningNow = useRef(false); // one clean-up at a time, keys included
  const runCleanUp = useCallback(
    (aroundAtom: number | Iterable<number> | null) => {
      if (cleaningNow.current) return;
      cleaningNow.current = true;
      setChemError(null);
      cleanUp(store, aroundAtom)
        .catch((e: unknown) =>
          setChemError(
            `Clean-up failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        )
        .finally(() => {
          cleaningNow.current = false;
        });
    },
    [store],
  );
  // The page in view, in world units: what the camera sees of it
  const viewBox = useCallback((): Box | null => {
    const cam = camRef.current;
    const el = domRef.current;
    if (!cam || !el || !cam.zoom) return null;
    const w = el.clientWidth / 2 / cam.zoom;
    const h = el.clientHeight / 2 / cam.zoom;
    // (the column over the canvas's right side hides what lies under it)
    const covered = store.getState().cover / cam.zoom;
    return { x0: cam.position.x - w, x1: cam.position.x + w - covered, y0: cam.position.y - h, y1: cam.position.y + h };
  }, [camRef, domRef]);
  // Structures made in 3D (chem/make3d): asked first about what their
  // drawing leaves open, then their conformers made and risen out of them
  const [ask3d, setAsk3d] = useState<{ blocks: Block[]; open: Open[]; replacing?: Molecule3D } | null>(null);
  // (what the plugin is doing for it, said meanwhile)
  const [working3d, setWorking3d] = useState<string | null>(null);
  const build3d = useCallback(
    async (blocks: Block[], isomers: "one" | "all", replacing?: Molecule3D) => {
      setWorking3d("Making the 3D structure…");
      setChemError(null);
      try {
        const chem = await chemWorker("conformers");
        // (the options the plugin takes for the role, as chosen in Settings, Molecules in 3D)
        const declared = rolePlugin("conformers")?.roleOptions.conformers ?? [];
        const options = valuesOf(declared, useAppSettings.getState().options[roleOptionsRole("conformers")]);
        const made: Parameters<ReturnType<typeof store.getState>["riseMolecules3d"]>[0] = [];
        let allInView = true;
        // (what they keep clear of: the molecules in 3D there already, as they are seen now - and each row made)
        const look3d = currentStyle3D();
        const st = store.getState();
        const solids = st.molecules3d.map((m) => {
          const b = seenBounds(poseOf(m, solidOf(m, look3d), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]));
          return { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY };
        });
        for (const block of blocks) {
          const isomersMade = await conformersOf(chem, block, isomers, options);
          // (several stereoisomers: their R and S shown, to tell them apart)
          const ms = isomersMade.map((c) => moleculeOf(c, block, isomersMade.length > 1));
          const model = store.getState().model;
          const turned = ms.map((m) => turnedOver(m, model, look3d));
          // beside the drawing, where they can be seen as the view is now,
          // clear of what is on the page - or, made again, where the one
          // made before stood
          const taken = takenOnPage(store.getState(), block.atoms, solids);
          const row = replacing
            ? { at: rowFrom(turned, replacing.at), inView: true }
            : placeRow(turned, boxOf(block.part), viewBox(), camRef.current ? eyeOf(camRef.current)?.z : undefined, taken);
          if ("box" in row) solids.push(row.box);
          allInView &&= row.inView;
          ms.forEach((m, i) =>
            made.push({ m: { ...m, at: row.at[i] }, turn: turned[i].turn, from: turned[i].start, flat: turned[i].flat }),
          );
        }
        store.getState().riseMolecules3d(made, replacing ? [replacing.id] : []);
        // (with no room for them in view, the view takes them in)
        if (!allInView) requestFit();
      } catch (e: unknown) {
        setChemError(`No 3D structure could be made: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setWorking3d(null);
      }
    },
    [store, viewBox, requestFit, camRef],
  );
  const make3d = useCallback(
    async (around: Iterable<number>, replacing?: Molecule3D) => {
      // (made again: what the drawing leaves open, as the one before has it)
      const blocks = blocksOf(store.getState().model, around).map((b) =>
        replacing ? { ...b, like: likeOf(b, replacing) } : b,
      );
      if (!blocks.length) return;
      setChemError(null);
      try {
        const chem = await chemWorker("stereoisomers");
        const open = await Promise.all(
          blocks.map(async (b) =>
            openIn(b, await chem.request("open_stereo", { molblock: b.molblock, ...(b.like ? { like: b.like } : {}) })),
          ),
        );
        // (stereo drawn without a configuration: asked what to make first)
        if (open.some((o) => o.atoms.length || o.bonds.length)) setAsk3d({ blocks, open, replacing });
        else await build3d(blocks, "one", replacing);
      } catch (e: unknown) {
        setChemError(`No 3D structure could be made: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [store, build3d],
  );
  // A molecule in 3D made again from its drawing, which has changed since:
  // in its place, as one undo step
  const remake3d = useCallback(
    (id: number) => {
      const { molecules3d: ms, model: m } = store.getState();
      const mol = ms.find((x) => x.id === id);
      const present = new Set(m.atoms.map((a) => a.id));
      const atoms = (mol?.drawnFrom ?? []).filter((a): a is number => a != null && present.has(a));
      if (mol && atoms.length) void make3d(atoms, mol);
    },
    [store, make3d],
  );
  // A molecule in 3D drawn as a formula beside it - by Meno's engine, from
  // the frame it shows - and tied to it, as one undo step
  const drawFormula = useCallback(
    async (id: number) => {
      const st = store.getState();
      const mol = st.molecules3d.find((x) => x.id === id);
      if (!mol) return;
      setWorking3d("Drawing the formula…");
      setChemError(null);
      try {
        const { model: formula, link } = await formulaOf(await chemWorker("drawing"), mol, st.frames3d[id] ?? 0);
        const placed = centredAt(formula, formulaPlace(mol, formula, currentStyle3D()));
        store.getState().drawFormula3d(id, placed, link);
        // (beyond the view, the view takes it in)
        const view = viewBox();
        if (view && placed.atoms.some((a) => a.x < view.x0 || a.x > view.x1 || a.y < view.y0 || a.y > view.y1)) requestFit();
      } catch (e: unknown) {
        setChemError(`The formula could not be drawn: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setWorking3d(null);
      }
    },
    [store, viewBox, requestFit],
  );
  // A molecule in 3D turned to lie as its drawing does, as it did as it rose
  const turnLikeDrawing = useCallback(
    (id: number) => {
      const st = store.getState();
      const mol = st.molecules3d.find((x) => x.id === id);
      if (!mol?.drawnFrom) return;
      const solid = solidOf(mol, currentStyle3D());
      const places = solid.frames[frameOf(solid, st.frames3d[id])];
      const byId = new Map(st.model.atoms.map((a) => [a.id, a]));
      const from: number[] = [];
      const to: number[] = [];
      mol.drawnFrom.forEach((aid, i) => {
        const a = aid == null ? undefined : byId.get(aid);
        if (!a) return;
        from.push(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
        to.push(a.x, a.y);
      });
      if (to.length >= 4) st.setTurn3d(id, turnOnto(from, to));
    },
    [store],
  );
  // What is under the pointer is what a key acts on: Delete deletes it, and
  // the clean-up key cleans up the structure it is in (everything, when the
  // pointer is on nothing) - unless something is selected: then the keys
  // act on the selection, and the structures it is in.
  const hoveredPart = useCallback((): MenuTarget["kind"] | null => {
    const { hovered } = store.getState();
    return hovered.atomId != null
      ? "atom"
      : hovered.bondId != null
        ? "bond"
        : null;
  }, [store]);
  const structureAt = useCallback(
    (kind: MenuTarget["kind"] | null, id: number | null) => {
      if (kind === "atom") return id;
      const { model: m } = store.getState();
      return m.bonds.find((b) => b.id === id)?.a ?? null;
    },
    [store],
  );
  const deletePart = useCallback(
    (kind: MenuTarget["kind"], id: number) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      if (kind === "atom") st.deleteAtom(id);
      else st.deleteBond(id);
    },
    [store],
  );
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  // the field to look for words in the PDFs, opened at the column's top on
  // the PDF it shows - or the one under the pointer, or read there, or the
  // first - with the words selected in it, if any
  const openFind = useCallback(() => {
    const st = store.getState();
    if (!st.pdfs.length) return;
    const shown = st.textsOpen && st.pdfShown != null ? st.pdfShown : null;
    const target = shown ?? st.hoveredPdf ?? st.pdfs.find((p) => p.reading)?.id ?? st.pdfs[0].id;
    if (shown !== target) st.readPdf(target);
    const sel = st.pdfSel;
    const pdf = selects(sel) ? st.pdfs.find((p) => p.id === sel.id) : undefined;
    const open = (q: string) => {
      const now = store.getState().pdfFind;
      if (!now) store.getState().setPdfFind({ q, all: false, found: [], now: 0, busy: false });
      else if (q && q !== now.q) void runFind(store, q, now.all);
      // (the field, there already, given the keys)
      window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-pdf-find]")?.focus(), 0);
    };
    if (sel && pdf) void selectedWords(sel, pdf).then((w) => open(w.slice(0, 200)));
    else open(st.pdfFind?.q ?? "");
  }, [store]);
  // where words taken out of a PDF came from, shown: the PDF read in the
  // column, gone to there, the words marked for a moment
  const showWordsFrom = useCallback(
    (id: number, from: WordsFrom) => {
      const st = store.getState();
      const pdf = st.pdfs.find((p) => p.id === id);
      if (!pdf) return;
      if (!(st.textsOpen && st.pdfShown === id)) st.readPdf(id);
      void textOf(pdf.sha256, from.from.page).then((t) => {
        const y = marksBetween(t, from.from.at, from.from.page === from.to.page ? from.to.at : t.codes.length)[0]?.[1] ?? null;
        readerOf(store).goToWhenRead(id, from.from.page, y, 0.3);
        store.getState().setPdfFlash({ id, from: from.from, to: from.to, start: performance.now() });
      });
    },
    [store],
  );
  // where a picture cut out of a PDF came from, shown: the PDF read in the
  // column, gone to there, the box marked for a moment
  const showBoxFrom = useCallback(
    (id: number, from: PictureFrom) => {
      const st = store.getState();
      if (!st.pdfs.some((p) => p.id === id)) return;
      if (!(st.textsOpen && st.pdfShown === id)) st.readPdf(id);
      readerOf(store).goToWhenRead(id, from.page, from.box[1], 0.3);
      const at = { page: from.page, at: 0 };
      st.setPdfFlash({ id, from: at, to: at, start: performance.now(), box: from.box });
    },
    [store],
  );
  // words selected in a PDF copied, as they read (utils/pdfSelection)
  const copyWords = useCallback(async () => {
    const st = store.getState();
    const sel = st.pdfSel;
    const pdf = selects(sel) ? st.pdfs.find((p) => p.id === sel.id) : undefined;
    if (!sel || !pdf) return;
    const words = await selectedWords(sel, pdf);
    if (words) await writeClipboard([{ flavor: "text", text: words }]);
  }, [store]);
  // where words taken out of a PDF are let go (components/wordsDrag)
  useEffect(() => {
    setCanvasPlace(store, { canvas: () => domRef.current, worldAt: (x, y) => clientToWorld(x, y) });
    return () => setCanvasPlace(store, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  // a PDF's menu, asked for by the column it is read in, where it was right-clicked
  const menuAsk = useEditor((s) => s.menuAsk);
  useEffect(() => {
    if (!menuAsk) return;
    store.getState().askPdfMenu(null);
    const box = dropRef.current?.getBoundingClientRect();
    if (!box) return;
    setMenu({
      kind: "pdf",
      id: menuAsk.id,
      selection: "none",
      at: pasteTarget(),
      x: menuAsk.clientX - box.left,
      y: menuAsk.clientY - box.top,
      within: { width: box.width, height: box.height },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuAsk]);
  /** A flow being saved as a procedure: its parts, asking for its name. */
  const [naming, setNaming] = useState<FlowParts | null>(null);
  // Copy, cut and paste, by the keys and from the menu
  const clip = useClipboardActions(store, setChemError);
  const chargeAtom = useCallback(
    (id: number, step: 1 | -1) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      st.stepCharge(id, step);
    },
    [store],
  );
  const radicalAtom = useCallback(
    (id: number) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      st.toggleRadical(id);
    },
    [store],
  );
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const st = store.getState();
      const { hovered, sel } = st;
      const kind = hoveredPart();
      const id = kind === "atom" ? hovered.atomId : hovered.bondId;
      const { drawing: drawingSelected, any: selected } = selectedOf(st);
      const busy = st.labelEdit.active || st.moveDrag.active || st.extend.active;
      if (isCleanUpKey(e)) {
        e.preventDefault();
        runCleanUp(drawingSelected ? sel.atoms : structureAt(kind, id));
      } else if (isFitKey(e)) {
        e.preventDefault();
        requestFit();
      } else if (isDeleteKey(e) && !busy && st.hoveredMeasure3d) {
        // a measurement under the pointer, before anything else
        e.preventDefault();
        st.removeMeasure3d(st.hoveredMeasure3d.id, st.hoveredMeasure3d.measure);
        st.setHoveredMeasure3d(null);
      } else if (isDeleteKey(e) && selected) {
        e.preventDefault();
        if (!busy) st.deleteSelection();
      } else if (isDeleteKey(e) && kind && id != null) {
        e.preventDefault();
        deletePart(kind, id);
      } else if (isDeleteKey(e) && !busy && st.hoveredArrow != null && st.arrows.some((a) => a.id === st.hoveredArrow)) {
        // a reaction arrow under the pointer, and nothing else
        e.preventDefault();
        st.removeArrow(st.hoveredArrow);
        st.setHoveredArrow(null);
      } else if (isDeleteKey(e) && !busy && st.hoveredCaption != null && st.captions.some((c) => c.id === st.hoveredCaption)) {
        // words under the pointer, and nothing else
        e.preventDefault();
        st.removeCaption(st.hoveredCaption);
      } else if (isDeleteKey(e) && !busy && st.hoveredWire != null && st.wires.some((w) => w.id === st.hoveredWire)) {
        // a workflow's wire, step or set under the pointer - or the set chosen
        e.preventDefault();
        st.removeWire(st.hoveredWire);
      } else if (isDeleteKey(e) && !busy && st.hoveredStep != null && st.steps.some((x) => x.id === st.hoveredStep) && st.openStep !== st.hoveredStep) {
        e.preventDefault();
        st.removeStep(st.hoveredStep);
      } else if (isDeleteKey(e) && !busy && (st.hoveredSet ?? st.chosenSet) != null && st.sets.some((b) => b.id === (st.hoveredSet ?? st.chosenSet))) {
        e.preventDefault();
        st.removeSet((st.hoveredSet ?? st.chosenSet)!);
      } else if (isDeleteKey(e) && !busy && st.hoveredPlus != null && st.pluses.some((p) => p.id === st.hoveredPlus)) {
        e.preventDefault();
        st.removePlus(st.hoveredPlus);
        st.setHoveredPlus(null);
      } else if (isDeleteKey(e) && !busy && st.hovered3d) {
        // a molecule in 3D under the pointer
        e.preventDefault();
        st.removeMolecule3d(st.hovered3d.id);
      } else if (isDeleteKey(e) && !busy && st.hoveredPdf != null && st.pdfs.some((p) => p.id === st.hoveredPdf)) {
        // a PDF under the pointer, and nothing else
        e.preventDefault();
        st.removePdf(st.hoveredPdf);
      } else if (isDeleteKey(e) && !busy && st.hoveredText != null && st.texts.some((t) => t.id === st.hoveredText && t.at)) {
        // a text's sheet under the pointer, likewise
        e.preventDefault();
        st.removeTexts([st.hoveredText]);
      } else if (isDeleteKey(e) && !busy && st.hoveredPicture != null && st.pictures.some((p) => p.id === st.hoveredPicture)) {
        // a picture under the pointer, likewise
        e.preventDefault();
        st.removePicture(st.hoveredPicture);
      } else if (!busy && st.hoveredPdf != null && isBackKey(e) && goBack(store, st.hoveredPdf)) {
        // Back, over a PDF: to where it was before a link was followed in it
        e.preventDefault();
      } else if (!busy && st.hoveredPdf != null && !e.metaKey && !e.ctrlKey && !e.altKey && ["ArrowRight", "ArrowLeft", "PageDown", "PageUp"].includes(e.key)) {
        // a PDF's pages turned, over it (docs/PDF.md)
        const pdf = st.pdfs.find((p) => p.id === st.hoveredPdf);
        if (pdf && !pdf.spread && !pdf.icon) {
          e.preventDefault();
          const next = pdf.page + (e.key === "ArrowRight" || e.key === "PageDown" ? 1 : -1);
          if (next >= 0 && next < pdf.pages.length) st.turnPdf(pdf.id, next);
        }
      } else if (chargeStep(e) && kind === "atom" && id != null) {
        e.preventDefault();
        chargeAtom(id, chargeStep(e) as 1 | -1);
      } else if (clipboardIntent(e)) {
        e.preventDefault();
        const what = clipboardIntent(e);
        // (words selected in a PDF, where nothing else is: their words)
        if (what === "copy" && !selected && selects(st.pdfSel)) void copyWords();
        else if (what === "copy") void clip.copy();
        else if (what === "cut") void clip.cut();
        else void clip.paste(pasteTarget());
      } else if (isFindKey(e) && st.pdfs.length) {
        // looking for words in the PDFs (docs/PDF.md, *Search*)
        e.preventDefault();
        openFind();
      } else if (isSelectAllKey(e) && !busy) {
        e.preventDefault();
        st.selectAll();
      } else if (isDeselectKey(e) && st.pdfFind && !menu) {
        // (Esc closes the search of PDFs, wherever the keys are)
        st.setPdfFind(null);
      } else if (isDeselectKey(e) && (selected || st.chosen3d || st.pdfSel || st.pdfBox) && !busy && !menu) {
        // (Esc with the menu open closes the menu only)
        st.clearSel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, store, runCleanUp, hoveredPart, structureAt, deletePart, chargeAtom, menu, clip, pasteTarget, requestFit, openFind, copyWords]);
  // The same, from the mouse alone: a menu at the pointer on a right-click.
  const closeMenu = useCallback(() => setMenu(null), []);
  // and what a double-click on empty space can put down there (QuickAdd)
  const quickAdd = useEditor((s) => s.quickAdd);
  const askDeleteStep = useEditor((s) => s.askDeleteStep);
  const closeQuickAdd = useCallback(() => store.getState().setQuickAdd(null), [store]);
  // a molecule in 3D right-clicked: what its menu does to it
  const molecules3d = useEditor((s) => s.molecules3d);
  const chosen3d = useEditor((s) => s.chosen3d);
  const style3d = useStyle3D();
  const styleNames3d = useStyleNames3D();
  const menuMolecule = menu?.kind === "molecule3d" ? molecules3d.find((m) => m.id === menu.id) : undefined;
  // a molecule's output shown in the column of texts, held in the
  // workspace: held this session or in its workspace, read again where it
  // was, or else found by the chemist
  const showOutput = async (molecule: number, source: CalcSource) => {
    try {
      const out = (await outputOf(source)) ?? ((await findOutput(source)) ? await outputOf(source) : undefined);
      if (out) {
        store.getState().addTexts([{ name: out.name, text: out.text, ...(source.path ? { path: source.path } : {}), of: { molecule } }]);
        // (rising from its molecule into the column - docs/PDF.md, *A text*: this one, shown from another before)
        const shown = store.getState().textShown;
        if (shown != null) {
          store.getState().setTextOf(shown, { molecule });
          store.getState().riseText(shown);
        }
      }
    } catch (e) {
      setChemError(e instanceof Error ? e.message : String(e));
    }
  };
  const menuLink = menuMolecule ? linkOf(menuMolecule, model) : null;
  // (what is chosen of it, or the measurement right-clicked, can be set: utils/edit3d)
  const frameShown = (id: number) => store.getState().frames3d[id] ?? 0;
  const chosenPathOf = menuMolecule && chosen3d?.id === menuMolecule.id ? chosenPath(menuMolecule, chosen3d) : null;
  const chosenSettable =
    !!menuMolecule && !!chosenPathOf && !!movingAtoms({ atoms: menuMolecule.atoms, bonds: bondsAt(menuMolecule, frameShown(menuMolecule.id)) }, chosenPathOf);
  const measureMolecule = menu?.kind === "measure3d" ? molecules3d.find((m) => m.id === menu.id) : undefined;
  const menuMeasure = measureMolecule && menu?.measure != null ? measureMolecule.measures?.find((x) => x.id === menu.measure) : undefined;
  const measure3dMenu =
    measureMolecule && menuMeasure && movingFor(measureMolecule, menuMeasure.id, frameShown(measureMolecule.id))
      ? { atoms: menuMeasure.atoms.length, onSet: () => store.getState().editMeasure3d({ id: measureMolecule.id, measure: menuMeasure.id }) }
      : undefined;
  const menu3d: MenuMolecule3D | undefined = menuMolecule
    ? {
        otherLook: (() => {
          const other = lookOf(menuMolecule) === "primary" ? "secondary" : "primary";
          return { name: styleNames3d[other], atoms: style3d[other].atoms, run: () => store.getState().switchLook3d(menuMolecule.id) };
        })(),
        chosen: chosen3d?.id === menuMolecule.id ? (chosenPath(menuMolecule, chosen3d)?.length ?? 0) : 0,
        onMeasure: () => store.getState().measureChosen3d(),
        ...(chosenSettable ? { onSetChosen: () => store.getState().setChosen3d() } : {}),
        onResetTurn: () => store.getState().resetTurn3d(menuMolecule.id),
        onCut: () => void clip.cut(menuMolecule.id),
        onCopy: () => void clip.copy(menuMolecule.id),
        ...(menuLink === "live" || menuLink === "changed" ? { onTurnLikeDrawing: () => turnLikeDrawing(menuMolecule.id) } : {}),
        ...(menuLink === "changed" ? { onRemake: () => remake3d(menuMolecule.id) } : {}),
        ...(menuLink == null || menuLink === "gone" ? { onDrawFormula: () => void drawFormula(menuMolecule.id) } : {}),
        ...(resultsOn(menuMolecule.calc?.results, "list").length
          ? {
              lists: resultsOn(menuMolecule.calc?.results, "list").map((l, _, all) => ({
                name: titled(l, all),
                open: () => store.getState().openList3d(menuMolecule.id, resultKey(l)),
              })),
            }
          : {}),
        ...(menuMolecule.calc?.source
          ? { output: { name: menuMolecule.calc.source.name, show: () => void showOutput(menuMolecule.id, menuMolecule.calc!.source!) } }
          : {}),
        ...((menuMolecule.frames?.length ?? 0) > 0
          ? {
              overlay: {
                on: !!store.getState().overlay3d[menuMolecule.id],
                conformers: !!menuMolecule.conformerSet,
                set: (on: boolean) => store.getState().setOverlay3d(menuMolecule.id, on),
              },
            }
          : {}),
      }
    : undefined;
  useEffect(() => setMenu(null), [model]); // what it was about may be gone
  // the selection as a box would take it, where it holds whole structures or molecules in 3D
  const selectionAsSet = () => {
    const st = store.getState();
    return selectionFrame(st.model, st.sel.atoms, st.molecules3d, st.sel3d, currentStyle3D(), st.turns3d, st.frames3d);
  };
  // a box's tab or a step's card right-clicked (Workflow2D): its menu, there
  const workflowMenu = useEditor((s) => s.workflowMenu);
  useEffect(() => {
    if (!workflowMenu) return;
    store.getState().setWorkflowView({ workflowMenu: null });
    const box = domRef.current?.getBoundingClientRect();
    if (!box) return;
    setMenu({
      kind: workflowMenu.kind,
      id: workflowMenu.id,
      selection: "none",
      at: clientToWorld(workflowMenu.clientX, workflowMenu.clientY) ?? pasteTarget(),
      x: workflowMenu.clientX - box.left,
      y: workflowMenu.clientY - box.top,
      within: { width: box.width, height: box.height },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowMenu, store]);
  // A right-drag moves the view, so the menu waits for the button to come
  // up without having travelled. macOS asks for the menu as the button goes
  // down, Windows as it comes up: either way it opens only then.
  const rightPress = useRef<{
    x: number;
    y: number;
    down: boolean;
    moved: boolean;
    pending: MenuTarget | null;
  } | null>(null);
  const onRightDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 2) {
      rightPress.current = null; // a Ctrl-click on a Mac starts afresh
      return;
    }
    rightPress.current = {
      x: e.clientX,
      y: e.clientY,
      down: true,
      moved: false,
      pending: null,
    };
  };
  const onRightMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = rightPress.current;
    if (!r?.down || r.moved) return;
    if (Math.hypot(e.clientX - r.x, e.clientY - r.y) > 4) r.moved = true;
  };
  const onRightUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = rightPress.current;
    if (e.button !== 2 || !r) return;
    r.down = false;
    if (r.pending && !r.moved) setMenu(r.pending);
    r.pending = null;
  };
  const openMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    // A card's text field keeps the system's own menu - cut, copy, paste.
    if (e.target !== domRef.current) return;
    e.preventDefault(); // no browser menu over the drawing
    const { hovered, hoveredArrow, arrows, hoveredPlus, pluses, hoveredCaption, captions, hovered3d, sel3d, hoveredMeasure3d } = store.getState();
    const box = e.currentTarget.getBoundingClientRect();
    const place = {
      at: clientToWorld(e.clientX, e.clientY) ?? pasteTarget(),
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      within: { width: box.width, height: box.height },
    };
    const kind = hoveredPart();
    const r = rightPress.current;
    const open = (target: MenuTarget) => {
      if (r?.down) r.pending = target; // macOS: open on the way up
      else if (!r?.moved) setMenu(target); // Windows, or a Ctrl-click on a Mac
    };
    // over a measurement's value, on a molecule in 3D: its own menu
    if (hoveredMeasure3d) {
      open({ kind: "measure3d", id: hoveredMeasure3d.id, measure: hoveredMeasure3d.measure, selection: "none", ...place });
      return;
    }
    // on a molecule in 3D: its own menu, or the selection's when it is in it
    if (hovered3d) {
      const { sel } = store.getState();
      const drawing = sel.atoms.size > 0 || sel.bonds.size > 0;
      const here = sel3d.has(hovered3d.id);
      open({
        kind: "molecule3d",
        id: hovered3d.id,
        selection: here ? "here" : drawing || sel3d.size ? "elsewhere" : "none",
        drawing,
        ...place,
      });
      return;
    }
    // on a reaction arrow, and nothing else: the arrow's menu
    if (!kind && hoveredArrow != null && arrows.some((a) => a.id === hoveredArrow)) {
      const target: MenuTarget = { kind: "arrow", id: hoveredArrow, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a workflow's wire
    const { hoveredWire, wires } = store.getState();
    if (!kind && hoveredWire != null && wires.some((w) => w.id === hoveredWire)) {
      open({ kind: "wire", id: hoveredWire, selection: "none", ...place });
      return;
    }
    // likewise words on the page, unless they are selected with more
    const wordsWithMore = (() => {
      const s = store.getState();
      return s.sel.atoms.size > 0 || s.sel3d.size > 0 || s.selFlow.sets.size > 0 || s.selFlow.steps.size > 0 || s.selPictures.size > 0 || s.selTexts.size > 0 || s.selCaptions.size > 1;
    })();
    if (!kind && hoveredCaption != null && captions.some((c) => c.id === hoveredCaption) && !(store.getState().selCaptions.has(hoveredCaption) && wordsWithMore)) {
      const target: MenuTarget = { kind: "caption", id: hoveredCaption, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a text's sheet, unless it is selected with more (docs/PDF.md, *A text*)
    const { hoveredText, texts, selTexts } = store.getState();
    const withOthers = (() => {
      const s = store.getState();
      return s.sel.atoms.size > 0 || s.sel3d.size > 0 || s.selFlow.sets.size > 0 || s.selFlow.steps.size > 0 || s.selPictures.size > 0 || selTexts.size > 1;
    })();
    if (!kind && hoveredText != null && texts.some((t) => t.id === hoveredText && t.at) && !(selTexts.has(hoveredText) && withOthers)) {
      const target: MenuTarget = { kind: "text", id: hoveredText, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a picture, unless it is selected with more (docs/PDF.md, *A picture*)
    const { hoveredPicture, pictures, selPictures } = store.getState();
    const withMore = (() => {
      const s = store.getState();
      return s.sel.atoms.size > 0 || s.sel3d.size > 0 || s.selFlow.sets.size > 0 || s.selFlow.steps.size > 0 || selPictures.size > 1;
    })();
    if (!kind && hoveredPicture != null && pictures.some((p) => p.id === hoveredPicture) && !(selPictures.has(hoveredPicture) && withMore)) {
      const target: MenuTarget = { kind: "picture", id: hoveredPicture, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a PDF (docs/PDF.md)
    const { hoveredPdf, pdfs } = store.getState();
    if (!kind && hoveredPdf != null && pdfs.some((p) => p.id === hoveredPdf)) {
      const target: MenuTarget = { kind: "pdf", id: hoveredPdf, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a "+"
    if (!kind && hoveredPlus != null && pluses.some((p) => p.id === hoveredPlus)) {
      const target: MenuTarget = { kind: "plus", id: hoveredPlus, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    const id = kind === "atom" ? hovered.atomId : hovered.bondId;
    // on something selected, or on nothing with a selection: the
    // selection's menu; on nothing else, the canvas's (paste, select all)
    const { sel } = store.getState();
    const part = kind && id != null;
    const { drawing, any: selected } = selectedOf(store.getState());
    const onSelected =
      part &&
      (kind === "atom" ? sel.atoms.has(id) : sel.bonds.has(id));
    const target: MenuTarget = {
      kind: part ? kind : null,
      id: part ? id : null,
      selection: !selected ? "none" : onSelected || !part ? "here" : "elsewhere",
      drawing,
      ...place,
    };
    if (r?.down) r.pending = target; // macOS: open on the way up
    else if (!r?.moved) setMenu(target); // Windows, or a Ctrl-click on a Mac
  };
  const toggleStereoLabels = () => {
    const stereoLabels = !chemistry.stereoLabels;
    setChemistry({ ...chemistry, stereoLabels });
    if (!stereoLabels) return;
    // asked for: what labels them set up now, if it has not been
    setChemError(null);
    chemWorker("checks").catch((e: unknown) => {
      setChemistry({ ...useAppSettings.getState().chemistry, stereoLabels: false });
      setChemError(
        `R and S cannot be shown: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  };

  const alert = importError?.text ?? files.error ?? chemError;
  const dismissAlert = importError
    ? dismissImportError
    : files.error
      ? files.dismissError
      : () => setChemError(null);
  const ownStyle = useEditor((s) => s.docStyle != null);
  // Where the view starts, before there is anything to fit
  const style = useDrawingStyle();
  const [startZoom] = useState(() => startingZoom(style));
  // Drops on the drawing: files, and objects and pictures out of Office (lib/drop)
  const dropRef = useRef<HTMLDivElement>(null);
  useDropZone(dropRef, dropZone);
  // Export: the kind and its options asked in a card over the canvas, then the file's name
  const [exporting, setExporting] = useState<{ writers: Writer[]; from?: string; what: Holds; molecules: Offered3D[]; selected: number[]; part: { part: Drawn; ids3d: number[] } } | null>(null);

  // Export: what is selected - its structures, arrows and words, its
  // molecules in 3D - as Meno writes it, or a plugin added that writes
  // molecules in 3D, where it holds any (the maintainer, 2026-10-10: Export
  // is for the selection; the whole page, by Select all first)
  const startExport = (taken: { part: Drawn; ids3d: number[] }) => {
    const state = store.getState();
    const what = holdsOfDrawn(taken.part);
    const added = useReaders.getState().state;
    const theirs = what.solid ? pluginWriters(WRITER_PLUGINS.filter((p) => added[p.id] === "added")) : [];
    const names = offeredNames(state.molecules3d);
    const molecules = state.molecules3d.flatMap((m, i) => (taken.ids3d.includes(m.id) ? [{ id: m.id, name: names[i] }] : []));
    setExporting({ writers: [...exportKinds(what).map((k) => WRITERS[k]), ...theirs], from: exportKindOf(state, what), what, molecules, selected: taken.ids3d, part: taken });
  };

  // What the workspace does as a whole - opening, saving as, fitting, R and
  // S, its texts, its style, its workflow - on the right-click menu on empty
  // space; the keys say the same. (Save is the title bar's, and Ctrl/Cmd+S.)
  const texts = useEditor((s) => s.texts);
  const steps = useEditor((s) => s.steps);
  const textsOpen = useEditor((s) => s.textsOpen);
  const reading = useEditor((s) => s.pdfs.some((p) => p.reading));
  const pdfsHeld = useEditor((s) => s.pdfs.length > 0);
  // (`at`: where on the page the menu was opened - where a new text's sheet goes)
  const canvasCommands = (at: { x: number; y: number }): CanvasCommand[] => [
    // (a tab's own workspace: not one in a document's object, which keeps its own)
    ...(ownTab
      ? [
          { name: "Open…", keys: shortcutLabel("O"), run: askToOpen },
          { name: "Save As…", keys: shortcutLabel("S", true), run: () => void saveAs() },
          // (a text of its own, in the column of texts)
          ...(officeId == null ? [{ name: "New text", keys: "", run: () => store.getState().addTexts([{ name: "", text: "" }], at) }] : []),
        ]
      : []),
    { name: "Fit to content", keys: shortcutLabel("1"), run: requestFit, divider: true },
    { name: chemistry.stereoLabels ? "Hide R and S" : "Show R and S", keys: "", run: toggleStereoLabels },
    ...(texts.length || reading
      ? [
          textsOpen
            ? { name: "Hide texts", keys: "", run: () => store.getState().closeTexts() }
            : {
                name: "Show texts",
                keys: "",
                run: () => {
                  // (the PDF it showed, rising into it again; or the text)
                  const st = store.getState();
                  if (st.pdfShown != null && st.pdfs.some((p) => p.id === st.pdfShown && p.reading)) st.readPdf(st.pdfShown);
                  else if (st.texts.length) st.showText(st.textShown ?? st.texts[0].id);
                  else if (st.pdfs.some((p) => p.reading)) st.readPdf(st.pdfs.find((p) => p.reading)!.id);
                },
              },
        ]
      : []),
    ...(pdfsHeld ? [{ name: "Find in PDF…", keys: shortcutLabel("F"), run: openFind }] : []),
    { name: ownStyle ? "Drawing style (its own)…" : "Drawing style…", keys: "", run: () => !styleOpen && toggleStyle(), divider: true },
    // a workflow's steps on the page: every one that has not run or has changed, run - or all stopped
    ...(steps.length
      ? [
          { name: "Run all", keys: "", run: () => void store.getState().runAll(), divider: true },
          ...(steps.some((x) => x.running) ? [{ name: "Stop all", keys: "", run: () => store.getState().stopAll() }] : []),
        ]
      : []),
  ];

  return (
    <div
      ref={dropRef}
      data-guide="page"
      className={`flex-1 min-w-0 h-full relative${fadeIn ? " meno-fade-in" : ""}`}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMove={handleWrapperMouseMove}
      onMouseLeave={handleWrapperMouseLeave}
      onClick={handleWrapperClick}
      onContextMenu={openMenu}
      onPointerDownCapture={onRightDown}
      onPointerMoveCapture={onRightMove}
      onPointerUpCapture={onRightUp}
    >
      {/* Import error */}
      <AnimatePresence>
      {alert && (
        <motion.div
          key="alert"
          {...RISE}
          role="alert"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-[90%] flex items-start gap-2 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
        >
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
          <span className="break-words">{alert}</span>
          {importError?.suggest && importError.again && <AddToRead suggest={importError.suggest} again={importError.again} />}
          <button
            aria-label="Dismiss"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissAlert();
            }}
            className="h-4 w-4 shrink-0 rounded-full hover:bg-gh-line"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence>
        {active && (chem.state === "setting-up" || chem.state === "starting" || working3d) && (
          <motion.div
            key="working"
            {...RISE}
            layout
            role="status"
            className="absolute right-3 bottom-3 z-50 rounded-full border border-gh-line bg-white/95 shadow-sm px-3 py-1.5 text-xs text-gh-gray"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={chem.state === "setting-up" || chem.state === "starting" ? chem.state : "working"} {...FADE} className="block">
                {chem.state === "setting-up"
                  ? `Setting up ${chem.plugin}…`
                  : chem.state === "starting"
                    ? `Starting ${chem.plugin}…`
                    : working3d}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {ask3d && (
          <Ask3D
            key="ask3d"
            open={ask3d.open}
            onAll={() => {
              setAsk3d(null);
              void build3d(ask3d.blocks, "all", ask3d.replacing);
            }}
            onOne={() => {
              setAsk3d(null);
              void build3d(ask3d.blocks, "one", ask3d.replacing);
            }}
            onCancel={() => setAsk3d(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {exporting && (
          <ExportCard
            key="export"
            writers={exporting.writers}
            from={exporting.from}
            what={exporting.what}
            molecules={exporting.molecules}
            selected={exporting.selected}
            known={(ids) => {
              const state = store.getState();
              const chosen = carriedOf(state).filter((_, i) => ids.includes(state.molecules3d[i].id));
              return chosen.length ? knownOf(writtenOf(chosen)) : {};
            }}
            onCancel={() => setExporting(null)}
            onExport={(writer, options, molecules) => {
              setExporting(null);
              void files.exportAs(writer, options, molecules, exporting.part.part);
            }}
          />
        )}
      </AnimatePresence>
      {/* a double-click on empty space: what can be put down there */}
      <AnimatePresence>
        {quickAdd && (
          <QuickAdd
            key={`${quickAdd.x},${quickAdd.y}`}
            x={quickAdd.x}
            y={quickAdd.y}
            within={quickAdd.within}
            steps={offeredSteps(store.getState(), quickAdd.wire)}
            wired={!!quickAdd.wire}
            onStep={(kind, by) => {
              const st = store.getState();
              const { at, wire } = quickAdd;
              st.setQuickAdd(null);
              // (its port that takes where Quick Add was opened - where the wire was let go)
              const id = st.addStep(kind, by, at.x, at.y + PORT_DOWN);
              if (wire) st.connect(wire, id);
            }}
            procedures={quickAdd.wire ? [] : proceduresSaved(procedures).map((p) => ({ id: p.id, name: p.name, needs: procedureNeeds(p.parts) }))}
            onProcedure={(id) => {
              const st = store.getState();
              const { at } = quickAdd;
              st.setQuickAdd(null);
              st.putDownProcedure(id, at.x, at.y);
            }}
            onClose={closeQuickAdd}
            onChain={(press) => {
              const { at } = quickAdd;
              store.getState().setQuickAdd(null);
              chainFrom(store, press, at, clientToWorld);
            }}
            onSmiles={async (smiles) => {
              // (the plugin's drawing says what the SMILES does; the engine draws it - there, selected, as a paste is)
              const drawn = await structureFromSmiles(smiles);
              const st = store.getState();
              const { at } = quickAdd;
              st.setQuickAdd(null);
              st.pasteModel(centredAt(drawn, at));
            }}
            onChoose={(what) => {
              const st = store.getState();
              const { at } = quickAdd;
              st.setQuickAdd(null);
              if (what === "bond") {
                // (across at 30 degrees, as a chain from empty space begins)
                const dx = (Math.cos(Math.PI / 6) * NOMINAL_BOND_LENGTH) / 2;
                const dy = (Math.sin(Math.PI / 6) * NOMINAL_BOND_LENGTH) / 2;
                st.addBondedPair({ x: at.x - dx, y: at.y - dy }, { x: at.x + dx, y: at.y + dy });
              } else if (what === "text") st.setCaptionEdit({ id: null, at });
              else if (what === "arrow") st.addArrow(at.x, at.y);
              else st.addPlus(at.x, at.y);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {askDeleteStep != null && (
          <ConfirmDiscard
            title="Delete a step that is running?"
            message="Its jobs are stopped, and their files go with it."
            discardLabel="Delete step"
            onCancel={() => store.getState().setWorkflowView({ askDeleteStep: null })}
            onDiscard={() => store.getState().removeStep(askDeleteStep, true)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {naming && (
          <NameDialog
            title="Save as procedure"
            message="Its steps, as they are set, the wires among them and the sets they take their input from - not the molecules - to put down again from Quick Add."
            initial={suggestedName(naming)}
            saveLabel="Save"
            onCancel={() => setNaming(null)}
            onSave={(name) => {
              saveProcedure(name, naming);
              setNaming(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
      {menu && (
        <PartMenu
          key={`${menu.x},${menu.y}`}
          target={menu}
          onClose={closeMenu}
          onDelete={() => {
            const st = store.getState();
            if (menu.kind === "arrow" && menu.id != null) st.removeArrow(menu.id);
            else if (menu.kind === "caption" && menu.id != null) st.removeCaption(menu.id);
            else if (menu.kind === "pdf" && menu.id != null) st.removePdf(menu.id);
            else if (menu.kind === "picture" && menu.id != null) st.removePicture(menu.id);
            else if (menu.kind === "text" && menu.id != null) st.removeTexts([menu.id]);
            else if (menu.kind === "set" && menu.id != null) st.removeSet(menu.id);
            else if (menu.kind === "step" && menu.id != null) st.removeStep(menu.id);
            else if (menu.kind === "wire" && menu.id != null) st.removeWire(menu.id);
            else if (menu.kind === "plus" && menu.id != null) st.removePlus(menu.id);
            else if (menu.kind === "measure3d" && menu.id != null && menu.measure != null) st.removeMeasure3d(menu.id, menu.measure);
            else if (menu.selection === "here") st.deleteSelection();
            else if (menu.kind === "molecule3d" && menu.id != null) st.removeMolecule3d(menu.id);
            else if (menu.kind && menu.id != null) deletePart(menu.kind, menu.id);
          }}
          molecule3d={menu3d}
          measure3d={measure3dMenu}
          onArrowStyle={() => {
            if (menu.kind === "arrow" && menu.id != null) openArrowStyle(menu.id);
          }}
          onSaveAbbreviation={() => {
            const { model: m, sel } = store.getState();
            const made = abbreviationFromSelection(m, sel.atoms);
            if ("problem" in made) setChemError(`This selection cannot be saved as an abbreviation. ${made.problem}`);
            else openSaveAbbreviation([...sel.atoms], made.smiles);
          }}
          onRunStep={() => {
            if (menu.kind !== "step" || menu.id == null) return;
            // (a program installed separately found nowhere: Settings, Plugins, where it is located)
            const s = store.getState().steps.find((x) => x.id === menu.id);
            if (s && missingFor(s)) return openSettingsAt("plugins");
            void store.getState().runStep(menu.id);
          }}
          step={(() => {
            const s = menu.kind === "step" ? store.getState().steps.find((x) => x.id === menu.id) : undefined;
            if (!s) return undefined;
            const st = store.getState();
            const jobs = !!(s.running?.jobs.length || s.ran?.jobs?.length);
            return {
              ...(s.running ? { onStop: () => st.stopStep(s.id) } : { onRunFrom: () => void st.runFrom(s.id) }),
              ...(jobs ? { onShowLog: () => void st.showStepLog(s.id), onShowFiles: () => void st.showStepFiles(s.id).catch(() => {}) } : {}),
            };
          })()}
          onStepOptions={() => {
            if (menu.kind === "step" && menu.id != null) store.getState().setWorkflowView({ openStep: menu.id });
          }}
          onSaveProcedure={(menu.kind === "step" || menu.kind === "set") && menu.id != null ? () => {
            const st = store.getState();
            const start = menu.kind === "step" ? { step: menu.id! } : { set: menu.id! };
            const parts = procedureParts(st, flowOf(st, start));
            if (parts.steps.length) setNaming(parts);
          } : undefined}
          onUseAsInput={menu.selection === "here" && selectionAsSet() ? () => {
            const frame = selectionAsSet();
            if (!frame) return;
            store.getState().addSet(frame);
            store.getState().clearSel();
          } : undefined}
          onShowSource={(() => {
            const st = store.getState();
            // (a picture cut out of a PDF: its box there)
            const pic = menu.kind === "picture" ? st.pictures.find((x) => x.id === menu.id) : undefined;
            const from = pic?.from;
            const fromPdf = from ? st.pdfs.find((p) => p.sha256 === from.sha256) : undefined;
            if (from && fromPdf) return () => showBoxFrom(fromPdf.id, from);
            const c = menu.kind === "caption" ? st.captions.find((x) => x.id === menu.id) : undefined;
            const pdf = c?.from ? st.pdfs.find((p) => p.sha256 === c.from!.sha256) : undefined;
            return c?.from && pdf ? () => showWordsFrom(pdf.id, c.from!) : undefined;
          })()}
          captionAlign={(() => {
            const c = menu.kind === "caption" ? store.getState().captions.find((x) => x.id === menu.id) : undefined;
            return c ? { now: c.align ?? "center", set: (align) => store.getState().updateCaption(c.id, { align }) } : undefined;
          })()}
          onFitWords={(() => {
            const c = menu.kind === "caption" ? store.getState().captions.find((x) => x.id === menu.id) : undefined;
            return c?.width ? () => store.getState().updateCaption(c.id, { width: null }) : undefined;
          })()}
          onEditText={() => {
            const c = store.getState().captions.find((x) => x.id === menu.id);
            if (c) store.getState().setCaptionEdit({ id: c.id, at: { x: c.x, y: c.y } });
          }}
          onCopyPicture={menu.kind === "picture" && menu.id != null ? () => void clip.copyPicture(menu.id!) : undefined}
          text={(() => {
            const t = menu.kind === "text" && menu.id != null ? store.getState().texts.find((x) => x.id === menu.id) : undefined;
            if (!t) return undefined;
            return { icon: !!t.icon, onRead: () => store.getState().readText(t.id), onIcon: () => store.getState().setTextIcon(t.id, !t.icon) };
          })()}
          pdf={(() => {
            const p = menu.kind === "pdf" ? store.getState().pdfs.find((x) => x.id === menu.id) : undefined;
            if (!p) return undefined;
            const st = store.getState();
            return {
              spread: !!p.spread,
              icon: !!p.icon,
              onSpread: () => st.spreadPdf(p.id, !p.spread),
              ...(p.spread && p.placed?.length ? { onRows: () => st.pdfPagesInRows(p.id) } : {}),
              onIcon: () => st.iconPdf(p.id, !p.icon),
              ...(!p.spread && !p.icon && p.page < p.pages.length - 1 ? { onNext: () => st.turnPdf(p.id, p.page + 1) } : {}),
              ...(!p.spread && !p.icon && p.page > 0 ? { onPrevious: () => st.turnPdf(p.id, p.page - 1) } : {}),
              onRead: () => st.readPdf(p.id),
              ...(selects(st.pdfSel) && st.pdfSel.id === p.id ? { onCopy: () => void copyWords() } : {}),
              // (a box drawn on it: put on the page, or copied, as a picture)
              ...(st.pdfBox?.id === p.id
                ? (() => {
                    const box = st.pdfBox;
                    return { onPutBox: () => void putBox(store, p, box, pasteTarget()), onCopyBox: () => void copyBox(p, box) };
                  })()
                : {}),
            };
          })()}
          onCleanUp={() =>
            runCleanUp(
              menu.selection === "here"
                ? store.getState().sel.atoms
                : structureAt(menu.kind, menu.id),
            )
          }
          onMake3d={() => {
            const around = menu.selection === "here" ? store.getState().sel.atoms : structureAt(menu.kind, menu.id);
            if (around != null) void make3d(typeof around === "number" ? [around] : around);
          }}
          onSelectStructure={() => {
            const at = structureAt(menu.kind, menu.id);
            if (at != null) store.getState().selectStructure(at);
          }}
          onTurnOver={(axis) => store.getState().turnSelectionOver(axis)}
          onCharge={(step) => {
            if (menu.kind === "atom" && menu.id != null) chargeAtom(menu.id, step);
          }}
          onRadical={() => {
            if (menu.kind === "atom" && menu.id != null) radicalAtom(menu.id);
          }}
          radical={!!model.atoms.find((a) => a.id === menu.id)?.radical}
          onExpand={
            menu.kind === "atom" && menu.id != null && expandable(model.atoms.find((a) => a.id === menu.id))
              ? () => store.getState().expandAbbreviation(menu.id!)
              : undefined
          }
          asTyped={(() => {
            const a = menu.kind === "atom" && menu.id != null ? model.atoms.find((x) => x.id === menu.id) : undefined;
            return a?.typed && a.typed !== a.el ? { typed: a.typed, run: () => store.getState().labelAsTyped(a.id) } : undefined;
          })()}
          canvas={canvasCommands(menu.at)}
          onExport={menu.selection === "here" ? () => {
            const taken = clip.part();
            if (taken) startExport(taken);
          } : undefined}
          clipboard={{
            onCut: () => void clip.cut(),
            onCopy: () => void clip.copy(),
            onCopySmiles: () => void clip.copySmiles(),
            onPaste: () => void clip.paste(menu.at),
            onSelectAll: () => store.getState().selectAll(),
          }}
        />
      )}
      </AnimatePresence>
      {/* (a molecule in 3D made again from its changed drawing: asked of the plugin here) */}
      <Remake3D.Provider value={remake3d}>
      <PageHtmlLayer.Provider value={htmlLayer}>
      <Canvas
        key={tabId}
        // The page is seen straight from above, orthographically: the drawing
        // as ever, and a molecule in 3D as a picture of it shows it, however
        // high it stands. (A view that is to show depth can have a camera in
        // perspective instead - PageCamera - and all that sees molecules
        // follows its eye: utils/page#eyeOf.)
        orthographic
        camera={{ position: [0, 0, EYE_HEIGHT], near: 0.1, far: 2 * EYE_HEIGHT, zoom: startZoom }}
        // Render on demand: interactions, store changes and the animation
        // layers request frames (see PanZoom2D and the preview components)
        // instead of redrawing continuously while nothing changes.
        frameloop={active ? "demand" : "never"}
        // (following its box as the panel beside it slides)
        resize={CANVAS_RESIZE}
        dpr={CANVAS_DPR}
        onDoubleClick={handleDoubleClick}
        gl={{
          antialias: true,
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: "high-performance",
        }}
        onCreated={onCreated}
      >
        <color attach="background" args={["#ffffff"]} />
        <FitToContent2D trigger={fitNonce} />
        {/* The drawing, laid out once for every layer below to draw from */}
        <DrawnLayoutProvider>
          {/* PDFs, under the drawing - an icon's name in its type - and one read in the column over the canvas's right side (docs/PDF.md) */}
          <PdfPictures>
            <Pdfs2D />
            <PdfColumn />
          </PdfPictures>
          {/* Texts' sheets, over the PDFs (docs/PDF.md, *A text*) */}
          <TextSheets2D />
          {/* Pictures, over the PDFs and under the drawing (docs/PDF.md, *A picture*) */}
          <Pictures2D />
          {/* Bonds */}
          <Bonds2D />
          <Atoms2D />
          {/* Bond picking */}
          <BondsPick2D />
          {/* Join caps */}
          <JoinCaps2D />
          {/* Shapes and labels */}
          <AromaticCircles2D />
          <Wedges2D />
          {/* Atom hover rings */}
          <AtomsHoverRings2D />
          {/* what is selected, the box or lasso selecting, the handle turning it */}
          <Selection2D />
          {/* a press held, for a long press: the selection spreading, or a ring */}
          <HoldProgress2D />
          {/* the honeycomb a chain is traced on */}
          <ChainGuide2D />
          {/* A label's font is read before it is drawn: the rest of the
              drawing does not wait for it, nor go if it cannot be read. */}
          <Suspense fallback={null}>
            <Labels2D />
          </Suspense>
          {/* the plugin's marks: valence problems, R/S and E/Z */}
          <ChemMarks2D marks={marks} />
          {/* charges, each taken hold of on its own ink and moved by hand */}
          <ChargeHolds2D />
          {/* the atom a molecule in 3D under the pointer was made from */}
          <LinkedHover2D />
          {/* stereo drawn without a configuration, while Meno asks about it */}
          <OpenStereo2D atoms={ask3d?.open.flatMap((o) => o.atoms) ?? NO_IDS} bonds={ask3d?.open.flatMap((o) => o.bonds) ?? NO_IDS} />
          {/* Label editor */}
          <LabelTyping2D />
          {/* Words being written, in place */}
          <CaptionTyping2D />
          {/* Hover overlay */}
          <ExtendPreview2D />
          {/* The 120-degree arc while a bond snaps to it */}
          <SnapArc2D />
          {/* Move preview */}
          <MovePreview2D />
          <HoverOverlay2D />
          {/* A reaction scheme's arrows and "+" signs */}
          <Arrows2D />
          <Pluses2D />
          {/* Words on the page: a reaction's reagents and conditions, or anything else */}
          <Suspense fallback={null}>
            <Captions2D />
          </Suspense>
          {/* A workflow on the page: its sets, steps and wires (within the drawing's layout: an input set is made round its labels) */}
          <Workflow2D />
        </DrawnLayoutProvider>
        {/* the page's scale, for chips drawn on it in HTML */}
        <PageScale />
        {/* where a guide's step points at a structure (lib/plugins/guide) */}
        <GuideStructure place={guideStructure} />
        {/* Molecules in 3D standing on the page (before PanZoom2D: a press on one is theirs) */}
        <Molecules3D style={style3d} />
        <PanZoom2D />
        {/* (the view following the column over the canvas's right side) */}
        <FollowCover />
      </Canvas>
      </PageHtmlLayer.Provider>
      {/* the page's HTML, cut off where the column begins (coverLayer) */}
      <div ref={setHtmlLayer} className="absolute inset-0 pointer-events-none" style={{ clipPath: cover > 0 ? `inset(0 ${cover}px 0 0)` : undefined }} />
      {/* where a guide's step points at a structure: kept over it (GuideStructure) */}
      <div ref={guideStructure} data-guide="structure" className="absolute left-0 top-0 pointer-events-none" style={{ display: "none" }} />
      </Remake3D.Provider>
    </div>
  );
}

/**
 * The canvas, should it fail as it is drawn: a card in its place, and
 * Reload making it again - whatever it was in the middle of let go, the
 * press that would have ended it lost with it. Its document, and its store
 * with it, are as they were (ui/layouts/ErrorBoundary).
 */
function CanvasBoundary({ children }: { children: (reloaded: boolean) => ReactNode }) {
  const store = useEditorStore();
  // (made again with its tab, or with the window, likewise: the store is as
  // whatever failed left it)
  useEffect(() => store.getState().letGo(), [store]);
  // (the card in the middle of what is seen of the page: the column lies over its right side)
  const cover = useEditor((s) => s.cover);
  return (
    <ErrorBoundary
      part="canvas"
      onReload={() => store.getState().letGo()}
      fallback={({ error, reload }) => (
        // (in the canvas's place, as wide, and as white)
        <div className="flex-1 min-w-0 h-full relative bg-white">
          <div className="absolute top-3 left-0 flex justify-center" style={{ right: cover }}>
            <StoppedCard
              said="The canvas stopped working. What is on it is kept."
              error={error}
              actions={[{ label: "Reload", run: reload }]}
            />
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * The column, likewise: a card where it was, Reload making it again - or
 * Hide closing it, its texts and PDFs kept, for a column that fails again.
 */
function ColumnBoundary({ children }: { children: (reloaded: boolean) => ReactNode }) {
  const store = useEditorStore();
  return (
    <ErrorBoundary
      part="column"
      fallback={({ error, reload }) => (
        <StoppedCard
          said="The column stopped working. Its texts and PDFs are kept."
          error={error}
          actions={[
            { label: "Reload", run: reload },
            {
              label: "Hide",
              run: () => {
                store.getState().closeTexts();
                reload();
              },
            },
          ]}
          className="absolute top-3 right-3"
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export default function Workspace({
  tabId,
  initialPayload,
  initialFilename,
  initialKind,
  initialPath,
  officeId,
  active = true,
  document,
  nameTab,
}: {
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
  /** What the payload is, where whoever opened it said (lib/io/kinds). */
  initialKind?: string;
  /** Where the file opened in it is, where Open said: a workspace's is where Save writes it back. */
  initialPath?: string;
  /** The object in a document it was opened from, when it was (lib/ole). */
  officeId?: number;
  /** False while the owning tab is hidden: pauses the render loop. */
  active?: boolean;
  /** The tab's document; omitted for canvases embedded in other views. */
  document?: DocumentStore<WorkspaceDocument>;
  /** Names the canvas's tab after the file it is saved as. */
  nameTab?: (label: string) => void;
}) {
  // The document's drawing style - or one reaction arrow's own - opens in a
  // panel beside the canvas rather than over it, so the drawing stays in
  // view while it changes. One panel at a time.
  const [panel, setPanel] = useState<
    "style" | { arrow: number } | { abbreviation: { ids: number[]; smiles: string } } | null
  >(null);
  const styleOpen = panel === "style";
  return (
    <EditorProvider tabId={tabId} document={document}>
      <div className="w-full h-full flex">
        {/* the canvas, and over its right side the column of texts and PDFs (docs/PDF.md, *One canvas*) */}
        <div className="relative flex-1 min-w-0 h-full flex">
        {/* (each its own part: should one fail, the other goes on - docs/ARCHITECTURE.md, *When a part fails*) */}
        <CanvasBoundary>
          {(reloaded) => (
            <WorkspaceContent
              active={active}
              tabId={tabId}
              initialPayload={initialPayload}
              initialFilename={initialFilename}
              initialKind={initialKind}
              initialPath={initialPath}
              officeId={officeId}
              ownTab={document != null}
              nameTab={nameTab}
              styleOpen={styleOpen}
              toggleStyle={() => setPanel((p) => (p === "style" ? null : "style"))}
              openArrowStyle={(id) => setPanel({ arrow: id })}
              openSaveAbbreviation={(ids, smiles) => setPanel({ abbreviation: { ids, smiles } })}
              fadeIn={reloaded}
            />
          )}
        </CanvasBoundary>
        {/* The texts the workspace holds, in their column */}
        <ColumnBoundary>{(reloaded) => <TextColumn slideIn={reloaded} />}</ColumnBoundary>
        </div>
        {/* The panel beside the canvas slides open and shut, the canvas giving
            way as it does; one going as another comes takes as long, so the
            canvas keeps its width. */}
        <AnimatePresence initial={false}>
          {panel && (
            <motion.div
              key={panel === "style" ? "style" : "arrow" in panel ? `arrow-${panel.arrow}` : `abbreviation-${panel.abbreviation.ids.join(",")}`}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: DURATION.move, ease: EASE_SLIDE }}
              className="shrink-0 h-full overflow-hidden"
            >
              {panel === "style" ? (
                <DocumentStylePanel onClose={() => setPanel(null)} />
              ) : "arrow" in panel ? (
                <ArrowStylePanel arrowId={panel.arrow} onClose={() => setPanel(null)} />
              ) : (
                <SaveAbbreviationPanel
                  ids={panel.abbreviation.ids}
                  smiles={panel.abbreviation.smiles}
                  onClose={() => setPanel(null)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </EditorProvider>
  );
}

/**
 * The plugins a catalogue suggests to read a file no plugin added reads,
 * each with Add - asking for the network as adding always does - and the
 * file read again once one is added.
 */
function AddToRead({ suggest, again }: { suggest: readonly string[]; again: () => void }) {
  const states = useReaders((s) => s.state);
  return (
    <>
      {suggest.map((id) => {
        const p = anyPluginById(id);
        if (!p) return null;
        const adding = states[id] === "adding";
        return (
          <button
            key={id}
            disabled={adding}
            onClick={(e) => {
              e.stopPropagation();
              void addPlugin(p).then(again, () => undefined);
            }}
            className="shrink-0 rounded-md border border-gh-line px-2 py-0.5 transition-colors duration-150 ease-meno hover:bg-gh-base disabled:opacity-60"
          >
            {adding ? `Adding ${p.name}…` : `Add ${p.name}`}
          </button>
        );
      })}
    </>
  );
}
