/**
 * The pictures drawn of PDFs' pages (docs/PDF.md, *Quick, then sharp*),
 * kept while the canvas is, for the stacks on the page and the column
 * alike: a small picture of each page, shown at once, and tiles of the
 * parts in view at the screen's resolution, asked for once the view is
 * still, nearest first, each fading in over what was there. PDFium draws
 * them, in a process of its own (lib/pdf/reader).
 *
 * A page is drawn the same wherever it is: its white sheet, its picture,
 * its tiles over it, its edge a hairline; lifted, a little larger, with a
 * soft shadow under it.
 */
import * as THREE from "three";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { drawPart, type DrawnPart } from "../../../../lib/pdf/reader";
import type { Sheet } from "../../../../lib/pdf/layout";
import { INK_WIDTHS_PT, inkColour, markerColour } from "../../../../lib/chem/ink";
import { setInUse } from "../../../../lib/chem/palette";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { PdfInk } from "../store/types";
import { pageInkLook, strokesGeometry } from "./inkGeometry";

/** Meno's hairline and its grey (App.css: --color-gh-line, --color-gh-gray, --color-gh-base). */
export const LINE = "#d1d9e0";
export const GRAY = "#59636e";
export const BASE = "#f6f8fa";

/** A tile's side, in pixels. */
export const TILE = 1024;
/** A page's first picture: this many pixels across, whatever its size. */
export const PREVIEW_PX = 360;
/** How long a picture takes to fade in, in ms. */
export const FADE_MS = 160;
/** How long a tile no longer wanted is kept before it is let go, in ms. */
const KEEP_MS = 4000;
/** How many tiles of other levels a page keeps under its level's own while those come: a screen's worth, and more. */
export const UNDER_MOST = 24;

/** Marks on a page: boxes, in points from its top left, in a colour - words selected, or found. */
export type Mark = { rects: readonly (readonly [number, number, number, number])[]; color: string; opacity: number; edge?: boolean; ring?: boolean };

/** A picture of a page or a part of one, as WebGL has it, and when it came. */
export type Pic = { tex: THREE.Texture; born: number };
/** A tile had: its key, its picture, where it lies among the page's tiles, and the level - pixels a point - it was drawn at; `under`, one of another level kept under the level's own until they have come. */
export type Tile = { key: string; pic: Pic; i: number; j: number; level: number; under?: true };

function textureOf(d: DrawnPart, mip: boolean): THREE.Texture {
  const tex = new THREE.Texture(d.bitmap);
  // (taken apart upside down already: lib/pdf/reader)
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = mip;
  tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The level a page is drawn at, `want` pixels a point wanted of a page
 * `width` points wide: none, where its small picture is enough; else the
 * first of the levels a half power of two apart (1, 1.41, 2, 2.83, 4...)
 * at or above it - never more than 1.41 times the pixels a side wanted, so
 * that a zoom stopped at asks for no more tiles than it must, and a zoom in
 * a little way stays sharp with the tiles it has.
 */
export function levelFor(want: number, width: number): number {
  if (want <= (PREVIEW_PX / width) * 1.15) return 0;
  const k = Math.ceil(2 * Math.log2(want) - 1e-9);
  return Math.min(32, Math.pow(2, k / 2));
}

/** What is asked of a page's tiles: the PDF, the page and its size in points, the level, and the part wanted, in points from its top left. */
export type TileAsk = {
  sha256: string;
  page: number;
  size: readonly [number, number];
  level: number;
  part: { x0: number; y0: number; x1: number; y1: number };
  /** How near the middle of what is seen a tile is, smaller first. */
  nearness: (i: number, j: number) => number;
  /** Since when what asks has been still: a tile not wanted since is dropped before its turn. */
  stillSince: () => number;
  /** Asked ahead - where the view is going, past what is seen - rather than for what is seen. */
  ahead?: true;
};

/** The pictures of the PDFs' pages: previews by page, tiles by level and place; those it is told have come are said to whoever listens. */
export class Pictures {
  previews = new Map<string, Pic | "asked">();
  tiles = new Map<string, Pic | "asked">();
  /** When each tile was last wanted, so that those long unwanted are let go. */
  wanted = new Map<string, number>();
  /** The tiles the column draws now: kept, however long since they were asked for (the column asks only as it moves). */
  held = new Set<string>();
  /** The part of each page last asked for as seen, by PDF and page: its level, and its pixels at it. */
  seen = new Map<string, { level: number; x0: number; y0: number; x1: number; y1: number }>();
  private listeners = new Set<() => void>();

  listen(f: () => void): () => void {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  }

  private came(): void {
    for (const f of this.listeners) f();
  }

  /** A page's preview, asked for the first time it is wanted. */
  preview(p: { sha256: string; pages: readonly (readonly [number, number])[] }, page: number): Pic | null {
    const key = `${p.sha256}:${page}`;
    const had = this.previews.get(key);
    if (had && had !== "asked") return had;
    if (!had && p.pages[page]) {
      this.previews.set(key, "asked");
      const [w] = p.pages[page];
      void drawPart({ sha256: p.sha256, page, scale: PREVIEW_PX / w }, () => -1)
        .then((d) => {
          if (!d) return void this.previews.delete(key);
          this.previews.set(key, { tex: textureOf(d, true), born: performance.now() });
          this.came();
        })
        .catch(() => this.previews.delete(key));
    }
    return null;
  }

  /** The tiles of a page's part asked for where they are not had, each marked as wanted now; whether any was asked for. */
  ask(a: TileAsk, now: number): boolean {
    const { level, part } = a;
    const [w, h] = a.size;
    const left = Math.max(0, part.x0 * level);
    const right = Math.min(w * level, part.x1 * level);
    const top = Math.max(0, part.y0 * level);
    const bottom = Math.min(h * level, part.y1 * level);
    if (!a.ahead) this.seen.set(`${a.sha256}:${a.page}`, { level, x0: left, y0: top, x1: right, y1: bottom });
    let asked = false;
    for (let j = Math.floor(top / TILE); j * TILE < bottom; j++)
      for (let i = Math.floor(left / TILE); i * TILE < right; i++) {
        const key = `${a.sha256}:${a.page}:${level}:${i}:${j}`;
        this.wanted.set(key, now);
        if (this.tiles.has(key)) continue;
        this.tiles.set(key, "asked");
        asked = true;
        void drawPart(
          { sha256: a.sha256, page: a.page, scale: level, x: i * TILE, y: j * TILE, w: TILE, h: TILE },
          () => a.nearness(i, j),
          () => (this.wanted.get(key) ?? 0) >= a.stillSince(),
        )
          .then((d) => {
            // (dropped, the view having moved on: asked for again where it is still wanted)
            if (!d) {
              this.tiles.delete(key);
              this.came();
              return;
            }
            this.tiles.set(key, { tex: textureOf(d, false), born: performance.now() });
            this.came();
          })
          .catch(() => this.tiles.delete(key));
      }
    // (those of other levels kept under what is seen, as wanted now: kept, even
    // where the view stood still a long while before - long since wanted -
    // and has just been zoomed, until the level's own have come)
    if (!a.ahead) this.tilesOf(a.sha256, a.page, level, now);
    return asked;
  }

  /**
   * A page's tiles to draw at a level: those at it, and under them those
   * had at any other - finer or coarser, from before a zoom - where the
   * level's own over the part seen have not all come and faded in over
   * them: what a zoom leaves stays until what replaces it is there, never
   * the page's small picture between (each kept so, as wanted, while it is
   * drawn). The part seen is the one last asked for at that level; what
   * lies outside it is not waited for. At most `UNDER_MOST` are kept under,
   * those of the levels nearest first.
   */
  tilesOf(sha256: string, page: number, level: number, now = performance.now()): Tile[] {
    const out: Tile[] = [];
    if (!level) return out;
    const prefix = `${sha256}:${page}:`;
    const others: Tile[] = [];
    for (const [key, t] of this.tiles) {
      if (t === "asked" || !key.startsWith(prefix)) continue;
      const [l, i, j] = key.slice(prefix.length).split(":").map(Number);
      (l === level ? out : others).push({ key, pic: t, i, j, level: l });
    }
    // (the level's own tile over a part come and faded in - or a part not seen, which is not waited for)
    const seen = this.seen.get(`${sha256}:${page}`);
    const look = seen && seen.level === level ? seen : null;
    const done = (i: number, j: number) => {
      if (look && ((i + 1) * TILE <= look.x0 || i * TILE >= look.x1 || (j + 1) * TILE <= look.y0 || j * TILE >= look.y1)) return true;
      const t = this.tiles.get(`${prefix}${level}:${i}:${j}`);
      return !!t && t !== "asked" && now - t.born >= FADE_MS;
    };
    const under = others.filter((o) => {
      const img = o.pic.tex.image as { width: number; height: number };
      // (the part it covers, at the level's pixels)
      const x0 = ((o.i * TILE) / o.level) * level;
      const y0 = ((o.j * TILE) / o.level) * level;
      const x1 = x0 + (img.width / o.level) * level;
      const y1 = y0 + (img.height / o.level) * level;
      for (let j = Math.floor(y0 / TILE); j * TILE < y1 - 0.5; j++) for (let i = Math.floor(x0 / TILE); i * TILE < x1 - 0.5; i++) if (!done(i, j)) return true;
      return false;
    });
    // (the nearest levels' first, as many as are kept)
    under.sort((x, y) => Math.abs(Math.log2(x.level / level)) - Math.abs(Math.log2(y.level / level)));
    under.length = Math.min(under.length, UNDER_MOST);
    for (const o of under) this.wanted.set(o.key, now);
    // (drawn coarsest first, the level's own over all: Page sets them so)
    return [...under.sort((x, y) => x.level - y.level).map((o) => ({ ...o, under: true as const })), ...out];
  }

  /** Whether any picture is still fading in. */
  fading(now: number): boolean {
    for (const t of this.tiles.values()) if (t !== "asked" && now - t.born < FADE_MS + 80) return true;
    for (const t of this.previews.values()) if (t !== "asked" && now - t.born < FADE_MS + 80) return true;
    return false;
  }

  /** Tiles not wanted for a while let go. */
  letGo(now: number): void {
    for (const [key, t] of this.tiles) {
      if (t === "asked" || this.held.has(key) || now - (this.wanted.get(key) ?? 0) < KEEP_MS) continue;
      t.tex.dispose();
      this.tiles.delete(key);
      this.wanted.delete(key);
    }
  }

  dispose(): void {
    for (const p of [...this.previews.values(), ...this.tiles.values()]) if (p !== "asked") p.tex.dispose();
    this.previews.clear();
    this.tiles.clear();
    this.listeners.clear();
  }
}

const PicturesContext = createContext<Pictures | null>(null);

/** The canvas's pictures of PDFs' pages, kept while it is, for what draws them inside it. */
export function PdfPictures({ children }: { children: ReactNode }) {
  const pics = useMemo(() => new Pictures(), []);
  useEffect(() => () => pics.dispose(), [pics]);
  return <PicturesContext.Provider value={pics}>{children}</PicturesContext.Provider>;
}

/** The canvas's pictures of PDFs' pages; drawn again, with `redraw`, as they come. */
export function usePictures(redraw: () => void): Pictures {
  const pics = useContext(PicturesContext);
  if (!pics) throw new Error("usePictures must be used within PdfPictures");
  useEffect(() => pics.listen(redraw), [pics, redraw]);
  return pics;
}

/**
 * A page: its sheet, its preview and the tiles drawn of it; lifted, larger
 * and with its shadow under it. `s` is where it lies, in the units of what
 * it is drawn in, `pt` its size in points, `px` those units a screen's
 * pixel.
 */
export function Page(props: {
  s: Sheet;
  pt: readonly [number, number];
  lift: number;
  z: number;
  opacity?: number;
  now: number;
  px: number;
  preview: Pic | null;
  tiles: Tile[];
  marks?: readonly Mark[];
  /** Writing by hand on it, in its points (docs/PRESENTING.md, *Handwriting*). */
  ink?: readonly PdfInk[];
}) {
  const { s, lift, now, preview, tiles } = props;
  const opacity = props.opacity ?? 1;
  const grow = 1 + 0.04 * lift;
  const left = -s.w / 2;
  const topY = s.h / 2;
  // (the units a point: the sheet's width over the page's)
  const unit = s.w / props.pt[0];
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), []);
  const fade = (born: number) => Math.min(1, (now - born) / FADE_MS) * opacity;
  return (
    <group position={[s.x, s.y + lift * 6 * props.px, props.z]} scale={[grow, grow, 1]}>
      {lift > 0.01 && (
        <mesh position={[8 * props.px * lift, -10 * props.px * lift, -0.005]} scale={[s.w, s.h, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.12 * lift * opacity} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh scale={[s.w, s.h, 1]}>
        <planeGeometry args={[1, 1]} />
        {/* (see-through from the first where it is to fade: a material's being so is set as it is made) */}
        <meshBasicMaterial color="#ffffff" transparent={props.opacity != null} opacity={opacity} toneMapped={false} />
      </mesh>
      {preview && (
        <mesh scale={[s.w, s.h, 1]} position={[0, 0, 0.001]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={preview.tex} transparent opacity={fade(preview.born)} toneMapped={false} />
        </mesh>
      )}
      {tiles.map((t) => {
        const img = t.pic.tex.image as { width: number; height: number };
        const tw = (img.width / t.level) * unit;
        const th = (img.height / t.level) * unit;
        const x = left + ((t.i * TILE) / t.level) * unit + tw / 2;
        const y = topY - ((t.j * TILE) / t.level) * unit - th / 2;
        return (
          // (those kept under, finer over coarser, all under the level's own: below the ink, 0.00245)
          <mesh key={t.key} position={[x, y, t.under ? 0.002 + 0.00004 * Math.min(4, Math.max(0, Math.log2(t.level) + 1)) : 0.0023]} scale={[tw, th, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={t.pic.tex} transparent opacity={fade(t.pic.born)} toneMapped={false} />
          </mesh>
        );
      })}
      {props.marks?.flatMap((m, k) =>
        m.rects.map(([x0, y0, x1, y1], i) =>
          m.ring ? (
            // (a ring round a place: an atom read from a figure there, lit as the drawing lights it)
            <mesh key={`${k}:${i}`} position={[left + ((x0 + x1) / 2) * unit, topY - ((y0 + y1) / 2) * unit, 0.0026]} scale={[((x1 - x0) / 2) * unit, ((x1 - x0) / 2) * unit, 1]}>
              <ringGeometry args={[0.82, 1, 48]} />
              <meshBasicMaterial color={m.color} transparent opacity={m.opacity * opacity} depthWrite={false} toneMapped={false} />
            </mesh>
          ) : (
          <group key={`${k}:${i}`} position={[left + ((x0 + x1) / 2) * unit, topY - ((y0 + y1) / 2) * unit, 0.0025]}>
            <mesh scale={[(x1 - x0) * unit, (y1 - y0) * unit, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial color={m.color} transparent opacity={m.opacity * opacity} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* (a box drawn, outlined) */}
            {m.edge && (
              <lineSegments geometry={edges} scale={[(x1 - x0) * unit, (y1 - y0) * unit, 1]} position={[0, 0, 0.0002]}>
                <lineBasicMaterial color={m.color} transparent opacity={opacity} toneMapped={false} />
              </lineSegments>
            )}
          </group>
          ),
        ),
      )}
      {props.ink?.length ? <PageInk ink={props.ink} left={left} topY={topY} unit={unit} opacity={opacity} /> : null}
      <lineSegments geometry={edges} scale={[s.w, s.h, 1]} position={[0, 0, 0.003]}>
        <lineBasicMaterial color={LINE} transparent opacity={opacity} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** Writing on a page: over its pictures (tiles up to about 0.0024) and under its marks (0.0025, a ring's 0.0026) - each piece in its pen, its points the page's. */
function PageInk({ ink, left, topY, unit, opacity }: { ink: readonly PdfInk[]; left: number; topY: number; unit: number; opacity: number }) {
  const marker = markerColour(setInUse(useAppSettings((s) => s.colours)));
  const pieces = useMemo(
    () =>
      ink.map((k) => {
        const strokes = k.strokes.map((s) => {
          const points = s.points.slice();
          for (let i = 0; i + 1 < points.length; i += 3) {
            points[i] = left + points[i] * unit;
            points[i + 1] = topY - points[i + 1] * unit;
          }
          return { ...s, points };
        });
        return { k, geometry: strokesGeometry(strokes, INK_WIDTHS_PT[k.pen][k.width] * unit, k.pen !== "marker") };
      }),
    [ink, left, topY, unit],
  );
  useEffect(() => () => pieces.forEach((p) => p.geometry.dispose()), [pieces]);
  return (
    <>
      {pieces.map(({ k, geometry }, i) => (
        <mesh key={i} geometry={geometry} position={[0, 0, 0.00245]} frustumCulled={false} raycast={() => {}}>
          <meshBasicMaterial color={inkColour(k, "#000000", marker)} {...pageInkLook(k.pen, opacity)} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}
