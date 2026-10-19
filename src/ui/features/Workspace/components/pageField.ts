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

/**
 * Whether a key is Enter, no composition under way: as the browser names
 * it - or, where an input method is on, by the key pressed. A Japanese
 * input method on Windows gives every key as "Process" (keyCode 229), an
 * Enter with nothing being composed too, which was taken for another key:
 * Enter kept no label, and Enter straight after one kept drew nothing out.
 */
export function enterKey(e: Pick<KeyboardEvent, "key" | "code" | "keyCode" | "isComposing">, composing = false): boolean {
  if (e.isComposing || composing) return false;
  if (e.key === "Enter") return true;
  return (e.key === "Process" || e.keyCode === 229) && (e.code === "Enter" || e.code === "NumpadEnter");
}

/**
 * What a key straight after a label kept by Enter is to it (LabelTyping2D):
 * an Enter, plain - an input method's too - draws it out (`true`); any
 * other key lets it be (`false`); a key repeated or composed is none of
 * them (`null`).
 */
export function keyAfterKept(e: Pick<KeyboardEvent, "key" | "code" | "keyCode" | "isComposing" | "repeat" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey">): boolean | null {
  if (e.repeat || e.isComposing) return null;
  return enterKey(e) && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
}

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
  o: { label: string; lines: boolean; keep: (byEnter?: boolean) => void; letGo: () => void; key?: (e: KeyboardEvent) => boolean },
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
    // (an Enter, an input method on but nothing composed: Enter all the same)
    const enter = enterKey(e, !!ed.composing);
    if (!enter && (e.isComposing || e.keyCode === 229 || ed.composing)) return;
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();
    const stop = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (o.key?.(e)) {
      stop();
      field?.sync();
    } else if (enter && (!e.shiftKey || !o.lines) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      stop();
      o.keep(true);
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
