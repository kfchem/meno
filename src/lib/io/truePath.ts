/**
 * A file's one true path (docs/FILE-IO.md, *One file, one tab*;
 * src-tauri/src/truepath.rs): the path the file system itself has for it -
 * every link followed, no step up, each name in the case it is kept in -
 * however the path it came by was written. A workspace is known by it:
 * opened, saved, and found again in the tab that holds it.
 */
import { invoke } from "@tauri-apps/api/core";

/** `path`'s one true path; `path` as given where none is to be had (outside Meno's app, say). */
export const truePath = (path: string): Promise<string> => invoke<string>("true_path_of", { path }).catch(() => path);
