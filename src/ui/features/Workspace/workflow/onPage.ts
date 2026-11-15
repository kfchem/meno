/**
 * Which of a page's sets lie on it, and which are held off it or drawn
 * nowhere (docs/WORKFLOWS.md, *Held results*, *Exits that set aside*):
 * what placing, drawing and choosing by frames skip. It reads the sets,
 * wires and steps alone, and imports neither place nor run: both ask it,
 * and workflow/held, which holds sets off the page and lays them out again
 * by both, imports them - no import comes round to where it started.
 */
import type { WorkspaceDocument } from "../document";
import type { Wire, WorkflowSet, WorkflowStep } from "../store/types";
import { exitsOf } from "./kinds";

/** The held sets of a page, by the page's sets and wires: worked out again only as either changes. */
const heldBy = new WeakMap<readonly WorkflowSet[], { wires: readonly Wire[] | undefined; held: ReadonlySet<number> }>();

/** The ids of a page's held sets: each a step's result set (`made`), a wire out of it, and not opened. */
export function heldSets(doc: Pick<WorkspaceDocument, "sets" | "wires">): ReadonlySet<number> {
  const sets = doc.sets ?? [];
  const was = heldBy.get(sets);
  if (was && was.wires === doc.wires) return was.held;
  const wired = new Set((doc.wires ?? []).map((w) => w.from.set));
  const held = new Set(sets.filter((b) => b.made && !b.opened && wired.has(b.id)).map((b) => b.id));
  heldBy.set(sets, { wires: doc.wires, held });
  return held;
}

/** Whether a set is held off the page (`heldSets`). */
export const isHeld = (doc: Pick<WorkspaceDocument, "sets" | "wires">, set: Pick<WorkflowSet, "id">): boolean => heldSets(doc).has(set.id);

/** Whether a set holds nothing, and has nothing to say: no member, none held in it, no table, number or chart, none not read or not kept - its members known (`members`), not looked for in its frame. */
const holdsNothing = (b: WorkflowSet): boolean =>
  !!b.members && !b.members.length && !b.collection?.length && !b.drawnCollection?.length && !b.table && b.number == null && !b.chart && !b.unread && !b.notKept?.count;

/** The sets of a page drawn nowhere, by its sets, wires and steps: worked out again only as one of them changes. */
const unseenBy = new WeakMap<readonly WorkflowSet[], { wires: readonly Wire[] | undefined; steps: readonly WorkflowStep[] | undefined; unseen: ReadonlySet<number> }>();

/**
 * The ids of a page's sets drawn nowhere: those held off it (`heldSets`);
 * and each set of an exit for what its step sets aside - the rest, or
 * those that failed (kinds `StepExit.of`) - that holds nothing and is wired
 * on to none, not run yet or given nothing: its exit's port on the card is
 * all there is of it (docs/WORKFLOWS.md, *Exits that set aside*). Given
 * anything, it is laid out as any set is, where its frame was, where that
 * is clear (place `placeAgain`).
 */
export function unseenSets(doc: Pick<WorkspaceDocument, "sets" | "wires" | "steps">): ReadonlySet<number> {
  const sets = doc.sets ?? [];
  const was = unseenBy.get(sets);
  if (was && was.wires === doc.wires && was.steps === doc.steps) return was.unseen;
  const held = heldSets(doc);
  const kinds = new Map((doc.steps ?? []).map((s) => [s.id, s.kind]));
  const aside = (b: WorkflowSet) => {
    const kind = b.made ? kinds.get(b.made.step) : undefined;
    return !!kind && !!exitsOf(kind).find((e) => e.id === b.made!.exit)?.of;
  };
  const now = new Set([...held, ...sets.filter((b) => !held.has(b.id) && !b.opened && aside(b) && holdsNothing(b)).map((b) => b.id)]);
  // (the same as before - a card moved, say - kept the same, so that what is drawn of them is not worked out again)
  const unseen = was && was.unseen.size === now.size && [...now].every((id) => was.unseen.has(id)) ? was.unseen : now;
  unseenBy.set(sets, { wires: doc.wires, steps: doc.steps, unseen });
  return unseen;
}

/** A page's sets that lie on it: all but those drawn nowhere (`unseenSets`). */
export function setsOnPage<T extends Pick<WorkflowSet, "id">>(doc: Pick<WorkspaceDocument, "sets" | "wires" | "steps">, sets: readonly T[]): T[] {
  const unseen = unseenSets(doc);
  return unseen.size ? sets.filter((b) => !unseen.has(b.id)) : [...sets];
}
