/**
 * Writing by hand as a workspace's file and Meno's own record of a copy
 * keep it (docs/PRESENTING.md, *Handwriting*): each piece as far as it
 * reads - its pen, its width, its colour, and the strokes whose points read,
 * three numbers to a point.
 */
import type { Ink } from "../store/types";
import { leftOut } from "./readNotes";

const COLOUR = /^#[0-9a-f]{6}$/i;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A piece of writing's look and strokes, where they read; null where it has no stroke that does. */
export function readInkPiece(raw: unknown): Omit<Ink, "id"> | null {
  const k = raw as Partial<Record<keyof Ink, unknown>> | null;
  if (!k || (k.pen !== "pen" && k.pen !== "marker") || !Array.isArray(k.strokes)) return null;
  const strokes = (k.strokes as { points?: unknown; pressure?: unknown }[]).flatMap((s) =>
    s && Array.isArray(s.points) && s.points.length >= 3 && s.points.length % 3 === 0 && s.points.every(isNum) ? [{ points: s.points as number[], ...(s.pressure === true ? { pressure: true as const } : {}) }] : [],
  );
  if (!strokes.length) return null;
  // (a piece that reads, but for some of its strokes: those said)
  leftOut("stroke", k.strokes.length - strokes.length);
  return {
    pen: k.pen,
    width: k.width === 0 || k.width === 2 ? k.width : 1,
    ...(typeof k.color === "string" && COLOUR.test(k.color) ? { color: k.color.toLowerCase() } : {}),
    strokes,
  };
}
