import * as THREE from "three";
import { BatchedText, Text } from "troika-three-text";
import { createDerivedMaterial } from "troika-three-utils";

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

/** How troika's batch reads a member's colour from its packed hex: as it is, linear - and a 256th short of white. */
export const PACKED_COLOUR = "return mod(floor(vec3(v / 65536.0, v / 256.0, v)), 256.0) / 256.0;";
/** The same hex read as sRGB, the page's colours' own space, and made linear as a colour drawn alone is. */
const SRGB_COLOUR =
  "vec3 c = mod(floor(vec3(v / 65536.0, v / 256.0, v)), 256.0) / 255.0; return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));";

/**
 * troika's batch with its members' colours read as the page's colours are.
 * Its shader read a member's packed sRGB hex as linear, and the page's
 * output then made it sRGB again: #141414 came out #4f4f4f, grey. Its
 * colour reading rewritten (`PACKED_COLOUR` -> `SRGB_COLOUR`), what is drawn
 * is the colour asked for, to the byte, as a text drawn alone draws it.
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
   * `drawn` is asked for a frame each time a member's letters are set, and
   * each time a chunk has set its own: the batch packs its members only as
   * it is drawn, and a canvas drawn on demand draws no frame of itself - a
   * label typed waited half a second for some other frame to be shown.
   */
  constructor(readonly font: string, readonly renderOrder: number, private readonly drawn: () => void = () => {}) {}

  private readonly heard = () => this.drawn();

  /** Whether `key` is drawn from `item` already. */
  has(key: string, item: object): boolean {
    return this.held.get(key)?.item === item;
  }

  /** The label `key` drawn as `runs` (from `item`), as opaque as `opacity`: its members made again, in its chunk. */
  set(key: string, item: object, runs: readonly BatchRun[], opacity: number): void {
    this.drop(key);
    const chunk = this.chunkFor(runs.length);
    const members = runs.map((run) => {
      const t = new Text();
      t.text = run.text;
      t.font = this.font;
      t.fontSize = run.size;
      t.color = run.color;
      t.fillOpacity = opacity;
      // (no stroke: its opacity set, not left unset - packed as NaN)
      t.strokeOpacity = 1;
      t.anchorX = "left";
      t.anchorY = "top-baseline";
      if (run.bold) {
        t.outlineWidth = BOLD;
        t.outlineColor = run.color;
        t.outlineOpacity = opacity;
      }
      if (run.italic) {
        // (leaning about its baseline: a matrix of its own, as the batch draws each member by its matrix)
        t.matrixAutoUpdate = false;
        t.matrix.set(1, ITALIC_SLANT, 0, run.x, 0, 1, 0, run.y, 0, 0, 1, 0, 0, 0, 0, 1);
      } else t.position.set(run.x, run.y, 0);
      t.addEventListener("synccomplete" as never, this.heard);
      chunk.addText(t);
      return t;
    });
    this.count.set(chunk, (this.count.get(chunk) ?? 0) + members.length);
    this.held.set(key, { item, members, chunk });
  }

  /** The label `key` no longer drawn. */
  drop(key: string): void {
    const h = this.held.get(key);
    if (!h) return;
    for (const t of h.members) {
      t.removeEventListener("synccomplete" as never, this.heard);
      h.chunk.removeText(t);
      t.dispose();
    }
    this.count.set(h.chunk, (this.count.get(h.chunk) ?? 0) - h.members.length);
    this.held.delete(key);
  }

  /** Every label but those in `keep` no longer drawn. */
  keepOnly(keep: ReadonlySet<string>): void {
    for (const key of [...this.held.keys()]) if (!keep.has(key)) this.drop(key);
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
   * chunk is a text with none of its own, whose own flag troika never
   * clears - a label typed waited for it until its fallback, half a second.)
   */
  setting(): boolean {
    for (const t of this.members()) if (t._needsSync || t._isSyncing) return true;
    return false;
  }

  /** Each chunk's letters set: `heard` told (it may be told more than once). */
  onSynced(heard: () => void): () => void {
    for (const c of this.chunks) c.addEventListener("synccomplete" as never, heard);
    return () => {
      for (const c of this.chunks) c.removeEventListener("synccomplete" as never, heard);
    };
  }

  dispose(): void {
    for (const key of [...this.held.keys()]) this.drop(key);
    for (const c of this.chunks) {
      c.removeEventListener("synccomplete" as never, this.heard);
      this.root.remove(c);
      c.dispose();
    }
    this.chunks.length = 0;
  }

  /** A chunk with room for `n` more members: the last, or a new one. */
  private chunkFor(n: number): BatchedText {
    const last = this.chunks[this.chunks.length - 1];
    if (last && (this.count.get(last) ?? 0) + n <= BATCH_MOST) return last;
    const c = new PageBatch();
    c.addEventListener("synccomplete" as never, this.heard);
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
