/**
 * Which of a page's sets lie on it, and which are held off it
 * (docs/WORKFLOWS.md, *Held results*): what placing, drawing and choosing
 * by frames skip. It reads the sets and wires alone, and imports neither
 * place nor run: both ask it, and workflow/held, which holds sets off the
 * page and lays them out again by both, imports them - no import comes
 * round to where it started.
 */
import type { WorkspaceDocument } from "../document";
import type { Wire, WorkflowSet } from "../store/types";

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

/** A page's sets that lie on it: all but those held (`heldSets`). */
export function setsOnPage<T extends Pick<WorkflowSet, "id">>(doc: Pick<WorkspaceDocument, "sets" | "wires">, sets: readonly T[]): T[] {
  const held = heldSets(doc);
  return held.size ? sets.filter((b) => !held.has(b.id)) : [...sets];
}
