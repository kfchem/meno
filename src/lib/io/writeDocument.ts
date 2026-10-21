/**
 * A chemist's document written where they chose - a workspace saved, a
 * file exported, a style, a procedure, a picture, a PDF - whole, or not at
 * all (docs/FILE-IO.md, *Save and Export*; src-tauri/src/savefile.rs): a
 * save that fails part way leaves the file that was there as it was.
 * Every such file is written through here; Meno's own files, kept in its
 * folders, are not.
 */
import { invoke } from "@tauri-apps/api/core";

/** `content` - bytes, or text written as UTF-8 - written to `path`, where the chemist chose: whole, or not at all. */
export async function writeDocument(path: string, content: Uint8Array | string): Promise<void> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  await invoke("write_document", bytes, { headers: { path: encodeURIComponent(path) } });
}
