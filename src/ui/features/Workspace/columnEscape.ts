/** Escape shutting the column (TextColumn), plain, to be tested without a page. */
import { isDeselectKey } from "../../../lib/doc/shortcuts";
import { questionAsked } from "../../layouts/asking";
import { gestureUnderWay, wordsUnderWay } from "./store/gesture";
import type { EditorState } from "./store/types";
import { viewPanning } from "./components/viewGoal";

type Escaped = { key: string; target?: unknown; defaultPrevented: boolean; isComposing?: boolean };

/**
 * The Escapes Meno sends itself - a gesture let go by an undo made in it, by the window left, by a pinch taking over - each
 * marked as it is made: no key the chemist pressed, they end the gesture and never shut the column. Told apart by a mark of
 * Meno's own on the event, not by `isTrusted`: a test's keys are untrusted too, and so would be taken for Meno's.
 */
const sent = new WeakSet<object>();

/** Sends Escape (`made`) to the window (`to`) as Meno's own: what a gesture's own Escape lets go of, let go. */
export function sendEscape(
  to: EventTarget = window,
  made: () => Event = () => new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
): void {
  const e = made();
  sent.add(e);
  to.dispatchEvent(e);
}

/** Whether `e` is an Escape Meno sent itself (`sendEscape`). */
export function sentByMeno(e: object): boolean {
  return sent.has(e);
}

/**
 * Whether an Escape, once all on the window has heard it, is left for the
 * column, and shuts it as its own Hide does: the last thing Escape does,
 * after everything smaller has had it. Not one a text field had (its words'
 * own), nor one a card, a menu, a chip or an open list took
 * (`defaultPrevented`, as `escapeLeft` in controls/keys); not while a
 * gesture is under way or words are typed on the page (their own Escape
 * lets them go), nor while a question is asked over the window, nor in a
 * talk; and not while the search of PDFs is open or the column fills the
 * workspace, which Escape takes back first.
 */
export function escapeLeftForColumn(e: Escaped, s: EditorState, asked: () => boolean = questionAsked): boolean {
  return (
    isDeselectKey(e) &&
    !e.defaultPrevented &&
    !sentByMeno(e) &&
    s.textsOpen &&
    !s.presenting &&
    s.pdfFind == null &&
    !s.columnFilled &&
    !gestureUnderWay(s) &&
    !wordsUnderWay(s) &&
    !asked()
  );
}

/**
 * Escape shuts the column - asked once the key has gone round the window
 * (`later`), since a card or a menu opened over the page hears it after the
 * workspace does: a card it closed has taken it, and the column stays.
 */
export function shutColumnOnceHeard(
  e: Escaped,
  store: { getState: () => EditorState },
  later: (go: () => void) => void = (go) => void setTimeout(go, 0),
  asked?: () => boolean,
): void {
  // (a gesture under way as it was pressed - a box drawn, ink, the view panned: that Escape ends it, and nothing more - asked now,
  //  before the gesture's own end clears it)
  const st = store.getState();
  if (sentByMeno(e) || gestureUnderWay(st) || viewPanning()) return;
  later(() => {
    const s = store.getState();
    if (escapeLeftForColumn(e, s, asked)) s.closeTexts();
  });
}
