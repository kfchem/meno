/**
 * A figure read (lib/figure/read) as a structure in Meno's own units: its
 * atoms' labels read as a label typed is read, its bonds drawn as long as
 * Meno draws a bond, the page's y turned up as the drawing's is.
 */
import { NOMINAL_BOND_LENGTH } from "../chem/acs";
import { abbreviationStructure, reversedLabel } from "../chem/abbreviations";
import { ELEMENTS } from "../chem/elements";
import { AROMATIC_BOND, kekuleOrders } from "../chem/kekulize";
import { chargeText, implicitHydrogens, mostBonds, type Radical } from "../chem/molecule";
import { isMetal } from "../layout/perceive";
import { bondLength, type FigureRead } from "./read";

/** What a label reads as - an element, with its charge, or a label Meno keeps as a group's name - or null, where it reads as nothing. */
export type LabelReader = (label: string) => { el: string; charge?: number; isotope?: number } | null;

/**
 * A label as drawn, read: as it is, or - drawn on its bond's left, read
 * from the bond outward - turned round (HO as OH, TBSO as OTBS, MeO2C as
 * CO2Me, H2N as NH2), or an HN before a group as NH (BocHN as NHBoc).
 */
export function readDrawnLabel(drawn: string, reads: LabelReader): { el: string; charge?: number; isotope?: number; read: boolean } {
  const tries = [drawn, reversedLabel(drawn)];
  // (a charge written last stays last, turned round or not: H3N+ as NH3+)
  const charged = /^(.+?)(\d*[+-]+\d*)$/.exec(drawn);
  if (charged) tries.push(`${reversedLabel(charged[1])}${charged[2]}`);
  const hn = /^H(\d*)([A-Z][a-z]?)(?=[A-Z(]|$)/.exec(drawn);
  if (hn && hn[2] !== "H") tries.push(`${hn[2]}H${hn[1]}${drawn.slice(hn[0].length)}`);
  for (const t of tries) {
    const r = reads(t);
    if (r) return { ...r, read: true };
  }
  return { el: drawn, read: false };
}

export type StructureAtom = { x: number; y: number; el: string; charge?: number; isotope?: number; radical?: Radical; unsure?: string[] };
export type StructureBond = { a: number; b: number; order: 1 | 2 | 3; stereo?: "up" | "down" | "wavy"; bold?: boolean; unsure?: string[] };

/** How many hydrogens a label as drawn writes on its atom: OH 1, NH2 2, HN 1, N none. */
function drawnHydrogens(label: string): number | null {
  const m = /^(?:H(\d*))?([A-Z][a-z]?)(?:H(\d*))?[+-]*$/.exec(label);
  if (!m) return null;
  const n = (s: string | undefined) => (s == null ? 0 : s === "" ? 1 : Number.parseInt(s));
  return n(m[1]) + n(m[3]);
}

const NAMES = new Map(ELEMENTS.map((e) => [e.symbol, e.name]));
/** The most charge an atom of a structure carries, either way: a C4- or an Sn4+, no more. */
const MOST_CHARGE = 4;

/**
 * The most bonds an atom read as `el` takes, their orders summed, with its
 * charge: an element's (lib/chem/molecule `mostBonds`), or a group's - one
 * bonded by one atom, OMe - what its atom has left past the group's own
 * bonds; null where nothing says (a metal, a label that names no group).
 */
function mostTaken(el: string, charge: number): number | null {
  const element = mostBonds(el, charge);
  if (element != null || NAMES.has(el)) return element;
  const g = abbreviationStructure(el);
  if (!g || g.attach.length !== 1 || g.haptic?.length || g.lends?.some(Boolean)) return null;
  const a = g.atoms[g.attach[0]];
  const most = mostBonds(a.el, (a.charge ?? 0) + charge);
  if (most == null) return null;
  const own = g.bonds.filter((b) => b.a1 === g.attach[0] || b.a2 === g.attach[0]).reduce((t, b) => t + b.order, 0);
  // (its hydrogens where its SMILES says them, in brackets; else as many as its valence leaves, however it is bonded - =NOAc)
  return most - own - (a.hs ?? 0);
}

/** What an atom read as `el` is called, saying it has too many bonds: a carbon, oxygen, "OMe". */
const calledAs = (el: string) => (el === "C" ? "a carbon" : (NAMES.get(el) ?? `"${el}"`));

/** How short a bond's open end may be drawn, for the figure's bond, before it is taken to have been drawn to something not read. */
const SHORT_END = 0.72;

/**
 * How long a bond of a structure read is drawn, in the page's points: the length most of its own bonds are drawn at - those
 * between two corners, where it has two or more, its labels' bonds drawn to a label's middle - and not the figure's, whose
 * other structures may be drawn larger or smaller; with too few bonds to say, the figure's.
 */
export function drawnBond(read: Pick<FigureRead, "atoms" | "bonds" | "bond">): number {
  const bare = (i: number) => !read.atoms[i].label && !read.atoms[i].el;
  const length = (b: FigureRead["bonds"][number]) => Math.hypot(read.atoms[b.a].x - read.atoms[b.b].x, read.atoms[b.a].y - read.atoms[b.b].y);
  const between = read.bonds.filter((b) => bare(b.a) && bare(b.b));
  const lengths = (between.length >= 2 ? between : read.bonds).map(length);
  return (lengths.length >= 2 ? bondLength(lengths) : 0) || read.bond;
}

/**
 * The structure a figure reads as: the page's points made Meno's units,
 * a bond as long as Meno draws one (`drawnBond`), its middle at naught (or `about`); a ring drawn
 * with its circle given its double bonds. An atom whose label writes more
 * or fewer hydrogens than its bonds leave it is unsure, as is a label
 * nothing reads.
 */
export function structureOf(read: FigureRead, reads: LabelReader, about?: { x: number; y: number }): { atoms: StructureAtom[]; bonds: StructureBond[] } {
  const drawn = drawnBond(read);
  const k = drawn ? NOMINAL_BOND_LENGTH / drawn : 1;
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
  // (what its label says, and a charge drawn by it in a ring)
  const charges = labels.map((l, i) => (l?.charge ?? 0) + (read.atoms[i].marked ?? 0));
  // (a radical's dots: one, its unpaired electron; two, a pair - a singlet, as a triplet is drawn the same)
  const radicals = read.atoms.map((a): Radical | undefined => (a.dots === 1 ? "doublet" : a.dots === 2 ? "singlet" : undefined));
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
  // (more bonds than an atom takes - its charge counted, a group's atom past the group's own bonds - said, whatever it is drawn
  // as; and a radical's dots by an atom its bonds leave no unpaired electron, none - a speck, or a letter's round shape - said)
  // (its bonds to metals left out, as the canvas leaves them: a pyridine's N bound to a nickel has its three)
  const unbound = valence.slice();
  read.bonds.forEach((b, i) => {
    if (isMetal(els[b.b])) unbound[b.a] -= orders[i];
    if (isMetal(els[b.a])) unbound[b.b] -= orders[i];
  });
  const tooMany = read.atoms.map((_, i): string | null => {
    const most = mostTaken(els[i], charges[i]);
    if (most == null || unbound[i] < valence[i]) return null;
    if (most < 0 || Math.abs(charges[i]) > MOST_CHARGE) return `A charge of ${chargeText(charges[i])} is more than ${calledAs(els[i])} carries.`;
    if (valence[i] > most) {
      return valence[i] > (mostTaken(els[i], 0) ?? most) ? `More bonds meet here than ${calledAs(els[i])} has.` : `Its charge, ${chargeText(charges[i])}, and its bonds are more than ${calledAs(els[i])} takes.`;
    }
    if (!radicals[i] || valence[i] <= most - (radicals[i] === "doublet" ? 1 : 2)) return null;
    radicals[i] = undefined;
    return `${read.atoms[i].dots === 1 ? "A dot" : "Two dots"} by it, but its bonds leave it no unpaired electron: no radical is read.`;
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
        const left = implicitHydrogens(els[i], valence[i], charges[i], radicals[i]);
        if (left !== drawn) unsure.push(`Drawn as ${as}, but its bonds leave it ${left === 0 ? "no hydrogen" : left === 1 ? "one hydrogen" : `${left} hydrogens`}.`);
      }
    }
    const over = tooMany[i];
    if (over) unsure.push(over);
    const isotope = label && "isotope" in label ? label.isotope : undefined;
    if (radicals[i] === "singlet") unsure.push("Two dots: read as a pair of electrons (a singlet); a triplet is drawn the same.");
    return { x: (a.x - cx) * k, y: -(a.y - cy) * k, el: els[i], ...(charges[i] ? { charge: charges[i] } : {}), ...(isotope ? { isotope } : {}), ...(radicals[i] ? { radical: radicals[i] } : {}), ...(unsure.length ? { unsure } : {}) };
  });
  // a hashed bond whose narrow end is not drawn: at the end that can be a
  // stereocentre - an atom of four bonds, its hydrogens counted, none of them
  // double - where only one can; said, where both can or neither
  const centre = (i: number) => !double[i] && degree[i] >= 3 && degree[i] + implicitHydrogens(els[i], valence[i], charges[i], radicals[i]) === 4;
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
  // a stereocentre whose configuration the figure does not show - no wedge or hash narrow at it, as a cage drawn in
  // perspective has none - is unsure: none is read, none guessed
  const shown = new Set(bonds.filter((b) => b.stereo === "up" || b.stereo === "down").map((b) => b.a));
  const wavy = new Set(bonds.filter((b) => b.stereo === "wavy").flatMap((b) => [b.a, b.b]));
  const around: number[][] = atoms.map(() => []);
  bonds.forEach((b) => {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  });
  // (an H drawn as an atom of its own, at the end of a bond, counted with its atom's hydrogens - an O's drawn apart from it, as its OH)
  const lone = (n: number) => els[n] === "H" && around[n].length === 1;
  const hs = atoms.map((_, i) => implicitHydrogens(els[i], valence[i], charges[i], radicals[i]) + around[i].filter(lone).length);
  const kinds = atomKinds(atoms, bonds, hs, lone);
  atoms.forEach((a, i) => {
    // (as Meno takes a stereocentre - lib/layout/drawn readStereo - any atom of four groups, a P=O's or an S=O's too, but a metal's)
    if (isMetal(els[i]) || shown.has(i) || wavy.has(i)) return;
    // (four groups, each other than the rest: its hydrogens one group at most)
    const groups = around[i].filter((n) => !lone(n)).map((n) => kinds[n]);
    if (hs[i] > 1 || new Set(groups).size !== groups.length || groups.length + hs[i] !== 4) return;
    (a.unsure ??= []).push("A stereocentre whose configuration is not drawn: none is read.");
  });
  // a bond's open end - an atom of one bond, with no label - drawn short, as a bond to a label is: a letter there not read (an
  // I, set alone), or a wavy line across it, the point a group is attached at - never a methyl, sure
  read.atoms.forEach((a, i) => {
    if (a.label || a.el || degree[i] !== 1) return;
    const b = read.bonds.find((x) => x.a === i || x.b === i)!;
    const other = read.atoms[b.a === i ? b.b : b.a];
    if (read.bond && Math.hypot(a.x - other.x, a.y - other.y) < SHORT_END * read.bond) (atoms[i].unsure ??= []).push("Its bond is drawn short, as one to a label is, but no label is read at its end.");
  });
  return { atoms, bonds };
}

/**
 * Which atoms are alike where they stand in the structure, as a number for
 * each: their element, charge, isotope, hydrogens (an H drawn apart, `lone`,
 * counted with them) and bonds, and then their
 * neighbours' alike, round by round until no more are told apart - two
 * atoms placed alike in the structure, as a ring's on either side of a
 * group, alike.
 */
function atomKinds(atoms: readonly StructureAtom[], bonds: readonly StructureBond[], hs: readonly number[], lone: (i: number) => boolean): number[] {
  const around: { n: number; order: number }[][] = atoms.map(() => []);
  bonds.forEach((b) => {
    if (lone(b.a) || lone(b.b)) return;
    around[b.a].push({ n: b.b, order: b.order });
    around[b.b].push({ n: b.a, order: b.order });
  });
  const number = (keys: string[]) => {
    const order = [...new Set(keys)].sort();
    return keys.map((k) => order.indexOf(k));
  };
  let kinds = number(atoms.map((a, i) => [a.el, a.charge ?? 0, a.isotope ?? 0, a.radical ?? "", hs[i], around[i].map((x) => x.order).sort().join(".")].join("|")));
  for (let round = 0; round < atoms.length; round++) {
    const next = number(kinds.map((k, i) => `${k}:${around[i].map((x) => `${x.order}-${kinds[x.n]}`).sort().join(",")}`));
    if (new Set(next).size === new Set(kinds).size) break;
    kinds = next;
  }
  return kinds;
}
