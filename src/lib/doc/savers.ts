import { truePath } from "../io/truePath";

/**
 * What saves each tab that can be saved, by the tab's id: set by the tab's
 * view while it is there, so that closing a tab - or the window - with
 * unsaved changes can offer to save it first. Each resolves true once the
 * tab is saved, false where the chemist did not say where, or it failed.
 */
const savers = new Map<string, () => Promise<boolean>>();

/** Sets what saves tab `id`; the function returned takes it away again. */
export function setSaver(id: string, save: () => Promise<boolean>): () => void {
  savers.set(id, save);
  return () => {
    if (savers.get(id) === save) savers.delete(id);
  };
}

/** What saves tab `id`, if it can be saved. */
export function saverOf(id: string): (() => Promise<boolean>) | undefined {
  return savers.get(id);
}

/**
 * Where each tab's workspace is saved, by the tab's id (its `savedPath`):
 * set by the tab's view as `setSaver` is, so that a workspace file opened
 * again - pasted, dropped, double-clicked, picked in Open - brings forward
 * the tab that holds it, rather than a second tab whose Save and the first
 * one's overwrite each other.
 */
const paths = new Map<string, () => string | null>();

/** Sets where tab `id` is saved, as it is read when asked; the function returned takes it away again. */
export function setSavedPathOf(id: string, path: () => string | null): () => void {
  paths.set(id, path);
  return () => {
    if (paths.get(id) === path) paths.delete(id);
  };
}

/**
 * The tab of `tabs` that holds the workspace saved at `path`, if one does:
 * where its view says it is saved, or - its view not yet there, as a tab
 * just opened - the path it was opened from (`openedFrom`).
 *
 * Each is a file's one true path (lib/io/truePath), so that one file is
 * one path however it was reached: a workspace's tab is opened with it -
 * a file opened from outside Meno, dropped or pasted has it from the app
 * (src-tauri/src/opened.rs), one picked in Open's dialog is given it
 * (`openEachOnce`) - and a save leaves it where it saved (fileActions,
 * `writtenWhere`); `path` is asked about by it. They are compared exactly:
 * where the file system tells case apart, two paths that differ in case
 * alone are two files, and the one true path has already made one file's
 * paths one.
 */
export function tabHolding(path: string, tabs: readonly { id: string; openedFrom?: string }[]): string | undefined {
  return tabs.find((t) => (paths.has(t.id) ? paths.get(t.id)!() : t.openedFrom) === path)?.id;
}

/**
 * Workspace files found to open, each in a tab of its own, by its one true
 * path (`truePathOf`): one a tab already holds - however its path was
 * written, in another case, through a link - brings that tab forward
 * (`bring`), never a second tab whose saves and the first one's overwrite
 * each other; the rest are opened (`open`), named and to be saved as
 * their files are.
 */
export async function openEachOnce<W extends { name: string; path: string }>(
  found: readonly W[],
  tabs: () => readonly { id: string; openedFrom?: string }[],
  bring: (id: string) => void,
  open: (w: W) => void,
  truePathOf: (path: string) => Promise<string> = truePath,
): Promise<void> {
  for (const w of found) {
    const path = await truePathOf(w.path);
    const held = tabHolding(path, tabs());
    if (held) bring(held);
    else open({ ...w, name: path.split(/[\\/]/).pop() || w.name, path });
  }
}

