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
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: async () => null }));
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
  clearSavedFolders: async () => ({ gone: [], left: [], at: null }),
}));
vi.mock("../../../lib/doc/menoFileWriter", async () => {
  const { menoFileBytes: bytesOf } = await import("../../../lib/doc/menoFile");
  return {
    writeMenoFile: async (workspace: string, files: readonly KeptData[], listed: readonly unknown[] = []) => {
      io.packed.push(files.reduce((n, f) => n + f.data.length, 0));
      return bytesOf(workspace, files, listed as never);
    },
  };
});
// (the backend's writer: the page's bytes, and each job file added - from its folder, or copied from the file named, checked)
vi.mock("../../../lib/io/writeDocument", () => ({
  writeDocument: async (path: string, content: Uint8Array, _keepOld: boolean, appended: readonly Appended[] = []) => {
    io.sent.push(content.length);
    // (what the page wrote, as it wrote it - the first entry, what it is, stored)
    const entries: Zippable = Object.fromEntries(Object.entries(unzipSync(content)).map(([name, data]) => [name, [data, { level: name.startsWith("files/") ? 6 : 0 }]]));
    for (const a of appended) {
      if (!a.from) throw new Error(`no folder of ${a.job} here`);
      const from = io.disk.get(a.from);
      if (!from) throw new Error(`${a.from} is not there`);
      const data = unzipSync(from.bytes, { filter: (f) => f.name === `files/${a.sha256}` })[`files/${a.sha256}`];
      if (!data || sha256Hex(data) !== a.sha256) throw new Error(`${a.from} no longer holds ${a.name}`);
      entries[`files/${a.sha256}`] = [data, { level: 6 }];
    }
    io.disk.set(path, { bytes: zipSync(entries), mtime: ++io.clock });
    return null;
  },
}));

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

const JOBS = 6;
const EACH = 256 * 1024;
const SAVED = "/made/up/large.meno";

/**
 * A workspace's file made on another computer: one step whose run kept the
 * files of `JOBS` jobs, none of whose folders are here - opened from
 * `SAVED`, its job files held from it as the page opens it (views/openFile),
 * and each byte the page reads of them counted.
 */
function openedWorkspace(): { store: ReturnType<typeof storeOf>; doc: ReturnType<typeof createWorkspaceDocument>; inflated: () => number; total: number } {
  const jobs = Array.from({ length: JOBS }, (_, i) => `0b6f5c1e-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
  const files = jobs.map((job, i) => {
    const data = madeUpOutput(i + 1, EACH);
    return { job, data, sha256: sha256Hex(data) };
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
  return { store, doc, inflated: () => inflated, total: JOBS * EACH };
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
});
