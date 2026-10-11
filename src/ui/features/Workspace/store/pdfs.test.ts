import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, isBlankDocument } from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import {
  ICON_HEIGHT,
  ICON_NAME_PT,
  ICON_NAME_WIDTH,
  ICON_TO_NAME,
  iconScale,
  pdfBounds,
  POINT,
  rowSheets,
  shownSheet,
  spreadColumns,
  spreadOrder,
  spreadPageAt,
  spreadSheets,
  stackSheets,
  topSheet,
  UNDER_MOST,
} from "../../../../lib/pdf/layout";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

const SHA = "a".repeat(64);
const SHA2 = "b".repeat(64);
const A4: [number, number] = [595, 842];

function editor(data?: unknown) {
  const doc = createWorkspaceDocument(data);
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("PDFs on the page", () => {
  it("are put down in a row, moved, turned, spread and deleted, each one step", () => {
    const { doc, state } = editor();
    state().addPdfs(
      [
        { name: "paper.pdf", sha256: SHA, pages: [A4, A4, A4] },
        { name: "si.pdf", sha256: SHA2, pages: [A4] },
      ],
      { x: 10, y: 20 },
    );
    const [a, b] = state().pdfs;
    // (each an icon at first, the second to the right of the first, clear of it and of its name)
    expect(a).toMatchObject({ name: "paper.pdf", x: 10, y: 20, page: 0, icon: true });
    expect(b.icon).toBe(true);
    expect(pdfBounds(b).x0).toBeGreaterThan(pdfBounds(a).x1);
    expect(b.x - a.x).toBeGreaterThanOrEqual(ICON_NAME_WIDTH);
    expect(isBlankDocument(doc.getState())).toBe(false);
    expect(doc.history().undoDepth).toBe(1);

    for (const x of [11, 12, 13]) state().movePdf(a.id, x, 20, "drag");
    expect(state().pdfs[0].x).toBe(13);
    expect(doc.history().undoDepth).toBe(2);

    state().turnPdf(a.id, 2);
    expect(state().pdfs[0].page).toBe(2);
    // (no page past the last)
    state().turnPdf(a.id, 3);
    expect(state().pdfs[0].page).toBe(2);

    state().spreadPdf(a.id, true);
    expect(state().pdfs[0].spread).toBe(true);
    state().spreadPdf(a.id, false);
    expect(state().pdfs[0].spread).toBeUndefined();

    state().removePdf(b.id);
    expect(state().pdfs.map((p) => p.name)).toEqual(["paper.pdf"]);
    doc.undo();
    expect(state().pdfs.map((p) => p.name)).toEqual(["paper.pdf", "si.pdf"]);
  });

  it("put down where others lie already, lie clear of them, names and all", () => {
    const { state } = editor();
    state().addPdfs([{ name: "paper.pdf", sha256: SHA, pages: [A4] }], { x: 0, y: 0 });
    state().addPdfs([{ name: "si.pdf", sha256: SHA2, pages: [A4] }], { x: 0, y: 0 });
    const [a, b] = state().pdfs;
    expect(b.x - a.x).toBeGreaterThanOrEqual(ICON_NAME_WIDTH);
    expect(b.y).toBe(a.y);
  });

  it("are made icons, their pages gathered, and full size again, each one step, and saved so", () => {
    const { doc, state } = editor();
    state().addPdfs([{ name: "paper.pdf", sha256: SHA, pages: [A4, A4] }], { x: 0, y: 0 });
    state().spreadPdf(1, true);
    state().iconPdf(1, true);
    expect(state().pdfs[0]).toMatchObject({ icon: true });
    expect(state().pdfs[0].spread).toBeUndefined();
    expect(readWorkspace(workspaceText(state()))?.pdfs[0].icon).toBe(true);
    state().iconPdf(1, false);
    expect(state().pdfs[0].icon).toBeUndefined();
    expect(doc.history().undoDepth).toBe(4);
    doc.undo();
    expect(state().pdfs[0].icon).toBe(true);
  });

  it("are taken by a canvas opened for them", () => {
    const { state } = editor({ pdfs: [{ name: "paper.pdf", sha256: SHA, pages: [A4], size: 1000 }] });
    expect(state().pdfs).toEqual([{ id: 1, name: "paper.pdf", sha256: SHA, pages: [A4], x: 0, y: 0, page: 0, icon: true }]);
  });

  it("leave out what is not a PDF held", () => {
    const { state } = editor();
    state().addPdfs(
      [
        { name: "no sha", sha256: "x", pages: [A4] },
        { name: "no pages", sha256: SHA, pages: [] },
      ],
      { x: 0, y: 0 },
    );
    expect(state().pdfs).toEqual([]);
  });

  it("are saved with the workspace and read back as they lay", () => {
    const { state } = editor();
    state().addPdfs([{ name: "paper.pdf", sha256: SHA, pages: [A4, [612, 792]] }], { x: 3, y: 4 });
    state().turnPdf(1, 1);
    state().spreadPdf(1, true);
    const ws = readWorkspace(workspaceText(state()));
    expect(ws?.pdfs).toEqual([{ name: "paper.pdf", sha256: SHA, pages: [A4, [612, 792]], x: 3, y: 4, page: 1, spread: true }]);
    // (opened, as they were)
    const { state: again } = editor();
    again().openWorkspace(ws!, true);
    expect(again().pdfs).toEqual([{ id: 1, name: "paper.pdf", sha256: SHA, pages: [A4, [612, 792]], x: 3, y: 4, page: 1, spread: true }]);
  });

  it("spread, have a page put in a place of its own, going with the PDF, kept while gathered, and put back in their rows - each one step, and saved so", () => {
    const { doc, state } = editor();
    state().addPdfs([{ name: "paper.pdf", sha256: SHA, pages: [A4, A4, A4] }], { x: 0, y: 0 });
    state().spreadPdf(1, true);
    const rows = spreadSheets(state().pdfs[0]);
    // (a drag: one step, the page where it was let go, on top)
    for (const x of [100, 200, 300]) state().placePdfPage(1, 1, x, -50, "drag");
    expect(doc.history().undoDepth).toBe(3);
    expect(state().pdfs[0].placed).toEqual([{ page: 1, x: 300, y: -50 }]);
    expect(spreadSheets(state().pdfs[0])[1]).toMatchObject({ x: 300, y: -50 });
    expect(spreadSheets(state().pdfs[0])[2]).toEqual(rows[2]);
    // (another put down after it lies over it)
    state().placePdfPage(1, 0, 310, -50, "drag2");
    state().placePdfPage(1, 1, 290, -40, "drag3");
    expect(state().pdfs[0].placed!.map((q) => q.page)).toEqual([0, 1]);
    // (the PDF moved, they go with it)
    state().movePdf(1, 10, 0);
    expect(spreadSheets(state().pdfs[0])[1]).toMatchObject({ x: 300, y: -40 });
    // (gathered, and spread again: where they were put)
    state().spreadPdf(1, false);
    expect(state().pdfs[0].placed).toHaveLength(2);
    // (saved from where the PDF lies)
    expect(readWorkspace(workspaceText(state()))?.pdfs[0].placed).toEqual([
      { page: 0, x: 310, y: -50 },
      { page: 1, x: 290, y: -40 },
    ]);
    state().spreadPdf(1, true);
    expect(spreadSheets(state().pdfs[0])[0]).toMatchObject({ x: 320, y: -50 });
    // (put back in their rows: one step, undone)
    const depth = doc.history().undoDepth;
    state().pdfPagesInRows(1);
    expect(state().pdfs[0].placed).toBeUndefined();
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(state().pdfs[0].placed).toHaveLength(2);
    // (no page it has not)
    state().placePdfPage(1, 3, 0, 0);
    expect(state().pdfs[0].placed).toHaveLength(2);
  });

  it("are read from a workspace as far as they read", () => {
    const text = JSON.stringify({
      format: "meno-workspace",
      version: 1,
      atoms: [],
      bonds: [],
      arrows: [],
      pluses: [],
      molecules3d: [],
      pdfs: [
        { name: "ok.pdf", sha256: SHA, pages: [A4], x: 0, y: 0, page: 7 },
        { name: "bad sha", sha256: "../x", pages: [A4], x: 0, y: 0, page: 0 },
        { name: "bad pages", sha256: SHA, pages: [[0, 1]], x: 0, y: 0, page: 0 },
        { name: "bad place", sha256: SHA, pages: [A4], x: "0", y: 0, page: 0 },
        {
          name: "placed.pdf",
          sha256: SHA,
          pages: [A4, A4],
          x: 0,
          y: 0,
          page: 0,
          spread: true,
          placed: [{ page: 1, x: 5, y: 6 }, { page: 2, x: 0, y: 0 }, { page: 0, x: "1", y: 0 }, { page: 1, x: 7, y: 8 }],
        },
      ],
    });
    // (a page past the last is the first; a page placed as far as it reads, once, at its last place)
    expect(readWorkspace(text)?.pdfs).toEqual([
      { name: "ok.pdf", sha256: SHA, pages: [A4], x: 0, y: 0, page: 0 },
      { name: "placed.pdf", sha256: SHA, pages: [A4, A4], x: 0, y: 0, page: 0, spread: true, placed: [{ page: 1, x: 7, y: 8 }] },
    ]);
  });
});

describe("PDFs read in the column", () => {
  const three = { name: "paper.pdf", sha256: SHA, pages: [A4, A4, A4] };

  it("are named and shown there from their page on top, where they are read kept with them, no step to undo", () => {
    const { doc, state } = editor();
    state().addPdfs([three], { x: 0, y: 0 });
    state().turnPdf(1, 1);
    expect(doc.history().undoDepth).toBe(2);
    state().readPdf(1);
    expect(state().pdfs[0].reading).toEqual({ at: 1, zoom: 1 });
    expect(state()).toMatchObject({ pdfShown: 1, textsOpen: true, pdfFlight: { id: 1, page: 1, to: "column" } });
    state().setPdfReading(1, { at: 1.5, zoom: 2 });
    expect(state().pdfs[0].reading).toEqual({ at: 1.5, zoom: 2 });
    expect(doc.history().undoDepth).toBe(2);
    // (undone past and redone, it is still read where it was)
    doc.undo();
    expect(state().pdfs[0]).toMatchObject({ page: 0, reading: { at: 1.5, zoom: 2 } });
    doc.redo();
    expect(state().pdfs[0]).toMatchObject({ page: 1, reading: { at: 1.5, zoom: 2 } });
    expect(state().pdfShown).toBe(1);
  });

  it("bring the page they come to on top on the page, the pages turned there still undone", () => {
    const { doc, state } = editor();
    state().addPdfs([three], { x: 0, y: 0 });
    state().turnPdf(1, 2);
    state().readPdf(1);
    state().readToPage(1, 2, 1);
    expect(state().pdfs[0].page).toBe(1);
    expect(doc.history().undoDepth).toBe(2);
    // (the turn undone goes back to the page before it, and redone, to where the column is)
    doc.undo();
    expect(state().pdfs[0].page).toBe(0);
    doc.redo();
    expect(state().pdfs[0].page).toBe(1);
    // (from a page it is not on: nothing)
    state().readToPage(1, 0, 2);
    expect(state().pdfs[0].page).toBe(1);
  });

  it("read no longer, go back to the page, the column showing the text it holds or shutting", () => {
    const { state } = editor();
    state().addTexts([{ name: "notes.txt", text: "hello" }]);
    state().addPdfs([three, { ...three, name: "si.pdf", sha256: SHA2 }], { x: 0, y: 0 });
    state().readPdf(1);
    state().readPdf(2);
    expect(state().pdfShown).toBe(2);
    state().showPdf(1);
    expect(state().pdfShown).toBe(1);
    // (a text shown: the PDFs still read there, named)
    state().showText(state().texts[0].id);
    expect(state().pdfShown).toBeNull();
    state().showPdf(1);
    state().stopReadingPdf(1);
    expect(state().pdfs[0].reading).toBeUndefined();
    expect(state()).toMatchObject({ pdfShown: 2, textsOpen: true, pdfFlight: { id: 1, to: "page" } });
    state().stopReadingPdf(2);
    expect(state()).toMatchObject({ pdfShown: null, textShown: state().texts[0].id, textsOpen: true });
    state().removeText(state().texts[0].id);
    expect(state().textsOpen).toBe(false);
  });

  it("go back to the page as the column is hidden on them, and rise into it again as it is shown", () => {
    const { state } = editor();
    state().addTexts([{ name: "notes.txt", text: "hello" }]);
    state().addPdfs([three], { x: 0, y: 0 });
    state().readPdf(1);
    state().endPdfFlight();
    state().closeTexts();
    expect(state()).toMatchObject({ textsOpen: false, pdfShown: 1, pdfFlight: { id: 1, to: "page" } });
    state().readPdf(1);
    expect(state()).toMatchObject({ textsOpen: true, pdfFlight: { id: 1, to: "column" } });
    // (a text shown: nothing goes back)
    state().endPdfFlight();
    state().showText(state().texts[0].id);
    state().closeTexts();
    expect(state().pdfFlight).toBeNull();
  });

  it("deleted, are shown no longer; brought back, are shown again", () => {
    const { doc, state } = editor();
    state().addPdfs([three], { x: 0, y: 0 });
    state().readPdf(1);
    state().removePdf(1);
    expect(state()).toMatchObject({ pdfShown: null, textsOpen: false });
    doc.undo();
    expect(state()).toMatchObject({ pdfShown: 1, textsOpen: true });
  });

  it("are saved where they were read, the column showing the one it showed, and read back so", () => {
    const { state } = editor();
    state().addPdfs([three], { x: 0, y: 0 });
    state().readPdf(1);
    state().setPdfReading(1, { at: 2.25, zoom: 1.5 });
    const ws = readWorkspace(workspaceText(state()));
    expect(ws?.pdfs[0].reading).toEqual({ at: 2.25, zoom: 1.5 });
    expect(ws?.pdfShown).toBe(0);
    const { state: again } = editor();
    again().openWorkspace(ws!, true);
    expect(again()).toMatchObject({ pdfShown: 1, textsOpen: true });
    expect(again().pdfs[0].reading).toEqual({ at: 2.25, zoom: 1.5 });
    // (the column closed: none shown)
    again().closeTexts();
    expect(readWorkspace(workspaceText(again()))?.pdfShown).toBeUndefined();
  });

  it("are read as far as they can be: no further than the last page, neither far smaller nor far larger", () => {
    const { state } = editor();
    state().addPdfs([three], { x: 0, y: 0 });
    state().readPdf(1);
    state().setPdfReading(1, { at: 9, zoom: 100 });
    expect(state().pdfs[0].reading).toEqual({ at: 2.999, zoom: 8 });
    state().setPdfReading(1, { at: -1, zoom: 0 });
    expect(state().pdfs[0].reading).toEqual({ at: 0, zoom: 0.25 });
  });
});

describe("where a PDF's pages lie", () => {
  const p = { pages: Array.from({ length: 7 }, () => A4), x: 0, y: 0, page: 0 };

  it("as an icon: five times as tall as its name's type, the drawing's labels' - three and a half bonds - about its middle, its top page alone to be seen", () => {
    expect(ICON_HEIGHT).toBeCloseTo(ICON_TO_NAME * ICON_NAME_PT * POINT);
    expect(ICON_HEIGHT / NOMINAL_BOND_LENGTH).toBeCloseTo(50 / 14.4);
    const icon = { ...p, x: 5, y: 7, icon: true };
    const s = shownSheet(icon, 0)!;
    expect(s.h).toBeCloseTo(ICON_HEIGHT);
    expect(s.w / s.h).toBeCloseTo(595 / 842);
    expect(s).toMatchObject({ x: 5, y: 7 });
    expect(shownSheet(icon, 1)).toBeNull();
    const b = pdfBounds(icon);
    expect(b.y1 - b.y0).toBeLessThan(ICON_HEIGHT * 1.1);
    expect(iconScale(icon)).toBeCloseTo(ICON_HEIGHT / (842 * POINT));
  });

  it("stacked: the top page where the PDF is, at its printed size, a few sheets under it", () => {
    expect(topSheet(p)).toEqual({ x: 0, y: 0, w: 595 * POINT, h: 842 * POINT });
    const under = stackSheets(p);
    expect(under).toHaveLength(UNDER_MOST);
    // (each further down and to the right, the bottom first)
    expect(under[0].x).toBeGreaterThan(under[1].x);
    expect(under[0].y).toBeLessThan(under[1].y);
    expect(stackSheets({ ...p, pages: [A4] })).toEqual([]);
  });

  it("spread: in rows of four, the first page's top left where the stack's was", () => {
    expect(spreadColumns(7)).toBe(4);
    expect(spreadColumns(2)).toBe(2);
    const s = spreadSheets(p);
    expect(s).toHaveLength(7);
    const top = topSheet(p);
    expect(s[0].x - s[0].w / 2).toBeCloseTo(top.x - top.w / 2);
    expect(s[0].y + s[0].h / 2).toBeCloseTo(top.y + top.h / 2);
    expect(s[4].x).toBeCloseTo(s[0].x);
    expect(s[4].y).toBeLessThan(s[0].y - s[0].h);
    const b = pdfBounds({ ...p, spread: true });
    expect(b.x1 - b.x0).toBeGreaterThan(4 * s[0].w);
  });

  it("spread, a page in a place of its own: there, its row's place empty, lying over the others in the order they were put there", () => {
    const placed = { ...p, spread: true, placed: [{ page: 5, x: -1000, y: 0 }, { page: 2, x: -990, y: 5 }] };
    const s = spreadSheets(placed);
    expect(s[5]).toMatchObject({ x: -1000, y: 0 });
    expect(s[2]).toMatchObject({ x: -990, y: 5 });
    expect(s[0]).toEqual(rowSheets(p)[0]);
    expect(spreadOrder(placed)).toEqual([0, 1, 3, 4, 6, 5, 2]);
    // (the one on top where they lie over one another; none, off them all)
    expect(spreadPageAt(placed, { x: -995, y: 2 })).toBe(2);
    expect(spreadPageAt(placed, { x: -1000 - s[5].w / 2 + 1, y: 0 })).toBe(5);
    expect(spreadPageAt(placed, rowSheets(p)[5])).toBeNull();
    expect(spreadPageAt(placed, rowSheets(p)[4])).toBe(4);
    expect(pdfBounds(placed).x0).toBeLessThan(-1000);
  });
});
