/**
 * A workspace's own files - the outputs its molecules were read from, its
 * texts, its PDFs and its pictures - as a save keeps them (workspaceFile):
 * each taken by Meno's backend from wherever it is whole, never through the
 * page; only one found nowhere sent from what the page holds of it, alone;
 * and the file written the same file as the page wrote before, each kind
 * stored as it was. The backend (src-tauri keptjobs.rs `kept_files_where`,
 * `append_job_files`) stood in for by a disk of its own here; every byte the
 * page packs, sends and reads of a kept file counted. Made-up data only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";

// (the disk as the backend has it, the PDFs Meno holds, and every byte counted)
const io = vi.hoisted(() => ({
  disk: new Map<string, Uint8Array>(),
  pdfs: new Map<string, Uint8Array>(),
  /** What each kept file is, made up before a save: the backend's own, apart from the page's heap. */
  known: new Map<string, Uint8Array>(),
  /** Each piece the page sent, its length. */
  pieces: [] as number[],
  staged: new Map<string, Set<string>>(),
  unstaged: [] as string[],
  readWhole: 0,
  packed: 0,
  failPiece: 0,
  onPiece: null as (() => void) | null,
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: (cmd: string, args: { sha?: string }) => {
    const bytes = cmd === "pdf_bytes" && args.sha ? io.pdfs.get(args.sha) : undefined;
    return bytes ? Promise.resolve(bytes.slice().buffer) : Promise.reject(new Error("it is no longer held"));
  },
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: async (p: string) => {
    const f = io.disk.get(p);
    if (!f) throw new Error("no such file");
    io.readWhole += f.length;
    return f.slice();
  },
}));
vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
vi.mock("../../../../lib/doc/menoFileWriter", async () => {
  const { menoFileBytes } = await import("../../../../lib/doc/menoFile");
  return {
    writeMenoFile: async (workspace: string, files: readonly { data: Uint8Array }[], listed: readonly unknown[] = []) => {
      io.packed += files.reduce((n, f) => n + f.data.length, 0);
      return menoFileBytes(workspace, files as never, listed as never);
    },
  };
});
vi.mock("../../../../lib/jobs", async (real) => ({
  ...(await real<object>()),
  unstageJobFiles: async (save: string) => void (io.unstaged.push(save), io.staged.delete(save)),
}));

import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { notKeptSaid, readKept, readWorkspace, workspaceFile, workspaceText, type KeptWays } from "./workspace";
import { menoFileBytes, readMenoFile, type KeptData } from "../../../../lib/doc/menoFile";
import { zipEntries } from "../../../../lib/binary/zip";
import { workspaceOfFile } from "../../../views/openFile";
import type { FoundKeptFile, KeptFilesWhere } from "../../../../lib/jobs";
import type { Appended } from "../../../../lib/io/writeDocument";
import { sendPieces } from "../workflow/keptJobs";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

afterEach(() => {
  io.disk.clear();
  io.pdfs.clear();
  io.known.clear();
  io.pieces.length = 0;
  io.staged.clear();
  io.unstaged.length = 0;
  io.readWhole = 0;
  io.packed = 0;
  io.failPiece = 0;
  io.onPiece = null;
});

/** The workspace file at `path` on the stand-in disk, read: none where it is not there; `false` where it is no workspace. */
const fileAt = (path: string) => {
  const b = io.disk.get(path);
  if (!b) return null;
  try {
    return readMenoFile(b);
  } catch {
    return false;
  }
};

/** As src-tauri keptjobs.rs `kept_where`: the places named, the target as it is now, a copy beside each; an output's own file; the PDFs Meno holds. */
const where: KeptWays["where"] = async (target, saved, places, asked) => {
  const named = [...new Set([...places, target])];
  const all = [...named, ...named.map((p) => `${p}.bak`)];
  const found = asked.map((a): FoundKeptFile | null => {
    for (const p of all) {
      const f = fileAt(p);
      const data = f ? f.data(a.sha256) : null;
      if (data) return { from: p, size: data.length, packed: data.length };
    }
    const own = a.at ? io.disk.get(a.at) : undefined;
    if (own && sha(own) === a.sha256) return { at: true, size: own.length, packed: own.length };
    const pdf = a.pdf ? io.pdfs.get(a.sha256) : undefined;
    if (pdf && sha(pdf) === a.sha256) return { pdf: true, size: pdf.length, packed: pdf.length };
    return null;
  });
  const last = saved ? fileAt(saved) : null;
  return { found, holds: last === false || (!!last && asked.some((a, k) => !found[k] && last.holds(a.sha256))) } satisfies KeptFilesWhere;
};

/** As src-tauri keptjobs.rs `job_file_staged`: checked, set down - its bytes held by the backend, not the page. */
const stage = async (save: string, sha256: string, bytes: Uint8Array) => {
  io.pieces.push(bytes.length);
  if (io.failPiece === io.pieces.length) throw new Error("the disk is full");
  if (sha(bytes) !== sha256) throw new Error("a file sent is not what its SHA-256 says");
  io.onPiece?.();
  io.staged.set(save, (io.staged.get(save) ?? new Set()).add(sha256));
};

/** As src-tauri savefile.rs `write_document` with keptjobs.rs `append_job_files`: the page's bytes, each file added from where it is, checked - a text deflated, the rest stored. */
function written(path: string, bytes: Uint8Array, appended: readonly Appended[]): void {
  const entries: Zippable = Object.fromEntries(Object.entries(unzipSync(bytes)).map(([n, d]) => [n, [d, { level: 0 }]]));
  for (const a of appended) {
    const data = a.staged ? (io.staged.get(a.staged)?.has(a.sha256) ? io.known.get(a.sha256) : undefined) : a.from ? (fileAt(a.from) || null)?.data(a.sha256) : a.at ? io.disk.get(a.at) : a.pdf ? io.pdfs.get(a.sha256) : undefined;
    if (!data || sha(data) !== a.sha256) throw new Error(`${a.name} could not be kept: not found`);
    entries[`files/${a.sha256}`] = [data, { level: a.media?.startsWith("text/") ? 6 : 0 }];
  }
  for (const a of appended) if (a.staged) io.staged.delete(a.staged);
  io.disk.set(path, zipSync(entries));
}

/** A PNG's signature, and bytes `seed` makes its own. */
function png(seed: string, n = 4096): Uint8Array {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0];
  return new Uint8Array([...head, ...strToU8(seed), ...Uint8Array.from({ length: n }, (_, i) => (i * 131 + seed.charCodeAt(i % seed.length)) % 256)]);
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

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { st: () => store.getState() };
}

const SAVED = "/made/up/work.meno";
let made = 0;

/**
 * A workspace saved before at `SAVED`, as the page wrote such a file before
 * (`menoFileBytes`, every file packed by the page): an output its molecule
 * was read from (where it was: `RUN`), a text, a PDF and a picture - each
 * the workspace's own; opened again as Open opens it, from that file.
 */
async function savedWorkspace(outputs = 1, each = 30_000) {
  const seed = `${++made}`;
  const logs = Array.from({ length: outputs }, (_, i) => strToU8(` step ${seed}.${i} energy -1.0 made-up\n`.repeat(Math.ceil(each / 32)).slice(0, each)));
  const notes = `notes ${seed}\n`.repeat(50);
  const pdf = strToU8(`%PDF-1.7 made-up ${seed} `.repeat(400));
  const picture = png(`figure ${seed}`);
  const e = editor();
  e.st().putPicture({ name: "figure.png", sha256: sha(picture), media: "image/png", px: [64, 32], x: 0, y: 0, w: 4, h: 2 });
  e.st().addTexts([{ name: "notes.txt", text: notes }]);
  const sources = logs.map((log, i) => ({ name: `run${i}.log`, sha256: sha(log), kind: "orbitron", path: `/made/up/run${i}.log` }));
  e.st().pasteModel({ atoms: [], bonds: [], molecules3d: sources.map((source, i) => ({ ...water3d, at: { x: 20 + i * 5, y: 0 }, calc: { readers: ["meno"], source } as never })) });
  const kept: KeptData[] = [
    ...logs.map((log, i) => ({ sha256: sha(log), name: `run${i}.log`, kind: "orbitron", media: "text/plain", data: log })),
    { sha256: sha(strToU8(notes)), name: "notes.txt", media: "text/plain", data: strToU8(notes) },
    { sha256: sha(pdf), name: "paper.pdf", media: "application/pdf", data: pdf },
    { sha256: sha(picture), name: "figure.png", media: "image/png", data: picture },
  ];
  for (const k of kept) io.known.set(k.sha256, k.data);
  const json = JSON.stringify({ ...JSON.parse(workspaceText(e.st(), new Set(logs.map(sha)), [sha(strToU8(notes))])), pdfs: [{ name: "paper.pdf", sha256: sha(pdf), pages: [[612, 792]], x: 40, y: 0 }] });
  const before = menoFileBytes(json, kept);
  io.disk.set(SAVED, before);
  // (opened again from it, as Open opens it: what it keeps held from it, read when wanted)
  const { ws } = await readKept(readWorkspace(workspaceOfFile(before, "work.meno")!)!);
  const o = editor();
  o.st().openWorkspace(ws, true);
  o.st().markSavedAs(SAVED, o.st().writing());
  return { st: o.st, before, kept, logs, notes, pdf, picture };
}

/** A save of `st` to `path`, as Save makes it - the backend stood in for - and what passed through the page. */
async function saved(st: () => Parameters<typeof workspaceFile>[0], path = SAVED, ways: KeptWays = {}) {
  [io.readWhole, io.packed, io.pieces.length] = [0, 0, 0];
  const file = await workspaceFile(st(), undefined, { target: path, where, ...ways });
  // (nothing sent before the save is to be written)
  expect(io.pieces).toEqual([]);
  await sendPieces(file, stage);
  written(path, file.bytes, file.appended);
  return { file, page: { read: io.readWhole, packed: io.packed, sent: io.pieces.reduce((n, p) => n + p, 0), bytes: file.bytes.length } };
}

/** Each entry of a workspace's file: how it is packed, and what it comes to, unpacked. */
const stored = (bytes: Uint8Array) => Object.fromEntries(zipEntries(bytes)!.filter((e) => e.name.startsWith("files/")).map((e) => [e.name, { method: e.method, size: e.size }]));
/** Its list of files kept, as it says them. */
const listOf = (bytes: Uint8Array) => readMenoFile(bytes).files.map(({ sha256, name, kind, media, size }) => ({ sha256, name, kind, media, size }));

describe("a workspace's own files, saved", () => {
  it("a second save passes none of their bytes through the page, and writes each whole, stored as the page stored it", async () => {
    const w = await savedWorkspace();
    const { page, file } = await saved(w.st);
    expect(page).toMatchObject({ read: 0, packed: 0, sent: 0 });
    // (the page's bytes: its JSON and the list, nothing of a file's)
    expect(page.bytes).toBeLessThan(8_000);
    expect(file.notKept).toEqual([]);
    const now = io.disk.get(SAVED)!;
    const file2 = readMenoFile(now);
    for (const k of w.kept) expect(file2.data(k.sha256)).toEqual(k.data);
    // (each kind as before: a text deflated, a PDF and a picture stored; the same names; the same list)
    expect(stored(now)).toEqual(stored(w.before));
    for (const [name, e] of Object.entries(stored(now))) expect([name, e.method]).toEqual([name, name.includes(sha(w.picture)) || name.includes(sha(w.pdf)) ? 0 : 8]);
    expect(listOf(now).sort((a, b) => a.sha256.localeCompare(b.sha256))).toEqual(listOf(w.before).sort((a, b) => a.sha256.localeCompare(b.sha256)));
  });

  it("takes them from an older copy put over the file, from the copy beside an unrelated one, and - the file deleted - from where they are: only those found nowhere pass, alone", async () => {
    const w = await savedWorkspace();
    // (an older copy of the same workspace copied over it)
    io.disk.set(SAVED, w.before.slice());
    expect((await saved(w.st)).page).toMatchObject({ read: 0, packed: 0, sent: 0 });
    // (an unrelated file there, the old one kept beside it)
    io.disk.set(`${SAVED}.bak`, io.disk.get(SAVED)!);
    io.disk.set(SAVED, menoFileBytes(JSON.stringify({ format: "meno-workspace", version: 2, atoms: [], bonds: [], arrows: [], pluses: [], molecules3d: [] }), []));
    expect((await saved(w.st)).page).toMatchObject({ read: 0, packed: 0, sent: 0 });
    expect(readMenoFile(io.disk.get(SAVED)!).files).toHaveLength(w.kept.length);
    // (deleted, and no copy: the PDF where Meno holds it; the output, the text and the picture, held by the page, sent alone -
    //  an output kept is said to be nowhere else, so its own file is not looked for)
    io.disk.delete(SAVED);
    io.disk.delete(`${SAVED}.bak`);
    io.pdfs.set(sha(w.pdf), w.pdf);
    const { page, file } = await saved(w.st);
    expect(page).toMatchObject({ read: 0, packed: 0 });
    expect(io.pieces.sort()).toEqual([w.logs[0].length, strToU8(w.notes).length, w.picture.length].sort());
    expect(file.appended.map((a) => [a.name, a.at ? "at" : a.pdf ? "pdf" : a.staged ? "sent" : "from"])).toEqual([
      ["run0.log", "sent"],
      ["notes.txt", "sent"],
      ["paper.pdf", "pdf"],
      ["figure.png", "sent"],
    ]);
    const now = readMenoFile(io.disk.get(SAVED)!);
    for (const k of w.kept) expect(now.data(k.sha256)).toEqual(k.data);
    expect(stored(io.disk.get(SAVED)!)).toEqual(stored(w.before));
    expect(io.staged.size).toBe(0);
  });

  it("takes an output from its own file where it was, read by Meno - never by the page - where it is still what it was", async () => {
    const log = strToU8(" made-up output, first saved\n".repeat(2_000));
    const e = editor();
    e.st().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 0, y: 0 }, calc: { readers: ["meno"], source: { name: "first.log", sha256: sha(log), path: "/made/up/first.log" } } as never }] });
    io.disk.set("/made/up/first.log", log);
    const { page, file } = await saved(e.st, "/made/up/first.meno");
    expect(page).toMatchObject({ read: 0, packed: 0, sent: 0 });
    expect(file.appended).toMatchObject([{ name: "first.log", at: "/made/up/first.log", media: "text/plain" }]);
    expect(readMenoFile(io.disk.get("/made/up/first.meno")!).data(sha(log))).toEqual(log);
    // (changed there since: not taken from there - and, held nowhere, named)
    io.disk.set("/made/up/first.log", strToU8("another"));
    expect((await saved(e.st, "/made/up/other.meno")).file.notKept).toEqual(["first.log"]);
  });

  it("names one held nowhere and in no place as before, the old file kept beside the new one only where it holds it damaged", async () => {
    const w = await savedWorkspace();
    // (the PDF in no place: the file there is an unrelated workspace - nothing of it there, nothing to keep beside)
    io.disk.set(SAVED, menoFileBytes(JSON.stringify({}), w.kept.filter((k) => k.media !== "application/pdf")));
    const a = await saved(w.st);
    expect(a.file.notKept).toEqual(["paper.pdf"]);
    expect(a.file.lastHolds).toBe(false);
    expect(notKeptSaid(a.file.notKept)).toBe("Saved, but paper.pdf is not in the file: it could not be read.");
    // (the file saved to holding it damaged: not carried, named, and the file kept beside the new one, as before)
    const damaged = menoFileBytes(JSON.stringify({}), w.kept);
    const at = Buffer.from(damaged).indexOf(Buffer.from(w.pdf.subarray(100, 140)));
    damaged[at + 3] ^= 0x5a;
    io.disk.set(SAVED, damaged);
    const b = await saved(w.st);
    expect(b.file.notKept).toEqual(["paper.pdf"]);
    expect(b.file.lastHolds).toBe(true);
    expect(b.file.appended.some((x) => x.sha256 === sha(w.pdf))).toBe(false);
    // (one that is no workspace at all, there: it may hold something still)
    io.disk.set(SAVED, strToU8("not a workspace"));
    expect((await saved(w.st)).file.lastHolds).toBe(true);
  });

  it("says the files it could not keep and the job files it had from nowhere in one sentence", () => {
    expect(notKeptSaid(["paper.pdf", "figure.png"], "work.meno.bak")).toBe("Saved, but paper.pdf and figure.png are not in the file: they could not be read. The file as it was is kept beside it as work.meno.bak.");
    expect(notKeptSaid([], null, 1)).toBe("Saved, but 1 file of a step's job is not in the file: it could not be read.");
    expect(notKeptSaid([], null, 3)).toBe("Saved, but 3 files of steps' jobs are not in the file: they could not be read.");
    expect(notKeptSaid(["A", "B"], "work.meno.bak", 2)).toBe("Saved, but A, B and 2 files of steps' jobs are not in the file: they could not be read. The file as it was is kept beside it as work.meno.bak.");
    expect(notKeptSaid(["A"], null, 1)).toBe("Saved, but A and 1 file of a step's job are not in the file: they could not be read.");
    expect(notKeptSaid([], null, 0)).toBeNull();
  });

  it("never takes an entry whose bytes are not what its name says", async () => {
    const w = await savedWorkspace();
    // (the picture's entry in the file holding other bytes, its name the same)
    const wrong = { ...w.kept.find((k) => k.media === "image/png")!, data: png("another") };
    io.disk.set(SAVED, zipSync({ ...unzipSync(menoFileBytes(JSON.stringify({}), w.kept.filter((k) => k.media !== "image/png"))), [`files/${wrong.sha256}`]: [wrong.data, { level: 0 }] }));
    const { file } = await saved(w.st);
    // (sent from what the page holds of it instead)
    expect(file.appended.find((a) => a.sha256 === wrong.sha256)?.staged).toBeTruthy();
    expect(readMenoFile(io.disk.get(SAVED)!).data(wrong.sha256)).toEqual(w.picture);
  });

  it("leaves the file as it was and nothing set down where a piece fails half way", async () => {
    const w = await savedWorkspace();
    io.disk.delete(SAVED);
    io.failPiece = 2;
    const file = await workspaceFile(w.st(), undefined, { target: SAVED, where });
    await expect(sendPieces(file, stage)).rejects.toThrow("the disk is full");
    expect(io.disk.has(SAVED)).toBe(false);
    expect(io.unstaged).toHaveLength(1);
    expect(io.staged.size).toBe(0);
  });

  it("saved as another file, sends none of them through the page: each taken from the file it was saved to", async () => {
    const w = await savedWorkspace();
    const { page, file } = await saved(w.st, "/made/up/elsewhere.meno");
    expect(page).toMatchObject({ read: 0, packed: 0, sent: 0 });
    expect(file.appended.every((a) => a.from === SAVED)).toBe(true);
    expect(readMenoFile(io.disk.get("/made/up/elsewhere.meno")!).files).toHaveLength(w.kept.length);
    expect(io.disk.get(SAVED)).toEqual(w.before);
  });

  it("holds no more than the largest file and a little besides, found nowhere, however many there are", async () => {
    const v8 = await import("node:v8");
    const vm = await import("node:vm");
    v8.setFlagsFromString("--expose_gc");
    const gc = vm.runInNewContext("gc") as (o?: object) => void;
    const held = () => (gc({ type: "major", execution: "sync" }), gc({ type: "major", execution: "sync" }), process.memoryUsage().arrayBuffers);
    const [N, EACH] = [24, 1024 * 1024];
    const w = await savedWorkspace(N, EACH);
    // (the file gone, and no output where it was: each sent from what the page holds - read from the file it was opened from)
    io.disk.delete(SAVED);
    io.pdfs.set(sha(w.pdf), w.pdf);
    const base = held();
    let most = 0;
    io.onPiece = () => void (most = Math.max(most, held() - base));
    const { file } = await saved(w.st);
    expect(file.notKept).toEqual([]);
    expect(io.pieces.length).toBe(N + 2);
    // (the bound: the largest file, and a little besides)
    expect(most).toBeLessThan(EACH + 64 * 1024);
    // (and after, nothing of them held for the session that was not before)
    expect(held() - base).toBeLessThan(EACH);
  }, 60_000);
});
