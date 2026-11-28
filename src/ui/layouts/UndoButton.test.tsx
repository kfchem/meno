import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDocument } from "../../lib/doc/document";
import TopBar from "./TopBar";
import UndoButton from "./UndoButton";
import { keepPress } from "./pressKeepsPage";

const ctl = { tabOrder: [], tabsById: {}, activeId: null, reorder() {}, select() {}, close() {}, add() {}, openFiles() {} };

describe("Undo in the title bar", () => {
  it("is always in the row, by Save and Settings - faint with no tab, or nothing to take back", () => {
    const html = renderToStaticMarkup(<TopBar ctl={ctl} mac />);
    expect(html.indexOf('aria-label="Undo"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="Undo"')).toBeLessThan(html.indexOf('aria-label="Save"'));
    expect(html.indexOf('aria-label="Save"')).toBeLessThan(html.indexOf('aria-label="Settings"'));
    expect(html).toMatch(/aria-label="Undo" aria-disabled="true"/);
    expect(renderToStaticMarkup(<UndoButton doc={createDocument({ n: 0 })} />)).toContain('aria-disabled="true"');
    expect(html).toContain("aria-disabled:opacity-40");
  });

  it("is on, as its neighbours are, with a step to take back", () => {
    const doc = createDocument({ n: 0 });
    doc.edit("add atom", (s) => ({ n: s.n + 1 }));
    const html = renderToStaticMarkup(<UndoButton doc={doc} />);
    expect(html).toContain('aria-disabled="false"');
    expect(html).toContain("hover:bg-gh-hover");
    expect(html).toContain("Undo Add atom");
  });

  it("is no press on the page: it says it keeps the page, and a press on it leaves the focus - a field's caret - where it was", () => {
    const html = renderToStaticMarkup(<UndoButton doc={createDocument({ n: 0 })} />);
    expect(html).toMatch(/<button[^>]*data-keeps-page=""/);
    const button = { closest: (s: string) => (s === "[data-keeps-page]" ? button : null) };
    const e = { type: "mousedown", target: button, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    expect(keepPress(e)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
