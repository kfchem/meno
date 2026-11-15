/**
 * The app menu's Edit > Undo and Redo (macOS; src-tauri/src/editmenu.rs).
 * Tauri's own items undo only what the web view itself edits - a text
 * field - and did nothing to the workspace, which keeps its own history, as
 * Cmd+Z and Cmd+Shift+Z reach it (`undoIntent`). So the menu's items are
 * Meno's: each tells the page, which does what the key does - where a
 * text field of the browser's own undo has the focus, that field's undo;
 * else the active tab's document - and the page tells the menu which of
 * them has anything to do, so that one without is greyed.
 *
 * Windows and Linux have no app menu: their window shows none, and the keys
 * are all there is.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { undoIntent } from "./shortcuts";

export type EditCommand = "undo" | "redo";

/** The event the app sends the page when an item of the Edit menu is chosen, its payload the command. */
export const EDIT_MENU_EVENT = "edit-menu";

const isCommand = (v: unknown): v is EditCommand => v === "undo" || v === "redo";

/** Whether the focus is in a field whose own editing keeps the undo keys: the browser's, not the document's (`undoIntent`). */
export function fieldHasUndo(active: unknown): boolean {
  return undoIntent({ key: "z", metaKey: true, target: active }) === null;
}

/** What choosing a command of the menu did: the field's own undo, the document's step, or nothing - none to take back. */
export type EditDone = "field" | "document" | "nothing";

/**
 * Undo or redo as the keys do it: in a field of the browser's own editing,
 * its undo (`field`, given where the page asks the browser); else a step of
 * the active document (`doc`, none while no tab holds one).
 */
export function editFromMenu(command: EditCommand, o: { active: unknown; doc: { undo(): boolean; redo(): boolean } | undefined; field: (command: EditCommand) => boolean }): EditDone {
  if (fieldHasUndo(o.active)) return o.field(command) ? "field" : "nothing";
  if (!o.doc) return "nothing";
  return (command === "undo" ? o.doc.undo() : o.doc.redo()) ? "document" : "nothing";
}

/** Which of the menu's items can do anything: those the active document has a step for - and both while a field of the browser's own undo has the focus, whose history is not known here. */
export function editMenuState(history: { undoDepth: number; redoDepth: number } | null, active: unknown): { undo: boolean; redo: boolean } {
  if (fieldHasUndo(active)) return { undo: true, redo: true };
  return { undo: (history?.undoDepth ?? 0) > 0, redo: (history?.redoDepth ?? 0) > 0 };
}

/** `run` given each command the menu sends. What stops it. */
export function watchEditMenu(run: (command: EditCommand) => void, hear: typeof listen = listen): () => void {
  let gone = false;
  let stop: (() => void) | undefined;
  void hear<unknown>(EDIT_MENU_EVENT, (e) => {
    if (isCommand(e.payload)) run(e.payload);
  })
    .then((unlisten) => (gone ? unlisten() : (stop = unlisten)))
    .catch(() => {});
  return () => {
    gone = true;
    stop?.();
  };
}

/** Tells the menu which of its items can do anything (`editMenuState`). A menu that is not there, or is not told, is as it was. */
export function tellEditMenu(state: { undo: boolean; redo: boolean }, send: typeof invoke = invoke): void {
  void send("edit_menu_state", state).catch(() => {});
}
