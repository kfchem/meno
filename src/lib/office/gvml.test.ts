import { describe, expect, it } from "vitest";
import { constants, deflateRawSync } from "node:zlib";
import { concat, crc32, MOST_UNZIPPED, unzip, zipStored } from "../binary/zip";
import { textOf, withText } from "../binary/png";
import { gvmlImages, gvmlPicture } from "./gvml";

const utf8 = new TextEncoder();

/**
 * An archive made by hand of entries deflated, as Office writes them: each
 * `data` deflated, or `packed` as given - saying it comes to `size`, where
 * it is to say other than it does.
 */
function deflatedZip(entries: { name: string; data?: Uint8Array; packed?: Uint8Array; size?: number }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = utf8.encode(e.name);
    const packed = e.packed ?? new Uint8Array(deflateRawSync(e.data!));
    const size = e.size ?? e.data!.length;
    const crc = e.data ? crc32(e.data) : 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, packed);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, 8, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, packed.length, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + packed.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, central.reduce((n, p) => n + p.length, 0), true);
  end.setUint32(16, offset, true);
  return concat([...parts, ...central, new Uint8Array(end.buffer)]);
}

/** How much more is held in ArrayBuffers after `run` than before - what it set aside and kept. */
function heldMoreBy(run: () => void): number {
  const before = process.memoryUsage().arrayBuffers;
  run();
  return process.memoryUsage().arrayBuffers - before;
}

const MB = 1024 * 1024;
// a megabyte of nothing deflated, left open for more to follow
const ONE_MB = new Uint8Array(deflateRawSync(new Uint8Array(MB), { finishFlush: constants.Z_SYNC_FLUSH }));

/** `megabytes` of nothing, deflated - one megabyte's deflate said again and again, then ended: a bomb as one is made, a KB a megabyte. */
const nothing = (megabytes: number) => concat([...Array<Uint8Array>(megabytes).fill(ONE_MB), new Uint8Array([0x03, 0x00])]);

describe("zip", () => {
  it("writes stored entries that it reads back", () => {
    const zip = zipStored([
      { name: "a.txt", data: "hello" },
      { name: "dir/b.bin", data: new Uint8Array([0, 1, 2, 255]) },
    ]);
    const files = unzip(zip)!;
    expect(new TextDecoder().decode(files.get("a.txt"))).toBe("hello");
    expect([...files.get("dir/b.bin")!]).toEqual([0, 1, 2, 255]);
    expect(unzip(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("reads deflated entries, as Office writes them", () => {
    const data = utf8.encode("deflated ".repeat(50));
    expect(unzip(deflatedZip([{ name: "x.txt", data }]))!.get("x.txt")).toEqual(data);
    // (one deflated to more than a slice inflated at a time, and of every byte)
    const long = new Uint8Array(60_000);
    for (let i = 0; i < long.length; i++) long[i] = (i * 7919 + (i >> 9)) % 256;
    const got = unzip(deflatedZip([{ name: "long.bin", data: long }]))!.get("long.bin")!;
    expect(Buffer.from(got).equals(long)).toBe(true);
    expect(unzip(deflatedZip([{ name: "nothing", packed: nothing(3), size: 3 * MB }]))!.get("nothing")!.every((b) => b === 0)).toBe(true);
  });

  it("inflates only the files asked for", () => {
    const image = utf8.encode("an image ".repeat(100));
    // (beside it, one that would not inflate at all)
    const zip = deflatedZip([
      { name: "clipboard/drawings/junk.xml", packed: new Uint8Array([0xff, 0xff, 0xff, 0xff]), size: 1000 },
      { name: "clipboard/media/image1.png", data: image },
    ]);
    expect(unzip(zip)).toBeNull();
    const files = unzip(zip, (name) => name.includes("/media/"))!;
    expect([...files.keys()]).toEqual(["clipboard/media/image1.png"]);
    expect(files.get("clipboard/media/image1.png")).toEqual(image);
  });

  it("takes nothing that comes to other than the archive says", () => {
    const data = utf8.encode("deflated ".repeat(50));
    expect(unzip(deflatedZip([{ name: "x.txt", data, size: data.length - 1 }]))).toBeNull();
    expect(unzip(deflatedZip([{ name: "x.txt", data, size: data.length + 1 }]))).toBeNull();
    // (stored, likewise: its central entry - before the end record's 22 bytes, 46 bytes and its name's 5 - saying 4 bytes)
    const stored = zipStored([{ name: "a.txt", data: "hello" }]);
    const said = stored.slice();
    new DataView(said.buffer).setUint32(stored.length - 22 - 46 - 5 + 24, 4, true);
    expect(unzip(stored)).not.toBeNull();
    expect(unzip(said)).toBeNull();
  });

  it("refuses an archive that would inflate to more than it takes in, without inflating it", () => {
    // (more than it takes in, of nothing, in some 70 KB)
    const megabytes = MOST_UNZIPPED / MB + 1;
    const bomb = nothing(megabytes);
    expect(bomb.length).toBeLessThan(MB / 4);
    let got: unknown = "";
    // saying what it comes to: refused before anything is inflated
    expect(heldMoreBy(() => (got = unzip(deflatedZip([{ name: "junk.xml", packed: bomb, size: megabytes * MB }]))))).toBeLessThan(4 * MB);
    expect(got).toBeNull();
    // saying it comes to little: inflating stops as soon as it comes to more (a slice's worth made, at most)
    expect(heldMoreBy(() => (got = unzip(deflatedZip([{ name: "junk.xml", packed: bomb, size: 1024 }]))))).toBeLessThan(24 * MB);
    expect(got).toBeNull();
    // several, each within the limit - here one of the caller's own - and all of them past it
    const two = deflatedZip([
      { name: "a", packed: nothing(1), size: MB },
      { name: "b", packed: nothing(1), size: MB },
    ]);
    expect(unzip(two, undefined, 2 * MB)?.size).toBe(2);
    expect(unzip(two, undefined, 2 * MB - 1)).toBeNull();
    expect(unzip(two, (name) => name === "a", MB)?.get("a")).toHaveLength(MB);
  });

  it("checks with the CRC-32 everyone uses", () => {
    expect(crc32(utf8.encode("123456789"))).toBe(0xcbf43926);
  });
});

// the smallest PNG: one white pixel
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);

describe("text in a PNG", () => {
  it("is put in before its end and read back, and is not found where it is not", () => {
    const png = withText(PIXEL, "meno-structure", '{"a":"é"}');
    expect(textOf(png, "meno-structure")).toBe('{"a":"é"}');
    expect(textOf(png, "other")).toBeNull();
    expect(textOf(PIXEL, "meno-structure")).toBeNull();
    // still ending as a PNG must
    expect(new TextDecoder().decode(png.subarray(png.length - 8, png.length - 4))).toBe("IEND");
    expect(() => withText(new Uint8Array(4), "k", "t")).toThrow();
  });
});

describe("gvmlPicture", () => {
  it("packages one picture, at its size, and gives the picture back", () => {
    const image = new Uint8Array([1, 2, 3, 4]);
    const pkg = gvmlPicture(image, "emf", 100, 50, "Structure", 'a "quoted" <name>');
    const files = unzip(pkg)!;
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "clipboard/drawings/_rels/drawing1.xml.rels",
      "clipboard/drawings/drawing1.xml",
      "clipboard/media/image1.emf",
    ]);
    const drawing = new TextDecoder().decode(files.get("clipboard/drawings/drawing1.xml"));
    expect(drawing).toContain('cx="1270000" cy="635000"');
    expect(drawing).toContain('descr="a &quot;quoted&quot; &lt;name&gt;"');
    expect(gvmlImages(pkg)).toEqual([{ name: "clipboard/media/image1.emf", data: image }]);
    expect(gvmlImages(new Uint8Array([9, 9]))).toEqual([]);
  });

  it("inflates a package's images alone: what else it holds may be anything", () => {
    const image = utf8.encode("EMF ".repeat(64));
    // (more than a zip is unpacked to, of nothing, in a part no image is in - in a package of some 70 KB)
    const megabytes = MOST_UNZIPPED / MB + 1;
    const pkg = deflatedZip([
      { name: "clipboard/drawings/junk.xml", packed: nothing(megabytes), size: megabytes * MB },
      { name: "clipboard/media/image1.emf", data: image },
    ]);
    let got: unknown;
    expect(heldMoreBy(() => (got = gvmlImages(pkg)))).toBeLessThan(4 * MB);
    expect(got).toEqual([{ name: "clipboard/media/image1.emf", data: image }]);
    // the same as an image: none
    expect(gvmlImages(deflatedZip([{ name: "clipboard/media/image1.png", packed: nothing(megabytes), size: megabytes * MB }]))).toEqual([]);
  });
});
