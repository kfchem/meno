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
 */
export function tabHolding(path: string, tabs: readonly { id: string; openedFrom?: string }[]): string | undefined {
  return tabs.find((t) => (paths.has(t.id) ? paths.get(t.id)!() : t.openedFrom) === path)?.id;
}

