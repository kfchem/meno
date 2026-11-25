/**
 * What a set's frame shows while the pointer is held (docs/WORKFLOWS.md,
 * *A set holds its members*): the set that letting go would give something
 * to "takes" it - its edge in Meno's colour, a wash of it over its room -
 * and the set that letting go would take something out of "lets go" of it -
 * its edge dashed grey. Read from the members the page has now and those it
 * had as the pointer went down: a set's members are settled as the edit is
 * made (workflow/model `membersSettled`), the same test that holds on letting
 * go, so a frame never shows what letting go would not do.
 *
 * Only what was on the page as the pointer went down is shown: a structure
 * drawn into a set, or one deleted from it, is no move in or out.
 */
import type { Member, WorkflowSet } from "../store/types";
import type { WorkspaceDocument } from "../document";

/** What a set's frame shows while the pointer is held. */
export type SetSign = "takes" | "letsGo";

type Page = Pick<WorkspaceDocument, "sets" | "model" | "molecules3d" | "pictures">;

/** Whether `m` is on `page`: a structure while all its atoms are, a molecule or a picture while it is. */
function onPage(m: Member, page: Page, atoms: ReadonlySet<number>): boolean {
  if ("structure" in m) return m.structure.every((id) => atoms.has(id));
  if ("molecule" in m) return !!page.molecules3d?.some((x) => x.id === m.molecule);
  return !!page.pictures?.some((x) => x.id === m.picture);
}

/** Whether `m` is among `list`: a structure where it shares an atom with one of them (drawn on, split or joined, it is the same member still). */
function among(m: Member, list: readonly Member[]): boolean {
  if ("structure" in m) return list.some((o) => "structure" in o && o.structure.some((id) => m.structure.includes(id)));
  if ("molecule" in m) return list.some((o) => "molecule" in o && o.molecule === m.molecule);
  return list.some((o) => "picture" in o && o.picture === m.picture);
}

/**
 * Each set that shows a sign while the pointer is held, by its id: "takes"
 * where it now holds something that was on the page, outside it, as the
 * pointer went down; else "letsGo" where something it held then is still on
 * the page and no longer its. None while nothing is held (`pressed` null).
 */
export function setSigns(pressed: Page | null, now: Page): Map<number, SetSign> {
  const signs = new Map<number, SetSign>();
  if (!pressed || pressed.sets === now.sets) return signs;
  const atomsThen = new Set(pressed.model.atoms.map((a) => a.id));
  const atomsNow = new Set(now.model.atoms.map((a) => a.id));
  const then = new Map((pressed.sets ?? []).map((b) => [b.id, b] as [number, WorkflowSet]));
  for (const set of now.sets ?? []) {
    const was = then.get(set.id);
    if (!was?.members || !set.members || was.members === set.members) continue;
    const before = was.members;
    const after = set.members;
    if (after.some((m) => !among(m, before) && onPage(m, pressed, atomsThen))) signs.set(set.id, "takes");
    else if (before.some((m) => !among(m, after) && onPage(m, now, atomsNow))) signs.set(set.id, "letsGo");
  }
  return signs;
}
