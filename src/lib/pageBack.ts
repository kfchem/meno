/**
 * The window's page stopped under Meno and started again
 * (docs/ARCHITECTURE.md, *When the page stops*; src-tauri/src/pagestop.rs).
 * What the app cannot know by itself the page tells it as it goes - the
 * workspace file being saved, by its name, its write sent with the token
 * the app gave that save, and the files its tabs hold, to be opened again -
 * and the page started again is told, once, what came of the chemist's
 * work, in words the app makes: at once, and, where a save was still being
 * written, once that save has ended.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

/** The saves under way, each its file's name and the token the app gave it. */
const saves = new Set<{ name: string; token: number }>();

/** The token a document written to `path` is sent with: that of the save under way of a file of its name, if one is. */
export function saveTokenFor(path: string): number | undefined {
  const name = nameOf(path);
  for (const s of saves) if (s.name === name) return s.token;
  return undefined;
}

/**
 * `save` - a workspace written to `path` - with the app told of it: its
 * file's name as it begins (the token it gives the save sent with its
 * write: lib/io/writeDocument), and that it ended as it ends, however it
 * ends; then the files the tabs hold, as the save may have moved one.
 */
export async function whileSaving<T>(path: string, save: () => Promise<T>, to: Send = send): Promise<T> {
  const token = (await to("page_saving", { name: nameOf(path) }).catch(() => null)) as number | null;
  const held = typeof token === "number" ? { name: nameOf(path), token } : null;
  if (held) saves.add(held);
  try {
    return await save();
  } finally {
    if (held) {
      saves.delete(held);
      void to("page_saved", { token: held.token }).catch(() => {});
    }
    tellOpenFiles(undefined, to);
  }
}

/**
 * What the page is to say as it comes up: the app's words, where this page
 * was started again after the one before it stopped - asked once, and the
 * app gives them once; none at any other start, nor where the app cannot be
 * asked. `later`: what it says once a save that was being written has
 * ended.
 */
export async function cameBack(to: Send = send, later = false): Promise<string | null> {
  return ((await to(later ? "page_came_back_later" : "page_came_back", {}).catch(() => null)) as string | null) ?? null;
}

/**
 * `say` given what the page is to say as it comes up (`cameBack`), where
 * there is anything; and what it is to say once a save being written has
 * ended, as the app says it has (`page-came-back`) - asked as it comes up
 * too, should that be told before this page listens. What stops it.
 */
export function sayCameBack(say: (words: string) => void, to: Send = send, hear: typeof listen = listen): () => void {
  const later = () => void cameBack(to, true).then((words) => words && say(words));
  let gone = false;
  let stop: (() => void) | undefined;
  void cameBack(to).then((words) => {
    if (words) say(words);
    // (asked after the first, so that what is said later comes after it)
    void hear("page-came-back", later)
      .then((unlisten) => (gone ? unlisten() : (stop = unlisten)))
      .then(later)
      .catch(() => {});
  });
  return () => {
    gone = true;
    stop?.();
  };
}
