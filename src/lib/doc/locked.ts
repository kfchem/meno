/**
 * The PDFs held that are locked with a password they have not been opened
 * with this session (docs/PDF.md, *Locked with a password*). Each, by its
 * SHA-256, lies as a locked sheet until it is opened with its password
 * (`unlockPdf`, lib/pdf/reader): nothing of it is drawn or read meanwhile.
 * The password itself is never kept here, nor in a workspace's state or file:
 * it is typed, sent, and kept by Meno's reader in memory alone.
 */
import { create } from "zustand";

export const useLocked = create<{ shas: ReadonlySet<string> }>(() => ({ shas: new Set() }));

/** Whether the PDF known by `sha256` is locked with a password it was not opened with. */
export const isLocked = (sha256: string) => useLocked.getState().shas.has(sha256);

/** A PDF held, by its SHA-256, found locked with a password. */
export function markLocked(sha256: string): void {
  if (isLocked(sha256)) return;
  useLocked.setState((s) => ({ shas: new Set([...s.shas, sha256]) }));
}

/** A PDF held, by its SHA-256, opened with its password, or not locked: marked so no more. */
export function markUnlocked(sha256: string): void {
  if (!isLocked(sha256)) return;
  useLocked.setState((s) => ({ shas: new Set([...s.shas].filter((x) => x !== sha256)) }));
}
