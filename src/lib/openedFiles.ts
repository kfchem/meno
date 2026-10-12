/**
 * Workspace files opened from outside Meno - a .meno double-clicked, or
 * dropped on Meno's icon (docs/FILE-IO.md, *Opening a workspace file from
 * the system*). The app keeps each until the page takes it, and says when
 * there are some (src-tauri/src/opened.rs); the page takes them as it
 * comes up, and again each time it is told.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** The files opened from outside that the page has not taken: taken. */
export const takeOpenedFiles = () => invoke<string[]>("opened_files");

/**
 * `open` given each lot of files opened from outside: those opened before
 * the page was up at once, then each lot as the app says there is one.
 * What stops it.
 */
export function watchOpenedFiles(open: (paths: string[]) => void, take: () => Promise<string[]> = takeOpenedFiles, hear: typeof listen = listen): () => void {
  const now = () =>
    void take()
      .then((paths) => {
        if (paths.length) open(paths);
      })
      .catch(() => {});
  now();
  let gone = false;
  let stop: (() => void) | undefined;
  void hear("opened-files", now)
    .then((unlisten) => (gone ? unlisten() : (stop = unlisten)))
    .catch(() => {});
  return () => {
    gone = true;
    stop?.();
  };
}
