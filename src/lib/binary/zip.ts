/**
 * Just enough of ZIP for Office's clip format and Meno's workspace file:
 * writing an archive whose entries are stored as they are, and reading one
 * whose entries are stored or deflated (as Office writes them) - nothing
 * inflated but what is asked for, nothing to more than the archive says it
 * comes to, whatever it says, and nothing taken that is not what its CRC-32
 * says it is.
 */
import { Inflate } from "fflate";

/**
 * CRC-32's table, eight times over: the first for a byte, each after it for
 * a byte one further back - so that eight bytes are taken at a time, some
 * three times as fast as one at a time (1 GB a second in Node), as a
 * workspace's every part is checked as it opens.
 */
const TABLE = (() => {
  const t = new Int32Array(8 * 256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  for (let n = 0; n < 256; n++) {
    let c = t[n];
    for (let k = 1; k < 8; k++) {
      c = t[c & 0xff] ^ (c >>> 8);
      t[k * 256 + n] = c;
    }
  }
  return t;
})();

/** CRC-32, as ZIP and PNG check their data with. */
export function crc32(bytes: Uint8Array, start = 0xffffffff): number {
  const t = TABLE;
  let c = start | 0;
  let i = 0;
  for (const last = bytes.length - 8; i <= last; i += 8) {
    c ^= bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    c =
      t[1792 + (c & 0xff)] ^
      t[1536 + ((c >>> 8) & 0xff)] ^
      t[1280 + ((c >>> 16) & 0xff)] ^
      t[1024 + (c >>> 24)] ^
      t[768 + bytes[i + 4]] ^
      t[512 + bytes[i + 5]] ^
      t[256 + bytes[i + 6]] ^
      t[bytes[i + 7]];
  }
  for (; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = new TextEncoder();

/** An archive of `files`, each stored as it is, in the order given. */
export function zipStored(files: { name: string; data: Uint8Array | string }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = utf8.encode(f.name);
    const data = typeof f.data === "string" ? utf8.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true); // made by
    entry.setUint16(6, 20, true); // version needed
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return concat([...parts, ...central, new Uint8Array(end.buffer)]);
}

/** An archive's entry as its central directory lists it, nothing inflated. */
export type ZipEntry = {
  name: string;
  /** How it is packed: 0 stored, 8 deflated (none else is read). */
  method: number;
  /** Its bytes, as packed. */
  packed: Uint8Array;
  /** What the archive says they come to, unpacked - which `entryBytes` holds them to. */
  size: number;
  /** Their CRC-32, unpacked, as the central directory says it - which `entryBytes` holds them to too. */
  crc: number;
};

/**
 * The entries of an archive, in the order its central directory lists
 * them, nothing inflated; null if it is not one this reads (nor ZIP64: an
 * archive of 4 GB or more is not read).
 */
export function zipEntries(zip: Uint8Array): ZipEntry[] | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // the end record, searched for from the end (it may carry a comment)
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== 0x02014b50) return null;
    const method = view.getUint16(at + 10, true);
    // (the central directory's, which says it whether or not a data descriptor follows the entry)
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (local + 30 > zip.length || view.getUint32(local, true) !== 0x04034b50) return null;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    // (an entry running on past the archive's end: it was cut short)
    if (start + packed > zip.length) return null;
    entries.push({ name, method, packed: zip.subarray(start, start + packed), size, crc });
  }
  return entries;
}

/**
 * How much of an entry is inflated at a time: deflate makes at most 1,032
 * bytes of one, so no slice makes more than some 4 MB past what the entry
 * may come to before inflating it is stopped - and text inflates in slices
 * so a tenth or so slower than at a stroke.
 */
const SLICE = 4 * 1024;

/**
 * An entry's bytes, its own copy: stored, as they are; deflated, inflated -
 * either way only where they come to just what the archive says, and are
 * what its CRC-32 says they are. What it says they come to is not trusted
 * to set room aside by (a few bytes may say a gigabyte): room grows as the
 * bytes come, and inflating stops as soon as they come to more. Null where
 * they come to anything else, will not inflate, are not what their CRC-32
 * says - a byte changed on the disk - or are packed some other way.
 */
export function entryBytes(entry: ZipEntry): Uint8Array | null {
  const { method, packed, size, crc } = entry;
  if (method === 0) return packed.length === size && crc32(packed) === crc ? packed.slice() : null;
  if (method !== 8) return null;
  let out = new Uint8Array(Math.min(size, Math.max(4 * packed.length, 64 * 1024)));
  let n = 0;
  const inflater = new Inflate((chunk) => {
    if (n + chunk.length > size) throw new RangeError("more than the archive says");
    if (n + chunk.length > out.length) {
      const grown = new Uint8Array(Math.min(size, Math.max(2 * out.length, n + chunk.length)));
      grown.set(out.subarray(0, n));
      out = grown;
    }
    out.set(chunk, n);
    n += chunk.length;
  });
  try {
    let at = 0;
    do {
      inflater.push(packed.subarray(at, at + SLICE), at + SLICE >= packed.length);
      at += SLICE;
    } while (at < packed.length);
  } catch {
    // (cut short, damaged, or more than it says)
    return null;
  }
  return n === size && crc32(out) === crc ? out : null;
}

/** The most `unzip` hands back of an archive, all the files wanted together, unless told otherwise. */
export const MOST_UNZIPPED = 64 * 1024 * 1024;

/**
 * The files in an archive, by name: those `wanted`, where the caller says
 * which - the rest are not inflated - each as large as the archive says it
 * is, and what its CRC-32 says. Null if it is not one this reads, any file
 * wanted is not so, or the files wanted would come to more than `most`
 * bytes together.
 */
export function unzip(zip: Uint8Array, wanted: (name: string) => boolean = () => true, most = MOST_UNZIPPED): Map<string, Uint8Array> | null {
  const entries = zipEntries(zip);
  if (!entries) return null;
  const files = new Map<string, Uint8Array>();
  let left = most;
  for (const entry of entries) {
    if (!wanted(entry.name)) continue;
    if (entry.size > left) return null;
    const bytes = entryBytes(entry);
    if (!bytes) return null;
    left -= bytes.length;
    files.set(entry.name, bytes);
  }
  return files;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
