import * as THREE from "three";
import { BatchedText, Text } from "troika-three-text";
import { createDerivedMaterial } from "troika-three-utils";
import { fadeLetters } from "./labelFade";

/** A run of a label's letters as it is drawn: where (its baseline's start, in the page's units), how large, in what colour, leaning or thickened. */
export type BatchRun = { text: string; x: number; y: number; size: number; color: string; italic: boolean; bold: boolean };

/** How far an italic run leans, and how much a bold one's letters are thickened: as Labels2D draws them one by one. */
export const ITALIC_SLANT = Math.tan((12 * Math.PI) / 180);
export const BOLD = "3.5%";

/**
 * The most texts one batch draws. troika numbers a batch's texts in 16
 * bits; and a text changed sets the letters of its whole batch again, so a
 * label typed sets those of a few thousand, not of every label on the page.
 */
export const BATCH_MOST = 8192;

type Held = { item: object; members: Text[]; chunk: BatchedText };

/** The line of troika's batch shader that unpacks a member's colour from its packed hex, which `PageBatch` replaces. */
export const PACKED_COLOUR = "return mod(floor(vec3(v / 65536.0, v / 256.0, v)), 256.0) / 256.0;";
/** Meno's: the hex unpacked as sRGB, the space of the page's colours, and made linear as a colour drawn alone is. */
const SRGB_COLOUR =
  "vec3 c = mod(floor(vec3(v / 65536.0, v / 256.0, v)), 256.0) / 255.0; return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));";

/**
 * troika's batch with its members' colours unpacked as the page's colours
 * are. Meno's colours are sRGB, and the page's output is made sRGB from
 * linear, so its line that unpacks a member's colour is replaced
 * (`PACKED_COLOUR` -> `SRGB_COLOUR`): what is drawn is the colour asked
 * for, to the byte, as a text drawn alone draws it.
 */
class PageBatch extends BatchedText {
  createDerivedMaterial(base: THREE.Material): THREE.Material {
    const inner = super.createDerivedMaterial(base) as THREE.Material & { setMatrixTexture: (t: THREE.DataTexture) => void };
    const outer = createDerivedMaterial(inner, {
      chained: true,
      customRewriter: ({ vertexShader, fragmentShader }) => ({ vertexShader: vertexShader.split(PACKED_COLOUR).join(SRGB_COLOUR), fragmentShader }),
    }) as typeof inner;
    outer.setMatrixTexture = (t) => inner.setMatrixTexture(t);
    return outer;
  }
}

/**
 * Texts of one typeface drawn a few draw calls in all, not one each (the
 * page at its whole had tens of thousands): troika's `BatchedText`, in
 * chunks of `BATCH_MOST`, each label's runs its members - placed by their
 * own matrices, coloured and faded each by its own. What is drawn is what
 * the texts drawn one by one draw: the same letters, sizes, colours,
 * outlines and order (`renderOrder`), over everything (no depth test).
 * Held by key - an atom's label by its atom - and kept while it is the
 * same item, as Labels2D keeps its texts.
 */
export class TextBatch {
  readonly root = new THREE.Group();
  private readonly chunks: BatchedText[] = [];
  private readonly held = new Map<string, Held>();
  private readonly count = new Map<BatchedText, number>();

  /**
   * Its chunks packed before they are drawn: troika packs a chunk's members
   * into it only as it is drawn, and after that frame - a set of words
   * shown in place of another (WholeTexts2D) was drawn empty for two or
   * three frames, a blank where the words were. Each chunk is packed here,
   * shown or not, once every member it holds has its letters set
   * (`waiting`: those whose letters are being set), and `setting` says so
   * until it is.
   */
  private readonly chunkOf = new Map<Text, BatchedText>();
  private readonly waiting = new Map<BatchedText, number>();
  private readonly counted = new WeakSet<Text>();
  private readonly toPack = new Set<BatchedText>();
  /** Packs under way, by chunk: a member set again while one is packs it once more. */
  private readonly packing = new Map<BatchedText, number>();
  private packAsked = false;

  /**
   * `drawn` is asked for a frame each time a member's letters are set, and
   * each time a chunk has set its own: a canvas drawn on demand draws no
   * frame of itself - a label typed waited half a second for some other
   * frame to be shown.
   */
  constructor(readonly font: string, readonly renderOrder: number, private readonly drawn: () => void = () => {}) {}

  /** Those told as letters are set (`onSynced`). */
  private readonly listeners = new Set<() => void>();
  private readonly tell = () => {
    this.drawn();
    for (const l of [...this.listeners]) l();
  };
  /** A member's letters set: its chunk packed once none of its members is still being set. */
  private readonly heard = (e: { target: unknown }) => {
    const t = e.target as Text;
    const c = this.chunkOf.get(t);
    if (c) {
      if (this.counted.has(t)) {
        this.counted.delete(t);
        this.waiting.set(c, (this.waiting.get(c) ?? 1) - 1);
      }
      this.packWhenSet(c);
    }
    this.tell();
  };
  /** A chunk's members packed into it. */
  private readonly packed = (e: { target: unknown }) => {
    const c = e.target as BatchedText;
    const n = (this.packing.get(c) ?? 1) - 1;
    if (n > 0) this.packing.set(c, n);
    else this.packing.delete(c);
    this.tell();
  };
  private readonly packStarted = (e: { target: unknown }) => {
    const c = e.target as BatchedText;
    this.packing.set(c, (this.packing.get(c) ?? 0) + 1);
  };

  /** A member's letters set again (troika's `sync`), counted as waiting where it is. */
  private resync(t: Text, c: BatchedText): void {
    t.sync();
    if (t._isSyncing && !this.counted.has(t)) {
      this.counted.add(t);
      this.waiting.set(c, (this.waiting.get(c) ?? 0) + 1);
    }
  }

  /** `c` packed - soon, once - where none of its members' letters is still being set. */
  private packWhenSet(c: BatchedText): void {
    if ((this.waiting.get(c) ?? 0) > 0) return;
    this.toPack.add(c);
    if (this.packAsked) return;
    this.packAsked = true;
    queueMicrotask(() => {
      this.packAsked = false;
      for (const k of [...this.toPack]) {
        this.toPack.delete(k);
        if (this.chunks.includes(k)) k.sync();
      }
      this.tell();
    });
  }

  /** Whether `key` is drawn, from whatever item. */
  holds(key: string): boolean {
    return this.held.has(key);
  }

  /** Whether `key` is drawn from `item` already. */
  has(key: string, item: object): boolean {
    return this.held.get(key)?.item === item;
  }

  /** The label `key` drawn as `runs` (from `item`), as opaque as `opacity`: its members made again, in its chunk. */
  set(key: string, item: object, runs: readonly BatchRun[], opacity: number): void {
    // (one there already with as many runs: changed in place - its letters set again, the batch's members
    // the same - so that a label changing at every frame, a structure growing, never takes another's place
    // while the batch sets its letters anew)
    const was = this.held.get(key);
    if (was && was.members.length === runs.length) {
      runs.forEach((run, i) => dress(was.members[i], run, opacity));
      for (const t of was.members) this.resync(t, was.chunk);
      this.held.set(key, { ...was, item });
      this.packWhenSet(was.chunk);
      return;
    }
    this.drop(key);
    const chunk = this.chunkFor(runs.length);
    const members = runs.map((run) => {
      const t = new Text();
      t.font = this.font;
      t.anchorX = "left";
      t.anchorY = "top-baseline";
      dress(t, run, opacity);
      t.addEventListener("synccomplete" as never, this.heard);
      chunk.addText(t);
      this.chunkOf.set(t, chunk);
      // (its letters set now, not only as its chunk is drawn: a batch not shown - WholeTexts2D's next set, waiting to be shown once set - would never set them, and never be shown)
      this.resync(t, chunk);
      return t;
    });
    this.count.set(chunk, (this.count.get(chunk) ?? 0) + members.length);
    this.held.set(key, { item, members, chunk });
    this.packWhenSet(chunk);
  }

  /** The label `key` no longer drawn. */
  drop(key: string): void {
    const h = this.held.get(key);
    if (!h) return;
    for (const t of h.members) {
      t.removeEventListener("synccomplete" as never, this.heard);
      h.chunk.removeText(t);
      this.chunkOf.delete(t);
      if (this.counted.has(t)) {
        this.counted.delete(t);
        this.waiting.set(h.chunk, (this.waiting.get(h.chunk) ?? 1) - 1);
      }
      t.dispose();
    }
    const left = (this.count.get(h.chunk) ?? 0) - h.members.length;
    this.count.set(h.chunk, left);
    this.held.delete(key);
    // (a chunk left empty goes: a page set again whole would otherwise leave one more behind each time - else packed again without it)
    if (left <= 0) this.dropChunk(h.chunk);
    else this.packWhenSet(h.chunk);
  }

  /** Every label but those in `keep` no longer drawn. */
  keepOnly(keep: ReadonlySet<string>): void {
    for (const key of [...this.held.keys()]) if (!keep.has(key)) this.drop(key);
  }

  /** The label `key` as opaque as `level`, its members' letters (a fade out, label by label). */
  fadeKey(key: string, level: number): void {
    const h = this.held.get(key);
    if (h) for (const t of h.members) fadeLetters(t, level);
  }

  /** Every member, for a fade to go over. */
  *members(): Generator<Text> {
    for (const h of this.held.values()) yield* h.members;
  }

  /** How many labels, members and draw calls (chunks with any member) it holds. */
  sizes(): { labels: number; members: number; chunks: number } {
    let members = 0;
    for (const h of this.held.values()) members += h.members.length;
    return { labels: this.held.size, members, chunks: this.chunks.filter((c) => (this.count.get(c) ?? 0) > 0).length };
  }

  /**
   * Whether any member's letters are still to be set. (Its members' alone: a
   * chunk has no letters of its own to set, so its own flag says nothing of
   * them - a label typed, asked by it, waited for its fallback, half a
   * second.)
   */
  setting(): boolean {
    if (this.toPack.size || this.packing.size) return true;
    for (const t of this.members()) if (t._needsSync || t._isSyncing) return true;
    return false;
  }

  /** Letters set - a member's, or a chunk's packed: `heard` told (it may be told more than once), shown or not. */
  onSynced(heard: () => void): () => void {
    this.listeners.add(heard);
    return () => void this.listeners.delete(heard);
  }

  dispose(): void {
    for (const key of [...this.held.keys()]) this.drop(key);
    for (const c of [...this.chunks]) this.dropChunk(c);
  }

  /** A chunk no longer drawn: out of the page, and let go. */
  private dropChunk(c: BatchedText): void {
    c.removeEventListener("synccomplete" as never, this.packed);
    c.removeEventListener("syncstart" as never, this.packStarted);
    this.toPack.delete(c);
    this.packing.delete(c);
    this.waiting.delete(c);
    this.root.remove(c);
    c.dispose();
    this.chunks.splice(this.chunks.indexOf(c), 1);
    this.count.delete(c);
  }

  /** A chunk with room for `n` more members: the first that has it, or a new one. */
  private chunkFor(n: number): BatchedText {
    const room = this.chunks.find((c) => (this.count.get(c) ?? 0) + n <= BATCH_MOST);
    if (room) return room;
    const c = new PageBatch();
    c.addEventListener("synccomplete" as never, this.packed);
    c.addEventListener("syncstart" as never, this.packStarted);
    c.renderOrder = this.renderOrder;
    c.frustumCulled = false;
    const m = c.material as THREE.MeshBasicMaterial;
    m.toneMapped = false;
    m.depthTest = false;
    m.depthWrite = false;
    this.chunks.push(c);
    this.count.set(c, 0);
    this.root.add(c);
    return c;
  }
}

/** A member of the batch set as a run of a label has it: its letters, size, colour, place - leaning, or bold. */
function dress(t: Text, run: BatchRun, opacity: number): void {
  t.text = run.text;
  t.fontSize = run.size;
  t.color = run.color;
  t.fillOpacity = opacity;
  // (no stroke: its opacity set, not left unset - packed as NaN)
  t.strokeOpacity = 1;
  t.outlineWidth = run.bold ? BOLD : 0;
  if (run.bold) {
    t.outlineColor = run.color;
    t.outlineOpacity = opacity;
  }
  if (run.italic) {
    // (leaning about its baseline: a matrix of its own, as the batch draws each member by its matrix)
    t.matrixAutoUpdate = false;
    t.matrix.set(1, ITALIC_SLANT, 0, run.x, 0, 1, 0, run.y, 0, 0, 1, 0, 0, 0, 0, 1);
  } else {
    t.matrixAutoUpdate = true;
    t.position.set(run.x, run.y, 0);
    t.updateMatrix();
  }
}
