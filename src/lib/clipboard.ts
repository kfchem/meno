/**
 * The system clipboard for structures, by the app's own commands
 * (src-tauri/src/clipboard.rs): the webview's clipboard reaches plain text
 * only, and a structure travels as more than that - Meno's own record of it,
 * a MOL file under the names chemistry programs look for, and pictures of
 * it that Office and other programs take.
 *
 * Outside the app (the tests, a browser) the clipboard is one of its own.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * A kind of data on the clipboard:
 * - `meno`: Meno's own record of a structure, nothing lost;
 * - `mol`: a MOL file, for other chemistry programs;
 * - `rxn`: an RXN file, likewise, for a reaction;
 * - `text`: plain text;
 * - `gvml`: Office's own clip format, a package holding a picture that Word
 *   and PowerPoint keep as it is and hand back (lib/office/gvml);
 * - `emf`: an enhanced metafile, for Windows' other programs;
 * - `png`: a PNG;
 * - `dib`: a bitmap, for Windows' programs that take nothing else;
 * - `embed`: on Windows, an object for Office to embed - one a double-click
 *   opens in Meno (src-tauri/src/ole.rs). It is written as the record; the
 *   object is made from that and the `emf` beside it, and read back as the
 *   record again. Elsewhere it is left out. With it, `gvml` and `png` are
 *   left out too: Word and PowerPoint would take either before the object;
 * - `object`: an object Office holds, as Word and PowerPoint for Mac hand it
 *   over when it is copied or dragged - its storage, a compound file (read
 *   with lib/binary/cfb). Only ever read.
 *
 * Plain text is not put beside a structure: without Office's own format
 * beside it, PowerPoint pastes text as a text box in preference to a
 * picture.
 */
export type Flavor = "meno" | "mol" | "rxn" | "text" | "gvml" | "emf" | "png" | "jpeg" | "dib" | "embed" | "object";

export type ClipItem = { flavor: Flavor; text?: string; bytes?: Uint8Array };

type Wire = { flavor: Flavor; text?: string; base64?: string };

let own: ClipItem[] = [];

/** Bytes as base64, as the app's commands take them. */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

let making: Promise<unknown> = Promise.resolve();

/**
 * A copy being made: its pictures are drawn, which takes a moment, before
 * anything goes on the clipboard. Every read of the clipboard waits till it
 * is done, so that a paste straight after a copy takes what was copied, not
 * what was there before.
 */
export function copying<T>(make: () => Promise<T>): Promise<T> {
  const made = make();
  const before = making;
  making = Promise.all([before, made.catch(() => undefined)]);
  return made;
}

/** Puts `items` on the clipboard, in place of whatever was there. */
export async function writeClipboard(items: ClipItem[]): Promise<void> {
  if (!isTauri()) {
    own = items.slice();
    return;
  }
  const wire: Wire[] = items.map((i) =>
    i.bytes ? { flavor: i.flavor, base64: toBase64(i.bytes) } : { flavor: i.flavor, text: i.text ?? "" },
  );
  await invoke("clipboard_write", { items: wire });
}

/** The first of `flavors` the clipboard holds, if any. */
export async function readClipboard(flavors: Flavor[]): Promise<ClipItem | null> {
  await making;
  if (!isTauri()) {
    for (const f of flavors) {
      const item = own.find((i) => i.flavor === f);
      if (item) return item;
    }
    return null;
  }
  return fromWire(await invoke<Wire | null>("clipboard_read", { flavors }));
}

/**
 * The files on the clipboard, copied in the Finder or Explorer, each read
 * as a file of its name - only those the clipboard holds: the app reads
 * them, the page names no path. None, where it holds none.
 */
export async function clipboardFiles(): Promise<File[]> {
  await making;
  if (!isTauri()) return [];
  const names = await invoke<string[]>("clipboard_file_names").catch(() => [] as string[]);
  return Promise.all(names.map(async (name, index) => new File([new Uint8Array(await invoke<ArrayBuffer>("clipboard_file", { index }))], name)));
}

/**
 * The first of `flavors` in what was just dropped on the page - a picture or
 * an object dragged out of Word or PowerPoint - read as the clipboard is: on
 * a Mac, off the drag pasteboard; on Windows, what Meno read of a drag it
 * took from the webview (lib/drop, src-tauri/src/drop.rs).
 */
export async function readDrop(flavors: Flavor[]): Promise<ClipItem | null> {
  if (!isTauri()) return null;
  return fromWire(await invoke<Wire | null>("drag_read", { flavors }));
}

function fromWire(got: Wire | null): ClipItem | null {
  if (!got) return null;
  return got.base64 != null ? { flavor: got.flavor, bytes: fromBase64(got.base64) } : { flavor: got.flavor, text: got.text ?? "" };
}

let takes: Promise<Set<Flavor> | null> | null = null;

/**
 * The kinds a copy on this platform may put on the clipboard (the app says),
 * so that none is made for nothing - a Windows bitmap on a Mac. Null outside
 * the app: every kind.
 */
export function clipboardTakes(): Promise<Set<Flavor> | null> {
  takes ??= isTauri()
    ? invoke<Flavor[]>("clipboard_takes").then(
        (f) => new Set(f),
        () => null,
      )
    : Promise.resolve(null);
  return takes;
}
