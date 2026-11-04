import type { ArrowKind, ArrowWeight } from "../../../lib/chem/reactionArrow";
import { SHAPE_WIDTHS_PT } from "../../../lib/chem/shapes";
import { AnimatePresence, motion } from "motion/react";
import { RISE } from "../../theme/motion";
import { useLeaving } from "../../theme/leaving";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { BOND_ICONS, MENU_ICONS } from "./menuIcons";
import { withRules } from "./menuRules";
import { BOND_KIND_NAMES, COMMON_BOND_KINDS, OTHER_BOND_KINDS, type BondKindName } from "./utils/bondKinds";
import { swallowPress } from "./utils/press";
import { guideNotice } from "../../../lib/guide/guide";
import { MAGNIFICATIONS, magnificationText } from "./utils/magnified";

/**
 * What was right-clicked, where in the canvas the menu opens, and how big
 * the canvas is, so that the menu stays inside it.
 */
export type MenuTarget = {
  /**
   * The atom, bond, reaction arrow or "+" right-clicked, or a molecule in 3D
   * or a measurement on one; null, when it was nothing.
   */
  kind: "atom" | "bond" | "arrow" | "plus" | "caption" | "pdf" | "picture" | "text" | "molecule3d" | "measure3d" | "set" | "step" | "wire" | "push" | "ring" | "slide" | "shape" | "ink" | "cycle" | null;
  /** Its id: for a measurement, its molecule's; for a ring, one of its atoms'. */
  id: number | null;
  /** A ring right-clicked inside: its key (utils/rings). */
  ring?: string;
  /** A measurement's own id. */
  measure?: number;
  /** A molecule in 3D's atom under the pointer as it was right-clicked, by index: which of its ligands the menu is about. */
  atom?: number;
  /**
   * Whether there is a selection, and whether the menu is its: right-clicked
   * on something selected, or on nothing.
   */
  selection: "none" | "elsewhere" | "here";
  /** Whether the selection has any of the drawing in it, not molecules in 3D alone; so unless false. */
  drawing?: boolean;
  /** Where in the drawing it was opened: where a paste from it goes. */
  at: { x: number; y: number };
  x: number;
  y: number;
  within: { width: number; height: number };
};

/** What setting a measurement of two, three or four atoms is called. */
const SET_NAME = ["", "", "Set distance…", "Set angle…", "Set torsion angle…"];

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The least width the menu takes, and each item's height, for keeping it
 * inside the canvas. It grows past that to fit its longest item on one line:
 * a shortcut is written out on Windows (Ctrl+Shift+K) where a Mac has three
 * symbols, and an item that wrapped would spill into the one below it.
 */
const WIDTH = 240;
const ITEM = 32;
/** Each icon's square along the top, as Quick Add's are, in px. */
const ROW = 36;
/** A compact row under the icons: the kinds of bond there are besides the common ones. */
const ROW2 = 28;
/** A note under a command: its line's height, and about how many of its letters a line of the menu holds. */
const NOTE_LINE = 16;
const NOTE_CHARS = 40;

/** What the clipboard's items in the menu do. */
export type MenuClipboard = {
  onCut: () => void;
  onCopy: () => void;
  onCopySmiles: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
};

/**
 * One thing the menu does: with an icon, along its top (`del`, Delete, at
 * the right end of them); without, in the list under them, a rule above it
 * where `divider` says.
 */
/** The gaps a cycle's arrows can keep from what is on it, in bonds, as its menu offers them. */
const CYCLE_GAPS: readonly (readonly [number, string])[] = [
  [0.25, "Arrows close"],
  [0.5, "Arrows a little apart"],
  [0.75, "Arrows apart"],
  [1, "Arrows well apart"],
];

type Item = { name: string; keys: string; run: () => void; note?: string; divider?: boolean; checked?: boolean; icon?: ReactNode; del?: boolean; disabled?: boolean; press?: (e: React.PointerEvent) => void; compact?: boolean; keep?: boolean; after?: ReactNode };

/** What the workspace does as a whole, offered on empty space: a rule above it where `divider` says. */
/** A command of the canvas's menu - with a note under it, where it says what pressing it drops. */
export type CanvasCommand = { name: string; keys: string; run: () => void; divider?: boolean; note?: string };

/** What can be done to a molecule in 3D from the menu. */
export type MenuMolecule3D = {
  /**
   * Its other look - the 3D style's secondary, or back to its primary - one
   * step away: that style's name, whether it draws balls and sticks or
   * space-filling (its icon), and the switch.
   */
  otherLook: { name: string; atoms: "balls" | "space"; run: () => void };
  /** How many atoms what is chosen of it measures: two, three or four make a measurement. */
  chosen: number;
  onMeasure: () => void;
  /** What is chosen measured and its value opened to be typed, to set it; unset, where it cannot be set (a torsion angle about a ring's bond). */
  onSetChosen?: () => void;
  /** Turned back to face as its file has it. */
  onResetTurn: () => void;
  /** Turned once round about the screen's up, and back as it was - with the others selected with it, each about its own centre. */
  onTurnOnce: () => void;
  /** It alone, cut or copied. */
  onCut: () => void;
  onCopy: () => void;
  /** Turned to lie as the drawing it was made from does; unset, where it was made from none there is. */
  onTurnLikeDrawing?: () => void;
  /** Made again from its drawing, which has changed since; unset, where it has not. */
  onRemake?: () => void;
  /** Drawn as a formula beside it, by Meno's engine: unset, where it has a drawing already. */
  onDrawFormula?: () => void;
  /** A PDB entry's residues' bond orders given from the wwPDB's Chemical Component Dictionary: unset, where it is none, or they are known. */
  onOrdersFromDictionary?: () => void;
  /** Its bond orders - its ligand's - given from a SMILES: unset, where they are known (utils/completeness). */
  onOrdersFromSmiles?: () => void;
  /** Its bond orders - its ligand's - estimated from its atoms' distances: unset, where they are known. */
  onEstimateOrders?: () => void;
  /** The hydrogens its file leaves out - its ligand's - added, the chemist choosing how it is protonated (ProtonationCard): unset, where it has them or its bond orders are not known. */
  onAddHydrogens?: () => void;
  /** Said to be whole without hydrogens - it has none to add (lib/chem/skeleton): unset, where it is no skeleton, or a PDB entry. */
  onWholeWithoutH?: () => void;
  /** Its frames all shown at once, or one: unset, where it has one only; `conformers`, whether they are a conformer set's. */
  overlay?: { on: boolean; conformers: boolean; set: (on: boolean) => void };
  /** Its calculation's lists - its vibrations, its orbitals - each opened under it by name: none, where it gave none. */
  lists?: { name: string; open: () => void }[];
  /** The output it was read from, shown in a tab of its own, by its name: unset, where it was read from none. */
  output?: { name: string; show: () => void };
  /** One of a stack (utils/stacks): its molecules laid out as a grid, or - laid out - stacked again; unset, where it is none. */
  stack?: { spread: boolean; run: () => void };
};

/**
 * What can be done to the atom or bond under the pointer - or to the
 * selection, or on empty space - at the pointer: the mouse alone reaches
 * everything a key does. What is done most comes first, as a row of icons
 * named as the pointer rests on them, Delete at its right end; the rest is
 * listed under it (the maintainer, 2026-10-10: the menus had grown busy).
 * Closes on Escape, on a press anywhere else, and on a turn of the wheel.
 */
export default function PartMenu({
  target,
  records,
  stereo,
  figure,
  numbers,
  onDelete,
  onCleanUp,
  onMake3d,
  onSelectStructure,
  bondKind,
  onTurnOver,
  onCharge,
  onRadical,
  radical,
  onExpand,
  onChain,
  asTyped,
  onEditLabel,
  onArrowStyle,
  onEditText,
  onShowSource,
  onFitWords,
  captionAlign,
  onRunStep,
  onStepOptions,
  step,
  pdf,
  onCopyPicture,
  onReadStructure,
  text,
  onSaveProcedure,
  keepInFile,
  onOpenAsTable,
  setHoldsOwn,
  onUseAsInput,
  onSaveAbbreviation,
  onExport,
  onPush,
  push,
  arrow,
  onColour,
  onRender,
  picture,
  words,
  slide,
  onSlideAround,
  shape,
  cycle,
  onBoxAround,
  onCombinePdfs,
  canvas = [],
  clipboard,
  molecule3d,
  measure3d,
  magnify,
  onClose,
}: {
  target: MenuTarget;
  /** The part deleted, or the selection when the menu is its. */
  onDelete: () => void;
  /** The part's structure cleaned up, or the selection's structures. */
  onCleanUp: () => void;
  /** The part's structure made in 3D, or the selection's structures. */
  onMake3d: () => void;
  onSelectStructure: () => void;
  /** The kind of the bond right-clicked - or of the bonds selected, where it is one of them - and a kind chosen for it (utils/bondKinds); `current` is null where the bond is none of them. */
  bondKind?: { current: BondKindName | null; choose: (kind: BondKindName) => void };
  /** The selection turned over, left to right or top to bottom. */
  onTurnOver: (axis: "vertical" | "horizontal") => void;
  /** An atom's charge one up or one down. */
  onCharge: (step: 1 | -1) => void;
  /** An atom's unpaired electron given or taken away; `radical`, whether it has one. */
  onRadical: () => void;
  radical: boolean;
  /** An abbreviation's atoms drawn out; unset, where the atom is none. */
  onExpand?: () => void;
  /** Where the atom can take another bond: a chain begun from it, traced with the button up. */
  onChain?: () => void;
  /** Its label as it was typed (obz, read as OBz), and the label made that again; unset, where it was read as typed. */
  asTyped?: { typed: string; run: () => void };
  /** The atom's label opened to be written in place, holding what it says (docs/EDITOR-2D.md, *Labels typed in place*). */
  onEditLabel?: () => void;
  /** A reaction arrow's own line and head, in a panel beside the canvas. */
  onArrowStyle: () => void;
  /** The words right-clicked, written anew. */
  onEditText: () => void;
  /** Words taken out of a PDF: where they came from shown, marked, in the column. */
  onShowSource?: () => void;
  /** Words made as wide as something: as wide as their words again, a line for each line typed. */
  onFitWords?: () => void;
  /** How the words' lines lie, and setting it. */
  captionAlign?: { now: "left" | "center" | "right" | "justify"; set: (align: "left" | "center" | "right" | "justify") => void };
  /**
   * What the words right-clicked can do besides (docs/EDITOR-2D.md,
   * *Text*): a size, line spacing and typeface of their own, chosen on a card; all their letters bold,
   * in italics, raised or lowered - ticked where all are already; their
   * lines a list, or plain again.
   */
  words?: {
    onFont: () => void;
    bold: boolean;
    italic: boolean;
    list: boolean;
    onBold: () => void;
    onItalic: () => void;
    onList: () => void;
    onSup: () => void;
    onSub: () => void;
  };
  /** A workflow's step right-clicked: run, or opened to its options. */
  onRunStep: () => void;
  onStepOptions: () => void;
  /** What a step right-clicked can do besides, as it is: stopped, while its jobs wait or run; its logs and files shown, where it has jobs. */
  step?: {
    onRunFrom?: () => void;
    onStop?: () => void;
    onShowLog?: () => void;
    onShowFiles?: () => void;
    /** Each job whose output Meno could not account for: *Adopt* it, by its id. */
    adopt?: { job: string; run: () => void }[];
    /** Whether its jobs' raw outputs are kept in the workspace's file (*Don't keep raw outputs*, workflow/keptJobs): a step a plugin does. */
    keepRaw?: { kept: boolean; set: (keep: boolean) => void };
    /** What running it drops of earlier runs, said under its icons before it is pressed (workflow/earlierRuns `runNote`). */
    note?: string;
  };
  /** What a PDF right-clicked can do: read in the column, its pages turned, spread or gathered, made an icon or full size (docs/PDF.md). */
  pdf?: {
    spread: boolean;
    icon: boolean;
    onSpread: () => void;
    /** Its pages spread, some in places of their own: all put back in their rows. */
    onRows?: () => void;
    onIcon: () => void;
    onNext?: () => void;
    onPrevious?: () => void;
    onRead: () => void;
    onCopy?: () => void;
    /** A box drawn on it put on the page as a picture, or copied as one. */
    onPutBox?: () => void;
    onCopyBox?: () => void;
    /** Structures picked in it (docs/PDF.md, *Structures picked from a PDF*) put on the page beside it, or copied. */
    onPutStructures?: () => void;
    onCopyStructures?: () => void;
    /** The coordinates in the words selected, or in the box drawn, shown as structures to place in 3D (lib/io/coordinates). */
    onStructures?: () => void;
    /** The pen's card opened, to write on its pages by hand (docs/PRESENTING.md, *Handwriting*). */
    onWrite?: () => void;
    /** A new PDF made from it (docs/PDF.md, *A new PDF from pages*): its pages numbered, or put in order, turned, some left out - each from a card. */
    onNumbers: () => void;
    onPages: () => void;
    /** Its bytes written to a file. */
    onSave: () => void;
  };
  /** The PDFs selected made one new PDF, in the order they are read on the page. */
  onCombinePdfs?: () => void;
  /** The picture right-clicked copied, for Meno and as a picture for other programs. */
  onCopyPicture?: () => void;
  /** The figure in the box drawn on the PDF right-clicked, or the picture right-clicked cut out of a PDF, read as a structure drawn beside it (docs/PDF.md, *Stage 5*). */
  onReadStructure?: () => void;
  /** What a text whose sheet was right-clicked can do: read in the column, made an icon or full size. */
  text?: { icon: boolean; onRead: () => void; onIcon: () => void; onStructures?: () => void; onTable?: () => void };
  /** The whole flow a step or a set right-clicked is part of, saved as a procedure, named. */
  onSaveProcedure?: () => void;
  /** A step's result set right-clicked: whether its molecules are kept in the workspace's file, and that changed. */
  keepInFile?: { kept: boolean; set: (keep: boolean) => void };
  /** A large result set right-clicked (`WorkflowSet.collection`): read as a table in the column. */
  onOpenAsTable?: () => void;
  /** A set right-clicked that holds its molecules itself, on no page (a large set's `collection`): what it holds, said ("118 molecules"), since they go with it when it is deleted. */
  setHoldsOwn?: string;
  /** The selection made a set, a workflow's input; unset, where it holds no whole structure or molecule in 3D. */
  onUseAsInput?: () => void;
  /** The selection saved as an abbreviation of the user's own. */
  onSaveAbbreviation: () => void;
  /** The selection exported - written as a file of another kind - where the menu is the selection's. */
  onExport?: () => void;
  /** An electron-pushing arrow begun from the atom or bond right-clicked, its head full or (`half`) a fishhook's. */
  onPush?: (half: boolean, press?: React.PointerEvent) => void;
  /** What an electron-pushing arrow right-clicked can do: its head made full or half, its lone pair's dots shown or left off (where it leaves one), bent as Meno bends it. */
  push?: {
    half: boolean;
    setHalf: (half: boolean) => void;
    /** From an atom with a negative charge: whether it leaves from a lone pair rather than the charge's mark. */
    source?: { fromPair: boolean; set: (fromPair: boolean) => void };
    pair?: { shown: boolean; set: (shown: boolean) => void };
    onUnbend?: () => void;
  };
  /**
   * What an arrow right-clicked can be (docs/EDITOR-2D.md, *Arrows*): its
   * kind, its heads - one or two; an equilibrium's half or full - dashed or
   * not, how heavy its line is, and straight again where it turns.
   */
  arrow?: {
    kind: ArrowKind | null;
    setKind: (kind: ArrowKind | null) => void;
    heads: 1 | 2;
    setHeads: (heads: 1 | 2) => void;
    full: boolean;
    setFull: (full: boolean) => void;
    dash: boolean;
    setDash: (dash: boolean) => void;
    weight: ArrowWeight | "regular";
    setWeight: (weight: ArrowWeight | "regular") => void;
    onStraighten?: () => void;
    /**
     * Its reaction's atom map (docs/ATOM-MAPPING.md, *On a drawn scheme*):
     * how it stands - none made, made of a drawing changed since, made with
     * atoms that do not all map, or ready - whether it is shown, how many
     * maps there are to step through, and what can be done: made (again),
     * shown or hidden, the next map taken, the reaction written in 3D.
     */
    atomMap?: {
      standing: "none" | "changed" | "incomplete" | "ready";
      shown: boolean;
      maps: number;
      /** Which of them is in use, from 0: the best first. */
      chosen: number;
      onMake: () => void;
      onShow: (shown: boolean) => void;
      onOther: () => void;
      onExport: () => void;
    };
  };
  /** The part - an atom, a bond, a ring, the selection - given a colour, a highlight or a fill, in a card where the menu was. */
  onColour?: () => void;
  /** The molecules in 3D right-clicked - or selected - rendered as a picture or a film (docs/RENDER.md); unset, where no plugin added renders. */
  onRender?: () => void;
  /** What the picture right-clicked can do besides: saved as a file - a picture, or a film, which plays on the page and can be paused. */
  picture?: { film: boolean; playing: boolean | null; onPlay: (on: boolean) => void; onSave: () => void };
  /**
   * What the slide right-clicked can do (docs/PRESENTING.md): a talk given
   * from it; put earlier or later in the talk - none, where it is first or
   * last; the page about it shown while it is, or not; the other
   * proportions; and what is on it selected.
   */
  slide?: { onPresent: () => void; onEarlier?: () => void; onLater?: () => void; around: boolean; onAround: () => void; standard: boolean; onShape: () => void; onSelectOn: () => void };
  /** A slide made round what is selected, last in the talk. */
  onSlideAround?: () => void;
  /**
   * What the shape right-clicked can do (docs/PRESENTING.md, *Shapes*): a
   * rectangle's corners rounded (`onCorners`, the card of them); its line as
   * wide as the drawing's bonds or a width of its own in points (`width`,
   * null as the bonds'), dashed or not; and brought over the other shapes or
   * put under them.
   */
  shape?: {
    onCorners?: () => void;
    width: number | null;
    onWidth: (width: number | null) => void;
    dash: boolean;
    onDash: () => void;
    onFront: () => void;
    onBack: () => void;
  };
  /** What a catalytic cycle right-clicked on its line can do there: an arrow coming in or going out, the arrow there taken away, the way it goes turned round (lib/chem/cycle). */
  cycle?: { onIn: () => void; onOut: () => void; onRemoveArrow?: () => void; ccw: boolean; onTurn: () => void; gap: number; setGap: (gap: number) => void; onResetEnd?: () => void; onResetAll?: () => void };
  /** A rectangle, its corners rounded, made round what is selected. */
  onBoxAround?: () => void;
  /** What the workspace does as a whole - open, save as, fit, R and S, its style - offered on empty space. */
  canvas?: CanvasCommand[];
  clipboard: MenuClipboard;
  /** The molecule in 3D right-clicked, when it is one. */
  molecule3d?: MenuMolecule3D;
  /** The stack of drawings what was right-clicked is a record of (utils/stacks): whether it is laid out as a grid, and laid out so, or stacked again. */
  records?: { spread: boolean; run: () => void };
  /** R and S, E and Z shown on what was right-clicked - or the selection there - or hidden from it, in the words it says (utils/stereoShown); unset, where it has none. */
  stereo?: { name: string; run: () => void };
  /** The structure right-clicked read from a figure (utils/figureNotes): where it came from - and, not yet said to be checked against it, saying so. */
  figure?: { from: string; run?: () => void };
  /** Atom numbers on the molecules in 3D right-clicked, or chosen or selected there - or the atom right-clicked: shown or hidden, in the words each says, and the kinds offered (utils/atomNumbersShown); unset, where there is none. */
  numbers?: { items: { name: string; run: () => void }[]; kinds: { name: string; checked: boolean; run: () => void }[] };
  /** A measurement right-clicked that can be set: how many atoms it is of, and its value opened to be typed. */
  measure3d?: { atoms: number; onSet: () => void };
  /**
   * How large what was right-clicked is shown (docs/WORKSPACE.md,
   * *Magnified display*) - a selection's, the first of it - and its
   * magnification set, each object about its own centre; unset, where it
   * can be shown no other way.
   */
  magnify?: { now: number; set: (k: number) => void };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // a bond's second row of kinds: shown at once where the bond is one of them, else as "more" is pressed
  const [more, setMore] = useState(() => !!bondKind?.current && OTHER_BOND_KINDS.includes(bondKind.current));
  // the magnifications offered, as "Magnification" is pressed
  const [magnifying, setMagnifying] = useState(false);
  // the width it came out at, so that the whole of it stays in the canvas
  const [width, setWidth] = useState(WIDTH);
  useLayoutEffect(() => {
    // (the same width again changes nothing: React leaves it be)
    const w = ref.current?.offsetWidth;
    if (w) setWidth(w);
  }, [target, radical]);
  // (going, chosen from or closed: it does nothing more as it fades - theme/leaving)
  const { leaving, held } = useLeaving();
  // (opened: a guide's step waiting for it goes on)
  useEffect(() => guideNotice("menu"), []);
  useEffect(() => {
    if (leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      // (from none, the first going down and the last going up)
      const next = at < 0 ? (step > 0 ? 0 : buttons.length - 1) : (at + step + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    // (a press elsewhere only closes it: utils/press#swallowPress)
    const onPress = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      swallowPress(e);
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", onClose, true);
    // (the keys the menu's - arrows go through its items from the first - with none of them lit as it opens)
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onClose, true);
    };
  }, [onClose, leaving]);

  const deleteKey = MAC ? "⌫" : "Del";
  const cleanUpKey = MAC ? "⇧⌘K" : "Ctrl+Shift+K";
  const shortcut = (key: string) => (MAC ? `⌘${key}` : `Ctrl+${key}`);
  // (with a selection elsewhere, the keys are the selection's)
  const keys = target.selection === "none";
  const drawing = target.drawing !== false;
  const del = (name: string, withKey = true): Item => ({ name, keys: withKey ? deleteKey : "", run: onDelete, icon: MENU_ICONS.delete, del: true });
  // (an electron-pushing arrow from the atom or bond right-clicked: a pair's, or one electron's)
  const pushFrom: Item[] = onPush
    ? [
        { name: "Electron-pushing arrow", keys: "", run: () => onPush(false), press: (e) => onPush(false, e), icon: MENU_ICONS.pushArrow },
        { name: "Fishhook arrow", keys: "", run: () => onPush(true), press: (e) => onPush(true, e), icon: MENU_ICONS.fishhook },
      ]
    : [];
  // (a colour, a highlight or a ring's fill, for what is drawn)
  const colour: Item[] = onColour ? [{ name: "Colour…", keys: "", run: onColour, icon: MENU_ICONS.colour }] : [];
  // (a record of a stack of drawings: its stack laid out as a grid, or stacked again)
  const stackItem: Item[] = records ? [{ name: records.spread ? "Stack again" : "Lay out as a grid", keys: "", run: records.run, divider: true }] : [];
  const stereoItem: Item[] = [
    ...(stereo ? [{ name: stereo.name, keys: "", run: stereo.run, divider: true }] : []),
    ...(numbers
      ? [
          ...numbers.items.map((it, k) => ({ name: it.name, keys: "", run: it.run, ...(k === 0 && !stereo ? { divider: true } : {}) })),
          ...numbers.kinds.map((k) => ({ name: k.name, keys: "", run: k.run, checked: k.checked })),
        ]
      : []),
  ];
  // a molecule in 3D: its look and its turn, as icons; a measurement of its chosen atoms, its frames, what its calculation gave and its drawing, listed
  const measureName = ["", "", "Measure distance", "Measure angle", "Measure torsion angle"];
  const moleculeRow: Item[] = molecule3d
    ? [
        // (the other look, one step away: the 3D style's secondary, or back to its primary)
        { name: molecule3d.otherLook.name, keys: "", run: molecule3d.otherLook.run, icon: MENU_ICONS[molecule3d.otherLook.atoms] },
        { name: "Turn once", keys: "", run: molecule3d.onTurnOnce, icon: MENU_ICONS.turnOnce },
      ]
    : [];
  const moleculeList: Item[] = molecule3d
    ? [
        ...(molecule3d.chosen >= 2 && molecule3d.chosen <= 4
          ? [{ name: measureName[molecule3d.chosen], keys: "", run: molecule3d.onMeasure }]
          : []),
        ...(molecule3d.chosen >= 2 && molecule3d.chosen <= 4 && molecule3d.onSetChosen
          ? [{ name: SET_NAME[molecule3d.chosen], keys: "", run: molecule3d.onSetChosen }]
          : []),
        ...(molecule3d.overlay
          ? [
              {
                name: `Show ${molecule3d.overlay.on ? "one" : "all"} ${molecule3d.overlay.conformers ? "conformer" : "frame"}${molecule3d.overlay.on ? "" : "s"}`,
                keys: "",
                run: () => molecule3d.overlay!.set(!molecule3d.overlay!.on),
              },
            ]
          : []),
        ...(molecule3d.stack ? [{ name: molecule3d.stack.spread ? "Stack again" : "Lay out as a grid", keys: "", run: molecule3d.stack.run }] : []),
        ...(molecule3d.lists ?? []).map((l) => ({ name: l.name, keys: "", run: l.open })),
        ...(molecule3d.output ? [{ name: `Show ${molecule3d.output.name}`, keys: "", run: molecule3d.output.show }] : []),
        // (in words, beside turning it like the drawing: no picture of it reads at a glance - the maintainer, 2026-10-28)
        { name: "Reset orientation", keys: "", run: molecule3d.onResetTurn },
        ...(molecule3d.onTurnLikeDrawing ? [{ name: "Turn like the drawing", keys: "", run: molecule3d.onTurnLikeDrawing }] : []),
        ...(molecule3d.onRemake ? [{ name: "Make again from the drawing", keys: "", run: molecule3d.onRemake, divider: true }] : []),
        ...(molecule3d.onDrawFormula ? [{ name: "Draw as formula", keys: "", run: molecule3d.onDrawFormula }] : []),
        // (what its file leaves out, completed: one group, a line above it)
        ...[
          ...(molecule3d.onOrdersFromDictionary ? [{ name: "Bond orders from the CCD", keys: "", run: molecule3d.onOrdersFromDictionary }] : []),
          ...(molecule3d.onOrdersFromSmiles ? [{ name: "Bond orders from SMILES…", keys: "", run: molecule3d.onOrdersFromSmiles }] : []),
          ...(molecule3d.onEstimateOrders ? [{ name: "Estimate bond orders from distances", keys: "", run: molecule3d.onEstimateOrders }] : []),
          ...(molecule3d.onAddHydrogens ? [{ name: "Add hydrogens…", keys: "", run: molecule3d.onAddHydrogens }] : []),
          ...(molecule3d.onWholeWithoutH ? [{ name: "Complete without hydrogens", keys: "", run: molecule3d.onWholeWithoutH }] : []),
        ].map((item, k) => (k === 0 ? { ...item, divider: true } : item)),
      ]
    : [];
  // What each target's menu has: the frequent, as icons along its top -
  // Delete at its right end, always - and the rest listed under them.
  // (shown larger or smaller: the magnifications, in a row under "Magnification" as it is pressed, and back to its true size)
  const magnifyItems: Item[] = magnify
    ? [
        {
          name: "Magnification",
          keys: magnificationText(magnify.now),
          run: () => setMagnifying((m) => !m),
          keep: true,
          divider: true,
          after: (
            <AnimatePresence initial={false}>
              {magnifying && (
                <motion.div
                  key="magnifications"
                  role="group"
                  aria-label="Magnifications"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: ROW2 + 4, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="flex items-center gap-0.5 px-2 overflow-hidden"
                >
                  {MAGNIFICATIONS.map((k) => (
                    <button
                      key={k}
                      role="menuitem"
                      aria-pressed={Math.abs(magnify.now - k) < 1e-6}
                      onClick={() => {
                        onClose();
                        magnify.set(k);
                      }}
                      className={`shrink-0 h-7 px-1.5 rounded-md text-xs tabular-nums outline-none transition-colors duration-150 ease-meno ${Math.abs(magnify.now - k) < 1e-6 ? "bg-gh-base text-gh-black" : "text-gh-black hover:bg-gh-base focus:bg-gh-base"}`}
                    >
                      {magnificationText(k)}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          ),
        },
        ...(magnify.now !== 1 ? [{ name: "Back to 100 %", keys: "", run: () => magnify.set(1) }] : []),
      ]
    : [];
  const items: Item[] =
    target.kind === "measure3d"
      ? [del("Delete measurement"), ...(measure3d ? [{ name: SET_NAME[measure3d.atoms], keys: "", run: measure3d.onSet }] : [])]
      : target.kind === "molecule3d" && target.selection !== "here" && molecule3d
      ? [
          { name: "Cut", keys: keys ? shortcut("X") : "", run: molecule3d.onCut, icon: MENU_ICONS.cut },
          { name: "Copy", keys: keys ? shortcut("C") : "", run: molecule3d.onCopy, icon: MENU_ICONS.copy },
          ...moleculeRow,
          del("Delete molecule", keys),
          ...stereoItem,
          ...moleculeList,
          // (rendered, by a plugin added that renders)
          ...(onRender ? [{ name: "Render…", keys: "", run: onRender, divider: moleculeList.length > 0 }] : []),
          ...magnifyItems,
        ]
      : target.kind === "arrow"
      ? [
          ...colour,
          del("Delete arrow"),
          // (what it is, ticked as it is: its kind; its heads; dashed or not; straight again; its line's weight)
          ...(arrow
            ? [
                ...(
                  [
                    [null, "Reaction arrow"],
                    ["equilibrium", "Equilibrium"],
                    ["retrosynthetic", "Retrosynthetic"],
                    ["noReaction", "No reaction"],
                  ] as const
                ).map(([k, name]) => ({ name, keys: "", run: () => arrow.setKind(k), checked: arrow.kind === k })),
                ...(arrow.kind === "equilibrium"
                  ? [
                      { name: "Half heads", keys: "", run: () => arrow.setFull(false), checked: !arrow.full, divider: true },
                      { name: "Full heads", keys: "", run: () => arrow.setFull(true), checked: arrow.full },
                    ]
                  : arrow.kind === "retrosynthetic"
                    ? []
                    : [
                        { name: "Head at the end", keys: "", run: () => arrow.setHeads(1), checked: arrow.heads === 1, divider: true },
                        { name: "Heads at both ends", keys: "", run: () => arrow.setHeads(2), checked: arrow.heads === 2 },
                      ]),
                { name: "Dashed line", keys: "", run: () => arrow.setDash(!arrow.dash), checked: arrow.dash, divider: true },
                ...(arrow.onStraighten ? [{ name: "Straighten", keys: "", run: arrow.onStraighten }] : []),
                ...(
                  [
                    ["thin", "Thin line"],
                    ["regular", "Regular line"],
                    ["thick", "Thick line"],
                  ] as const
                ).map(([w, name], i) => ({ name, keys: "", run: () => arrow.setWeight(w), checked: arrow.weight === w, divider: i === 0 })),
              ]
            : []),
          // (its reaction's atom map: made; shown or hidden, another taken, written in 3D - or said to be incomplete)
          ...(arrow?.atomMap
            ? arrow.atomMap.standing === "ready"
              ? [
                  { name: arrow.atomMap.shown ? "Hide atom map" : "Show atom map", keys: "", run: () => arrow.atomMap!.onShow(!arrow.atomMap!.shown), divider: true },
                  // (which of how many is in use: most differ only in where the hydrogens go, which the drawing does not show)
                  ...(arrow.atomMap.maps > 1 ? [{ name: "Other map", keys: `${arrow.atomMap.chosen + 1} of ${arrow.atomMap.maps}`, run: arrow.atomMap.onOther, keep: true }] : []),
                  { name: "Export reaction in 3D…", keys: "", run: arrow.atomMap.onExport },
                ]
              : [
                  { name: "Atom map", keys: "", run: arrow.atomMap.onMake, divider: true },
                  ...(arrow.atomMap.standing === "incomplete" ? [{ name: "Atom map incomplete", keys: "", run: () => {}, disabled: true }] : []),
                  // (one of a drawing changed since, still shown: taken off it)
                  ...(arrow.atomMap.standing === "changed" && arrow.atomMap.shown ? [{ name: "Hide atom map", keys: "", run: () => arrow.atomMap!.onShow(false) }] : []),
                ]
            : []),
          { name: "Arrow style…", keys: "", run: onArrowStyle, divider: true },
        ]
      : target.kind === "plus"
      ? [del("Delete plus")]
      : target.kind === "caption"
      ? [
          { name: "Edit text", keys: "", run: onEditText, icon: MENU_ICONS.edit },
          ...(words
            ? [
                { name: "Font…", keys: "", run: words.onFont, icon: MENU_ICONS.size },
                { name: "Bold", keys: shortcut("B"), run: words.onBold, icon: MENU_ICONS.bold, checked: words.bold },
                { name: "Italic", keys: shortcut("I"), run: words.onItalic, icon: MENU_ICONS.italic, checked: words.italic },
                { name: "Bullets", keys: "", run: words.onList, icon: MENU_ICONS.bullets, checked: words.list },
              ]
            : []),
          ...colour,
          del("Delete text"),
          // (how its lines lie: listed, ticked as they lie now)
          ...(captionAlign
            ? (
                [
                  ["left", "Align left"],
                  ["center", "Align centre"],
                  ["right", "Align right"],
                  ["justify", "Justify"],
                ] as const
              ).map(([align, name]) => ({ name, keys: "", run: () => captionAlign.set(align), checked: captionAlign.now === align }))
            : []),
          ...(words
            ? [
                // (named by what the keys give, + and =, not where they lie: Shift and = on most keyboards, Shift and ; and Shift and - on a Japanese one)
                { name: "Superscript", keys: shortcut("+"), run: words.onSup, divider: true },
                { name: "Subscript", keys: shortcut("="), run: words.onSub },
              ]
            : []),
          ...(onFitWords ? [{ name: "As wide as its words", keys: "", run: onFitWords, divider: true }] : []),
          ...(onShowSource ? [{ name: "Show in the PDF", keys: "", run: onShowSource, divider: !onFitWords }] : []),
        ]
      : target.kind === "pdf"
      ? [
          ...(pdf
            ? [
                { name: "Read", keys: "", run: pdf.onRead, icon: MENU_ICONS.read },
                // (its pages turned, one on top: at the first or the last, the way on is not there)
                ...(!pdf.spread && !pdf.icon
                  ? [
                      { name: "Previous page", keys: "\u2190", run: pdf.onPrevious ?? (() => {}), icon: MENU_ICONS.previous, disabled: !pdf.onPrevious },
                      { name: "Next page", keys: "\u2192", run: pdf.onNext ?? (() => {}), icon: MENU_ICONS.next, disabled: !pdf.onNext },
                    ]
                  : []),
                { name: pdf.icon ? "Show full size" : "Minimize to an icon", keys: "", run: pdf.onIcon, icon: pdf.icon ? MENU_ICONS.fullSize : MENU_ICONS.toIcon },
              ]
            : []),
          del("Delete PDF"),
          ...(pdf?.onCopy ? [{ name: "Copy", keys: shortcut("C"), run: pdf.onCopy }] : []),
          ...(pdf?.onPutStructures ? [{ name: "Put on the page", keys: "", run: pdf.onPutStructures }] : []),
          ...(pdf?.onCopyStructures ? [{ name: "Copy", keys: shortcut("C"), run: pdf.onCopyStructures }] : []),
          ...(pdf?.onPutBox ? [{ name: "Put on the page", keys: "", run: pdf.onPutBox }] : []),
          ...(pdf?.onCopyBox ? [{ name: "Copy picture", keys: "", run: pdf.onCopyBox }] : []),
          ...(pdf && onReadStructure ? [{ name: "Read as structure", keys: "", run: onReadStructure }] : []),
          ...(pdf?.onStructures ? [{ name: "3D structures", keys: "", run: pdf.onStructures }] : []),
          ...(pdf && !pdf.icon ? [{ name: pdf.spread ? "Gather pages" : "Spread pages", keys: "", run: pdf.onSpread, divider: !!(pdf.onCopy || pdf.onPutBox || pdf.onPutStructures) }] : []),
          ...(pdf?.onRows ? [{ name: "Put pages in rows", keys: "", run: pdf.onRows }] : []),
          ...(pdf?.onWrite && !pdf.icon ? [{ name: "Write on it", keys: "", run: pdf.onWrite, divider: true }] : []),
          // (a new PDF from it, and it written to a file)
          ...(pdf
            ? [
                { name: "Page numbers…", keys: "", run: pdf.onNumbers, divider: true },
                { name: "Pages…", keys: "", run: pdf.onPages },
                ...(onCombinePdfs ? [{ name: "Combine into one PDF", keys: "", run: onCombinePdfs }] : []),
                { name: "Save as PDF…", keys: "", run: pdf.onSave },
              ]
            : []),
        ]
      : target.kind === "text"
      ? [
          ...(text
            ? [
                { name: "Read", keys: "", run: text.onRead, icon: MENU_ICONS.read },
                { name: text.icon ? "Show full size" : "Minimize to an icon", keys: "", run: text.onIcon, icon: text.icon ? MENU_ICONS.fullSize : MENU_ICONS.toIcon },
                ...(text.onStructures ? [{ name: "3D structures", keys: "", run: text.onStructures }] : []),
                // (a text that reads as a table - a CSV, a TSV - put on the page as a set holding it, for the steps that take tables)
                ...(text.onTable ? [{ name: "Put on the page as a table", keys: "", run: text.onTable }] : []),
              ]
            : []),
          del("Delete text"),
        ]
      : target.kind === "picture"
      ? [
          ...(onCopyPicture ? [{ name: "Copy picture", keys: "", run: onCopyPicture, icon: MENU_ICONS.picture }] : []),
          del("Delete picture"),
          ...(onShowSource ? [{ name: "Show in the PDF", keys: "", run: onShowSource }] : []),
          ...(onReadStructure ? [{ name: "Read as structure", keys: "", run: onReadStructure }] : []),
          // (saved as a file; a film, played or paused where it lies)
          ...(picture?.film && picture.playing != null ? [{ name: picture.playing ? "Pause" : "Play", keys: "", run: () => picture.onPlay(!picture.playing) }] : []),
          ...(picture ? [{ name: picture.film ? "Save film…" : "Save picture…", keys: "", run: picture.onSave }] : []),
        ]
      : target.kind === "slide" && slide
      ? [
          { name: "Present from here", keys: "", run: slide.onPresent, icon: MENU_ICONS.present },
          { name: "Earlier in the talk", keys: "", run: slide.onEarlier ?? (() => {}), icon: MENU_ICONS.earlier, disabled: !slide.onEarlier },
          { name: "Later in the talk", keys: "", run: slide.onLater ?? (() => {}), icon: MENU_ICONS.later, disabled: !slide.onLater },
          { name: "Show the page around it", keys: "", run: slide.onAround, icon: MENU_ICONS.around, checked: slide.around },
          del("Delete slide"),
          { name: slide.standard ? "Make it 16:9" : "Make it 4:3", keys: "", run: slide.onShape },
          { name: "Select what is on it", keys: "", run: slide.onSelectOn },
        ]
      : target.kind === "shape" && shape
      ? [
          ...colour,
          del("Delete shape"),
          // (a rectangle's corners; its line's width - as the bonds', as one is made, or its own - ticked as it is; dashed or not)
          ...(shape.onCorners ? [{ name: "Corners…", keys: "", run: shape.onCorners }] : []),
          { name: "Line as bonds", keys: "", run: () => shape.onWidth(null), checked: shape.width == null },
          ...SHAPE_WIDTHS_PT.map((w) => ({ name: `${w} pt line`, keys: "", run: () => shape.onWidth(w), checked: shape.width === w })),
          { name: "Dashed line", keys: "", run: shape.onDash, checked: shape.dash },
          { name: "Bring to front", keys: "", run: shape.onFront, divider: true },
          { name: "Send to back", keys: "", run: shape.onBack },
        ]
      : target.kind === "ink"
      ? [...colour, del("Delete writing")]
      : target.kind === "cycle" && cycle
      ? [
          ...colour,
          { name: "Arrow coming in", keys: "", run: cycle.onIn },
          { name: "Arrow going out", keys: "", run: cycle.onOut },
          ...(cycle.onRemoveArrow ? [{ name: "Remove this arrow", keys: "", run: cycle.onRemoveArrow }] : []),
          { name: cycle.ccw ? "Turn clockwise" : "Turn anticlockwise", keys: "", run: cycle.onTurn, divider: true },
          // (how far its arrows stop short of what is on it, ticked as it is)
          ...CYCLE_GAPS.map(([gap, name], i) => ({ name, keys: "", run: () => cycle.setGap(gap), checked: Math.abs(cycle.gap - gap) < 1e-6, ...(i === 0 ? { divider: true } : {}) })),
          // (ends set by hand given back the cycle's gap: the arrow's right-clicked, or all)
          ...(cycle.onResetEnd ? [{ name: "Reset this arrow's gap", keys: "", run: cycle.onResetEnd, divider: true }] : []),
          ...(cycle.onResetAll ? [{ name: "Reset all arrow gaps", keys: "", run: cycle.onResetAll, ...(cycle.onResetEnd ? {} : { divider: true }) }] : []),
          del("Delete cycle"),
        ]
      : target.kind === "set"
      ? [
          ...(onOpenAsTable ? [{ name: "Open as a table", keys: "", run: onOpenAsTable }] : []),
          ...(setHoldsOwn ? [] : [{ ...del("Delete set"), divider: !!onOpenAsTable }]),
          ...(onSaveProcedure ? [{ name: "Save as procedure…", keys: "", run: onSaveProcedure }] : []),
          ...(keepInFile ? [{ name: "Don't keep in the file", keys: "", run: () => keepInFile.set(!keepInFile.kept), checked: !keepInFile.kept, divider: true }] : []),
          // (a set that holds its molecules itself, on no page: they go with it - said in words, listed last, not as an icon alone, before it is deleted)
          ...(setHoldsOwn ? [{ name: `Delete set and the ${setHoldsOwn} it holds`, keys: deleteKey, run: onDelete, del: true, divider: true }] : []),
        ]
      : target.kind === "step"
      ? [
          ...(step?.onStop
            ? [{ name: "Stop", keys: "", run: step.onStop, icon: MENU_ICONS.stop }]
            : [{ name: "Run", keys: "", run: onRunStep, icon: MENU_ICONS.run }, ...(step?.onRunFrom ? [{ name: "Run from here", keys: "", run: step.onRunFrom, icon: MENU_ICONS.runFrom }] : [])]),
          { name: "Options…", keys: "", run: onStepOptions, icon: MENU_ICONS.options },
          del("Delete step"),
          ...(step?.onShowLog ? [{ name: "Show log", keys: "", run: step.onShowLog }] : []),
          ...(step?.adopt ?? []).map((a, i) => ({ name: `Adopt ${a.job}`, keys: "", run: a.run, ...(i === 0 ? { divider: true } : {}) })),
          ...(step?.onShowFiles ? [{ name: "Show files", keys: "", run: step.onShowFiles }] : []),
          ...(onSaveProcedure ? [{ name: "Save as procedure…", keys: "", run: onSaveProcedure, divider: !!step?.onShowLog }] : []),
          ...(step?.keepRaw
            ? [{ name: "Don't keep raw outputs", keys: "", run: () => step.keepRaw!.set(!step.keepRaw!.kept), checked: !step.keepRaw.kept, divider: true }]
            : []),
        ]
      : target.kind === "wire"
      ? [del("Delete wire")]
      : target.selection === "here"
      ? [
          { name: "Cut", keys: shortcut("X"), run: clipboard.onCut, icon: MENU_ICONS.cut },
          { name: "Copy", keys: shortcut("C"), run: clipboard.onCopy, icon: MENU_ICONS.copy },
          // (on empty space, a paste goes there)
          ...(target.kind == null ? [{ name: "Paste", keys: shortcut("V"), run: clipboard.onPaste, icon: MENU_ICONS.paste }] : []),
          // (on a molecule in 3D in it: that molecule's own; what only a drawing has: none, for molecules in 3D alone)
          ...moleculeRow,
          ...(drawing
            ? [
                { name: "Clean up these structures", keys: cleanUpKey, run: onCleanUp, icon: MENU_ICONS.cleanUp },
                { name: "3D structures", keys: "", run: onMake3d, icon: MENU_ICONS.make3d },
                ...colour,
              ]
            : []),
          del("Delete selection"),
          // (an atom selected alone, right-clicked: its label, as on the atom's own menu)
          ...(target.kind === "atom" && onEditLabel ? [{ name: "Edit label", keys: "", run: onEditLabel }] : []),
          ...moleculeList,
          ...(drawing ? [{ name: "Copy as SMILES", keys: "", run: clipboard.onCopySmiles, divider: moleculeList.length > 0 }] : []),
          ...(onExport ? [{ name: "Export…", keys: "", run: onExport, divider: !drawing && moleculeList.length > 0 }] : []),
          // (its molecules in 3D rendered, by a plugin added that renders)
          ...(onRender ? [{ name: "Render…", keys: "", run: onRender }] : []),
          ...magnifyItems,
          ...stereoItem,
          ...(drawing
            ? [
                { name: "Turn over left to right", keys: "", run: () => onTurnOver("vertical"), divider: true },
                { name: "Turn over top to bottom", keys: "", run: () => onTurnOver("horizontal") },
              ]
            : []),
          ...stackItem,
          ...(onSlideAround ? [{ name: "Slide around these", keys: "", run: onSlideAround, divider: true }] : []),
          ...(onBoxAround ? [{ name: "Box around these", keys: "", run: onBoxAround, divider: !onSlideAround }] : []),
          ...(onCombinePdfs ? [{ name: "Combine into one PDF", keys: "", run: onCombinePdfs, divider: true }] : []),
          ...(onUseAsInput ? [{ name: "Use as input", keys: "", run: onUseAsInput, divider: true }] : []),
          ...(drawing ? [{ name: "Save as abbreviation…", keys: "", run: onSaveAbbreviation, divider: !onUseAsInput }] : []),
        ]
      : target.kind === "push" && push
        ? [
            { name: "Full head", keys: "", run: () => push.setHalf(false), icon: MENU_ICONS.pushArrow, checked: !push.half },
            { name: "Fishhook (half head)", keys: "", run: () => push.setHalf(true), icon: MENU_ICONS.fishhook, checked: push.half },
            ...colour,
            del("Delete arrow", keys),
            ...(push.source
              ? [
                  { name: "From the charge", keys: "", run: () => push.source!.set(false), checked: !push.source.fromPair, divider: true },
                  { name: "From a lone pair", keys: "", run: () => push.source!.set(true), checked: push.source.fromPair },
                ]
              : []),
            ...(push.pair ? [{ name: "Lone pair", keys: "", run: () => push.pair!.set(!push.pair!.shown), checked: push.pair.shown }] : []),
            ...(push.onUnbend ? [{ name: "Bend as Meno does", keys: "", run: push.onUnbend }] : []),
          ]
      : target.kind === "ring"
        ? [...colour, { name: "Select this structure", keys: "", run: onSelectStructure }]
      : target.kind == null
        ? [
            { name: "Paste", keys: shortcut("V"), run: clipboard.onPaste, icon: MENU_ICONS.paste },
            { name: "Select all", keys: shortcut("A"), run: clipboard.onSelectAll, icon: MENU_ICONS.selectAll },
            ...canvas,
          ]
        : [
          // an atom's charge - the + and - keys do it too - and its radical
          ...(target.kind === "atom"
            ? [
                { name: "Charge one up", keys: "+", run: () => onCharge(1), icon: MENU_ICONS.chargeUp },
                { name: "Charge one down", keys: "\u2212", run: () => onCharge(-1), icon: MENU_ICONS.chargeDown },
              ]
            : []),
          ...(target.kind === "bond" && bondKind
            ? [
                // a bond's kinds first, as icons; the other ways it is drawn as a compact row under them
                ...COMMON_BOND_KINDS.map((k): Item => ({ name: BOND_KIND_NAMES[k], keys: "", run: () => bondKind.choose(k), icon: BOND_ICONS[k], checked: bondKind.current === k })),
                { name: "More kinds of bond", keys: "", run: () => setMore((m) => !m), icon: BOND_ICONS.more, checked: more, keep: true },
                ...OTHER_BOND_KINDS.map((k): Item => ({ name: BOND_KIND_NAMES[k], keys: "", run: () => bondKind.choose(k), icon: BOND_ICONS[k], checked: bondKind.current === k, compact: true })),
              ]
            : []),
          ...[
            { name: "Clean up this structure", keys: keys ? cleanUpKey : "", run: onCleanUp, icon: MENU_ICONS.cleanUp },
            { name: "3D structure", keys: "", run: onMake3d, icon: MENU_ICONS.make3d },
            ...pushFrom,
            ...colour,
          ].map((i): Item => (target.kind === "bond" && bondKind ? { ...i, icon: undefined } : i)),
          del(target.kind === "atom" ? "Delete atom" : "Delete bond", keys),
          ...(target.kind === "atom"
            ? [
                ...(onEditLabel ? [{ name: "Edit label", keys: "", run: onEditLabel }] : []),
                ...(onChain ? [{ name: "Chain from here", keys: "", run: onChain }] : []),
                { name: radical ? "No unpaired electron" : "Unpaired electron", keys: "", run: onRadical },
                ...(onExpand ? [{ name: "Expand abbreviation", keys: "", run: onExpand }] : []),
                ...(asTyped ? [{ name: `As typed: ${asTyped.typed}`, keys: "", run: asTyped.run }] : []),
              ]
            : []),
          ...stereoItem,
          { name: "Select this structure", keys: "", run: onSelectStructure },
          ...(figure ? [{ name: figure.from, keys: "", run: () => {}, disabled: true, divider: true }, ...(figure.run ? [{ name: "Checked against the figure", keys: "", run: figure.run }] : [])] : []),
          ...stackItem,
          ...magnifyItems,
        ];
  const row = items.filter((i) => i.icon && !i.compact);
  const compact = items.filter((i) => i.icon && i.compact);
  const row2 = more ? compact : [];
  const list = withRules(items.filter((i) => !i.icon));
  // (a note under a command, said in as many lines as it takes at the menu's width)
  const noteOf = (text?: string) => (text ? Math.ceil(text.length / NOTE_CHARS) * NOTE_LINE + 6 : 0);
  const stepNote = target.kind === "step" ? step?.note : undefined;
  const height =
    (row.length ? ROW + 9 : 0) + noteOf(stepNote) + (compact.length ? ROW2 + 4 : 0) + (magnifying ? ROW2 + 4 : 0) + list.length * ITEM + list.reduce((n, i) => n + noteOf(i.note), 0) + list.filter((i) => i.divider).length * 9 + 12;
  const run = (item: Item) => () => {
    if (!item.keep) onClose();
    item.run();
  };
  return (
    <motion.div
      ref={ref}
      {...RISE}
      {...held}
      role="menu"
      data-guide="menu"
      aria-label={
        target.selection === "here"
          ? "Selection"
          : target.kind === "atom"
            ? "Atom"
            : target.kind === "bond"
              ? "Bond"
              : target.kind === "arrow"
                ? "Arrow"
                : target.kind === "plus"
                  ? "Plus"
                  : target.kind === "caption"
                    ? "Text"
                  : target.kind === "pdf"
                    ? "PDF"
                  : target.kind === "picture"
                    ? "Picture"
                  : target.kind === "text"
                    ? "Text"
                  : target.kind === "set"
                    ? "Set"
                  : target.kind === "step"
                    ? "Step"
                  : target.kind === "wire"
                    ? "Wire"
                  : target.kind === "molecule3d"
                    ? "Molecule"
                    : target.kind === "measure3d"
                      ? "Measurement"
                    : target.kind === "push"
                      ? "Electron-pushing arrow"
                    : target.kind === "ring"
                      ? "Ring"
                    : target.kind === "slide"
                      ? "Slide"
                    : target.kind === "shape"
                      ? "Shape"
                    : target.kind === "ink"
                      ? "Writing"
                    : target.kind === "cycle"
                      ? "Catalytic cycle"
                      : "Canvas"
      }
      tabIndex={-1}
      className="absolute z-50 rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black outline-none"
      style={{
        left: Math.max(0, Math.min(target.x, target.within.width - width - 8)),
        top: Math.max(0, Math.min(target.y, target.within.height - height - 8)),
        minWidth: WIDTH,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* the frequent, as icons - named as the pointer rests on one - and Delete at the right end */}
      {row.length > 0 && (
        <div role="group" aria-label="Frequent" className={`flex items-center gap-0.5 px-1 ${list.length ? "pb-1 mb-1 border-b border-gh-line" : ""}`}>
          {row.map((item) => (
            <button
              key={item.name}
              role="menuitem"
              aria-label={item.name}
              aria-pressed={item.checked}
              title={item.keys ? `${item.name} (${item.keys})` : item.name}
              disabled={item.disabled}
              // (one begun by its press is not begun again by its click - but by a key, it is)
              onClick={item.press ? (e) => e.detail === 0 && run(item)() : run(item)}
              onPointerDown={
                item.press
                  ? (e) => {
                      if (e.button !== 0) return;
                      // (a drag from it, let go where it is put down: begun at once, the menu gone)
                      e.preventDefault();
                      onClose();
                      item.press!(e);
                    }
                  : undefined
              }
              className={`${item.del ? "ml-auto " : ""}shrink-0 rounded-md flex items-center justify-center outline-none transition-colors duration-150 ease-meno disabled:text-gh-line disabled:hover:bg-transparent ${item.checked ? "bg-gh-base text-gh-black" : "text-gh-black hover:bg-gh-base focus:bg-gh-base"}`}
              style={{ width: ROW, height: ROW }}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
      {/* (what running the step drops, said before it is pressed: as wide as the menu, never widening it) */}
      {stepNote && (
        <div className="px-3 pb-1.5 text-[11px] leading-4 text-gh-gray whitespace-normal" style={{ width: 0, minWidth: "100%" }}>
          {stepNote}
        </div>
      )}
      <AnimatePresence initial={false}>
      {row2.length > 0 && (
        <motion.div
          key="other-kinds"
          role="group"
          aria-label="Other kinds"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: ROW2 + 4, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center gap-0.5 px-1 overflow-hidden"
        >
          {row2.map((item) => (
            <button
              key={item.name}
              role="menuitem"
              aria-label={item.name}
              aria-pressed={item.checked}
              title={item.name}
              onClick={run(item)}
              className={`shrink-0 rounded-md flex items-center justify-center outline-none transition-colors duration-150 ease-meno ${item.checked ? "bg-gh-base text-gh-black" : "text-gh-black hover:bg-gh-base focus:bg-gh-base"}`}
              style={{ width: ROW2, height: ROW2 }}
            >
              <span className="scale-90">{item.icon}</span>
            </button>
          ))}
        </motion.div>
      )}
      </AnimatePresence>
      {list.map((item) => [
        item.divider && <div key={`${item.name}-divider`} role="separator" className="my-1 border-t border-gh-line" />,
        <button
          key={item.name}
          role="menuitem"
          // (one begun by its press is not begun again by its click - but by a key, it is)
          onClick={item.press ? (e) => e.detail === 0 && run(item)() : run(item)}
          onPointerDown={
            item.press
              ? (e) => {
                  if (e.button !== 0) return;
                  // (a drag from it, let go where it is put down: begun at once, the menu gone)
                  e.preventDefault();
                  onClose();
                  item.press!(e);
                }
              : undefined
          }
          // (one that says how something stands, not done: shown, not taken)
          disabled={item.disabled}
          className="w-full h-8 px-3 flex items-center justify-between gap-4 text-left whitespace-nowrap transition-colors duration-150 ease-meno hover:bg-gh-base focus:bg-gh-base outline-none disabled:text-gh-gray disabled:hover:bg-transparent"
        >
          <span>{item.name}</span>
          {item.checked ? <CheckIcon aria-label="Chosen" className="h-4 w-4 text-gh-gray" /> : <kbd className="font-sans text-xs text-gh-gray">{item.keys}</kbd>}
        </button>,
        item.note && (
          <div key={`${item.name}-note`} className="px-3 pb-1.5 -mt-1 text-[11px] leading-4 text-gh-gray whitespace-normal" style={{ width: 0, minWidth: "100%" }}>
            {item.note}
          </div>
        ),
        item.after && <Fragment key={`${item.name}-after`}>{item.after}</Fragment>,
      ])}
    </motion.div>
  );
}
