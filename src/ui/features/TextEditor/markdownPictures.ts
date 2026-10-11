/**
 * A Markdown text's rows drawn, as the column shows them (docs/PDF.md,
 * *Markdown*): each row a picture, drawn by the canvas in the system's
 * type - IBM Plex - at the screen's resolution, what lies under its words
 * first, then its words, then its marks. Kept, by what a row shows, until
 * it has not been drawn for a while; a row wider than WebGL takes drawn in
 * bands, as a long line is (./linePictures).
 */
import * as THREE from "three";
import type { Deco, Row } from "./markdownLayout";
import { COLOURS } from "./markdownLayout";
import { fontCss, measureText } from "./markdownType";
import { BAND_PX } from "./linePictures";

type Picture = { texture: THREE.CanvasTexture; w: number; h: number };
const pictures = new Map<string, Picture>();
const MOST_PICTURES = 400;
const keys = new WeakMap<Row, string>();

/** What a row shows, as one key: its words, how they are set, and what is drawn with them. */
function keyOf(row: Row): string {
  let k = keys.get(row);
  if (k == null) {
    k = JSON.stringify([row.h, row.pieces.map((p) => [p.x, p.y, p.text, fontCss(p.font), p.colour, p.strike ? 1 : 0]), row.decos]);
    keys.set(row, k);
  }
  return k;
}

function drawDeco(c: CanvasRenderingContext2D, d: Deco): void {
  switch (d.kind) {
    case "fill":
      c.fillStyle = d.colour;
      c.fillRect(d.x, d.y, d.w, d.h);
      return;
    case "frame":
      c.strokeStyle = d.colour;
      c.lineWidth = 1;
      c.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
      return;
    case "disc":
    case "ring":
      c.beginPath();
      c.arc(d.x, d.y, d.kind === "ring" ? d.r - 0.5 : d.r, 0, Math.PI * 2);
      if (d.kind === "disc") {
        c.fillStyle = d.colour;
        c.fill();
      } else {
        c.strokeStyle = d.colour;
        c.lineWidth = 1;
        c.stroke();
      }
      return;
    case "square":
      c.fillStyle = d.colour;
      c.fillRect(d.x - d.r, d.y - d.r, 2 * d.r, 2 * d.r);
      return;
    case "check": {
      const r = 3;
      c.beginPath();
      c.roundRect(d.x + 0.5, d.y + 0.5, d.size - 1, d.size - 1, r);
      if (d.checked) {
        c.fillStyle = COLOURS.link;
        c.fill();
        c.strokeStyle = "#ffffff";
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(d.x + d.size * 0.25, d.y + d.size * 0.52);
        c.lineTo(d.x + d.size * 0.43, d.y + d.size * 0.7);
        c.lineTo(d.x + d.size * 0.76, d.y + d.size * 0.32);
        c.stroke();
      } else {
        c.strokeStyle = COLOURS.muted;
        c.lineWidth = 1;
        c.stroke();
      }
      return;
    }
  }
}

/** A band of a row drawn, `width` CSS pixels across in all, at the screen's resolution: none past its right edge. */
export function rowPicture(row: Row, width: number, band: number, dpr: number): Picture | null {
  const left = band * BAND_PX;
  if (left >= width) return null;
  const key = `${dpr}\u0000${width}\u0000${band}\u0000${keyOf(row)}`;
  const had = pictures.get(key);
  if (had) {
    pictures.delete(key);
    pictures.set(key, had);
    return had;
  }
  const canvas = document.createElement("canvas");
  const w = Math.min(BAND_PX, width - left);
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(row.h * dpr));
  const c = canvas.getContext("2d", { alpha: false })!;
  c.fillStyle = COLOURS.paper;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.scale(dpr, dpr);
  c.translate(-left, 0);
  // what lies under its words, its words, and its marks
  for (const d of row.decos) if (d.kind === "fill") drawDeco(c, d);
  c.textBaseline = "alphabetic";
  for (const p of row.pieces) {
    c.font = fontCss(p.font);
    c.fillStyle = p.colour;
    c.fillText(p.text, p.x, p.y);
    if (p.strike) c.fillRect(p.x, p.y - Math.round(p.font.px * 0.3), measureText(p.text, p.font), 1);
  }
  for (const d of row.decos) if (d.kind !== "fill") drawDeco(c, d);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const p = { texture, w: canvas.width / dpr, h: canvas.height / dpr };
  pictures.set(key, p);
  while (pictures.size > MOST_PICTURES) {
    const [k, old] = pictures.entries().next().value!;
    old.texture.dispose();
    pictures.delete(k);
  }
  return p;
}

/** Every row drawn again, once the type has come. */
export function forgetRowPictures(): void {
  for (const p of pictures.values()) p.texture.dispose();
  pictures.clear();
}
