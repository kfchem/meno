/**
 * The field words Meno draws on the page are typed through - words on the
 * page (CaptionTyping2D), an atom's label (LabelTyping2D): the column's
 * field (TextEditor/typingField), kept out of sight under the canvas and
 * laid at the caret, so that the IME's candidates show there. Enter,
 * Escape and undo are the words' own, taken before the field takes the
 * keys; the keys gone elsewhere - a press away from the words, another
 * window - keep them.
 */
import { IS_MAC } from "../../../../lib/doc/shortcuts";
import { hasEditContext, typingField, type FieldHost, type TypingField } from "../../TextEditor/typingField";

/** What an editor of words on the page does besides what a field gives it: undo and redo its own. */
export type PageWords = FieldHost & { undo(): void; redo(): void };

/**
 * A field for `ed`, under the canvas `canvas`, focused: `keep` told when
 * Enter is pressed - with Shift too, where `lines` is false, as words on
 * one line have no other - or the keys go elsewhere; `letGo` when Escape
 * is. `key` is asked first about any other key, and takes it where it says
 * so. `dispose` takes it away.
 */
export function pageField(
  canvas: HTMLElement,
  ed: PageWords,
  o: { label: string; lines: boolean; keep: () => void; letGo: () => void; key?: (e: KeyboardEvent) => boolean },
): { field: TypingField; dispose: () => void } {
  const host = canvas.parentElement ?? document.body;
  const ec = hasEditContext();
  const el: HTMLElement = document.createElement(ec ? "div" : "textarea");
  // (its words not the document's until kept: its undo its own - and no drawing's shortcut while it has the keys)
  el.dataset.textField = "";
  el.dataset.nativeUndo = "";
  el.setAttribute("aria-label", o.label);
  if (el instanceof HTMLTextAreaElement) {
    el.spellcheck = false;
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("autocomplete", "off");
    el.wrap = "off";
  } else el.tabIndex = -1;
  Object.assign(el.style, {
    position: "absolute",
    margin: "0",
    padding: "0",
    border: "0",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre",
    opacity: "0",
    pointerEvents: "none",
    background: "transparent",
    ...(ec ? { inset: "0" } : {}),
  });
  host.appendChild(el);
  let field: TypingField | null = null;
  // (Enter, Escape and undo the words' own - before the field takes the keys)
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229 || ed.composing) return;
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();
    const stop = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (o.key?.(e)) {
      stop();
      field?.sync();
    } else if (e.key === "Enter" && (!e.shiftKey || !o.lines) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      stop();
      o.keep();
    } else if (e.key === "Escape") {
      stop();
      o.letGo();
    } else if (mod && key === "z") {
      stop();
      if (e.shiftKey) ed.redo();
      else ed.undo();
      field?.sync();
    } else if (!IS_MAC && e.ctrlKey && key === "y") {
      stop();
      ed.redo();
      field?.sync();
    }
  };
  el.addEventListener("keydown", onKey);
  field = typingField(el, ed);
  const f = field;
  // (the keys gone elsewhere - a press away from the words, another window: kept)
  const onBlur = () =>
    window.setTimeout(() => {
      if (document.activeElement !== el) o.keep();
    }, 0);
  el.addEventListener("blur", onBlur);
  f.focus();
  return {
    field: f,
    dispose: () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("blur", onBlur);
      f.dispose();
      el.remove();
    },
  };
}
