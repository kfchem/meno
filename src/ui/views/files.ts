/**
 * Files opened - a structure's file, a calculation's output - go onto the
 * page of the workspace in front, as a drop on its canvas puts them; only a
 * workspace file opens a tab of its own (the maintainer, 2026-10-13). As
 * PDFs (./pdfs) and texts (./texts) go: each canvas that is a tab's own
 * says how it takes them, while it is there, and the app asks the one in
 * front. Where none is in front, they go to the workspace last in front;
 * where there is none, to a canvas opened for them - given to it as it
 * comes to take them (`giveFiles`).
 */

/** A file opened: its name, what it holds, and where it is, where Open said. */
export type OpenedFile = { name: string; bytes: Uint8Array; path?: string };

const takers = new Map<string, (files: OpenedFile[]) => void>();
/** Files given to a tab before it takes files: a canvas just opened for them. */
const waiting = new Map<string, OpenedFile[]>();

/** Sets how tab `id` takes files opened - those given it already taken at once; the function returned takes it away again. */
export function setFileTaker(id: string, take: (files: OpenedFile[]) => void): () => void {
  takers.set(id, take);
  const given = waiting.get(id);
  if (given) {
    waiting.delete(id);
    take(given);
  }
  return () => {
    if (takers.get(id) === take) takers.delete(id);
  };
}

/** How tab `id` takes files opened, where it takes them. */
export function fileTakerOf(id: string): ((files: OpenedFile[]) => void) | undefined {
  return takers.get(id);
}

/** Gives tab `id` files opened: taken now, where it takes them, or as soon as it does. */
export function giveFiles(id: string, files: OpenedFile[]): void {
  const take = takers.get(id);
  if (take) take(files);
  else waiting.set(id, [...(waiting.get(id) ?? []), ...files]);
}

/** Forgets files given to tab `id` that it never took: the tab closed, or another took its place. */
export function forgetFiles(id: string): void {
  waiting.delete(id);
}
