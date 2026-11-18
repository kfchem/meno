/**
 * The step after each change of the drawing (foundation part 15, phase 2; docs/EDITOR-2D.md, *When an edit turns a configuration*): the
 * drawing as it was after the last change compared with the drawing now (./changes), and each change of configuration said by a note at
 * its unit (`configurationNotes`, components/ConfigurationNotes2D) - its descriptors worked out off the drawing's thread (chem/cipRun).
 *
 * - Once a change is done: never while a gesture is still going (a drag says it once, as it ends), and never for undo or redo, which give
 *   back a drawing and its configuration as they were.
 * - Only the structures the change touched are read, in a moment the page is idle after the change has been drawn, so that neither the
 *   edit nor the next frame waits.
 * - Dropped where the drawing has changed again by the time the descriptors come.
 * - A change made by one of Meno's own moves (Clean-up, Turn over, Rotate...) is no change the move should make: it is said as that
 *   move's, and logged for a bug report.
 */
import type { DocumentStore } from "../../../../lib/doc";
import type { WorkspaceDocument } from "../document";
import type { EditorStore } from "../store";
import { gestureUnderWay } from "../store/gesture";
import type { ConfigurationNote, Model } from "../store/types";
import { cipMarksAsked } from "../chem/cipRun";
import type { CipMarks } from "../chem/cipMarks";
import { changeWords, configurationChanges, unitAtoms, type ConfigurationChange } from "./changes";

/**
 * Meno's own moves, by the name of the step each makes (docs/EDITOR-2D.md): each keeps every configuration as it was, and says so where it
 * did not.
 */
export const MENO_MOVES: Readonly<Record<string, string>> = {
  "clean up": "Clean-up",
  "turn over": "Turn over",
  "turn selection": "Rotate",
  "expand abbreviation": "Expand",
  "show as abbreviation": "Contract",
  "stack again": "Stack",
};

/** The descriptor of each unit, by "centre-<id>" or "bond-<id>", in `marks` (chem/cipMarks): R, S, E, Z, Ra... */
function descriptor(marks: CipMarks, model: Model, change: ConfigurationChange): string | undefined {
  if (change.unit.kind === "centre") return marks.centres.get(change.unit.at);
  const [p, q] = change.unit.at;
  const bond = model.bonds.find((b) => (b.a === p && b.b === q) || (b.a === q && b.b === p));
  return bond ? marks.doubleBonds.get(bond.id) : undefined;
}

/** What to ask the CIP of a drawing for the units given: their atoms, and the bonds between a double bond's or an axis's two ends. */
function unitsAsked(model: Model, changes: readonly ConfigurationChange[]): { atoms: number[]; bonds: number[] } {
  const atoms = new Set(model.atoms.map((a) => a.id));
  const centres = changes.filter((c) => c.unit.kind === "centre").map((c) => c.unit.at as number).filter((id) => atoms.has(id));
  const bonds = changes.flatMap((c) => {
    if (c.unit.kind === "centre") return [];
    const [p, q] = c.unit.at;
    const b = model.bonds.find((x) => (x.a === p && x.b === q) || (x.a === q && x.b === p));
    return b ? [b.id] : [];
  });
  return { atoms: centres, bonds };
}

/** Where a unit's note stands: by its atom, or between a double bond's or an axis's two. */
function placeOf(model: Model, change: ConfigurationChange): { x: number; y: number } | null {
  const at = unitAtoms(change.unit).map((id) => model.atoms.find((a) => a.id === id));
  if (at.some((a) => !a)) return null;
  return { x: at.reduce((t, a) => t + a!.x, 0) / at.length, y: at.reduce((t, a) => t + a!.y, 0) / at.length };
}

/**
 * The notes of `changes` from `before` to `after`, in words: each unit's descriptors asked of the CIP for both drawings (`ask`), `by`
 * naming Meno's move that made them.
 */
export async function notesOf(
  before: Model,
  after: Model,
  changes: readonly ConfigurationChange[],
  by: string | undefined,
  ask: typeof cipMarksAsked = cipMarksAsked,
): Promise<Omit<ConfigurationNote, "id" | "since">[]> {
  const named = changes.some((c) => c.how === "inverted" || c.how === "read");
  const [was, now] = named ? await Promise.all([ask(before, unitsAsked(before, changes)), ask(after, unitsAsked(after, changes))]) : [null, null];
  return changes.flatMap((c) => {
    const at = placeOf(after, c);
    if (!at) return [];
    const label = { was: was ? descriptor(was, before, c) : undefined, now: now ? descriptor(now, after, c) : undefined };
    return [{ text: changeWords(after, c, label, by), at }];
  });
}

let nextNote = 1;

/** The longest the step after a change waits for the page to be idle, in milliseconds. */
const IDLE_WITHIN_MS = 400;

/**
 * Watches `doc` and `store` for the step after each change (see the file's header); `ask` the CIP (tests give their own). Its end: what
 * stops it.
 */
export function watchConfiguration(store: EditorStore, doc: DocumentStore<WorkspaceDocument>, ask: typeof cipMarksAsked = cipMarksAsked): () => void {
  let stable: Model = doc.getState().model;
  let waiting = false;
  let timer: (() => void) | null = null;
  const run = () => {
    timer = null;
    if (gestureUnderWay(store.getState())) {
      waiting = true;
      return;
    }
    waiting = false;
    const before = stable;
    const state = doc.getState();
    const after = state.model;
    stable = after;
    if (before === after) return;
    const changes = configurationChanges(before, after);
    if (!changes.length) return;
    const step = doc.history().undoLabel;
    const by = step ? MENO_MOVES[step] : undefined;
    // (one of Meno's moves changed what the drawing states: never silent - said, and logged: ui/lib log `KNOWN`)
    if (by) console.warn(`Meno: ${by} changed a configuration`);
    void notesOf(before, after, changes, by, ask).then(
      (notes) => {
        // (the drawing changed again meanwhile: what they say is gone with it)
        if (!notes.length || doc.getState().model !== after) return;
        // (the chemist's step named with what it did - "move atoms: C3: R, now S" - where it is still the step undo would take back; a
        //  move of Meno's keeps its own name)
        if (!by && step) doc.named(`${step}: ${notes.map((n) => n.text).join("; ")}`, state);
        const since = performance.now();
        store.setState((s) => ({ configurationNotes: [...s.configurationNotes, ...notes.map((n) => ({ ...n, id: nextNote++, since }))] }));
      },
      () => {},
    );
  };
  // (in a moment the page is idle, where it has such moments: never in the way of the next frame or of what the chemist does next)
  const later = () => {
    if (timer != null) return;
    if (typeof requestIdleCallback === "function") {
      const asked = requestIdleCallback(run, { timeout: IDLE_WITHIN_MS });
      timer = () => cancelIdleCallback(asked);
    } else {
      const asked = setTimeout(run, 0);
      timer = () => clearTimeout(asked);
    }
  };
  const offDoc = doc.subscribe(() => {
    // (undone or redone: the drawing and its configuration as they were - nothing to say)
    if (doc.travelled()) {
      stable = doc.getState().model;
      return;
    }
    later();
  });
  const offStore = store.subscribe((s) => {
    if (waiting && !gestureUnderWay(s)) later();
  });
  return () => {
    offDoc();
    offStore();
    timer?.();
  };
}
