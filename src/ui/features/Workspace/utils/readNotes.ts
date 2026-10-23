/**
 * What a workspace's file or Meno's own record of a copy held that could
 * not be read, and so was left out as it was read: each kind counted as it
 * is left out (`leftOut`), the counts gathered for one read (`noting`) and
 * said to the chemist as it opens, as it is pasted and as it is saved
 * again (docs/FILE-IO.md, *What does not read*). Reading is never stopped
 * for it: what reads is opened, and only what does not is left out.
 */

/** Each kind of thing that can be left out, as it is said: one, and several. */
const NOUNS = {
  arrow: ["arrow", "arrows"],
  plus: ["plus sign", "plus signs"],
  shape: ["shape", "shapes"],
  caption: ["piece of words", "pieces of words"],
  captionArrow: ["tie of words to an arrow", "ties of words to arrows"],
  push: ["electron-pushing arrow", "electron-pushing arrows"],
  molecule3d: ["molecule in 3D", "molecules in 3D"],
  measure: ["measurement in 3D", "measurements in 3D"],
  frame: ["conformer or frame", "conformers or frames"],
  table: ["table", "tables"],
  tableColumn: ["column of a table", "columns of tables"],
  tableRow: ["row of a table", "rows of tables"],
  tableCell: ["cell of a table", "cells of tables"],
  number: ["number held in a set", "numbers held in sets"],
  valueField: ["note of how a value was worked out", "notes of how values were worked out"],
  frameMarks: ["mark of a molecule's failed frames", "marks of molecules' failed frames"],
  frameValues: ["list of energies, numbers, shares or degeneracies", "lists of energies, numbers, shares or degeneracies"],
  stereo: ["R/S or E/Z label", "R/S or E/Z labels"],
  biopolymer: ["record of residues and chains", "records of residues and chains"],
  bondOrders: ["mark of how bond orders are known", "marks of how bond orders are known"],
  calc: ["record of a calculation", "records of calculations"],
  calcResult: ["calculation result", "calculation results"],
  calcUnread: ["note of what a calculation reader could not read", "notes of what calculation readers could not read"],
  picture: ["picture", "pictures"],
  slide: ["slide", "slides"],
  cycle: ["catalytic cycle", "catalytic cycles"],
  ink: ["piece of handwriting", "pieces of handwriting"],
  stroke: ["handwritten stroke", "handwritten strokes"],
  text: ["text", "texts"],
  textOf: ["tie of a text to a molecule", "ties of texts to molecules"],
  pdf: ["PDF", "PDFs"],
  pdfPlace: ["PDF page laid apart", "PDF pages laid apart"],
  pdfInk: ["piece of handwriting on a PDF", "pieces of handwriting on PDFs"],
  set: ["set", "sets"],
  member: ["set member", "set members"],
  property: ["property of a structure in a set", "properties of structures in sets"],
  madeFrom: ["tie of a structure in a set to what it was made from", "ties of structures in sets to what they were made from"],
  made: ["tie of a result set to its step", "ties of result sets to their steps"],
  step: ["step", "steps"],
  wire: ["wire", "wires"],
  run: ["earlier run of a step", "earlier runs of steps"],
  job: ["job under way", "jobs under way"],
} as const;

export type LeftOutKind = keyof typeof NOUNS;

/** What one read left out: how many of each kind. */
export type LeftOut = Readonly<Partial<Record<LeftOutKind, number>>>;

// (the counts of the read under way: reading is synchronous, so one at a time - one inside another counts into its own)
let counting: Partial<Record<LeftOutKind, number>> | null = null;

/** `n` of a kind left out by the read under way (`noting`); nothing, outside one. */
export function leftOut(kind: LeftOutKind, n = 1): void {
  if (counting && n > 0) counting[kind] = (counting[kind] ?? 0) + n;
}

/** What `read` gives, and what it left out as it read. */
export function noting<T>(read: () => T): { value: T; left: LeftOut } {
  const outer = counting;
  const mine: Partial<Record<LeftOutKind, number>> = {};
  counting = mine;
  try {
    return { value: read(), left: mine };
  } finally {
    counting = outer;
  }
}

/** Of a list a file holds, each item that reads (`read`), in order - each that does not left out as `kind`; none where it is no list. */
export function readEach<T>(list: unknown, read: (v: unknown) => T | null | undefined, kind: LeftOutKind): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const v of list) {
    const r = read(v);
    if (r == null) leftOut(kind);
    else out.push(r);
  }
  return out;
}

/** Whether anything was left out. */
export const anyLeftOut = (left: LeftOut | null | undefined): left is LeftOut => !!left && Object.values(left).some((n) => (n ?? 0) > 0);

/** Two reads' counts as one. */
export function leftTogether(a: LeftOut | null | undefined, b: LeftOut | null | undefined): LeftOut {
  const out: Partial<Record<LeftOutKind, number>> = { ...(a ?? {}) };
  for (const [k, n] of Object.entries(b ?? {}) as [LeftOutKind, number][]) out[k] = (out[k] ?? 0) + n;
  return out;
}

/** What was left out, in words - "3 pictures, 1 wire and 2 conformers or frames" - in the order of `NOUNS`; null where nothing was. */
export function leftOutList(left: LeftOut | null | undefined): string | null {
  if (!anyLeftOut(left)) return null;
  const parts = (Object.keys(NOUNS) as LeftOutKind[]).flatMap((k) => {
    const n = left[k] ?? 0;
    return n > 0 ? [`${n} ${NOUNS[k][n === 1 ? 0 : 1]}`] : [];
  });
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** How many things were left out, all told. */
const howMany = (left: LeftOut) => Object.values(left).reduce((s: number, n) => s + (n ?? 0), 0);

/** What opening a file, or pasting a copy (`what`), says of what it left out; null where nothing was. */
export function leftOutSaid(left: LeftOut | null | undefined, what: "file" | "copy" = "file"): string | null {
  const list = leftOutList(left);
  if (!list) return null;
  const verb = howMany(left!) === 1 ? "was" : "were";
  return `${list} in the ${what} could not be read and ${verb} left out.`;
}

/** What Save says, each time, of what was left out as the workspace opened - and, where the file as it was is kept beside the new one, as what (`kept`, its name); null where nothing was. */
export function leftOutSavedSaid(left: LeftOut | null | undefined, kept?: string | null): string | null {
  const list = leftOutList(left);
  if (!list) return null;
  const said = `Saved, but ${list} that could not be read when it opened ${howMany(left!) === 1 ? "is" : "are"} not in the file.`;
  return kept ? `${said} The file as it was is kept beside it as ${kept}.` : said;
}
