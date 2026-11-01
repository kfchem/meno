/**
 * A picture read by the plugin that reads structures from pictures, laid on
 * the picture (lib/roles/client `read_picture`; docs/PDF.md, *A picture
 * read*): Meno's one step after any such plugin, whichever model read it.
 *
 * - **Where the atoms lie.** A model gives its atoms' places across the
 *   picture as it cropped it, or across the structure itself, each way, as
 *   it learnt from both. Meno stretches and moves them, each way, until the
 *   bonds lie on the picture's lines and the atoms on what is drawn.
 * - **Which end of a wedge is drawn narrow.** A model says only which end
 *   of a wedge or a hash lies nearer; Meno looks at how far the ink reaches
 *   to each side of the bond near each end.
 * - **What is unsure.** What the model reports less confidence in than its
 *   plugin declares for it (the role's `unsure`), an isotope - seldom drawn,
 *   so likely misread - and an atom the model gives no symbol, taken as a
 *   carbon.
 *
 * The numbers below are as they were set on pictures made for the purpose;
 * each says what it does.
 */
import type { PictureRead } from "../roles/client";

/** A picture's pixels: its width and height, and each pixel's red, green, blue and alpha, row by row from the top left, laid on white. */
export type Pixels = { width: number; height: number; data: ArrayLike<number> };

/**
 * A picture read, laid on the picture: its atoms where the picture has them,
 * in its pixels from its top left; its bonds, a wedge or a hash with which
 * end lies nearer (`up`: `b` nearer than `a`) and, where the picture shows
 * it, which end is drawn narrow; and what is unsure, by no number.
 */
export type PictureFitted = {
  atoms: { x: number; y: number; el?: string; charge?: number; label?: string; unsure?: true }[];
  bonds: { a: number; b: number; order: 1 | 2 | 3; aromatic?: true; stereo?: "up" | "down"; narrow?: "a" | "b"; unsure?: true }[];
};

/** A pixel is drawn - a line's - where its red, green and blue come to less than three times this. */
const DARK_BELOW = 160;
/** A pixel has any ink at all - a hash's faint lines in a blurred picture - below this. */
const INK_BELOW = 210;
/** How far from the ink a point is counted, in pixels, at most: one off the picture counts as this far. */
const FAR_MOST = 20;
/** Where along each bond it is looked for on the ink, from one end to the other. */
const ALONG = linspace(0.3, 0.7, 7);
/** How far in from the ink's edges the structure's extent may lie - none, or a label's room - each tried. */
const INSETS = [0, 0.04, 0.08];
/** The first step each way, a share of the scale; how many rounds at most; and the smallest step, in pixels, before it stops. */
const STEP = 0.04;
const ROUNDS = 80;
const STEP_LEAST = 0.05;
/** A wedge shorter than this, in pixels, is not looked at for its narrow end. */
const WEDGE_LEAST = 6;
/** How far to each side of a wedge the ink is followed, a share of its length. */
const REACH = 0.15;
/** A wedge narrower than this at its wider end, in pixels, or with its ends closer than this share of it, is not told. */
const WIDE_LEAST = 1.5;
const DIFFER_LEAST = 0.25;

/** `n` numbers from `a` to `b`, evenly, as numpy's linspace makes them. */
function linspace(a: number, b: number, n: number): number[] {
  const step = (b - a) / (n - 1);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? b : i * step + a));
}

/** A number rounded to the nearest whole one, a half to the even one, as numpy rounds. */
function roundEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Each pixel's being drawn - its red, green and blue under three times `below` - row by row. */
export function maskOf(p: Pixels, below: number): Uint8Array {
  const out = new Uint8Array(p.width * p.height);
  for (let i = 0; i < out.length; i++) out[i] = p.data[4 * i] + p.data[4 * i + 1] + p.data[4 * i + 2] < 3 * below ? 1 : 0;
  return out;
}

/** The squared distances along one line of numbers to the nearest naught (Felzenszwalb and Huttenlocher's lower envelope of parabolas). */
function envelope(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    if (f[q] === Infinity) continue;
    if (f[v[0]] === Infinity) {
      v[0] = q;
      continue;
    }
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  if (f[v[0]] === Infinity) {
    d.fill(Infinity, 0, n);
    return;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** How far each pixel is from the nearest drawn one, in pixels - naught on one - exactly, each way along the rows and then the columns. */
export function distances(mask: Uint8Array, width: number, height: number): Float64Array {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const sq = new Float64Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = mask[y * width + x] ? 0 : Infinity;
    envelope(f, height, d, v, z);
    for (let y = 0; y < height; y++) sq[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = sq[y * width + x];
    envelope(f, width, d, v, z);
    for (let x = 0; x < width; x++) sq[y * width + x] = Math.sqrt(d[x]);
  }
  return sq;
}

/**
 * Where the atoms lie in the picture, in its pixels: the model's places -
 * across the picture as it cropped it (`pad`, the white it keeps round what
 * is drawn), or across the structure itself, each way - stretched and moved,
 * each way, until its bonds lie on the picture's lines and its atoms on what
 * is drawn. As they are, where nothing is drawn.
 */
export function placesOnInk(dark: Uint8Array, width: number, height: number, xy: readonly [number, number][], bonds: readonly [number, number][], pad?: number): [number, number][] {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (dark[y * width + x]) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
  if (left === Infinity || !xy.length) return xy.map(([x, y]) => [x, y]);
  const far = distances(dark, width, height);
  const count = bonds.length * ALONG.length + xy.length;
  const px = new Float64Array(count);
  const py = new Float64Array(count);
  // (how far from the ink the bonds' middles and the atoms lie, on average, the places scaled and moved by m: x by m[0] then m[1], y by m[2] then m[3])
  const off = (m: readonly number[]) => {
    const qx = xy.map(([x]) => x * m[0] + m[1]);
    const qy = xy.map(([, y]) => y * m[2] + m[3]);
    let k = 0;
    for (const [a, b] of bonds)
      for (const t of ALONG) {
        px[k] = qx[a] * (1 - t) + qx[b] * t;
        py[k++] = qy[a] * (1 - t) + qy[b] * t;
      }
    for (let i = 0; i < xy.length; i++) {
      px[k] = qx[i];
      py[k++] = qy[i];
    }
    let sum = 0;
    for (let i = 0; i < count; i++) {
      if (px[i] < 0 || px[i] >= width || py[i] < 0 || py[i] >= height) {
        sum += FAR_MOST;
        continue;
      }
      const xi = Math.min(Math.max(roundEven(px[i]), 0), width - 1);
      const yi = Math.min(Math.max(roundEven(py[i]), 0), height - 1);
      sum += Math.min(far[yi * width + xi], FAR_MOST);
    }
    return sum / count;
  };
  const xs = xy.map(([x]) => x);
  const ys = xy.map(([, y]) => y);
  const span = (v: number[]) => Math.max(Math.max(...v) - Math.min(...v), 1e-6);
  const cw = right - left;
  const ch = bottom - top;
  // (as the model cropped the picture; and the structure's extent over the ink's, a label's room in from its edges or not)
  const starts: number[][] = pad != null ? [[cw + 2 * pad, left - pad, ch + 2 * pad, top - pad]] : [];
  for (const inset of INSETS) {
    const sx = (cw * (1 - 2 * inset)) / span(xs);
    const sy = (ch * (1 - 2 * inset)) / span(ys);
    starts.push([sx, left + cw * inset - Math.min(...xs) * sx, sy, top + ch * inset - Math.min(...ys) * sy]);
  }
  let m = starts[0];
  let best = off(m);
  for (const s of starts.slice(1)) {
    const c = off(s);
    if (c < best) {
      m = s;
      best = c;
    }
  }
  const middle = [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
  let step = [Math.abs(m[0]), Math.abs(m[0]), Math.abs(m[2]), Math.abs(m[2])].map((v) => STEP * v);
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false;
    for (let i = 0; i < 4; i++)
      for (const sign of [1, -1]) {
        const n = [...m];
        n[i] += sign * step[i];
        // (stretched about the structure's middle)
        if (i === 0 || i === 2) n[i + 1] -= sign * step[i] * middle[i / 2];
        const c = off(n);
        if (c < best - 1e-9) {
          m = n;
          best = c;
          moved = true;
        }
      }
    if (!moved) {
      step = step.map((v) => v / 2);
      if (Math.max(...step) < STEP_LEAST) break;
    }
  }
  return xy.map(([x, y]) => [x * m[0] + m[1], y * m[2] + m[3]]);
}

/**
 * Which end of a wedge or a hash from `pa` to `pb` the picture draws narrow
 * - "a" or "b" - by how far its ink reaches to each side of the bond, near
 * each end but clear of the atoms; none where the two are too alike to tell.
 */
export function narrowEnd(ink: Uint8Array, width: number, height: number, pa: readonly [number, number], pb: readonly [number, number]): "a" | "b" | null {
  const length = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  if (length < WEDGE_LEAST) return null;
  const u = [(pb[0] - pa[0]) / length, (pb[1] - pa[1]) / length];
  const n = [-u[1], u[0]];
  const reach: number[] = [];
  for (let r = 0; r < REACH * length; r += 0.5) reach.push(reach.length * 0.5);
  const across = (cx: number, cy: number) => {
    let out = 0;
    for (const side of [1, -1]) {
      let most = -1;
      for (const r of reach) {
        const xi = roundEven(cx + side * r * n[0]);
        const yi = roundEven(cy + side * r * n[1]);
        if (xi >= 0 && xi < width && yi >= 0 && yi < height && ink[yi * width + xi]) most = Math.max(most, r);
      }
      out += most >= 0 ? most : 0;
    }
    return out;
  };
  // (the widest within a short stretch of the bond: a hash's strokes have gaps between them)
  const widthAt = (t: number) => Math.max(...linspace(-0.04, 0.04, 9).map((s) => across(pa[0] + (pb[0] - pa[0]) * (t + s), pa[1] + (pb[1] - pa[1]) * (t + s))));
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const nearA = mean(linspace(0.27, 0.43, 5).map(widthAt));
  const nearB = mean(linspace(0.57, 0.73, 5).map(widthAt));
  const wider = Math.max(nearA, nearB);
  if (wider < WIDE_LEAST || Math.abs(nearA - nearB) < DIFFER_LEAST * wider) return null;
  return nearA < nearB ? "a" : "b";
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A picture's reading laid on the picture - its atoms where the picture has
 * them, a wedge's narrow end where the ink shows it - and what is unsure
 * said: below `unsureBelow` of the model's confidence, where its plugin
 * declares one; an isotope; an atom with no symbol, a carbon. What is not
 * as the contract says is left as it is, for `pictureFigure` to leave out.
 */
export function fitToPicture(read: PictureRead, pixels: Pixels, unsureBelow?: number): PictureFitted {
  const given = Array.isArray(read?.atoms) ? read.atoms : [];
  const bonds = Array.isArray(read?.bonds) ? read.bonds : [];
  const placed = given.every((a) => a && finite(a.x) && finite(a.y));
  const ends = bonds.filter((b) => b && Number.isInteger(b.a) && Number.isInteger(b.b) && b.a >= 0 && b.b >= 0 && b.a < given.length && b.b < given.length);
  const pad = finite(read?.pad) && read.pad >= 0 ? read.pad : undefined;
  const { width, height } = pixels;
  const xy =
    placed && ends.length && width > 0 && height > 0
      ? placesOnInk(maskOf(pixels, DARK_BELOW), width, height, given.map((a) => [a.x, a.y] as [number, number]), ends.map((b) => [b.a, b.b] as [number, number]), pad)
      : given.map((a) => [a?.x, a?.y] as [number, number]);
  const unsure = (c: unknown) => unsureBelow != null && finite(c) && c < unsureBelow;
  const atoms: PictureFitted["atoms"] = given.map((a, i) => {
    if (!a) return a;
    const { confidence, isotope, ...rest } = a;
    const [x, y] = xy[i];
    const symbol = rest.el != null || rest.label != null;
    return {
      ...rest,
      x,
      y,
      ...(symbol ? {} : { el: "C" }),
      ...(unsure(confidence) || isotope != null || !symbol ? { unsure: true as const } : {}),
    };
  });
  const ink = bonds.some((b) => b?.stereo) && width > 0 && height > 0 ? maskOf(pixels, INK_BELOW) : null;
  const out: PictureFitted["bonds"] = bonds.map((b) => {
    if (!b) return b;
    const { confidence, ...rest } = b;
    const narrow = ink && rest.stereo && ends.includes(b) && placed ? narrowEnd(ink, width, height, xy[b.a], xy[b.b]) : null;
    return { ...rest, ...(narrow ? { narrow } : {}), ...(unsure(confidence) ? { unsure: true as const } : {}) };
  });
  return { atoms, bonds: out };
}
