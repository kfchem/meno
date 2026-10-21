import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";

// (a PDF is held by the app's own process: here, by this map - one not in it is no longer held, as the app says)
const pdfsHeld = new Map<string, Uint8Array>();
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: (cmd: string, args: { sha?: string }) => {
    const bytes = cmd === "pdf_bytes" && args.sha ? pdfsHeld.get(args.sha) : undefined;
    return bytes ? Promise.resolve(bytes.slice().buffer) : Promise.reject(new Error("it is no longer held"));
  },
}));
vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { notKeptSaid, readKept, readWorkspace, workspaceFile, workspaceText } from "./workspace";
import { menoFileBytes, readMenoFile, type KeptData } from "../../../../lib/doc/menoFile";
import { workspaceOfFile } from "../../../views/openFile";
import { heldOutput } from "../../../../lib/calc/asks";
import { pictureBytes } from "../../../../lib/picture/held";
import { isNotHad } from "../../../../lib/doc/notHad";
import { useNotices } from "../../../notices";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** A PNG's signature and header, and then bytes `seed` makes its own - a picture no other test holds. */
function png(seed: string): Uint8Array {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0];
  const body = Uint8Array.from({ length: 2048 }, (_, i) => (i * 131 + seed.charCodeAt(i % seed.length)) % 256);
  return new Uint8Array([...head, ...strToU8(seed), ...body]);
}

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, st: () => store.getState() };
}

const water3d = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  frames: [[0, 0, 0, 0.8, 0.6, 0, -0.8, 0.6, 0]],
};

/**
 * A workspace's file, as Save writes it, with two pictures, a text and a
 * calculation's output its molecule was read from - each of them `seed`'s
 * own, held by nothing else this session: and what each is known by.
 */
function workspaceWith(seed: string) {
  const figure = png(`figure ${seed}`);
  const other = png(`other ${seed}`);
  const notes = `notes, ${seed}\n`;
  const log = strToU8(` Entering Gaussian System, ${seed}\n`.repeat(200));
  const { st } = editor();
  const picture = (name: string, bytes: Uint8Array, x: number) => st().putPicture({ name, sha256: sha(bytes), media: "image/png", px: [64, 32], x, y: 0, w: 4, h: 2 });
  picture("figure.png", figure, 0);
  picture("other.png", other, 10);
  st().addTexts([{ name: "notes.txt", text: notes }]);
  const source = { name: "run.log", sha256: sha(log), kind: "gaussian" };
  st().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 20, y: 0 }, calc: { readers: ["meno"], source } as never }] });
  const kept: KeptData[] = [
    { sha256: sha(log), name: "run.log", kind: "gaussian", media: "text/plain", data: log },
    { sha256: sha(strToU8(notes)), name: "notes.txt", media: "text/plain", data: strToU8(notes) },
    { sha256: sha(figure), name: "figure.png", media: "image/png", data: figure },
    { sha256: sha(other), name: "other.png", media: "image/png", data: other },
  ];
  const json = workspaceText(st(), new Set([sha(log)]), [sha(strToU8(notes))]);
  return { bytes: menoFileBytes(json, kept), figure, other, notes, log, kept };
}

/** A workspace file's bytes opened as Open opens them, on a canvas of its own: the canvas, and what could not be read, named. */
async function opened(bytes: Uint8Array, name = "work.meno") {
  const json = workspaceOfFile(bytes, name)!;
  const { ws, missing } = await readKept(readWorkspace(json)!);
  const e = editor();
  e.st().openWorkspace(ws, true);
  return { ...e, missing };
}

describe("a file a workspace keeps, damaged in its file", () => {
  it("opens with the rest: it alone is named, stays marked as damaged, and a save says it is not kept - nor writes it as fine", async () => {
    const w = workspaceWith("damaged picture");
    // (a byte of the picture changed on the disk after it was saved, its size the same)
    const at = Buffer.from(w.bytes).indexOf(Buffer.from(w.figure.subarray(200, 240)));
    const damaged = w.bytes.slice();
    damaged[at + 7] ^= 0x5a;
    const { st, missing } = await opened(damaged);
    expect(missing).toEqual(["figure.png"]);
    // the others read
    expect(pictureBytes(sha(w.other))).toEqual(w.other);
    expect(st().texts.map((t) => [t.name, t.text])).toEqual([["notes.txt", w.notes]]);
    expect((await heldOutput(sha(w.log)))?.text).toBe(new TextDecoder().decode(w.log));
    // still on the page where it was, and marked - after the alert is gone, and asked again
    expect(st().pictures.map((p) => p.name)).toEqual(["figure.png", "other.png"]);
    expect(isNotHad(sha(w.figure))).toBe(true);
    expect(pictureBytes(sha(w.figure))).toBeNull();
    expect(isNotHad(sha(w.figure))).toBe(true);
    expect(isNotHad(sha(w.other))).toBe(false);
    // saved: said not kept, by its name - and not in the file, nor listed as it were
    const saved = await workspaceFile(st());
    expect(saved.notKept).toEqual(["figure.png"]);
    expect(notKeptSaid(saved.notKept)).toBe("Saved, but figure.png is not in the file: it could not be read.");
    const file = readMenoFile(saved.bytes);
    expect(file.files.map((f) => f.name).sort()).toEqual(["notes.txt", "other.png", "run.log"]);
    expect(file.data(sha(w.figure))).toBeNull();
    // (the page still has it where it was: opened again, it is named again, not taken for a picture that is fine)
    const again = await opened(saved.bytes, "again.meno");
    expect(again.missing).toEqual(["figure.png"]);
    expect(again.st().pictures.map((p) => p.name)).toEqual(["figure.png", "other.png"]);
  });

  it("replaced - the same picture had again - is marked no more", async () => {
    const w = workspaceWith("replaced picture");
    const at = Buffer.from(w.bytes).indexOf(Buffer.from(w.figure.subarray(200, 240)));
    const damaged = w.bytes.slice();
    damaged[at] ^= 0x01;
    await opened(damaged);
    expect(isNotHad(sha(w.figure))).toBe(true);
    // (the same image put down again: what it is known by, had)
    const { holdPicture } = await import("../../../../lib/picture/held");
    await holdPicture(w.figure);
    expect(isNotHad(sha(w.figure))).toBe(false);
  });
});

describe("a workspace whose list of the files it keeps is broken", () => {
  const variants: [string, (parts: Record<string, Uint8Array>) => Record<string, Uint8Array>][] = [
    ["garbage", (parts) => ({ ...parts, "files.json": strToU8("\u0000{garbage") })],
    ["gone", ({ "files.json": _, ...parts }) => parts],
    ["a byte changed", (parts) => ({ ...parts, "files.json": parts["files.json"] })],
  ];
  for (const [how, broken] of variants) {
    it(`(${how}) opens with every file it keeps, says the list was damaged, and the next save keeps them all`, async () => {
      useNotices.setState({ notices: [] });
      const w = workspaceWith(`list ${how}`);
      const parts = unzipSync(w.bytes);
      const rest = broken(parts);
      const order = ["mimetype", "workspace.json", "files.json", ...Object.keys(parts).filter((k) => k.startsWith("files/"))].filter((k) => k in rest);
      let bytes = zipSync(Object.fromEntries(order.map((k) => [k, [rest[k], { level: k === "files/" + sha(w.log) ? 6 : 0 }]])));
      if (how === "a byte changed") {
        // (a name in it changed on the disk: the list read as it is would name the picture otherwise)
        // (the last place it is named: the list, after the workspace)
        const where = Buffer.from(bytes).lastIndexOf('"other.png"');
        bytes = bytes.slice();
        bytes[where + 5] = "X".charCodeAt(0);
      }
      const { st, missing } = await opened(bytes, `list ${how}.meno`);
      expect(missing).toEqual([]);
      expect(useNotices.getState().notices.map((n) => n.text)).toEqual([`list ${how}.meno: its list of the files it keeps is damaged. Its files were opened without it.`]);
      // every file it keeps had, by what it is known by - named as the workspace names it
      expect(pictureBytes(sha(w.figure))).toEqual(w.figure);
      expect(pictureBytes(sha(w.other))).toEqual(w.other);
      expect((await heldOutput(sha(w.log)))?.text).toBe(new TextDecoder().decode(w.log));
      expect(st().texts.map((t) => t.text)).toEqual([w.notes]);
      const saved = await workspaceFile(st());
      expect(saved.notKept).toEqual([]);
      const file = readMenoFile(saved.bytes);
      expect(file.listDamaged).toBe(false);
      expect(file.files.map((f) => [f.name, f.sha256]).sort()).toEqual(w.kept.map((k) => [k.name, k.sha256]).sort());
      for (const k of w.kept) expect(file.data(k.sha256)).toEqual(k.data);
    });
  }
});

describe("a picture a workspace's file does not hold", () => {
  it("is named as it opens, as a text or a PDF is, and marked", async () => {
    const w = workspaceWith("missing picture");
    const parts = unzipSync(w.bytes);
    const { [`files/${sha(w.figure)}`]: _gone, ...rest } = parts;
    const bytes = zipSync(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, [v, { level: 0 }]])));
    const { missing } = await opened(bytes);
    expect(missing).toEqual(["figure.png"]);
    expect(isNotHad(sha(w.figure))).toBe(true);
  });
});

describe("a save that cannot keep a file the workspace has", () => {
  it("still saves, and names each it could not keep - a picture, a PDF, an output - the rest kept", async () => {
    const { st } = editor();
    const fine = png("fine picture");
    const { holdPicture } = await import("../../../../lib/picture/held");
    await holdPicture(fine);
    st().putPicture({ name: "fine.png", sha256: sha(fine), media: "image/png", px: [64, 32], x: 0, y: 0, w: 4, h: 2 });
    // (none of these held this session)
    st().putPicture({ name: "lost.png", sha256: sha(png("never held")), media: "image/png", px: [64, 32], x: 10, y: 0, w: 4, h: 2 });
    const pdf = strToU8("%PDF-1.7\n%%EOF\n");
    pdfsHeld.set(sha(pdf), pdf);
    st().addPdfs([{ name: "kept.pdf", sha256: sha(pdf), pages: [[595, 842]] }], { x: 0, y: 40 });
    st().addPdfs([{ name: "paper.pdf", sha256: "c".repeat(64), pages: [[595, 842]] }], { x: 40, y: 40 });
    st().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 20, y: 0 }, calc: { readers: ["cclib"], source: { name: "gone.out", sha256: "e".repeat(64), kind: "orca" } } as never }] });
    const saved = await workspaceFile(st());
    expect(saved.notKept).toEqual(["gone.out", "paper.pdf", "lost.png"]);
    expect(notKeptSaid(saved.notKept)).toBe("Saved, but gone.out, paper.pdf and lost.png are not in the file: they could not be read.");
    const file = readMenoFile(saved.bytes);
    expect(file.files.map((f) => f.name).sort()).toEqual(["fine.png", "kept.pdf"]);
    // (each still on the page, and in the workspace: opened, named again - never taken for one that is there)
    const ws = readWorkspace(file.workspace)!;
    expect(ws.pdfs.map((p) => p.name)).toEqual(["kept.pdf", "paper.pdf"]);
    expect(ws.drawn.pictures!.map((p) => p.name)).toEqual(["fine.png", "lost.png"]);
  });

  it("is said in plain words, each named", () => {
    expect(notKeptSaid([])).toBeNull();
    expect(notKeptSaid(["a.png", "b.pdf"])).toBe("Saved, but a.png and b.pdf are not in the file: they could not be read.");
  });
});
