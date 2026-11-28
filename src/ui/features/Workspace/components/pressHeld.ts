/** Whether a pointer button is held anywhere in the window, for what moves the drawing as it is; and how many presses and keys the window has had. */
const held = { buttons: 0, acts: 0 };
/** What the window hears that the chemist does: a press, a key, a cut, copy or paste, an edit in a text, a drop - each one act. */
const ACTS = ["pointerdown", "keydown", "cut", "copy", "paste", "input", "drop"];
/** A press, a let-go, a key or the like, as the window hears it: the buttons held, and one more act for what the chemist did. */
export const heard = (e: { type: string; buttons?: number }): void => {
  if (ACTS.includes(e.type)) held.acts += 1;
  if (e.type === "pointercancel") held.buttons = 0;
  else if (e.type.startsWith("pointer") && e.buttons != null) held.buttons = e.buttons;
};
/** A command the chemist chose from the app's own menu bar, which reaches the page with no press and no key (App: Edit's Undo and Redo): one act. */
export const chosenFromMenu = (): void => void (held.acts += 1);
if (typeof window !== "undefined") {
  // (all the chemist does, counted as one: workflow/runShown)
  for (const type of ["pointerup", "pointercancel", ...ACTS]) window.addEventListener(type, (e) => heard(e as PointerEvent), true);
}

/** Whether a pointer button is held now: the drawing, and the words that belong to its structures, follow at once rather than ease. */
export const pressHeld = (): boolean => held.buttons !== 0;

/** How many things the chemist has done in the window - presses, keys, cuts, copies, pastes, edits in a text, drops, commands from the menu bar: compared before and after, whether they did anything between. */
export const actsSoFar = (): number => held.acts;

/** Whether a text is being written: a field, a text box or editable words (`el`, the one with the keys) have the keys. */
export const typing = (el: Element | null = typeof document !== "undefined" ? document.activeElement : null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
};
