/**
 * What a copy takes and puts on the clipboard, and what a paste makes of
 * what it finds there - pure, over the editor's model (the clipboard
 * itself is lib/clipboard).
 */
import { readBiopolymer } from "../../../../lib/chem/biopolymer";
import type { ClipItem } from "../../../../lib/clipboard";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { writeMolfile, writeMolfile3d } from "../../../../lib/chem/molWriter";
import { arrowEnds } from "../../../../lib/chem/reactionScheme";
import { fragmentOf, partOf } from "../chem/cleanUp";
import { forFlatReaders } from "../chem/drawing";
import { notOneReaction, reactionFileText } from "../chem/reactionFile";
import type { Arrow, Atom, Bond, Caption, Carried3D, CarriedList, Drawn, Measure3D, PictureItem, Plus, Sel, Turn3D, WordsFrom } from "../store/types";
import { asSeen } from "./molecule3d";
import { readCalc } from "../../../../lib/calc/output";
import { readWorkflow } from "../workflow/saved";
import { partsBounds } from "../workflow/parts";

type Pt = { x: number; y: number };

/**
 * What a copy takes: the selected atoms and every bond among them, with
 * the arrows and "+" signs drawn among them - within half a bond of the box
 * round them - or, with nothing selected, the whole structure `around` an
 * atom (the one under the pointer). Null when that is nothing.
 */
export function partToCopy(drawn: Drawn, sel: Sel, around: number | null): Drawn | null {
  const model = { atoms: drawn.atoms, bonds: drawn.bonds };
  const atoms = sel.atoms.size
    ? new Set([...sel.atoms].filter((id) => model.atoms.some((a) => a.id === id)))
    : around != null && model.atoms.some((a) => a.id === around)
      ? fragmentOf(model, around)
      : new Set<number>();
  if (!atoms.size) return null;
  const part = partOf(model, atoms);
  if (!sel.atoms.size) return part;
  const { arrows, pluses, captions } = schemeAmong(drawn, atoms);
  return {
    ...part,
    ...(arrows.length ? { arrows } : {}),
    ...(pluses.length ? { pluses } : {}),
    ...(captions.length ? { captions } : {}),
  };
}

/**
 * The arrows, "+" signs and words drawn among the atoms `ids`: within half
 * a bond of the box round them, an arrow from end to end, words by their
 * middle - or over an arrow that is. What goes with a selection that is
 * copied, cut, deleted or moved.
 */
/** Where words taken out of a PDF came from, as far as it reads: its SHA-256, and two places in it. */
function wordsFromOf(v: unknown): WordsFrom | null {
  const f = v as Partial<WordsFrom> | undefined;
  const place = (p: unknown) => {
    const q = p as { page?: unknown; at?: unknown } | undefined;
    return q && Number.isInteger(q.page) && Number.isInteger(q.at) && (q.page as number) >= 0 && (q.at as number) >= 0 ? { page: q.page as number, at: q.at as number } : null;
  };
  const from = place(f?.from);
  const to = place(f?.to);
  return f && typeof f.sha256 === "string" && /^[0-9a-f]{64}$/.test(f.sha256) && from && to ? { sha256: f.sha256, from, to } : null;
}

export function schemeAmong(drawn: Drawn, ids: Set<number>): { arrows: Arrow[]; pluses: Plus[]; captions: Caption[] } {
  const atoms = drawn.atoms.filter((a) => ids.has(a.id));
  if (!atoms.length) return { arrows: [], pluses: [], captions: [] };
  const reach = NOMINAL_BOND_LENGTH / 2;
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  const within = (p: Pt) =>
    p.x >= Math.min(...xs) - reach &&
    p.x <= Math.max(...xs) + reach &&
    p.y >= Math.min(...ys) - reach &&
    p.y <= Math.max(...ys) + reach;
  const arrows = (drawn.arrows ?? []).filter((a) => {
    const { from, to } = arrowEnds(a);
    return within(from) && within(to);
  });
  const taken = new Set(arrows.map((a) => a.id));
  return {
    arrows,
    pluses: (drawn.pluses ?? []).filter(within),
    captions: (drawn.captions ?? []).filter((c) => within(c) || (c.arrow != null && taken.has(c.arrow))),
  };
}

/** How far from what it is of a mark put by hand is read, in ems of the labels: farther, it is put back. */
const MARK_REACH = 50;

/** Meno's own record of a structure on the clipboard, and its version. */
const RECORD = "meno-structure";
const VERSION = 1;

/**
 * What a copy puts on the clipboard: Meno's own record, which loses
 * nothing - labels, wedges' ends, a drawing in perspective, a reaction's
 * arrow and "+" signs - and a MOL file for other chemistry programs, as a
 * saved file has it; for a reaction, an RXN file too.
 */
export function clipItems(part: Drawn): ClipItem[] {
  // molecules in 3D alone: a molfile in 3D, as they are seen
  if (!part.atoms.length) {
    const ms = part.molecules3d ?? [];
    // (a workflow's parts, or pictures, alone: Meno's record, which no other program reads)
    if (!ms.length) return hasFlow(part) || part.pictures?.length || part.captions?.length ? [{ flavor: "meno", text: recordText(part) }] : [];
    const placed = ms.length > 1;
    const seen = ms.map((m) => asSeen(m, m.turn, m.frame, placed));
    const offsets = seen.map((_, i) => seen.slice(0, i).reduce((n, a) => n + a.length, 0));
    return [
      { flavor: "meno", text: recordText(part) },
      {
        flavor: "mol",
        text: writeMolfile3d(
          seen.flat(),
          ms.flatMap((m, i) => m.bonds.map((b) => ({ a1: b.a1 + offsets[i], a2: b.a2 + offsets[i], order: b.order }))),
          { title: ms.length === 1 ? ms[0].name?.replace(/\.[^.]*$/, "") : undefined },
        ),
      },
    ];
  }
  return [
    { flavor: "meno", text: recordText(part) },
    { flavor: "mol", text: writeMolfile(forFlatReaders(part)) },
    ...(notOneReaction(part) ? [] : [{ flavor: "rxn" as const, text: reactionFileText(part) }]),
  ];
}

/**
 * Meno's own record of a structure, as text: what a picture of it carries
 * too. A reaction's arrows and pluses go with it, where it has them; a
 * reader that knows nothing of them reads the structures.
 */
export function recordText(part: Drawn): string {
  return JSON.stringify({
    format: RECORD,
    version: VERSION,
    atoms: part.atoms,
    bonds: part.bonds,
    ...(part.arrows?.length ? { arrows: part.arrows } : {}),
    ...(part.pluses?.length ? { pluses: part.pluses } : {}),
    ...(part.captions?.length ? { captions: part.captions } : {}),
    ...(part.molecules3d?.length ? { molecules3d: part.molecules3d } : {}),
    ...(hasFlow(part) ? { flow: part.flow } : {}),
    ...(part.pictures?.length ? { pictures: part.pictures } : {}),
  });
}

/** Whether a copy carries any of a workflow's parts. */
export const hasFlow = (part: Pick<Drawn, "flow">) => !!(part.flow?.sets.length || part.flow?.steps.length);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The structure in Meno's own record, or null if `text` is not one this version reads. */
export function readRecord(text: string): Drawn | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const r = data as { format?: unknown; version?: unknown };
  if (r?.format !== RECORD || r.version !== VERSION) return null;
  return readDrawn(data);
}

/**
 * What is drawn, as Meno's own record and workspace file hold it: atoms and
 * bonds, arrows, pluses and molecules in 3D. Null where the atoms or bonds
 * do not read; what else does not read is left out.
 */
export function readDrawn(data: unknown): Drawn | null {
  const r = data as {
    format?: unknown;
    version?: unknown;
    atoms?: unknown;
    bonds?: unknown;
    arrows?: unknown;
    pluses?: unknown;
    captions?: unknown;
    molecules3d?: unknown;
    flow?: unknown;
    pictures?: unknown;
  };
  if (!r || !Array.isArray(r.atoms) || !Array.isArray(r.bonds)) return null;
  const atoms = r.atoms as Partial<Atom>[];
  const bonds = r.bonds as Partial<Bond>[];
  if (!atoms.every((a) => isNum(a.id) && isNum(a.x) && isNum(a.y) && typeof a.el === "string")) return null;
  const ids = new Set(atoms.map((a) => a.id));
  if (!bonds.every((b) => isNum(b.id) && ids.has(b.a) && ids.has(b.b) && [1, 2, 3].includes(b.order as number))) {
    return null;
  }
  // (arrows and pluses that do not read are left out, not the structure)
  const arrows = (Array.isArray(r.arrows) ? (r.arrows as Partial<Arrow>[]) : []).filter(
    (a) => isNum(a.id) && isNum(a.x) && isNum(a.y) && isNum(a.angle) && isNum(a.length),
  ) as Arrow[];
  const pluses = (Array.isArray(r.pluses) ? (r.pluses as Partial<Plus>[]) : []).filter(
    (p) => isNum(p.id) && isNum(p.x) && isNum(p.y),
  ) as Plus[];
  // (words over an arrow that is not there are over none)
  const arrowIds = new Set(arrows.map((a) => a.id));
  const captions = (Array.isArray(r.captions) ? (r.captions as Partial<Caption>[]) : []).flatMap((c): Caption[] => {
    if (!isNum(c.id) || !isNum(c.x) || !isNum(c.y) || typeof c.text !== "string" || !c.text.trim()) return [];
    const from = wordsFromOf(c.from);
    return [
      {
        id: c.id,
        x: c.x,
        y: c.y,
        text: c.text,
        ...(isNum(c.arrow) && arrowIds.has(c.arrow) ? { arrow: c.arrow } : {}),
        ...(isNum(c.width) && c.width > 0 ? { width: c.width } : {}),
        ...(c.align === "left" || c.align === "right" || c.align === "justify" ? { align: c.align } : {}),
        ...(from ? { from } : {}),
      },
    ];
  });
  const molecules3d = (Array.isArray(r.molecules3d) ? r.molecules3d : []).flatMap((m) => {
    const read = readCarried3D(m);
    return read ? [read] : [];
  });
  // (a workflow's parts, read as a workspace's are - what they did is a step's own, not a copy's)
  const read = r.flow ? readWorkflow(r.flow) : undefined;
  const flow = read ? { ...read, steps: read.steps.map(({ ran: _r, runs: _k, running: _g, ...s }) => s) } : undefined;
  const pictures = (Array.isArray(r.pictures) ? r.pictures : []).flatMap((p) => {
    const read = readPicture(p);
    return read ? [read] : [];
  });
  // (a mark put by hand where it reads as a place, else where the drawing puts it)
  const markAt = (p: unknown) => {
    const q = p as { x?: unknown; y?: unknown } | undefined;
    return q && isNum(q.x) && isNum(q.y) && Math.hypot(q.x, q.y) < MARK_REACH ? { x: q.x, y: q.y } : undefined;
  };
  const withMarks = <T extends { chargeAt?: unknown; stereoAt?: unknown }>(x: T, keys: readonly ("chargeAt" | "stereoAt")[]): T => {
    const out = { ...x };
    for (const k of keys) {
      const at = markAt(x[k]);
      if (at) out[k] = at;
      else delete out[k];
    }
    return out;
  };
  return {
    atoms: atoms.map((a) => withMarks({ r: 0.9, ...a }, ["chargeAt", "stereoAt"]) as Atom),
    bonds: bonds.map((b) => withMarks(b, ["stereoAt"])) as Bond[],
    ...(arrows.length ? { arrows } : {}),
    ...(pluses.length ? { pluses } : {}),
    ...(captions.length ? { captions } : {}),
    ...(molecules3d.length ? { molecules3d } : {}),
    ...(flow ? { flow } : {}),
    ...(pictures.length ? { pictures } : {}),
  };
}

/** A picture as a record or a workspace carries it, as far as it reads: what it is known by, what it is, its size in pixels, where it lies, how large and how turned. */
function readPicture(v: unknown): PictureItem | null {
  const p = v as Partial<PictureItem> | null;
  if (!p || !isNum(p.id) || typeof p.name !== "string" || typeof p.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(p.sha256)) return null;
  if (p.media !== "image/png" && p.media !== "image/jpeg") return null;
  if (!Array.isArray(p.px) || p.px.length !== 2 || !p.px.every((n) => isNum(n) && n > 0)) return null;
  if (!isNum(p.x) || !isNum(p.y) || !isNum(p.w) || !isNum(p.h) || p.w <= 0 || p.h <= 0) return null;
  const from = pictureFromOf(p.from);
  return {
    id: p.id,
    name: p.name.slice(0, 260),
    sha256: p.sha256,
    media: p.media,
    px: [p.px[0], p.px[1]],
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    ...(isNum(p.turn) && p.turn ? { turn: p.turn } : {}),
    ...(from ? { from } : {}),
  };
}

/** Where a picture was cut out of a PDF, as far as it reads: its SHA-256, a page, and a box on it. */
function pictureFromOf(v: unknown): PictureItem["from"] | null {
  const f = v as { sha256?: unknown; page?: unknown; box?: unknown } | null | undefined;
  if (!f || typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256) || !Number.isInteger(f.page) || (f.page as number) < 0) return null;
  if (!Array.isArray(f.box) || f.box.length !== 4 || !f.box.every(isNum)) return null;
  const [x0, y0, x1, y1] = f.box as number[];
  return x1 > x0 && y1 > y0 ? { sha256: f.sha256, page: f.page as number, box: [x0, y0, x1, y1] } : null;
}

/** How a molecule was made, as a file carries it: rows of text, each read as data; otherwise none. */
function madeOf(v: unknown): Carried3D["made"] {
  const how = (v as { how?: unknown } | null | undefined)?.how;
  if (!Array.isArray(how)) return undefined;
  const rows = how
    .slice(0, 20)
    .filter((r): r is { label: string; text: string } => typeof r?.label === "string" && typeof r?.text === "string")
    .map((r) => ({ label: r.label.slice(0, 80), text: r.text.slice(0, 300) }));
  return rows.length ? { how: rows } : undefined;
}

/** A molecule's open list as a file carries it; otherwise none. */
function listOf(v: unknown): CarriedList | undefined {
  const l = v as Partial<Record<keyof CarriedList, unknown>> | null | undefined;
  if (!l || typeof l.id !== "string" || !(l.row === null || (Number.isInteger(l.row) && (l.row as number) >= 0))) return undefined;
  return { id: l.id, row: l.row as number | null, ...(isNum(l.iso) && l.iso > 0 ? { iso: l.iso } : {}) };
}

/** A molecule in 3D in Meno's own record, or null where it does not read as one. */
export function readCarried3D(given: unknown): Carried3D | null {
  const m = given as Partial<Record<keyof Carried3D, unknown>>;
  if (!m || !Array.isArray(m.atoms) || !Array.isArray(m.bonds) || !m.at) return null;
  const atoms = m.atoms as Partial<Carried3D["atoms"][number]>[];
  const n = atoms.length;
  if (!n || !atoms.every((a) => typeof a.el === "string" && isNum(a.x) && isNum(a.y) && isNum(a.z))) return null;
  const index = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
  const bonds = m.bonds as Partial<Carried3D["bonds"][number]>[];
  if (!bonds.every((b) => index(b.a1) && index(b.a2) && Number.isInteger(b.order))) return null;
  const at = m.at as Partial<Pt & { z: number }>;
  if (!isNum(at.x) || !isNum(at.y)) return null;
  // (what does not read is left out, not the molecule)
  const frames = (Array.isArray(m.frames) ? (m.frames as unknown[]) : []).filter(
    (f): f is number[] => Array.isArray(f) && f.length === 3 * n && f.every(isNum),
  );
  const energies = Array.isArray(m.energies) && m.energies.every(isNum) && m.energies.length === frames.length + 1 ? (m.energies as number[]) : undefined;
  const measures = (Array.isArray(m.measures) ? (m.measures as Partial<Measure3D>[]) : []).filter(
    (x): x is Measure3D => isNum(x.id) && Array.isArray(x.atoms) && x.atoms.length >= 2 && x.atoms.length <= 4 && x.atoms.every(index),
  );
  const turn = Array.isArray(m.turn) && m.turn.length === 4 && m.turn.every(isNum) ? (m.turn as Turn3D) : undefined;
  // what ties it to the drawing it was made from: the drawing's atom each
  // of its atoms is (a paste ties it to the pasted drawing: pasteModel)
  const drawnFrom =
    Array.isArray(m.drawnFrom) && m.drawnFrom.length === n && m.drawnFrom.every((id) => id === null || Number.isInteger(id))
      ? (m.drawnFrom as (number | null)[])
      : undefined;
  const stereo = readStereo(m.stereo, n, bonds.length);
  const biopolymer = readBiopolymer(m.biopolymer, n);
  const calc = readCalc(m.calc, n, 1 + frames.length);
  return {
    atoms: atoms as Carried3D["atoms"],
    bonds: bonds as Carried3D["bonds"],
    at: { x: at.x, y: at.y, ...(isNum(at.z) ? { z: at.z } : {}) },
    ...(frames.length ? { frames } : {}),
    ...(energies ? { energies } : {}),
    ...(m.look === "secondary" ? { look: m.look } : {}),
    ...(measures.length ? { measures } : {}),
    ...(typeof m.name === "string" ? { name: m.name } : {}),
    ...(turn ? { turn } : {}),
    ...(Number.isInteger(m.frame) ? { frame: m.frame as number } : {}),
    ...(listOf(m.list) ? { list: listOf(m.list) } : {}),
    ...(drawnFrom ? { drawnFrom } : {}),
    ...(drawnFrom && typeof m.drawnAs === "string" ? { drawnAs: m.drawnAs } : {}),
    ...(m.conformerSet === true ? { conformerSet: true } : {}),
    ...(biopolymer ? { biopolymer } : {}),
    ...(typeof (m.edited as { from?: unknown } | undefined)?.from === "string" ? { edited: { from: (m.edited as { from: string }).from } } : {}),
    ...(m.path === true && frames.length ? { path: true as const } : {}),
    ...(m.bondsFrom === "distance" ? { bondsFrom: "distance" as const } : {}),
    ...(madeOf(m.made) ? { made: madeOf(m.made) } : {}),
    ...(Array.isArray(m.numbers) && m.numbers.length === 1 + frames.length && m.numbers.every((k) => Number.isInteger(k)) ? { numbers: m.numbers as number[] } : {}),
    ...(Array.isArray(m.shares) && m.shares.length === 1 + frames.length && m.shares.every(isNum) ? { shares: m.shares as number[] } : {}),
    ...(stereo ? { stereo } : {}),
    ...(calc ? { calc } : {}),
  };
}

/**
 * A molecule's CIP labels, by atom and bond index, and which of them its
 * drawing left open - where they read: every index one of its own.
 */
function readStereo(given: unknown, atoms: number, bonds: number): Carried3D["stereo"] | undefined {
  const s = given as { atoms?: unknown; bonds?: unknown; chosen?: unknown } | null | undefined;
  if (!s || typeof s !== "object") return undefined;
  const labels = (r: unknown, n: number): Record<number, string> | null => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(r)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= n || typeof v !== "string") return null;
      out[i] = v;
    }
    return out;
  };
  const a = labels(s.atoms, atoms);
  const b = labels(s.bonds, bonds);
  if (!a || !b) return undefined;
  const within = (v: unknown, n: number): v is number[] =>
    Array.isArray(v) && v.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  const c = s.chosen as { atoms?: unknown; bonds?: unknown } | undefined;
  const chosen = c && within(c.atoms, atoms) && within(c.bonds, bonds) ? { atoms: c.atoms, bonds: c.bonds } : undefined;
  return { atoms: a, bonds: b, ...(chosen ? { chosen } : {}) };
}

/**
 * Whether plain text could be a SMILES: one word of the characters one is
 * written in. The plugin that reads SMILES has the last word on it.
 */
export function looksLikeSmiles(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 5000 && /^[A-Za-z0-9@+\-=#$%:.()[\]/\\*~>]+$/.test(t);
}

/** `drawn` moved so that the middle of the box round it - its arrows and pluses too, and a workflow's sets and steps - is at `p`. */
export function centredAt<D extends Drawn>(drawn: D, p: Pt): D {
  const flow = drawn.flow ? partsBounds(drawn.flow) : null;
  const points = [
    ...drawn.atoms,
    ...(drawn.arrows ?? []).flatMap((a) => Object.values(arrowEnds(a))),
    ...(drawn.pluses ?? []),
    ...(drawn.captions ?? []),
    ...(drawn.molecules3d ?? []).map((m) => m.at),
    ...(flow ? [{ x: flow.x0, y: flow.y0 }, { x: flow.x1, y: flow.y1 }] : []),
    ...(drawn.pictures ?? []).flatMap((p) => [
      { x: p.x - p.w / 2, y: p.y - p.h / 2 },
      { x: p.x + p.w / 2, y: p.y + p.h / 2 },
    ]),
  ];
  if (!points.length) return drawn;
  const xs = points.map((a) => a.x);
  const ys = points.map((a) => a.y);
  const dx = p.x - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = p.y - (Math.min(...ys) + Math.max(...ys)) / 2;
  const moved = <T extends Pt>(t: T): T => ({ ...t, x: t.x + dx, y: t.y + dy });
  return {
    ...drawn,
    atoms: drawn.atoms.map(moved),
    ...(drawn.arrows ? { arrows: drawn.arrows.map(moved) } : {}),
    ...(drawn.pluses ? { pluses: drawn.pluses.map(moved) } : {}),
    ...(drawn.captions ? { captions: drawn.captions.map(moved) } : {}),
    ...(drawn.molecules3d ? { molecules3d: drawn.molecules3d.map((m) => ({ ...m, at: moved(m.at) })) } : {}),
    ...(drawn.pictures ? { pictures: drawn.pictures.map(moved) } : {}),
    ...(drawn.flow
      ? {
          flow: {
            ...drawn.flow,
            sets: drawn.flow.sets.map((b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
            steps: drawn.flow.steps.map(moved),
          },
        }
      : {}),
  };
}
