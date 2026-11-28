/**
 * A picture of a drawing read by Meno's own figure reader (docs/PDF.md,
 * *A picture traced*): traced (./trace), its shapes laid where the picture
 * lies - on a PDF's page, in points, or in its own pixels - and read as a
 * PDF's figure is read, its letters traced too, or given where a PDF writes
 * them over the picture; ink read as nothing beside the structure said. Pure:
 * the app reads pictures so in a worker, and the round trip in Node.
 */
import type { Box, FigureDrawn, FigureLetter } from "./drawn";
import type { GlyphShape } from "./glyphs";
import type { Pixels } from "./inkFit";
import { labelText, readFigure, wordsOf, type FigureRead } from "./read";
import { LEFT_NEAR, onPage, tracePicture, unreadInk } from "./trace";

/** Where the picture's pixels lie: a pixel is `scale` of the place's units, its top left at `x`, `y` there. */
export type PictureAt = { scale: number; x: number; y: number };

/** Why a picture gave no structure: what to say. */
export type PictureUnread = { none: string };

/**
 * A picture read as a figure, its atoms where it has them in `at`'s units; or why none. `letters`: a PDF's letters over it, in those
 * units - read as written, their ink left out of the tracing; `known`: the system's letters, which its own are matched against;
 * `reads`: whether a label is one the reader reads; `measured`, told how the picture draws it in its pixels (its line, its bond, how
 * much of it is shaded) where it was traced.
 */
export function readTracedPicture(
  pixels: Pixels,
  at: PictureAt,
  known: readonly GlyphShape[],
  reads: (label: string) => boolean,
  letters: readonly FigureLetter[] = [],
  measured?: (m: { line: number; bond: number; shaded: number }) => void,
): FigureRead | PictureUnread {
  // (where the given letters lie, in the picture's pixels)
  const drop = letters.map((l) => [(l.box[0] - at.x) / at.scale, (l.box[1] - at.y) / at.scale, (l.box[2] - at.x) / at.scale, (l.box[3] - at.y) / at.scale] as Box);
  const t = tracePicture(pixels, drop, known);
  if ("none" in t) return t;
  measured?.({ line: t.line, bond: t.bond, shaded: t.shaded });
  const shapes = onPage(t.shapes, at.scale, at.x, at.y);
  const read = readFigure({ paths: [], letters: [...letters], pictures: [] }, reads, known, shapes, true);
  if (!read.atoms.length || !read.bonds.length) return { none: "No structure was found in the picture." };
  // (ink beside the structure read as nothing: the atom nearest it said)
  for (const [i, said] of unreadInk(read, shapes, known)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), said];
  // (a small piece of carbons alone, no label in it: said - a number or a letter traced may read so - never left out)
  for (const { atoms, apart } of tinyPieces(read)) for (const i of atoms) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), apart ? APART_SAID : TINY_SAID];
  // (a carbon between two single bonds in line: a skeleton draws carbons in line only on a triple bond or cumulated double bonds - one
  //  bond traced broken in two reads so)
  for (const i of inLineCarbons(read)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), IN_LINE_SAID];
  // (bonds stopping short of one point where nothing was read: a label lost - its ink faint, or never traced - said, never taken for carbons)
  for (const i of lostLabelEnds(read)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), LOST_LABEL_SAID];
  // (a small piece beside a larger one, labels and all; an alkali metal on a carbon; two atoms at one place: each said, never read silently)
  for (const i of besidePieces(read)) if (!read.atoms[i].unsure?.includes(APART_SAID)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), APART_SAID];
  for (const i of alkaliOnCarbon(read)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), ALKALI_SAID];
  for (const i of atOnePlace(read)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), ONE_PLACE_SAID];
  // (an O, S, Se or N written bare, no H, no charge, with fewer bonds than it takes: a charge's sign, a bond or an H not read - said
  //  wherever it stands and however large its piece, never filled with H in silence)
  for (const i of openLabels(read)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), OPEN_SAID];
  // (a word an atom's label reads as - a counter-ion's Na, its sign lost or not taken - standing apart, read as no atom: said by the atom
  //  nearest it, however far, never left out in silence)
  for (const [i, said] of wordsApart(read, reads)) read.atoms[i].unsure = [...(read.atoms[i].unsure ?? []), said];
  return read;
}

/**
 * The words of a picture's letters read in no label that read as a label - an element, an ion, a group - standing farther than
 * `LEFT_NEAR` from every atom (nearer, `unreadInk` says the letter): each said by the atom nearest it, by atom.
 */
export function wordsApart(read: Pick<FigureRead, "atoms" | "bond" | "left">, reads: (label: string) => boolean): Map<number, string> {
  const out = new Map<number, string>();
  if (!read.atoms.length || !read.left?.letters.length) return out;
  for (const w of wordsOf(read.left.letters)) {
    const text = labelText(w, reads);
    // (an element's symbol, an ion's or a group's name begins with a capital: a word that does not is no atom's)
    if (!/^[A-Z]/.test(text) || !reads(text)) continue;
    const m = { x: (w.box[0] + w.box[2]) / 2, y: (w.box[1] + w.box[3]) / 2 };
    let [best, at] = [Infinity, -1];
    read.atoms.forEach((a, i) => {
      const d = Math.hypot(a.x - m.x, a.y - m.y);
      if (d < best) [best, at] = [d, i];
    });
    if (at >= 0 && best > LEFT_NEAR * read.bond && !out.has(at)) out.set(at, `"${text}" stands apart in the picture and was read as no atom: an ion or a group of the structure may be missing.`);
  }
  return out;
}

/**
 * The bonds an element written bare takes, uncharged, where a drawing leaves no H unwritten: a chemist writes a hetero atom's H's
 * (OH, NH2, SH), so a bare O, S or Se has two bonds - a ring's or an ether's O, a carbonyl's O with its double bond - and a bare N
 * three - a ring's, an amine's, an imine's with its double bond, a nitrile's with its triple. One with fewer is an anion whose minus
 * was lost, an H or a bond not read: open (`openLabels`).
 */
const BARE_TAKES: Record<string, number> = { O: 2, S: 2, Se: 2, N: 3 };
export const OPEN_SAID = "As read, it has fewer bonds than it takes and no charge: a charge's sign, a bond or an H was not read.";

/**
 * The atoms of a read written as a bare O, S, Se or N - the label that one element alone, or read as that element - with no charge, no
 * charge drawn by it and no radical's dots, whose bonds come to fewer than it takes (`BARE_TAKES`): a bond as its order, a bond of a
 * ring drawn with a circle as one and a half, a dative bond none (its pair is the donor's own).
 */
export function openLabels(read: Pick<FigureRead, "atoms" | "bonds">): number[] {
  const sum = read.atoms.map(() => 0);
  for (const b of read.bonds) {
    if (b.dative) continue;
    const n = b.aromatic ? 1.5 : b.order;
    sum[b.a] += n;
    sum[b.b] += n;
  }
  return read.atoms.flatMap((a, i) => {
    const el = a.label ?? a.el ?? "";
    const takes = BARE_TAKES[el];
    if (takes === undefined || a.charge || a.marked || a.dots) return [];
    return sum[i] < takes ? [i] : [];
  });
}

/**
 * How far short of where their lines cross two bonds' free ends may stop to be a label's (`lostLabelEnds`), in a bond: a label's half
 * width and its gap. No atom read may lie within half of it of that point.
 */
export const LOST_LABEL_REACH = 0.75;
export const LOST_LABEL_SAID = "A label here was not read: its bonds stop short of it.";

/**
 * The atoms of a read at which a label was lost: free ends - an unlabelled carbon of one bond - of two bonds or more which, carried on
 * past those ends, cross no more than `LOST_LABEL_REACH` of a bond beyond each, where no atom was read. Bonds stop so short of a label,
 * and of nothing else: two methyls' ends point apart, a chain's end points at no other.
 */
export function lostLabelEnds(read: Pick<FigureRead, "atoms" | "bonds" | "bond">): number[] {
  const { atoms, bonds, bond } = read;
  const at = atoms.map((): FigureRead["bonds"] => []);
  for (const b of bonds) for (const e of [b.a, b.b]) at[e].push(b);
  const ends = atoms.flatMap((a, i) => {
    if (a.label || (a.el && a.el !== "C") || at[i].length !== 1) return [];
    const o = atoms[at[i][0].a === i ? at[i][0].b : at[i][0].a];
    const l = Math.hypot(a.x - o.x, a.y - o.y);
    return l ? [{ i, p: { x: a.x, y: a.y }, u: { x: (a.x - o.x) / l, y: (a.y - o.y) / l } }] : [];
  });
  const lost = new Set<number>();
  for (let s = 0; s < ends.length; s++)
    for (let t = s + 1; t < ends.length; t++) {
      const [e, f] = [ends[s], ends[t]];
      // (where the two lines carried on cross: how far along each, from its end)
      const cross = e.u.x * f.u.y - e.u.y * f.u.x;
      const [dx, dy] = [f.p.x - e.p.x, f.p.y - e.p.y];
      if (Math.abs(cross) < 1e-6) continue;
      const se = (dx * f.u.y - dy * f.u.x) / cross;
      const sf = (dx * e.u.y - dy * e.u.x) / cross;
      if (se <= 0 || sf <= 0 || se > LOST_LABEL_REACH * bond || sf > LOST_LABEL_REACH * bond) continue;
      const meet = { x: e.p.x + e.u.x * se, y: e.p.y + e.u.y * se };
      if (atoms.some((a) => Math.hypot(a.x - meet.x, a.y - meet.y) < (LOST_LABEL_REACH / 2) * bond)) continue;
      lost.add(e.i).add(f.i);
    }
  return [...lost];
}

/** How near straight two single bonds at a carbon may be before it is said (`inLineCarbons`): within ten degrees of a line. */
export const IN_LINE_BONDS = (10 * Math.PI) / 180;
export const IN_LINE_SAID = "Its two bonds lie in line: one bond may have been read as two.";

/**
 * The carbons of a read - no label - with exactly two bonds, both single, lying in line within `IN_LINE_BONDS`: a skeletal drawing sets
 * carbons in line only on a triple bond or cumulated double bonds (ethyne, a nitrile, an allene, a cumulene), so such a carbon is a bond
 * traced as two.
 */
export function inLineCarbons(read: Pick<FigureRead, "atoms" | "bonds">): number[] {
  const at = read.atoms.map((): FigureRead["bonds"] => []);
  for (const b of read.bonds) for (const e of [b.a, b.b]) at[e].push(b);
  return read.atoms.flatMap((a, i) => {
    if (a.label || (a.el && a.el !== "C") || at[i].length !== 2 || at[i].some((b) => b.order !== 1)) return [];
    const [p, q] = at[i].map((b) => read.atoms[b.a === i ? b.b : b.a]);
    const turn = Math.abs(Math.atan2((p.x - a.x) * (q.y - a.y) - (p.y - a.y) * (q.x - a.x), (p.x - a.x) * (q.x - a.x) + (p.y - a.y) * (q.y - a.y)));
    return Math.PI - turn <= IN_LINE_BONDS ? [i] : [];
  });
}

/**
 * A piece of a picture read - atoms joined by bonds - of this many atoms or fewer is said where all of it is carbons with no label: a
 * compound's number or a letter traced may read as such bonds (a 1 or a 7 as a line, a % as a few); and where it holds such a carbon and
 * lies beside a larger piece - within `besideReach` of an atom of it, as `besidePieces` has it: a group whose bond to the structure was not read (an
 * OH with a stray carbon, a tert-butyl with its CH-OH). A whole small molecule drawn apart - an amino acid a few bonds off another
 * structure - is beside none, and is not said for it. Never left out: a cyclohexane or a hexane drawn alone is such a piece, and comes
 * through said. Inferred from made pictures (docs/PDF.md, *A picture traced*).
 */
export const TINY_PIECE = 6;
export const TINY_SAID = "A small piece of carbons alone: it may be a number or letters read as bonds.";
export const APART_SAID = "A small piece apart from the structure: it may be part of it, its bond not read.";

/** The pieces of a read that are `TINY_PIECE`'s: each its atoms, and whether it is said for lying beside a larger piece. */
export function tinyPieces(read: Pick<FigureRead, "atoms" | "bonds" | "bond">): { atoms: number[]; apart: boolean }[] {
  const bare = (i: number) => !read.atoms[i].label && (!read.atoms[i].el || read.atoms[i].el === "C");
  const all = piecesOf(read);
  return all.flatMap((p): { atoms: number[]; apart: boolean }[] => {
    if (p.length > TINY_PIECE || !p.some(bare)) return [];
    if (p.every(bare)) return [{ atoms: p, apart: false }];
    return besideLarger(read, p, all.filter((q) => q.length > TINY_PIECE)) ? [{ atoms: p, apart: true }] : [];
  });
}

/**
 * How far past the longest bond read in a picture a piece's atom may stand from an atom of a larger piece and still be said to lie
 * beside it, in the picture's bond (`besideReach`): an atom read at a label stands at the label's middle, which may lie half a label's
 * width - about half a bond - off where a bond drawn to it is aimed.
 */
const BESIDE_SLACK = 0.5;

/**
 * How near an atom of a larger piece a piece's atom stands when it lies beside it: a group cut off by one bond not traced stands one
 * drawn bond from the atom it belonged to, and a drawn bond may be longer than most - stretched in a crowded drawing, or to a label - so
 * the reach is the longest bond read in the picture, measured between its atoms (a label's gap and all), and `BESIDE_SLACK` more; never
 * under a bond and a half. Measured atom to atom, as a bond joins atoms: a piece farther than that from every atom of the larger piece
 * is no group of it cut off by one bond.
 */
export function besideReach(read: Pick<FigureRead, "atoms" | "bonds" | "bond">): number {
  const longest = Math.max(0, ...read.bonds.map((b) => Math.hypot(read.atoms[b.a].x - read.atoms[b.b].x, read.atoms[b.a].y - read.atoms[b.b].y)));
  return Math.max(longest + BESIDE_SLACK * read.bond, (1 + BESIDE_SLACK) * read.bond);
}

/** Whether a piece of a read lies beside one of `larger`: an atom of it within `besideReach` of an atom of that piece. */
function besideLarger(read: Pick<FigureRead, "atoms" | "bonds" | "bond">, p: readonly number[], larger: readonly number[][]): boolean {
  const reach = besideReach(read);
  return larger.some((q) => p.some((i) => q.some((j) => Math.hypot(read.atoms[i].x - read.atoms[j].x, read.atoms[i].y - read.atoms[j].y) <= reach)));
}

/** The pieces of a read - atoms joined by bonds - each its atoms. */
function piecesOf(read: Pick<FigureRead, "atoms" | "bonds">): number[][] {
  const up = read.atoms.map((_, i) => i);
  const root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i])));
  for (const b of read.bonds) up[root(b.a)] = root(b.b);
  const pieces = new Map<number, number[]>();
  read.atoms.forEach((_, i) => (pieces.get(root(i)) ?? pieces.set(root(i), []).get(root(i))!).push(i));
  return [...pieces.values()];
}

/**
 * A piece standing beside a structure (`besidePieces`): of two atoms to this many, none of them charged, within `besideReach` of an atom of
 * a larger piece. A joint traced open cuts a group off so - a side chain's two or three carbons, a C-N, a C-O - and drawings rarely set a free
 * ethane or methylamine beside a molecule; a counter-ion is charged or one atom, and is not said.
 */
export const BESIDE_PIECE = 4;

/** The atoms of a read's pieces standing beside a larger piece (`BESIDE_PIECE`), said as `APART_SAID` says. */
export function besidePieces(read: Pick<FigureRead, "atoms" | "bonds" | "bond">): number[] {
  const all = piecesOf(read);
  const charged = (i: number) => !!read.atoms[i].charge || !!read.atoms[i].marked || /[+\u2212-]$/.test(read.atoms[i].label ?? "");
  return all.flatMap((p) => {
    if (p.length < 2 || p.length > BESIDE_PIECE || p.some(charged)) return [];
    return besideLarger(read, p, all.filter((q) => q.length > p.length)) ? p : [];
  });
}

/** The alkali metals, said where a picture's read bonds one to a carbon (`alkaliOnCarbon`). */
const ALKALI = new Set(["Li", "Na", "K", "Rb", "Cs"]);
export const ALKALI_SAID = "An alkali metal bonded to a carbon: such a metal is mostly drawn as an ion, and a charge's sign may have been read as a bond.";

/** The atoms of a read that are an alkali metal, uncharged, bonded to a carbon - one with no label, or labelled as a carbon is. */
export function alkaliOnCarbon(read: Pick<FigureRead, "atoms" | "bonds">): number[] {
  const metal = (i: number) => ALKALI.has(read.atoms[i].el ?? read.atoms[i].label ?? "") && !read.atoms[i].charge;
  const carbon = (i: number) => {
    const a = read.atoms[i];
    return a.el ? a.el === "C" : !a.label || /^(C|CH|CH2|H2C|CH3|H3C|Me)$/.test(a.label);
  };
  return read.atoms.flatMap((_, i) => (metal(i) && read.bonds.some((b) => (b.a === i && carbon(b.b)) || (b.b === i && carbon(b.a))) ? [i] : []));
}

/** How near two atoms not bonded to each other may be read, in a bond, before both are said (`atOnePlace`): a joint traced open reads so. */
export const ONE_PLACE = 0.35;
export const ONE_PLACE_SAID = "Two atoms read at one place: they may be one atom, its bonds traced apart.";

/** The atoms of a read lying within `ONE_PLACE` of a bond of another they are not bonded to. */
export function atOnePlace(read: Pick<FigureRead, "atoms" | "bonds" | "bond">): number[] {
  const bonded = new Set(read.bonds.flatMap((b) => [`${b.a},${b.b}`, `${b.b},${b.a}`]));
  const out = new Set<number>();
  read.atoms.forEach((a, i) =>
    read.atoms.forEach((b, j) => {
      if (j <= i || bonded.has(`${i},${j}`)) return;
      if (Math.hypot(a.x - b.x, a.y - b.y) < ONE_PLACE * read.bond) out.add(i).add(j);
    }),
  );
  return [...out].sort((p, q) => p - q);
}

/**
 * How finely a figure that is a picture is drawn to be traced where the PDF does not say how its picture is stored - as Meno's own
 * picture reader was measured (docs/PDF.md, *A picture traced*) - and at the most.
 */
export const PICTURE_DPI = 300;
export const PICTURE_DPI_MOST = 600;

/**
 * How finely a box of a page holding pictures is drawn to be traced, in dots an inch: as finely as the picture covering most of it is
 * stored - never finer, which would only enlarge its pixels, and hide that it is drawn too small to read - and at most `most`; where the
 * PDF does not say, `otherwise`. A picture's resolution, however it is turned: the square root of its pixels over its area, in inches.
 */
export function pictureDpi(drawn: Pick<FigureDrawn, "pictures" | "pixels">, box: Box, otherwise: number, most: number): number {
  let [best, dpi] = [0, otherwise];
  drawn.pictures.forEach((p, i) => {
    const px = drawn.pixels?.[i];
    const cover = Math.max(0, Math.min(p[2], box[2]) - Math.max(p[0], box[0])) * Math.max(0, Math.min(p[3], box[3]) - Math.max(p[1], box[1]));
    const inches = ((p[2] - p[0]) / 72) * ((p[3] - p[1]) / 72);
    if (!px || cover <= best || inches <= 0) return;
    [best, dpi] = [cover, Math.sqrt((px[0] * px[1]) / inches)];
  });
  return Math.min(dpi, most);
}
