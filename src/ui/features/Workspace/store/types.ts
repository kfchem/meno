import type { Failure, FailureKind } from "../workflow/failures";
import type { Converged } from "../workflow/converged";
import type { LeftOut } from "../utils/readNotes";
import type { ShowBox } from "../utils/viewShow";
import type { ChemMarks } from "../chem/marks";
import type { AtomNumberKind, AtomNumbersShown } from "../utils/atomNumbers";
import type { CyclePatch, ImportedScheme, MarkOf, MarkPlaces, Relayout, WorkspaceDocument, WrittenAsLabel } from "../document";
import type { SetHolds, SetKind, StepKind } from "../workflow/kinds";
import type { OptionValues } from "../../../../lib/options";
import type { ArrowCorner, ArrowForm, ArrowKind, ArrowLook, ArrowWeight } from "../../../../lib/chem/reactionArrow";
import type { ArrowWords, WordsMark } from "../../../../lib/chem/captions";
import type { ShapeGeometry, ShapeKind } from "../../../../lib/chem/shapes";
import type { Cycle } from "../../../../lib/chem/cycle";
export type { Cycle } from "../../../../lib/chem/cycle";
import type { InkPen, InkStroke } from "../../../../lib/chem/ink";
import type { EditorAtom } from "../../../../utils/importers";
import type { Stroke, StrokeNode } from "../utils/stroke";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { Workspace3D } from "../../../../lib/chem/workspaceStyle3d";
import type { Role3D } from "../../../../lib/chem/style3d";
import type { Biopolymer } from "../../../../lib/chem/biopolymer";
import type { BondChem, ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import type { Workspace } from "../utils/workspace";
import type { CalcInfo, Unmarked } from "../../../../lib/calc/output";
import type { NumberValue, Table } from "../../../../lib/table";
import type { ChartValue } from "../../../../lib/chart";
import type { DiagramValue } from "../../../../lib/energyDiagram";
import type { EntryStatus, Property } from "../../../../lib/entry";
import type { PictureMedia } from "../../../../lib/picture/image";
import type { JobState, KeptRole } from "../../../../lib/jobs";
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
  /** Its R or S shown, where it is a stereocentre: asked for on it, its structure or a selection holding it (docs/EDITOR-2D.md, *R and S*). */
  stereoShown?: true;
  /** What was typed for its label, where it was read as something else (obz, read as OBz): had back from its menu. */
  typed?: string;
  /** The colour its label - its charge too - is drawn in, where it is given one (#rrggbb). */
  color?: string;
  /** The colour it is highlighted in, behind the drawing, where it is (#rrggbb; drawn as a light tint). */
  highlight?: string;
  /** Where it was drawn in the figure it was read from - a PDF's, or a picture (docs/PDF.md, *Stage 5*): lit there while it is under the pointer, and it while that place is. */
  seen?: FigureSpot;
  /** What was unsure of it as it was read from a figure: marked until it is changed. */
  unsure?: Unsure;
  /** The stack of drawings it is in, with the record it is of (utils/stacks). */
  stack?: AtomStack;
  /**
   * How large its structure is shown (docs/WORKSPACE.md, *Magnified
   * display*): every atom of a structure says the same; held where it is
   * shown, so many times as far apart about its centre, and read at its
   * true size by whatever is chemistry (lib/chem/magnified2d). Unset, 1.
   */
  magnified?: number;
};
/**
 * Of a stack of drawings - a file's records drawn flat, standing in one
 * place, one shown at a time (utils/stacks) - which stack an atom is in, by
 * its id, which record it is of, by its place in the file, the record's
 * title, and whether the stack is laid out as a grid. As a copy or a file
 * carries it, and only so, whether its record is the one its stack shows.
 */
export type AtomStack = { id: number; record: number; title?: string; spread?: true; shown?: true };
/**
 * A stack of drawings going over from one record to the next (EditorState
 * `recordSwaps`) - or, stacked again, from all of them to one: the records
 * going out of sight then, as they stood (`gone`).
 */
export type RecordSwap = { from: number[]; to: number[]; start: number; gone?: Model };
/**
 * A place on a PDF's page - the PDF, by its SHA-256, the page, and the
 * point, in points from its top left - or in a picture: the picture, by its
 * SHA-256, no page, and the point in its pixels from its top left; and how
 * long the bonds of the figure there are drawn, in the same, which says how
 * near is near.
 */
export type FigureSpot = {
  sha256: string;
  page?: number;
  x: number;
  y: number;
  bond: number;
  /** Said to have been checked against the figure, by the chemist (docs/PDF.md, *Read from a figure*): its structure's note gone. */
  checked?: true;
};
/** What Meno said was unsure of a part as it read it from a figure, and what the part was then (utils/figures `partAs`): marked while it is still that. */
export type Unsure = { said: string[]; as: string };
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
  /** Its E or Z shown, where it has one, as an atom's R or S (`Atom.stereoShown`). */
  stereoShown?: true;
  /** The colour it is drawn in, where it is given one (#rrggbb). */
  color?: string;
  /** The colour it is highlighted in, behind the drawing, where it is (#rrggbb). */
  highlight?: string;
  /** What was unsure of it as it was read from a figure: marked until it is changed. */
  unsure?: Unsure;
};

import type { FlowParts } from "../workflow/parts";
import type { GuideMarks } from "../presenting/guides";

export type Sel = { atoms: Set<number>; bonds: Set<number> };
/** A workflow's parts selected, as the drawing's are (docs/WORKFLOWS.md, *Copying*): sets and steps, by id - the wires among them with them. */
export type SelFlow = { sets: Set<number>; steps: Set<number> };

export type Model = { atoms: Atom[]; bonds: Bond[] };
/** Rings filled with a colour (#rrggbb), behind the drawing, by each ring's key: its atoms' ids, ascending, joined by "-" (utils/rings). */
export type RingFills = Record<string, string>;
/**
 * An arrow (docs/EDITOR-2D.md, *Arrows*): a reaction's, or any - where its
 * middle is, which way it points from its tail to its point and how far
 * apart they are; its kind, heads, dashes, weight and the corners its line
 * turns at (lib/chem/reactionArrow `ArrowForm`); its colour (#rrggbb; none
 * of its own, the bonds' ink).
 */
export type Arrow = ArrowForm & {
  id: number;
  x: number;
  y: number;
  angle: number; // radians
  length: number; // world units
  /** What it sets for itself over the drawing style: its line and its head. */
  look?: ArrowLook;
  color?: string;
  /** Its reaction's atom map, where one was made (chem/atomMap). */
  atomMap?: ArrowAtomMap;
};
/**
 * A drawn reaction's atom map, kept on its arrow (docs/ATOM-MAPPING.md, *On
 * a drawn scheme*): each side in 3D as one structure, as it was mapped, and
 * the drawn atom each of its atoms is (none for a hydrogen made for it);
 * every complete map, best first - for each product atom, its reactant
 * atom - none where the atoms do not all map; the one shown and used; and
 * whether its numbers and reacting centres are shown on the drawing. What
 * the drawing was when it was made (chem/make3d `signatureOf`) tells a map
 * of a drawing changed since.
 */
export type ArrowAtomMap = {
  drawnAs: string;
  reactant: { atoms: { el: string; x: number; y: number; z: number; charge?: number }[]; bonds: { a1: number; a2: number; order: number }[]; drawnFrom: (number | null)[] };
  product: { atoms: { el: string; x: number; y: number; z: number; charge?: number }[]; bonds: { a1: number; a2: number; order: number }[]; drawnFrom: (number | null)[] };
  maps: number[][];
  complete: boolean;
  chosen: number;
  shown: boolean;
};
/** A change to an arrow's form and colour: each said is set - its kind, its heads (1 or 2), an equilibrium's full heads, dashes, weight, corners (none: straight) and colour - null or "regular" taking what it set away. */
export type ArrowFormPatch = {
  kind?: ArrowKind | null;
  heads?: 1 | 2;
  full?: boolean;
  dash?: boolean;
  weight?: ArrowWeight | "regular";
  corners?: ArrowCorner[] | null;
  color?: string | null;
};
/** A "+" between two structures of a reaction scheme: where its middle is. */
export type Plus = { id: number; x: number; y: number };
/**
 * Where an electron-pushing arrow starts or ends (docs/EDITOR-2D.md,
 * *Electron-pushing arrows*), by id: an atom - from its lone pair, where
 * one is drawn there - a bond, or two atoms with a gap between them, where
 * a bond forms.
 */
export type PushEnd = { atom: number } | { bond: number } | { gap: [number, number] };
/**
 * An electron-pushing arrow: from where to where, its head half - a
 * fishhook, one electron - or full, its bend (lib/chem/pushArrow
 * `PushBend`; unset, as Meno bends it), a lone pair's dots left off its
 * tail (`noPair`), from an atom with a negative charge, from a lone pair
 * rather than its charge's mark (`fromPair`), and the colour it is drawn
 * in, where it is given one (#rrggbb; else the bonds' ink).
 */
export type PushArrow = { id: number; from: PushEnd; to: PushEnd; half?: true; bend?: { along: number; out: number }; noPair?: true; fromPair?: true; color?: string };
/** A press on words on the page that opens them to be written: where on the page, where on the screen and when - and whether a drag goes on from it. */
export type CaptionPress = { at: { x: number; y: number }; client: { x: number; y: number }; t: number; drag: boolean };

/**
 * Words on the page - a reaction's reagents and conditions, or anything
 * else - where their middle is (lib/chem/captions); over or under an arrow,
 * `arrow`, going where it goes.
 */
/** Words on the page: where their middle is, what they say, the arrow they are over, - made as wide as something - how wide they are, broken into lines at it, how their lines lie in it, centred unless said (lib/chem/captions), and - taken out of a PDF - where they came from. */
export type Caption = {
  id: number;
  x: number;
  y: number;
  text: string;
  arrow?: number;
  width?: number;
  align?: "left" | "right" | "justify";
  from?: WordsFrom;
  /** Its own size, in points; unset, the drawing's labels' (lib/chem/captions `wordsFontPx`). */
  size?: number;
  /** Its own typeface, by name; unset, the drawing's labels' (lib/chem/captions `wordsLabelSet`). */
  font?: string;
  /** Its own line spacing, as a multiple of single spacing; unset, single (lib/chem/captions `wordsLineEms`). */
  lines?: number;
  /** Letters of it set otherwise than the rest - bold, in italics, in a colour, raised or lowered - apart and in order (lib/chem/captions `WordsMark`). */
  marks?: WordsMark[];
};
/**
 * A change to words on the page: written anew, moved, put over an arrow or
 * taken from one (`arrow` null), made as wide as something or as their
 * words (`width` null), laid otherwise, given a size, a typeface or a line
 * spacing of their own or the labels' (`size`, `font`, `lines` null),
 * their letters marked otherwise (`marks`, none for plain).
 */
export type CaptionPatch = {
  text?: string;
  x?: number;
  y?: number;
  arrow?: number | null;
  width?: number | null;
  align?: "left" | "center" | "right" | "justify";
  size?: number | null;
  font?: string | null;
  lines?: number | null;
  marks?: WordsMark[];
};
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
  /** Writing by hand on its pages, each piece on the page it was begun on and going wherever that goes (docs/PRESENTING.md, *Handwriting*). */
  inks?: PdfInk[];
  /**
   * Read in the column, its name among the texts' (docs/PDF.md, *In the
   * column*): where the column's top was, in pages from the first's top -
   * 2.5, half way down the third, the gap under it counted - and how large
   * its pages were, 1 as wide as the column. Kept, not a step to undo.
   */
  reading?: PdfReading;
  /** The page's units in one of its points, as it was laid: the workspace's (lib/pdf/layout `pointFor`), scaled with the page as its style changes (restyle); unset, ACS 1996's (`POINT`). */
  point?: number;
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

/**
 * A slide (docs/PRESENTING.md): a frame on the page round what a talk shows
 * at one point of it - where its middle is, and how wide and tall it is, in
 * the page's units. What lies in it is the page's own; the slide says only
 * what is shown. The slides' order is the talk's. `around`: while it is
 * shown, the page about it is seen too, not veiled.
 */
export type Slide = { id: number; x: number; y: number; w: number; h: number; around?: true };

/**
 * A shape on the page (docs/PRESENTING.md, *Shapes*): a rectangle - its
 * corners square or rounded - an ellipse or a line, where and how
 * lib/chem/shapes says - and its line's colour (none of its own, the
 * drawing's ink; "none", no line) and its fill (none of its own, none).
 * A shape is a shape: no words in it. Each lies over those before it.
 */
export type Shape = ShapeGeometry & { id: number; stroke?: string; fill?: string };
/**
 * A change to a shape: where it lies, its corners' radius (0, square), its
 * line's width in points (null, as the drawing's bonds), dashed or not, its
 * line's colour and its fill (null, none of its own).
 */
export type ShapePatch = Partial<Pick<ShapeGeometry, "x0" | "y0" | "x1" | "y1" | "radius">> & {
  width?: number | null;
  dash?: boolean;
  stroke?: string | null;
  fill?: string | null;
};
/** A shape being drawn from Quick Add: its kind, where it was begun, where the pointer is, and whether Shift keeps it even. */
export type ShapeDraft = { kind: ShapeKind; from: { x: number; y: number }; to: { x: number; y: number }; even: boolean };

/**
 * A piece of writing by hand on the page (docs/PRESENTING.md,
 * *Handwriting*): strokes written one after another in one pen, near each
 * other - selected, moved, coloured and deleted together. `width`, which of
 * the pen's three widths (lib/chem/ink `INK_WIDTHS_PT`: a pen's first as wide
 * as the drawing's bonds, following its style); `color`, its own -
 * none, a pen's is the drawing's ink and a marker's the first of the colour
 * set in use (lib/chem/ink `markerColour`).
 */
export type Ink = { id: number; pen: InkPen; width: 0 | 1 | 2; color?: string; strokes: InkStroke[] };
/** A piece of writing by hand on a PDF's page: as one on the page (`Ink`, but numbered by its place among its PDF's), on page `page`, its strokes' points in that page's points from its top left. */
export type PdfInk = Omit<Ink, "id"> & { page: number };
/** What a stroke is written in: the pen, its width, its colour. */
export type InkLook = Pick<Ink, "pen" | "width" | "color">;
/** Writing with a mouse or a trackpad, its card open: what writes - a pen, a marker or the eraser - in what colour and width. */
export type InkMode = { tool: InkPen | "eraser"; color: string | null; width: 0 | 1 | 2 };

/** A talk being given from the slides: the slide shown, by its place in their order. */
export type Presenting = { at: number };

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
  /** The page's units in a point of the PDF it is cut out of (lib/pdf/layout `pointOf`). */
  point: number;
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
  /**
   * Why a program step could not do it, frame by frame (null, a frame it
   * did): what a step's Failed exit holds (workflow/failures) - kept with
   * it, its chip saying it in plain words.
   */
  failed?: (Failure | null)[];
  /**
   * Where a run ended converged, frame by frame (workflow/converged; null,
   * a frame none did): an optimisation, a saddle point's, a path's highest
   * point refined - each of its frame's geometry, by its key.
   */
  converged?: (Converged | null)[];
  /**
   * A conformer set's: the imaginary frequencies each conformer's
   * calculation judged it has (lib/calc/output `CalcInfo.imaginary`), frame
   * by frame - null, none. A single geometry's are its calculation's own.
   */
  imaginary?: (number[] | null)[];
  /**
   * Its file's marks of which frames failed, or are no minimum (`failed`,
   * `imaginary`), did not read: kept as such - its frames' state not known,
   * so that no step weighs one as a minimum (utils/copyPaste
   * `readCarried3D`, workflow/meno `notAllMinima`).
   */
  marksUnread?: true;
  /** Each frame's energy, where its file gives one, in hartrees: the first frame's first. */
  energies?: number[];
  /** Switched to the 3D style's secondary look; unset, drawn in its primary. */
  look?: Look3D;
  /**
   * How large it is shown (docs/WORKSPACE.md, *Magnified display*): 1.5,
   * half as large again as it is; unset, at its true size. Applied after
   * `solidOf`, about its own place - its ångströms stay true.
   */
  magnified?: number;
  /** Its atoms' names and residues and its secondary structure, where it is a PDB entry's chains: drawn as ribbons (lib/chem/biopolymer). */
  biopolymer?: Biopolymer;
  /**
   * Its bonds' orders, where its file gives none - coordinates alone: an
   * XYZ file, a calculation's output, a PDB entry (its ligands; its chains'
   * own are not known): "unknown" until they are found from its shape by
   * the RDKit plugin ("perceived"), given from a SMILES ("assigned") or
   * from the wwPDB's Chemical Component Dictionary ("dictionary"), or
   * estimated from its atoms' distances ("estimated"). Unset, its file gave
   * them (utils/completeness).
   */
  bondOrders?: "unknown" | "perceived" | "assigned" | "dictionary" | "estimated";
  /** Whole without hydrogens, as the chemist has said of a molecule Meno took for a skeleton (lib/chem/skeleton): it has none to add. */
  wholeWithoutH?: true;
  /**
   * The hydrogens its file left out, added - each part's (all of it; for a
   * PDB entry, a ligand's), by its atoms then: as the chemist chose how it
   * is protonated ("chosen"), or as the CCD defines them ("dictionary").
   * Said over it, as they were not in its file (utils/completeness).
   */
  hydrogensAdded?: { by: "chosen" | "dictionary"; atoms: number[] }[];
  /** Where a PDB entry's ligands' bond orders, and their charges, came from, by residue: a SMILES, the CCD, an estimate from distances. */
  ligandOrders?: Record<number, "assigned" | "dictionary" | "estimated">;
  /** The atoms of a PDB entry's ligands whose bonds' orders are still unknown, where others' were found. */
  unknownOrders?: number[];
  /** A PDB entry's chains' bond orders, given residue by residue from the Chemical Component Dictionary: every residue of its chains'. */
  chainOrders?: "dictionary";
  /** How many of its file's frames were left out as it was read - cut short, or with an atom whose place does not read: said over it (utils/completeness `leftOutMark`). */
  framesLeftOut?: number;
  /** How many of its atoms stood in one place with another as it was read - a damaged file, or none of a molecule's: said over it (utils/completeness `TOGETHER_MARK`). */
  together?: number;
  /**
   * Made by editing a result's shape (utils/edit3d): what it was made from -
   * "conformer 7", "frame 12", an output's name - as its chip says it.
   */
  edited?: { from: string };
  measures?: Measure3D[];
  /** The file it came from. */
  name?: string;
  /** Its record's title, where its file gives one: an SD file's record's first line (a stack's chip says it). */
  title?: string;
  /**
   * One of a stack: the molecules one file brought - an SD file's records -
   * standing in one place, one shown at a time (utils/stacks), by the
   * stack's id; laid out as a grid instead (`spread`), each where it stands.
   */
  stack?: { id: number; spread?: true };
  /**
   * The drawing it was made from: the drawing's atom each of its atoms is,
   * by id; null, a hydrogen made for it or an atom written out of an
   * abbreviation.
   */
  drawnFrom?: (number | null)[];
  /** What its drawing was when it was made from it (chem/make3d `signatureOf`). */
  drawnAs?: string;
  /**
   * Its bonds from a metal to the centre of a ring, a chain or a double
   * bond of its atoms (eta: Cp, benzene, allyl, an alkene), by atom index:
   * each drawn as one stick from the metal to its atoms' centre, as its
   * drawing has one line (utils/molecule3d `withCentres`). Its atoms keep
   * their own bonds; the star at the centre is no atom of it.
   */
  centres?: { metal: number; atoms: number[] }[];
  /** Its frames are conformers - not a path through time - so each is as likely as its energy says (`populations`). */
  conformerSet?: boolean;
  /**
   * It is only some of a search's conformers, or one of them (docs/WORKFLOWS.md,
   * *A part of a search*): those chosen from its set's table, those an
   * Energy window or Choose one split from the others, the copies
   * Duplicates took out - and what any step makes of them. No share is
   * shown of them, for shares of these alone would not be the compound's
   * populations; a *Populations* step on them works shares out, and says
   * of what.
   */
  partOf?: true;
  /**
   * How it was made, where something made it - its conformers' method and
   * force field - as rows to show, in the words of what made it; and what
   * its energies are (`energies`), where it gave them: the force field's
   * name, as it said it.
   */
  made?: { method?: string; how: { label: string; text: string }[]; energies?: string };
  /** What the text it was read from says of it - its charge and multiplicity, its energies - where it was read from coordinates in a text (lib/io/coordinates), as rows to show. */
  said?: { label: string; text: string }[];
  /**
   * Its bonds are where its atoms stand close enough, as its file gives no
   * bonds - an XYZ file's, a calculation's: frame by frame, so that a bond
   * forms and breaks as its frames go (utils/molecule3d `frameBondsOf`).
   */
  bondsFrom?: "distance";
  /**
   * How many of its file's atoms it leaves out, their element not read - a
   * PDB entry's unknown atom (X, UNX), say: said over it (utils/molecule3d
   * `notesOf`).
   */
  atomsLeftOut?: number;
  /**
   * Its stereocentres' and double bonds' CIP labels, by atom and bond index;
   * which of them its drawing left open - one stereoisomer of several made
   * from it - so that it is told apart from the others; and which are shown
   * (`shown`), as asked for on it or on them - where none has been, those
   * its drawing left open (`stereoShownOf`).
   */
  stereo?: { atoms: Record<number, string>; bonds: Record<number, string>; chosen?: { atoms: number[]; bonds: number[] }; shown?: { atoms: number[]; bonds: number[] } };
  /** The numbers shown on its atoms (utils/atomNumbers): of what kind, and on which of them - all, given none; unset, none. */
  atomNumbers?: AtomNumbersShown;
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
  /** Each frame's degeneracy - how many forms of it its conformer search found alike (its rotamers) - where it said: a Boltzmann weight counts each. */
  degeneracies?: number[];
  /**
   * Each frame's properties by name, as lib/entry has them - each with its
   * unit and what worked it out (a model's NLL, a descriptor) - where a
   * step or a plugin gave them (docs/WORKFLOWS.md, *Filter*): what a step
   * that works on entries reads and keeps as they were.
   */
  properties?: Record<string, Property>[];
  /**
   * Each frame's mirror image counted in, where Duplicates counted one in
   * (workflow/meno): the atoms the mirror image swaps - atom i of this
   * conformer plays the part of atom `mirrors[f][i]` in its mirror image -
   * so that an average by atom can be made over both; null, none counted in.
   */
  mirrors?: (number[] | null)[];
  /**
   * Its frames are the path to its last geometry - an optimisation's, made
   * by a step (docs/WORKFLOWS.md, *Results*) - so that a set takes it as
   * that one entry, not as many compounds.
   */
  path?: true;
  /**
   * Of an opened optimisation's or relaxed scan's geometries - its own
   * first, then its frames, from 0 - those the run found converged, which a
   * set takes as its entries: an optimisation's last, a scan's each point.
   * The rest are steps on the way, shown, never entries; empty, where none
   * converged. None where every geometry is one (docs/WORKFLOWS.md,
   * *Compound sets and conformer sets*).
   */
  entryFrames?: number[];
  /** An opened optimisation or scan whose last point never converged - stopped, or cut short: that point no entry, and said so over it (completeness `notConvergedMark`). */
  notConverged?: true;
  /**
   * Why none of its geometries is an entry, where it is not that none
   * converged (lib/calc/output `Unmarked`): the run did not end as it
   * should, they are the points of a scan or a reaction path, the file does
   * not say which converged, or which did could not be read. Said over it
   * (completeness `entriesMark`).
   */
  noEntryWhy?: Unmarked;
};
/**
 * A text the workspace holds - a file opened as text, an output shown -
 * read and edited in the column beside the canvas (docs/WORKSPACE.md,
 * *Texts*): its name, and where it was opened from, where Open said.
 */
/** A place between a PDF's letters: on which page, before which letter (lib/pdf/text). */
export type WordPlace = { page: number; at: number };
/** Words selected in a PDF (docs/PDF.md, *Text*): from where the selection was begun to where it has been drawn to - either way round. */
/** A structure of a PDF's figure (utils/pageStructures): which PDF, which page, which figure there by its box, and its key among the page's structures. */
export type PdfStructurePick = { id: number; page: number; figure: [number, number, number, number]; key: string };
/**
 * A structure carried out of a PDF (docs/PDF.md, *Structures picked from a
 * PDF*): Meno's drawing of it (SVG, its size in the drawing's units), where
 * it lay in the window when it was pressed, where it was pressed, when it
 * set off, where the pointer is and whether over the canvas, and how it
 * ends - put down on the page, or gone back.
 */
export type StructureFlight = {
  svg: string;
  w: number;
  h: number;
  from: { left: number; top: number; width: number; height: number };
  grab: { x: number; y: number };
  start: number;
  now: { x: number; y: number; over: boolean; end: { to: "page" | "back"; start: number } | null };
};
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
export type WorkspaceText = { id: number; name: string; text: string; path?: string; at?: { x: number; y: number }; point?: number; reading?: false; icon?: true; of?: TextOf };
/**
 * A text its workspace's file was to hold whose words could not be read -
 * damaged there, or not there (docs/FILE-IO.md, *The workspace file*): kept
 * as the file named it, by its name and its SHA-256, with where it lay and
 * what it was the text of, and shown in the column as what it is - never
 * as a text, having no words: nothing to edit, copy, find or read. It stays
 * until it is taken away, or a text of the same words comes.
 */
export type LostText = Omit<WorkspaceText, "text" | "path"> & { sha256: string };
/** What a text without a sheet is the text of, its body on the page: a step, whose log it is; or a molecule, shown from whose menu it is that molecule's output. */
/** What a text is the text of: a step - its log; where the step ran several jobs, all of them (`jobs`) and the one shown (`job`, its place among them) - or a molecule. */
export type TextOf = { step: number; jobs?: string[]; job?: number } | { molecule: number };
/**
 * A set on the page (docs/WORKFLOWS.md): its frame, in world units, x0 to
 * x1 and y0 (its foot) to y1 (its top) - what lies inside it its entries.
 * Made by a step: the step and which of its exits, and - once it has run -
 * the kind of set it holds (a Render step's, pictures).
 * Made by the chemist, a set is a compound set - named where it was given
 * a name (`name`: where its structures came from, or the chemist's own),
 * *Input* where not.
 */
export type WorkflowSet = {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /**
   * The step and exit that made it: every exit has a set of its own, made
   * with the step and empty until it runs - and what it holds, once it has
   * run. Not run yet, it says nothing it does not know (flow `givesOf`).
   */
  made?: { step: number; exit: string; holds?: SetHolds };
  name?: string;
  /**
   * What it holds, in order (docs/WORKFLOWS-FOUNDATION.md, *Members are
   * explicit*): each a structure drawn (by its atoms' ids), a molecule in
   * 3D or a picture (by id). Dropping something into the frame adds it at
   * its place, dragging it out takes it out, a frame resized takes in and
   * lets go of what then lies inside it or not (workflow/model
   * `membersSettled`); a step's result set holds what the step made, in its
   * order. None yet: what lies inside it, as a set was before.
   */
  members?: Member[];
  /**
   * A set copied, as it is put down: the records of the structures drawn it
   * held, each by its atoms' ids as pasted - taken up by those structures as
   * its members are found from what lies inside it (workflow/model
   * `membersSettled`), then gone.
   */
  carried?: { structure: number[]; record: DrawnRecord }[];
  /**
   * A result set of structures drawn: the atoms, by id, its step put on the
   * page as it last ran - all it takes away when the step runs again. A
   * structure the chemist joined to one of them by a bond keeps its own
   * atoms.
   */
  put?: number[];
  /** A result set of a series made from one template: the core its structures share, by their atoms' places (`SeriesCore`). */
  core?: SeriesCore;
  /**
   * A result set of more entries than are laid out on the page
   * (docs/WORKFLOWS-FOUNDATION.md, *What a set shows*: more than
   * `LARGE_SET`): what the step gave, held in the set itself, in the step's
   * order - each a molecule in 3D as it would be on the page, but on none.
   * Its frame shows them summed up; the steps after it take them from here.
   */
  collection?: Omit<Molecule3D, "id" | "at">[];
  /**
   * A result set of more structures drawn than are laid out on the page
   * (`LARGE_SET`, as `collection` is for molecules in 3D): what the step
   * drew, held in the set itself, in the step's order - each drawn on its
   * own, its atoms numbered within it, with what its step said of it - but
   * on no page. The steps after it take them from here.
   */
  drawnCollection?: DrawnModel[];
  /** A result set opened from a file, or an earlier run's shown again: how many of its molecules or structures did not read, and were left out - said with its count until the step runs again. */
  unread?: number;
  /** A table it holds (lib/table, docs/WORKFLOWS.md *Tables*): read from a file and put on the page, or a step's; no members then. */
  table?: Table;
  /** A number it holds, with its unit and what worked it out: a step's. */
  number?: NumberValue;
  /** A chart it holds (docs/WORKFLOWS.md *Charts*): a Chart step's, one column of a table against another (lib/chart) - or an Energy diagram's (lib/energyDiagram). */
  chart?: ChartValue | DiagramValue;
  /** A result set kept out of the workspace's file (*Don't keep in the file*): its members are not saved. */
  keep?: false;
  /** A result set opened from a file that did not keep it: how many it held, and their collection's hash. */
  notKept?: { count: number; hash: string };
};
/**
 * What a structure drawn that a step gave keeps of its own, as an entry
 * (lib/entry `Entry`) keeps it - the drawing itself its structure and its
 * geometry, in 2D: the entries it was made from (`from`, by id, where they
 * have one), its properties by name, and whether it is done or was set
 * aside, and why. All of it optional: a structure the chemist drew has none.
 * `of` is the structure it was given for, as a key of its identity, not
 * of how it is drawn (workflow/entries `drawnHash`): edited since, the
 * structure is another, and its properties and status are taken away,
 * `stale` saying why.
 */
export type DrawnRecord = { from?: string[]; properties?: Record<string, Property>; status?: EntryStatus; of?: string; stale?: string };
/** A structure drawn as a step gave it: the drawing, and its record where it has one. */
export type DrawnModel = Model & { record?: DrawnRecord };
/** One of a set's members: a structure drawn, by its atoms' ids, with its record, where a step gave it one; a molecule in 3D, or a picture, by id. */
export type Member = { structure: number[]; record?: DrawnRecord } | { molecule: number } | { picture: number };
/**
 * The core a series of structures drawn shares (Enumerate's: docs/WORKFLOWS-FOUNDATION.md,
 * *R groups*, "the set carries its core"): its template's atoms but its R atoms,
 * the bonds between them, and where each R group is attached - each by its
 * place in a product's atoms, the same in every product - so that what
 * comes after can line them up exactly. By substituents, the template's
 * atoms but the drawn H's chosen, and each position (P1, P2) by the atom
 * its group is bonded to.
 */
export type SeriesCore = { atoms: number[]; bonds: [number, number][]; attach: Record<string, number[]> };
/**
 * What a step did when it last ran: when, whether it did, what it says, and
 * what came into it (`inputKey`: so that it shows when that has changed) -
 * and, where it ran jobs, whether it was stopped, how long it took (ms), and
 * its jobs, by id, whose logs and files are kept until finished jobs are cleared;
 * and the kind and options it ran with.
 */
/**
 * What a step did when it ran: when, whether it did, what it said, what came
 * in (`inputKey`), whether it was stopped and how long it took, its jobs, and
 * its kind and options then, its jobs' keys and what they gave - and
 * whether the chemist keeps it (`keep`: docs/WORKFLOWS.md, *Earlier runs*),
 * never dropped while kept;
 * and what a workspace's file kept of its jobs (`kept`).
 */
export type StepRan = {
  at: number;
  ok: boolean;
  said: string;
  input: string;
  stopped?: true;
  took?: number;
  jobs?: string[];
  /** Its jobs' keys, one for each of `jobs` (lib/jobKeys): what a later run finds a job to take up again by. */
  keys?: string[];
  /** What each of `jobs` gave as it was read, as one digest (lib/jobs `jobDigest`) - none where it was not read: a job taken up again must give the same. */
  gave?: (string | null)[];
  /** How each of `jobs` ended, as its record said as the run ended - where there were several: what its log's chooser says of each, the workspace reopened (TextColumn). */
  states?: JobState[];
  /** Stopped on output Meno cannot account for: the jobs it could not, by id, and the run as it stood - for *Adopt* to take up again. */
  unaccounted?: string[];
  held?: StepRunning;
  /** The jobs whose output the chemist adopted, by id, with when (ms since 1970): taken as the step's result though Meno could not account for it. */
  adopted?: Record<string, number>;
  kind?: StepKind;
  options?: OptionValues;
  /** What a workspace's file kept of each of its jobs, as it was opened (workflow/keptJobs): written afresh each save from the jobs' folders where they are on this computer. */
  kept?: KeptJob[];
  /** A run the chemist keeps (docs/WORKFLOWS.md, *Earlier runs*): never dropped while kept. */
  keep?: true;
  /** Every seed its line counts but does not name - made none, or not read, with why (workflow/programs `seedsSaid`): shown where the line is pointed at. */
  named?: string;
};
/** A job's file a workspace's file keeps (docs/FILE-IO.md, *A step's jobs*): its name in the job's folder, SHA-256, size, and what it is to the job. */
export type KeptJobEntry = { name: string; sha256: string; size: number; role: KeptRole };
/** A job's file a workspace's file does not keep - its step keeps no raw outputs, or it was not to be had - by its name and size. */
export type LeftJobEntry = { name: string; size: number; why: "raw" | "not had" };
/** What a workspace's file keeps of one of a step's jobs, and what it left out: nothing left out unsaid. */
export type KeptJob = { job: string; files: KeptJobEntry[]; left?: LeftJobEntry[] };
/**
 * An earlier run a step keeps (docs/WORKFLOWS.md, *Results*): what it did
 * then - its kind and options as they were - and what it gave, as its
 * result set held it, so that it can be shown again.
 */
export type StepRunKept = StepRan & { kind: StepKind; options?: OptionValues; results?: RunKeptResults };
/**
 * What a run gave, as its exits' sets hold it and an earlier run kept
 * keeps it: the molecules its first exit held, those its second held, and
 * what kind of set they make - with how many of each did not read from a
 * file, and were left out (`unread`, `restUnread`). Where they are
 * structures drawn, `drawn` holds them instead, each as drawn - its atoms,
 * its bonds and where they lie - and the two lists of molecules are empty.
 */
export type RunKeptResults = {
  molecules: Omit<Molecule3D, "id" | "at">[];
  rest: Omit<Molecule3D, "id" | "at">[];
  holds: SetKind;
  unread?: number;
  restUnread?: number;
  drawn?: { made: DrawnModel[]; rest: DrawnModel[]; core?: SeriesCore };
  /** The tables its later exits hold, by exit (an Atom map's bond changes). */
  tables?: Record<string, Table>;
};
/**
 * A job a step's run started (lib/jobs): its id; the entries it is for, by
 * their place among those that came in; and the files of its folder its
 * plugin reads back once it is done.
 */
/** A job of a step's run: its id, the entries it is for, the files it reads back - and, a Render's, the size its picture takes on the page. */
export type StepJob = {
  id: string;
  entries: number[];
  reads: string[];
  size?: [number, number];
  /** Its key (lib/jobKeys): what it runs and the versions of what runs it. */
  key?: string;
  /** A job whose key this workspace had run to the end before: not run again, what it gave taken up again. */
  reused?: true;
  /** A job taken up again: what it gave when it was first read, as one digest - what it gives now must be the same. */
  gave?: string;
};
/**
 * A step's run while its jobs wait or run (docs/WORKFLOWS.md, *Running*):
 * when it started, what came into it (`inputKey`), its options as they
 * were, and its jobs - kept in the workspace, so that one opened again picks
 * them up.
 */
export type StepRunning = {
  at: number;
  input: string;
  options: OptionValues;
  jobs: StepJob[];
  kind?: StepKind;
  /** The jobs whose output the chemist adopted, by id, with when: not checked again as it is taken up. */
  adopted?: Record<string, number>;
  /** Where some of its jobs ask for more than Settings lets jobs use, though no more than the computer has: said, in plain words: nothing else that declares memory runs beside one. */
  over?: string;
  /** What its plugin says of how it prepared its jobs, in plain words (programs `readNote`): said on its line when it ends. */
  note?: string;
  /** How a step of two inputs paired them, where it is said on its line: "paired in order, by place", two conformer sets paired by their places (programs `programEntries`). */
  paired?: string;
  /** The entries its plugin refused as it prepared the others' jobs: each by its place among those that came in, and why - out of its Failed exit when it ends. */
  refused?: { entry: number; kind: FailureKind; why: string }[];
  /** The lone atoms it passed through as they came, its plugin's program taking none (workflow/programs `passesAsLone`): each by its place among those that came in - out of its Done exit when it ends, never sent. */
  passed?: number[];
};
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
  /** *Don't keep raw outputs*: its jobs' files kept in the workspace's file are only what they were given, what was read back of them, and their logs. */
  keepRaw?: false;
};
/** Where a wire starts: a set - a step's exits are sets of their own, so a step has no give port of its own. */
export type WireEnd = { set: number };
/** Where a wire ends: a step, and which of its inputs. */
export type WireTo = { step: number; port: string };
/** A wire, from the set that gives to the input that takes it. */
export type Wire = { id: number; from: WireEnd; to: WireTo };
/** What of a workflow is the view's, not the document's. */
export type WorkflowView = "hoveredSet" | "chosenSet" | "hoveredStep" | "hoveredWire" | "openStep" | "choosingAtoms" | "wireDrag" | "wireRefused" | "workflowMenu" | "askDeleteStep" | "askDeleteSet";
/**
 * A job of a step's, as last looked at (lib/jobs): where it is, when it
 * was asked for, started and ended; its place among those waiting, where it
 * waits; and the last line of its log, where it runs.
 */
export type JobSeen = { state: JobState; created: number; started?: number; ended?: number; place?: number; line?: string; progress?: { done: number; total: number } };
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
export type Carried3D = Omit<Molecule3D, "id"> & { turn?: Turn3D; frame?: number; list?: CarriedList; shown?: true };
/** What is drawn, as a copy carries it: the drawing, its arrows, pluses and words, molecules in 3D - and a workflow's parts (sets, steps and the wires among them). */
export type Drawn = Model & {
  /** The bond's printed length in the style of the workspace it was copied from (`bondLengthPt`): pasted where that differs, what it carries is converted (docs/WORKSPACE.md, *Drawing style*). */
  bondPt?: number;
  /** How large the style it was copied in set its labels, in pt (restyle `labelPtOf`): words given no size are kept that large where pasted. */
  labelPt?: number;
  pushes?: PushArrow[];
  ringFills?: RingFills;
  arrows?: Arrow[];
  pluses?: Plus[];
  captions?: Caption[];
  molecules3d?: Carried3D[];
  flow?: FlowParts;
  pictures?: PictureItem[];
  /** PDFs carried: each as it lies - its file by its SHA-256, held in Meno's cache - not where it is read. */
  pdfs?: PdfItem[];
  /** Texts' sheets carried: each text whole, where its sheet lies. */
  sheets?: WorkspaceText[];
  /** Slides carried, in their order (docs/PRESENTING.md). */
  slides?: Slide[];
  /** Shapes carried, from the back (docs/PRESENTING.md, *Shapes*). */
  shapes?: Shape[];
  /** Writing by hand carried, each piece whole (docs/PRESENTING.md, *Handwriting*). */
  inks?: Ink[];
  /** Catalytic cycles carried (lib/chem/cycle). */
  cycles?: Cycle[];
  /** What the copy held that could not be read, and was left out (utils/readNotes): said as it is pasted. */
  leftOut?: LeftOut;
  /** Of what is exported, the structures each set selected holds off the page, by the set's id (`WorkflowSet.drawnCollection`): written with it, after those it shows - holding is for the page only. */
  held?: Record<number, DrawnModel[]>;
};

export type EditorState = {
  /** The drawing as it is shown: of each stack of drawings, the record it shows, and the rest (utils/stacks `shownModel`). What the canvas draws and works on. */
  model: Model;
  /** The document's whole drawing, every record of each stack of drawings in it: what is saved and exported. */
  fullModel: Model;
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
  /** The drawing's atom read from a figure whose place there is under the pointer, by id: lit in the drawing too. */
  figureLit: number | null;
  /** The molecules in 3D on the page. */
  molecules3d: Molecule3D[];
  /** The texts the workspace holds, in their column's order. */
  texts: WorkspaceText[];
  /** The texts its file was to hold that could not be read, after them in the column (`LostText`). */
  textsLost: LostText[];
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
  /**
   * The marks the canvas shows on the drawing this moment (chem/useChemMarks),
   * for a picture made of it to show R, S, E and Z as the canvas does
   * (chem/marks `stereoPictureItems`): neither saved nor undone.
   */
  shownMarks: ChemMarks | null;
  setShownMarks: (marks: ChemMarks | null) => void;
  /** How wide the column is when it is open, in CSS pixels, as its edge was dragged: what it shows is laid out at that width as it slides. */
  columnWidth: number;
  setColumnWidth: (px: number) => void;
  /**
   * Whether the PDF or text in the column fills the workspace - the canvas
   * covered, the tabs and the column's header kept (docs/WORKSPACE.md,
   * *Texts*): the tab's own while it is open, never saved. Hiding the
   * column takes it back beside the canvas.
   */
  columnFilled: boolean;
  setColumnFilled: (on: boolean) => void;
  /** How wide the column was dragged showing a PDF, in CSS pixels; none, three quarters of the canvas (utils/texts `columnWidthFor`). */
  pdfColumnWidth: number | null;
  setPdfColumnWidth: (px: number) => void;
  /** The PDF the column shows, among those read there; none, it shows the text it shows (docs/PDF.md, *In the column*). */
  pdfShown: number | null;
  /**
   * The sets read as tables in the column, by id, in the order they were
   * opened (docs/WORKFLOWS-FOUNDATION.md, *What a set shows*); and the one it
   * shows - over a text or a PDF - or none. The view's, never saved.
   */
  setsRead: number[];
  setTableShown: number | null;
  /** A set opened as a table in the column, and shown there. */
  readSetTable: (id: number) => void;
  showSetTable: (id: number) => void;
  /** A set's table closed in the column. */
  stopReadingSetTable: (id: number) => void;
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
  /** A menu asked for from outside the canvas: a PDF's, by the column it is read in; or a structure's, by the note over it (an atom of it). */
  menuAsk: { id: number; clientX: number; clientY: number; kind?: "atom" } | null;
  askPdfMenu: (ask: { id: number; clientX: number; clientY: number; kind?: "atom" } | null) => void;
  /** The structures of these atoms said to have been checked against the figure they were read from, or not: one step to undo. */
  setFigureChecked: (atoms: readonly number[], checked: boolean) => void;
  /** Words being carried out of a PDF, as Meno's own, peeling off it. */
  pdfWords: WordsFlight | null;
  setPdfWords: (words: WordsFlight | null) => void;
  /** A place in a PDF shown, marked for a moment: words gone back to where they came from. */
  pdfFlash: { id: number; from: WordPlace; to: WordPlace; start: number; box?: [number, number, number, number] } | null;
  setPdfFlash: (flash: { id: number; from: WordPlace; to: WordPlace; start: number; box?: [number, number, number, number] } | null) => void;
  /** A box drawn on a PDF's page, to be taken out as a picture - one selection in a PDF at a time, with its words'. */
  pdfBox: PdfBox | null;
  setPdfBox: (box: PdfBox | null) => void;
  /** The structure of a PDF's figure under the pointer, lit whole (docs/PDF.md, *Structures picked from a PDF*). */
  pdfStructureLit: PdfStructurePick | null;
  setPdfStructureLit: (pick: PdfStructurePick | null) => void;
  /** Structures picked in a PDF, Shift adding more - one selection in a PDF at a time, with its words' and its box's. */
  pdfStructures: { id: number; picks: PdfStructurePick[] } | null;
  setPdfStructures: (picked: { id: number; picks: PdfStructurePick[] } | null) => void;
  /** A structure being carried out of a PDF as Meno's own drawing of it. */
  pdfStructureFlight: StructureFlight | null;
  setPdfStructureFlight: (flight: StructureFlight | null) => void;
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
  /** A new text, empty - its sheet at `onPage` - shown in the column, and given the keys there as it shows (`textToWrite`). */
  newText: (onPage?: { x: number; y: number }) => void;
  /** The text just made to be written in: the column gives it the keys as it shows it, and lets go of this. */
  textToWrite: number | null;
  wroteText: () => void;
  /** A text as typed: a run of typing in it is one undo step. */
  editText: (id: number, text: string) => void;
  /** A text taken out of the workspace, as one undo step. */
  removeText: (id: number) => void;
  /** A text that could not be read taken out of the workspace, as one undo step. */
  removeLostText: (id: number) => void;
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
  /** Which molecule each stack of molecules in 3D shows, by the stack's id: by the molecule's id; its first if absent (utils/stacks). */
  stacksShown: Record<number, number>;
  /** A stack shows another of its molecules - turned as the one it showed was. */
  showInStack: (stack: number, id: number) => void;
  /** A stack's molecules laid out as a grid where it stands, each shown: one undo step. */
  spreadStack: (stack: number) => void;
  /** A stack's molecules, laid out as a grid, stacked again in its middle, `shown` the one it shows: one undo step. */
  gatherStack: (stack: number, shown: number) => void;
  /** Which record each stack of drawings shows, by the stack's id: by the record's place in its file; its first if absent (utils/stacks). */
  recordsShown: Record<number, number>;
  /**
   * Molecules in 3D shown in their other look for a talk - two clicks on
   * one while it is given (docs/PRESENTING.md) - by id: the view's alone,
   * gone as the talk ends; the document's looks as they were, nothing to
   * undo, nothing unsaved.
   */
  talkLooks: Readonly<Record<number, Look3D>>;
  /** A molecule in 3D shown in its other look for the talk being given. */
  switchTalkLook3d: (id: number) => void;
  /** The looks a talk switched let go: each molecule as the document has it. */
  endTalkLooks: () => void;
  /** A stack of drawings shows another of its records - selected in its place, where the one it showed was. */
  showRecord: (stack: number, record: number) => void;
  /**
   * Stacks of drawings going over from one record to the next, by the
   * stack's id: the atoms of the record let go of and of the next, by id,
   * and since when (STACK_SWAP_MS). The next is drawn as it comes
   * (components/StackSwap2D), not by the drawing, until it is there.
   */
  recordSwaps: Record<number, RecordSwap>;
  /** A stack of drawings laid out as a grid where it stands, every record shown: one undo step. */
  spreadRecords: (stack: number) => void;
  /** A stack of drawings, laid out as a grid, stacked again in its middle, `shown` the record it shows: one undo step. */
  gatherRecords: (stack: number, shown: number) => void;
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
  /**
   * The copy a value set on a result made last (`setMeasure3d`): the
   * molecule it was made from and the copy, by id, and when - for the view
   * to bring it into sight and light it a moment (Molecules3D); `undone`,
   * when an undo took it away again - it goes back into the one it came
   * from - until a redo puts it back.
   */
  copied3d: { from: number; copy: number; at: number; undone?: number } | null;
  /** What is chosen of a molecule measured - as the atoms were chosen - and its value opened to be typed. */
  setChosen3d: () => void;
  setHoveredMeasure3d: (h: { id: number; measure: number } | null) => void;
  setHovered3d: (h: { id: number } | null) => void;
  /** The atom of molecule `id` under the pointer; null, none of its atoms. */
  setHoveredAtom3d: (id: number, atom: number | null) => void;
  setFigureLit: (atom: number | null) => void;
  /** A structure read from a figure put on the page - selected - as one step. */
  putRead: (model: Model, scheme?: ImportedScheme) => void;
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
  /** A turn made with turnMolecules3d (`gesture`) let go of by Escape: taken back, nothing left to redo, and the molecules turned as they were (`turnsBefore`). */
  dropTurnMolecules3d: (gesture: string, turnsBefore: Record<number, Turn3D | undefined>) => void;
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
  /** Molecules in 3D shown `k` times as large as they are, each about its own place (docs/WORKSPACE.md, *Magnified display*): one step - a drag's run of them in one `gesture`. */
  setMagnified3d: (ids: number[], k: number, gesture?: string) => void;
  /**
   * Structures in 2D - each holding one of `atoms` - and molecules in 3D shown
   * `k` times as large as they are, each about its own centre, in one step - a
   * drag's run of them in one `gesture` (docs/WORKSPACE.md, *Magnified display*).
   */
  setMagnified: (atoms: number[], molecules: number[], k: number, gesture?: string) => void;
  /** What is learnt of a molecule in 3D - its bond orders found from its shape - with no undo step of its own (doc.amend). */
  learnMolecule3d: (id: number, change: (m: Molecule3D) => Molecule3D) => void;
  /** A molecule in 3D changed by the chemist - its bond orders given, its hydrogens added - as one undo step. */
  changeMolecule3d: (label: string, id: number, change: (m: Molecule3D) => Molecule3D) => void;
  /** A molecule in 3D switched to its other look - the secondary, or back to the primary - and those selected with it to the same. */
  switchLook3d: (id: number) => void;
  /** A measurement of the atoms and bonds chosen, which are then let go. */
  measureChosen3d: () => void;
  removeMeasure3d: (id: number, measure: number) => void;
  /** The electron-pushing arrows. */
  pushes: PushArrow[];
  /** The electron-pushing arrow under the pointer: its menu is the one a right-click opens. */
  hoveredPush: number | null;
  setHoveredPush: (id: number | null) => void;
  /**
   * An electron-pushing arrow being drawn: from where - none yet, begun from
   * Quick Add, until an atom or a bond is pressed - with a half head or a
   * full one, to where the pointer is, or the end under it (`to`).
   */
  pushDraw: { from: PushEnd | null; half: boolean; pointer: { x: number; y: number } | null; to: PushEnd | null } | null;
  setPushDraw: (draw: EditorState["pushDraw"]) => void;
  /** An electron-pushing arrow added, as one step; its id. */
  addPush: (from: PushEnd, to: PushEnd, half: boolean) => number;
  /** An electron-pushing arrow changed - its head, its bend (null: as Meno bends it), its ends, its lone pair - a run of changes in one gesture one step. */
  updatePush: (id: number, patch: { half?: boolean; bend?: PushArrow["bend"] | null; from?: PushEnd; to?: PushEnd; noPair?: boolean; fromPair?: boolean }, gesture?: string) => void;
  removePush: (id: number) => void;
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
  /** The PDFs selected, by id: moved, copied and deleted with the rest of the selection (docs/PDF.md). */
  selPdfs: Set<number>;
  /** These PDFs selected: alone, or (`add`) besides what is already. */
  selectPdfs: (ids: Iterable<number>, add?: boolean) => void;
  /** A PDF added to the selection, or taken out of it (Ctrl or ⌘ and a click). */
  togglePdfSel: (id: number) => void;
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
  /** Pictures put where they were made for - renders' - that come onto the page as the view is: it eased to them as they were begun, and moves no more. */
  picturesLaid: ReadonlySet<number>;
  /** Where renders under way will put what they make, in the page's units (render/renders): kept clear by what is put on the page meanwhile. */
  renderFrames: readonly { x0: number; y0: number; x1: number; y1: number }[];
  setHoveredPicture: (id: number | null) => void;
  /** The pictures selected, by id: besides `sel`, which is the drawing's. */
  selPictures: Set<number>;
  /** The pictures selected: these, or (`add`) these besides those already. */
  selectPictures: (ids: Iterable<number>, add?: boolean) => void;
  /** A picture added to the selection, or taken out of it (Ctrl or ⌘ and a click). */
  togglePictureSel: (id: number) => void;
  /** Pictures held put on the page, as one step: the first's middle where `at` is, the others beside it in a row - clear of what lies there, unless `just` there - selected; their ids. */
  addPictures: (pictures: PictureToAdd[], at: { x: number; y: number }, just?: boolean) => number[];
  /** A picture made for a place on the page - a render's - put just there, as one step: its id; none where nothing changed. */
  putPicture: (picture: Omit<PictureItem, "id">) => number | null;
  /** A picture moved, made larger or smaller, or turned: one step for a drag (`gesture`). */
  updatePicture: (id: number, patch: Partial<Pick<PictureItem, "x" | "y" | "w" | "h" | "turn">>, gesture?: string) => void;
  /** A drag of a picture's (`gesture`, as updatePicture took it) let go of by Escape: taken back, nothing left to redo. */
  dropPictureChange: (id: number, gesture: string) => void;
  removePicture: (id: number) => void;
  /** The slides on the page, in the talk's order (docs/PRESENTING.md); which are selected, and which is under the pointer - the view's. */
  slides: Slide[];
  selSlides: Set<number>;
  hoveredSlide: number | null;
  setHoveredSlide: (id: number | null) => void;
  selectSlides: (ids: Iterable<number>, add?: boolean) => void;
  toggleSlideSel: (id: number) => void;
  /** A slide put on the page, last in the talk's order; its id. */
  addSlide: (slide: Omit<Slide, "id">) => number | null;
  /** A slide moved, made larger or smaller, given other proportions, or shown with the page about it. */
  updateSlide: (id: number, patch: Partial<Pick<Slide, "x" | "y" | "w" | "h">> & { around?: boolean }, gesture?: string) => void;
  /** A slide put at `to` in the talk's order (from 0), the others moving up or down one. */
  orderSlide: (id: number, to: number) => void;
  removeSlide: (id: number) => void;
  /** What is on a slide selected, the slide with it: all of it whose middle lies in it, as a box selects. */
  selectOnSlide: (id: number) => void;
  /** The shapes on the page, from the back (docs/PRESENTING.md, *Shapes*); which are selected, which is under the pointer, and one being drawn - the view's. */
  shapes: Shape[];
  selShapes: Set<number>;
  hoveredShape: number | null;
  shapeDraft: ShapeDraft | null;
  /** The catalytic cycles on the page (lib/chem/cycle); which are selected, which is under the pointer - the view's. */
  cycles: Cycle[];
  selCycles: Set<number>;
  hoveredCycle: number | null;
  setHoveredCycle: (id: number | null) => void;
  selectCycles: (ids: Iterable<number>, add?: boolean) => void;
  /** A cycle put on the page, as one step; its id, or null where none was. */
  addCycle: (cycle: Omit<Cycle, "id">) => number | null;
  /** A cycle turned round, given arrows coming in and going out, or a colour - the words by its arrows put where `captions` says - one step, or one a gesture's changes make together. */
  updateCycle: (id: number, patch: CyclePatch, gesture?: string, captions?: { id: number; x: number; y: number }[]) => void;
  removeCycle: (id: number) => void;
  /**
   * The arrows and "+" signs selected for themselves - one standing alone,
   * pointing at something on a slide - beside those a selection carries as
   * it lies among its atoms (utils/selectionScheme); the view's.
   */
  selArrows: Set<number>;
  selPluses: Set<number>;
  selectArrows: (ids: Iterable<number>, add?: boolean) => void;
  selectPluses: (ids: Iterable<number>, add?: boolean) => void;
  /** An arrow or a "+" added to the selection, or taken out of it (Ctrl or ⌘ and a click). */
  toggleArrowSel: (id: number) => void;
  togglePlusSel: (id: number) => void;
  /** An arrow being drawn from Quick Add, from a point to its point - the view's (components/arrowFrom). */
  arrowDraft: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  setArrowDraft: (draft: EditorState["arrowDraft"]) => void;
  setHoveredShape: (id: number | null) => void;
  setShapeDraft: (draft: ShapeDraft | null) => void;
  selectShapes: (ids: Iterable<number>, add?: boolean) => void;
  toggleShapeSel: (id: number) => void;
  /** A shape put on the page, over the others; its id. */
  addShape: (shape: Omit<Shape, "id">) => number | null;
  /** A shape moved, made larger or smaller, its corners rounded, or its look changed: one step for a drag (`gesture`). */
  /** A resize let go: back as it was at the press (Escape, or undo during it). */
  dropShapeChange: (id: number, gesture: string) => void;
  updateShape: (id: number, patch: ShapePatch, gesture?: string) => void;
  /** The shapes `ids` given the same look - their lines' width, dashed or not - as one step. */
  styleShapes: (ids: readonly number[], patch: Pick<ShapePatch, "width" | "dash">) => void;
  /** The shapes `ids` given a colour for their line or their fill - or none of their own - as one step; one for all a chooser gives (`gesture`). */
  colourShapes: (ids: readonly number[], which: "stroke" | "fill", color: string | null, gesture?: string) => void;
  /** The shapes `ids` brought over all the others, or put under them. */
  orderShapes: (ids: readonly number[], front: boolean) => void;
  removeShape: (id: number) => void;
  /** Writing by hand on the page (docs/PRESENTING.md, *Handwriting*): its pieces, which are selected and which is under the pointer; the pen's card, open or not; and a stroke being written - the view's. */
  inks: Ink[];
  selInks: Set<number>;
  hoveredInk: number | null;
  inkMode: InkMode | null;
  inkDraft: { look: InkLook; stroke: InkStroke } | null;
  setInkMode: (mode: InkMode | null) => void;
  setInkDraft: (draft: { look: InkLook; stroke: InkStroke } | null) => void;
  setHoveredInk: (id: number | null) => void;
  selectInks: (ids: Iterable<number>, add?: boolean) => void;
  toggleInkSel: (id: number) => void;
  /** A stroke written, one step: added to the piece `join` - where it is still in the same pen - or a piece of its own; the piece's id. */
  writeStroke: (look: InkLook, stroke: InkStroke, join?: number | null) => number | null;
  /** Strokes rubbed out - each by its piece and its place in it - one step for a rub (`gesture`). */
  eraseStrokes: (cuts: readonly { id: number; index: number }[], gesture?: string) => void;
  /** The pieces `ids` given a colour of their own, or none; one step for all a chooser gives (`gesture`). */
  colourInks: (ids: readonly number[], color: string | null, gesture?: string) => void;
  removeInk: (id: number) => void;
  /** A stroke written on a PDF's page, one step: on the piece there `join` (by its place) where it is in the same pen, else a piece of its own; the piece's place. */
  writePdfStroke: (pdf: number, page: number, look: InkLook, stroke: InkStroke, join?: number | null) => number | null;
  /** Strokes rubbed out of PDFs' pages - each by its PDF, its piece's place and its own - one step for a rub (`gesture`). */
  erasePdfStrokes: (cuts: readonly { pdf: number; piece: number; index: number }[], gesture?: string) => void;
  /** A pen's writing over the slide while a talk is given: gone as the slide goes (docs/PRESENTING.md, *Handwriting*) - the view's, never the document's. */
  talkInk: { look: InkLook; stroke: InkStroke }[];
  writeTalkStroke: (look: InkLook, stroke: InkStroke) => void;
  eraseTalkStrokes: (indices: readonly number[]) => void;
  /** A talk being given from the slides, or none; begun at a slide, gone on to another, ended. */
  presenting: Presenting | null;
  /** What a move or a resize under way lines up with, shown as guides (presenting/guides) - the view's. */
  guides: GuideMarks | null;
  setGuides: (guides: GuideMarks | null) => void;
  present: (from: number) => void;
  presentAt: (at: number) => void;
  endPresenting: () => void;
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
  /**
   * Words being written over an arrow, or to go over one as they are kept -
   * where they stand and how far they reach, the writing's `n` - so that the
   * arrow is drawn as long as they need as they are written.
   */
  wordsWriting: (ArrowWords & { arrow: number; n: number }) | null;
  /** The words being written over an arrow, or (null) none - those of writing `n` gone. */
  setWordsWriting: (words: EditorState["wordsWriting"], n?: number) => void;
  /** The caption's own words drawn again: what was written no longer drawn over them. */
  captionShown: (id: number) => void;
  /** Words added, as one step - taken out of a PDF, where they came from, as wide as their lines were and lying as they did; their id. */
  addCaption: (text: string, x: number, y: number, arrow?: number, from?: WordsFrom, width?: number, align?: Caption["align"], more?: { size?: number; marks?: WordsMark[] }) => number;
  /**
   * Words changed - written anew, moved, put over an arrow or taken from
   * one (`arrow` null), made as wide as something or as their words
   * (`width` null) - a run of changes in one gesture one step.
   */
  updateCaption: (
    id: number,
    patch: CaptionPatch,
    gesture?: string,
  ) => void;
  removeCaption: (id: number) => void;
  /** All the letters of the words `ids` in a colour, or (null) in none of their own - a gesture's changes one step. */
  colourWords: (ids: number[], color: string | null, gesture?: string) => void;
  /** All the letters of the words `ids` set bold, in italics, raised or lowered - or, every one of them so already, not. */
  styleWords: (ids: number[], side: "bold" | "italic" | "sup" | "sub") => void;
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
  /** A step's atoms being chosen on the drawing - Enumerate's positions: a click on an atom takes it into the step's option, or out of it (`AtomsOption`). */
  choosingAtoms: { step: number; option: string } | null;
  /** A set's tab or a step's card right-clicked: its menu asked for, there (Workspace opens it). */
  workflowMenu: { kind: "set" | "step"; id: number; clientX: number; clientY: number } | null;
  /**
   * A wire being drawn, to where the pointer is: from what gives, or back
   * from a step that takes (`to`); picked up off the step it went into,
   * the wire it was (`was`).
   */
  wireDrag: { from?: WireEnd; to?: WireTo; at: { x: number; y: number }; was?: number } | null;
  /** A wire let go on a step's input that does not take it: the step, and why (flow `wireRefusal`) - said on its card until a wire is drawn again. */
  wireRefused: { step: number; said: string } | null;
  setWorkflowView: (patch: Partial<Pick<EditorState, WorkflowView>>) => void;
  /**
   * The result sets whose molecules no longer fit them, as the 3D look in
   * Settings draws them, laid out again (workflow/run `fitResultSets`):
   * in every state the history holds, with no step of its own and the
   * document as saved as it was - the look is Settings', not the document's.
   */
  fitResultSets: () => void;
  /** A step's jobs forgotten, as it is deleted: those running stopped, its run ended - no folder taken away (another step, or a copy of the workspace, may use it). */
  forgetStepJobs: (step: Pick<WorkflowStep, "id" | "running" | "ran" | "runs">) => void;
  /** Whether a step's last run's jobs are kept still - not those of jobs taken away as the step went before they ran. */
  jobsKept: (step: Pick<WorkflowStep, "ran">) => boolean;
  /** A set round `frame`, as one step; its id. */
  /** Molecules in 3D put on the page as a set of their own, named `name`, its middle at `at` or the free space nearest it: one step. */
  placeAsSet: (ms: Omit<Molecule3D, "id" | "at">[], at: { x: number; y: number }, name?: string) => number | undefined;
  /** A chemist's set named anew; an empty name takes its name away (*Input* again). */
  renameSet: (id: number, name: string) => void;
  /** A step's result set kept in the workspace's file, or not: one step. */
  keepSet: (id: number, keep: boolean) => void;
  /** A step's jobs' raw outputs kept in the workspace's file, or not (*Don't keep raw outputs*): an edit. */
  keepRawOutputs: (id: number, keep: boolean) => void;
  addSet: (frame: { x0: number; y0: number; x1: number; y1: number }) => number;
  /** A table put on the page as a set of its own, its middle at `at`, named `name` - a text read as one (lib/table `tableOfText`); its id. */
  placeTable: (table: Table, at: { x: number; y: number }, name?: string) => number;
  /** A procedure saved, put down with its middle at (x, y), as one step - selected. */
  putDownProcedure: (id: string, x: number, y: number) => void;
  /** A set's frame sized anew, or the set moved with all it holds: a run of either in one gesture one step. */
  resizeSet: (id: number, frame: { x0: number; y0: number; x1: number; y1: number }, gesture?: string) => void;
  moveSet: (id: number, dx: number, dy: number, gesture?: string) => void;
  /** A set deleted, or several in one step - one that holds its molecules itself, on no page, which go with it, only once asked about (`askDeleteSet`), `asked`. */
  removeSet: (id: number | readonly number[], asked?: boolean) => void;
  /** Sets that hold their molecules themselves asked to be deleted - by a key, or a selection that held them: the question asked (Workspace). */
  askDeleteSet: number[] | null;
  /** A step of `kind`, done by `by` - Meno, or a plugin - put down, its card's top left at (x, y), with the defaults Settings has for its kind done by it; its id. */
  addStep: (kind: StepKind, by: string, x: number, y: number) => number;
  moveStep: (id: number, x: number, y: number, gesture?: string) => void;
  /** A step's options changed - its own, the defaults left as they are - or its kind, to another who does it fills. */
  updateStep: (id: number, patch: { options?: OptionValues; kind?: StepKind }) => void;
  chooseAtom: (atom: number) => void;
  /** A step deleted - its jobs stopped and their files taken away; one running, only once asked about (`askDeleteStep`), `asked`. */
  removeStep: (id: number, asked?: boolean) => void;
  /** A running step asked to be deleted: the question asked (Workspace). */
  askDeleteStep: number | null;
  /**
   * An undo (or a redo) that would take away a running step: held, and the
   * question deleting it asks asked first (`askUndo`, Workspace) - true
   * where it is held so; false where it takes nothing running away, left to
   * be done as any undo.
   */
  holdUndo: (direction: "undo" | "redo") => boolean;
  /** The undo held (`holdUndo`) let go: done - the running steps it takes away stopped first, their jobs as deleting them stops them - or, `go` false, not. */
  letUndo: (go: boolean) => void;
  /** An undo or a redo held, that would take away running steps (`holdUndo`). */
  askUndo: { direction: "undo" | "redo"; steps: number } | null;
  /** A wire from a set into a step's input - the first that takes it, where none is named - where it may go (workflow/flow `canWire`); whether it went. */
  connect: (from: WireEnd, to: number, port?: string) => boolean;
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
  /** A step's run kept, or no longer (docs/WORKFLOWS.md, *Earlier runs*): the one it shows at -1, an earlier one by its place among them - one step to undo. */
  keepRunOf: (id: number, index: number, keep: boolean) => void;
  /** An earlier run of a step shown again - its results in its result set - what it showed kept among its runs instead: one step to undo. */
  showRun: (id: number, index: number) => void;
  /** A step's logs opened in the column of texts, following its jobs while they run. */
  showStepLog: (id: number) => Promise<void>;
  /** A step's log of several jobs (`TextOf.jobs`), by its text: showing the `k`th of them. */
  showStepLogJob: (text: number, k: number) => Promise<void>;
  /** The folder of a step's last job shown where the system shows files. */
  /** A step's job's files shown - written back out first, where its folder is not on this computer: what is said of those not written back, if anything. */
  showStepFiles: (id: number) => Promise<string | null | void>;
  /** A job whose output Meno could not account for, adopted: taken as the step's result, recorded with when. */
  adoptJob: (id: number, job: string) => Promise<void>;
  /** The jobs of the steps that have any looked at: where each is, and, those that have all ended, their results brought in. */
  lookAtJobs: () => Promise<void>;
  /** Each step's jobs, as last looked at, by job id. */
  jobsSeen: Record<string, JobSeen>;
  /** Meno's steps working in turns (Duplicates, `runMenoInTurns`), by step: since when, and how many of their entries they have been through. Not the document's: gone once each is done. */
  menoWorking: Record<number, { since: number; done: number; total: number }>;
  /** A wire picked up off its step and let go on another's port: into that one instead, as one step. */
  rewire: (id: number, to: number, port?: string) => void;
  hoverPulse: { id: number | null; nonce: number; until: number };
  arrows: Arrow[];
  pluses: Plus[];
  fitNonce: number;
  /**
   * What was just put down on the page, to be shown (utils/viewShow): the
   * view moved along to take it in, or out as little as needed - each
   * request its own number.
   */
  showRequest: { box: ShowBox; n: number } | null;
  /** The view to show `box`, as what was just put down is shown (`showRequest`). */
  requestShow: (box: ShowBox) => void;
  autoFitSuspended: boolean;
  aromaticEnabled: boolean; // legacy/global
  aromaticRings: Record<string, boolean>; // per-ring enabled flags by ringKey
  /** The rings filled with a colour (`RingFills`). */
  ringFills: RingFills;
  /**
   * The atoms and bonds named given a colour - drawn in it (`which` "color"),
   * or highlighted in it - or (null) none: one step.
   */
  colourParts: (parts: { atoms: Iterable<number>; bonds: Iterable<number>; pushes?: Iterable<number> }, which: "color" | "highlight", color: string | null, gesture?: string) => void;
  /** One colour given to all a selection holds - atoms and bonds, electron arrows, words, reaction arrows, writing by hand - as one step. */
  colourTogether: (
    what: { atoms?: Iterable<number>; bonds?: Iterable<number>; pushes?: Iterable<number>; words?: readonly number[]; arrows?: readonly number[]; inks?: readonly number[]; cycles?: readonly number[] },
    color: string | null,
    gesture?: string,
  ) => void;
  /** The rings named (by key) filled with a colour, or (null) not: one step - a run of them in one `gesture` too. */
  fillRings: (keys: readonly string[], color: string | null, gesture?: string) => void;
  /** The document's own drawing style, if it has one (see useDrawingStyle). */
  docStyle: StyleChoice;
  /** The workspace's styles in 3D (document.ts `style3d`): what its molecules are drawn in. */
  docStyle3d: Workspace3D;
  /** Which page the document is (document.ts `pageId`): unset until one is opened from a file. */
  pageId?: number;
  labelEdit: {
    active: boolean;
    atomId: number | null;
    value: string;
    /** When it was begun, and with what: a double-click takes back one its first click began. */
    opened?: { at: number; value: string };
    /** Each edit its own number, given as it begins. */
    n?: number;
    /** Begun by a letter typed over the atom: its first letter grows out of the atom (LabelTyping2D). */
    grow?: boolean;
    /** Begun with what it says selected: the atom's menu's *Edit label* on a carbon drawn as a corner. */
    selectAll?: boolean;
  };
  /**
   * How the last label edit ended: kept and changed (`kept`),
   * kept as it was (`same`), or let go (`cancelled`) - what the writing and
   * the label it had do as it goes (LabelTyping2D, Labels2D).
   */
  labelEnd: { n: number; atomId: number; how: "kept" | "same" | "cancelled" } | null;
  /**
   * A label just written, drawn as it was written until the drawing's own is
   * drawn in its place (LabelTyping2D), so that it never goes from the page
   * for a frame: its atom, its edit's number, what it says.
   */
  labelLeft: { atomId: number; n: number; text: string } | null;
  /**
   * A label just kept by Enter (`commitLabelEdit`): an Enter straight after
   * draws it out, as *Expand abbreviation* does - nothing in between, the
   * drawing and what is selected as they were when it was kept.
   */
  labelKept: { atomId: number; model: Model; sel: EditorState["sel"] } | null;
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
  /** Each atom's charge stepped by one, as one undo step: the selection's, by + or -. */
  stepCharges: (ids: Iterable<number>, step: 1 | -1) => void;
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
  /** Each of the bonds made of `kind` (utils/bondKinds), as one step. */
  setBondsKind: (ids: readonly number[], kind: import("../utils/bondKinds").BondKindName) => void;
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
  /**
   * An atom clicked: selected alone at once, its shade spreading from it -
   * and, the second click of a double-click following, taken back, the
   * selection as it was, its shade drawn back in (`clickTakeBack`).
   */
  clickSelectAtom: (id: number) => void;
  /** The click on `id` taken back by a double-click's second (`clickSelectAtom`): false where nothing was. */
  clickTakeBack: (id: number) => boolean;
  /**
   * The atom a click selected last, when, what was selected before, whether
   * it was not selected then (`fresh`: its shade spreads from it, and draws
   * back in, taken back - SelectionShade2D) and whether it has been taken
   * back since.
   */
  clickShade: { atomId: number; at: number; was: Sel; anchor: number | null; fresh: boolean; back: boolean } | null;
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
  /** A move or a turn made with moveAtoms (`gesture`) let go of by Escape: taken back, nothing left to redo. */
  dropMoveAtoms: (gesture: string) => void;
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
  /** A press come down on the page, noted: the document and the selection as they were, for `takeBackPress`. */
  notePress: () => void;
  /**
   * The press noted last taken back as if it had never been - a finger that
   * turned out to be a pinch's first: what it did to the document gone,
   * leaving nothing to redo, the selection as it was, and its gesture let
   * go. False where the document could not be put back (an undo since).
   */
  takeBackPress: () => boolean;
  /**
   * R and S, E and Z shown - or hidden - on the drawing's atoms and bonds
   * given, by id, and the molecules in 3D's, by index (all of a molecule's,
   * given none): one undo step (document `setStereoShown`).
   */
  /** Atom numbers shown on molecules in 3D, by id - on the atoms given, by index, all of them given none - or hidden: one undo step (document `setAtomNumbers`). */
  setAtomNumbers: (of: readonly { id: number; atoms?: readonly number[] }[], show: boolean) => void;
  /** The kind of number the molecules in 3D given, by id, show (document `setAtomNumberKind`): one undo step. */
  setAtomNumberKind: (molecules: readonly number[], kind: AtomNumberKind) => void;
  setStereoShown: (of: { atoms?: readonly number[]; bonds?: readonly number[]; molecules?: readonly { id: number; atoms?: readonly number[]; bonds?: readonly number[] }[] }, show: boolean) => void;
  /**
   * Metal `metal` bound to a ring through all its atoms - one bond to a star
   * at its centre, its endpoints the ring's atoms (chem/eta) - as one edit.
   */
  bindRing: (metal: number, ring: readonly number[]) => void;
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
  /**
   * No gesture under way any more (store/gesture): the flags a gesture
   * lost - the window left, the pointer taken - leaves, cleared. What is
   * drawn, selected or being typed stays as it is.
   */
  endGestures: () => void;
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
   * What the workspace's file held, as it was opened, that could not be
   * read and was left out (utils/readNotes) - said on every save, for none
   * of it is in the file saved - and whether the file it was opened from
   * has been kept beside the first one saved over it (`kept`).
   */
  leftOnOpen: { left: LeftOut; kept: boolean } | null;
  /** What opening a workspace left out, as `leftOnOpen` keeps it; null for none. */
  markLeftOnOpen: (left: LeftOut | null) => void;
  /** The file it was opened from is kept beside the first one saved over it. */
  markLeftKept: () => void;
  /**
   * The file last opened over what the canvas held - where it is, where
   * Open said, else its name: what Save As suggests, beside it, the canvas
   * being saved nowhere since.
   */
  openedName: string | null;
  /**
   * The document has just been written to `path`: it is saved there - as
   * it was when its writing began (`written`, from `writing`), where it may
   * have changed since.
   */
  markSavedAs: (path: string, written?: WorkspaceDocument) => void;
  /** The document as it is: what is about to be written, for `markSavedAs` once it is. */
  writing: () => WorkspaceDocument;
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
  openModel: (next: Model & Pick<Drawn, "inks" | "slides">, scheme?: ImportedScheme) => void;
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
  /** An arrow drawn from a point to its point, as one step; its id. */
  addArrowBetween: (from: { x: number; y: number }, to: { x: number; y: number }) => number;
  /** An arrow moved or reshaped; a run of changes in one gesture - a drag - is one step. */
  updateArrow: (id: number, patch: Partial<Arrow>, gesture?: string) => void;
  /** Arrows given a kind, heads, dashes, a weight, corners or a colour - or theirs taken away - as one step. */
  setArrowForm: (ids: readonly number[], patch: ArrowFormPatch, gesture?: string) => void;
  /** An arrow given its reaction's atom map, or its map taken away (null), what it shows on the drawing with it - one step (chem/atomMap). */
  setAtomMap: (arrowId: number, map: ArrowAtomMap | null) => void;
  /** An arrow's atom map shown on the drawing - its numbers and reacting centres - or taken off it, kept: one step. */
  showAtomMap: (arrowId: number, shown: boolean) => void;
  /** An arrow's next map, of those its reaction has, shown and used instead: one step. */
  otherAtomMap: (arrowId: number) => void;
  /** A "+" added, as one step; its id. */
  addPlus: (x: number, y: number) => number;
  removeArrow: (id: number) => void;
  /** A "+" moved; a run of moves in one gesture, a drag, is one step. */
  movePlus: (id: number, x: number, y: number, gesture?: string) => void;
  removePlus: (id: number) => void;
  /** What a cut takes, gone as one undo step: atoms, bonds, arrows and pluses. */
  /** What a cut took, gone: the drawn part, and the molecules in 3D by id, in one step. */
  /** `part` deleted, as a cut deletes what it copied; how many sets among it that hold their molecules themselves were left, which a copy does not carry. */
  deleteDrawn: (part: Drawn, molecules3d?: number[]) => number;
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
  beginLabelEdit: (atomId: number, initial?: string, how?: { select?: boolean }) => void;
  setLabelEditValue: (value: string) => void;
  /** The label written kept; `typed`, what was typed for it, where it is read as something else; `byEnter`, where Enter kept it. */
  commitLabelEdit: (typed?: string, byEnter?: boolean) => void;
  /** A key pressed after a label kept by Enter: an Enter draws it out, any other key leaves it as it is. Whether there was one to answer. */
  keyAfterLabel: (enter: boolean) => boolean;
  /** A label kept by Enter no longer to be drawn out by the next: something done in between. */
  forgetLabelKept: () => void;
  /** An atom's label made what was typed for it, read as nothing else: obz, not OBz - one step. */
  labelAsTyped: (atomId: number) => void;
  cancelLabelEdit: () => void;
  setAromaticEnabled: (v: boolean) => void;
  /**
   * Gives the document its own drawing style, or the application's again
   * (undefined). Changes sharing `coalesceKey` - a drag along a slider - are
   * one undo step.
   */
  /** The workspace's drawing style set and its page converted with it, one step; with `coalesceKey`, a slider's ticks, each from the page as the drag began, coalesced. */
  setDocumentStyle: (style: StyleChoice, coalesceKey?: string) => void;
  /** A preset chosen in the Drawing style card: the style taken, its bond eased in from the old one, one step (../styleEase). */
  easeDocumentStyle: (style: StyleChoice) => void;
  /** The workspace's styles in 3D set: one step to undo - a run of a slider's in one `coalesceKey`. Its molecules go over to them, eased. */
  setDocumentStyle3d: (style3d: Workspace3D, coalesceKey?: string) => void;
  /**
   * Settings' styles taken by the workspace, asked (../SettingsStyleAsk):
   * its drawing style - its bond eased in, as a preset chosen in its card -
   * and its two looks in 3D, primary and secondary, its molecules going
   * over to them eased; either left as it is where none is given. One step.
   */
  adoptSettingsStyles: (drawing: StyleChoice | null, roles: Pick<Workspace3D, "primary" | "secondary"> | null) => void;
  toggleAromatic: () => void;
  setRingEnabled: (key: string, v: boolean) => void;
  toggleRing: (key: string) => void;
};
