import { motion } from "motion/react";
import { RISE } from "../../theme/motion";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { MENU_ICONS } from "./menuIcons";
import { guideNotice } from "../../../lib/plugins/guides";

/**
 * What was right-clicked, where in the canvas the menu opens, and how big
 * the canvas is, so that the menu stays inside it.
 */
export type MenuTarget = {
  /**
   * The atom, bond, reaction arrow or "+" right-clicked, or a molecule in 3D
   * or a measurement on one; null, when it was nothing.
   */
  kind: "atom" | "bond" | "arrow" | "plus" | "caption" | "pdf" | "picture" | "text" | "molecule3d" | "measure3d" | "set" | "step" | "wire" | null;
  /** Its id: for a measurement, its molecule's. */
  id: number | null;
  /** A measurement's own id. */
  measure?: number;
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
type Item = { name: string; keys: string; run: () => void; divider?: boolean; checked?: boolean; icon?: ReactNode; del?: boolean; disabled?: boolean };

/** What the workspace does as a whole, offered on empty space: a rule above it where `divider` says. */
export type CanvasCommand = { name: string; keys: string; run: () => void; divider?: boolean };

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
  /** It alone, cut or copied. */
  onCut: () => void;
  onCopy: () => void;
  /** Turned to lie as the drawing it was made from does; unset, where it was made from none there is. */
  onTurnLikeDrawing?: () => void;
  /** Made again from its drawing, which has changed since; unset, where it has not. */
  onRemake?: () => void;
  /** Drawn as a formula beside it, by Meno's engine: unset, where it has a drawing already. */
  onDrawFormula?: () => void;
  /** Its frames all shown at once, or one: unset, where it has one only; `conformers`, whether they are a conformer set's. */
  overlay?: { on: boolean; conformers: boolean; set: (on: boolean) => void };
  /** Its calculation's lists - its vibrations, its orbitals - each opened under it by name: none, where it gave none. */
  lists?: { name: string; open: () => void }[];
  /** The output it was read from, shown in a tab of its own, by its name: unset, where it was read from none. */
  output?: { name: string; show: () => void };
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
  onDelete,
  onCleanUp,
  onMake3d,
  onSelectStructure,
  onTurnOver,
  onCharge,
  onRadical,
  radical,
  onExpand,
  asTyped,
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
  text,
  onSaveProcedure,
  onUseAsInput,
  onSaveAbbreviation,
  onExport,
  canvas = [],
  clipboard,
  molecule3d,
  measure3d,
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
  /** The selection turned over, left to right or top to bottom. */
  onTurnOver: (axis: "vertical" | "horizontal") => void;
  /** An atom's charge one up or one down. */
  onCharge: (step: 1 | -1) => void;
  /** An atom's unpaired electron given or taken away; `radical`, whether it has one. */
  onRadical: () => void;
  radical: boolean;
  /** An abbreviation's atoms drawn out; unset, where the atom is none. */
  onExpand?: () => void;
  /** Its label as it was typed (obz, read as OBz), and the label made that again; unset, where it was read as typed. */
  asTyped?: { typed: string; run: () => void };
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
  /** A workflow's step right-clicked: run, or opened to its options. */
  onRunStep: () => void;
  onStepOptions: () => void;
  /** What a step right-clicked can do besides, as it is: stopped, while its jobs wait or run; its logs and files shown, where it has jobs. */
  step?: { onRunFrom?: () => void; onStop?: () => void; onShowLog?: () => void; onShowFiles?: () => void };
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
  };
  /** The picture right-clicked copied, for Meno and as a picture for other programs. */
  onCopyPicture?: () => void;
  /** What a text whose sheet was right-clicked can do: read in the column, made an icon or full size. */
  text?: { icon: boolean; onRead: () => void; onIcon: () => void };
  /** The whole flow a step or a set right-clicked is part of, saved as a procedure, named. */
  onSaveProcedure?: () => void;
  /** The selection made a set, a workflow's input; unset, where it holds no whole structure or molecule in 3D. */
  onUseAsInput?: () => void;
  /** The selection saved as an abbreviation of the user's own. */
  onSaveAbbreviation: () => void;
  /** The selection exported - written as a file of another kind - where the menu is the selection's. */
  onExport?: () => void;
  /** What the workspace does as a whole - open, save as, fit, R and S, its style - offered on empty space. */
  canvas?: CanvasCommand[];
  clipboard: MenuClipboard;
  /** The molecule in 3D right-clicked, when it is one. */
  molecule3d?: MenuMolecule3D;
  /** A measurement right-clicked that can be set: how many atoms it is of, and its value opened to be typed. */
  measure3d?: { atoms: number; onSet: () => void };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // the width it came out at, so that the whole of it stays in the canvas
  const [width, setWidth] = useState(WIDTH);
  useLayoutEffect(() => {
    // (the same width again changes nothing: React leaves it be)
    const w = ref.current?.offsetWidth;
    if (w) setWidth(w);
  }, [target, radical]);
  // (opened: a guide's step waiting for it goes on)
  useEffect(() => guideNotice("menu"), []);
  useEffect(() => {
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
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
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
  }, [onClose]);

  const deleteKey = MAC ? "⌫" : "Del";
  const cleanUpKey = MAC ? "⇧⌘K" : "Ctrl+Shift+K";
  const shortcut = (key: string) => (MAC ? `⌘${key}` : `Ctrl+${key}`);
  // (with a selection elsewhere, the keys are the selection's)
  const keys = target.selection === "none";
  const drawing = target.drawing !== false;
  const del = (name: string, withKey = true): Item => ({ name, keys: withKey ? deleteKey : "", run: onDelete, icon: MENU_ICONS.delete, del: true });
  // a molecule in 3D: its look and its turn, as icons; a measurement of its chosen atoms, its frames, what its calculation gave and its drawing, listed
  const measureName = ["", "", "Measure distance", "Measure angle", "Measure torsion angle"];
  const moleculeRow: Item[] = molecule3d
    ? [
        // (the other look, one step away: the 3D style's secondary, or back to its primary)
        { name: molecule3d.otherLook.name, keys: "", run: molecule3d.otherLook.run, icon: MENU_ICONS[molecule3d.otherLook.atoms] },
        { name: "Reset orientation", keys: "", run: molecule3d.onResetTurn, icon: MENU_ICONS.resetTurn },
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
        ...(molecule3d.lists ?? []).map((l) => ({ name: l.name, keys: "", run: l.open })),
        ...(molecule3d.output ? [{ name: `Show ${molecule3d.output.name}`, keys: "", run: molecule3d.output.show }] : []),
        ...(molecule3d.onTurnLikeDrawing ? [{ name: "Turn like the drawing", keys: "", run: molecule3d.onTurnLikeDrawing }] : []),
        ...(molecule3d.onRemake ? [{ name: "Make again from the drawing", keys: "", run: molecule3d.onRemake, divider: true }] : []),
        ...(molecule3d.onDrawFormula ? [{ name: "Draw as formula", keys: "", run: molecule3d.onDrawFormula }] : []),
      ]
    : [];
  // What each target's menu has: the frequent, as icons along its top -
  // Delete at its right end, always - and the rest listed under them.
  const items: Item[] =
    target.kind === "measure3d"
      ? [del("Delete measurement"), ...(measure3d ? [{ name: SET_NAME[measure3d.atoms], keys: "", run: measure3d.onSet }] : [])]
      : target.kind === "molecule3d" && target.selection !== "here" && molecule3d
      ? [
          { name: "Cut", keys: keys ? shortcut("X") : "", run: molecule3d.onCut, icon: MENU_ICONS.cut },
          { name: "Copy", keys: keys ? shortcut("C") : "", run: molecule3d.onCopy, icon: MENU_ICONS.copy },
          ...moleculeRow,
          del("Delete molecule", keys),
          ...moleculeList,
        ]
      : target.kind === "arrow"
      ? [del("Delete arrow"), { name: "Arrow style…", keys: "", run: onArrowStyle }]
      : target.kind === "plus"
      ? [del("Delete plus")]
      : target.kind === "caption"
      ? [
          { name: "Edit text", keys: "", run: onEditText, icon: MENU_ICONS.edit },
          ...(captionAlign
            ? (
                [
                  ["left", "Align left", MENU_ICONS.alignLeft],
                  ["center", "Align centre", MENU_ICONS.alignCentre],
                  ["right", "Align right", MENU_ICONS.alignRight],
                  ["justify", "Justify", MENU_ICONS.justify],
                ] as const
              ).map(([align, name, icon]) => ({ name, keys: "", run: () => captionAlign.set(align), checked: captionAlign.now === align, icon }))
            : []),
          del("Delete text"),
          ...(onShowSource ? [{ name: "Show in the PDF", keys: "", run: onShowSource }] : []),
          ...(onFitWords ? [{ name: "As wide as its words", keys: "", run: onFitWords }] : []),
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
          ...(pdf?.onPutBox ? [{ name: "Put on the page", keys: "", run: pdf.onPutBox }] : []),
          ...(pdf?.onCopyBox ? [{ name: "Copy picture", keys: "", run: pdf.onCopyBox }] : []),
          ...(pdf && !pdf.icon ? [{ name: pdf.spread ? "Gather pages" : "Spread pages", keys: "", run: pdf.onSpread, divider: !!(pdf.onCopy || pdf.onPutBox) }] : []),
          ...(pdf?.onRows ? [{ name: "Put pages in rows", keys: "", run: pdf.onRows }] : []),
        ]
      : target.kind === "text"
      ? [
          ...(text
            ? [
                { name: "Read", keys: "", run: text.onRead, icon: MENU_ICONS.read },
                { name: text.icon ? "Show full size" : "Minimize to an icon", keys: "", run: text.onIcon, icon: text.icon ? MENU_ICONS.fullSize : MENU_ICONS.toIcon },
              ]
            : []),
          del("Delete text"),
        ]
      : target.kind === "picture"
      ? [
          ...(onCopyPicture ? [{ name: "Copy picture", keys: "", run: onCopyPicture, icon: MENU_ICONS.picture }] : []),
          del("Delete picture"),
          ...(onShowSource ? [{ name: "Show in the PDF", keys: "", run: onShowSource }] : []),
        ]
      : target.kind === "set"
      ? [del("Delete set"), ...(onSaveProcedure ? [{ name: "Save as procedure…", keys: "", run: onSaveProcedure }] : [])]
      : target.kind === "step"
      ? [
          ...(step?.onStop
            ? [{ name: "Stop", keys: "", run: step.onStop, icon: MENU_ICONS.stop }]
            : [{ name: "Run", keys: "", run: onRunStep, icon: MENU_ICONS.run }, ...(step?.onRunFrom ? [{ name: "Run from here", keys: "", run: step.onRunFrom, icon: MENU_ICONS.runFrom }] : [])]),
          { name: "Options…", keys: "", run: onStepOptions, icon: MENU_ICONS.options },
          del("Delete step"),
          ...(step?.onShowLog ? [{ name: "Show log", keys: "", run: step.onShowLog }] : []),
          ...(step?.onShowFiles ? [{ name: "Show files", keys: "", run: step.onShowFiles }] : []),
          ...(onSaveProcedure ? [{ name: "Save as procedure…", keys: "", run: onSaveProcedure, divider: !!step?.onShowLog }] : []),
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
              ]
            : []),
          del("Delete selection"),
          ...moleculeList,
          ...(drawing ? [{ name: "Copy as SMILES", keys: "", run: clipboard.onCopySmiles, divider: moleculeList.length > 0 }] : []),
          ...(onExport ? [{ name: "Export…", keys: "", run: onExport, divider: !drawing && moleculeList.length > 0 }] : []),
          ...(drawing
            ? [
                { name: "Turn over left to right", keys: "", run: () => onTurnOver("vertical"), divider: true },
                { name: "Turn over top to bottom", keys: "", run: () => onTurnOver("horizontal") },
              ]
            : []),
          ...(onUseAsInput ? [{ name: "Use as input", keys: "", run: onUseAsInput, divider: true }] : []),
          ...(drawing ? [{ name: "Save as abbreviation…", keys: "", run: onSaveAbbreviation, divider: !onUseAsInput }] : []),
        ]
      : target.kind == null
        ? [
            { name: "Paste", keys: shortcut("V"), run: clipboard.onPaste, icon: MENU_ICONS.paste },
            { name: "Select all", keys: shortcut("A"), run: clipboard.onSelectAll, icon: MENU_ICONS.selectAll },
            ...canvas.map((item, i) => ({ ...item, divider: i > 0 && item.divider })),
          ]
        : [
          // an atom's charge - the + and - keys do it too - and its radical
          ...(target.kind === "atom"
            ? [
                { name: "Charge one up", keys: "+", run: () => onCharge(1), icon: MENU_ICONS.chargeUp },
                { name: "Charge one down", keys: "\u2212", run: () => onCharge(-1), icon: MENU_ICONS.chargeDown },
              ]
            : []),
          { name: "Clean up this structure", keys: keys ? cleanUpKey : "", run: onCleanUp, icon: MENU_ICONS.cleanUp },
          { name: "3D structure", keys: "", run: onMake3d, icon: MENU_ICONS.make3d },
          del(target.kind === "atom" ? "Delete atom" : "Delete bond", keys),
          ...(target.kind === "atom"
            ? [
                { name: radical ? "No unpaired electron" : "Unpaired electron", keys: "", run: onRadical },
                ...(onExpand ? [{ name: "Expand abbreviation", keys: "", run: onExpand }] : []),
                ...(asTyped ? [{ name: `As typed: ${asTyped.typed}`, keys: "", run: asTyped.run }] : []),
              ]
            : []),
          { name: "Select this structure", keys: "", run: onSelectStructure },
        ];
  const row = items.filter((i) => i.icon);
  const list = items.filter((i) => !i.icon);
  const height = (row.length ? ROW + 9 : 0) + list.length * ITEM + list.filter((i) => i.divider).length * 9 + 12;
  const run = (item: Item) => () => {
    onClose();
    item.run();
  };
  return (
    <motion.div
      ref={ref}
      {...RISE}
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
              onClick={run(item)}
              className={`${item.del ? "ml-auto " : ""}shrink-0 rounded-md flex items-center justify-center outline-none transition-colors duration-150 ease-meno disabled:text-gh-line disabled:hover:bg-transparent ${item.checked ? "bg-gh-base text-gh-black" : "text-gh-black hover:bg-gh-base focus:bg-gh-base"}`}
              style={{ width: ROW, height: ROW }}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
      {list.map((item) => [
        item.divider && <div key={`${item.name}-divider`} role="separator" className="my-1 border-t border-gh-line" />,
        <button
          key={item.name}
          role="menuitem"
          onClick={run(item)}
          className="w-full h-8 px-3 flex items-center justify-between gap-4 text-left whitespace-nowrap transition-colors duration-150 ease-meno hover:bg-gh-base focus:bg-gh-base outline-none"
        >
          <span>{item.name}</span>
          {item.checked ? <CheckIcon aria-label="Chosen" className="h-4 w-4 text-gh-gray" /> : <kbd className="font-sans text-xs text-gh-gray">{item.keys}</kbd>}
        </button>,
      ])}
    </motion.div>
  );
}
