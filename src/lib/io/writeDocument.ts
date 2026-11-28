/**
 * A chemist's document written where they chose - a workspace saved, a
 * file exported, a style, a procedure, a picture, a PDF - whole, or not at
 * all (docs/FILE-IO.md, *Save and Export*; src-tauri/src/savefile.rs): a
 * save that fails part way leaves the file that was there as it was.
 * Every such file is written through here; and Meno's own files, kept in
 * its folders - its settings - through `writeAppFile`, the same way.
 */
import { invoke } from "@tauri-apps/api/core";

/** A file to be added to a workspace's file from the disk as it is written (src-tauri keptjobs.rs `Appended`) - a job's, or the workspace's own (`media`): from its job's folder, from a workspace's file that holds it (`from`), from an output's own file (`at`), from the PDFs Meno holds (`pdf`), or from where Meno set it down as the page sent it for this save (`staged`). */
export type Appended = {
  sha256: string;
  job: string;
  name: string;
  from?: string;
  /** Where `from` is a copy kept beside a place the page named, that place. */
  via?: string;
  staged?: string;
  /** Not a job's: one of the workspace's own files, by its media type - kept as the page kept it, a text deflated, the rest stored. */
  media?: string;
  /** An output's own file, where it was read from. */
  at?: string;
  /** A PDF Meno holds. */
  pdf?: true;
};

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
  return (await writeDocumentNow(path, content, keepOld, appended)).kept;
}

/** A file as it is on the disk: its size, and when it was written (ms). */
export type FileNow = { size: number; mtime: number | null };

/**
 * As `writeDocument`; and the file as Meno found it at once in its place
 * (`now`: its size, and when it was written, as `fileNow` says them) - none
 * where it could not look - so that what is noted of it is the file this
 * save wrote, never one written over it since.
 */
export async function writeDocumentNow(path: string, content: Uint8Array | string, keepOld = false, appended: readonly Appended[] = []): Promise<{ kept: string | null; now: FileNow | null }> {
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
  const written = await invoke<{ kept?: string | null; now?: FileNow | null } | null>("write_document", bytes, { headers });
  return { kept: written?.kept ?? null, now: written?.now ?? null };
}

/**
 * One of Meno's own files - `text` at `rel`, a path inside its data folder
 * (`data`) or its local data folder (`local`) - written whole, or not at
 * all: a settings file never left half written, every setting lost.
 */
export async function writeAppFile(rel: string, text: string, folder: "data" | "local" = "data"): Promise<void> {
  await invoke("write_app_file", new TextEncoder().encode(text), { headers: { rel: encodeURIComponent(rel), base: folder } });
}
