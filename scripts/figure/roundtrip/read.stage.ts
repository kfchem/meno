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
 * RT_PRESETS=a,b only the drawings in those styles (rdkit_draw.py's too);
 * RT_VARIANTS=upright,serif only those ways of printing them;
 * RT_OUTLINE=letter or =word the figures' words drawn as outlines first, a
 * path for each letter or for each word, as many journals print a figure's
 * labels (outline.ts) - read against the system's letters, which
 * glyphs.swift measures into known.json first. RT_DPI=300 (or any) reads
 * each figure as a picture instead: its box drawn at that resolution by the
 * reader (`render`), traced (lib/figure/trace) and read from the shapes
 * traced, the PDF's own letters given as they are written - or, with
 * RT_LETTERS=traced, none given: the picture's letters traced too and read
 * against the system's letters (known.json, as for RT_OUTLINE); RT_JPEG and
 * RT_SCAN spoil the picture first (spoil.ts); a page turned is not traced.
 *
 * A reaction's drawing (rdkit_draw.py's) is read the same way, and its
 * molecules told apart by where they stand to its longest arrow - before
 * its tail the reactants, past its point the products, along it (over or
 * under it) the agents - each side written as a MOL file of its own, with
 * how many arrows and "+" signs were read.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
import { figuresOf, pageObjectsOf, type Box } from "../../../src/lib/pdf/figures";
import type { FigureDrawn } from "../../../src/lib/figure/drawn";
import { structureFileText } from "../../../src/ui/features/Workspace/fileActions";
import { unsureOf } from "../../../src/ui/features/Workspace/chem/drawing";
import { figureFrom, figureLabels, lettersAsShapes, pictureResult } from "../../../src/ui/features/Workspace/utils/figures";
import type { GlyphShape } from "../../../src/lib/figure/glyphs";
import { readDrawnLabel } from "../../../src/lib/figure/structure";
import { readTracedPicture } from "../../../src/lib/figure/tracedRead";
import type { Model } from "../../../src/ui/features/Workspace/store/types";
import { fileName } from "./names";
import { asScan, viaJpeg, type Raw } from "./spoil";
import { knownLetters, outlined } from "./outline";

const OUT = resolve(process.cwd(), ".roundtrip");
const READ = process.env.RT_READ ? resolve(OUT, process.env.RT_READ) : OUT;
const EXE = process.env.MENO ?? resolve(process.cwd(), "src-tauri/target/release/bundle/macos/Meno.app/Contents/MacOS/Meno");
/** How the figures' words are drawn before they are read: as letters, as the PDF has them, or as outlines, a path for each letter or each word. */
const OUTLINE = process.env.RT_OUTLINE === "letter" || process.env.RT_OUTLINE === "word" ? process.env.RT_OUTLINE : null;
/** RT_DPI: each figure read as a picture of it at this resolution, traced - none, read as drawn. */
const DPI = Number(process.env.RT_DPI) || null;
/** RT_LETTERS=traced: a picture's letters traced and matched too, none given from the PDF - else the PDF's own letters given. */
const TRACED_LETTERS = process.env.RT_LETTERS === "traced";
/** RT_JPEG=quality: each picture saved as JPEG at that quality and opened again before it is traced; RT_SCAN=1: made a scan of (spoil.ts). */
const JPEG = Number(process.env.RT_JPEG) || null;
const SCAN = !!process.env.RT_SCAN;
/**
 * How many of a structure's atoms and bonds are marked unsure - what it says it may have read wrong: as read, or as the canvas marks the
 * drawing's stereochemistry (`unsureOf`: a centre a hashed line leaves open, one drawn by luck).
 */
const markedOf = (m: Model) => {
  const shown = unsureOf(m);
  return m.atoms.filter((a) => a.unsure || shown.atoms.has(a.id)).length + m.bonds.filter((b) => b.unsure || shown.bonds.has(b.id)).length;
};
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

/** A reaction's molecules by where each stands to the longest arrow: before its tail, along it, past its point. */
export function sidesOf(model: Model, arrows: readonly { x: number; y: number; angle: number; length: number }[]): Record<"reactants" | "agents" | "products", Model> {
  const sides = { reactants: { atoms: [], bonds: [] }, agents: { atoms: [], bonds: [] }, products: { atoms: [], bonds: [] } } as Record<"reactants" | "agents" | "products", Model>;
  const arrow = arrows.reduce<(typeof arrows)[number] | null>((p, a) => (!p || a.length > p.length ? a : p), null);
  if (!arrow) return sides;
  // (each molecule: the atoms its bonds join)
  const group = new Map(model.atoms.map((a) => [a.id, a.id]));
  const root = (id: number): number => (group.get(id) === id ? id : root(group.get(id)!));
  for (const b of model.bonds) group.set(root(b.a), root(b.b));
  const u = { x: Math.cos(arrow.angle), y: Math.sin(arrow.angle) };
  for (const r of new Set(model.atoms.map((a) => root(a.id)))) {
    const atoms = model.atoms.filter((a) => root(a.id) === r);
    const ids = new Set(atoms.map((a) => a.id));
    const at = { x: atoms.reduce((t, a) => t + a.x, 0) / atoms.length, y: atoms.reduce((t, a) => t + a.y, 0) / atoms.length };
    const along = (at.x - arrow.x) * u.x + (at.y - arrow.y) * u.y;
    const side = sides[along < -arrow.length / 2 ? "reactants" : along > arrow.length / 2 ? "products" : "agents"];
    side.atoms.push(...atoms);
    side.bonds.push(...model.bonds.filter((b) => ids.has(b.a)));
  }
  return sides;
}

/**
 * A figure's box read as a picture of it (RT_DPI): drawn by the reader at that resolution, white under it, traced, the shapes laid
 * back on the page and read with the PDF's own letters, as written - a structure, or why none. A page turned is not traced.
 */
async function traced(reader: Reader, sha: string, box: Box, drawn: FigureDrawn, variant: string, known: readonly GlyphShape[] = []): Promise<({ model: Model; scheme?: undefined; left?: string } | { none: string }) & { pixels?: { line: number; bond: number; shaded: number } }> {
  if (variant === "turned") return { none: "a page turned is not traced" };
  const s = DPI! / 72;
  const [x, y] = [Math.max(0, Math.floor(box[0] * s)), Math.max(0, Math.floor(box[1] * s))];
  const [w, h] = [Math.ceil((box[2] - box[0]) * s), Math.ceil((box[3] - box[1]) * s)];
  const { head, body } = await reader.ask({ op: "render", sha, page: 0, scale: s, x, y, w, h, packed: false });
  if (head.ok === false) throw new Error(String(head.error));
  let raw: Raw = { width: Number(head.w), height: Number(head.h), data: body };
  if (SCAN) raw = asScan(raw, parseInt(sha.slice(0, 8), 16));
  if (JPEG) raw = viaJpeg(raw, JPEG);
  // (the PDF's letters given, read as written - or none, the picture's own traced: lib/figure/tracedRead, as the app reads a picture)
  let pixels: { line: number; bond: number; shaded: number } | undefined;
  const read = readTracedPicture(raw, { scale: 1 / s, x: x / s, y: y / s }, known, (l) => readDrawnLabel(l, figureLabels).read, TRACED_LETTERS ? [] : drawn.letters, (m) => {
    pixels = { line: +m.line.toFixed(2), bond: +m.bond.toFixed(1), shaded: +m.shaded.toFixed(3) };
  });
  if ("none" in read) return { ...read, pixels };
  const xs = read.atoms.map((a) => a.x);
  const ys = read.atoms.map((a) => a.y);
  const about = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  // (as the app makes a picture's structure: over-bonded structures left out, a lone atom none)
  const got = pictureResult(read, (px, py) => ({ sha256: sha, page: 0, x: px, y: py, bond: read.bond }), about);
  return "none" in got ? { none: got.none, pixels } : { model: got.model, ...(got.left ? { left: got.left } : {}), pixels };
}

it("reads every PDF back", async () => {
  const { molecules, reactions = [] } = JSON.parse(readFileSync(resolve(OUT, "corpus.json"), "utf8")) as { molecules: { name: string }[]; reactions?: { name: string }[] };
  const nameOf = new Map([...molecules, ...reactions].map((m) => [fileName(m.name), m.name]));
  const isReaction = new Set(reactions.map((r) => r.name));
  // (letters drawn as shapes are read against the system's letters, as the app reads them: glyphs.swift measures them - needed for
  // RT_OUTLINE; without them a figure's outlines are left unread, the app's own being drawn on a canvas)
  const known = OUTLINE || TRACED_LETTERS || existsSync(resolve(OUT, "known.json")) ? knownLetters(resolve(OUT, "known.json")) : undefined;
  const cache = resolve(OUT, "cache");
  mkdirSync(cache, { recursive: true });
  // (the reader keeps every PDF it is asked about open: started afresh every so often)
  let reader = new Reader(EXE, cache);
  await reader.ready();
  let asked = 0;
  mkdirSync(resolve(READ, "figures"), { recursive: true });
  const only = process.env.ONLY?.toLowerCase().split(",");
  const presets = process.env.RT_PRESETS?.split(",");
  const variants = process.env.RT_VARIANTS?.split(",");
  const read: Record<string, unknown>[] = [];
  for (const file of readdirSync(resolve(OUT, "pdf")).sort()) {
    const m = /^(.*)\.([a-z0-9]+)\.([a-z]+)\.pdf$/.exec(file);
    if (!m || !nameOf.has(m[1])) continue;
    if (only && !only.some((o) => file.toLowerCase().startsWith(o))) continue;
    if (presets && !presets.includes(m[2])) continue;
    if (variants && !variants.includes(m[3])) continue;
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
        // (RT_OUTLINE: its words drawn as outlines first, as a journal may print them - outline.ts - and read against the system's letters)
        const drawn = OUTLINE ? outlined(head as unknown as FigureDrawn, OUTLINE) : (head as unknown as FigureDrawn);
        const got = DPI ? await traced(reader, sha, box, drawn, m[3], known) : figureFrom(drawn, sha, 0, known && lettersAsShapes(drawn) ? known : undefined);
        if ("pixels" in got && got.pixels) entry.pixels = got.pixels;
        if ("none" in got) entry.none = got.none;
        else {
          entry.marked = markedOf(got.model);
          // (structures left out for an atom with more bonds than it takes: said, as Read as structure says it)
          if (got.left) entry.left = got.left;
          // (what it says, each thing once: why it is marked)
          const said = [...new Set([...got.model.atoms, ...got.model.bonds].flatMap((x) => x.unsure?.said ?? []))];
          if (said.length) entry.said = said;
          entry.mol = structureFileText(got.model, "read.mol");
          if (isReaction.has(String(entry.name))) {
            const arrows = got.scheme?.arrows ?? [];
            entry.arrows = arrows.length;
            entry.pluses = got.scheme?.pluses?.length ?? 0;
            const sides = sidesOf(got.model, arrows);
            entry.sides = Object.fromEntries(Object.entries(sides).map(([k, m]) => [k, m.atoms.length ? structureFileText(m, "read.mol") : ""]));
          }
        }
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
