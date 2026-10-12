/**
 * A figure read (lib/figure/read) as a structure in Meno's own units: its
 * atoms' labels read as a label typed is read, its bonds drawn as long as
 * Meno draws a bond, the page's y turned up as the drawing's is.
 */
import { NOMINAL_BOND_LENGTH } from "../chem/acs";
import { reversedLabel } from "../chem/abbreviations";
import { AROMATIC_BOND, kekuleOrders } from "../chem/kekulize";
import { implicitHydrogens } from "../chem/molecule";
import type { FigureRead } from "./read";

/** What a label reads as - an element, with its charge, or a label Meno keeps as a group's name - or null, where it reads as nothing. */
export type LabelReader = (label: string) => { el: string; charge?: number } | null;

/**
 * A label as drawn, read: as it is, or - drawn on its bond's left, read
 * from the bond outward - turned round (HO as OH, TBSO as OTBS, MeO2C as
 * CO2Me, H2N as NH2), or an HN before a group as NH (BocHN as NHBoc).
 */
export function readDrawnLabel(drawn: string, reads: LabelReader): { el: string; charge?: number; read: boolean } {
  const tries = [drawn, reversedLabel(drawn)];
  const hn = /^H(\d*)([A-Z][a-z]?)(?=[A-Z(]|$)/.exec(drawn);
  if (hn && hn[2] !== "H") tries.push(`${hn[2]}H${hn[1]}${drawn.slice(hn[0].length)}`);
  for (const t of tries) {
    const r = reads(t);
    if (r) return { ...r, read: true };
  }
  return { el: drawn, read: false };
}

export type StructureAtom = { x: number; y: number; el: string; charge?: number; unsure?: string[] };
export type StructureBond = { a: number; b: number; order: 1 | 2 | 3; stereo?: "up" | "down" | "wavy"; bold?: boolean; unsure?: string[] };

/** How many hydrogens a label as drawn writes on its atom: OH 1, NH2 2, HN 1, N none. */
function drawnHydrogens(label: string): number | null {
  const m = /^(?:H(\d*))?([A-Z][a-z]?)(?:H(\d*))?[+-]*$/.exec(label);
  if (!m) return null;
  const n = (s: string | undefined) => (s == null ? 0 : s === "" ? 1 : Number.parseInt(s));
  return n(m[1]) + n(m[3]);
}

/**
 * The structure a figure reads as: the page's points made Meno's units,
 * a bond as long as Meno draws one, its middle at naught (or `about`); a ring drawn
 * with its circle given its double bonds. An atom whose label writes more
 * or fewer hydrogens than its bonds leave it is unsure, as is a label
 * nothing reads.
 */
export function structureOf(read: FigureRead, reads: LabelReader, about?: { x: number; y: number }): { atoms: StructureAtom[]; bonds: StructureBond[] } {
  const k = read.bond ? NOMINAL_BOND_LENGTH / read.bond : 1;
  const xs = read.atoms.map((a) => a.x);
  const ys = read.atoms.map((a) => a.y);
  // (its middle at naught - or `about`, the middle of the scheme it is in)
  const cx = about?.x ?? (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = about?.y ?? (Math.min(...ys) + Math.max(...ys)) / 2;
  // (a label drawn as shapes that reads as nothing: the next likeliest of its readings that reads)
  const labels = read.atoms.map((a) => {
    if (a.el) return { el: a.el, ...(a.charge ? { charge: a.charge } : {}), read: true };
    if (!a.label) return null;
    const first = readDrawnLabel(a.label, reads);
    if (first.read || !a.alts) return first;
    for (const alt of a.alts) {
      const r = readDrawnLabel(alt, reads);
      if (r.read) return { ...r, as: alt };
    }
    return first;
  });
  const els = labels.map((l) => l?.el ?? "C");
  const charges = labels.map((l) => l?.charge ?? 0);
  // (a ring drawn with its circle: its double bonds as the ring's atoms need them)
  const orders = read.bonds.some((b) => b.aromatic)
    ? kekuleOrders(
        read.atoms.map((a, i) => {
          const l = labels[i];
          const h = a.label && !a.el ? drawnHydrogens(l && "as" in l && l.as ? l.as : a.label) : null;
          return { el: els[i], charge: charges[i], ...(h != null ? { hs: h } : {}) };
        }),
        read.bonds.map((b) => ({ a1: b.a, a2: b.b, order: b.aromatic ? AROMATIC_BOND : b.order })),
      )
    : read.bonds.map((b) => b.order);
  const valence = new Array(read.atoms.length).fill(0);
  const degree = new Array(read.atoms.length).fill(0);
  const double = new Array(read.atoms.length).fill(false);
  read.bonds.forEach((b, i) => {
    for (const end of [b.a, b.b]) {
      valence[end] += orders[i];
      degree[end]++;
      if (orders[i] > 1) double[end] = true;
    }
  });
  const atoms = read.atoms.map((a, i): StructureAtom => {
    const unsure = [...(a.unsure ?? [])];
    const label = labels[i];
    if (a.label && !a.el && label) {
      const as = "as" in label && label.as ? label.as : a.label;
      if (!label.read) unsure.push(`"${a.label}" was not read as an element or a group.`);
      else if (as !== a.label) unsure.splice(0, unsure.length, `Its letters are drawn as shapes: read as "${as}".`);
      const drawn = drawnHydrogens(as);
      if (label.read && drawn != null && els[i] !== "H") {
        const left = implicitHydrogens(els[i], valence[i], charges[i]);
        if (left !== drawn) unsure.push(`Drawn as ${as}, but its bonds leave it ${left === 0 ? "no hydrogen" : left === 1 ? "one hydrogen" : `${left} hydrogens`}.`);
      }
    } else if (els[i] === "C" && valence[i] > 4) {
      unsure.push("More bonds meet here than a carbon has.");
    }
    return { x: (a.x - cx) * k, y: -(a.y - cy) * k, el: els[i], ...(charges[i] ? { charge: charges[i] } : {}), ...(unsure.length ? { unsure } : {}) };
  });
  // a hashed bond whose narrow end is not drawn: at the end that can be a
  // stereocentre - an atom of four bonds, its hydrogens counted, none of them
  // double - where only one can; said, where both can or neither
  const centre = (i: number) => !double[i] && degree[i] >= 3 && degree[i] + implicitHydrogens(els[i], valence[i], charges[i]) === 4;
  const bonds = read.bonds.map((b, i): StructureBond => {
    const out: StructureBond = { a: b.a, b: b.b, order: orders[i], ...(b.stereo ? { stereo: b.stereo } : {}), ...(b.bold ? { bold: true } : {}), ...(b.unsure ? { unsure: [...b.unsure] } : {}) };
    if (b.either) {
      const [ca, cb] = [centre(b.a), centre(b.b)];
      if (cb && !ca) [out.a, out.b] = [b.b, b.a];
      else if (ca === cb) (out.unsure ??= []).push("Its hashes are even: which end is the stereocentre is not drawn.");
    }
    // a wedge or hash of which only the nearer end is known: narrow at the
    // end that can be a stereocentre - a wedge up from it, or a hash down
    // from the other - as it is given where both can or neither
    if (b.facing && (b.stereo === "up" || b.stereo === "down") && centre(b.b) && !centre(b.a)) {
      [out.a, out.b] = [b.b, b.a];
      out.stereo = b.stereo === "up" ? "down" : "up";
    }
    return out;
  });
  return { atoms, bonds };
}
