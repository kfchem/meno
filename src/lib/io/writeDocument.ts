/**
 * A chemist's document written where they chose - a workspace saved, a
 * file exported, a style, a procedure, a picture, a PDF - whole, or not at
 * all (docs/FILE-IO.md, *Save and Export*; src-tauri/src/savefile.rs): a
 * save that fails part way leaves the file that was there as it was.
 * Every such file is written through here; and Meno's own files, kept in
 * its folders - its settings - through `writeAppFile`, the same way.
 */
import { invoke } from "@tauri-apps/api/core";

/** A job's file to be added to a workspace's file from the disk as it is written (src-tauri keptjobs.rs `Appended`). */
export type Appended = { sha256: string; job: string; name: string };

/**
 * `content` - bytes, or text written as UTF-8 - written to `path`, where
 * the chemist chose: whole, or not at all. With `keepOld`, the file there
 * is first kept beside it as it is - `<name>.bak`, or numbered where that
 * is taken - and where it is kept is given back; none where nothing was.
 * A workspace's file is given its steps' job files (`appended`), each added
 * from its job's folder before it takes the old one's place: sent after its
 * bytes, as JSON, their length said.
 */
export async function writeDocument(path: string, content: Uint8Array | string, keepOld = false, appended: readonly Appended[] = []): Promise<string | null> {
  let bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const headers: Record<string, string> = { path: encodeURIComponent(path) };
  if (keepOld) headers["keep-old"] = "1";
  if (appended.length) {
    const list = new TextEncoder().encode(JSON.stringify(appended));
    const both = new Uint8Array(bytes.length + list.length);
    both.set(bytes);
    both.set(list, bytes.length);
    headers.appended = String(bytes.length);
    bytes = both;
  }
  return (await invoke<string | null>("write_document", bytes, { headers })) ?? null;
}

/**
 * One of Meno's own files - `text` at `rel`, a path inside its data folder
 * (`data`) or its local data folder (`local`) - written whole, or not at
 * all: a settings file never left half written, every setting lost.
 */
export async function writeAppFile(rel: string, text: string, folder: "data" | "local" = "data"): Promise<void> {
  await invoke("write_app_file", new TextEncoder().encode(text), { headers: { rel: encodeURIComponent(rel), base: folder } });
}
