/**
 * Stage 4 of the round trip (README.md): every PDF of .roundtrip/pdf read
 * back as *Read as structure* reads a figure - its figures found as a click
 * in the column finds them (lib/pdf/figures), all of them taken in one box,
 * as a box drawn round the drawing takes them; that box read by Meno's PDF
 * reader (`Meno --pdf`, the built app's) and made a structure by Meno's
 * figure reader (utils/figures `figureFrom`) - and written as a MOL file.
 *
 *   npx vitest run --config scripts/figure/roundtrip/vitest.config.ts read
 *
 * MENO names the app's executable, where it is not the bundle built here;
 * RT_READ a folder under .roundtrip for what is read, to keep another build's
 * reads beside these; RT_BOX=page a box round all that is on the page, not
 * the figures found - the figure reader measured apart from finding figures;
 * RT_PRESETS=a,b only the drawings in those styles (rdkit_draw.py's too).
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
import { figuresOf, pageObjectsOf, type Box } from "../../../src/lib/pdf/figures";
import type { FigureDrawn } from "../../../src/lib/figure/drawn";
import { structureFileText } from "../../../src/ui/features/Workspace/fileActions";
import { figureFrom } from "../../../src/ui/features/Workspace/utils/figures";
import { fileName } from "./names";

const OUT = resolve(process.cwd(), ".roundtrip");
const READ = process.env.RT_READ ? resolve(OUT, process.env.RT_READ) : OUT;
const EXE = process.env.MENO ?? resolve(process.cwd(), "src-tauri/target/release/bundle/macos/Meno.app/Contents/MacOS/Meno");
/** How far round the figures found the box goes, in points: as a hand draws one. */
const PAD_PT = 6;

/** Meno's PDF reader, asked one thing at a time: each answer a frame - its head (JSON), then its bytes, each after its length. */
class Reader {
  private proc: ChildProcessWithoutNullStreams;
  private buf = Buffer.alloc(0);
  private waiting: ((f: { head: Record<string, unknown>; body: Buffer } | null) => void)[] = [];
  private asked = 0;
  private gone: Error | null = null;
  constructor(exe: string, cache: string) {
    this.proc = spawn(exe, ["--pdf", cache]);
    // (gone: whatever it was asked fails, rather than waiting on)
    this.proc.on("exit", (code) => {
      this.gone = new Error(`the PDF reader stopped (${code})`);
      for (const w of this.waiting.splice(0)) w(null);
    });
    this.proc.stdout.on("data", (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      for (;;) {
        if (this.buf.length < 4) return;
        const hl = this.buf.readUInt32LE(0);
        if (this.buf.length < 8 + hl) return;
        const bl = this.buf.readUInt32LE(4 + hl);
        if (this.buf.length < 8 + hl + bl) return;
        const head = JSON.parse(this.buf.subarray(4, 4 + hl).toString("utf8"));
        const body = Buffer.from(this.buf.subarray(8 + hl, 8 + hl + bl));
        this.buf = this.buf.subarray(8 + hl + bl);
        this.waiting.shift()?.({ head, body });
      }
    });
  }
  /** The first frame: the reader is up. */
  ready(): Promise<unknown> {
    return new Promise((done) => this.waiting.push(done));
  }
  ask(req: Record<string, unknown>): Promise<{ head: Record<string, unknown>; body: Buffer }> {
    return new Promise((done, fail) => {
      if (this.gone) return fail(this.gone);
      this.waiting.push((f) => (f ? done(f) : fail(this.gone ?? new Error("the PDF reader stopped"))));
      this.proc.stdin.write(JSON.stringify({ ...req, id: ++this.asked }) + "\n");
    });
  }
  close() {
    this.proc.stdin.end();
  }
}

it("reads every PDF back", async () => {
  const { molecules } = JSON.parse(readFileSync(resolve(OUT, "corpus.json"), "utf8")) as { molecules: { name: string }[] };
  const nameOf = new Map(molecules.map((m) => [fileName(m.name), m.name]));
  const cache = resolve(OUT, "cache");
  mkdirSync(cache, { recursive: true });
  // (the reader keeps every PDF it is asked about open: started afresh every so often)
  let reader = new Reader(EXE, cache);
  await reader.ready();
  let asked = 0;
  mkdirSync(resolve(READ, "figures"), { recursive: true });
  const only = process.env.ONLY?.toLowerCase().split(",");
  const presets = process.env.RT_PRESETS?.split(",");
  const read: Record<string, unknown>[] = [];
  for (const file of readdirSync(resolve(OUT, "pdf")).sort()) {
    const m = /^(.*)\.([a-z0-9]+)\.([a-z]+)\.pdf$/.exec(file);
    if (!m || !nameOf.has(m[1])) continue;
    if (only && !only.some((o) => file.toLowerCase().startsWith(o))) continue;
    if (presets && !presets.includes(m[2])) continue;
    const bytes = readFileSync(resolve(OUT, "pdf", file));
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (!existsSync(resolve(cache, `${sha}.pdf`))) copyFileSync(resolve(OUT, "pdf", file), resolve(cache, `${sha}.pdf`));
    if (++asked % 200 === 0) {
      reader.close();
      reader = new Reader(EXE, cache);
      await reader.ready();
    }
    const entry: Record<string, unknown> = { name: nameOf.get(m[1]), preset: m[2], variant: m[3] };
    try {
      const objects = await reader.ask({ op: "objects", sha, page: 0 });
      const ab = objects.body.buffer.slice(objects.body.byteOffset, objects.body.byteOffset + objects.body.byteLength) as ArrayBuffer;
      const objects2 = pageObjectsOf(ab);
      const figures = figuresOf(objects2);
      entry.figures = figures.length;
      // (none found - a drawing too small to be taken for one: a box drawn by hand round all that is on the page)
      const round = (bs: Box[]): Box | null =>
        bs.length ? [Math.min(...bs.map((f) => f[0])) - PAD_PT, Math.min(...bs.map((f) => f[1])) - PAD_PT, Math.max(...bs.map((f) => f[2])) + PAD_PT, Math.max(...bs.map((f) => f[3])) + PAD_PT] : null;
      const page = objects2.map((o) => o.box).filter((b) => b[2] - b[0] < 400 && b[3] - b[1] < 600);
      const box = (process.env.RT_BOX !== "page" && round(figures)) || round(page);
      if (!box) {
        entry.none = "no figure found on the page";
      } else {
        const { head } = await reader.ask({ op: "figure", sha, page: 0, box });
        if (head.ok === false) throw new Error(String(head.error));
        // (kept, to look into what was read without the reader)
        writeFileSync(resolve(READ, "figures", file.replace(/\.pdf$/, ".json")), JSON.stringify({ box, ...head }));
        const got = figureFrom(head as unknown as FigureDrawn, sha, 0);
        if ("none" in got) entry.none = got.none;
        else entry.mol = structureFileText(got.model, "read.mol");
      }
    } catch (e) {
      entry.none = `failed: ${e instanceof Error ? e.message : String(e)}`;
      // (the reader gone: another for the rest)
      if (e instanceof Error && /stopped/.test(e.message)) {
        reader = new Reader(EXE, cache);
        await reader.ready();
      }
    }
    read.push(entry);
  }
  reader.close();
  writeFileSync(resolve(READ, "read.json"), JSON.stringify({ read }, null, 1));
  console.log(`${read.filter((r) => r.mol).length} of ${read.length} read -> ${resolve(READ, "read.json")}`);
});
