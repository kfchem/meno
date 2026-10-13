/**
 * A file's text, as its bytes are written (docs/FILE-IO.md, *Open, drop,
 * paste*): UTF-8, or UTF-16 where a byte order mark says so; bytes that
 * are not UTF-8 are read as Shift_JIS, as Windows in Japanese writes
 * text, and those that are not that either as Windows-1252. Open, a
 * drop and the outputs read again all read a file so.
 */

/** The text `bytes` hold - `part` where they are a file's start only, its last character perhaps cut. */
export function textOf(bytes: Uint8Array, part = false): string {
  const stream = { stream: part };
  // (a byte order mark: UTF-16 either way round, or UTF-8 - the mark itself not kept)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes, stream);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes, stream);
  for (const label of ["utf-8", "shift_jis"]) {
    try {
      return new TextDecoder(label, { fatal: true }).decode(bytes, stream);
    } catch {
      // (not written so: the next tried)
    }
  }
  return new TextDecoder("windows-1252").decode(bytes, stream);
}

/** A file's text, read as `textOf` reads it. */
export async function textOfFile(file: Blob): Promise<string> {
  return textOf(new Uint8Array(await file.arrayBuffer()));
}

/** A file's first `reach` bytes, as text, as `textOf` reads them. */
export async function headOfFile(file: Blob, reach: number): Promise<string> {
  return textOf(new Uint8Array(await file.slice(0, reach).arrayBuffer()), file.size > reach);
}
