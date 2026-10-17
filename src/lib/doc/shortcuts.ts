/**
 * Undo/redo keyboard shortcuts, resolved without touching the DOM so the rule
 * can be tested on its own.
 */

export type UndoIntent = "undo" | "redo" | null;

type KeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: unknown;
};

/**
 * Fields where the browser's own editing should keep Ctrl+Z: single-line
 * inputs (the 2D editor's atom label editor) and rich-text hosts.
 *
 * A `<textarea>` is deliberately **not** in this list: the textarea of a
 * workspace's column of texts is backed by its document, so its undo has to
 * be the document's - unless it says otherwise (`data-native-undo`), its
 * words not the document's until they are kept.
 */
function isNativeEditingTarget(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; dataset?: { nativeUndo?: string } } | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  // (a text box whose words are not yet the document's: words being written on the page)
  if (el.dataset?.nativeUndo != null) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "SELECT";
}

/** A Mac's, where ⌘ does what Ctrl does elsewhere, and a Ctrl-click is a right-click. */
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Ctrl (⌘ on a Mac) with a click or a drag adds to the selection, or takes
 * out of it.
 */
export function addsToSelection(
  event: Pick<KeyLike, "ctrlKey" | "metaKey">,
  mac = IS_MAC,
): boolean {
  return (mac ? event.metaKey : event.ctrlKey) === true;
}

/** Ctrl/Cmd+A selects everything - but not while a text field has the keys. */
/** Ctrl/Cmd+Shift+F has the PDF or text in the column fill the workspace, or go back beside the canvas - not while a text field has the keys. */
export function isFillKey(event: KeyLike & { altKey?: boolean }): boolean {
  return (event.ctrlKey || event.metaKey) === true && event.shiftKey === true && !event.altKey && (event.key || "").toLowerCase() === "f" && !isTextTarget(event.target);
}

/** Ctrl/Cmd+F looks for words, in the PDFs - not while a text field has the keys. */
export function isFindKey(event: KeyLike & { altKey?: boolean }): boolean {
  return (event.ctrlKey || event.metaKey) === true && !event.shiftKey && !event.altKey && (event.key || "").toLowerCase() === "f" && !isTextTarget(event.target);
}

export function isSelectAllKey(event: KeyLike): boolean {
  return (
    (event.ctrlKey || event.metaKey) === true &&
    !event.shiftKey &&
    (event.key || "").toLowerCase() === "a" &&
    !isTextTarget(event.target)
  );
}

/**
 * Ctrl/Cmd+A outside a text field never selects the app's own words - a
 * start page's, a button's - which would otherwise be what Ctrl/Cmd+C then
 * copies, and would stay highlighted, over menus and buttons, into the next
 * tab. A view with things of its own to select (the workspace)
 * selects them itself; a text field keeps the key.
 */
export function keepPageUnselected(event: KeyLike & { preventDefault(): void }): void {
  if (isSelectAllKey(event)) event.preventDefault();
}

/**
 * Ctrl/Cmd+C or +X with nothing to copy - no text selected on the page, and
 * no text field with the keys - leaves the clipboard as it was. On a Mac the
 * Edit menu's Copy would otherwise have the webview write an empty item over
 * whatever was there. A view that copies things of its own (the structure
 * canvas) takes the key itself; text selected on the page still copies.
 */
export function keepClipboard(
  event: KeyLike & { preventDefault(): void },
  selection: { isCollapsed: boolean } | null,
): void {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
  const key = (event.key || "").toLowerCase();
  if (key !== "c" && key !== "x") return;
  if (isTextTarget(event.target) || (selection && !selection.isCollapsed)) return;
  event.preventDefault();
}

/** The kinds of `<input>` words are typed in. */
const TYPED_INPUTS = new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);

/**
 * A right-click shows the system's own menu only on what the system itself
 * edits - a text box, a field in Settings or Quick Add - where its Cut,
 * Copy and Paste work. Anywhere else the menu it would show is not Meno's:
 * the webview's Reload, which starts the whole window afresh, unsaved work
 * and all - on Settings, the tab bar, Quick Add's row, a dialog, and the
 * column's text, which Meno draws itself. Meno's own menus - the canvas's,
 * a PDF's, a colour set's - open as before: this only keeps the system's
 * shut, and stops nothing else hearing of the right-click.
 */
export function keepSystemMenuShut(event: { target?: unknown; preventDefault(): void }): void {
  const el = event.target as { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined;
  const tag = (el?.tagName ?? "").toUpperCase();
  const typedIn = !!el?.isContentEditable || tag === "TEXTAREA" || (tag === "INPUT" && TYPED_INPUTS.has((el?.type ?? "").toLowerCase()));
  if (!typedIn) event.preventDefault();
}

/** Escape lets the selection go - but not while a text field has the keys. */
export function isDeselectKey(event: KeyLike): boolean {
  return event.key === "Escape" && !isTextTarget(event.target);
}

/**
 * A field whose words are the document's, its undo the document's: a
 * `<textarea>`, or what a text Meno draws is typed through
 * (`data-text-field` - an EditContext's element, where there is one).
 */
function isDocumentTextField(target: unknown): boolean {
  const el = target as { tagName?: string; dataset?: { textField?: string } } | null;
  return el?.tagName?.toUpperCase() === "TEXTAREA" || el?.dataset?.textField != null;
}

function isTextTarget(target: unknown): boolean {
  return isNativeEditingTarget(target) || isDocumentTextField(target);
}

/**
 * Ctrl/Cmd+C copies, +X cuts and +V pastes a structure - but not while a
 * text field has the keys, which copies and pastes its own text.
 */
export function clipboardIntent(event: KeyLike & { altKey?: boolean }): "copy" | "cut" | "paste" | null {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return null;
  if (isTextTarget(event.target)) return null;
  const key = (event.key || "").toLowerCase();
  return key === "c" ? "copy" : key === "x" ? "cut" : key === "v" ? "paste" : null;
}

/** Ctrl/Cmd+O opens files, from wherever the keys are. */
export function openIntent(event: KeyLike): boolean {
  return (event.ctrlKey || event.metaKey) === true && !event.shiftKey && !event.altKey && (event.key || "").toLowerCase() === "o";
}

/**
 * Ctrl/Cmd+1 fits the drawing to the view - a key the left hand reaches
 * without leaving the mouse - but not while a text field has the keys.
 */
export function isFitKey(event: KeyLike): boolean {
  return (
    (event.ctrlKey || event.metaKey) === true &&
    !event.shiftKey &&
    !event.altKey &&
    event.key === "1" &&
    !isTextTarget(event.target)
  );
}

/** A shortcut as a menu shows it: ⌘S, ⇧⌘S on a Mac; Ctrl+S, Ctrl+Shift+S elsewhere. */
export function shortcutLabel(key: string, shift = false, mac = IS_MAC): string {
  return mac ? `${shift ? "\u21e7" : ""}\u2318${key}` : `Ctrl+${shift ? "Shift+" : ""}${key}`;
}

/** Ctrl/Cmd+S saves; Ctrl/Cmd+Shift+S saves as. */
export function saveIntent(event: KeyLike): "save" | "saveAs" | null {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if ((event.key || "").toLowerCase() !== "s") return null;
  return event.shiftKey ? "saveAs" : "save";
}

/**
 * A talk given from the slides on the page (docs/PRESENTING.md): from the
 * first by Ctrl/Cmd+Shift+Enter or F5, from the slide in view by
 * Ctrl/Cmd+Enter or Shift+F5, as slides software has it - but not while a
 * text field has the keys.
 */
export function presentIntent(event: KeyLike): "first" | "here" | null {
  if (isTextTarget(event.target) || event.altKey) return null;
  if (event.key === "F5" && !event.ctrlKey && !event.metaKey) return event.shiftKey ? "here" : "first";
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) return event.shiftKey ? "first" : "here";
  return null;
}

/**
 * Ctrl/Cmd+Shift+K cleans a structure up - but not while a text field has
 * the keys.
 */
export function isCleanUpKey(event: KeyLike): boolean {
  return (
    (event.ctrlKey || event.metaKey) === true &&
    event.shiftKey === true &&
    (event.key || "").toLowerCase() === "k" &&
    !isTextTarget(event.target)
  );
}

/**
 * Delete or Backspace on its own deletes what is under the pointer - but not
 * while a text field has the keys.
 */
export function isDeleteKey(event: KeyLike): boolean {
  return (
    (event.key === "Delete" || event.key === "Backspace") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !isTextTarget(event.target)
  );
}

/**
 * + or - on its own - the keys that have them, the number pad's among them,
 * Shift or not - puts the charge of what is under the pointer one up or one
 * down: 1, -1, or 0 for any other key. Not while typing in a box, and not
 * with Ctrl or Cmd, which zoom.
 */
export function chargeStep(event: KeyLike): 1 | -1 | 0 {
  if (event.ctrlKey || event.metaKey || event.altKey) return 0;
  if (isTextTarget(event.target)) return 0;
  if (event.key === "+") return 1;
  if (event.key === "-" || event.key === "\u2212") return -1;
  return 0;
}

/** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. */
export function undoIntent(event: KeyLike): UndoIntent {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if (isNativeEditingTarget(event.target)) return null;
  const key = (event.key || "").toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

/**
 * Which of + and = a key gives, for letters raised (+) and lowered (=):
 * by what it gives, wherever a keyboard has it - Shift and = for + on most,
 * Shift and ; for + and Shift and - for = on a Japanese one - or, where a
 * key is reported by its place alone, the = key and Shift for +.
 */
export function plusOrEquals(event: Pick<KeyLike, "key" | "shiftKey"> & { code?: string }): "+" | "=" | null {
  if (event.key === "+" || (event.code === "Equal" && event.shiftKey)) return "+";
  if (event.key === "=" || event.code === "Equal") return "=";
  return null;
}
