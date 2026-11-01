/**
 * Meno's own right-click menu on words typed or read in place - the
 * column's text, words being written on the page, an atom's label being
 * written, a Markdown text read in the column - where the system's is kept
 * shut (lib/doc/shortcuts `keepSystemMenuShut`: its one item there was the
 * webview's Reload). Cut, Copy, Paste and Select All, as the keys do them;
 * one that does not apply now is shown, but cannot be pressed (the
 * maintainer, 2026-10-13). On a text in the column, 3D structures besides,
 * where what is selected - or, nothing selected, the whole text - holds
 * coordinates (lib/io/coordinates). The menu itself is TextMenuHost.tsx.
 */
import { create } from "zustand";
import { IS_MAC } from "../../../lib/doc/shortcuts";
import { readClipboard, writeClipboard } from "../../../lib/clipboard";
import { plainLines } from "../../../lib/text/editing";
import { readCoordinates, type CoordinateStructure } from "../../../lib/io/coordinates";
import { quotedTables } from "../../../lib/io/kinds";
import type { FieldHost, TypingField } from "./typingField";

/** What the menu works on: words that can be changed - a field's - or only read. */
export type TextMenuTarget = {
  /** What is selected, as text: none, where nothing is. */
  selected(): string;
  /** Whether there are any words at all. */
  hasText(): boolean;
  selectAll(): void;
  /** What is selected replaced by `text` - taken away, with none: for words that can be changed, and none for words only read. */
  replace?: (text: string, pasted: boolean) => void;
  /** Told after any of them: the caret and what is selected shown again, the keys the words' again. */
  after?: () => void;
  /** A text's in the column: the whole of it, and its name - what coordinates in it are read from where nothing is selected. */
  text?: { whole: () => string; name: string };
};

export type TextMenuKind = "cut" | "copy" | "paste" | "selectAll";
export type TextMenuItem = { kind: TextMenuKind; name: string; keys: string; enabled: boolean };

const KINDS: readonly TextMenuKind[] = ["cut", "copy", "paste", "selectAll"];
const NAME: Record<TextMenuKind, string> = { cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select All" };
const KEY: Record<TextMenuKind, string> = { cut: "X", copy: "C", paste: "V", selectAll: "A" };

/**
 * The menu's items, with their keys, each enabled where it applies: Cut and
 * Copy with words selected; Cut and Paste only where the words can be
 * changed, Paste with text on the clipboard; Select All with any words.
 */
export function textMenuItems(t: TextMenuTarget, clipboardText: boolean, mac = IS_MAC): TextMenuItem[] {
  const some = t.selected().length > 0;
  const enabled: Record<TextMenuKind, boolean> = {
    cut: some && !!t.replace,
    copy: some,
    paste: clipboardText && !!t.replace,
    selectAll: t.hasText(),
  };
  return KINDS.map((kind) => ({ kind, name: NAME[kind], keys: mac ? `⌘${KEY[kind]}` : `Ctrl+${KEY[kind]}`, enabled: enabled[kind] }));
}

/** What an item does, through the clipboard, as its key does it. */
export async function runTextMenu(kind: TextMenuKind, t: TextMenuTarget): Promise<void> {
  if (kind === "copy" || kind === "cut") {
    const words = t.selected();
    if (!words) return;
    await writeClipboard([{ flavor: "text", text: words }]);
    if (kind === "cut") t.replace?.("", false);
  } else if (kind === "paste") {
    const got = await readClipboard(["text"]);
    if (!got?.text || !t.replace) return;
    t.replace(plainLines(got.text), true);
  } else t.selectAll();
  t.after?.();
}

/** Whether the clipboard holds text to paste. */
export async function clipboardHasText(): Promise<boolean> {
  return !!(await readClipboard(["text"]).catch(() => null))?.text;
}

/** The words a field types into - the column's text, words on the page, a label being written: all four items theirs. */
export function fieldTarget(ed: FieldHost, field: () => TypingField | null): TextMenuTarget {
  return {
    selected: () => ed.selectedText(),
    hasText: () => ed.text.length > 0,
    selectAll: () => ed.command({ kind: "selectAll" }, IS_MAC),
    replace: (text, pasted) => ed.replaceSelection(text, pasted),
    after: () => {
      const f = field();
      f?.focus();
      f?.sync();
      ed.onChange();
    },
  };
}

/** The structures the coordinates in a column's text hold - what is selected, or the whole of it - none where there are none or no text's. */
export function structuresIn(t: TextMenuTarget): CoordinateStructure[] {
  if (!t.text) return [];
  return readCoordinates(t.selected() || t.text.whole(), quotedTables());
}

/** The menu, open where it was asked for, on what; or none. And what 3D Structures does with what it found, where the workspace takes them (`structures`). */
export const useTextMenu = create<{
  at: { x: number; y: number; target: TextMenuTarget } | null;
  open: (x: number, y: number, target: TextMenuTarget) => void;
  close: () => void;
  structures: ((found: CoordinateStructure[], name: string) => void) | null;
  takeStructures: (take: ((found: CoordinateStructure[], name: string) => void) | null) => void;
}>((set) => ({
  at: null,
  open: (x, y, target) => set({ at: { x, y, target } }),
  close: () => set({ at: null }),
  structures: null,
  takeStructures: (take) => set({ structures: take }),
}));
