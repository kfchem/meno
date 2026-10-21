/**
 * Atom numbers on a molecule in 3D: each atom's number drawn on its ball
 * (utils/occlusionMaterial), of the kind chosen - its place in the
 * molecule, counted from 1, as calculations and files number it; or its
 * atom-map number, where a reaction's map gives it one. More kinds are
 * added to `ATOM_NUMBER_KINDS`.
 */
import * as THREE from "three";
import type { Molecule3D } from "../store/types";

/** What an atom's number is: its place, counted from 1; its atom-map number. */
export type AtomNumberKind = "order" | "map";

/** A kind of number: its name on a menu, whether a molecule has it, and each atom's (0 for none). */
type NumberKindOf = { kind: AtomNumberKind; name: string; has: (m: Pick<Molecule3D, "atoms">) => boolean; of: (m: Pick<Molecule3D, "atoms">) => Float32Array };

export const ATOM_NUMBER_KINDS: readonly NumberKindOf[] = [
  { kind: "order", name: "Atom order", has: (m) => m.atoms.length > 0, of: (m) => Float32Array.from(m.atoms, (_, i) => i + 1) },
  {
    kind: "map",
    name: "Atom map",
    has: (m) => m.atoms.some((a) => (a.map ?? 0) > 0),
    of: (m) => Float32Array.from(m.atoms, (a) => (a.map && a.map > 0 ? a.map : 0)),
  },
];

/** The numbers a molecule in 3D shows: of what kind, and on which atoms, by index - all of them, unset. */
export type AtomNumbersShown = { kind: AtomNumberKind; atoms?: number[] };

/** Whether each of a molecule's atoms shows its number (1) or not (0). */
export function numbersShownOn(m: Pick<Molecule3D, "atoms" | "atomNumbers">): Uint8Array {
  const out = new Uint8Array(m.atoms.length);
  const s = m.atomNumbers;
  if (!s) return out;
  if (!s.atoms) out.fill(1);
  else for (const i of s.atoms) if (i >= 0 && i < out.length) out[i] = 1;
  return out;
}

/**
 * A molecule's numbers shown on the atoms given too (`show`), or hidden from
 * them - all of its atoms, given none - of the kind it shows, or `kind`
 * where it shows none yet: none shown, unset; all of them, every atom.
 */
export function numbersWith(m: Pick<Molecule3D, "atoms" | "atomNumbers">, atoms: readonly number[] | null, show: boolean, kind: AtomNumberKind = "order"): AtomNumbersShown | undefined {
  const on = numbersShownOn(m);
  const given = atoms ?? m.atoms.map((_, i) => i);
  for (const i of given) if (i >= 0 && i < on.length) on[i] = show ? 1 : 0;
  const shown = [...on.keys()].filter((i) => on[i]);
  if (!shown.length) return undefined;
  const k = m.atomNumbers?.kind ?? kind;
  return shown.length === on.length ? { kind: k } : { kind: k, atoms: shown };
}

/** Each atom's number of the kind given, 0 where it has none; all 0 for a kind not known. */
export function atomNumbersOf(m: Pick<Molecule3D, "atoms">, kind: AtomNumberKind): Float32Array {
  return ATOM_NUMBER_KINDS.find((k) => k.kind === kind)?.of(m) ?? new Float32Array(m.atoms.length);
}

/** The most digits a number on a ball has: past it, none is drawn. */
export const NUMBER_DIGITS_MOST = 4;

/**
 * The digits' picture the balls read their numbers from: 0 to 9, a cell
 * each, `DIGIT_CELL` as wide as it is high, each digit set in the middle
 * of its cell - in white, the shader colouring it.
 */
export const DIGIT_CELL = 0.62;
const CELL_PX = 160;

let atlas: THREE.Texture | null = null;
export function digitAtlas(): THREE.Texture {
  if (atlas) return atlas;
  // (no page to draw it on - a test's: an empty one)
  if (typeof document === "undefined") return new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const canvas = document.createElement("canvas");
  const w = Math.round(CELL_PX * DIGIT_CELL);
  canvas.width = w * 10;
  canvas.height = CELL_PX;
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  const font = `600 ${Math.round(CELL_PX * 0.96)}px "IBM Plex Sans", Arial, sans-serif`;
  const draw = () => {
    const g = canvas.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "#ffffff";
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    // (a digit's height, as the font draws it: set in the middle of its cell)
    const m = g.measureText("0");
    const up = m.actualBoundingBoxAscent;
    const down = m.actualBoundingBoxDescent;
    for (let d = 0; d < 10; d++) g.fillText(String(d), w * d + w / 2, CELL_PX / 2 + (up - down) / 2);
    texture.needsUpdate = true;
  };
  draw();
  void document.fonts?.load(font).then(draw, () => {});
  atlas = texture;
  return texture;
}

/**
 * What draws the numbers on a molecule's balls (utils/occlusionMaterial):
 * whether any is shown, the digits, the screen's pixels to one of the camera's units, the least
 * height a digit is drawn at, in pixels, and the most, in the balls' own
 * units.
 */
export type BallNumberUniforms = {
  shown: { value: number };
  atlas: { value: THREE.Texture | null };
  pxPer: { value: number };
  least: { value: number };
  most: { value: number };
};

/** Under this height a digit would be on the screen, in pixels, a number is not drawn: so that, zoomed out, the hydrogens' go first. */
export const NUMBER_LEAST_PX = 6;

/** Shown on no ball yet. */
export function ballNumberUniforms(): BallNumberUniforms {
  return { shown: { value: 0 }, atlas: { value: null }, pxPer: { value: 1 }, least: { value: NUMBER_LEAST_PX }, most: { value: 1 } };
}

/** An atoms' instanced mesh given where each atom's number goes on its ball, how large, and how far it is shown: x, y and the share (`numberPlaces`), and 0 to 1, for each. */
export function setBallNumberPlaces(geometry: THREE.BufferGeometry, places: Float32Array): void {
  const was = geometry.getAttribute("ballNumberPlace") as THREE.InstancedBufferAttribute | undefined;
  if (was && was.count * 4 === places.length) {
    (was.array as Float32Array).set(places);
    was.needsUpdate = true;
  } else geometry.setAttribute("ballNumberPlace", new THREE.InstancedBufferAttribute(Float32Array.from(places), 4));
}

/** An atoms' instanced mesh given each atom's number (0, none). */
export function setBallNumbers(geometry: THREE.BufferGeometry, numbers: Float32Array): void {
  const was = geometry.getAttribute("ballNumber") as THREE.InstancedBufferAttribute | undefined;
  if (was && was.count === numbers.length && (was.array as Float32Array).every((v, i) => v === numbers[i])) return;
  geometry.setAttribute("ballNumber", new THREE.InstancedBufferAttribute(numbers, 1));
}

/** How high a number's digits stand on its ball, as a share of its radius, how wide all of them may be, and the highest they stand however large the ball, in ångströms. */
export const NUMBER_HEIGHT = 0.78;
export const NUMBER_WIDTH_MOST = 1.5;
export const NUMBER_HEIGHT_MOST_A = 0.95;

/** How many digits a number is written with: 0 where it is none, or past `NUMBER_DIGITS_MOST`. */
export function digitsOf(num: number): number {
  const n = Math.round(num);
  if (n < 1) return 0;
  const d = String(n).length;
  return d <= NUMBER_DIGITS_MOST ? d : 0;
}

/** How high a ball's number is, as a share of its radius: `radiusA` its radius in ångströms. */
export function numberHeight(digits: number, radiusA: number): number {
  return Math.min(NUMBER_HEIGHT, NUMBER_HEIGHT_MOST_A / Math.max(radiusA, 1e-6), NUMBER_WIDTH_MOST / (Math.max(digits, 1) * DIGIT_CELL));
}

/**
 * How many numbers on balls a picture leaves out, as the balls' shader
 * leaves them out (utils/occlusionMaterial, `ballNumberCover`): squeezed to
 * under 0.4 of their size for room on their ball, or standing under three
 * quarters of `least` pixels high - `heights` each a share of its ball's
 * radius, `shares` how much of its size it has room for (`numberPlaces`),
 * `radiiPx` each ball's radius in the picture's pixels; `digits` 0 for none.
 */
export function numbersLeftOut(heights: ArrayLike<number>, shares: ArrayLike<number>, radiiPx: ArrayLike<number>, digits: ArrayLike<number>, least: number): number {
  let n = 0;
  for (let i = 0; i < digits.length; i++) {
    if (!digits[i] || !(radiiPx[i] > 0)) continue;
    if (shares[i] < 0.4 || heights[i] * shares[i] * radiiPx[i] * 0.7 < least * 0.75) n++;
  }
  return n;
}

/** Points across a ball as seen, in its radius's units: a grid over its disc. */
const GRID = 11;
const SAMPLES: [number, number][] = [];
for (let i = 0; i < GRID; i++)
  for (let j = 0; j < GRID; j++) {
    const x = (2 * i) / (GRID - 1) - 1;
    const y = (2 * j) / (GRID - 1) - 1;
    if (x * x + y * y < 0.97) SAMPLES.push([x, y]);
  }

/**
 * Where each atom's number goes on its ball, as seen: in the largest part
 * of it not behind another ball or a stick - its middle, where the ball is seen
 * whole - and how large, as a share of its full size, where that part is
 * too small for it (under 1). `centres` the balls' middles in the camera's
 * space (x, y, z of each, z towards the viewer), `radii` theirs, `heights`
 * each number's height as a share of its radius and `digits` its digits (0,
 * none) - and the sticks between them, where they are drawn; written into
 * `out`, x and y in the ball's radius's units from its middle, and the
 * share, for each.
 */
export function numberPlaces(
  centres: ArrayLike<number>,
  radii: ArrayLike<number>,
  heights: ArrayLike<number>,
  digits: ArrayLike<number>,
  out: Float32Array,
  // (the sticks, between atoms by index, as thick as this - in the same units - that may hide some of a ball too)
  sticks: { bonds: readonly { a1: number; a2: number }[]; r: number } | null = null,
  // (where they were last: each kept there while it still has room - so that none hops about as the molecule turns)
  was: ArrayLike<number> | null = null,
): void {
  const n = radii.length;
  const sr = sticks && sticks.r > 0 ? sticks.r : 0;
  const seen = new Uint8Array(SAMPLES.length);
  for (let i = 0; i < n; i++) {
    out[3 * i] = 0;
    out[3 * i + 1] = 0;
    out[3 * i + 2] = 1;
    const r = radii[i];
    if (!(r > 0) || !digits[i]) continue;
    const [cx, cy, cz] = [centres[3 * i], centres[3 * i + 1], centres[3 * i + 2]];
    const over: number[] = [];
    // (the balls that may hide some of it: those whose discs meet its own, not wholly behind it)
    for (let j = 0; j < n; j++) {
      if (j === i || !(radii[j] > 0)) continue;
      const dx = centres[3 * j] - cx;
      const dy = centres[3 * j + 1] - cy;
      const reach = radii[j] + r;
      if (dx * dx + dy * dy >= reach * reach) continue;
      if (centres[3 * j + 2] + radii[j] <= cz) continue;
      over.push(j);
    }
    // (and the sticks seen across it, not wholly behind it)
    const across: { a: number; b: number }[] = [];
    if (sr > 0)
      for (const { a1: a, a2: b } of sticks!.bonds) {
        if (!(radii[a] >= 0) || !(radii[b] >= 0)) continue;
        if (Math.max(centres[3 * a + 2], centres[3 * b + 2]) + sr <= cz) continue;
        const lo = (k: number) => Math.min(centres[3 * a + k], centres[3 * b + k]) - sr;
        const hi = (k: number) => Math.max(centres[3 * a + k], centres[3 * b + k]) + sr;
        if (lo(0) > cx + r || hi(0) < cx - r || lo(1) > cy + r || hi(1) < cy - r) continue;
        across.push({ a, b });
      }
    if (!over.length && !across.length) continue;
    let any = false;
    SAMPLES.forEach(([qx, qy], k) => {
      const x = cx + qx * r;
      const y = cy + qy * r;
      const z = cz + r * Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
      let hid = false;
      for (const j of over) {
        const dx = x - centres[3 * j];
        const dy = y - centres[3 * j + 1];
        const rj = radii[j];
        const d2 = dx * dx + dy * dy;
        if (d2 >= rj * rj) continue;
        if (centres[3 * j + 2] + Math.sqrt(rj * rj - d2) > z) {
          hid = true;
          break;
        }
      }
      for (const { a, b } of hid ? [] : across) {
        const ax = centres[3 * a];
        const ay = centres[3 * a + 1];
        const ex = centres[3 * b] - ax;
        const ey = centres[3 * b + 1] - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / Math.max(ex * ex + ey * ey, 1e-12)));
        const dx = x - (ax + t * ex);
        const dy = y - (ay + t * ey);
        const d2 = dx * dx + dy * dy;
        if (d2 >= sr * sr) continue;
        const sz = centres[3 * a + 2] + t * (centres[3 * b + 2] - centres[3 * a + 2]);
        if (sz + Math.sqrt(sr * sr - d2) > z) {
          hid = true;
          break;
        }
      }
      seen[k] = hid ? 0 : 1;
      if (!hid) any = true;
    });
    if (!any) {
      out[3 * i + 2] = 0;
      continue;
    }
    // (the room the number wants: half its box's diagonal)
    const h = heights[i];
    const need = Math.hypot(h / 2, (digits[i] * DIGIT_CELL * h) / 2);
    const roomAt = (qx: number, qy: number) => {
      let room = 1 - Math.hypot(qx, qy);
      SAMPLES.forEach(([hx, hy], m) => {
        if (!seen[m]) room = Math.min(room, Math.hypot(qx - hx, qy - hy) - 1 / (GRID - 1));
      });
      return room;
    };
    if (was && was[3 * i + 2] > 0) {
      const [wx, wy] = [was[3 * i], was[3 * i + 1]];
      if (roomAt(wx, wy) >= need) {
        out[3 * i] = wx;
        out[3 * i + 1] = wy;
        continue;
      }
    }
    let best = { x: 0, y: 0, room: -1, from: Infinity };
    SAMPLES.forEach(([qx, qy], k) => {
      if (!seen[k]) return;
      const room = roomAt(qx, qy);
      const from = Math.hypot(qx, qy);
      // (room enough, the nearest the middle; else the most room)
      const enough = room >= need;
      const was = best.room >= need;
      if ((enough && (!was || from < best.from)) || (!enough && !was && room > best.room)) best = { x: qx, y: qy, room, from };
    });
    out[3 * i] = best.x;
    out[3 * i + 1] = best.y;
    out[3 * i + 2] = Math.max(0, Math.min(1, best.room / need));
  }
}
