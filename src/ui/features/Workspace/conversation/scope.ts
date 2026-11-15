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
import { setMiddle, stepMiddle } from "../workflow/parts";
import { sheetMiddle } from "../utils/textSheets";
import { cardRect } from "../pageGl/conversationCard";

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

/** Where a frame's card lies (pageGl/conversationCard `cardRect`): its room is never scope - a thing whose middle is on it is not seen. None for a scope of the whole page. */
export const cardRoomOf = (scope: Scope): Frame | null => ("page" in scope ? null : cardRect(scope.frame));

/**
 * The part of a scope a thing is put down in: its frame to the left of its card, where the
 * card lies - nothing a conversation puts down goes under its own card. A scope of the
 * whole page is as it is.
 */
export function placingFrameOf(frame: Frame): Frame {
  const room = cardRect(frame);
  return room ? { ...frame, x1: Math.max(room.x0, frame.x0) } : frame;
}

/** What lies inside a scope, on the page as it is now - the room of its card excepted. */
export function inScope(d: WorkspaceDocument, scope: Scope): InScope {
  const all = "page" in scope;
  const frame: Frame = all ? { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity } : scope.frame;
  const room = cardRoomOf(scope);
  const within = (p: { x: number; y: number }) => all || (inside(frame, p) && !(room && inside(room, p)));
  const lying = lyingIn({ model: d.model, molecules3d: d.molecules3d, pictures: d.pictures }, frame, room ?? undefined);
  // (a structure by its first atom: its lowest id)
  const structureAtoms = new Map(lying.structures.map((ids) => [Math.min(...ids), ids]));
  return {
    structure: [...structureAtoms.keys()],
    structureAtoms,
    molecule: lying.molecules,
    picture: lying.pictures,
    text: (d.texts ?? []).flatMap((t) => (t.at && !t.of && within(sheetMiddle(t.at, t.text, t.name, pointOf(t))) ? [t.id] : [])),
    pdf: (d.pdfs ?? []).flatMap((p) => (within(setMiddle(pdfBounds(p))) ? [p.id] : [])),
    arrow: d.arrows.flatMap((a) => (within(a) ? [a.id] : [])),
    plus: d.pluses.flatMap((p) => (within(p) ? [p.id] : [])),
    // (words that go with an arrow: the arrow's, seen with it)
    caption: (d.captions ?? []).flatMap((c) => (c.arrow == null && within(c) ? [c.id] : [])),
    // (a set by its frame's middle, a step by its card's - as a box takes them: workflow/parts)
    set: (d.sets ?? []).flatMap((s) => (within(setMiddle(s)) ? [s.id] : [])),
    step: (d.steps ?? []).flatMap((s) => (within(stepMiddle(s)) ? [s.id] : [])),
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
