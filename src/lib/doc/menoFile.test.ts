import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { createHash } from "node:crypto";
import { isMenoFile, MENO_MEDIA_TYPE, menoFileBytes, MOST_FILE, MOST_FILES, MOST_WORKSPACE, NotMenoFile, readMenoFile } from "./menoFile";
import { writeMenoFile } from "./menoFileWriter";
import { holdPicturesOf, pictureBytes } from "../picture/held";
import { measured } from "../../testing/timeouts";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const WORKSPACE = '{"format":"meno-workspace","version":1,"atoms":[],"bonds":[]}\n';
const output = strToU8(" Entering Gaussian System\n".repeat(2000));
const picture = Uint8Array.from({ length: 4096 }, (_, i) => (i * 7919) % 251);

/** `zip` with what its central directory says `name` comes to, unpacked, made `size` - the bytes left as they are. */
function saying(zip: Uint8Array, name: string, size: number): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  const wanted = strToU8(name);
  for (let at = 0; at + 46 <= out.length; at++) {
    if (view.getUint32(at, true) !== 0x02014b50) continue;
    const length = view.getUint16(at + 28, true);
    if (length === wanted.length && out.subarray(at + 46, at + 46 + length).every((b, i) => b === wanted[i])) {
      view.setUint32(at + 24, size, true);
      return out;
    }
  }
  throw new Error(`no ${name} in the archive`);
}

/** How much more is held in ArrayBuffers after `run` than before - what it set aside and kept. */
function heldMoreBy(run: () => void): number {
  const before = process.memoryUsage().arrayBuffers;
  run();
  return process.memoryUsage().arrayBuffers - before;
}

describe("a workspace file", () => {
  const bytes = menoFileBytes(WORKSPACE, [
    { sha256: sha(output), name: "job.log", kind: "gaussian", media: "text/plain", data: output },
    { sha256: sha(picture), name: "figure.png", media: "image/png", data: picture },
  ]);

  it("is a zip that says what it is first, stored, as EPUB's and ODF's do", () => {
    expect(isMenoFile(bytes)).toBe(true);
    expect(isMenoFile(bytes.subarray(0, 80))).toBe(true);
    const names = Object.keys(unzipSync(bytes));
    expect(names[0]).toBe("mimetype");
    expect(names).toEqual(["mimetype", "workspace.json", "files.json", `files/${sha(output)}`, `files/${sha(picture)}`]);
    expect(new TextDecoder().decode(unzipSync(bytes).mimetype)).toBe(MENO_MEDIA_TYPE);
  });

  it("keeps its workspace as it is, the text it keeps compressed, and the rest as it was", () => {
    // (the workspace and the picture are in it byte for byte; the output's 52 KB of text is not)
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain(WORKSPACE.trim());
    expect(bytes.length).toBeLessThan(output.length / 4);
    expect(Buffer.from(bytes).includes(Buffer.from(picture))).toBe(true);
  });

  it("is read for its workspace and the list of what it keeps; each file when wanted, by its SHA-256", () => {
    const file = readMenoFile(bytes);
    expect(file.workspace).toBe(WORKSPACE);
    expect(file.files).toEqual([
      { sha256: sha(output), name: "job.log", kind: "gaussian", media: "text/plain", size: output.length },
      { sha256: sha(picture), name: "figure.png", media: "image/png", size: picture.length },
    ]);
    expect(file.data(sha(output))).toEqual(output);
    expect(file.data(sha(picture))).toEqual(picture);
    expect(file.data("0".repeat(64))).toBeNull();
  });

  it("gives each of thousands of files kept, as it was, without reading the zip's directory again for each", () => {
    // (pictures stored, texts deflated: 9,000 took 20 s, the directory read again for every one)
    const kept = Array.from({ length: 5000 }, (_, k) => {
      const text = k % 3 === 0;
      const data = text ? strToU8(`output ${k}\n`.repeat(50)) : Uint8Array.from({ length: 64 }, (_, i) => (i < 2 ? (k >> (8 * i)) & 0xff : (k * 31 + i) % 256));
      return { sha256: createHash("sha256").update(data).digest("hex"), name: `f${k}`, media: text ? "text/plain" : "image/png", data };
    });
    const file = readMenoFile(menoFileBytes("{}", kept));
    expect(file.files).toHaveLength(5000);
    // (the reads alone timed: each compared after)
    const t = performance.now();
    const read = kept.map((k) => file.data(k.sha256));
    const took = performance.now() - t;
    expect(read.every((d, i) => d != null && Buffer.from(d).equals(kept[i].data))).toBe(true);
    expect(took).toBeLessThan(1500);
    expect(file.data("0".repeat(64))).toBeNull();
  }, measured(450));

  it("is written the same off the page", async () => {
    const written = await writeMenoFile(WORKSPACE, [{ sha256: sha(output), name: "job.log", media: "text/plain", data: output }]);
    expect(readMenoFile(written).data(sha(output))).toEqual(output);
  });

  it("cut short or damaged, is said to be so - not in the zip reader's words", () => {
    for (const broken of [bytes.slice(0, Math.floor(bytes.length / 2)), bytes.slice(0, bytes.length - 10)]) {
      expect(() => readMenoFile(broken)).toThrow(NotMenoFile);
      expect(() => readMenoFile(broken)).toThrow(/cut short or damaged/);
    }
  });

  it("is not just any zip, nor JSON: those are said not to be one", () => {
    const other = zipSync({ "workspace.json": strToU8(WORKSPACE) });
    expect(isMenoFile(other)).toBe(false);
    expect(() => readMenoFile(other)).toThrow(NotMenoFile);
    expect(isMenoFile(strToU8(WORKSPACE))).toBe(false);
    // (a list of files that does not read keeps nothing)
    const odd = zipSync({ mimetype: [strToU8(MENO_MEDIA_TYPE), { level: 0 }], "workspace.json": strToU8(WORKSPACE), "files.json": strToU8("[oops") });
    expect(readMenoFile(odd).files).toEqual([]);
  });
});

describe("a workspace file that says other than it holds", () => {
  const kept = [
    { sha256: sha(output), name: "job.log", kind: "gaussian", media: "text/plain", data: output },
    { sha256: sha(picture), name: "figure.png", media: "image/png", data: picture },
  ];
  const bytes = menoFileBytes(WORKSPACE, kept);
  // (its workspace deflated, as another zip writer may leave it)
  const deflated = zipSync({ mimetype: [strToU8(MENO_MEDIA_TYPE), { level: 0 }], "workspace.json": [strToU8(WORKSPACE.repeat(50)), { level: 6 }] });

  it("saying a few bytes come to a gigabyte, is refused at once, nothing set aside for what it says", () => {
    const huge = saying(bytes, `files/${sha(output)}`, MOST_FILE);
    let got: Uint8Array | null = output;
    // (the file's own size, and a little: not the gigabyte)
    expect(heldMoreBy(() => (got = readMenoFile(huge).data(sha(output))))).toBeLessThan(16 * 1024 * 1024);
    expect(got).toBeNull();
    // the workspace saying it comes to near the limit: not read - and not cut to what it holds
    let thrown: unknown;
    expect(
      heldMoreBy(() => {
        try {
          readMenoFile(saying(deflated, "workspace.json", MOST_WORKSPACE - 1));
        } catch (e) {
          thrown = e;
        }
      }),
    ).toBeLessThan(16 * 1024 * 1024);
    expect(thrown).toBeInstanceOf(NotMenoFile);
    expect(String(thrown)).toMatch(/cut short or damaged/);
    expect(() => readMenoFile(saying(deflated, "workspace.json", MOST_WORKSPACE + 1))).toThrow(/larger than Meno takes in/);
    // (as it was, it reads)
    expect(readMenoFile(deflated).workspace).toBe(WORKSPACE.repeat(50));
  });

  it("saying it comes to less than it holds, is refused - not cut short to what it says", () => {
    expect(readMenoFile(saying(bytes, `files/${sha(output)}`, output.length - 100)).data(sha(output))).toBeNull();
    expect(readMenoFile(saying(bytes, `files/${sha(picture)}`, picture.length - 1)).data(sha(picture))).toBeNull();
    expect(() => readMenoFile(saying(deflated, "workspace.json", 20))).toThrow(/cut short or damaged/);
    // (and the others in it still read)
    const file = readMenoFile(saying(bytes, `files/${sha(output)}`, output.length - 100));
    expect(file.data(sha(picture))).toEqual(picture);
  });

  it("keeps no file whose bytes are not what its SHA-256 says - an output, a text, a PDF, a picture", () => {
    const pdf = strToU8("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
    const other = strToU8("something else");
    const wrong = menoFileBytes(WORKSPACE, [
      { sha256: sha(other), name: "job.log", kind: "gaussian", media: "text/plain", data: output },
      { sha256: sha(strToU8("notes")), name: "notes.txt", media: "text/plain", data: strToU8("other notes") },
      { sha256: sha(strToU8("%PDF-")), name: "paper.pdf", media: "application/pdf", data: pdf },
      { sha256: sha(picture.subarray(1)), name: "figure.png", media: "image/png", data: picture },
    ]);
    const file = readMenoFile(wrong);
    expect(file.files).toHaveLength(4);
    for (const f of file.files) expect(file.data(f.sha256)).toBeNull();
    // a PDF changed in the file after it was written, a byte of it, its size the same
    const right = menoFileBytes(WORKSPACE, [{ sha256: sha(pdf), name: "paper.pdf", media: "application/pdf", data: pdf }]);
    expect(readMenoFile(right).data(sha(pdf))).toEqual(pdf);
    const at = Buffer.from(right).indexOf("Catalog");
    const changed = right.slice();
    changed[at] = "K".charCodeAt(0);
    expect(readMenoFile(changed).data(sha(pdf))).toBeNull();
  });

  it("a picture held from a file that is not what it says is held no more, and draws nothing", () => {
    const fake = Uint8Array.from({ length: 512 }, (_, i) => (i * 31) % 256);
    const said = sha(strToU8("a picture this is not"));
    holdPicturesOf(readMenoFile(menoFileBytes(WORKSPACE, [{ sha256: said, name: "fake.png", media: "image/png", data: fake }])));
    expect(pictureBytes(said)).toBeNull();
    // (held no more: what holds it rightly may hold it now)
    const real = strToU8("a picture this is not");
    holdPicturesOf(readMenoFile(menoFileBytes(WORKSPACE, [{ sha256: said, name: "real.png", media: "image/png", data: real }])));
    expect(pictureBytes(said)).toEqual(real);
  });
});

describe("a workspace written past what a workspace file is read with", () => {
  it("is not written, and says why - as Save shows it", async () => {
    const long = "x".repeat(MOST_WORKSPACE + 1);
    expect(() => menoFileBytes(long, [])).toThrow("A workspace file holds a workspace of at most 256 MB; this one comes to 257 MB.");
    await expect(writeMenoFile(long, [])).rejects.toThrow(/at most 256 MB/);
    // (room set aside, never written to: nothing is read of it before it is refused)
    const huge = new Uint8Array(MOST_FILE + 1);
    expect(() => menoFileBytes(WORKSPACE, [{ sha256: "a".repeat(64), name: "trajectory.log", media: "text/plain", data: huge }])).toThrow(
      'A workspace file keeps no file of more than 1 GB; "trajectory.log" comes to 1.1 GB.',
    );
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ sha256: i.toString(16).padStart(64, "0"), name: `${i}.txt`, media: "text/plain", data: strToU8(`${i}`) }));
    expect(() => menoFileBytes(WORKSPACE, many(MOST_FILES + 1))).toThrow("A workspace file keeps at most 10,000 files; this workspace would keep 10,001.");
  });

  it("is written up to those limits, and reads back", () => {
    const many = Array.from({ length: MOST_FILES }, (_, i) => ({ sha256: sha(strToU8(`${i}`)), name: `${i}.txt`, media: "text/plain", data: strToU8(`${i}`) }));
    const file = readMenoFile(menoFileBytes(WORKSPACE, many));
    expect(file.files).toHaveLength(MOST_FILES);
    expect(new TextDecoder().decode(file.data(sha(strToU8("9999")))!)).toBe("9999");
  }, 60_000);
});
