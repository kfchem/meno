import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDocument } from "../../lib/doc/document";
import TopBar from "./TopBar";
import UndoButton, { keepFocus } from "./UndoButton";

const ctl = { tabOrder: [], tabsById: {}, activeId: null, reorder() {}, select() {}, close() {}, add() {}, openFiles() {} };

describe("Undo in the title bar", () => {
  it("is always in the row, by Save and Settings - faint with no tab, or nothing to take back", () => {
    const html = renderToStaticMarkup(<TopBar ctl={ctl} mac />);
    expect(html.indexOf('aria-label="Undo"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="Undo"')).toBeLessThan(html.indexOf('aria-label="Save"'));
    expect(html.indexOf('aria-label="Save"')).toBeLessThan(html.indexOf('aria-label="Settings"'));
    expect(html).toMatch(/aria-label="Undo" aria-disabled="true"/);
    expect(renderToStaticMarkup(<UndoButton doc={createDocument({ n: 0 })} />)).toContain("opacity-40");
  });

  it("is on, as its neighbours are, with a step to take back", () => {
    const doc = createDocument({ n: 0 });
    doc.edit("add atom", (s) => ({ n: s.n + 1 }));
    const html = renderToStaticMarkup(<UndoButton doc={doc} />);
    expect(html).toContain('aria-disabled="false"');
    expect(html).not.toContain("opacity-40");
    expect(html).toContain("hover:bg-gray-200");
    expect(html).toContain("Undo Add atom");
  });

  it("leaves the focus, and so the selection, where it was when pressed", () => {
    const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    keepFocus(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
