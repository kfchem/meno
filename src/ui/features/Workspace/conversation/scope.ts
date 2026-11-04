/**
 * What a conversation on the page sees (docs/CONVERSATIONS.md, *The frame
 * is its scope*): what lies inside its frame - each thing whose middle is
 * inside it, as a set's members are found (workflow/entries `lyingIn`)
 * and as a box selects - or, a conversation the person made one of the
 * whole page, all of it. Worked out anew from the page as it is, each time
 * a tool asks: what is moved out is no longer seen, what is moved in is.
 *
 * A text without a sheet of its own - a step's log, a calculation's output
 * shown from a molecule - lies nowhere on the page, and is never seen: a
 * whole log or output is not a conversation's to read.
 */
import { pdfBounds, pointOf } from "../../../../lib/pdf/layout";
import type { WorkspaceDocument } from "../document";
import { inside, lyingIn, type Frame } from "../workflow/entries";
import { CARD_H, CARD_W } from "../workflow/look";
import { sheetMiddle } from "../utils/textSheets";

/** A conversation's scope: its frame, or the whole page. */
export type Scope = { frame: Frame } | { page: true };

/** The kinds of thing a conversation sees, as its tools name them. */
export const SEEN_KINDS = ["structure", "molecule", "picture", "text", "pdf", "arrow", "plus", "caption", "set", "step"] as const;
export type SeenKind = (typeof SEEN_KINDS)[number];

/**
 * A thing on the page as a conversation's tools name it: its kind and its
 * id - a structure drawn by its first atom's id, which it keeps however it
 * is edited, while that atom stays.
 */
export type SeenId = `${SeenKind}:${number}`;

/** What a scope holds, by kind, each in the order it lies on the page where that is kept (structures, molecules, pictures), else the page's. */
export type InScope = { [K in SeenKind]: number[] } & { structureAtoms: Map<number, number[]> };

/** The middle of a set's frame, or of a step's card - whose top left it is kept by (store/types `WorkflowStep`). */
const middle = (b: Frame) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

/** What lies inside a scope, on the page as it is now. */
export function inScope(d: WorkspaceDocument, scope: Scope): InScope {
  const all = "page" in scope;
  const frame: Frame = all ? { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity } : scope.frame;
  const within = (p: { x: number; y: number }) => all || inside(frame, p);
  const lying = lyingIn({ model: d.model, molecules3d: d.molecules3d, pictures: d.pictures }, frame);
  // (a structure by its first atom: its lowest id)
  const structureAtoms = new Map(lying.structures.map((ids) => [Math.min(...ids), ids]));
  return {
    structure: [...structureAtoms.keys()],
    structureAtoms,
    molecule: lying.molecules,
    picture: lying.pictures,
    text: (d.texts ?? []).flatMap((t) => (t.at && !t.of && within(sheetMiddle(t.at, t.text, t.name, pointOf(t))) ? [t.id] : [])),
    pdf: (d.pdfs ?? []).flatMap((p) => (within(middle(pdfBounds(p))) ? [p.id] : [])),
    arrow: d.arrows.flatMap((a) => (within(a) ? [a.id] : [])),
    plus: d.pluses.flatMap((p) => (within(p) ? [p.id] : [])),
    // (words that go with an arrow: the arrow's, seen with it)
    caption: (d.captions ?? []).flatMap((c) => (c.arrow == null && within(c) ? [c.id] : [])),
    set: (d.sets ?? []).flatMap((s) => (within(middle(s)) ? [s.id] : [])),
    step: (d.steps ?? []).flatMap((s) => (within({ x: s.x + CARD_W / 2, y: s.y - CARD_H / 2 }) ? [s.id] : [])),
  };
}

/** A thing's name for the tools: "molecule:3". */
export const seenId = (kind: SeenKind, id: number): SeenId => `${kind}:${id}`;

/** A name the tools were given, read: its kind and id - none where it names no kind they know, or no whole id. */
export function readSeenId(v: unknown): { kind: SeenKind; id: number } | null {
  const m = typeof v === "string" ? /^([a-z]+):(\d{1,15})$/.exec(v) : null;
  if (!m || !(SEEN_KINDS as readonly string[]).includes(m[1])) return null;
  return { kind: m[1] as SeenKind, id: Number(m[2]) };
}

/** Whether a scope holds a thing. */
export const holds = (s: InScope, kind: SeenKind, id: number): boolean => s[kind].includes(id);
