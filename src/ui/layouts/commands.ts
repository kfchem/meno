import { create } from "zustand";

/**
 * Each time Open… was asked for from inside a view - the menu on empty
 * space - counted: Meno shows the system's file dialog (App), as Ctrl/Cmd+O
 * does.
 */
export const useOpenAsked = create<{ asked: number }>(() => ({ asked: 0 }));

/** Asks for Open…, from anywhere. */
export function askToOpen(): void {
  useOpenAsked.setState((s) => ({ asked: s.asked + 1 }));
}

/**
 * Files to be opened as Open opens them - each in a tab of its own (or in
 * place of the blank canvas in front) - asked for from inside a view: a
 * workspace file dropped onto a canvas, or copied in the Finder or
 * Explorer and pasted there (the maintainer, 2026-10-12: opened, as Open
 * does, no longer pasted in part). The latest asked for, with a count, so
 * that the same file dropped twice is opened twice.
 */
export const useFilesAsked = create<{ files: readonly File[]; asked: number }>(() => ({ files: [], asked: 0 }));

/** Asks for files to be opened as Open opens them, from anywhere. */
export function askToOpenFiles(files: readonly File[]): void {
  if (!files.length) return;
  useFilesAsked.setState((s) => ({ files, asked: s.asked + 1 }));
}

/** Whether a file dropped or pasted on a canvas is a workspace's, opened as Open opens it - by its bytes, as a zip `.meno` is, or by what Meno read it as. */
export function opensAsWorkspace(zipped: boolean, kind: string | null | undefined, workspaceKind: string): boolean {
  return zipped || kind === workspaceKind;
}
