/**
 * Where the caret was as a question about the network came, given back as
 * it is answered, yes or no: a field it was asked from - Quick Add's, say -
 * takes Enter again at once, with no click to find it.
 */
type Focusable = { focus: (options?: FocusOptions) => void; isConnected: boolean };

let before: Focusable | null = null;

/** As a question comes: what had the caret kept - never a question's own button, nor the page itself (nothing had it). */
export function noteFocus(was: Element | null, inQuestion: (el: Element) => boolean): void {
  if (!was || !("focus" in was) || inQuestion(was) || was === was.ownerDocument?.body) return;
  before = was as unknown as Focusable;
}

/** As a question is answered: the caret back where it was, where that is still on the page; once. */
export function giveFocusBack(): void {
  const back = before;
  before = null;
  if (back?.isConnected) back.focus({ preventScroll: true });
}
