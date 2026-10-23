/**
 * The files workspaces keep - a picture, a PDF - whose bytes could not be
 * had this session: damaged in the workspace's file, or not in it at all
 * (docs/FILE-IO.md, *The workspace file*). Each, by its SHA-256, is marked
 * where it lies until it is had again - from another file, or put down
 * afresh - or taken away: never healed unseen, never let drop unsaid. A
 * save keeps none of them, and says so (Workspace/utils/workspace).
 */
import { create } from "zustand";

export const useNotHad = create<{ shas: ReadonlySet<string> }>(() => ({ shas: new Set() }));

/** Whether a file kept by `sha256` could not be had this session. */
export const isNotHad = (sha256: string) => useNotHad.getState().shas.has(sha256);

/** A file kept, by its SHA-256, that could not be had. */
export function markNotHad(sha256: string): void {
  if (isNotHad(sha256)) return;
  useNotHad.setState((s) => ({ shas: new Set([...s.shas, sha256]) }));
}

/** A file kept, by its SHA-256, had now: marked no more. */
export function markHad(sha256: string): void {
  if (!isNotHad(sha256)) return;
  useNotHad.setState((s) => ({ shas: new Set([...s.shas].filter((x) => x !== sha256)) }));
}
