/**
 * The title bar's Undo and the history it holds (UndoButton): what a click
 * does, when a press is a hold, and the list of steps it opens. Kept apart
 * from the drawing of it, so that each can be tried without a page.
 */
import type { DocumentStore, HistoryStep } from "../../lib/doc/document";
import { editFromMenu, editMenuState, fieldHasUndo, type EditCommand, type EditDone } from "../../lib/doc/editMenu";
import { shortcutLabel } from "../../lib/doc/shortcuts";

/** What the button needs of the tab in front's document. */
export type UndoDoc = Pick<DocumentStore<unknown>, "undo" | "redo" | "history" | "steps" | "travel" | "subscribe">;

/**
 * A click: one step back, as Edit > Undo and the keys take it - the field's
 * own undo where the focus is in a field that keeps one, else the document's
 * (`editFromMenu`, the one way of both).
 */
export function undoClick(o: { active: unknown; doc: UndoDoc | undefined; field: (command: EditCommand) => boolean }): EditDone {
  return editFromMenu("undo", o);
}

/** Whether a click has a step to take back: as Edit > Undo is on (`editMenuState`). */
export function canUndo(doc: UndoDoc | undefined, active: unknown): boolean {
  return editMenuState(doc ? doc.history() : null, active).undo;
}

/** Whether the history has anything in it to show: a step to take back or one to do again. */
export function hasHistory(doc: UndoDoc | undefined): boolean {
  const h = doc?.history();
  return !!h && h.undoDepth + h.redoDepth > 0;
}

/** A step as the chemist reads it: its label begun with a capital - or, made by a conversation, said as that conversation's. */
export function stepText(step: HistoryStep): string {
  const said = step.by ?? step.label;
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/** The button's tip: what it is, the next step back where there is one, its keys, and that holding it shows the history. */
export function undoTip(doc: UndoDoc | undefined, active: unknown, mac?: boolean): string {
  // (in a field that keeps its own undo, the click is the field's: its step is not known here)
  const next = fieldHasUndo(active) ? undefined : doc?.steps().back[0];
  const keys = shortcutLabel("Z", false, mac);
  return `${next ? `Undo ${stepText(next)}` : "Undo"} (${keys})\nHold for the history`;
}

/** A line of the history list: a step, `offset` from now (back below 0, forward above), or the mark of now (0). */
export type HistoryRow = { offset: number; text: string; forward: boolean };

/** The list's lines, top to bottom: the steps to do again, the farthest first; now; the steps to take back, the next first. */
export function historyRows(steps: { back: HistoryStep[]; forward: HistoryStep[] }): HistoryRow[] {
  const forward = steps.forward.map((s, i) => ({ offset: i + 1, text: stepText(s), forward: true })).reverse();
  const back = steps.back.map((s, i) => ({ offset: -(i + 1), text: stepText(s), forward: false }));
  return [...forward, { offset: 0, text: "Now", forward: false }, ...back];
}

/** Whether a line is lit while the step `pointed` at is: every step from now to it - what choosing it goes over. */
export function isLit(offset: number, pointed: number | null): boolean {
  if (pointed == null || pointed === 0 || offset === 0) return false;
  return Math.sign(offset) === Math.sign(pointed) && Math.abs(offset) <= Math.abs(pointed);
}

/** A step of the list chosen: the document gone there in one change (`travel`). */
export function chooseStep(doc: UndoDoc | undefined, offset: number): boolean {
  return !!doc && offset !== 0 && doc.travel(offset);
}

/** Timers as the window has them, given for tests. */
export type Timers = { set: (run: () => void, ms: number) => number; clear: (id: number) => void };
const windowTimers: Timers = { set: (run, ms) => window.setTimeout(run, ms), clear: (id) => window.clearTimeout(id) };

/**
 * A press on the button: held still for `wait()` ms (Meno's long press), it
 * opens the history - and the click that ends that press takes no step. A
 * press let go of sooner is a click; one moved off the button is nothing.
 */
export function pressHold(o: { wait: () => number; open: () => void; timers?: Timers }) {
  const timers = o.timers ?? windowTimers;
  let timer: number | null = null;
  let held = false;
  const stop = () => {
    if (timer != null) timers.clear(timer);
    timer = null;
  };
  return {
    /** The press begun (the main button, a pen or a finger). */
    down() {
      stop();
      held = false;
      timer = timers.set(() => {
        timer = null;
        held = true;
        o.open();
      }, o.wait());
    },
    /** Let go of, or moved off the button, or taken by the system: no hold now. */
    cancel: stop,
    /** A right-click: the history open at once, where it has anything in it. */
    rightClick(listed: boolean) {
      stop();
      if (listed) o.open();
    },
    /** The click that ends a press: whether it is a click to undo - not where that press was held to open the history. */
    click(): boolean {
      stop();
      const was = held;
      held = false;
      return !was;
    },
  };
}
