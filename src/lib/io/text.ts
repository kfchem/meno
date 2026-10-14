/**
 * A file's text, as its bytes are written (docs/FILE-IO.md, *Open, drop,
 * paste*): UTF-8, or UTF-16 where a byte order mark says so; bytes that
 * are not UTF-8 are read as Shift_JIS, as Windows in Japanese writes
 * text, and those that are not that either as Windows-1252. Open, a
 * drop and the outputs read again all read a file so.
 */

/**
 * Which way round UTF-16 with no byte order mark is written, where a file's
 * start says so. No UTF-8 or Shift_JIS text holds a NUL; UTF-16 has one in
 * the high byte of every Latin letter, digit and line's end - so a text in
 * Japanese has some (a fifth of its high bytes, say), one in English half.
 * Its NULs, at least two, lie nearly all on one side of each pair - and,
 * read that way round, nearly all of it is letters a text holds (`plain`):
 * bytes otherwise, which NULs among them do not make a text.
 */
function utf16Unmarked(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const pairs = Math.min(bytes.length, 1024) >> 1;
  if (pairs < 2) return null;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < pairs; i++) {
    if (bytes[2 * i] === 0) even++;
    if (bytes[2 * i + 1] === 0) odd++;
  }
  const nuls = even + odd;
  if (nuls < 2) return null;
  const read = (le: boolean) => {
    let ok = 0;
    for (let i = 0; i < pairs; i++) ok += plain(le ? bytes[2 * i] | (bytes[2 * i + 1] << 8) : (bytes[2 * i] << 8) | bytes[2 * i + 1]) ? 1 : 0;
    return ok >= 0.9 * pairs;
  };
  if (odd >= 0.9 * nuls && read(true)) return "utf-16le";
  if (even >= 0.9 * nuls && read(false)) return "utf-16be";
  return null;
}

/** Whether a UTF-16 unit is one a text holds: a tab or a line's end, Latin and Greek letters and their marks, punctuation and symbols, kana and kanji, the full-width forms - or half of a pair beyond them. */
function plain(u: number): boolean {
  return (
    u === 0x09 || u === 0x0a || u === 0x0d ||
    (u >= 0x20 && u <= 0x7e) ||
    (u >= 0xa0 && u <= 0x52f) ||
    (u >= 0x2000 && u <= 0x2bff) ||
    (u >= 0x3000 && u <= 0x9fff) ||
    (u >= 0xac00 && u <= 0xd7a3) ||
    (u >= 0xd800 && u <= 0xdfff) ||
    (u >= 0xf900 && u <= 0xfaff) ||
    (u >= 0xfe30 && u <= 0xffef)
  );
}

/** The text `bytes` hold - `part` where they are a file's start only, its last character perhaps cut. */
export function textOf(bytes: Uint8Array, part = false): string {
  const stream = { stream: part };
  // (a byte order mark: UTF-16 either way round, or UTF-8 - the mark itself not kept)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes, stream);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes, stream);
  // (UTF-16 with no mark, its start telling which way round)
  const unmarked = utf16Unmarked(bytes);
  if (unmarked) return new TextDecoder(unmarked).decode(bytes, stream);
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
