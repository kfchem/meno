import type { ImportedScheme, MarkOf, MarkPlaces, Relayout, WrittenAsLabel } from "../document";
import type { SetKind, StepKind } from "../workflow/kinds";
import type { OptionValues } from "../../../../lib/options";
import type { ArrowLook } from "../../../../lib/chem/reactionArrow";
import type { EditorAtom } from "../../../../utils/importers";
import type { Stroke, StrokeNode } from "../utils/stroke";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { Role3D } from "../../../../lib/chem/style3d";
import type { Biopolymer } from "../../../../lib/chem/biopolymer";
import type { BondChem, ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import type { Workspace } from "../utils/workspace";
import type { CalcInfo } from "../../../../lib/calc/output";
import type { PictureMedia } from "../../../../lib/picture/image";
import type { JobState } from "../../../../lib/jobs";
import type { PagePlace } from "../../../../lib/pdf/layout";

/** An atom as the editor holds it: its chemistry (lib/chem/molecule), where it is, and more. */
export type Atom = EditorAtom & {
  /**
   * How near the viewer the atom is, where its structure is drawn in
   * perspective - a cage, as Clean-up draws one: a bond passing behind
   * another is drawn broken there. World units.
   */
  z?: number;
  /**
   * A stereocentre whose configuration the perspective drawing itself shows,
   * with no wedge: it is read from where its bonds point (lib/layout/drawn).
   */
  stereoCentre?: boolean;
  /**
   * Where its charge - with a radical's dots - was put by hand: its middle,
   * from the atom, in ems of the drawing's labels. Unset, where the drawing
   * puts it (lib/chem/layout2d).
   */
  chargeAt?: MarkAt;
  /** Where its R or S was put by hand, likewise (chem/marks). */
  stereoAt?: MarkAt;
  /** What was typed for its label, where it was read as something else (obz, read as OBz): had back from its menu. */
  typed?: string;
};
/** Where a mark was put by hand: its middle, from what it is of - an atom, a bond's middle - in ems of the drawing's labels. */
export type MarkAt = { x: number; y: number };
export type Bond = BondChem & {
  id: number;
  a: number;
  b: number;
  order: 1 | 2 | 3;
  /** A single bond's wedge, hash or wave; a double bond's "either": cis or trans not known. */
  stereo?: "up" | "down" | "wavy" | "either" | "none";
  doubleMode?: "auto" | "center" | "left" | "right";
  stereoOrient?: "principle" | "reverse";
  /**
   * How a single bond with no stereo is drawn; plain when unset. "wedge" is
   * a ring's bond in perspective toward the viewer, narrow where
   * `stereoOrient` says; on a double bond it, or "bold", is the line the
   * second one is drawn beside.
   */
  display?: "plain" | "bold" | "hashed" | "dashed" | "wedge";
  /** A dative bond, drawn as an arrow from `a`, the donor, to `b`. */
  dative?: boolean;
  /** Where its E or Z - an axis's Ra or Sa - was put by hand, from the bond's middle (`MarkAt`). */
  stereoAt?: MarkAt;
};

import type { FlowParts } from "../workflow/parts";

export type Sel = { atoms: Set<number>; bonds: Set<number> };
/** A workflow's parts selected, as the drawing's are (docs/WORKFLOWS.md, *Copying*): sets and steps, by id - the wires among them with them. */
export type SelFlow = { sets: Set<number>; steps: Set<number> };

export type Model = { atoms: Atom[]; bonds: Bond[] };
export type Arrow = {
  id: number;
  x: number;
  y: number;
  angle: number; // radians
  length: number; // world units
  /** What it sets for itself over the drawing style: its line and its head. */
  look?: ArrowLook;
};
/** A "+" between two structures of a reaction scheme: where its middle is. */
export type Plus = { id: number; x: number; y: number };
/** A press on words on the page that opens them to be written: where on the page, where on the screen and when - and whether a drag goes on from it. */
export type CaptionPress = { at: { x: number; y: number }; client: { x: number; y: number }; t: number; drag: boolean };

/**
 * Words on the page - a reaction's reagents and conditions, or anything
 * else - where their middle is (lib/chem/captions); over or under an arrow,
 * `arrow`, going where it goes.
 */
/** Words on the page: where their middle is, what they say, the arrow they are over, - made as wide as something - how wide they are, broken into lines at it, how their lines lie in it, centred unless said (lib/chem/captions), and - taken out of a PDF - where they came from. */
export type Caption = { id: number; x: number; y: number; text: string; arrow?: number; width?: number; align?: "left" | "right" | "justify"; from?: WordsFrom };
/** Where words taken out of a PDF came from (docs/PDF.md, *Taking things out*): the PDF, by its SHA-256, and the places they ran between. */
export type WordsFrom = { sha256: string; from: WordPlace; to: WordPlace };
/**
 * A PDF on the page (docs/PDF.md): the file it is, by its SHA-256 - held in
 * Meno's cache and kept in the workspace's file - its name, each page's
 * width and height in points, where the middle of its top page lies, which
 * page is on top, and whether its pages are spread out (lib/pdf/layout).
 */
export type PdfItem = {
  id: number;
  name: string;
  sha256: string;
  pages: [number, number][];
  x: number;
  y: number;
  page: number;
  spread?: boolean;
  /**
   * Its pages put in places of their own while spread, each where its
   * middle lies from where the PDF lies, the last put there on top (lib/pdf/
   * layout `PagePlace`). Kept while they are gathered: spread again, they
   * go back there.
   */
  placed?: PagePlace[];
  /** Made small, an icon about a benzene ring's size, its top page on it (lib/pdf/layout `ICON_HEIGHT`). */
  icon?: boolean;
  /**
   * Read in the column, its name among the texts' (docs/PDF.md, *In the
   * column*): where the column's top was, in pages from the first's top -
   * 2.5, half way down the third, the gap under it counted - and how large
   * its pages were, 1 as wide as the column. Kept, not a step to undo.
   */
  reading?: PdfReading;
};

/**
 * A picture on the page (docs/PDF.md, *A picture*): an image - a PNG or a
 * JPEG - by its SHA-256, held for the session (lib/picture/held) and kept in
 * the workspace's file; its name; its size in pixels; where its middle lies;
 * how wide and tall it is drawn, in the page's units; and how far it is
 * turned, anticlockwise, in radians.
 */
export type PictureItem = {
  id: number;
  name: string;
  sha256: string;
  media: PictureMedia;
  px: [number, number];
  x: number;
  y: number;
  w: number;
  h: number;
  turn?: number;
  /** Where it was cut out of a PDF, if it was (docs/PDF.md, *Taking things out*). */
  from?: PictureFrom;
};

/** Where a picture was cut out of a PDF: the PDF, by its SHA-256, the page, and the box, in points from the page's top left. */
export type PictureFrom = { sha256: string; page: number; box: [number, number, number, number] };

/** A box drawn on a PDF's page, to be taken out as a picture: the PDF, the page, and the box, in points from its top left. */
export type PdfBox = { id: number; page: number; box: [number, number, number, number] };

/**
 * A box carried out of a PDF as a picture (components/PictureFlight): the
 * box, on its PDF's page; where it lay at first - its top left, in the
 * window's pixels, and how many pixels a unit of the page was there -
 * where it was pressed, and when. `now` is changed in place as the pointer
 * goes, and read each frame: where it is, whether over the canvas, the
 * picture as it is shown, once drawn, and how it ends. `landing`: the
 * picture on the page it has become, not drawn until this has settled.
 */
export type PictureFlight = {
  box: PdfBox;
  from: { left: number; top: number; k: number };
  grab: { x: number; y: number };
  start: number;
  now: { x: number; y: number; over: boolean; shown: ImageBitmap | null; end: { to: "page" | "back"; start: number } | null };
  landing?: number | null;
};

/** A picture held, as it is put on the page: its name, what it is known by, what it is, its size in pixels and its resolution, where it gives one - and where it was cut out of a PDF, if it was. */
export type PictureToAdd = { name: string; sha256: string; media: PictureMedia; width: number; height: number; dpi?: number; from?: PictureFrom };

/** Where a PDF is read in the column, and how large: `PdfItem.reading`. */
export type PdfReading = { at: number; zoom: number };
/** Which of the 3D style's two looks a molecule is drawn in (lib/chem/style3d). */
export type Look3D = Role3D;
/**
 * A measurement on a molecule in 3D, between its atoms by index, in the
 * order they were chosen: two, a distance; three, the angle at the middle
 * one; four, the torsion angle about the middle two. It is measured afresh
 * in whatever frame is shown.
 */
export type Measure3D = { id: number; atoms: number[] };
/**
 * A molecule in 3D, standing on the page: its atoms where its file put
 * them, in ångströms, and its bonds by atom index. How it is turned, and
 * which frame is shown, are the view's (`turns3d`, `frames3d`), not the
 * document's: they change nothing about it.
 */
export type Molecule3D = {
  id: number;
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  /**
   * Where on the page its centre stands, in world units; and `z`, how high
   * above the page - unset, as high as it reaches, so that no turn takes it
   * behind the page. Molecules turned together as one body have their
   * heights set, each where the turn put it.
   */
  at: { x: number; y: number; z?: number };
  /** The rest of a file's frames (a trajectory, conformers): x, y, z of every atom, frame by frame. */
  frames?: number[][];
  /** Each frame's energy, where its file gives one, in hartrees: the first frame's first. */
  energies?: number[];
  /** Switched to the 3D style's secondary look; unset, drawn in its primary. */
  look?: Look3D;
  /** Its atoms' names and residues and its secondary structure, where it is a PDB entry's chains: drawn as ribbons (lib/chem/biopolymer). */
  biopolymer?: Biopolymer;
  /**
   * Made by editing a result's shape (utils/edit3d): what it was made from -
   * "conformer 7", "frame 12", an output's name - as its chip says it.
   */
  edited?: { from: string };
  measures?: Measure3D[];
  /** The file it came from. */
  name?: string;
  /**
   * The drawing it was made from: the drawing's atom each of its atoms is,
   * by id; null, a hydrogen made for it or an atom written out of an
   * abbreviation.
   */
  drawnFrom?: (number | null)[];
  /** What its drawing was when it was made from it (chem/make3d `signatureOf`). */
  drawnAs?: string;
  /** Its frames are conformers - not a path through time - so each is as likely as its energy says (`populations`). */
  conformerSet?: boolean;
  /** How it was made, where something made it - its conformers' method and force field - as rows to show, in the words of what made it. */
  made?: { how: { label: string; text: string }[] };
  /**
   * Its bonds are where its atoms stand close enough, as its file gives no
   * bonds - an XYZ file's, a calculation's: frame by frame, so that a bond
   * forms and breaks as its frames go (utils/molecule3d `frameBondsOf`).
   */
  bondsFrom?: "distance";
  /**
   * Its stereocentres' and double bonds' CIP labels, by atom and bond index;
   * and which of them its drawing left open - one stereoisomer of several
   * made from it - so that it is told apart from the others.
   */
  stereo?: { atoms: Record<number, string>; bonds: Record<number, string>; chosen?: { atoms: number[]; bonds: number[] } };
  /** What the calculation it was read from says of it, besides its geometries and energies (lib/calc). */
  calc?: CalcInfo;
  /**
   * Each frame's number among its compound's conformers, as its conformer
   * set was first made (docs/WORKFLOWS.md): kept by a step that sets some
   * aside, so that a 7 stays a 7. Unset, they are numbered in order.
   */
  numbers?: number[];
  /** Each frame's share of its compound, as a *Populations* step worked it out; unset, by Boltzmann at room temperature where it is a conformer set. */
  shares?: number[];
  /**
   * Its frames are the path to its last geometry - an optimisation's, made
   * by a step (docs/WORKFLOWS.md, *Results*) - so that a set takes it as
   * that one entry, not as many compounds.
   */
  path?: true;
};
/**
 * A text the workspace holds - a file opened as text, an output shown -
 * read and edited in the column beside the canvas (docs/WORKSPACE.md,
 * *Texts*): its name, and where it was opened from, where Open said.
 */
/** A place between a PDF's letters: on which page, before which letter (lib/pdf/text). */
export type WordPlace = { page: number; at: number };
/** Words selected in a PDF (docs/PDF.md, *Text*): from where the selection was begun to where it has been drawn to - either way round. */
export type PdfSelection = { id: number; anchor: WordPlace; focus: WordPlace };

/** A place a search found: in which PDF, on which page, from which letter to before which. */
export type PdfFound = { id: number; page: number; from: number; to: number };
/** A search of PDFs (docs/PDF.md, *Search*): what is asked, in the PDF shown or in all, what it found, and which of them is gone to. */
export type PdfFind = { q: string; all: boolean; found: PdfFound[]; now: number; busy: boolean };

/** A PDF's page on its way into the column, or back to the page: which page, and when it set off. */
export type PdfFlight = { id: number; page: number; to: "column" | "page"; start: number };
/**
 * Words being carried out of a PDF (components/WordsFlight): set as they
 * will be on the page - as wide as their lines were, and lying as they did -
 * and where each word was on the PDF's page, in the window's pixels (left,
 * top, right, bottom; none, on a page not in view); where the box they are
 * set in lay at first - its top left, and how many pixels a unit of the page
 * was there - where they were pressed, and when. `now` is changed in place
 * as the pointer goes, and read each frame: where it is, whether over the
 * canvas, where under it they are held - set once they are, in units of the
 * page from their middle - and how they end. `landing`: the words on the
 * page they have become, not drawn until these have settled where they are.
 */
export type WordsFlight = {
  text: string;
  width?: number;
  align?: "left" | "right" | "justify";
  boxes: ([number, number, number, number] | null)[];
  from: { left: number; top: number; k: number };
  grab: { x: number; y: number };
  start: number;
  now: { x: number; y: number; over: boolean; held: { x: number; y: number } | null; end: { to: "page" | "back"; start: number } | null };
  landing?: number | null;
};

/**
 * A text the workspace holds: its name, its words and the file it came
 * from - and, where it lies on the page as a sheet of its own (docs/PDF.md,
 * *A text*), its sheet's top left; and whether it is read in the column,
 * as a tab there (unless `reading` is false), and whether its sheet is
 * made an icon, as a PDF is. A calculation's output shown from a molecule,
 * or a step's log, has no sheet: that molecule, or its step, is its body
 * (`of`) - what it rises out of into the column, and goes back into.
 */
export type WorkspaceText = { id: number; name: string; text: string; path?: string; at?: { x: number; y: number }; reading?: false; icon?: true; of?: TextOf };
/** What a text without a sheet is the text of, its body on the page: a step, whose log it is; or a molecule, shown from whose menu it is that molecule's output. */
export type TextOf = { step: number } | { molecule: number };
/**
 * A set on the page (docs/WORKFLOWS.md): its frame, in world units, x0 to
 * x1 and y0 (its foot) to y1 (its top) - what lies inside it its entries.
 * Made by a step: the step, the kind of set it holds, and the entries the
 * step set aside, listed struck through. Made by the chemist, a set is a
 * compound set.
 */
export type WorkflowSet = {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  made?: { step: number; holds: SetKind };
  aside?: AsideEntry[];
};
/** An entry a step set aside: its compound, by its place among the set's (a, b...); its number among that compound's conformers; its energy, in hartrees. */
export type AsideEntry = { compound: number; number: number; energy?: number };
/**
 * What a step did when it last ran: when, whether it did, what it says, and
 * what came into it (`inputKey`: so that it shows when that has changed) -
 * and, where it ran jobs, whether it was stopped, how long it took (ms), and
 * its jobs, by id, whose logs and files are kept until the step is deleted;
 * and the kind and options it ran with.
 */
export type StepRan = { at: number; ok: boolean; said: string; input: string; stopped?: true; took?: number; jobs?: string[]; kind?: StepKind; options?: OptionValues };
/**
 * An earlier run a step keeps (docs/WORKFLOWS.md, *Results*): what it did
 * then - its kind and options as they were - and what it gave, as its
 * result set held it, so that it can be shown again.
 */
export type StepRunKept = StepRan & { kind: StepKind; options?: OptionValues; results?: { molecules: Omit<Molecule3D, "id" | "at">[]; aside: AsideEntry[]; holds: SetKind } };
/**
 * A job a step's run started (lib/jobs): its id; the entries it is for, by
 * their place among those that came in; and the files of its folder its
 * plugin reads back once it is done.
 */
export type StepJob = { id: string; entries: number[]; reads: string[] };
/**
 * A step's run while its jobs wait or run (docs/WORKFLOWS.md, *Running*):
 * when it started, what came into it (`inputKey`), its options as they
 * were, and its jobs - kept in the workspace, so that one opened again picks
 * them up.
 */
export type StepRunning = { at: number; input: string; options: OptionValues; jobs: StepJob[]; kind?: StepKind };
/** A step on the page: its kind, where its card's top left stands, who does it - Meno, or a plugin, by id - its options, what it last did - and its run, while its jobs wait or run. */
export type WorkflowStep = {
  id: number;
  kind: StepKind;
  x: number;
  y: number;
  by?: string;
  options?: OptionValues;
  ran?: StepRan;
  /** Its earlier runs, newest first. */
  runs?: StepRunKept[];
  running?: StepRunning;
};
/** Where a wire starts: a set, or a step - what it gave. */
export type WireEnd = { set: number } | { step: number };
/** A wire, from what gives to the step that takes it. */
export type Wire = { id: number; from: WireEnd; to: number };
/** What of a workflow is the view's, not the document's. */
export type WorkflowView = "hoveredSet" | "chosenSet" | "hoveredStep" | "hoveredWire" | "openStep" | "wireDrag" | "workflowMenu" | "askDeleteStep";
/**
 * A job of a step's, as last looked at (lib/jobs): where it is, when it
 * was asked for, started and ended; its place among those waiting, where it
 * waits; and the last line of its log, where it runs.
 */
export type JobSeen = { state: JobState; created: number; started?: number; ended?: number; place?: number; line?: string };
/** A turn, as a quaternion's x, y, z and w. */
export type Turn3D = [number, number, number, number];
/** A molecule in 3D rising out of its drawing (EditorState `rising3d`). */
export type Rising3D = { from: { x: number; y: number }; start: number; flat?: number[] };
/**
 * Structures with the arrows and "+" signs drawn among them: what a copy
 * takes, a picture shows and a paste brings.
 */
/**
 * A molecule in 3D as a copy carries it: as the document has it, and how it
 * was turned and which frame it showed, so that a paste shows it the same.
 */
/** One of its calculation's lists, open, as a file carries it: the list, the row chosen, and the value its surface is drawn at. */
export type CarriedList = { id: string; row: number | null; iso?: number };
export type Carried3D = Omit<Molecule3D, "id"> & { turn?: Turn3D; frame?: number; list?: CarriedList };
/** What is drawn, as a copy carries it: the drawing, its arrows, pluses and words, molecules in 3D - and a workflow's parts (sets, steps and the wires among them). */
export type Drawn = Model & { arrows?: Arrow[]; pluses?: Plus[]; captions?: Caption[]; molecules3d?: Carried3D[]; flow?: FlowParts; pictures?: PictureItem[] };

export type EditorState = {
  model: Model;
  sel: Sel;
  /** The last atom chosen into the selection: where a Shift+click's path starts. */
  selAnchor: number | null;
  /**
   * A box or a lasso being drawn to select what it holds, in world units:
   * the box's two corners, or the lasso's path.
   */
  boxSelect: { active: boolean; kind: "box" | "lasso"; points: { x: number; y: number }[] };
  hovered: { atomId: number | null; bondId: number | null };
  /** The molecule in 3D under the pointer: on its atoms, its bonds or within its rings. */
  hovered3d: { id: number } | null;
  /** The atom of a molecule in 3D under the pointer, by index: lit in its drawing too. */
  hoveredAtom3d: { id: number; atom: number } | null;
  /** The molecules in 3D on the page. */
  molecules3d: Molecule3D[];
  /** The texts the workspace holds, in their column's order. */
  texts: WorkspaceText[];
  /** The text its column shows, or showed as it was closed, by id; null, none. */
  textShown: number | null;
  /** Whether the column of texts is open beside the canvas. */
  textsOpen: boolean;
  /**
   * How much of the canvas, from its right edge, the column covers now, in
   * CSS pixels - the column lies over the canvas (docs/PDF.md, *One
   * canvas*), so what is in view is the rest of it.
   */
  cover: number;
  setCover: (px: number) => void;
  /** How wide the column is when it is open, in CSS pixels, as its edge was dragged: what it shows is laid out at that width as it slides. */
  columnWidth: number;
  setColumnWidth: (px: number) => void;
  /** How wide the column was dragged showing a PDF, in CSS pixels; none, three quarters of the canvas (utils/texts `columnWidthFor`). */
  pdfColumnWidth: number | null;
  setPdfColumnWidth: (px: number) => void;
  /** The PDF the column shows, among those read there; none, it shows the text it shows (docs/PDF.md, *In the column*). */
  pdfShown: number | null;
  /** The PDF a page of in the column is under the pointer: it is lit on the page, as one hovered there is. */
  litPdf: number | null;
  setLitPdf: (id: number | null) => void;
  /** A PDF read in the column: its page on top rising into it from the page, the column opened on it. */
  readPdf: (id: number) => void;
  /** A PDF read in the column shown there. */
  showPdf: (id: number) => void;
  /** A PDF no longer read in the column: its page going back down to it on the page. */
  stopReadingPdf: (id: number) => void;
  /** Where a PDF is read in the column now - kept with it, not a step to undo. */
  setPdfReading: (id: number, reading: PdfReading) => void;
  /**
   * The page the column has come to, on top on the page too (docs/PDF.md,
   * *The two are one thing*) - not a step to undo: every state it was the
   * page `from` in, undone to or redone, has it instead, so that undoing
   * goes back past the pages turned on the page, not the column's.
   */
  readToPage: (id: number, from: number, to: number) => void;
  /** Words selected in a PDF, on its stack or in the column - one selection at a time, the drawing's let go as it is made. */
  pdfSel: PdfSelection | null;
  setPdfSel: (sel: PdfSelection | null) => void;
  /** The canvas asked to open a PDF's menu where the column was right-clicked, in the window's pixels. */
  menuAsk: { id: number; clientX: number; clientY: number } | null;
  askPdfMenu: (ask: { id: number; clientX: number; clientY: number } | null) => void;
  /** Words being carried out of a PDF, as Meno's own, peeling off it. */
  pdfWords: WordsFlight | null;
  setPdfWords: (words: WordsFlight | null) => void;
  /** A place in a PDF shown, marked for a moment: words gone back to where they came from. */
  pdfFlash: { id: number; from: WordPlace; to: WordPlace; start: number; box?: [number, number, number, number] } | null;
  setPdfFlash: (flash: { id: number; from: WordPlace; to: WordPlace; start: number; box?: [number, number, number, number] } | null) => void;
  /** A box drawn on a PDF's page, to be taken out as a picture - one selection in a PDF at a time, with its words'. */
  pdfBox: PdfBox | null;
  setPdfBox: (box: PdfBox | null) => void;
  /** A box being carried out of a PDF as a picture. */
  pdfPicture: PictureFlight | null;
  setPdfPicture: (flight: PictureFlight | null) => void;
  /** A search of PDFs, its field open at the column's top; none, closed. */
  pdfFind: PdfFind | null;
  setPdfFind: (find: PdfFind | null) => void;
  /** A page going between the page and the column, as a PDF is read there or no longer. */
  pdfFlight: PdfFlight | null;
  endPdfFlight: () => void;
  /**
   * Texts added to the workspace, as one undo step, the last shown: each
   * one the workspace holds already - the same name and text - shown instead.
   */
  /** Texts added - each a sheet on the page too, in a row from `onPage`, where it is given - and the last shown in the column. */
  addTexts: (texts: Omit<WorkspaceText, "id">[], onPage?: { x: number; y: number }) => void;
  /** A text as typed: a run of typing in it is one undo step. */
  editText: (id: number, text: string) => void;
  /** A text taken out of the workspace, as one undo step. */
  removeText: (id: number) => void;
  /** Texts deleted, their sheets with them, as one step. */
  removeTexts: (ids: Iterable<number>) => void;
  /** A text read in the column - its tab there again, where it had none - and shown. */
  readText: (id: number) => void;
  /** A text's sheet made an icon, or shown full size again, as one step. */
  setTextIcon: (id: number, icon: boolean) => void;
  /** What a text is the text of, its body on the page - not a step to undo, as reading it is not. */
  setTextOf: (id: number, of: TextOf) => void;
  /** A text's tab in the column closed: one with a sheet on the page is read there no longer; one without goes. */
  stopReadingText: (id: number) => void;
  /**
   * A text's sheet going into the column as it is read - rising from where
   * it lies on the page, growing to the column's width - or the column's
   * text going back down to its sheet as the column shuts (components/
   * TextFlight).
   */
  textFlight: { id: number; to: "column" | "page"; start: number } | null;
  /** A text shown in the column rising into it from its body - an output, from its molecule. */
  riseText: (id: number) => void;
  endTextFlight: () => void;
  /** The text whose sheet the pointer is on. */
  hoveredText: number | null;
  setHoveredText: (id: number | null) => void;
  /** The texts whose sheets are selected, with the rest of the selection. */
  selTexts: Set<number>;
  selectTexts: (ids: Iterable<number>, add?: boolean) => void;
  toggleTextSel: (id: number) => void;
  /** A text shown in its column, which opens. */
  showText: (id: number) => void;
  /** The column of texts closed: the texts kept. */
  closeTexts: () => void;
  /** How each molecule in 3D is turned, by id; unturned if absent. */
  turns3d: Record<number, Turn3D>;
  /** Which frame each molecule in 3D shows, by id; the first if absent. */
  frames3d: Record<number, number>;
  /** The molecules in 3D selected, whole, by id: besides `sel`, which is the drawing's. */
  sel3d: Set<number>;
  /** The sets and steps selected, with the rest - by a box, a lasso, Ctrl or ⌘ and a click, or Select all. */
  selFlow: SelFlow;
  /** A set or a step added to the selection, or taken out of it. */
  toggleFlowSel: (part: { set: number } | { step: number }) => void;
  /** The sets and steps selected: these, or (`add`) these besides those already. */
  selectFlow: (flow: { sets: Iterable<number>; steps: Iterable<number> }, add?: boolean) => void;
  /**
   * Molecules in 3D rising out of their drawing, by id: where each started,
   * over the drawing, and when (`performance.now()`); and where each of its
   * atoms started - on its drawing's atom - about its centre, as it is
   * turned. Gone once risen.
   */
  rising3d: Record<number, Rising3D>;
  /** Molecules in 3D shown with all their frames at once - their conformers overlaid - by id. */
  overlay3d: Record<number, true>;
  setOverlay3d: (id: number, on: boolean) => void;
  /**
   * Molecules in 3D with one of their calculation's lists open under them
   * (lib/calc/results), by id: the list, by its result's id; the row chosen
   * in it - the molecule moving in it, showing its frame or its surface -
   * and the row pointed at, its atoms marked; or null, none; and the value
   * a surface is drawn at, where it has been set (unset: the grid's own).
   */
  lists3d: Record<number, { list: string; row: number | null; pointed: number | null; iso?: number }>;
  /** Opens one of a molecule's lists under it, in place of one open, none of its rows chosen. */
  openList3d: (id: number, list: string) => void;
  /** The row chosen in a molecule's open list; null, none - its motion comes to rest. */
  chooseRow3d: (id: number, row: number | null) => void;
  /** The row pointed at in a molecule's open list; null, none. */
  pointRow3d: (id: number, row: number | null) => void;
  /** The value the surface of a molecule's open list is drawn at. */
  setIso3d: (id: number, iso: number) => void;
  closeList3d: (id: number) => void;
  /**
   * The atoms and bonds chosen in one molecule in 3D, by index, each in the
   * order chosen: what a measurement is of (utils/molecule3d `chosenPath`).
   */
  chosen3d: { id: number; atoms: number[]; bonds: number[] } | null;
  /** The measurement under the pointer: its molecule and its own id. */
  hoveredMeasure3d: { id: number; measure: number } | null;
  /** The measurement whose value is being typed in its chip: a molecule's, by id, and its own id. */
  measureEdit3d: { id: number; measure: number } | null;
  editMeasure3d: (x: { id: number; measure: number } | null) => void;
  /**
   * A measurement set to a value (utils/edit3d), the side of its last atom
   * moved, in the frame shown - in a copy beside it, where the molecule is
   * a result; edits sharing `gesture` are one undo step. The molecule
   * edited, by id - the copy's, where one was made - or null where the
   * value cannot be set so.
   */
  setMeasure3d: (id: number, measure: number, value: number, gesture?: string) => number | null;
  /** What is chosen of a molecule measured - as the atoms were chosen - and its value opened to be typed. */
  setChosen3d: () => void;
  setHoveredMeasure3d: (h: { id: number; measure: number } | null) => void;
  setHovered3d: (h: { id: number } | null) => void;
  /** The atom of molecule `id` under the pointer; null, none of its atoms. */
  setHoveredAtom3d: (id: number, atom: number | null) => void;
  setTurn3d: (id: number, turn: Turn3D) => void;
  /**
   * Molecules in 3D made from a drawing, as one undo step: each where it is
   * to rest, turned as `turn` says, rising out of the drawing from `from` -
   * in place of the molecules `replacing`, made from it before it changed.
   */
  riseMolecules3d: (made: ({ m: Omit<Molecule3D, "id">; turn: Turn3D } & Omit<Rising3D, "start">)[], replacing?: number[]) => number[];
  /** A molecule in 3D has risen. */
  risen3d: (id: number) => void;
  /**
   * A molecule in 3D drawn as a formula: `model` added to the drawing, and
   * the molecule tied to it - `link`, each of its atoms' atom in `model` -
   * as one undo step.
   */
  drawFormula3d: (id: number, model: Model, link: (number | null)[]) => void;
  /** A molecule in 3D turned back to face as its file has it. */
  resetTurn3d: (id: number) => void;
  setFrame3d: (id: number, frame: number) => void;
  /** Molecules in 3D selected, alone or (`add`) with what is selected already. */
  selectMolecules3d: (ids: Iterable<number>, add?: boolean) => void;
  /** A molecule in 3D taken into the selection, or out of it. */
  toggleMolecule3dSel: (id: number) => void;
  /**
   * An atom of a molecule in 3D chosen, or let go if it was: one in another
   * molecule, or a fifth, starts the choice afresh.
   */
  chooseAtom3d: (id: number, atom: number) => void;
  /** A bond of a molecule in 3D chosen, or let go if it was; likewise. */
  chooseBond3d: (id: number, bond: number) => void;
  /**
   * Molecules in 3D turned together, as one body: where each now stands is
   * the document's, one undo step for all that share `gesture`, and how each
   * is turned the view's - but an undo or a redo of the step puts the turns
   * back as they were too. The drawing turned with them, if any, likewise.
   */
  turnMolecules3d: (
    moves: { id: number; at: { x: number; y: number; z?: number }; turn: Turn3D }[],
    gesture: string,
    drawing?: { id: number; x: number; y: number }[],
    marks?: MarkPlaces,
  ) => void;
  /**
   * Molecules in 3D turned where they stand, by the selection's handle, from
   * `turnsBefore` to `turnsAfter` (each set as it turned): one undo step,
   * which puts the turns back - though how each is turned is the view's,
   * and where they stand has not changed.
   */
  keepTurns3d: (turnsBefore: Record<number, Turn3D | undefined>, turnsAfter: Record<number, Turn3D>) => void;
  /** Moves a molecule in 3D on the page; moves sharing `gesture` are one undo step. */
  moveMolecule3d: (id: number, at: { x: number; y: number }, gesture?: string) => void;
  /** Moves molecules in 3D on the page together; moves sharing `gesture` are one undo step. */
  moveMolecules3d: (moves: { id: number; at: { x: number; y: number; z?: number } }[], gesture?: string) => void;
  removeMolecule3d: (id: number) => void;
  /** Molecules in 3D drawn in the primary look or the secondary, in one step. */
  setLook3d: (ids: number[], look: Look3D) => void;
  /** A molecule in 3D switched to its other look - the secondary, or back to the primary - and those selected with it to the same. */
  switchLook3d: (id: number) => void;
  /** A measurement of the atoms and bonds chosen, which are then let go. */
  measureChosen3d: () => void;
  removeMeasure3d: (id: number, measure: number) => void;
  /** The reaction arrow under the pointer: its menu is the one a right-click opens. */
  hoveredArrow: number | null;
  /** The "+" under the pointer, likewise. */
  hoveredPlus: number | null;
  /** The words under the pointer, likewise. */
  hoveredCaption: number | null;
  /** The PDF under the pointer, likewise. */
  hoveredPdf: number | null;
  setHoveredPdf: (id: number | null) => void;
  /** The PDFs on the page. */
  pdfs: PdfItem[];
  /** PDFs held put on the page, as one step: the first where `at` is, the others beside it in a row. */
  addPdfs: (pdfs: { name: string; sha256: string; pages: [number, number][] }[], at: { x: number; y: number }) => void;
  /** A PDF moved, its top page's middle to (x, y): one step for a drag (`gesture`). */
  movePdf: (id: number, x: number, y: number, gesture?: string) => void;
  /** Another page on top of a PDF's stack. */
  turnPdf: (id: number, page: number) => void;
  /** A PDF's pages spread out, or gathered again. */
  spreadPdf: (id: number, spread: boolean) => void;
  /** A page of a PDF spread put in a place of its own, its middle at (x, y) on the page, on top of the others: one step for a drag (`gesture`). */
  placePdfPage: (id: number, page: number, x: number, y: number, gesture?: string) => void;
  /** A PDF's pages spread put back in their rows, none in a place of its own. */
  pdfPagesInRows: (id: number) => void;
  /** A PDF made small, an icon - its pages gathered - or full size again. */
  iconPdf: (id: number, icon: boolean) => void;
  removePdf: (id: number) => void;
  /** The pictures on the page. */
  pictures: PictureItem[];
  /** The picture under the pointer: its menu is the one a right-click opens. */
  hoveredPicture: number | null;
  setHoveredPicture: (id: number | null) => void;
  /** The pictures selected, by id: besides `sel`, which is the drawing's. */
  selPictures: Set<number>;
  /** The pictures selected: these, or (`add`) these besides those already. */
  selectPictures: (ids: Iterable<number>, add?: boolean) => void;
  /** A picture added to the selection, or taken out of it (Ctrl or ⌘ and a click). */
  togglePictureSel: (id: number) => void;
  /** Pictures held put on the page, as one step: the first's middle where `at` is, the others beside it in a row - clear of what lies there, unless `just` there - selected; their ids. */
  addPictures: (pictures: PictureToAdd[], at: { x: number; y: number }, just?: boolean) => number[];
  /** A picture moved, made larger or smaller, or turned: one step for a drag (`gesture`). */
  updatePicture: (id: number, patch: Partial<Pick<PictureItem, "x" | "y" | "w" | "h" | "turn">>, gesture?: string) => void;
  removePicture: (id: number) => void;
  setHoveredCaption: (id: number | null) => void;
  /** Words on the page selected, each as one thing (a long press on them): deleted, copied and moved with the rest of the selection. */
  selCaptions: Set<number>;
  /** These words selected: alone, or (`add`) besides what is already. */
  selectCaptions: (ids: Iterable<number>, add?: boolean) => void;
  /**
   * A charge, an R or S, an E or Z put where a hand put it - `at`, from what
   * it is of, in ems of the drawing's labels - or (null) back where the
   * drawing puts it; a run of changes in one gesture one step.
   */
  putMark: (of: MarkOf, at: MarkAt | null, gesture?: string) => void;
  /** The mark under the pointer: a charge or an R or S of an atom, or an E or Z of a bond. */
  hoveredMark: MarkOf | null;
  setHoveredMark: (mark: MarkOf | null) => void;
  /** Words on the page. */
  captions: Caption[];
  nextCaptionId: number;
  /**
   * Words being written, in place: the caption's, or (null) new ones where
   * `at` is - where Quick Add or the menu was opened. Each writing its own
   * `n`, given as it opens. `drawn` once the words being written are drawn,
   * in place of the caption's own. `press`, where a press on the caption's
   * words opened it: the caret put there - and a drag (`drag`) selecting on
   * from there - as if it had pressed there among them.
   */
  captionEdit: { id: number | null; at: { x: number; y: number }; n?: number; drawn?: boolean; press?: CaptionPress } | null;
  setCaptionEdit: (edit: EditorState["captionEdit"]) => void;
  /** The words being written, drawn in place of their caption's own: from now. */
  markCaptionDrawn: (n: number) => void;
  /**
   * Words written, kept or let go - the caption they are now (`id`), or
   * none - drawn as they were written until the caption's own are drawn
   * (`captionLeft`), so that the words never go from the page for a frame.
   */
  leaveCaptionEdit: (n: number, id: number | null) => void;
  captionLeft: { id: number; n: number; at: { x: number; y: number } } | null;
  /** The caption's own words drawn again: what was written no longer drawn over them. */
  captionShown: (id: number) => void;
  /** Words added, as one step - taken out of a PDF, where they came from, as wide as their lines were and lying as they did; their id. */
  addCaption: (text: string, x: number, y: number, arrow?: number, from?: WordsFrom, width?: number, align?: Caption["align"]) => number;
  /**
   * Words changed - written anew, moved, put over an arrow or taken from
   * one (`arrow` null), made as wide as something or as their words
   * (`width` null) - a run of changes in one gesture one step.
   */
  updateCaption: (
    id: number,
    patch: { text?: string; x?: number; y?: number; arrow?: number | null; width?: number | null; align?: "left" | "center" | "right" | "justify" },
    gesture?: string,
  ) => void;
  removeCaption: (id: number) => void;
  /**
   * The icons a double-click on empty space opens there (QuickAdd): where,
   * on the page and in the canvas, and how big the canvas is, for them to
   * stay inside it.
   */
  quickAdd: {
    at: { x: number; y: number };
    x: number;
    y: number;
    within: { width: number; height: number };
    /** Opened by a wire let go on empty space, from what gives: at its calculations, those that take it. */
    wire?: WireEnd;
  } | null;
  setQuickAdd: (q: EditorState["quickAdd"]) => void;
  /**
   * A double-click on empty space: Quick Add there - or, with the column
   * open beside the canvas, the column shut, the work coming back to the
   * canvas (the maintainer, 2026-10-10).
   */
  doubleClickOnEmpty: (q: NonNullable<EditorState["quickAdd"]>) => void;
  /** A workflow on the page (docs/WORKFLOWS.md): its sets, steps and wires. */
  sets: WorkflowSet[];
  steps: WorkflowStep[];
  wires: Wire[];
  /** The set whose tab is under the pointer; the set chosen (its tab clicked); the step and the wire under the pointer; the step open to its options. */
  hoveredSet: number | null;
  chosenSet: number | null;
  hoveredStep: number | null;
  hoveredWire: number | null;
  openStep: number | null;
  /** A set's tab or a step's card right-clicked: its menu asked for, there (Workspace opens it). */
  workflowMenu: { kind: "set" | "step"; id: number; clientX: number; clientY: number } | null;
  /**
   * A wire being drawn, to where the pointer is: from what gives, or back
   * from a step that takes (`to`); picked up off the step it went into,
   * the wire it was (`was`).
   */
  wireDrag: { from?: WireEnd; to?: number; at: { x: number; y: number }; was?: number } | null;
  setWorkflowView: (patch: Partial<Pick<EditorState, WorkflowView>>) => void;
  /** A step's jobs forgotten, as it is deleted: stopped, and their folders taken away. */
  forgetStepJobs: (step: Pick<WorkflowStep, "running" | "ran">) => void;
  /** A set round `frame`, as one step; its id. */
  addSet: (frame: { x0: number; y0: number; x1: number; y1: number }) => number;
  /** A procedure saved, put down with its middle at (x, y), as one step - selected. */
  putDownProcedure: (id: string, x: number, y: number) => void;
  /** A set's frame sized anew, or the set moved with all it holds: a run of either in one gesture one step. */
  resizeSet: (id: number, frame: { x0: number; y0: number; x1: number; y1: number }, gesture?: string) => void;
  moveSet: (id: number, dx: number, dy: number, gesture?: string) => void;
  removeSet: (id: number) => void;
  /** A step of `kind`, done by `by` - Meno, or a plugin - put down, its card's top left at (x, y), with the defaults Settings has for its kind done by it; its id. */
  addStep: (kind: StepKind, by: string, x: number, y: number) => number;
  moveStep: (id: number, x: number, y: number, gesture?: string) => void;
  /** A step's options changed - its own, the defaults left as they are - or its kind, to another who does it fills. */
  updateStep: (id: number, patch: { options?: OptionValues; kind?: StepKind }) => void;
  /** A step deleted - its jobs stopped and their files taken away; one running, only once asked about (`askDeleteStep`), `asked`. */
  removeStep: (id: number, asked?: boolean) => void;
  /** A running step asked to be deleted: the question asked (Workspace). */
  askDeleteStep: number | null;
  /** A wire from what gives into a step, where it may go (workflow/flow `canWire`); whether it went. */
  connect: (from: WireEnd, to: number) => boolean;
  removeWire: (id: number) => void;
  /**
   * A step run, and first the steps before it that need it - each step's
   * results coming in one step to undo. A step that runs a program waits
   * for its jobs; the promise is kept when the last of them has run.
   */
  runStep: (id: number) => Promise<void>;
  /** A step run, and every step after it - those that take what it gives, and those after them. */
  runFrom: (id: number) => Promise<void>;
  /** Every step on the page that has not run, or has changed, run in order - those that do not wait on one another at once. */
  runAll: () => Promise<void>;
  /** A step's jobs asked to stop: those waiting never start, those running are stopped with what they started. */
  stopStep: (id: number) => void;
  /** Every step's jobs asked to stop. */
  stopAll: () => void;
  /** An earlier run of a step shown again - its results in its result set - what it showed kept among its runs instead: one step to undo. */
  showRun: (id: number, index: number) => void;
  /** A step's logs opened in the column of texts, following its jobs while they run. */
  showStepLog: (id: number) => Promise<void>;
  /** The folder of a step's last job shown where the system shows files. */
  showStepFiles: (id: number) => Promise<void>;
  /** The jobs of the steps that have any looked at: where each is, and, those that have all ended, their results brought in. */
  lookAtJobs: () => Promise<void>;
  /** Each step's jobs, as last looked at, by job id. */
  jobsSeen: Record<string, JobSeen>;
  /** A wire picked up off its step and let go on another's port: into that one instead, as one step. */
  rewire: (id: number, to: number) => void;
  hoverPulse: { id: number | null; nonce: number; until: number };
  arrows: Arrow[];
  pluses: Plus[];
  fitNonce: number;
  autoFitSuspended: boolean;
  aromaticEnabled: boolean; // legacy/global
  aromaticRings: Record<string, boolean>; // per-ring enabled flags by ringKey
  /** The document's own drawing style, if it has one (see useDrawingStyle). */
  docStyle?: StyleChoice;
  labelEdit: {
    active: boolean;
    atomId: number | null;
    value: string;
    /** When it was begun, and with what: a double-click takes back one its first click began. */
    opened?: { at: number; value: string };
    /** Each edit its own number, given as it begins. */
    n?: number;
  };
  /**
   * A label just written, drawn as it was written until the drawing's own is
   * drawn in its place (LabelTyping2D), so that it never goes from the page
   * for a frame: its atom, its edit's number, what it says.
   */
  labelLeft: { atomId: number; n: number; text: string } | null;
  /** The drawing's labels drawn again: a label just written no longer drawn over its own. */
  labelShown: () => void;
  moveDrag: {
    active: boolean;
    atomId: number | null;
    pointer: { x: number; y: number } | null;
    mode?: "snap" | "free";
    /**
     * Where the dragged atom is actually previewed (after snapping), published
     * by MovePreview2D so other layers - the label, for one - can follow it.
     */
    preview?: { x: number; y: number } | null;
  };
  extend: {
    active: boolean;
    atomId: number | null;
    pointer: { x: number; y: number } | null;
    /** "free" once a bond stroke has paused: it follows the pointer exactly. */
    mode: "snap" | "free";
    /** The stroke being drawn: a bond or a chain, and what it has laid down. */
    stroke?: Stroke | null;
    /**
     * A chain traced with the button up - started by a click, ended by
     * another - rather than dragged: the pointer's moves lead it as they come.
     */
    tracing?: boolean;
    /**
     * Where the bond the pointer is leading ends, as ExtendPreview2D shows it
     * (after snapping, and the spring into place) - on an atom already there
     * or one of the stroke's own when it closes onto it - so the drawing can
     * lay it out there.
     */
    preview?: { x: number; y: number; atomId?: number; pathIndex?: number } | null;
  };
  panHold: { active: boolean; pointerId: number | null };
  suppressDblClickUntil: number;
  nextId: number;
  nextArrowId: number;
  nextPlusId: number;
  addAtom: (x: number, y: number, el?: string, r?: number) => number;
  addBond: (a: number, b: number, order?: Bond["order"]) => number;
  /** New atom plus its bond to `baseId`, as one undo step. */
  addAtomBonded: (
    baseId: number,
    x: number,
    y: number,
    el?: string,
    order?: Bond["order"],
  ) => number;
  /** Two new atoms and the bond between them, as one undo step. */
  addBondedPair: (
    first: { x: number; y: number; el?: string },
    second: { x: number; y: number; el?: string },
    order?: Bond["order"],
  ) => void;
  connectAtoms: (a: number, b: number, order?: Bond["order"]) => number | null;
  replaceDraggedAtomWith: (movingId: number, targetId: number) => void;
  moveAtom: (id: number, x: number, y: number) => void;
  /**
   * Deletes an atom and its bonds, or a bond, as one undo step; a carbon
   * left with no bonds goes too.
   */
  /** An atom's charge one up (+1) or one down (-1), as one undo step. */
  stepCharge: (id: number, step: 1 | -1) => void;
  /** An atom's unpaired electron given, or taken away. */
  toggleRadical: (id: number) => void;
  deleteAtom: (id: number) => void;
  deleteBond: (id: number) => void;
  /**
   * A new layout for some of the structure - a clean-up - as one undo step:
   * groups written by their labels first, where it writes them, then atoms
   * moved, and wedges changed where the layout needs them.
   */
  relayout: (change: Relayout, labels?: readonly WrittenAsLabel[]) => void;
  /**
   * The atoms the last edit drew out of an abbreviation - a run of them,
   * where the edits before it did too - which Clean-up leaves drawn out;
   * none after any other edit.
   */
  justExpanded: () => ReadonlySet<number>;
  updateBond: (id: number, patch: Partial<Bond>) => void;
  setBondOrder: (id: number, order: Bond["order"]) => void;
  setBondStereo: (id: number, stereo: NonNullable<Bond["stereo"]>) => void;
  setBondDoubleMode: (
    id: number,
    mode: NonNullable<Bond["doubleMode"]>,
  ) => void;
  setBondStereoOrient: (
    id: number,
    orient: NonNullable<Bond["stereoOrient"]>,
  ) => void;
  setSel: (sel: Sel, anchor?: number | null) => void;
  toggleAtomSel: (id: number) => void;
  toggleBondSel: (id: number) => void;
  selectPathTo: (id: number) => void;
  selectStructure: (id: number) => void;
  selectAll: () => void;
  clearSel: () => void;
  setBoxSelect: (box: EditorState["boxSelect"]) => void;
  /** Atoms moved together - a selection dragged or turned - the moves of one gesture one undo step. */
  /**
   * Atoms moved to where they go - and `marks`, arrows and pluses, with them
   * - all of one gesture one step.
   */
  moveAtoms: (moves: { id: number; x: number; y: number }[], gesture: string, marks?: MarkPlaces) => void;
  /** The selection turned over, left to right or top to bottom (utils/selection). */
  turnSelectionOver: (axis: "vertical" | "horizontal") => void;
  /** The selection deleted, as one undo step. */
  deleteSelection: () => void;
  /** A structure from the clipboard added where it already stands, selected, as one undo step. */
  pasteModel: (next: Drawn) => void;
  setHoveredFromId: (id: number) => void;
  clearHovered: () => void;
  setHoveredArrow: (id: number | null) => void;
  setHoveredPlus: (id: number | null) => void;
  clearAtomHover: () => void;
  clearBondHover: () => void;
  /** Begins a stroke out of an atom: one bond, or a chain. */
  /** A stroke from an atom: `tracing`, a chain led with the button up (see `extend.tracing`). */
  startExtend: (atomId: number, kind?: Stroke["kind"], tracing?: boolean) => void;
  /** A chain from a new atom at a point on empty space. */
  startChainAt: (x: number, y: number, tracing?: boolean) => void;
  updateExtend: (x: number, y: number) => void;
  /** A pause in the stroke: see `holdStroke`. */
  holdExtend: () => void;
  commitExtend: () => void;
  cancelExtend: () => void;
  /** A finished stroke, added as one undo step. */
  drawStroke: (
    baseId: number,
    nodes: readonly StrokeNode[],
    kind: Stroke["kind"],
  ) => void;
  /**
   * A press being held, for a long press: on an atom (its structure is
   * what it selects) or at a point of empty space (a box begins there), and
   * when it began. Null once it moves, comes up, or has been held long
   * enough.
   */
  pressHold: { atomId?: number; at?: { x: number; y: number }; start: number } | null;
  setPressHold: (h: EditorState["pressHold"]) => void;
  /** The bond a double-click on an atom drew, which a third click takes back to draw a chain instead. */
  doubleClickBond: { atomId: number; depth: number; at: number } | null;
  noteDoubleClickBond: (atomId: number) => void;
  /** The double-click's bond on `atomId` taken back, if it is the last edit and has only just been made. */
  takeBackDoubleClickBond: (atomId: number) => void;
  /** A chain drawn from a new atom on empty space, as one edit. */
  drawStrokeAt: (start: { x: number; y: number }, nodes: readonly StrokeNode[]) => void;
  suppressDoubleClick: (ms?: number) => void;
  triggerHoverPulse: (bondId: number) => void;
  beginPanHold: (pointerId: number | null) => void;
  endPanHold: (pointerId?: number | null) => void;
  /**
   * The canvas at rest: nothing under the pointer, no gesture under way,
   * nothing being written, carried out of a PDF or asked over it - as it
   * is made again after it failed, the press that would have ended a
   * gesture lost with it (docs/ARCHITECTURE.md, *When a part fails*). What
   * is selected - words in a PDF too - how the molecules in 3D are turned
   * and the column stay as they are.
   */
  letGo: () => void;
  setMoveMode: (mode: "snap" | "free") => void;
  beginMoveDrag: (
    atomId: number,
    pointer?: { x: number; y: number } | null,
  ) => void;
  updateMovePointer: (x: number, y: number) => void;
  setMoveDragPreview: (x: number, y: number) => void;
  /**
   * The file this canvas was last saved to, which Save writes to again; none
   * until it has been saved once.
   */
  savedPath: string | null;
  /**
   * The file last opened over what the canvas held - where it is, where
   * Open said, else its name: what Save As suggests, beside it, the canvas
   * being saved nowhere since.
   */
  openedName: string | null;
  /** The document has just been written to `path`: it is saved there. */
  markSavedAs: (path: string) => void;
  /**
   * A file - where it is, or its name - has been opened on the canvas, as
   * what it starts with: it is saved nowhere yet, and Save asks where,
   * suggesting that name beside it.
   */
  markOpenedOver: (name: string) => void;
  setExtendPreview: (
    x: number,
    y: number,
    join?: { atomId?: number; pathIndex?: number },
  ) => void;
  endMoveDrag: () => void;
  /** The structure a tab opens with: where its document starts, not an edit. */
  openModel: (next: Model, scheme?: ImportedScheme) => void;
  /** Joins what readers reading an output as well have found to each molecule read from it (lib/calc/readings): learnt of the document, not done to it - nothing to undo. */
  joinReadings: () => void;
  /** A file opened over the canvas's contents, as one undo step. */
  replaceModel: (next: Model, scheme?: ImportedScheme) => void;
  /**
   * A workspace file opened: everything in it, as it was saved - over what
   * the canvas holds, as one step, or (`start`) as where the document starts.
   */
  openWorkspace: (ws: Workspace, start?: boolean) => void;
  /** A file dropped onto the canvas, or a SMILES beside what is drawn: added, selected, as one undo step. */
  appendModel: (next: Model, scheme?: ImportedScheme) => void;
  /** Clears hover, selection and gestures after the structure is replaced. */
  forgetInteraction: () => void;
  /** A reaction arrow added, pointing `angle` radians from the x axis (right), as one step; its id. */
  addArrow: (x: number, y: number, angle?: number, length?: number) => number;
  /** An arrow moved or reshaped; a run of changes in one gesture - a drag - is one step. */
  updateArrow: (id: number, patch: Partial<Arrow>, gesture?: string) => void;
  /** A "+" added, as one step; its id. */
  addPlus: (x: number, y: number) => number;
  removeArrow: (id: number) => void;
  /** A "+" moved; a run of moves in one gesture, a drag, is one step. */
  movePlus: (id: number, x: number, y: number, gesture?: string) => void;
  removePlus: (id: number) => void;
  /** What a cut takes, gone as one undo step: atoms, bonds, arrows and pluses. */
  /** What a cut took, gone: the drawn part, and the molecules in 3D by id, in one step. */
  deleteDrawn: (part: Drawn, molecules3d?: number[]) => void;
  /** An abbreviation drawn out as the atoms it stands for, as one undo step. */
  expandAbbreviation: (id: number) => void;
  /** A group of atoms shown as one atom labelled `label`, holding them, as one undo step. */
  contractToAbbreviation: (ids: ReadonlySet<number>, label: string) => void;
  /**
   * What an arrow sets for itself, in place of what it had. `coalesceKey`
   * takes a run of changes to one setting - a slider dragged - as one step.
   */
  setArrowLook: (id: number, look: ArrowLook, coalesceKey?: string) => void;
  requestFit: () => void;
  beginAutoFitSuspend: () => void;
  endAutoFitSuspend: () => void;
  findAtomNear: (
    x: number,
    y: number,
    tol?: number,
    excludeId?: number | null,
  ) => number | null;
  /** An atom's label opened to be written: as it is, or begun with `initial`, a letter typed over it. */
  beginLabelEdit: (atomId: number, initial?: string) => void;
  setLabelEditValue: (value: string) => void;
  /** The label written kept; `typed`, what was typed for it, where it is read as something else. */
  commitLabelEdit: (typed?: string) => void;
  /** An atom's label made what was typed for it, read as nothing else: obz, not OBz - one step. */
  labelAsTyped: (atomId: number) => void;
  cancelLabelEdit: () => void;
  setAromaticEnabled: (v: boolean) => void;
  /**
   * Gives the document its own drawing style, or the application's again
   * (undefined). Changes sharing `coalesceKey` - a drag along a slider - are
   * one undo step.
   */
  setDocumentStyle: (style: StyleChoice | undefined, coalesceKey?: string) => void;
  toggleAromatic: () => void;
  setRingEnabled: (key: string, v: boolean) => void;
  toggleRing: (key: string) => void;
};
