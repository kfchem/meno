import { canvasAlerts } from "./utils/alerts";
import { bondKindOf, type BondKindName } from "./utils/bondKinds";
import type { ArrowKind, ArrowWeight } from "../../../lib/chem/reactionArrow";
import { canTakeBond, valenceOrder } from "../../../lib/chem/molecule";
import { usePresentingWindow } from "../../presenting";
import { typefaceRead } from "../../fonts/typefaces";
import { Canvas } from "@react-three/fiber";
import { useEditor, useEditorStore, EditorProvider } from "./store";
import { selectedOf, selectionIsAtom } from "./store/slices/selectionSlice";
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
  PushArrows2D,
  PushDraw2D,
  Fills2D,
  Labels2D,
  LabelTyping2D,
  HoverOverlay2D,
  ChemMarks2D,
  SnapArc2D,
  Selection2D,
} from "./components";
import { ArrowPathIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chordedPress } from "./utils/press";
import { labelReachOf } from "./utils/labelHits";
import { AnimatePresence, motion } from "motion/react";
import { CANVAS_RESIZE, DURATION, EASE_SLIDE, FADE, LEAVE, RISE } from "../../theme/motion";
import { pageEvents } from "./utils/pageEvents";
import DocumentStylePanel from "./DocumentStylePanel";
import ArrowStylePanel from "./ArrowStylePanel";
import SaveAbbreviationPanel from "./SaveAbbreviationPanel";
import { abbreviationFromSelection } from "./chem/abbreviationFromSelection";
import { chainFrom } from "./components/chainFrom";
import { asCameSaid, stereoOpenSaid, structureFromSmiles, withoutStereoOpen } from "./chem/fromSmiles";
import ExportCard from "./ExportCard";
import { pdbLeavesOut } from "../../../lib/chem/pdb";
import { xyzLeavesOut } from "../../../lib/chem/xyzWriter";
import OrdersCard from "./OrdersCard";
import ProtonationCard from "./ProtonationCard";
import { addHydrogensAsChosen, addHydrogensFromDictionary, keptAsDictionary, protonationOf, useProtonationMark, type Protonation } from "./chem/protonate";
import { canAddHydrogens, canAskDictionary, canGiveOrders, estimateOrders, ordersFromDictionary, ordersFromSmiles, useBondOrders } from "./chem/bondOrders";
import { isSkeleton, partOf } from "./utils/completeness";
import { labelTextOf } from "./utils/labelTyping";
import { findOutput, outputOf } from "../../../lib/calc/asks";
import type { CalcSource } from "../../../lib/calc/output";
import { setTextTaker } from "../../views/texts";
import { setPdfTaker } from "../../views/pdfs";
import { setPictureTaker } from "../../views/pictures";
import { setFileTaker, type OpenedFile } from "../../views/files";
import TextColumn from "./TextColumn";
import ConfirmDiscard from "../../layouts/ConfirmDiscard";
import AboveGuide from "../../layouts/AboveGuide";
import NameDialog from "../../layouts/NameDialog";
import { ErrorBoundary, StoppedCard } from "../../layouts/ErrorBoundary";
import { flowOf, partsBounds, procedureParts, type FlowParts } from "./workflow/parts";
import { procedureNeeds, proceduresSaved, saveProcedure, suggestedName } from "./workflow/procedures";
import { pluginWriters, WRITERS, type Writer } from "../../../lib/io/writers";
import { anyPluginById, WRITER_PLUGINS } from "../../../lib/calc/catalog";
import { addPlugin, useReaders } from "../../../lib/calc/workers";
import { knownOfMolecules } from "./utils/written";
import { carriedOf } from "./utils/workspace";
import { runAllNote, runNote } from "./workflow/earlierRuns";
import PartMenu, { type CanvasCommand, type MenuMolecule3D, type MenuTarget } from "./PartMenu";
import { deleteFromMenu } from "./menuDelete";
import { aboutDrawing, menuTargetGone } from "./utils/menuTarget";
import { hasLonePair, tailOf } from "./utils/pushes";
import { unsureOf, type Unsure } from "./chem/drawing";
import { structureValues } from "./utils/byStructure";
import ColourCard, { type ColourTarget } from "./ColourCard";
import WordsCard from "./WordsCard";
import { cardBeside, WORDS_CARD } from "./utils/cardBeside";
import CornersCard from "./CornersCard";
import SettingsStyleAsk from "./SettingsStyleAsk";
import LargeWorkspaceAsk from "./LargeWorkspaceAsk";
import { PdfNumbersCard, PdfPagesCard } from "./PdfMakeCards";
import { combined, putBeside, savePdfFile } from "./pdfMake";
import { listItem, stylesOf, wordsSet } from "../../../lib/chem/captions";
import { WordsEditor } from "./utils/wordsEditor";
import { ringAt, ringsAmong, ringsOf } from "./utils/rings";
import { style3dOf, useEasedStyle3D, useStyle3D, useStyleNames3D } from "./style3d";
import { LARGE_ATOMS } from "./utils/largeDrawing";
import { askToOpen } from "../../layouts/commands";
import { bondsAt, chosenPath, frameOf, lookOf, poseOf, seenBounds, solidOf } from "./utils/molecule3d";
import { movingAtoms, movingFor } from "./utils/edit3d";
import { abbreviationOf } from "../../../lib/chem/abbreviations";
import { numbersItemsFor } from "./utils/atomNumbersShown";
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
  isFillKey, isFindKey,
  isSelectAllKey,
  IS_MAC,
  presentIntent,
  saveIntent,
  shortcutLabel,
  undoIntent,
} from "../../../lib/doc/shortcuts";
import { chemWorker, rolePlugin, useChem } from "../../../lib/roles/worker";
import { stopWorker } from "../../../lib/plugins/process";
import { useCheckingFiles, useDownloads } from "../../../lib/pyEnv";
import { roleOptionsRole } from "../../../lib/plugins/roles";
import { valuesOf } from "../../../lib/options";
import { useAppSettings, WINDOW_3D } from "../../../lib/settings/appSettings";
import { STEREO_LABELS } from "../../../lib/settings/stereoLabels";
import { stereoItemFor, type StereoItem } from "./utils/stereoShown";
import { CleanUpRefused, cleanUp, fragmentOf } from "./chem/cleanUp";
import { useChemMarks } from "./chem/useChemMarks";
import { exportKindOf, exportKinds, holdsOfDrawn, useFileActions, type FileActions, type Holds } from "./fileActions";
import { setSavedPathOf, setSaver } from "../../../lib/doc/savers";
import { useReadings } from "../../../lib/calc/readings";
import { useCanvasRatio } from "./canvasRatio";
import { editorLayoutOptions, startingZoom } from "./layoutOptions";
import { labelSetOf } from "../../../lib/chem/layout2d";
import { useDrawingStyle } from "./useDrawingStyle";
import { DrawnLayoutProvider } from "./components/DrawnLayout";
import { recordsOf } from "./utils/stacks";
import { startTurnOnce } from "./utils/turnOnce";
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
import { filmPlaying, playFilm } from "./components/pictureTextures";
import RenderCard from "./render/RenderCard";
import Renders2D from "./render/Renders2D";
import { renderer, startRender } from "./render/renders";
import type { Motion } from "./render/renderScene";
import { savePictureFile } from "./render/savePicture";
import TextSheets2D from "./components/TextSheets2D";
import PdfColumn from "./components/PdfColumn";
import { goBack, isBackKey, readerOf } from "./components/pdfColumnReader";
import { boxedPlaced, ordered, selectedPlaced, selectedText, selectedWords, selects } from "./utils/pdfSelection";
import { runFind } from "./components/pdfFind";
import { setCanvasPlace } from "./components/wordsDrag";
import { copyBox, putBox } from "./components/boxDrag";
import { marksBetween, textOf } from "../../../lib/pdf/text";
import { pdfRoom } from "../../../lib/pdf/layout";
import { copying, readClipboard, writeClipboard } from "../../../lib/clipboard";
import { PdfPictures } from "./components/pdfPictures";
import { FollowCover, PAGE_HTML_LAYER, PageHtmlLayer, pageHtmlLayerStyle } from "./components/coverLayer";
import { useKeepUnselected } from "./hooks/useKeepUnselected";
import { FollowStyle } from "./components/FollowStyle";
import { pointOfStyle } from "./restyle";
import CaptionTyping2D from "./components/CaptionTyping2D";
import { ChargeHolds2D } from "./components/MarkHold2D";
import Workflow2D from "./components/Workflow2D";
import PageScale from "./components/PageScale";
import GuideStructure from "./components/GuideStructure";
import { guideNotice } from "../../../lib/guide/guide";
import { selectionFrame } from "./workflow/selectionSet";
import { offeredSteps } from "./workflow/offered";
import { GAP, PORT_DOWN } from "./workflow/look";
import OpenStereo2D from "./components/OpenStereo2D";
import LinkedHover2D from "./components/LinkedHover2D";
import Ask3D from "./Ask3D";
import Cycles2D from "./components/Cycles2D";
import { cyclePointed, cycleThings, endsAt, turnCycle } from "./utils/cycles";
import { branchPath, CYCLE_RADIUS, MARGIN as CYCLE_MARGIN } from "../../../lib/chem/cycle";
import { inRow } from "./components/structureDrag";
import { pickedStructure } from "./utils/pdfStructures";
import StructureFlight from "./components/StructureFlight";
import { setStructureSay } from "./components/structureDrag";
import CoordinatesCard from "./CoordinatesCard";
import { readCoordinates, textOfPages, type CoordinateStructure, type PlacedPage } from "../../../lib/io/coordinates";
import { useTextMenu } from "../TextEditor/textMenu";
import { coordinateMolecules } from "./utils/coordinates";
import { pictureRegion, readStructure } from "./components/readStructure";
import { isFilm } from "../../../lib/picture/image";
import { placedBeside, readMarks } from "./utils/figures";
import { useNotices } from "../../notices";
import { bareAtomsOf, bareWords, blocksOf, blocksStill, boxOf, conformersOf, formulaOf, formulaPlace, likeOf, linkOf, moleculeOf, openIn, placeRow, rowFrom, takenOnPage, turnedOver, withinWindow, type Block, type Box, type Open } from "./chem/make3d";
import { centredAt, clipItems } from "./utils/copyPaste";
import { structureInOutput } from "./chem/fromClipboard";
import { leftOutSaid } from "./utils/readNotes";
import { outputKindIn } from "../../../lib/calc/probe";
import { NotRead } from "../../../lib/calc/read";
import { namedDrawn, putDownSmiles } from "./utils/quickAddSmiles";
import { addedBox } from "./store/slices/modelSlice";
import { viewPanning } from "./components/viewGoal";
import { gestureUnderWay, letLostGesturesGo, wordsUnderWay } from "./store/gesture";
import { Remake3D } from "./components/remake3d";
import { mapStanding, reactionOf } from "./chem/atomMap";
import { useAtomMaps } from "./chem/useAtomMaps";
import { turnOnto } from "./utils/align3d";
import type { ArrowFormPatch, Caption, Drawn, Molecule3D, PictureFrom, WordsFrom } from "./store/types";
import { resultKey, resultsOn } from "../../../lib/calc/results";
import { titled } from "../../../lib/calc/sources";
import { byOf, MENO, missingFor } from "./workflow/doers";
import { tableOfText } from "../../../lib/table";
import { TABLE_SET } from "./workflow/model";
import { heldOwn, holdsOf, holdsOwn } from "./workflow/entries";
import { setStructures } from "./workflow/run";
import { openSettingsAt } from "../SettingsPanel/section";
import Slides2D from "./components/Slides2D";
import Guides2D from "./components/Guides2D";
import MagnifiedMarks2D from "./components/MagnifiedMarks2D";
import FigureNotes2D from "./components/FigureNotes2D";
import { figureNoteSource, figureNotesOf, readMarksShown } from "./utils/figureNotes";
import StackChips2D from "./components/StackChips2D";
import StackSwap2D from "./components/StackSwap2D";
import Shapes2D from "./components/Shapes2D";
import Inks2D from "./components/Inks2D";
import InkWriting from "./components/InkWriting";
import PenCard from "./PenCard";
import { shapeFrom } from "./components/shapeFrom";
import { arrowFrom } from "./components/arrowFrom";
import { roundedOfBondPt, roundedPt, roundestOf } from "../../../lib/chem/shapes";
import { isBlankDocument, pdfsInRow, picturesInRow, SHAPE_PAD, textsInRow } from "./document";
import { freePlace, pageBoxes } from "./utils/freePlace";
import { sheetRoom } from "./utils/textSheets";
import { styleOf } from "../../../lib/chem/style";
import Presenter from "./presenting/Presenter";
import PresentLayer from "./presenting/PresentLayer";
import { isStandard, reshaped, slideAround, slideInView, slideOfView, STANDARD, WIDE } from "./presenting/slides";
import { selectedBox } from "./utils/extent";

function WorkspaceContent({
  active,
  tabId,
  initialPayload,
  initialFilename,
  initialKind,
  initialPath,
  officeId,
  ownTab,
  files,
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
  /** Save As and Export, and what went wrong with one: the tab's (TabFiles). */
  files: FileActions;
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
    dropping,
    openFilesAt,
    importError,
    dismissImportError,
    handleMouseDownCapture,
    clientToWorld,
    pasteTarget,
    viewMiddle,
  } = useStructureEvents(initialPayload, initialFilename, officeId == null, initialKind, initialPath);
  pdfTarget.current = pasteTarget;
  // (where what is opened onto the page goes, of what it takes up about the
  // point it is put at: in free space near the middle of the view, clear of
  // all that is there - as files opened go, utils/freePlace)
  const freeNear = useRef<(rooms: readonly { x0: number; y0: number; x1: number; y1: number }[]) => { x: number; y: number }>(() => ({ x: 0, y: 0 }));
  freeNear.current = (rooms) => {
    const st = store.getState();
    const middle = viewMiddle();
    if (!rooms.length) return middle;
    const foot = { x0: Math.min(...rooms.map((r) => r.x0)), y0: Math.min(...rooms.map((r) => r.y0)), x1: Math.max(...rooms.map((r) => r.x1)), y1: Math.max(...rooms.map((r) => r.y1)) };
    return freePlace(pageBoxes(st, styleOf(st.docStyle)), foot, middle, NOMINAL_BOND_LENGTH);
  };
  // (how files opened are put on the page: as a drop puts them, in free space near the middle of the view - this render's)
  const openedFiles = useRef<(files: OpenedFile[]) => Promise<void>>(async () => {});
  openedFiles.current = async (opened) => {
    // (opened onto a page with nothing on it: Save suggests the first file's name beside it, as for a file opened on a canvas of its own)
    const blank = isBlankDocument(store.getState().writing());
    for (const [i, f] of opened.entries()) {
      const put = () => openFilesAt([new File([f.bytes as BlobPart], f.name)], viewMiddle(), () => void put(), { path: f.path, free: true });
      if ((await put()) && blank && i === 0) store.getState().markOpenedOver(f.path ?? f.name);
    }
  };
  useOfficeLink(officeId);

  const onCreated = useCanvasSetup(camRef, domRef);

  // (Save As on the menu, and Export: Save itself, and Ctrl/Cmd+S, are the tab's - TabFiles)
  const { saveAs } = files;
  // the plugins that fill the chemistry roles: their marks on the structure
  // and R/S on request; and clean-up, by Meno's own layout engine (chem/cleanUp)
  const store = useEditorStore();
  // (how finely the canvas is drawn, as Settings has it: a change shows at once)
  const canvasRatio = useCanvasRatio();
  // (no menu over a talk)
  const talking = useEditor((s) => s.presenting != null);
  // (a structure selected: a guide's step waiting for it goes on)
  useEffect(() => store.subscribe((s, prev) => void (s.sel.atoms.size && !prev.sel.atoms.size && guideNotice("selected"))), [store]);
  // (a tab's own, unless it is a document's, holds texts opened while it is in front: ui/views/texts)
  useEffect(
    () =>
      ownTab && officeId == null
        ? setTextTaker(tabId, (texts) => {
            const rooms = textsInRow(texts, { x: 0, y: 0 }, store.getState(), pointOfStyle(store.getState().docStyle)).flatMap((t) => sheetRoom(t) ?? []);
            store.getState().addTexts(texts, freeNear.current(rooms));
          })
        : undefined,
    [ownTab, officeId, tabId, store],
  );
  // (and PDFs and pictures opened, on its page where it is looked at: docs/PDF.md)
  useEffect(
    () => (ownTab && officeId == null ? setPdfTaker(tabId, (pdfs) => store.getState().addPdfs(pdfs, freeNear.current(pdfsInRow(pdfs, { x: 0, y: 0 }, pointOfStyle(store.getState().docStyle)).map(pdfRoom)))) : undefined),
    [ownTab, officeId, tabId, store],
  );
  useEffect(
    () =>
      ownTab && officeId == null
        ? setPictureTaker(tabId, (pictures) => {
            const rooms = picturesInRow(pictures, { x: 0, y: 0 }, pointOfStyle(store.getState().docStyle)).map((p) => ({ x0: p.x - p.w / 2, y0: p.y - p.h / 2, x1: p.x + p.w / 2, y1: p.y + p.h / 2 }));
            void store.getState().addPictures(pictures, freeNear.current(rooms));
          })
        : undefined,
    [ownTab, officeId, tabId, store],
  );
  // (and structures' files and calculations' outputs opened, as a drop on it puts them: ui/views/files)
  useEffect(
    () => (ownTab && officeId == null ? setFileTaker(tabId, (files) => void openedFiles.current(files)) : undefined),
    [ownTab, officeId, tabId],
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
  // (for pictures made of the drawing: R, S, E and Z as the canvas shows them)
  useEffect(() => store.getState().setShownMarks(marks), [marks, store]);
  // (what the drawing says of its stereochemistry only by luck, marked - worked out here, by Meno itself)
  const unsureKept = useRef(structureValues<Unsure>());
  const unsure = useMemo(() => unsureOf(model, unsureKept.current), [model]);
  // (drawn only on what is not said to be checked: utils/figureNotes)
  const readUnsure = useMemo(() => readMarksShown(model, readMarks(model)), [model]);
  const procedures = useAppSettings((s) => s.procedures);
  const chem = useChem();
  // (a plugin's files besides its packages, as they come while it is set up)
  const chemShare = useDownloads((s) => (chem.state === "setting-up" ? s[chem.id] : undefined));
  // (a plugin's kept files read through for their fingerprints, where that takes more than a moment: a model's weights - said, as setting up is)
  const checkingFiles = useCheckingFiles((s) => Object.values(s)[0]);
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
            // (what it left as drawn, named - the rest laid out: its own words; anything else, a failure)
            e instanceof CleanUpRefused ? e.message : `Clean-up failed: ${e instanceof Error ? e.message : String(e)}`,
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
  // a talk given from the slide that is most nearly what is seen (docs/PRESENTING.md)
  const presentHere = useCallback(() => {
    const st = store.getState();
    const seen = viewBox();
    st.present(seen ? Math.max(0, slideInView(st.slides, seen)) : 0);
  }, [store, viewBox]);
  // Structures read from coordinates - pasted, or selected in a PDF or a text (lib/io/coordinates) - shown before they are
  // placed in 3D, where they were asked for, as a set named for where they came from (`named`: the PDF's name and pages, the
  // text's, or a paste's); a paste's text may go on the page as words instead (`asText`)
  const [coords, setCoords] = useState<{ structures: CoordinateStructure[]; at: { x: number; y: number }; source: string; named: string; asText?: () => void } | null>(null);
  // Structures made in 3D (chem/make3d): asked first about what their
  // drawing leaves open, then their conformers made and risen out of them
  const [ask3d, setAsk3d] = useState<{ blocks: Block[]; open: Open[]; replacing?: Molecule3D } | null>(null);
  // (the question goes with its structure: an undo taking it away shuts it,
  // as a colour card or a panel goes with what it is for)
  useEffect(() => {
    if (ask3d && !blocksStill(ask3d.blocks, model)) setAsk3d(null);
  }, [ask3d, model]);
  // (what the plugin is doing for it, said meanwhile)
  const [working3d, setWorking3d] = useState<string | null>(null);
  // (structures being made in 3D: since when, and how to stop it - the plugin's worker stopped, nothing added)
  const [making3d, setMaking3d] = useState<number | null>(null);
  const stop3d = useRef<(() => void) | null>(null);
  // A drawn reaction's atom map, made off the drawing's thread - said
  // meanwhile, and stoppable - and kept on its arrow (chem/useAtomMaps)
  const atomMaps = useAtomMaps(store, setChemError);
  // a molecule's bond orders sought from its shape as it comes in, where they
  // are unknown; and those given from a SMILES, asked for on its ligand
  useBondOrders();
  const [givingOrders, setGivingOrders] = useState<{ id: number; atom: number | null } | null>(null);
  // its ligand's hydrogens, the ones its file leaves out, added as the chemist chooses how it is protonated - as one undo step
  const [protonating, setProtonating] = useState<Protonation | null>(null);
  // (each time it is asked for, a card of its own: nothing chosen for one molecule carried to another)
  const [protonatingTurn, setProtonatingTurn] = useState(0);
  // (while a card's hydrogens are being added, no other card: those would be added after it had gone)
  const [addingHydrogens, setAddingHydrogens] = useState(false);
  const adding = useRef(false);
  useEffect(() => {
    adding.current = addingHydrogens;
  }, [addingHydrogens]);
  const markProtonated = useCallback((atoms: number[] | null) => useProtonationMark.getState().mark(atoms && protonating ? { id: protonating.id, atoms } : null), [protonating]);
  // a PDB entry's residues given their orders from the wwPDB's dictionary - as one undo step
  const lookUpComponents = useCallback(
    async (id: number) => {
      setWorking3d("Looking up chemical components…");
      setChemError(null);
      try {
        const r = await ordersFromDictionary(store, id);
        if (r && !r.given) setChemError("No residue of this entry is in the CCD as the entry draws it.");
      } catch (e: unknown) {
        setChemError(`The CCD could not be looked up: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setWorking3d(null);
      }
    },
    [store],
  );
  const build3d = useCallback(
    async (blocks: Block[], isomers: "one" | "all", replacing?: Molecule3D) => {
      setWorking3d("Making the 3D structure…");
      setChemError(null);
      // (stopped: the worker making them stopped - started afresh when next asked - and nothing added)
      let stopped = false;
      const plugin = rolePlugin("conformers");
      stop3d.current = () => {
        stopped = true;
        if (plugin) void stopWorker(plugin.id, `${plugin.name} was stopped while it made a 3D structure`);
      };
      setMaking3d(Date.now());
      try {
        const chem = await chemWorker("conformers");
        // (the options the plugin takes for the role, as chosen in Settings, Chemistry, on its 3D card)
        const declared = rolePlugin("conformers")?.roleOptions.conformers ?? [];
        const options = valuesOf(declared, useAppSettings.getState().options[roleOptionsRole("conformers")]);
        const made: Parameters<ReturnType<typeof store.getState>["riseMolecules3d"]>[0] = [];
        let allInView = true;
        // (where the rows made lie: shown, where they are not seen whole - utils/viewShow)
        let made3d: { x0: number; x1: number; y0: number; y1: number } | null = null;
        // (what they keep clear of: the molecules in 3D there already, as they are seen now - and each row made)
        const look3d = style3dOf(store.getState());
        const st = store.getState();
        const solids = st.molecules3d.map((m) => {
          const b = seenBounds(poseOf(m, solidOf(m, look3d), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]));
          return { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY };
        });
        for (const block of blocks) {
          if (stopped) return;
          // (within the window Settings gives: a workflow's conformer step keeps every one - make3d withinWindow)
          const window3d = useAppSettings.getState().chemistry.window3d ?? WINDOW_3D;
          const isomersMade = (await conformersOf(chem, block, isomers, options)).map((c) => withinWindow(c, window3d));
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
          if ("box" in row) {
            solids.push(row.box);
            made3d = made3d ? { x0: Math.min(made3d.x0, row.box.x0), x1: Math.max(made3d.x1, row.box.x1), y0: Math.min(made3d.y0, row.box.y0), y1: Math.max(made3d.y1, row.box.y1) } : row.box;
          }
          allInView &&= row.inView;
          ms.forEach((m, i) =>
            made.push({ m: { ...m, at: row.at[i] }, turn: turned[i].turn, from: turned[i].start, flat: turned[i].flat }),
          );
        }
        if (stopped) return;
        // (the structure changed meanwhile - an undo took it away - nothing is added)
        if (!blocksStill(blocks, store.getState().model)) {
          setChemError("The drawing changed while its 3D structure was being made, so none was added.");
          return;
        }
        store.getState().riseMolecules3d(made, replacing ? [replacing.id] : []);
        // (with no room for them in view, the view goes to them - along, or out as little as needed)
        if (!allInView && made3d) store.getState().requestShow(made3d);
      } catch (e: unknown) {
        if (!stopped) setChemError(`No 3D structure could be made: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        stop3d.current = null;
        setMaking3d(null);
        setWorking3d(null);
      }
    },
    [store, viewBox, camRef],
  );
  const make3d = useCallback(
    async (around: Iterable<number>, replacing?: Molecule3D) => {
      // (made again: what the drawing leaves open, as the one before has it)
      const model = store.getState().model;
      const blocks = blocksOf(model, around).map((b) =>
        replacing ? { ...b, like: likeOf(b, replacing) } : b,
      );
      // (a bare atom - Na+, Cl- - left out, and the chemist told: alone, that it has none; beside others made, which)
      const bare = bareAtomsOf(model, around);
      if (!blocks.length) {
        if (bare.length) setChemError(bareWords(bare, false));
        return;
      }
      setChemError(null);
      if (bare.length) useNotices.getState().show({ id: "bare-3d", title: "3D structure", text: bareWords(bare, true) });
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
        // (laid out in the drawing's style, as Clean-up lays it out)
        const style = styleOf(st.docStyle);
        const { model: formula, link, ordersUnknown } = await formulaOf(await chemWorker("drawing"), mol, st.frames3d[id] ?? 0, style);
        const placed = centredAt(formula, formulaPlace(mol, formula, style3dOf(store.getState())));
        store.getState().drawFormula3d(id, placed, link);
        // (its bonds drawn single where their orders could not be had: said)
        if (ordersUnknown) setChemError("Bond orders unknown: the formula is drawn with every bond single.");
        // (shown: the view moved to take it in, where it is not seen whole - utils/viewShow)
        const box = addedBox(Number.NEGATIVE_INFINITY, placed);
        if (box) store.getState().requestShow(box);
      } catch (e: unknown) {
        setChemError(`The formula could not be drawn: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setWorking3d(null);
      }
    },
    [store],
  );
  // A molecule in 3D turned to lie as its drawing does, as it did as it rose
  const turnLikeDrawing = useCallback(
    (id: number) => {
      const st = store.getState();
      const mol = st.molecules3d.find((x) => x.id === id);
      if (!mol?.drawnFrom) return;
      const solid = solidOf(mol, style3dOf(store.getState()));
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
      if (kind === "atom" || kind === "ring") return id;
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
  // a colour card opened from a menu, where the menu was (ColourCard)
  // (a card for a new PDF made from one held: its pages numbered, or put in order - docs/PDF.md, *A new PDF from pages*)
  const [pdfCard, setPdfCard] = useState<{ kind: "numbers" | "pages"; id: number; x: number; y: number; within: { width: number; height: number } } | null>(null);
  const [colourCard, setColourCard] = useState<{ target: ColourTarget; x: number; y: number; within: { width: number; height: number } } | null>(null);
  // the card of sizes for words on the page, where their menu was (docs/EDITOR-2D.md, *Text*)
  const [wordsCard, setWordsCard] = useState<{ id: number; x: number; y: number; within: { width: number; height: number } } | null>(null);
  // the card of a rectangle's corners, where its menu was (docs/PRESENTING.md, *Shapes*)
  const [cornersCard, setCornersCard] = useState<{ id: number; x: number; y: number; within: { width: number; height: number } } | null>(null);
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
  const copyWords = useCallback(
    () =>
      copying(async () => {
        const st = store.getState();
        const sel = st.pdfSel;
        const pdf = selects(sel) ? st.pdfs.find((p) => p.id === sel.id) : undefined;
        if (!sel || !pdf) return;
        const words = await selectedText(sel, pdf);
        if (words) await writeClipboard([{ flavor: "text", text: words }]);
      }),
    [store],
  );
  // where words taken out of a PDF are let go (components/wordsDrag)
  useEffect(() => {
    setCanvasPlace(store, { canvas: () => domRef.current, worldAt: (x, y) => clientToWorld(x, y) });
    // (and why a structure picked from a PDF was not taken, said where the chemistry's notices are: components/structureDrag)
    setStructureSay(store, setChemError);
    return () => {
      setCanvasPlace(store, null);
      setStructureSay(store, null);
    };
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
      kind: menuAsk.kind ?? "pdf",
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
  /** The structures coordinates on a PDF's pages hold - read where each word lies - shown before they are placed; none, said so. */
  const structuresFrom = async (pages: Promise<PlacedPage[]>, source: string, from: number, to: number, at: { x: number; y: number }) => {
    const structures = readCoordinates(textOfPages(await pages));
    const named = `${source}, ${from === to ? `p. ${from + 1}` : `pp. ${from + 1}\u2013${to + 1}`}`;
    if (structures.length) setCoords({ structures, at, source, named });
    else setChemError("There are no coordinates in what is selected.");
  };
  /**
   * A calculation's output in a text - pasted whole in Quick Add, or a
   * text's chosen from its menu - read as one opened is, by its reader
   * (chem/fromClipboard `structureInOutput`), and put down at `at`, as a
   * paste of it is; what a plugin not added reads said so, naming it.
   */
  const putOutput = async (text: string, source: string, at: { x: number; y: number }) => {
    const kind = outputKindIn(text);
    if (!kind) return;
    try {
      const found = await structureInOutput(text, kind, source);
      if (!found || (!found.atoms.length && !found.molecules3d?.length)) return void setChemError(`Nothing in ${source} reads as a structure.`);
      store.getState().pasteModel(centredAt(found, at));
      const said = leftOutSaid(found.leftOut, "copy");
      if (said) setChemError(said);
    } catch (e) {
      // (what a plugin not added reads: said as Open says it, which names it already - "Pasted text (ORCA output): ... would read it.")
      setChemError(e instanceof NotRead ? e.message : `${source} could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  // (3D structures, from the menu on a text in the column: shown here, while this workspace is in front)
  useEffect(() => {
    if (!active) return;
    useTextMenu.getState().takeStructures((structures, source) => setCoords({ structures, at: viewMiddle(), source, named: source }));
    useTextMenu.getState().takeOutput((text, source) => void putOutput(text, source, viewMiddle()));
    return () => {
      useTextMenu.getState().takeStructures(null);
      useTextMenu.getState().takeOutput(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const clip = useClipboardActions(store, setChemError, openFilesAt, (structures, at) =>
    setCoords({
      structures,
      at,
      source: "Pasted text",
      named: "Pasted structures",
      asText: () => {
        void readClipboard(["text"]).then((t) => t?.text && store.getState().addCaption(t.text.trim(), at.x, at.y));
      },
    }),
  );
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
      const talk = presentIntent(e);
      if (talk && st.slides.length && !busy && !st.presenting) {
        // a talk given from the slides: from the first, or from the one in view
        e.preventDefault();
        if (talk === "first") st.present(0);
        else presentHere();
      } else if (isCleanUpKey(e)) {
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
      } else if (isDeleteKey(e) && !busy && st.hoveredPush != null && st.pushes.some((p) => p.id === st.hoveredPush)) {
        e.preventDefault();
        st.removePush(st.hoveredPush);
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
      } else if (isDeleteKey(e) && !busy && st.hoveredSlide != null && st.slides.some((x) => x.id === st.hoveredSlide)) {
        // a slide's edge or number under the pointer, likewise (docs/PRESENTING.md)
        e.preventDefault();
        st.removeSlide(st.hoveredSlide);
      } else if (isDeleteKey(e) && !busy && st.hoveredInk != null && st.inks.some((k) => k.id === st.hoveredInk)) {
        // writing by hand under the pointer, likewise (docs/PRESENTING.md, *Handwriting*)
        e.preventDefault();
        st.removeInk(st.hoveredInk);
      } else if (isDeleteKey(e) && !busy && st.hoveredShape != null && st.shapes.some((x) => x.id === st.hoveredShape)) {
        // a shape under the pointer, likewise (docs/PRESENTING.md, *Shapes*)
        e.preventDefault();
        st.removeShape(st.hoveredShape);
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
      } else if (chargeStep(e) && sel.atoms.size > 0 && !busy) {
        // (on the selection's atoms, once there is one, as the other keys act on it: one step)
        e.preventDefault();
        st.stepCharges(sel.atoms, chargeStep(e) as 1 | -1);
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
      } else if (isFillKey(e) && st.textsOpen && (st.pdfShown != null || st.textShown != null)) {
        // the PDF or text in the column filling the workspace, or back beside the canvas
        e.preventDefault();
        st.setColumnFilled(!st.columnFilled);
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
      } else if (isDeselectKey(e) && st.columnFilled && !menu) {
        // (then Esc takes the column filling the workspace back beside the canvas)
        st.setColumnFilled(false);
      } else if (isDeselectKey(e) && (selected || st.chosen3d || st.pdfSel || st.pdfBox) && !busy && !menu) {
        // (Esc with the menu open closes the menu only)
        st.clearSel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, store, runCleanUp, hoveredPart, structureAt, deletePart, chargeAtom, menu, clip, pasteTarget, requestFit, openFind, copyWords, presentHere]);
  // The same, from the mouse alone: a menu at the pointer on a right-click.
  const closeMenu = useCallback(() => setMenu(null), []);
  // (nor a card a menu opened - a colour's, a size's - left over it, nor a
  // question asked over the canvas: a procedure's name, a ligand's bond orders)
  useEffect(() => {
    if (!talking) return;
    setMenu(null);
    setColourCard(null);
    setWordsCard(null);
    setCornersCard(null);
    setNaming(null);
    setGivingOrders(null);
    // (not while its hydrogens are being added: they would be added after it had gone)
    if (!adding.current) setProtonating(null);
  }, [talking]);
  // (a label begun - a letter typed over the atom right-clicked - shuts the menu: the label is
  // being written, and the menu would stay open over it, its keys and the label's at odds)
  const labelBegun = useEditor((s) => s.labelEdit.active);
  useEffect(() => {
    if (labelBegun) setMenu(null);
  }, [labelBegun]);
  // and what a double-click on empty space can put down there (QuickAdd)
  const quickAdd = useEditor((s) => s.quickAdd);
  // the pen's card, while writing with a mouse or a trackpad (docs/PRESENTING.md, *Handwriting*)
  const inkMode = useEditor((s) => s.inkMode);
  const endInk = useCallback(() => store.getState().setInkMode(null), [store]);
  const askDeleteStep = useEditor((s) => s.askDeleteStep);
  const askDeleteSet = useEditor((s) => s.askDeleteSet);
  const setsNow = useEditor((s) => s.sets);
  // An undo or a redo that would take away a running step is held, and asks
  // first what deleting it asks (heard before the app's own undo, App.tsx)
  const askUndo = useEditor((s) => s.askUndo);
  useEffect(() => {
    if (!active) return;
    // (not in a talk, where Escape ends the talk: a pen's stroke there is let be)
    const escape = () => {
      if (!store.getState().presenting) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    };
    const onKey = (e: KeyboardEvent) => {
      // (words typed on the page: their field's undo is theirs - undoIntent leaves it the keys)
      const intent = undoIntent(e);
      if (!intent) return;
      const s = store.getState();
      // (an undo come from elsewhere while they are typed: nothing, never the document's under them;
      // a gesture under way - a chain, a shape, a drag: let go as Escape lets it go, by its own Escape, and nothing more)
      const words = wordsUnderWay(s);
      if (words || gestureUnderWay(s) || viewPanning()) {
        e.preventDefault();
        e.stopPropagation();
        if (!words) escape();
        return;
      }
      if (!s.holdUndo(intent)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    // (a gesture lost - the window left, the pointer taken: let go, its flags with it)
    const lost = letLostGesturesGo(window, () => store.getState(), escape);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      lost();
    };
  }, [active, store]);
  const closeQuickAdd = useCallback(() => store.getState().setQuickAdd(null), [store]);
  // a molecule in 3D right-clicked: what its menu does to it
  const molecules3d = useEditor((s) => s.molecules3d);
  const chosen3d = useEditor((s) => s.chosen3d);
  // (its molecules going over to a change of the workspace's styles in 3D, not jumping - at once in a very large drawing)
  const target3d = useStyle3D();
  const atoms3d = useEditor((s) => s.molecules3d.reduce((n, m) => n + m.atoms.length, 0));
  const style3d = useEasedStyle3D(target3d, atoms3d > LARGE_ATOMS);
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
  // (a record of a stack of drawings out of sight is still the drawing it was made from: utils/stacks)
  const menuLink = menuMolecule ? linkOf(menuMolecule, store.getState().fullModel) : null;
  // a record of a stack of drawings right-clicked: its stack laid out as a grid, or stacked again
  const menuAtom = menu && (menu.kind === "atom" || menu.kind === "bond") && menu.id != null ? structureAt(menu.kind, menu.id) : null;
  const menuStack = menuAtom != null ? model.atoms.find((a) => a.id === menuAtom)?.stack : undefined;
  const menuRecords =
    menuStack && recordsOf(store.getState().fullModel, menuStack.id).length > 1
      ? {
          spread: !!menuStack.spread,
          run: () => (menuStack.spread ? store.getState().gatherRecords(menuStack.id, menuStack.record) : store.getState().spreadRecords(menuStack.id)),
        }
      : undefined;
  const menuPart = menuMolecule ? partOf(menuMolecule, menu?.atom ?? null) : null;
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
  // (how large the molecules right-clicked are shown - a selection's, those in it; the first's said: docs/WORKSPACE.md, *Magnified display*)
  const { sel3d: menuSel3d, sel: menuSel } = store.getState();
  const magnifyIds = menu?.kind === "molecule3d" && menuMolecule ? (menuSel3d.has(menuMolecule.id) ? [...menuSel3d] : [menuMolecule.id]) : menu?.selection === "here" ? [...menuSel3d] : [];
  // (and structures in 2D: the one right-clicked, or those the selection holds)
  const magnifyAtoms = (menu?.kind === "atom" || menu?.kind === "bond") && menuAtom != null && menu.selection !== "here" ? [menuAtom] : menu?.selection === "here" ? [...menuSel.atoms] : [];
  const magnifyFirst = molecules3d.find((m) => m.id === magnifyIds[0]) ?? model.atoms.find((a) => a.id === magnifyAtoms[0]);
  const menuMagnify = magnifyFirst ? { now: magnifyFirst.magnified ?? 1, set: (k: number) => store.getState().setMagnified(magnifyAtoms, magnifyIds, k) } : undefined;
  const menu3d: MenuMolecule3D | undefined = menuMolecule
    ? {
        otherLook: (() => {
          const other = lookOf(menuMolecule) === "primary" ? "secondary" : "primary";
          // (sticks alone drawn as balls and sticks are, in the icon)
          return { name: styleNames3d[other], atoms: style3d[other].atoms === "space" ? ("space" as const) : ("balls" as const), run: () => store.getState().switchLook3d(menuMolecule.id) };
        })(),
        chosen: chosen3d?.id === menuMolecule.id ? (chosenPath(menuMolecule, chosen3d)?.length ?? 0) : 0,
        onMeasure: () => store.getState().measureChosen3d(),
        ...(chosenSettable ? { onSetChosen: () => store.getState().setChosen3d() } : {}),
        onResetTurn: () => store.getState().resetTurn3d(menuMolecule.id),
        // (with the others selected with it, where it is among them: each about its own centre)
        onTurnOnce: () => {
          const { sel3d } = store.getState();
          startTurnOnce(store, sel3d.has(menuMolecule.id) ? [...sel3d] : [menuMolecule.id]);
        },
        // (one of a stack: laid out as a grid, or stacked again - utils/stacks)
        ...(menuMolecule.stack && molecules3d.filter((m) => m.stack?.id === menuMolecule.stack!.id).length > 1
          ? {
              stack: {
                spread: !!menuMolecule.stack.spread,
                run: () =>
                  menuMolecule.stack!.spread
                    ? store.getState().gatherStack(menuMolecule.stack!.id, menuMolecule.id)
                    : store.getState().spreadStack(menuMolecule.stack!.id),
              },
            }
          : {}),
        onCut: () => void clip.cut(menuMolecule.id),
        onCopy: () => void clip.copy(menuMolecule.id),
        ...(menuLink === "live" || menuLink === "changed" ? { onTurnLikeDrawing: () => turnLikeDrawing(menuMolecule.id) } : {}),
        ...(menuLink === "changed" ? { onRemake: () => remake3d(menuMolecule.id) } : {}),
        ...(menuLink == null || menuLink === "gone" ? { onDrawFormula: () => void drawFormula(menuMolecule.id) } : {}),
        // (its bond orders given, its hydrogens added: its ligand's, for a PDB entry - utils/completeness)
        ...(canAskDictionary(menuMolecule) ? { onOrdersFromDictionary: () => void lookUpComponents(menuMolecule.id) } : {}),
        ...(canGiveOrders(menuMolecule, menuPart) ? { onOrdersFromSmiles: () => setGivingOrders({ id: menuMolecule.id, atom: menu?.atom ?? null }) } : {}),
        ...(canGiveOrders(menuMolecule, menuPart)
          ? {
              onEstimateOrders: () => {
                setChemError(null);
                try {
                  estimateOrders(store, menuMolecule.id, menu?.atom ?? null);
                } catch (e: unknown) {
                  setChemError(e instanceof Error ? e.message : String(e));
                }
              },
            }
          : {}),
        ...(canAddHydrogens(menuMolecule, menuPart) && !addingHydrogens
          ? {
              onAddHydrogens: () => {
                setProtonatingTurn((n) => n + 1);
                setProtonating(protonationOf(menuMolecule, menu?.atom ?? null));
              },
            }
          : {}),
        // (a skeleton that has no hydrogens to add - carbon dioxide's atoms, say, where Meno could not tell: whole, as the chemist says; never a PDB entry's chains)
        ...(!menuMolecule.biopolymer && isSkeleton(menuMolecule)
          ? { onWholeWithoutH: () => store.getState().changeMolecule3d("complete without hydrogens", menuMolecule.id, (m) => ({ ...m, wholeWithoutH: true })) }
          : {}),
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
  // (a change to the drawing: a menu about the drawing closed, what it was about may be gone - no other, a step's say)
  useEffect(() => setMenu((m) => (m && aboutDrawing(m) ? null : m)), [model]);
  // (what it was about gone otherwise - words, a picture, a PDF undone away while it is open: no menu left over nothing)
  useEffect(() => {
    if (!menu?.kind) return;
    return store.subscribe((s) => {
      if (menuTargetGone(menu, s)) setMenu(null);
    });
  }, [menu, store]);
  // the selection as a box would take it, where it holds whole structures or molecules in 3D - round its labels as they are drawn, as Workflow2D shows it
  const selectionAsSet = () => {
    const st = store.getState();
    return selectionFrame(st.model, st.sel.atoms, st.molecules3d, st.sel3d, style3dOf(store.getState()), st.turns3d, st.frames3d, labelReachOf(store));
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
  // The buttons held, as the last pointer event had them: a right press
  // while the primary button is held - an atom, the selection or the view
  // being dragged - comes as a move with both held (a chorded press), and
  // opens no menu: it would be the menu of what lies under what is dragged,
  // and letting go over it would choose one of its items.
  const buttonsHeld = useRef(0);
  useEffect(() => {
    const note = (e: PointerEvent) => (buttonsHeld.current = e.buttons);
    for (const type of ["pointerdown", "pointermove", "pointerup"] as const) window.addEventListener(type, note, true);
    return () => {
      for (const type of ["pointerdown", "pointermove", "pointerup"] as const) window.removeEventListener(type, note, true);
    };
  }, []);
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
    // (none in the middle of a drag: pressed with the primary button held)
    if (chordedPress(e.buttons, buttonsHeld.current)) return;
    const { hovered, hoveredArrow, arrows, hoveredPlus, pluses, hoveredCaption, captions, hovered3d, sel3d, hoveredMeasure3d, hoveredAtom3d } = store.getState();
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
        // (the atom under the pointer: which of its ligands the menu is about)
        ...(hoveredAtom3d?.id === hovered3d.id && hoveredAtom3d.atom != null ? { atom: hoveredAtom3d.atom } : {}),
        ...place,
      });
      return;
    }
    // on an electron-pushing arrow, and nothing else: its menu
    const { hoveredPush, pushes } = store.getState();
    if (!kind && hoveredPush != null && pushes.some((p) => p.id === hoveredPush)) {
      open({ kind: "push", id: hoveredPush, selection: "none", ...place });
      return;
    }
    // on an arrow, and nothing else - or selected alone - the arrow's menu
    const { selArrows, selPluses } = store.getState();
    const arrowWithMore = selectedOf({ ...store.getState(), selArrows: new Set() }).any || selArrows.size > 1;
    if (!kind && hoveredArrow != null && arrows.some((a) => a.id === hoveredArrow) && !(selArrows.has(hoveredArrow) && arrowWithMore)) {
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
      return selectedOf({ ...s, selCaptions: new Set() }).any || s.selCaptions.size > 1;
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
      return selectedOf({ ...s, selTexts: new Set() }).any || selTexts.size > 1;
    })();
    if (!kind && hoveredText != null && texts.some((t) => t.id === hoveredText && t.at) && !(selTexts.has(hoveredText) && withOthers)) {
      const target: MenuTarget = { kind: "text", id: hoveredText, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise writing by hand, unless it is selected with more (docs/PRESENTING.md, *Handwriting*)
    const { hoveredInk, inks, selInks } = store.getState();
    const inkWithMore = (() => {
      const s = store.getState();
      return selectedOf({ ...s, selInks: new Set() }).any || selInks.size > 1;
    })();
    if (!kind && hoveredInk != null && inks.some((k) => k.id === hoveredInk) && !(selInks.has(hoveredInk) && inkWithMore)) {
      const target: MenuTarget = { kind: "ink", id: hoveredInk, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a catalytic cycle, on its line, unless it is selected with more (lib/chem/cycle)
    const { hoveredCycle, cycles, selCycles } = store.getState();
    const cycleWithMore = (() => {
      const s = store.getState();
      return selectedOf({ ...s, selCycles: new Set() }).any || selCycles.size > 1;
    })();
    if (!kind && hoveredCycle != null && cycles.some((x) => x.id === hoveredCycle) && !(selCycles.has(hoveredCycle) && cycleWithMore)) {
      const target: MenuTarget = { kind: "cycle", id: hoveredCycle, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a shape, unless it is selected with more (docs/PRESENTING.md, *Shapes*)
    const { hoveredShape, shapes, selShapes } = store.getState();
    const shapeWithMore = (() => {
      const s = store.getState();
      return selectedOf({ ...s, selShapes: new Set() }).any || selShapes.size > 1;
    })();
    if (!kind && hoveredShape != null && shapes.some((x) => x.id === hoveredShape) && !(selShapes.has(hoveredShape) && shapeWithMore)) {
      const target: MenuTarget = { kind: "shape", id: hoveredShape, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a picture, unless it is selected with more (docs/PDF.md, *A picture*)
    const { hoveredPicture, pictures, selPictures } = store.getState();
    const withMore = (() => {
      const s = store.getState();
      return selectedOf({ ...s, selPictures: new Set() }).any || selPictures.size > 1;
    })();
    if (!kind && hoveredPicture != null && pictures.some((p) => p.id === hoveredPicture) && !(selPictures.has(hoveredPicture) && withMore)) {
      const target: MenuTarget = { kind: "picture", id: hoveredPicture, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a PDF, unless it is selected with more (docs/PDF.md)
    const { hoveredPdf, pdfs, selPdfs } = store.getState();
    const pdfWithMore = (() => {
      const s = store.getState();
      return selectedOf({ ...s, selPdfs: new Set() }).any || selPdfs.size > 1;
    })();
    if (!kind && hoveredPdf != null && pdfs.some((p) => p.id === hoveredPdf) && !(selPdfs.has(hoveredPdf) && pdfWithMore)) {
      const target: MenuTarget = { kind: "pdf", id: hoveredPdf, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a slide's edge or number, unless it is selected with more (docs/PRESENTING.md)
    const { hoveredSlide, slides, selSlides } = store.getState();
    const slideWithMore = (() => {
      const s = store.getState();
      return selectedOf({ ...s, selSlides: new Set() }).any || selSlides.size > 1;
    })();
    if (!kind && hoveredSlide != null && slides.some((x) => x.id === hoveredSlide) && !(selSlides.has(hoveredSlide) && slideWithMore)) {
      const target: MenuTarget = { kind: "slide", id: hoveredSlide, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a "+", unless it is selected with more
    const plusWithMore = selectedOf({ ...store.getState(), selPluses: new Set() }).any || selPluses.size > 1;
    if (!kind && hoveredPlus != null && pluses.some((p) => p.id === hoveredPlus) && !(selPluses.has(hoveredPlus) && plusWithMore)) {
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
    // inside a ring, with nothing selected: the ring's own menu (its colour)
    if (!part && !selected) {
      const m = store.getState().model;
      const ring = ringAt(m, place.at);
      if (ring) {
        open({ kind: "ring", id: Number(ring.split("-")[0]), ring, selection: "none", ...place });
        return;
      }
    }
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
  // R and S, E and Z shown on what was asked (utils/stereoShown) - or hidden; shown on the drawing, what labels them set up
  // now, if it has not been
  const showStereo = (item: StereoItem) => {
    store.getState().setStereoShown(item.of, item.show);
    if (!item.show || (!item.of.atoms.length && !item.of.bonds.length)) return;
    setChemError(null);
    chemWorker("checks").catch((e: unknown) => {
      setChemError(`${STEREO_LABELS.failed}: ${e instanceof Error ? e.message : String(e)}`);
    });
  };

  // (each in a line of its own, dismissed by itself: utils/alerts)
  const alerts = canvasAlerts({
    import: importError ? { text: importError.text, dismiss: dismissImportError } : null,
    files: { text: files.error, dismiss: files.dismissError },
    chem: { text: chemError, dismiss: () => setChemError(null) },
  });
  // Where the view starts, before there is anything to fit
  const style = useDrawingStyle();
  // words on the page: a size of their own, or the labels'; a box keeping its top as its lines change (docs/EDITOR-2D.md, *Text*)
  const layoutOpts = useMemo(() => editorLayoutOptions(style), [style]);
  const keepTop = (c: Caption, next: Partial<Pick<Caption, "text" | "size" | "font" | "lines" | "marks">>): { y?: number } => {
    if (!c.width || c.arrow != null) return {};
    const set = labelSetOf(layoutOpts);
    const top = c.y + wordsSet(c, layoutOpts, set).halfH;
    const after = { ...c, ...next };
    return { y: top - wordsSet(after, layoutOpts, set).halfH };
  };
  const sizeWords = (id: number, pt: number | null) => {
    const st = store.getState();
    const c = st.captions.find((x) => x.id === id);
    if (c) st.updateCaption(id, { size: pt, ...keepTop(c, { size: pt ?? undefined }) });
  };
  // (the card of how words are set put beside them, clear of them, as they are seen on the canvas - from where the menu was, by the view's scale - so that what it changes is seen changing)
  const wordsCardPlace = (c: Caption, menu: { x: number; y: number; at: { x: number; y: number }; within: { width: number; height: number } }) => {
    const a = clientToWorld(0, 0);
    const b = clientToWorld(100, 100);
    if (!a || !b || b.x === a.x || b.y === a.y) return { x: menu.x, y: menu.y };
    const kx = 100 / (b.x - a.x);
    const ky = 100 / (a.y - b.y);
    const w = wordsSet(c, layoutOpts, labelSetOf(layoutOpts));
    const target = { left: menu.x + (c.x - w.halfW - menu.at.x) * kx, top: menu.y - (c.y + w.halfH - menu.at.y) * ky, width: 2 * w.halfW * kx, height: 2 * w.halfH * ky };
    return cardBeside(target, WORDS_CARD, menu.within);
  };
  // (their lines as far apart as asked - single, none of their own)
  const spaceWords = (id: number, lines: number | null) => {
    const st = store.getState();
    const c = st.captions.find((x) => x.id === id);
    if (c) st.updateCaption(id, { lines, ...keepTop(c, { lines: lines ?? undefined }) });
  };
  // (in a typeface of their own - none, the drawing's - once its letters are read: set in it at once, not in another first)
  const faceWords = (id: number, font: string | null) =>
    void typefaceRead(font ?? style.fontFamily).then(() => {
      const st = store.getState();
      const c = st.captions.find((x) => x.id === id);
      if (c) st.updateCaption(id, { font, ...keepTop(c, { font: font ?? undefined }) });
    });
  const [startZoom] = useState(() => startingZoom(style));
  // Drops on the drawing: files, and objects and pictures out of Office (lib/drop)
  const dropRef = useRef<HTMLDivElement>(null);
  useDropZone(dropRef, dropZone);
  // (no text of the page's selected on it or over it: Meno's own selection is what selects here)
  useKeepUnselected(dropRef);
  // Render: a picture or a film of molecules in 3D, asked in a card over the canvas (docs/RENDER.md)
  const [rendering, setRendering] = useState<{ ids: number[]; motions: Motion[]; surfaces: boolean } | null>(null);
  const askRender = (ids: number[]) => {
    const st = store.getState();
    const ms = st.molecules3d.filter((m) => ids.includes(m.id));
    if (!ms.length || !renderer()) return;
    // (how it can move: turning, always; through its frames, where one has them; in its vibration, where one shows it)
    const shownRow = (id: number) => {
      const open = st.lists3d[id];
      const m = st.molecules3d.find((x) => x.id === id);
      const list = open ? resultsOn(m?.calc?.results, "list").find((r) => resultKey(r) === open.list) : undefined;
      return list && open?.row != null ? list.rows[open.row] : undefined;
    };
    const motions: Motion[] = ["turn", ...(ms.some((m) => (m.frames?.length ?? 0) > 0) ? (["frames"] as const) : []), ...(ms.some((m) => shownRow(m.id)?.move) ? (["vibration"] as const) : [])];
    setRendering({ ids: ms.map((m) => m.id), motions, surfaces: ms.some((m) => !!shownRow(m.id)?.surface) });
  };
  // Export: the kind and its options asked in a card over the canvas, then the file's name
  const [exporting, setExporting] = useState<{ writers: Writer[]; from?: string; what: Holds; selected: number[]; part: { part: Drawn; ids3d: number[] } } | null>(null);
  // (a talk begun shuts Export's card and Render's: nothing over a talk, its keys the talk's)
  useEffect(() => {
    if (!talking) return;
    setRendering(null);
    setExporting(null);
  }, [talking]);

  // Export: what is selected - its structures, arrows and words, its
  // molecules in 3D - as Meno writes it, or a plugin added that writes
  // molecules in 3D, where it holds any (the maintainer, 2026-10-10: Export
  // is for the selection; the whole page, by Select all first)
  const startExport = (taken: { part: Drawn; ids3d: number[] }) => {
    const state = store.getState();
    const what = holdsOfDrawn(taken.part);
    const added = useReaders.getState().state;
    const theirs = what.solid ? pluginWriters(WRITER_PLUGINS.filter((p) => added[p.id] === "added")) : [];
    setExporting({ writers: [...exportKinds(what).map((k) => WRITERS[k]), ...theirs], from: exportKindOf(state, what), what, selected: taken.ids3d, part: taken });
  };

  // What the workspace does as a whole - opening, saving as, fitting, R and
  // S, its texts, its style, its workflow - on the right-click menu on empty
  // space; the keys say the same. (Save is the title bar's, and Ctrl/Cmd+S.)
  const texts = useEditor((s) => s.texts);
  const lostTexts = useEditor((s) => s.textsLost.length > 0);
  const steps = useEditor((s) => s.steps);
  const textsOpen = useEditor((s) => s.textsOpen);
  const reading = useEditor((s) => s.pdfs.some((p) => p.reading));
  const pdfsHeld = useEditor((s) => s.pdfs.length > 0);
  const slideCount = useEditor((s) => s.slides.length);
  // (`at`: where on the page the menu was opened - where a new text's sheet goes)
  const canvasCommands = (at: { x: number; y: number }): CanvasCommand[] => [
    // (a tab's own workspace: not one in a document's object, which keeps its own)
    ...(ownTab
      ? [
          { name: "Open…", keys: shortcutLabel("O"), run: askToOpen },
          { name: "Save As…", keys: shortcutLabel("S", true), run: () => void saveAs() },
          // (a text of its own, in the column of texts)
          ...(officeId == null ? [{ name: "New text", keys: "", run: () => store.getState().newText(at) }] : []),
        ]
      : []),
    // (a talk given from the slides on the page: docs/PRESENTING.md)
    ...(slideCount ? [{ name: "Present", keys: IS_MAC ? shortcutLabel("\u21a9", true) : "F5", run: () => store.getState().present(0), divider: true }] : []),
    { name: "Fit to content", keys: shortcutLabel("1"), run: requestFit, divider: true },
    ...(texts.length || lostTexts || reading
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
                  else if (st.texts.length || st.textsLost.length) st.showText(st.textShown ?? (st.texts[0] ?? st.textsLost[0]).id);
                  else if (st.pdfs.some((p) => p.reading)) st.readPdf(st.pdfs.find((p) => p.reading)!.id);
                },
              },
        ]
      : []),
    ...(pdfsHeld ? [{ name: "Find in PDF…", keys: shortcutLabel("F"), run: openFind }] : []),
    { name: "Styles…", keys: "", run: () => !styleOpen && toggleStyle(), divider: true },
    // a workflow's steps on the page: every one that has not run or has changed, run - or all stopped
    ...(steps.length
      ? [
          { name: "Run all", keys: "", run: () => void store.getState().runAll(), divider: true, note: runAllNote(store.getState()) },
          ...(steps.some((x) => x.running) ? [{ name: "Stop all", keys: "", run: () => store.getState().stopAll() }] : []),
        ]
      : []),
  ];

  return (
    <div
      ref={dropRef}
      data-guide="page"
      className={`flex-1 min-w-0 h-full relative select-none${fadeIn ? " meno-fade-in" : ""}`}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMove={handleWrapperMouseMove}
      onMouseLeave={handleWrapperMouseLeave}
      onClick={handleWrapperClick}
      onContextMenu={openMenu}
      // (no drag-and-drop of the system's own begins on the page: begun over text selected by
      // chance, it took the pointer's moves and its release from the gesture under way - a
      // structure dragged out of a set did not move, and then followed the pointer, the button up)
      onDragStart={(e) => e.preventDefault()}
      onPointerDownCapture={onRightDown}
      onPointerMoveCapture={onRightMove}
      onPointerUpCapture={onRightUp}
    >
      {/* Import error */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-[90%] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
      {alerts.map((a) => (
        <motion.div
          key={a.key}
          layout
          {...RISE}
          role="alert"
          className="pointer-events-auto flex items-start gap-2 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
        >
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
          <span className="break-words">{a.text}</span>
          {a.key === "import" && importError?.suggest && importError.again && <AddToRead suggest={importError.suggest} again={importError.again} />}
          <button
            aria-label="Dismiss"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              a.dismiss();
            }}
            className="h-4 w-4 shrink-0 rounded-full hover:bg-gh-line"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </motion.div>
      ))}
      </AnimatePresence>
      </div>
      {/* a file dropped being read: a quiet mark where it was dropped - come after a moment, so that a quick one shows
          none - until what it brings is placed, or the card saying why not takes its place */}
      <AnimatePresence>
        {active && dropping && (
          <motion.div
            key={`dropping-${dropping.key}`}
            exit={{ opacity: 0, transition: LEAVE }}
            role="status"
            aria-label="Opening what was dropped"
            className="meno-drop-mark pointer-events-none absolute z-40 flex h-7 w-7 items-center justify-center rounded-full border border-gh-line bg-white/95 shadow-sm"
            style={{ left: dropping.x - (dropRef.current?.getBoundingClientRect().left ?? 0) - 14, top: dropping.y - (dropRef.current?.getBoundingClientRect().top ?? 0) - 14 }}
          >
            <ArrowPathIcon className="h-4 w-4 text-gh-gray animate-spin motion-reduce:animate-none [animation-duration:2s]" aria-hidden />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && (chem.state === "setting-up" || chem.state === "starting" || working3d || checkingFiles) && (
          <motion.div
            key="working"
            {...RISE}
            layout
            role="status"
            className={`absolute right-3 bottom-3 z-50 flex items-center gap-2 rounded-full border border-gh-line bg-white/95 shadow-sm text-xs text-gh-gray ${making3d != null && working3d ? "pl-3 pr-1.5 py-1" : "px-3 py-1.5"}`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={chem.state === "setting-up" || chem.state === "starting" ? chem.state : working3d ? "working" : "checking"} {...FADE} className="block">
                {chem.state === "setting-up"
                  ? `Setting up ${chem.plugin}…${chemShare != null ? ` ${Math.floor(chemShare * 100)}%` : ""}`
                  : chem.state === "starting"
                    ? `Starting ${chem.plugin}…`
                    : working3d || `Checking ${checkingFiles}'s files…`}
              </motion.span>
            </AnimatePresence>
            {/* (making in 3D: how long, and stopped as the atom map is) */}
            {making3d != null && working3d && chem.state !== "setting-up" && chem.state !== "starting" && (
              <>
                <Elapsed since={making3d} />
                <button
                  onClick={() => stop3d.current?.()}
                  className="rounded-full px-2 py-0.5 text-gh-black transition-colors duration-150 ease-meno hover:bg-gh-base"
                >
                  Stop
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && atomMaps.mapping && (
          <motion.div
            key="mapping"
            {...RISE}
            layout
            role="status"
            className="absolute right-3 bottom-12 z-50 flex items-center gap-2 rounded-full border border-gh-line bg-white/95 shadow-sm pl-3 pr-1.5 py-1 text-xs text-gh-gray"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={atomMaps.mapping.phase} {...FADE} className="block">
                {atomMaps.mapping.phase === "3d" ? "Making the reaction's 3D structures…" : "Mapping the reaction's atoms…"}
              </motion.span>
            </AnimatePresence>
            <Elapsed since={atomMaps.mapping.since} />
            <button
              onClick={atomMaps.stopMapping}
              className="rounded-full px-2 py-0.5 text-gh-black transition-colors duration-150 ease-meno hover:bg-gh-base"
            >
              Stop
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* (a structure carried out of a PDF, over everything: components/StructureFlight) */}
      <StructureFlight />
      {/* (what the chemist opens over the canvas - its questions, cards and menus - above the first-run guide: ui/guide/layers) */}
      <AboveGuide over={dropRef} shown={active} measureKey={`${styleOpen}:${textsOpen}`}>
      <AnimatePresence>
        {coords && (
          <CoordinatesCard
            key="coordinates"
            structures={coords.structures}
            onPlace={(chosen) => {
              setCoords(null);
              store.getState().placeAsSet(coordinateMolecules(chosen, coords.source), coords.at, coords.named);
            }}
            onText={
              coords.asText &&
              (() => {
                setCoords(null);
                coords.asText!();
              })
            }
            onCancel={() => setCoords(null)}
          />
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
      {/* (a save past the size Settings says, asked before it is written: fileActions) */}
      <AnimatePresence>
        {files.sizeAsked && (
          <LargeWorkspaceAsk
            key="large"
            bytes={files.sizeAsked.bytes}
            threshold={files.sizeAsked.threshold}
            steps={files.sizeAsked.steps}
            most={files.sizeAsked.most}
            onKeepNoRaw={() => files.sizeAsked?.answer("no raw")}
            onSaveAll={() => files.sizeAsked?.answer("all")}
            onCancel={() => files.sizeAsked?.answer("cancel")}
          />
        )}
      </AnimatePresence>
      {/* (a style changed in Settings while it was open, offered to it: a tab's own workspace alone) */}
      {ownTab && <SettingsStyleAsk active={active} />}
      <AnimatePresence>
        {protonating && (
          <ProtonationCard
            key={`protonation-${protonatingTurn}`}
            protonation={protonating}
            onCancel={() => setProtonating(null)}
            onMark={markProtonated}
            onAdd={async (forms, charges) => {
              const chosen = { forms, charges };
              setAddingHydrogens(true);
              try {
                if (keptAsDictionary(protonating, chosen)) await addHydrogensFromDictionary(store, protonating);
                else await addHydrogensAsChosen(store, protonating, chosen);
              } finally {
                setAddingHydrogens(false);
              }
              setProtonating(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {givingOrders && (
          <OrdersCard
            key="orders"
            onCancel={() => setGivingOrders(null)}
            onGive={async (smiles) => {
              await ordersFromSmiles(store, givingOrders.id, givingOrders.atom, smiles);
              setGivingOrders(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rendering && renderer() && (
          <RenderCard
            key="render"
            plugin={renderer()!}
            motions={rendering.motions}
            surfaces={rendering.surfaces}
            molecules={rendering.ids.length}
            onCancel={() => setRendering(null)}
            onRender={(ask, options) => {
              const ids = rendering.ids;
              setRendering(null);
              startRender(store, ids, ask, options).catch((e: unknown) => setChemError(`Render failed: ${e instanceof Error ? e.message : String(e)}`));
            }}
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
            selected={exporting.selected}
            known={(ids) => {
              const state = store.getState();
              const chosen = carriedOf(state).filter((_, i) => ids.includes(state.molecules3d[i].id));
              return chosen.length ? knownOfMolecules(chosen, style3dOf(store.getState())) : {};
            }}
            skeletons={(ids) => {
              const state = store.getState();
              return carriedOf(state).filter((m, i) => ids.includes(state.molecules3d[i].id) && isSkeleton(m)).length;
            }}
            said={(id) => (id === "pdb" ? pdbLeavesOut((exporting.part.part.molecules3d ?? []).flatMap((m) => m.atoms)) : id === "xyz" ? xyzLeavesOut(exporting.part.part.molecules3d ?? []) : null)}
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
              // (and brought into view, with the sets it will give, where they are not: put down near the window's edge, or moved lower)
              const now = store.getState();
              const box = partsBounds({ sets: now.sets.filter((b) => b.made?.step === id), steps: now.steps.filter((s) => s.id === id), wires: [] });
              if (box) now.requestShow(box);
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
            onArrow={(press) => {
              const { at } = quickAdd;
              store.getState().setQuickAdd(null);
              arrowFrom(store, press, at, clientToWorld);
            }}
            onShape={(kind, press) => {
              const { at } = quickAdd;
              store.getState().setQuickAdd(null);
              shapeFrom(store, press, at, kind, clientToWorld);
            }}
            onSmiles={async (smiles) => {
              // (the plugin's drawing says what the SMILES does; the engine draws it - there, selected, as a paste is;
              // nothing, should this Quick Add have gone while it was read: utils/quickAddSmiles)
              const read = await structureFromSmiles(smiles, style);
              // (and the stereo it leaves open, said as a paste of it says it)
              const said = [stereoOpenSaid(read.stereoOpen), asCameSaid(read)].filter(Boolean).join(" ");
              if (putDownSmiles(store, quickAdd, withoutStereoOpen(read)) && said) setChemError(said);
            }}
            onNamed={(label) => {
              // (a molecule the dictionary has, drawn from it - no plugin asked - and put down as a SMILES read is: chem/resolve)
              putDownSmiles(store, quickAdd, namedDrawn(label));
            }}
            onCoordinates={(structures) => {
              const { at } = quickAdd;
              store.getState().setQuickAdd(null);
              setCoords({ structures, at, source: "Pasted text", named: "Pasted structures" });
            }}
            onOutput={(text) => {
              const { at } = quickAdd;
              store.getState().setQuickAdd(null);
              void putOutput(text, "Pasted text", at);
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
              // (a catalytic cycle, a circle with nothing on it yet, about where Quick Add was opened, selected: lib/chem/cycle)
              else if (what === "cycle") {
                const id = st.addCycle({ x: at.x, y: at.y, r: CYCLE_RADIUS * NOMINAL_BOND_LENGTH });
                if (id != null) {
                  st.clearSel();
                  st.selectCycles([id]);
                }
              }
              // (from the first atom or bond pressed, then on as from a menu)
              else if (what === "push") st.setPushDraw({ from: null, half: false, pointer: null, to: null });
              // (a slide of what is seen: Quick Add only says when, not where)
              // (the pen's card: writing with the mouse or the trackpad, until Done)
              else if (what === "pen") st.setInkMode({ tool: "pen", color: null, width: 0 });
              else if (what === "slide") {
                const seen = viewBox();
                if (seen) st.addSlide(slideOfView(seen, WIDE));
              }
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
        {askDeleteSet != null && askDeleteSet.every((id) => setsNow.some((b) => b.id === id)) && (
          <ConfirmDiscard
            title={
              askDeleteSet.length === 1
                ? `Delete the set and the ${heldOwn(store.getState(), setsNow.find((b) => b.id === askDeleteSet[0])!) ?? "molecules"} it holds?`
                : `Delete ${askDeleteSet.length} sets and the molecules they hold?`
            }
            message={`They are on no page: they go with ${askDeleteSet.length === 1 ? "the set" : "the sets"}. Undo brings them back until the workspace is closed.`}
            discardLabel={askDeleteSet.length === 1 ? "Delete set" : "Delete sets"}
            onCancel={() => store.getState().setWorkflowView({ askDeleteSet: null })}
            onDiscard={() => store.getState().removeSet(askDeleteSet, true)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {askUndo != null && (
          <ConfirmDiscard
            title={askUndo.steps > 1 ? "Delete steps that are running?" : "Delete a step that is running?"}
            message={askUndo.steps > 1 ? "Their jobs are stopped, and their files go with them." : "Its jobs are stopped, and their files go with it."}
            discardLabel={askUndo.steps > 1 ? "Delete steps" : "Delete step"}
            onCancel={() => store.getState().letUndo(false)}
            onDiscard={() => store.getState().letUndo(true)}
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
      <AnimatePresence>{inkMode && <PenCard mode={inkMode} onMode={(m) => store.getState().setInkMode(m)} onDone={endInk} />}</AnimatePresence>
      <AnimatePresence>
        {wordsCard && (
          <WordsCard
            key={`${wordsCard.x},${wordsCard.y}`}
            id={wordsCard.id}
            label={layoutOpts.pointPx ? layoutOpts.fontPx / layoutOpts.pointPx : 10}
            drawing={style.fontFamily}
            onSize={(pt) => sizeWords(wordsCard.id, pt)}
            onLines={(lines) => spaceWords(wordsCard.id, lines)}
            onFont={(font) => faceWords(wordsCard.id, font)}
            x={wordsCard.x}
            y={wordsCard.y}
            within={wordsCard.within}
            onClose={() => setWordsCard(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cornersCard &&
          (() => {
            const sh = store.getState().shapes.find((x) => x.id === cornersCard.id);
            const pointPx = layoutOpts.pointPx ?? pointOfStyle(store.getState().docStyle);
            if (!sh || sh.kind !== "rect") return null;
            return (
              <CornersCard
                key={`${cornersCard.x},${cornersCard.y}`}
                now={sh.radius ?? 0}
                most={roundestOf(sh.x1 - sh.x0, sh.y1 - sh.y0) / pointPx}
                rounded={roundedOfBondPt(pointPx)}
                onCorners={(pt) => store.getState().updateShape(sh.id, { radius: pt })}
                x={cornersCard.x}
                y={cornersCard.y}
                within={cornersCard.within}
                onClose={() => setCornersCard(null)}
              />
            );
          })()}
      </AnimatePresence>
      <AnimatePresence>
        {pdfCard &&
          (() => {
            const p = store.getState().pdfs.find((x) => x.id === pdfCard.id);
            if (!p) return null;
            const Card = pdfCard.kind === "numbers" ? PdfNumbersCard : PdfPagesCard;
            return (
              <Card
                key={`${pdfCard.kind}:${pdfCard.x},${pdfCard.y}`}
                pdf={p}
                at={pdfCard}
                onMade={(held, name) => putBeside(store.getState(), held, name, p)}
                onClose={() => setPdfCard(null)}
              />
            );
          })()}
      </AnimatePresence>
      <AnimatePresence>
        {colourCard && (
          <ColourCard key={`${colourCard.x},${colourCard.y}`} target={colourCard.target} x={colourCard.x} y={colourCard.y} within={colourCard.within} onClose={() => setColourCard(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
      {menu && (
        <PartMenu
          key={`${menu.x},${menu.y}`}
          target={menu}
          onClose={closeMenu}
          onDelete={() => deleteFromMenu(store.getState(), menu, deletePart)}
          molecule3d={menu3d}
          records={menuRecords}
          measure3d={measure3dMenu}
          magnify={menuMagnify}
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
            // (a step deleted while its jobs were being started, and back by an undo: those it started went with it - no log or files to show)
            const jobs = !!(s.running?.jobs.length || (s.ran?.jobs?.length && st.jobsKept(s)));
            return {
              // (its jobs under way, or Meno's own working in turns: Stop)
              ...(s.running || st.menoWorking[s.id] ? { onStop: () => st.stopStep(s.id) } : { onRunFrom: () => void st.runFrom(s.id), note: runNote(st, s.id) }),
              ...(jobs ? { onShowLog: () => void st.showStepLog(s.id), onShowFiles: () =>
                    void st
                      .showStepFiles(s.id)
                      .then((said) => said && useNotices.getState().show({ id: `show-files:${s.id}`, title: "Some files were not written out", text: said }))
                      .catch(() => {}) } : {}),
              // (a step a plugin does runs jobs, whose files the workspace's file keeps: workflow/keptJobs)
              ...(byOf(s) !== MENO.id ? { keepRaw: { kept: s.keepRaw !== false, set: (keep: boolean) => st.keepRawOutputs(s.id, keep) } } : {}),
              // (output Meno could not account for: each such job adopted on purpose, one at a time)
              ...(s.ran?.held && s.ran.unaccounted?.length && !s.running ? { adopt: s.ran.unaccounted.map((job) => ({ job, run: () => void st.adoptJob(s.id, job) })) } : {}),
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
          onOpenAsTable={(() => {
            if (menu.kind !== "set" || menu.id == null) return undefined;
            const st = store.getState();
            const set = st.sets.find((b) => b.id === menu.id);
            // (molecules in 3D it holds off the page; or structures drawn, any - on the page and off it, all read)
            return set && (set.collection || (holdsOf(st, set) === "structures" && setStructures(st, set).length)) ? () => st.readSetTable(set.id) : undefined;
          })()}
          setHoldsOwn={(() => {
            if (menu.kind !== "set" || menu.id == null) return undefined;
            const st = store.getState();
            const set = st.sets.find((b) => b.id === menu.id);
            return set && holdsOwn(set) ? heldOwn(st, set) : undefined;
          })()}
          keepInFile={(() => {
            if (menu.kind !== "set" || menu.id == null) return undefined;
            const set = store.getState().sets.find((b) => b.id === menu.id);
            return set?.made ? { kept: set.keep !== false, set: (keep: boolean) => store.getState().keepSet(set.id, keep) } : undefined;
          })()}
          onUseAsInput={menu.selection === "here" && selectionAsSet() ? () => {
            const frame = selectionAsSet();
            if (!frame) return;
            store.getState().addSet(frame);
            store.getState().clearSel();
          } : undefined}
          onReadStructure={(() => {
            const st = store.getState();
            const ui = { working: setWorking3d, say: setChemError };
            // (the figure in a box drawn on a PDF: the structure beside the PDF)
            const pdf = menu.kind === "pdf" ? st.pdfs.find((x) => x.id === menu.id) : undefined;
            const box = st.pdfBox;
            if (pdf && box?.id === pdf.id) return () => void readStructure(store, { sha256: pdf.sha256, page: box.page, box: box.box }, pdfRoom(pdf), ui);
            // (a picture cut out of a PDF here: the structure beside the picture)
            const pic = menu.kind === "picture" ? st.pictures.find((x) => x.id === menu.id) : undefined;
            const from = pic?.from;
            if (pic && from && st.pdfs.some((p) => p.sha256 === from.sha256)) return () => void readStructure(store, from, pictureRegion(pic), ui);
            // (any other picture: read by the plugin that reads pictures, the structure beside it)
            if (pic && !isFilm(pic.media)) return () => void readStructure(store, { picture: pic }, pictureRegion(pic), ui);
            return undefined;
          })()}
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
          words={(() => {
            const c = menu.kind === "caption" ? store.getState().captions.find((x) => x.id === menu.id) : undefined;
            if (!c) return undefined;
            const styles = stylesOf(c.text.length, c.marks).filter((_, i) => /\S/.test(c.text[i]));
            const st = store.getState();
            return {
              onFont: () => setWordsCard({ id: c.id, ...wordsCardPlace(c, menu), within: menu.within }),
              bold: styles.length > 0 && styles.every((x) => x?.bold),
              italic: styles.length > 0 && styles.every((x) => x?.italic),
              list: c.text.split("\n").every((l) => !l.trim() || listItem(l)),
              onBold: () => st.styleWords([c.id], "bold"),
              onItalic: () => st.styleWords([c.id], "italic"),
              onSup: () => st.styleWords([c.id], "sup"),
              onSub: () => st.styleWords([c.id], "sub"),
              onList: () => {
                // (as a list's lines are made so while written: all of them items, or plain again)
                const ed = new WordsEditor(c.text, c.marks);
                ed.sel = { anchor: 0, head: c.text.length };
                ed.toggleList();
                st.updateCaption(c.id, { text: ed.text, marks: ed.marks(), ...keepTop(c, { text: ed.text, marks: ed.marks() }) });
              },
            };
          })()}
          onFitWords={(() => {
            const c = menu.kind === "caption" ? store.getState().captions.find((x) => x.id === menu.id) : undefined;
            return c?.width ? () => store.getState().updateCaption(c.id, { width: null }) : undefined;
          })()}
          onEditText={() => {
            const c = store.getState().captions.find((x) => x.id === menu.id);
            if (c) store.getState().setCaptionEdit({ id: c.id, at: { x: c.x, y: c.y } });
          }}
          onCopyPicture={menu.kind === "picture" && menu.id != null && store.getState().pictures.find((x) => x.id === menu.id)?.media !== "video/mp4" ? () => void clip.copyPicture(menu.id!) : undefined}
          picture={(() => {
            const p = menu.kind === "picture" ? store.getState().pictures.find((x) => x.id === menu.id) : undefined;
            if (!p) return undefined;
            const film = p.media === "video/mp4";
            return {
              film,
              playing: film ? filmPlaying(p.sha256) : null,
              onPlay: (on: boolean) => playFilm(p.sha256, on),
              onSave: () => void savePictureFile(p).catch((e: unknown) => setChemError(`Save failed: ${e instanceof Error ? e.message : String(e)}`)),
            };
          })()}
          slide={(() => {
            const st = store.getState();
            const i = menu.kind === "slide" ? st.slides.findIndex((x) => x.id === menu.id) : -1;
            if (i < 0) return undefined;
            const s = st.slides[i];
            return {
              onPresent: () => st.present(i),
              ...(i > 0 ? { onEarlier: () => st.orderSlide(s.id, i - 1) } : {}),
              ...(i < st.slides.length - 1 ? { onLater: () => st.orderSlide(s.id, i + 1) } : {}),
              around: !!s.around,
              onAround: () => st.updateSlide(s.id, { around: !s.around }),
              standard: isStandard(s),
              onShape: () => {
                const r = reshaped(s, isStandard(s) ? WIDE : STANDARD);
                st.updateSlide(s.id, { w: r.w, h: r.h });
              },
              onSelectOn: () => st.selectOnSlide(s.id),
            };
          })()}
          cycle={(() => {
            const st = store.getState();
            const cy = menu.kind === "cycle" ? st.cycles.find((x) => x.id === menu.id) : undefined;
            if (!cy) return undefined;
            // (where on its line it was right-clicked: an arrow put there; one there already, near it, can be taken away)
            const at = cyclePointed.id === cy.id ? cyclePointed.angle : 0;
            const branches = cy.branches ?? [];
            const near = branches.findIndex((b) => Math.abs(Math.atan2(Math.sin(b.at - at), Math.cos(b.at - at))) < (12 * Math.PI) / 180);
            const add = (way: "in" | "out") => {
              st.updateCycle(cy.id, { branches: [...branches, { at, way }] });
              // (its words written at once where its far end is: Escape, or nothing written, leaves it without)
              const label = branchPath(cy, { at, way }, NOMINAL_BOND_LENGTH).label;
              st.setCaptionEdit({ id: null, at: label });
            };
            return {
              onIn: () => add("in"),
              onOut: () => add("out"),
              ...(near >= 0 ? { onRemoveArrow: () => st.updateCycle(cy.id, { branches: branches.filter((_, i) => i !== near) }) } : {}),
              ccw: !!cy.ccw,
              onTurn: () => turnCycle(store, cy.id),
              gap: cy.gap ?? CYCLE_MARGIN,
              setGap: (gap: number) => st.updateCycle(cy.id, { gap }),
              // (ends set by hand: those of the arrow right-clicked, and all)
              ...(() => {
                const set = Object.keys(cy.ends ?? {});
                if (!set.length) return {};
                const here = endsAt(cy, cycleThings(st.model, st.captions, styleOf(st.docStyle), [cy]), at).filter((k) => cy.ends?.[k] != null);
                return {
                  ...(here.length ? { onResetEnd: () => st.updateCycle(cy.id, { ends: Object.fromEntries(here.map((k) => [k, null])) }) } : {}),
                  onResetAll: () => st.updateCycle(cy.id, { ends: Object.fromEntries(set.map((k) => [k, null])) }),
                };
              })(),
            };
          })()}
          shape={(() => {
            const st = store.getState();
            const sh = menu.kind === "shape" ? st.shapes.find((x) => x.id === menu.id) : undefined;
            if (!sh) return undefined;
            return {
              ...(sh.kind === "rect" ? { onCorners: () => setCornersCard({ id: sh.id, x: menu.x, y: menu.y, within: menu.within }) } : {}),
              width: sh.width ?? null,
              onWidth: (width) => st.styleShapes([sh.id], { width }),
              dash: !!sh.dash,
              onDash: () => st.styleShapes([sh.id], { dash: !sh.dash }),
              onFront: () => st.orderShapes([sh.id], true),
              onBack: () => st.orderShapes([sh.id], false),
            };
          })()}
          onCombinePdfs={(() => {
            // (two or more PDFs selected - right-clicked on one of them, or on the selection)
            const st = store.getState();
            const chosen = st.pdfs.filter((p) => st.selPdfs.has(p.id));
            if (chosen.length < 2 || (menu.kind === "pdf" ? !st.selPdfs.has(menu.id ?? -1) : menu.selection !== "here")) return undefined;
            return () =>
              void combined(chosen)
                .then(({ held, name, first }) => putBeside(store.getState(), held, name, first))
                .catch((e: unknown) => setChemError(`Combine failed: ${e instanceof Error ? e.message : String(e)}`));
          })()}
          onBoxAround={
            menu.selection === "here"
              ? () => {
                  const st = store.getState();
                  const cam = camRef.current;
                  const b = selectedBox(st, style, (cam as { zoom?: number } | null)?.zoom ?? 1, cam ? eyeOf(cam)?.z : undefined);
                  // (a rectangle a third of a bond clear of it, its corners rounded)
                  const box = b && { kind: "rect" as const, x0: b.x0 - SHAPE_PAD, y0: b.y0 - SHAPE_PAD, x1: b.x1 + SHAPE_PAD, y1: b.y1 + SHAPE_PAD };
                  if (box) st.addShape({ ...box, radius: roundedPt(box.x1 - box.x0, box.y1 - box.y0, pointOfStyle(st.docStyle)) });
                }
              : undefined
          }
          onSlideAround={
            menu.selection === "here"
              ? () => {
                  const st = store.getState();
                  const cam = camRef.current;
                  const b = selectedBox(st, style, (cam as { zoom?: number } | null)?.zoom ?? 1, cam ? eyeOf(cam)?.z : undefined);
                  if (b) st.addSlide(slideAround(b));
                }
              : undefined
          }
          onRender={(() => {
            if (!renderer()) return undefined;
            if (menu.kind === "molecule3d" && menu.selection !== "here" && menuMolecule) return () => askRender([menuMolecule.id]);
            if (menu.selection !== "here") return undefined;
            const ids = [...store.getState().sel3d];
            return ids.length ? () => askRender(ids) : undefined;
          })()}
          text={(() => {
            const t = menu.kind === "text" && menu.id != null ? store.getState().texts.find((x) => x.id === menu.id) : undefined;
            if (!t) return undefined;
            // (a calculation's output: read as one opened is, by its reader - never in part as coordinates)
            const output = outputKindIn(t.text) != null;
            const found = output ? [] : readCoordinates(t.text);
            return {
              icon: !!t.icon,
              onRead: () => store.getState().readText(t.id),
              onIcon: () => store.getState().setTextIcon(t.id, !t.icon),
              ...(output ? { onStructures: () => void putOutput(t.text, t.name, pasteTarget()) } : found.length ? { onStructures: () => setCoords({ structures: found, at: pasteTarget(), source: t.name, named: t.name }) } : {}),
              ...(() => {
                const table = tableOfText(t.name, t.text);
                // (beside the text, to its right, level with it - where it has a sheet on the page)
                const room = sheetRoom(t);
                const at = room ? { x: room.x1 + GAP + TABLE_SET.w / 2, y: (room.y0 + room.y1) / 2 } : pasteTarget();
                return table ? { onTable: () => void store.getState().placeTable(table, at, t.name) } : {};
              })(),
            };
          })()}
          pdf={(() => {
            const p = menu.kind === "pdf" ? store.getState().pdfs.find((x) => x.id === menu.id) : undefined;
            if (!p) return undefined;
            const st = store.getState();
            return {
              spread: !!p.spread,
              icon: !!p.icon,
              onSpread: () => st.spreadPdf(p.id, !p.spread),
              onWrite: () => st.setInkMode({ tool: "pen", color: null, width: 0 }),
              ...(p.spread && p.placed?.length ? { onRows: () => st.pdfPagesInRows(p.id) } : {}),
              onIcon: () => st.iconPdf(p.id, !p.icon),
              ...(!p.spread && !p.icon && p.page < p.pages.length - 1 ? { onNext: () => st.turnPdf(p.id, p.page + 1) } : {}),
              ...(!p.spread && !p.icon && p.page > 0 ? { onPrevious: () => st.turnPdf(p.id, p.page - 1) } : {}),
              onRead: () => st.readPdf(p.id),
              onNumbers: () => setPdfCard({ kind: "numbers", id: p.id, x: menu.x, y: menu.y, within: menu.within }),
              onPages: () => setPdfCard({ kind: "pages", id: p.id, x: menu.x, y: menu.y, within: menu.within }),
              onSave: () => void savePdfFile(p).catch((e: unknown) => setChemError(`Save failed: ${e instanceof Error ? e.message : String(e)}`)),
              ...(selects(st.pdfSel) && st.pdfSel.id === p.id ? { onCopy: () => void copyWords() } : {}),
              // (the coordinates in the words selected, or in the box drawn: the structures they hold, shown before they are placed)
              ...(selects(st.pdfSel) && st.pdfSel.id === p.id
                ? (() => {
                    const { from, to } = ordered(st.pdfSel!);
                    return { onStructures: () => void structuresFrom(selectedPlaced(st.pdfSel!, p), p.name, from.page, to.page, pasteTarget()) };
                  })()
                : st.pdfBox?.id === p.id
                  ? { onStructures: () => void structuresFrom(boxedPlaced(st.pdfBox!, p), p.name, st.pdfBox!.page, st.pdfBox!.page, pasteTarget()) }
                  : {}),
              // (structures picked in it: put on the page beside it, one step - or copied - read as each was)
              ...(st.pdfStructures?.id === p.id
                ? (() => {
                    const models = st.pdfStructures.picks.flatMap((k) => {
                      const s = pickedStructure(p.sha256, k);
                      return s && "model" in s.read ? [s.read.model] : [];
                    });
                    // (a pick whose figure is no longer read - and kept - is said, never left out unsaid)
                    const missing = st.pdfStructures.picks.length - models.length;
                    const said = () => missing && setChemError(missing === 1 ? "1 picked structure is not available: point at it again to read it." : `${missing} picked structures are not available: point at them again to read them.`);
                    if (!models.length) return { onPutStructures: said, onCopyStructures: said };
                    const model = inRow(models, NOMINAL_BOND_LENGTH);
                    return {
                      onPutStructures: () => {
                        said();
                        const now = store.getState();
                        const style = styleOf(now.docStyle);
                        now.putRead(placedBeside({ model }, pdfRoom(p), pageBoxes(now, style), style).model);
                      },
                      onCopyStructures: () => {
                        said();
                        void writeClipboard(clipItems(model)).catch((e: unknown) => setChemError(`Copy failed: ${e instanceof Error ? e.message : String(e)}`));
                      },
                    };
                  })()
                : {}),
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
          figure={(() => {
            // (its structure read from a figure: where it came from - and, not yet said to be checked, saying so, one step)
            const at = menu.kind === "atom" || menu.kind === "bond" ? structureAt(menu.kind, menu.id) : null;
            if (at == null) return undefined;
            const st = store.getState();
            const atoms = fragmentOf(st.model, at);
            const note = figureNotesOf(st.model).find((n) => n.atoms.has(at));
            if (!note) return undefined;
            const from = st.pdfs.find((p) => p.sha256 === note.sha256)?.name ?? st.pictures.find((p) => p.sha256 === note.sha256)?.name ?? "the figure";
            return { from: figureNoteSource(from, note.page), ...(note.checked ? {} : { run: () => st.setFigureChecked([...atoms], true) }) };
          })()}
          stereo={(() => {
            const st = store.getState();
            const item = stereoItemFor(st, menu);
            return item ? { name: item.name, run: () => showStereo(item) } : undefined;
          })()}
          numbers={(() => {
            const st = store.getState();
            const got = numbersItemsFor(st, menu);
            if (!got) return undefined;
            return {
              items: got.items.map((it) => ({ name: it.name, run: () => st.setAtomNumbers(it.of, it.show) })),
              kinds: got.kinds.map((k) => ({ name: k.name, checked: k.checked, run: () => st.setAtomNumberKind(k.molecules, k.kind) })),
            };
          })()}
          onTurnOver={(axis) => store.getState().turnSelectionOver(axis)}
          onCharge={(step) => {
            if (menu.kind === "atom" && menu.id != null) chargeAtom(menu.id, step);
          }}
          onRadical={() => {
            if (menu.kind === "atom" && menu.id != null) radicalAtom(menu.id);
          }}
          radical={!!model.atoms.find((a) => a.id === menu.id)?.radical}
          onChain={(() => {
            const a = menu.kind === "atom" && menu.id != null ? model.atoms.find((x) => x.id === menu.id) : undefined;
            if (!a) return undefined;
            const sum = model.bonds.reduce((n, b) => (b.a === a.id || b.b === a.id ? n + valenceOrder(b, a.el) : n), 0);
            return canTakeBond(a.el, sum, a.charge ?? 0, a.radical)
              ? () => store.getState().startExtend(a.id, "chain", true)
              : undefined;
          })()}
          onExpand={
            menu.kind === "atom" && menu.id != null && expandable(model.atoms.find((a) => a.id === menu.id))
              ? () => store.getState().expandAbbreviation(menu.id!)
              : undefined
          }
          onEditLabel={(() => {
            const a = menu.kind === "atom" && menu.id != null ? model.atoms.find((x) => x.id === menu.id) : undefined;
            if (!a) return undefined;
            // (on the selection's menu: where the selection is that atom alone)
            if (menu.selection === "here" && !selectionIsAtom(store.getState(), a.id)) return undefined;
            // (a carbon drawn as a corner: a C, selected, to be typed over)
            const bare = labelTextOf(a) === "";
            return () => store.getState().beginLabelEdit(a.id, bare ? "C" : "", { select: bare });
          })()}
          asTyped={(() => {
            const a = menu.kind === "atom" && menu.id != null ? model.atoms.find((x) => x.id === menu.id) : undefined;
            return a?.typed && a.typed !== a.el ? { typed: a.typed, run: () => store.getState().labelAsTyped(a.id) } : undefined;
          })()}
          // (a bond's kind: the bonds selected, where the one right-clicked is among them - one step for all)
          bondKind={(() => {
            if (menu.kind !== "bond" || menu.id == null) return undefined;
            const st = store.getState();
            const ids = st.sel.bonds.has(menu.id) ? [...st.sel.bonds] : [menu.id];
            const bond = st.model.bonds.find((b) => b.id === menu.id);
            return bond ? { current: bondKindOf(bond), choose: (kind: BondKindName) => st.setBondsKind(ids, kind) } : undefined;
          })()}
          canvas={canvasCommands(menu.at)}
          // (Export writes what is drawn: a selection of PDFs and texts' sheets alone has nothing for it)
          onExport={menu.selection === "here" && selectedOf({ ...store.getState(), selPdfs: new Set(), selTexts: new Set() }).any ? () => {
            const taken = clip.part();
            if (taken) startExport(taken);
          } : undefined}
          onPush={(menu.kind === "atom" || menu.kind === "bond") && menu.id != null && menu.selection !== "here" ? (half, press) => {
            const st = store.getState();
            const from = menu.kind === "atom" ? { atom: menu.id! } : { bond: menu.id! };
            st.setPushDraw({ from, half, pointer: press ? clientToWorld(press.clientX, press.clientY) ?? menu.at : menu.at, to: null });
          } : undefined}
          arrow={(() => {
            // (an arrow right-clicked: what it is, each choice one step)
            const st = store.getState();
            const a = menu.kind === "arrow" && menu.id != null ? st.arrows.find((x) => x.id === menu.id) : undefined;
            if (!a) return undefined;
            const set = (patch: ArrowFormPatch) => store.getState().setArrowForm([a.id], patch);
            return {
              kind: a.kind ?? null,
              setKind: (kind: ArrowKind | null) => set({ kind }),
              heads: a.heads === 2 ? 2 : 1,
              setHeads: (heads: 1 | 2) => set({ heads }),
              full: !!a.full,
              setFull: (full: boolean) => set({ full }),
              dash: !!a.dash,
              setDash: (dash: boolean) => set({ dash }),
              weight: a.weight ?? "regular",
              setWeight: (weight: ArrowWeight | "regular") => set({ weight }),
              ...(a.corners?.length ? { onStraighten: () => set({ corners: null }) } : {}),
              // (an arrow with a reaction drawn on either side: its atom map)
              ...((() => {
                const sides = reactionOf(st.model, a, st.pluses);
                if (!sides.reactants.length || !sides.products.length) return {};
                return {
                  atomMap: {
                    standing: mapStanding(a, st.model),
                    shown: !!a.atomMap?.shown,
                    maps: a.atomMap?.maps.length ?? 0,
                    chosen: a.atomMap?.chosen ?? 0,
                    onMake: () => void atomMaps.makeAtomMap(a.id),
                    onShow: (shown: boolean) => store.getState().showAtomMap(a.id, shown),
                    onOther: () => store.getState().otherAtomMap(a.id),
                    onExport: () => void files.exportReaction3d(a.id),
                  },
                };
              })()),
            };
          })()}
          push={(() => {
            if (menu.kind !== "push" || menu.id == null) return undefined;
            const st = store.getState();
            const p = st.pushes.find((x) => x.id === menu.id);
            if (!p) return undefined;
            const tail = "atom" in p.from ? st.model.atoms.find((a) => "atom" in p.from && a.id === p.from.atom) : undefined;
            return {
              half: !!p.half,
              setHalf: (half: boolean) => st.updatePush(p.id, { half }),
              // (from an anion: from its charge, or from a lone pair - its dots then shown or not; a fishhook from a radical, from its dot)
              ...(tail && (tail.charge ?? 0) < 0 && tailOf(tail, p) !== "radical" ? { source: { fromPair: !!p.fromPair, set: (fromPair: boolean) => st.updatePush(p.id, { fromPair }) } } : {}),
              ...(tail && hasLonePair(tail) && tailOf(tail, p) === "pair" ? { pair: { shown: !p.noPair, set: (shown: boolean) => st.updatePush(p.id, { noPair: !shown }) } } : {}),
              ...(p.bend ? { onUnbend: () => st.updatePush(p.id, { bend: null }) } : {}),
            };
          })()}
          onColour={(() => {
            // what is drawn: the selection, or the atom, bond, ring or words right-clicked
            const st = store.getState();
            const target: ColourTarget | null =
              menu.selection === "here"
                ? menu.drawing !== false || st.selCaptions.size || st.selShapes.size || st.selArrows.size || st.selInks.size || st.selCycles.size
                  ? { atoms: [...st.sel.atoms], bonds: [...st.sel.bonds], rings: ringsAmong(st.model, st.sel.atoms), captions: [...st.selCaptions], shapes: [...st.selShapes], arrows: [...st.selArrows], inks: [...st.selInks], cycles: [...st.selCycles] }
                  : null
                : menu.kind === "caption" && menu.id != null
                  ? { atoms: [], bonds: [], rings: [], captions: [menu.id] }
                : menu.kind === "shape" && menu.id != null
                  ? { atoms: [], bonds: [], rings: [], shapes: [menu.id] }
                : menu.kind === "ink" && menu.id != null
                  ? { atoms: [], bonds: [], rings: [], inks: [menu.id] }
                : menu.kind === "atom" && menu.id != null
                  ? { atoms: [menu.id], bonds: [], rings: [] }
                  : menu.kind === "bond" && menu.id != null
                    ? { atoms: [], bonds: [menu.id], rings: [] }
                    : menu.kind === "push" && menu.id != null
                    ? { atoms: [], bonds: [], rings: [], pushes: [menu.id] }
                    : menu.kind === "arrow" && menu.id != null
                    ? { atoms: [], bonds: [], rings: [], arrows: [menu.id] }
                    : menu.kind === "cycle" && menu.id != null
                    ? { atoms: [], bonds: [], rings: [], cycles: [menu.id] }
                    : menu.kind === "ring" && menu.ring
                      ? (() => {
                          const ids = new Set(ringsOf(st.model).find((r) => r.key === menu.ring)?.ids ?? []);
                          return { atoms: [...ids], bonds: st.model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)).map((b) => b.id), rings: [menu.ring] };
                        })()
                      : null;
            return target ? () => setColourCard({ target, x: menu.x, y: menu.y, within: menu.within }) : undefined;
          })()}
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
      </AboveGuide>
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
        dpr={canvasRatio}
        // (where the pointer is, from the screen: the same for a move of no distance Meno makes as for the system's - utils/pageEvents)
        events={pageEvents}
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
          {/* Shapes, over the pictures and under the drawing (docs/PRESENTING.md, *Shapes*) */}
          <Shapes2D />
          {/* Writing by hand: a marker's under the drawing, a pen's over it (docs/PRESENTING.md, *Handwriting*) */}
          <Inks2D />
          <InkWriting />
          {/* Rings filled and parts highlighted with a colour, behind the drawing */}
          <Fills2D />
          {/* where renders under way will put what they make (docs/RENDER.md) */}
          <Renders2D />
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
          {/* Electron-pushing arrows, and one being drawn */}
          <PushArrows2D />
          <PushDraw2D />
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
          <ChemMarks2D marks={marks} unsure={unsure} read={readUnsure} />
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
          <Cycles2D />
          <Pluses2D />
          {/* Words on the page: a reaction's reagents and conditions, or anything else */}
          <Suspense fallback={null}>
            <Captions2D />
          </Suspense>
          {/* A workflow on the page: its sets, steps and wires (within the drawing's layout: an input set is made round its labels) */}
          <Workflow2D />
          {/* Slides: frames round what a talk shows, over everything on the page (docs/PRESENTING.md) */}
          <Slides2D />
          {/* Guides, as something is moved or made larger (docs/PRESENTING.md, *Guides*) */}
          <Guides2D />
          {/* Stacks of drawings: each one's chip, under the record it shows, and one going over to the next (utils/stacks) */}
          <StackSwap2D />
          <StackChips2D />
          <MagnifiedMarks2D />
          <FigureNotes2D />
        </DrawnLayoutProvider>
        {/* the page's scale, for chips drawn on it in HTML */}
        <PageScale />
        {/* where a guide's step points at a structure (lib/guide) */}
        <GuideStructure place={guideStructure} />
        {/* Molecules in 3D standing on the page (before PanZoom2D: a press on one is theirs) */}
        <Molecules3D style={style3d} />
        <PanZoom2D />
        {/* a talk given from the slides: the view, the molecules turned in it, the keys (docs/PRESENTING.md) */}
        <Presenter />
        {/* (the view following the column over the canvas's right side) */}
        <FollowCover />
        <FollowStyle />
      </Canvas>
      </PageHtmlLayer.Provider>
      {/* the page's HTML, cut off where the column begins (coverLayer) */}
      <div ref={setHtmlLayer} data-presenting={talking || undefined} className={`absolute inset-0 pointer-events-none ${PAGE_HTML_LAYER}`} style={pageHtmlLayerStyle(cover)} />
      {/* where a guide's step points at a structure: kept over it (GuideStructure) */}
      <div ref={guideStructure} data-guide="structure" className="absolute left-0 top-0 pointer-events-none" style={{ display: "none" }} />
      {/* what a talk is given on: over everything while it is (docs/PRESENTING.md) */}
      <PresentLayer />
      </Remake3D.Provider>
    </div>
  );
}

/**
 * The canvas, should it fail as it is drawn: a card in its place, and
 * Reload making it again - whatever it was in the middle of let go, the
 * press that would have ended it lost with it. Its document, and its store
 * with it, are as they were (ui/layouts/ErrorBoundary), and can be saved
 * meanwhile (TabFiles): a save that fails says so under the card.
 */
function CanvasBoundary({ files, children }: { files: Pick<FileActions, "error" | "dismissError">; children: (reloaded: boolean) => ReactNode }) {
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
          <div className="absolute top-3 left-0 flex flex-col items-center gap-2" style={{ right: cover }}>
            <StoppedCard
              said="The canvas stopped working. What is on it is kept."
              error={error}
              actions={[{ label: "Reload", run: reload }]}
            />
            <AnimatePresence>
              {files.error && (
                <motion.div
                  key="alert"
                  {...RISE}
                  role="alert"
                  className="z-50 max-w-[90%] w-max flex items-start gap-2 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
                >
                  <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
                  <span className="break-words">{files.error}</span>
                  <button aria-label="Dismiss" title="Dismiss" onClick={files.dismissError} className="h-4 w-4 shrink-0 rounded-full hover:bg-gh-line">
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Save, Save As and Export: the tab's, round the canvas rather than in it,
 * so that they last as long as the tab does - should the canvas stop
 * working (CanvasBoundary), its document is still saved by the title bar's
 * Save, by Ctrl/Cmd+S and as its tab is closed (lib/doc/savers).
 */
function TabFiles({
  tabId,
  ownTab,
  active,
  nameTab,
  children,
}: {
  tabId: string;
  /** Whether the canvas is a tab's own, which can be saved as the tab is closed. */
  ownTab: boolean;
  active: boolean;
  /**
   * Names the canvas's tab after the file it is saved as. (One opened from
   * a document keeps that document's name.)
   */
  nameTab?: (label: string) => void;
  children: (files: FileActions) => ReactNode;
}) {
  // Save and export. Ctrl/Cmd+S belongs to the tab in front, like undo.
  const files = useFileActions(nameTab, tabId);
  const { save, saveAs } = files;
  // (a tab's own canvas can be saved as its tab is closed)
  useEffect(() => (ownTab ? setSaver(tabId, save) : undefined), [ownTab, tabId, save]);
  const store = useEditorStore();
  // (where its workspace is saved, read as a file is opened: the same file opened again brings this tab forward)
  useEffect(() => (ownTab ? setSavedPathOf(tabId, () => store.getState().savedPath) : undefined), [ownTab, tabId, store]);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const intent = saveIntent(e);
      // (the keys held: saved once, as they were pressed - and still not the webview's)
      if (!intent && e.repeat && saveIntent({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey })) e.preventDefault();
      if (!intent) return;
      e.preventDefault();
      void (intent === "save" ? save() : saveAs());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, save, saveAs]);
  return <>{children(files)}</>;
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
  // (a talk begun shuts the panel: the talk has the whole of the window, not what is left beside it)
  const talking = usePresentingWindow((s) => s.on);
  useEffect(() => {
    if (talking) setPanel(null);
  }, [talking]);
  return (
    <EditorProvider tabId={tabId} document={document}>
      <div className="w-full h-full flex">
        {/* the canvas, and over its right side the column of texts and PDFs (docs/PDF.md, *One canvas*) */}
        <div className="relative flex-1 min-w-0 h-full flex">
        {/* (each its own part: should one fail, the other goes on - docs/ARCHITECTURE.md, *When a part fails*) */}
        <TabFiles tabId={tabId} ownTab={document != null} active={active} nameTab={officeId == null ? nameTab : undefined}>
          {(files) => (
            <CanvasBoundary files={files}>
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
                  files={files}
                  styleOpen={styleOpen}
                  toggleStyle={() => setPanel((p) => (p === "style" ? null : "style"))}
                  openArrowStyle={(id) => setPanel({ arrow: id })}
                  openSaveAbbreviation={(ids, smiles) => setPanel({ abbreviation: { ids, smiles } })}
                  fadeIn={reloaded}
                />
              )}
            </CanvasBoundary>
          )}
        </TabFiles>
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
                  // (opened anew for another group: a panel of its own, with its own group to keep to)
                  key={panel.abbreviation.ids.join(",")}
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
/** How long something has been going, in whole seconds, once it has gone two: said beside what it is. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.floor((now - since) / 1000);
  return (
    <AnimatePresence initial={false}>
      {s >= 2 && (
        <motion.span key="elapsed" {...FADE} className="tabular-nums">
          {s} s
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function AddToRead({ suggest, again }: { suggest: readonly string[]; again: () => void }) {
  const states = useReaders((s) => s.state);
  return (
    <>
      {suggest.map((id) => {
        const p = anyPluginById(id);
        if (!p) return null;
        const adding = states[id] === "adding" || states[id] === "waiting";
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
