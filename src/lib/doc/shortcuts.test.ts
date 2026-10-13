import { describe, expect, it } from "vitest";
import {
  addsToSelection,
  chargeStep,
  clipboardIntent,
  isCleanUpKey,
  isDeleteKey,
  isDeselectKey,
  isFitKey,
  isSelectAllKey,
  keepClipboard,
  keepPageUnselected,
  keepSystemMenuShut,
  openIntent,
  saveIntent,
  shortcutLabel,
  undoIntent,
} from "./shortcuts";

const key = (over: Partial<Parameters<typeof undoIntent>[0]> = {}) => ({
  key: "z",
  ctrlKey: true,
  ...over,
});

describe("undoIntent", () => {
  it("maps the usual combinations", () => {
    expect(undoIntent(key())).toBe("undo");
    expect(undoIntent(key({ shiftKey: true }))).toBe("redo");
    expect(undoIntent(key({ key: "y" }))).toBe("redo");
    expect(undoIntent(key({ key: "Z" }))).toBe("undo");
    expect(undoIntent(key({ ctrlKey: false, metaKey: true }))).toBe("undo");
  });

  it("ignores keys without the modifier, and other keys", () => {
    expect(undoIntent(key({ ctrlKey: false }))).toBeNull();
    expect(undoIntent(key({ key: "a" }))).toBeNull();
    expect(undoIntent(key({ key: "y", shiftKey: true }))).toBeNull();
  });

  it("leaves single-line inputs and rich-text hosts to the browser", () => {
    expect(undoIntent(key({ target: { tagName: "INPUT" } }))).toBeNull();
    expect(undoIntent(key({ target: { tagName: "SELECT" } }))).toBeNull();
    expect(undoIntent(key({ target: { isContentEditable: true } }))).toBeNull();
  });

  it("claims the text view's textarea, which a document backs", () => {
    expect(undoIntent(key({ target: { tagName: "TEXTAREA" } }))).toBe("undo");
    expect(undoIntent(key({ target: null }))).toBe("undo");
  });

  it("claims what a text Meno draws is typed through, as a textarea", () => {
    const field = { tagName: "DIV", dataset: { textField: "" } };
    expect(undoIntent(key({ target: field }))).toBe("undo");
    expect(isDeleteKey({ key: "Backspace", target: field })).toBe(false);
  });

  it("leaves a textarea that says so to the browser: words on the page, as they are written", () => {
    expect(undoIntent(key({ target: { tagName: "TEXTAREA", dataset: { nativeUndo: "" } } }))).toBeNull();
  });
});

describe("saveIntent", () => {
  it("saves on Ctrl/Cmd+S and saves as with Shift", () => {
    expect(saveIntent({ key: "s", ctrlKey: true })).toBe("save");
    expect(saveIntent({ key: "S", metaKey: true })).toBe("save");
    expect(saveIntent({ key: "s", metaKey: true, shiftKey: true })).toBe("saveAs");
  });

  it("leaves other keys and a bare S alone", () => {
    expect(saveIntent({ key: "s" })).toBeNull();
    expect(saveIntent({ key: "a", ctrlKey: true })).toBeNull();
  });
});

describe("isCleanUpKey", () => {
  it("is Ctrl/Cmd+Shift+K, outside text fields", () => {
    expect(isCleanUpKey({ key: "k", metaKey: true, shiftKey: true })).toBe(true);
    expect(isCleanUpKey({ key: "K", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isCleanUpKey({ key: "k", metaKey: true })).toBe(false);
    expect(isCleanUpKey({ key: "K", shiftKey: true })).toBe(false);
    expect(
      isCleanUpKey({
        key: "k",
        metaKey: true,
        shiftKey: true,
        target: { tagName: "INPUT" },
      }),
    ).toBe(false);
  });
});

describe("isDeleteKey", () => {
  it("is Delete or Backspace on its own, outside text fields", () => {
    expect(isDeleteKey({ key: "Delete" })).toBe(true);
    expect(isDeleteKey({ key: "Backspace" })).toBe(true);
    expect(isDeleteKey({ key: "Backspace", metaKey: true })).toBe(false);
    expect(isDeleteKey({ key: "d" })).toBe(false);
    expect(
      isDeleteKey({ key: "Backspace", target: { tagName: "TEXTAREA" } }),
    ).toBe(false);
  });
});

describe("selection keys", () => {
  it("adds to the selection with Ctrl, or ⌘ on a Mac (where Ctrl-click is a right-click)", () => {
    expect(addsToSelection({ ctrlKey: true }, false)).toBe(true);
    expect(addsToSelection({ metaKey: true }, false)).toBe(false);
    expect(addsToSelection({ metaKey: true }, true)).toBe(true);
    expect(addsToSelection({ ctrlKey: true }, true)).toBe(false);
  });

  it("selects everything on Ctrl/Cmd+A and lets go on Escape, but not in a text field", () => {
    expect(isSelectAllKey({ key: "a", ctrlKey: true })).toBe(true);
    expect(isSelectAllKey({ key: "A", metaKey: true })).toBe(true);
    expect(isSelectAllKey({ key: "a", ctrlKey: true, target: { tagName: "INPUT" } })).toBe(false);
    expect(isSelectAllKey({ key: "a", ctrlKey: true, target: { tagName: "TEXTAREA" } })).toBe(false);
    expect(isDeselectKey({ key: "Escape" })).toBe(true);
    expect(isDeselectKey({ key: "Escape", target: { tagName: "INPUT" } })).toBe(false);
  });

  it("never lets Ctrl/Cmd+A select the app's own words, but leaves text fields theirs", () => {
    const pressed = (over: Partial<Parameters<typeof isSelectAllKey>[0]>) => {
      let prevented = false;
      keepPageUnselected({ key: "a", ctrlKey: true, ...over, preventDefault: () => (prevented = true) });
      return prevented;
    };
    // on the page itself - a start page, a canvas, a button
    expect(pressed({ target: { tagName: "DIV" } })).toBe(true);
    expect(pressed({ target: { tagName: "BUTTON" } })).toBe(true);
    expect(pressed({ ctrlKey: false, metaKey: true, target: { tagName: "BODY" } })).toBe(true);
    // in a text field, its own select-all
    expect(pressed({ target: { tagName: "INPUT" } })).toBe(false);
    expect(pressed({ target: { tagName: "TEXTAREA" } })).toBe(false);
    expect(pressed({ target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    // other keys go by
    expect(pressed({ key: "c" })).toBe(false);
    expect(pressed({ shiftKey: true })).toBe(false);
  });

  it("holds Ctrl/Cmd+C and +X back when there is nothing to copy, and only then", () => {
    const none = { isCollapsed: true };
    const pressed = (
      over: Partial<Parameters<typeof isSelectAllKey>[0]>,
      selection: { isCollapsed: boolean } | null = none,
    ) => {
      let prevented = false;
      keepClipboard({ key: "c", metaKey: true, ...over, preventDefault: () => (prevented = true) }, selection);
      return prevented;
    };
    // nothing selected on the page: a start page, a button
    expect(pressed({ target: { tagName: "DIV" } })).toBe(true);
    expect(pressed({ target: { tagName: "BUTTON" } }, null)).toBe(true);
    expect(pressed({ key: "x", target: { tagName: "BODY" } })).toBe(true);
    expect(pressed({ metaKey: false, ctrlKey: true, key: "C", target: { tagName: "DIV" } })).toBe(true);
    // text selected on the page: it copies
    expect(pressed({ target: { tagName: "DIV" } }, { isCollapsed: false })).toBe(false);
    // a text field copies its own text
    expect(pressed({ target: { tagName: "INPUT" } })).toBe(false);
    expect(pressed({ target: { tagName: "TEXTAREA" } })).toBe(false);
    // other keys go by
    expect(pressed({ key: "v" })).toBe(false);
    expect(pressed({ shiftKey: true })).toBe(false);
    expect(pressed({ altKey: true })).toBe(false);
  });
});

describe("keepSystemMenuShut", () => {
  // (0.1.11: a right-click on Settings, the tab bar - anywhere but Meno's
  // own menus - showed the webview's menu, its one item Reload, which starts
  // the whole window afresh)
  const shut = (target: unknown) => {
    let prevented = false;
    keepSystemMenuShut({ target, preventDefault: () => (prevented = true) });
    return prevented;
  };

  it("keeps the system's menu shut on what is not typed in", () => {
    for (const tagName of ["DIV", "BODY", "BUTTON", "CANVAS", "SPAN", "IMG", "SELECT"]) expect(shut({ tagName }), tagName).toBe(true);
    for (const type of ["checkbox", "radio", "range", "button", "color"]) expect(shut({ tagName: "INPUT", type }), type).toBe(true);
    expect(shut(null)).toBe(true);
    expect(shut(undefined)).toBe(true);
    // (the column's text, which Meno draws: what it is typed through is no field the system edits - its menu there was Reload alone)
    expect(shut({ tagName: "DIV", dataset: { textField: "" } })).toBe(true);
  });

  it("lets it show where the system edits the words: its Cut, Copy and Paste", () => {
    expect(shut({ tagName: "INPUT" })).toBe(false);
    for (const type of ["text", "search", "number", "password", "TEXT"]) expect(shut({ tagName: "INPUT", type }), type).toBe(false);
    expect(shut({ tagName: "TEXTAREA" })).toBe(false);
    expect(shut({ tagName: "TEXTAREA", dataset: { nativeUndo: "" } })).toBe(false);
    expect(shut({ tagName: "SPAN", isContentEditable: true })).toBe(false);
  });
});

describe("chargeStep", () => {
  it("is + or - on its own, outside text fields", () => {
    expect(chargeStep({ key: "+" })).toBe(1);
    expect(chargeStep({ key: "+", shiftKey: true })).toBe(1);
    expect(chargeStep({ key: "-" })).toBe(-1);
    expect(chargeStep({ key: "=" })).toBe(0);
    // Ctrl or Cmd with them zoom
    expect(chargeStep({ key: "+", metaKey: true })).toBe(0);
    expect(chargeStep({ key: "-", ctrlKey: true })).toBe(0);
    expect(chargeStep({ key: "-", target: { tagName: "INPUT" } })).toBe(0);
  });
});

describe("clipboardIntent", () => {
  it("copies, cuts and pastes on Ctrl/Cmd with C, X and V, but not in a text field", () => {
    expect(clipboardIntent({ key: "c", metaKey: true })).toBe("copy");
    expect(clipboardIntent({ key: "X", ctrlKey: true })).toBe("cut");
    expect(clipboardIntent({ key: "v", ctrlKey: true })).toBe("paste");
    expect(clipboardIntent({ key: "v" })).toBeNull();
    expect(clipboardIntent({ key: "v", ctrlKey: true, shiftKey: true })).toBeNull();
    expect(clipboardIntent({ key: "c", metaKey: true, target: { tagName: "INPUT" } })).toBeNull();
    expect(clipboardIntent({ key: "c", metaKey: true, target: { tagName: "TEXTAREA" } })).toBeNull();
  });
});

describe("openIntent, isFitKey and shortcutLabel", () => {
  it("opens with Ctrl/Cmd+O, from anywhere", () => {
    expect(openIntent({ key: "o", metaKey: true })).toBe(true);
    expect(openIntent({ key: "O", ctrlKey: true, target: { tagName: "INPUT" } })).toBe(true);
    expect(openIntent({ key: "o", metaKey: true, shiftKey: true })).toBe(false);
    expect(openIntent({ key: "o" })).toBe(false);
  });

  it("fits with Ctrl/Cmd+1, but not in a text field", () => {
    expect(isFitKey({ key: "1", metaKey: true })).toBe(true);
    expect(isFitKey({ key: "1", ctrlKey: true })).toBe(true);
    expect(isFitKey({ key: "1" })).toBe(false);
    expect(isFitKey({ key: "!", metaKey: true, shiftKey: true })).toBe(false);
    expect(isFitKey({ key: "1", metaKey: true, target: { tagName: "INPUT" } })).toBe(false);
  });

  it("writes a shortcut as each system's menus do", () => {
    expect(shortcutLabel("S", false, true)).toBe("\u2318S");
    expect(shortcutLabel("S", true, true)).toBe("\u21e7\u2318S");
    expect(shortcutLabel("S", true, false)).toBe("Ctrl+Shift+S");
    expect(shortcutLabel("1", false, false)).toBe("Ctrl+1");
  });
});
