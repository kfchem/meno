/**
 * The step after each change of the drawing (foundation part 15, phase 2; docs/EDITOR-2D.md, *When an edit turns a configuration*): the
 * drawing as it was after the last change compared with the drawing now (./changes), and each change of configuration said by a note at
 * its unit (`configurationNotes`, components/ConfigurationNotes2D) - its descriptors worked out off the drawing's thread (chem/cipRun).
 *
 * - Once a change is done: never while a gesture is still going (a drag says it once, as it ends), and never for undo or redo, which give
 *   back a drawing and its configuration as they were.
 * - What the structures the change touched state is kept at once, in the change's own step - a gesture's once it ends - so that no
 *   reader of what is kept takes it from before the change; the notes are said in a moment the page is idle after the change has been
 *   drawn, their descriptors asked of the CIP off the drawing's thread.
 * - Dropped where the drawing has changed again by the time the descriptors come.
 * - Nothing said of a unit the chemist changed by turning a stereo bond of its own, and nothing else there (./changes `turnedByHand`):
 *   its label shows it; the step keeps the action's own name where nothing else is said.
 * - A change made by one of Meno's own moves (Clean-up, Turn over, Rotate...) is no change the move should make: it is said as that
 *   move's, and logged for a bug report.
 */
import type { DocumentStore } from "../../../../lib/doc";
import type { WorkspaceDocument } from "../document";
import type { EditorStore } from "../store";
import { gestureUnderWay } from "../store/gesture";
import type { ConfigurationNote, Model } from "../store/types";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { atomNamesAsked, cipMarksAsked } from "../chem/cipRun";
import type { CipMarks } from "../chem/cipMarks";
import { changeWords, changesAgainstKept, partsTouched, readingOf, unitAtoms, type ConfigurationChange } from "./changes";
import { keptFrom, marksOnly, withKept } from "./kept";

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
  "gather into a stack": "Stack",
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

/** How far from its unit a note stands, in bonds: past the labels of the atoms bound to it. */
const NOTE_OUT = 1;

/**
 * Where a unit's note stands: by its atom, or by the middle of a double bond's or an axis's two - in the widest gap between the bonds there,
 * `NOTE_OUT` bonds out, so that it covers no bond and no label of an atom bound to it.
 */
export function placeOf(model: Model, change: ConfigurationChange): { x: number; y: number } | null {
  const ids = unitAtoms(change.unit);
  const at = ids.map((id) => model.atoms.find((a) => a.id === id));
  if (at.some((a) => !a)) return null;
  const middle = { x: at.reduce((t, a) => t + a!.x, 0) / at.length, y: at.reduce((t, a) => t + a!.y, 0) / at.length };
  // (every bond out of the unit's atoms, as a direction from its middle - a double bond's own two ends counted)
  const own = new Set(ids);
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const angles = model.bonds.flatMap((b) => {
    const [p, q] = own.has(b.a) ? [b.a, b.b] : own.has(b.b) ? [b.b, b.a] : [null, null];
    if (p == null || q == null) return [];
    // (a bond of the unit's own - a double bond's - points from its middle both ways, to each end; any other, to its far atom)
    const ends = own.has(q) ? [byId.get(p)!, byId.get(q)!] : [byId.get(q)!];
    // (an atom at the middle itself - an allene's or an axis's middle atom - gives no direction)
    return ends.filter((to) => to.x !== middle.x || to.y !== middle.y).map((to) => Math.atan2(to.y - middle.y, to.x - middle.x));
  });
  // (none: above it; else the middle of the widest gap between them, round the circle)
  let toward = Math.PI / 2;
  if (angles.length) {
    const sorted = [...angles].sort((p, q) => p - q);
    let widest = -1;
    sorted.forEach((a, k) => {
      const next = k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + 2 * Math.PI;
      if (next - a > widest) {
        widest = next - a;
        toward = a + widest / 2;
      }
    });
  }
  const out = NOTE_OUT * NOMINAL_BOND_LENGTH;
  return { x: middle.x + out * Math.cos(toward), y: middle.y + out * Math.sin(toward) };
}

/**
 * The notes of `changes` from `before` to `after`, in words: each unit's descriptors asked of the CIP for both drawings (`ask`), its atoms'
 * names in their own molecule (`name`: configuration/names), `by` naming Meno's move that made them.
 */
export async function notesOf(
  before: Model,
  after: Model,
  changes: readonly ConfigurationChange[],
  by: string | undefined,
  ask: typeof cipMarksAsked = cipMarksAsked,
  name: typeof atomNamesAsked = atomNamesAsked,
): Promise<Omit<ConfigurationNote, "id" | "since">[]> {
  const named = changes.some((c) => c.how !== "mirror");
  const ids = [...new Set(changes.flatMap((c) => (c.how === "mirror" ? [] : unitAtoms(c.unit))))].filter((id) => after.atoms.some((a) => a.id === id));
  // (each drawing's descriptors as its marks say them, what it keeps set aside: a note says what the marks turned to, against what was
  //  kept, and the CIP, given a drawing that keeps, takes what is kept - chem/identityOf)
  const [was, now, names] = named
    ? await Promise.all([ask(marksOnly(before), unitsAsked(before, changes)), ask(marksOnly(after), unitsAsked(after, changes)), name(after, ids).catch(() => undefined)])
    : [null, null, undefined];
  return changes.flatMap((c) => {
    const at = placeOf(after, c);
    if (!at) return [];
    const label = { was: was ? descriptor(was, before, c) : undefined, now: now ? descriptor(now, after, c) : undefined };
    return [{ text: changeWords(after, c, label, by, names), at }];
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
  /** A step made since the last look: its drawing before and after, its name, the document it came to, and the state its undo goes back to. */
  type Step = { before: Model; after: Model; label: string | undefined; state: WorkspaceDocument; undoTo: WorkspaceDocument | undefined; kept: boolean };
  let stable: Model = doc.getState().model;
  let steps: Step[] = [];
  let waiting = false;
  // (what is kept being written: no change of the chemist's to look at)
  let keeping = false;
  let timer: (() => void) | null = null;
  /**
   * What the structures a step touched state now, kept on their atoms and bonds - at once, in the step itself (`joinTop`), so that undo
   * takes it back with the drawing and no reader of what is kept takes it from before the change; not where there is no step - a file just
   * opened keeps it with the first change made to it. It asks no CIP.
   */
  const keepNow = (step: Step) => {
    if (step.kept || doc.getState() !== step.state || doc.history().undoDepth === 0) return;
    step.kept = true;
    const parts = partsTouched(step.before, step.after);
    if (!parts) return;
    const ids = new Set(parts.now.atoms.map((a) => a.id));
    const model = doc.getState().model;
    const kept = keptFrom(parts.now, readingOf(parts.now));
    if (withKept(model, ids, kept) === model) return;
    keeping = true;
    try {
      // (joined to the step that made the change, a click's as much as a drag's: one undo takes back the change and what it keeps)
      doc.edit(step.label ?? "keep configuration", (d) => ({ ...d, model: withKept(d.model, ids, kept) }), { joinTop: true, onto: step.state });
    } finally {
      keeping = false;
    }
    step.state = doc.getState();
    step.after = step.state.model;
  };
  const run = () => {
    timer = null;
    if (gestureUnderWay(store.getState())) {
      waiting = true;
      return;
    }
    waiting = false;
    // (a step made and done within one gesture - a click's turn of a bond, made while the press holds the view - kept now, before it is
    //  compared: else what its structures keep stays as it was before it, and every reader of what is kept - R and S among them - with it)
    const top = steps[steps.length - 1];
    if (top) keepNow(top);
    const taken = steps;
    steps = [];
    if (!taken.length) return;
    // (each step on its own, against what is kept: what it did said as its own - a chemist's turn never taken for the Clean-up after it)
    // (the chemist's own turn of a stereo bond at a unit says nothing of it - its label shows it; a move of Meno's says all it changed)
    const found = taken.map((step) =>
      step.before === step.after ? null : changesAgainstKept(step.before, step.after, { byHand: !(step.label && MENO_MOVES[step.label]) }),
    );
    const last = taken[taken.length - 1];
    stable = last.after;
    const now = stable;
    // (a unit's change said once in a look: two steps against one thing kept wrongly say it once, by the first)
    const said = new Set<string>();
    taken.forEach((step, k) => {
      const changes = (found[k]?.changes ?? []).filter((c) => {
        const key = `${c.unit.kind}:${JSON.stringify(c.unit.at)}:${c.how}`;
        if (said.has(key)) return false;
        said.add(key);
        return true;
      });
      if (!changes.length) return;
      const by = step.label ? MENO_MOVES[step.label] : undefined;
      // (one of Meno's moves changed what the drawing states: never silent - said, and logged: ui/lib log `KNOWN`)
      if (by) console.warn(`Meno: ${by} changed a configuration`);
      void notesOf(step.before, step.after, changes, by, ask).then(
        (notes) => {
          // (the drawing changed again meanwhile: what they say is gone with it)
          if (!notes.length || doc.getState().model !== now) return;
          // (the chemist's step named with what it did - "move atoms: C3: R, now S" - where it is still the step undo would take back; a
          //  move of Meno's keeps its own name)
          if (!by && step.label) doc.named(`${step.label}: ${notes.map((n) => n.text).join("; ")}`, step.state);
          const since = performance.now();
          store.setState((st) => ({ configurationNotes: [...st.configurationNotes, ...notes.map((n) => ({ ...n, id: nextNote++, since }))] }));
        },
        () => {},
      );
    });
  };
  // (in a moment the page is idle, where it has such moments - else after the next frame: never in the way of that frame, nor of what
  //  the chemist does next)
  const later = () => {
    if (timer != null) return;
    if (typeof requestIdleCallback === "function") {
      const asked = requestIdleCallback(run, { timeout: IDLE_WITHIN_MS });
      timer = () => cancelIdleCallback(asked);
    } else if (typeof requestAnimationFrame === "function") {
      let inner: ReturnType<typeof setTimeout> | null = null;
      const frame = requestAnimationFrame(() => (inner = setTimeout(run, 0)));
      timer = () => {
        cancelAnimationFrame(frame);
        if (inner != null) clearTimeout(inner);
      };
    } else {
      const asked = setTimeout(run, 0);
      timer = () => clearTimeout(asked);
    }
  };
  const offDoc = doc.subscribe(() => {
    if (keeping) return;
    const state = doc.getState();
    // (undone or redone, a file opened, the history rewritten: the drawing as it now is, with nothing to say - only an edit is said)
    if (doc.lastChange() !== "edit") {
      stable = state.model;
      steps = [];
      return;
    }
    const top = steps[steps.length - 1];
    const was = top ? top.after : stable;
    if (state.model === was) return;
    const undoTo = doc.peek("undo");
    const label = doc.history().undoLabel;
    // (an edit gone on with - a drag's next frame: the same step, its drawing now this)
    if (top && top.undoTo === undoTo) Object.assign(top, { after: state.model, label, state, kept: false });
    else steps.push({ before: was, after: state.model, label, state, undoTo, kept: false });
    // (kept at once, wherever no gesture is going on - a drag keeps once, as it ends; said when the page is idle)
    if (!gestureUnderWay(store.getState())) keepNow(steps[steps.length - 1]);
    later();
  });
  // (a gesture ended: its step kept at once - whether or not the look was put off for it - and looked at when the page is idle)
  let under = gestureUnderWay(store.getState());
  const offStore = store.subscribe((st) => {
    const was = under;
    under = gestureUnderWay(st);
    if (under || (!was && !waiting)) return;
    const top = steps[steps.length - 1];
    if (top) keepNow(top);
    if (waiting) later();
  });
  return () => {
    offDoc();
    offStore();
    timer?.();
  };
}
