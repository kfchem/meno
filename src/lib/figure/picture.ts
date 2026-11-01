/**
 * A picture read by the plugin that reads structures from pictures
 * (lib/roles/client `read_picture`; docs/PDF.md, *Stage 5*) and laid on the
 * picture (./inkFit), as a figure read from a PDF's lines is (./read): its
 * atoms where the picture has them, in its pixels; its bonds as long as most
 * are drawn there; and what is unsure, said in words, not as a number. What
 * the plugin answered is taken as data: what is not as the contract says is
 * left out.
 */
import { isElementSymbol } from "../roles/molblock";
import type { PictureFitted } from "./inkFit";
import type { FigureRead, ReadAtom, ReadBond } from "./read";

/** What is said of an atom or a bond the plugin was unsure of. */
export const UNCLEAR = "Unclear in the picture.";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The structure a picture's reader gave, laid on the picture, as a figure read: none, where it gave no bonds. */
export function pictureFigure(r: PictureFitted): FigureRead | null {
  const given = Array.isArray(r?.atoms) ? r.atoms : [];
  // (each atom where it can be; one that cannot, and its bonds, left out)
  const index = new Map<number, number>();
  const atoms: ReadAtom[] = [];
  given.forEach((a, i) => {
    if (!a || !finite(a.x) || !finite(a.y)) return;
    index.set(i, atoms.length);
    const el = typeof a.el === "string" && isElementSymbol(a.el) ? a.el : null;
    const label = typeof a.label === "string" && a.label.trim() && a.label.length <= 40 ? a.label.trim() : null;
    const charge = el && Number.isInteger(a.charge) && Math.abs(a.charge!) <= 8 && a.charge ? { charge: a.charge } : {};
    atoms.push({ x: a.x, y: a.y, ...(el ? { el, ...charge } : label ? { label } : {}), ...(a.unsure ? { unsure: [UNCLEAR] } : {}) });
  });
  const kept: { b: PictureFitted["bonds"][number]; a: number; c: number }[] = [];
  const seen = new Set<string>();
  for (const b of Array.isArray(r?.bonds) ? r.bonds : []) {
    const a = index.get(b?.a);
    const c = index.get(b?.b);
    if (a == null || c == null || a === c || ![1, 2, 3].includes(b.order)) continue;
    const key = a < c ? `${a}-${c}` : `${c}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ b, a, c });
  }
  const degree = new Map<number, number>();
  for (const { a, c } of kept) for (const i of [a, c]) degree.set(i, (degree.get(i) ?? 0) + 1);
  const bonds: ReadBond[] = kept.map(({ b, a, c }) => {
    const stereo = b.stereo === "up" || b.stereo === "down" ? b.stereo : null;
    // (a wedge narrow where the picture draws it so, `a` its narrow end - seen from the other end, nearer is farther; else narrow where it can be a stereocentre, in the end.
    // An end with no other bond is never a stereocentre: a wedge seen narrow there, the other end bonded on, is taken as one whose narrow end is not seen - a label or a
    // short wide end near it misleading what is measured in the picture)
    const end = b.narrow === "a" ? a : b.narrow === "b" ? c : null;
    const narrow = end != null && !(degree.get(end) === 1 && (degree.get(end === a ? c : a) ?? 0) > 1) ? b.narrow : null;
    const turned = stereo && narrow === "b";
    return {
      a: turned ? c : a,
      b: turned ? a : c,
      order: b.order,
      ...(b.aromatic ? { aromatic: true as const } : {}),
      ...(stereo ? { stereo: turned ? (stereo === "up" ? "down" : "up") : stereo, ...(narrow ? {} : { facing: true as const }) } : {}),
      ...(b.unsure ? { unsure: [UNCLEAR] } : {}),
    };
  });
  if (!bonds.length) return null;
  // (as long as most of its bonds are drawn: the middle length)
  const lengths = bonds.map((b) => Math.hypot(atoms[b.a].x - atoms[b.b].x, atoms[b.a].y - atoms[b.b].y)).sort((p, q) => p - q);
  const bond = lengths[Math.floor(lengths.length / 2)] || 1;
  return { atoms, bonds, bond, left: { letters: [] } };
}

/** A figure read moved and scaled: each place `k` times as far from naught, then moved by `dx`, `dy` - a picture's pixels made a PDF page's points. */
export function scaledFigure(read: FigureRead, k: number, dx: number, dy: number): FigureRead {
  return { ...read, atoms: read.atoms.map((a) => ({ ...a, x: a.x * k + dx, y: a.y * k + dy })), bond: read.bond * k };
}
