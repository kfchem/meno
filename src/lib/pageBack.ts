/**
 * The window's page stopped under Meno and started again
 * (docs/ARCHITECTURE.md, *When the page stops*; src-tauri/src/pagestop.rs).
 * What the app cannot know by itself the page tells it as it goes - the
 * workspace file being saved, by its name, and the files its tabs hold, to
 * be opened again - and the page started again is told, once, what came of
 * the chemist's work, in words the app makes.
 */
import { invoke } from "@tauri-apps/api/core";
import { savedPaths } from "./doc/savers";

type Send = (command: string, args: Record<string, unknown>) => Promise<unknown>;
const send: Send = (command, args) => invoke(command, args);

/** The last list of files told, so that the same list is not told again. */
let told: string | undefined;

/** The files the window's tabs hold now (lib/doc/savers), told to the app where they changed. */
export function tellOpenFiles(paths: readonly string[] = savedPaths(), to: Send = send): void {
  const key = JSON.stringify(paths);
  if (key === told) return;
  told = key;
  void to("page_files", { paths: [...paths] }).catch(() => {});
}

/** The last part of `path`, as a file's name. */
const nameOf = (path: string) => path.split(/[\\/]/).pop() || path;

/**
 * `save` - a workspace written to `path` - with the app told of it: its
 * file's name as it begins, and that it ended as it ends, however it ends;
 * then the files the tabs hold, as the save may have moved one.
 */
export async function whileSaving<T>(path: string, save: () => Promise<T>, to: Send = send): Promise<T> {
  await to("page_saving", { name: nameOf(path) }).catch(() => {});
  try {
    return await save();
  } finally {
    void to("page_saving", { name: null }).catch(() => {});
    tellOpenFiles(undefined, to);
  }
}

/**
 * What the page is to say as it comes up: the app's words, where this page
 * was started again after the one before it stopped - asked once, and the
 * app gives them once; none at any other start, nor where the app cannot be
 * asked.
 */
export async function cameBack(to: Send = send): Promise<string | null> {
  return ((await to("page_came_back", {}).catch(() => null)) as string | null) ?? null;
}

/** `say` given what the page is to say as it comes up (`cameBack`), where there is anything. */
export async function sayCameBack(say: (words: string) => void, to: Send = send): Promise<void> {
  const words = await cameBack(to);
  if (words) say(words);
}
