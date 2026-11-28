/**
 * Saving a workspace again and again in one session (useFileActions): what
 * the page reads, packs and sends of the files a workspace's file keeps is
 * what the first save did, however many saves came before - a step's job
 * files kept from the file it was opened from are copied by Meno's backend
 * from the file as it is on the disk, the last save's, never read back into
 * the page (docs/FILE-IO.md, *A step's jobs*). The backend's writer
 * (src-tauri savefile.rs, keptjobs.rs `append_job_files`) stood in for by a
 * disk of its own here; every byte the page reads of a kept file, hands its
 * writer and sends counted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { unzipSync, zipSync, type Zippable } from "fflate";
import { EditorProvider, storeOf } from "./store";
import { createWorkspaceDocument } from "./document";
import { useFileActions, type FileActions } from "./fileActions";
import { holdJobFilesOf } from "./workflow/keptJobs";
import { JOB_FILE_MEDIA, menoFileBytes, readMenoFile, type KeptData, type MenoFile } from "../../../lib/doc/menoFile";
import { sha256Hex } from "../../../lib/binary/sha256";
import type { Appended } from "../../../lib/io/writeDocument";
import type { WorkflowStep } from "./store/types";

// (the disk, as the backend has it: each file's bytes, and when it was written; and every byte counted)
const io = vi.hoisted(() => ({
  disk: new Map<string, { bytes: Uint8Array; mtime: number }>(),
  clock: 1_000,
  sent: [] as number[],
  packed: [] as number[],
  readWhole: 0,
  /** Something else writing over the file once a save has put it in place, before Meno looks at it: what it leaves there. */
  overWritten: null as Uint8Array | null,
  /** Whether noting where the job files are fails. */
  noteFails: false,
  picked: null as string | null,
  /** The job files the page sent, each alone: its length, as each was sent. */
  pieces: [] as number[],
  /** What the backend holds of what was sent for each save, by SHA-256 - the bytes themselves kept apart (`known`), so that the page's heap is what it holds. */
  staged: new Map<string, Set<string>>(),
  known: new Map<string, Uint8Array>(),
  /** The piece, counted from 1, whose sending fails; none where none does. */
  failPiece: 0,
  /** Called as each piece is set down, with its length: what the page holds then is looked at. */
  onPiece: null as ((n: number) => void) | null,
  /** How each ask of where the job files are was made: read whole, or by name and size. */
  asks: [] as boolean[],
  /** Whether the page's packing of its file fails. */
  packFails: false,
  /** Whether the next write finds a piece set down for it gone. */
  loseStaged: false,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: async () => io.picked }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (p: string) => io.disk.has(p),
  readFile: async (p: string) => {
    const f = io.disk.get(p);
    if (!f) throw new Error("not there");
    io.readWhole += f.bytes.length;
    return f.bytes;
  },
}));
vi.mock("../../../lib/io/truePath", () => ({ truePath: async (p: string) => p }));
vi.mock("../../../lib/jobs", async (real) => ({
  ...(await real<object>()),
  fileNow: async (p: string) => {
    const f = io.disk.get(p);
    return f ? { size: f.bytes.length, mtime: f.mtime } : null;
  },
  // (no job's folder on this computer: the workspace's file was made on another)
  jobKept: async () => null,
  // (as src-tauri keptjobs.rs `found_where` looks: the files named, the target as it is now, a copy kept beside them)
  jobFilesWhere: async (target: string, asked: { sha256: string; size: number; from: string[] }[], whole: boolean) => {
    io.asks.push(whole);
    const { unzipSync: unzip } = await import("fflate");
    const { sha256Hex: hash } = await import("../../../lib/binary/sha256");
    return asked.map((a) => {
      const places = [...new Set([...a.from, target])];
      for (const p of [...places, ...places.map((q) => `${q}.bak`)]) {
        const f = io.disk.get(p);
        if (!f) continue;
        let data: Uint8Array | undefined;
        try {
          data = unzip(f.bytes, { filter: (e) => e.name === `files/${a.sha256}` })[`files/${a.sha256}`];
        } catch {
          continue;
        }
        if (data && data.length === a.size && (!whole || hash(data) === a.sha256)) return { from: p };
      }
      return null;
    });
  },
  stageJobFile: async (save: string, sha256: string, bytes: Uint8Array) => {
    io.pieces.push(bytes.length);
    if (io.failPiece === io.pieces.length) throw new Error("the disk is full");
    const { sha256Hex: hash } = await import("../../../lib/binary/sha256");
    if (hash(bytes) !== sha256) throw new Error("a job file sent is not what its SHA-256 says");
    io.onPiece?.(bytes.length);
    io.staged.set(save, (io.staged.get(save) ?? new Set()).add(sha256));
  },
  unstageJobFiles: async (save: string) => void io.staged.delete(save),
  clearSavedFolders: async () => ({ gone: [], left: [], at: null }),
}));
vi.mock("../../../lib/doc/menoFileWriter", async () => {
  const { menoFileBytes: bytesOf } = await import("../../../lib/doc/menoFile");
  return {
    writeMenoFile: async (workspace: string, files: readonly KeptData[], listed: readonly unknown[] = []) => {
      if (io.packFails) throw new Error("the workspace could not be written");
      io.packed.push(files.reduce((n, f) => n + f.data.length, 0));
      return bytesOf(workspace, files, listed as never);
    },
  };
});
// (the backend's writer: the page's bytes, and each job file added - from its folder, or copied from the file named, checked)
vi.mock("./workflow/keptJobs", async (real) => {
  const kept = await real<typeof import("./workflow/keptJobs")>();
  return { ...kept, noteJobFilesSaved: (...a: Parameters<typeof kept.noteJobFilesSaved>) => (io.noteFails ? Promise.reject(new Error("not noted")) : kept.noteJobFilesSaved(...a)) };
});
vi.mock("../../../lib/io/writeDocument", () => {
  const writeDocumentNow = async (path: string, content: Uint8Array, _keepOld: boolean, appended: readonly Appended[] = []) => {
    io.sent.push(content.length);
    // (what the page wrote, as it wrote it - the first entry, what it is, stored)
    const entries: Zippable = Object.fromEntries(Object.entries(unzipSync(content)).map(([name, data]) => [name, [data, { level: name.startsWith("files/") ? 6 : 0 }]]));
    for (const a of appended) {
      if (a.staged) {
        // (one gone from where it was set down: as src-tauri keptjobs.rs says it - the folder taken away, written or not)
        if (io.loseStaged) {
          io.loseStaged = false;
          for (const x of appended) if (x.staged) io.staged.delete(x.staged);
          throw new Error(`${a.name} could not be kept: No such file or directory (os error 2)`);
        }
        // (as Meno set it down - checked as it was sent - and taken away once written, or not)
        if (!io.staged.get(a.staged)?.has(a.sha256)) throw new Error(`${a.name} could not be kept: not found`);
        entries[`files/${a.sha256}`] = [io.known.get(a.sha256)!, { level: 6 }];
        continue;
      }
      if (!a.from) throw new Error(`no folder of ${a.job} here`);
      const from = io.disk.get(a.from);
      if (!from) throw new Error(`${a.from} is not there`);
      const data = unzipSync(from.bytes, { filter: (f) => f.name === `files/${a.sha256}` })[`files/${a.sha256}`];
      // (as src-tauri keptjobs.rs says it)
      if (!data || sha256Hex(data) !== a.sha256) {
        for (const x of appended) if (x.staged) io.staged.delete(x.staged);
        throw new Error(`${a.name} could not be kept: ${a.from.split("/").pop()} no longer holds a file it kept`);
      }
      entries[`files/${a.sha256}`] = [data, { level: 6 }];
    }
    for (const x of appended) if (x.staged) io.staged.delete(x.staged);
    io.disk.set(path, { bytes: zipSync(entries), mtime: ++io.clock });
    if (io.overWritten) io.disk.set(path, { bytes: io.overWritten, mtime: ++io.clock });
    io.overWritten = null;
    // (the file as Meno finds it in its place)
    const f = io.disk.get(path)!;
    return { kept: null, now: { size: f.bytes.length, mtime: f.mtime } };
  };
  return { writeDocumentNow, writeDocument: async (...a: Parameters<typeof writeDocumentNow>) => (await writeDocumentNow(...a)).kept };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

function nothingDrawn(): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  io.disk.clear();
  io.sent.length = 0;
  io.packed.length = 0;
  io.readWhole = 0;
  io.overWritten = null;
  io.noteFails = false;
  io.picked = null;
  io.pieces.length = 0;
  io.staged.clear();
  io.known.clear();
  io.failPiece = 0;
  io.onPiece = null;
  io.asks.length = 0;
  io.packFails = false;
  io.loseStaged = false;
});

async function tabOf(doc: ReturnType<typeof createWorkspaceDocument>): Promise<() => FileActions> {
  const held: { files?: FileActions } = {};
  function Probe() {
    held.files = useFileActions(undefined, "t");
    return null;
  }
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never" });
    root.render(
      <EditorProvider tabId="t" document={doc}>
        <Probe />
      </EditorProvider>,
    );
  });
  mounted.push(async () => act(async () => root.unmount()));
  return () => held.files!;
}

/** Made-up output of a made-up program, `n` bytes, the same nowhere else (`seed`): compressible as an output is. */
function madeUpOutput(seed: number, n: number): Uint8Array {
  const line = (i: number) => `  step ${seed}.${i}   energy ${(-(seed * 7919 + i * 104729) % 1000003) / 1000} ${"x".repeat(i % 37)}\n`;
  let text = "";
  for (let i = 0; text.length < n; i++) text += line(i);
  return new TextEncoder().encode(text.slice(0, n));
}

let JOBS = 6;
let EACH = 256 * 1024;
const SAVED = "/made/up/large.meno";
let made = 0;

/**
 * A workspace's file made on another computer: one step whose run kept the
 * files of `JOBS` jobs, none of whose folders are here - opened from
 * `SAVED`, its job files held from it as the page opens it (views/openFile),
 * and each byte the page reads of them counted.
 */
function openedWorkspace(): { store: ReturnType<typeof storeOf>; doc: ReturnType<typeof createWorkspaceDocument>; inflated: () => number; total: number; original: Uint8Array } {
  const jobs = Array.from({ length: JOBS }, (_, i) => `0b6f5c1e-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
  const files = jobs.map((job, i) => {
    // (each workspace's its own: what this session holds of another's never stands in)
    const data = madeUpOutput(++made * 1000 + i + 1, EACH);
    const sha256 = sha256Hex(data);
    io.known.set(sha256, data);
    return { job, data, sha256 };
  });
  const step: WorkflowStep = {
    id: 1,
    kind: "optimise",
    x: 0,
    y: 0,
    ran: { at: 1, ok: true, said: "done", input: "in", jobs, kept: files.map((f) => ({ job: f.job, files: [{ name: "work/job.out", sha256: f.sha256, size: f.data.length, role: "read" as const }] })) },
  };
  const bytes = menoFileBytes(JSON.stringify({ steps: [step] }), files.map((f) => ({ sha256: f.sha256, name: "work/job.out", media: JOB_FILE_MEDIA, data: f.data })));
  io.disk.set(SAVED, { bytes, mtime: ++io.clock });
  const opened = readMenoFile(bytes);
  let inflated = 0;
  const counted: MenoFile = {
    ...opened,
    data: (sha) => {
      const d = opened.data(sha);
      inflated += d?.length ?? 0;
      return d;
    },
  };
  holdJobFilesOf(counted, { path: SAVED, size: bytes.length, mtime: io.disk.get(SAVED)!.mtime });
  const doc = createWorkspaceDocument();
  const store = storeOf(doc);
  doc.edit("opened", (d) => ({ ...d, steps: [step] }));
  store.getState().markSavedAs(SAVED, store.getState().writing());
  return { store, doc, inflated: () => inflated, total: JOBS * EACH, original: bytes };
}

describe("a workspace saved again and again in one session", () => {
  it("costs the second save, and every one after, what the first cost: its job files copied by Meno from the file as the last save left it, none read into the page", async () => {
    const w = openedWorkspace();
    const files = await tabOf(w.doc);
    const counts: { inflated: number; packed: number; sent: number }[] = [];
    for (let save = 0; save < 3; save++) {
      const before = w.inflated();
      w.store.getState().addAtom(save * 1.5, 0, "C");
      await act(async () => void (await files().save()));
      counts.push({ inflated: w.inflated() - before, packed: io.packed[save], sent: io.sent[save] });
      // (and the file on the disk holds every job file, whole, each save)
      const now = readMenoFile(io.disk.get(SAVED)!.bytes);
      expect(now.files.filter((f) => f.media === JOB_FILE_MEDIA)).toHaveLength(JOBS);
    }
    expect(io.sent).toHaveLength(3);
    for (const c of counts) {
      expect(c.inflated).toBe(0);
      expect(c.packed).toBe(0);
      expect(c.sent).toBeLessThan(w.total / 10);
    }
  });

  /** The job files the file at `path` holds, whole. */
  const jobFilesIn = (path: string) => readMenoFile(io.disk.get(path)!.bytes).files.filter((f) => f.media === JOB_FILE_MEDIA && readMenoFile(io.disk.get(path)!.bytes).data(f.sha256));

  /** The workspace saved once, and the file then written over by something else before Meno looks at it: one that holds none of its job files. */
  async function noteOfAFileWrittenOver() {
    const w = openedWorkspace();
    const files = await tabOf(w.doc);
    io.overWritten = menoFileBytes("{}", []);
    w.store.getState().addAtom(0, 0, "C");
    await act(async () => void (await files().save()));
    expect(jobFilesIn(SAVED)).toHaveLength(0);
    w.store.getState().addAtom(1.5, 0, "C");
    return { w, files };
  }

  it("saves again where a file its job files were to be copied from was written over since: each kept from what the page holds of it, the save said to have worked", async () => {
    const { w, files } = await noteOfAFileWrittenOver();
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    expect(jobFilesIn(SAVED)).toHaveLength(JOBS);
    expect(w.store.getState().savedPath).toBe(SAVED);
    // (and the next save copies them from that file again, none read into the page)
    const before = w.inflated();
    w.store.getState().addAtom(3, 0, "C");
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    expect(w.inflated() - before).toBe(0);
    expect(jobFilesIn(SAVED)).toHaveLength(JOBS);
  });

  it("saves as another file there too", async () => {
    const { files } = await noteOfAFileWrittenOver();
    io.picked = "/made/up/copy.meno";
    await act(async () => void (await files().saveAs()));
    expect(files().error).toBeNull();
    expect(jobFilesIn("/made/up/copy.meno")).toHaveLength(JOBS);
  });

  it("never says a save that was written failed for want of a note of where its job files are", async () => {
    const w = openedWorkspace();
    const files = await tabOf(w.doc);
    io.noteFails = true;
    w.store.getState().addAtom(0, 0, "C");
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    expect(jobFilesIn(SAVED)).toHaveLength(JOBS);
  });

  /** Every job file the file at `path` holds is whole: its name its SHA-256. */
  const verifies = (path: string) => {
    const f = readMenoFile(io.disk.get(path)!.bytes);
    const jobs = f.files.filter((x) => x.media === JOB_FILE_MEDIA);
    return jobs.length === JOBS && jobs.every((x) => f.data(x.sha256) !== null);
  };

  /** Opened and saved once; then the file at `SAVED` made `what` from outside Meno - another size and time - and something changed. */
  async function savedThen(as: (w: ReturnType<typeof openedWorkspace>) => Uint8Array | null) {
    const w = openedWorkspace();
    const what = as(w);
    const files = await tabOf(w.doc);
    w.store.getState().addAtom(0, 0, "C");
    await act(async () => void (await files().save()));
    if (what) io.disk.set(SAVED, { bytes: what, mtime: ++io.clock });
    else io.disk.delete(SAVED);
    w.store.getState().addAtom(1.5, 0, "C");
    io.pieces.length = 0;
    io.packed.length = 0;
    return { w, files, inflated: w.inflated() };
  }

  it("sends no job file through the page where the file was replaced from outside by an older copy holding the same job files", async () => {
    const { w, files, inflated } = await savedThen((w) => w.original);
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    expect(io.pieces).toEqual([]);
    expect(io.packed).toEqual([0]);
    expect(w.inflated() - inflated).toBe(0);
    expect(verifies(SAVED)).toBe(true);
  });

  it("takes them from the copy kept beside a file replaced by an unrelated one: none through the page", async () => {
    const { w, files, inflated } = await savedThen((w) => (io.disk.set(`${SAVED}.bak`, { bytes: w.original, mtime: ++io.clock }), menoFileBytes("{}", [])));
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    expect(io.pieces).toEqual([]);
    expect(io.packed).toEqual([0]);
    expect(w.inflated() - inflated).toBe(0);
    expect(verifies(SAVED)).toBe(true);
  });

  it("sends only those found nowhere - the file deleted - each alone, read as it is sent", async () => {
    const { w, files, inflated } = await savedThen(() => null);
    const readAtEach: number[] = [];
    io.onPiece = () => readAtEach.push(w.inflated() - inflated);
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    expect(io.pieces).toEqual(Array.from({ length: JOBS }, () => EACH));
    // (the k-th sent once k had been read: never all read first)
    expect(readAtEach).toEqual(Array.from({ length: JOBS }, (_, k) => (k + 1) * EACH));
    expect(io.packed).toEqual([0]);
    expect(verifies(SAVED)).toBe(true);
    // (and set down only for that save: nothing left)
    expect(io.staged.size).toBe(0);
  });

  it("never takes a job file from a file whose bytes are not what its name says: read whole, taken from elsewhere, the save said to have worked", async () => {
    const { files } = await savedThen((w) => menoFileBytes("{}", readMenoFile(w.original).files.map((f) => ({ ...f, data: new Uint8Array(f.size).fill(120) }))));
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    // (asked by name and size first; the write's own check refused it; asked again, read whole)
    expect(io.asks.slice(-2)).toEqual([false, true]);
    expect(io.pieces).toHaveLength(JOBS);
    expect(verifies(SAVED)).toBe(true);
  });

  it("leaves the file as it was, and nothing set down, where a piece fails half way", async () => {
    const { files } = await savedThen(() => null);
    io.disk.set(SAVED, { bytes: menoFileBytes("{}", []), mtime: ++io.clock });
    const before = io.disk.get(SAVED)!.bytes;
    io.failPiece = 3;
    await act(async () => void (await files().save()));
    expect(files().error).toMatch(/^Save failed: .*the disk is full/);
    expect(io.disk.get(SAVED)!.bytes).toBe(before);
    expect(io.staged.size).toBe(0);
  });

  it("saves as another file, the one it was saved to replaced from outside, sending no job file through the page", async () => {
    const { w, files, inflated } = await savedThen((w) => w.original);
    io.picked = "/made/up/copy.meno";
    await act(async () => void (await files().saveAs()));
    expect(files().error).toBeNull();
    expect(io.pieces).toEqual([]);
    expect(io.packed).toEqual([0]);
    expect(w.inflated() - inflated).toBe(0);
    expect(verifies("/made/up/copy.meno")).toBe(true);
  });

  it("holds no more than the largest job file and a little besides, the heavy way, however many there are", async () => {
    const v8 = await import("node:v8");
    const vm = await import("node:vm");
    v8.setFlagsFromString("--expose_gc");
    const gc = vm.runInNewContext("gc") as (o?: object) => void;
    // (a full collection, its freeing done before it returns - else what was let go is still counted)
    const held = () => (gc({ type: "major", execution: "sync" }), gc({ type: "major", execution: "sync" }), process.memoryUsage().arrayBuffers);
    [JOBS, EACH] = [48, 1024 * 1024];
    try {
      const { files } = await savedThen(() => null);
      const base = held();
      let most = 0;
      io.onPiece = () => void (most = Math.max(most, held() - base));

      await act(async () => void (await files().save()));
      expect(files().error).toBeNull();
      expect(io.pieces).toHaveLength(JOBS);
      // (the bound: the largest job file, and a little besides)
      expect(most).toBeLessThan(EACH + 64 * 1024);
      expect(most).toBeLessThan((JOBS * EACH) / 10);
    } finally {
      [JOBS, EACH] = [6, 256 * 1024];
    }
  }, 60_000);

  it("leaves nothing set down where the page's own packing fails after pieces were set down", async () => {
    const { files } = await savedThen(() => null);
    io.packFails = true;
    await act(async () => void (await files().save()));
    expect(files().error).toMatch(/^Save failed: /);
    expect(io.pieces).toHaveLength(JOBS);
    expect(io.staged.size).toBe(0);
  });

  it("makes the save again, each read whole, where a piece set down for it is gone as it is written", async () => {
    const { files } = await savedThen(() => null);
    io.loseStaged = true;
    await act(async () => void (await files().save()));
    expect(files().error).toBeNull();
    expect(io.asks.slice(-2)).toEqual([false, true]);
    expect(io.pieces).toHaveLength(2 * JOBS);
    expect(verifies(SAVED)).toBe(true);
    expect(io.staged.size).toBe(0);
  });

  it("says, counted, the job files it could have from nowhere - never a save said to have kept all", async () => {
    const w = openedWorkspace();
    const files = await tabOf(w.doc);
    const step = w.store.getState().steps![0];
    const gone = { name: "work/gone.out", sha256: "f".repeat(64), size: 10, role: "read" as const };
    w.doc.edit("kept", (d) => ({ ...d, steps: [{ ...step, ran: { ...step.ran!, kept: step.ran!.kept!.map((k, i) => (i === 0 ? { ...k, files: [...k.files, gone] } : k)) } }] }));
    w.store.getState().addAtom(0, 0, "C");
    await act(async () => void (await files().save()));
    expect(files().error).toBe("Saved, but 1 job file of its steps is not in the file: it could not be read.");
    expect(verifies(SAVED)).toBe(true);
  });
});
