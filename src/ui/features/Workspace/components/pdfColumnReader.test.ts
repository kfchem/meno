import { beforeEach, describe, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { followLink, followsLink, goBack, isBackKey, linkHint, readerOf } from "./pdfColumnReader";
import { pointOn } from "../../../../lib/pdf/column";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

const A4: [number, number] = [595, 842];

function reading(pages = 12) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: Array.from({ length: pages }, () => A4) }], { x: 0, y: 0 });
  store.getState().readPdf(1);
  const r = readerOf(store);
  r.width = 440;
  r.tall = 800;
  r.take(store.getState().pdfs[0]);
  return { store, r };
}

/** Steps a sixtieth of a second each, until it rests; how many it took. */
function settle(r: ReturnType<typeof reading>["r"]): number {
  let n = 0;
  while (r.step(1 / 60) && n < 1000) n++;
  return n;
}

describe("a PDF double-clicked open in the column", () => {
  it("is no longer the PDF hovered on the canvas - the column lies over where it was: Delete, the page keys and a drop out of it, which act on the PDF hovered, do not act on it", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: [A4] }], { x: 0, y: 0 });
    // (double-clicked on its icon: hovered, as the canvas saw the pointer there)
    store.getState().setHoveredPdf(1);
    store.getState().readPdf(1);
    expect(store.getState().hoveredPdf).toBeNull();
    // (and shown again, from the column's tabs, the same)
    store.getState().setHoveredPdf(1);
    store.getState().showPdf(1);
    expect(store.getState().hoveredPdf).toBeNull();
    expect(store.getState().pdfs).toHaveLength(1);
  });
});

describe("the column's reader", () => {
  beforeEach(() => vi.mocked(openUrl).mockClear());

  it("comes to rest where it is sent, the page gone to most in view", () => {
    const { r } = reading();
    r.goTo(5);
    expect(settle(r)).toBeLessThan(200);
    expect(r.at).toBe(5);
    expect(r.pageNow().page).toBe(5);
    // (sent a hair short of a page, it still comes to rest)
    r.goal.at = 6.9995;
    expect(settle(r)).toBeLessThan(200);
  });

  it("is moved by fingers at once, and by a wheel's notch in time", () => {
    const { r } = reading();
    r.scrollBy(0, 300, true);
    expect(r.step(1 / 60)).toBe(false);
    const { top } = r.seen();
    expect(top).toBeCloseTo(300);
    r.scrollBy(0, 100, false);
    expect(r.step(1 / 60)).toBe(true);
    settle(r);
    expect(r.seen().top).toBeCloseTo(400);
  });

  it("goes no further than the pages: above the first, or past the last", () => {
    const { r } = reading(2);
    r.scrollBy(0, -500, true);
    expect(r.seen().top).toBe(0);
    r.scrollBy(0, 1e6, false);
    settle(r);
    const { l, top } = r.seen();
    expect(top).toBeCloseTo(l.height - r.tall);
  });

  it("is made larger about the pointer: what is under it stays under it", () => {
    const { r } = reading();
    r.goTo(2);
    settle(r);
    const before = (() => {
      const { l, top, left } = r.seen();
      return pointOn(l, left + 150, top + 300);
    })();
    r.zoomAt(2, 150, 300, false);
    settle(r);
    expect(r.zoom).toBeCloseTo(2);
    const { l, top, left } = r.seen();
    const after = pointOn(l, left + 150, top + 300);
    expect(after.page).toBe(before.page);
    expect(after.u).toBeCloseTo(before.u, 3);
    expect(after.v).toBeCloseTo(before.v, 3);
    r.fitWidth();
    settle(r);
    expect(r.zoom).toBeCloseTo(1);
  });

  it("follows a link in the PDF there, and comes back with Back; a web page opens in the browser, only the web's", () => {
    const { store, r } = reading();
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], page: 7, y: 400 });
    settle(r);
    expect(r.pageNow().page).toBe(7);
    expect(goBack(store, 1)).toBe(true);
    settle(r);
    expect(r.at).toBe(0);
    expect(goBack(store, 1)).toBe(false);
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], uri: "https://example.com/" });
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], uri: "javascript:alert(1)" });
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], uri: "file:///etc/passwd" });
    expect(vi.mocked(openUrl).mock.calls).toEqual([["https://example.com/"]]);
  });

  it("on the stack, the column not showing it, turns its page - Back turning it back", () => {
    const { store } = reading();
    store.getState().closeTexts();
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], page: 4 });
    expect(store.getState().pdfs[0].page).toBe(4);
    expect(goBack(store, 1)).toBe(true);
    expect(store.getState().pdfs[0].page).toBe(0);
  });

  it("goes to a place asked for as a PDF read no longer is read again, not to its top", () => {
    const { store, r } = reading();
    // (read no longer, the column still holding it as it shuts)
    store.getState().stopReadingPdf(1);
    r.take(store.getState().pdfs[0]);
    store.getState().readPdf(1);
    r.goToWhenRead(1, 7, 100, 0.3);
    r.take(store.getState().pdfs[0]);
    settle(r);
    expect(r.pageNow().page).toBe(7);
  });

  it("keeps to a place gone to as the column comes to its size - until it is moved otherwise", () => {
    const sent = (width: number, tall: number) => {
      const { r } = reading();
      r.width = width;
      r.tall = tall;
      r.goToWhenRead(1, 7, 400, 0.3);
      return r;
    };
    const there = sent(1200, 900);
    settle(there);
    // (sent before the column knew its size)
    const r = sent(440, 800);
    r.width = 1200;
    r.tall = 900;
    settle(r);
    expect(r.at).toBeCloseTo(there.at, 4);
    // (moved by a hand, it keeps no more to it)
    r.scrollBy(0, 300, true);
    const moved = r.at;
    r.width = 900;
    settle(r);
    expect(r.at).toBeCloseTo(moved, 4);
  });

  it("hears the system's Back keys", () => {
    const key = (k: Partial<KeyboardEvent>) => ({ metaKey: false, altKey: false, ctrlKey: false, key: "", code: "", ...k }) as KeyboardEvent;
    expect(isBackKey(key({ metaKey: true, key: "[" }))).toBe(true);
    expect(isBackKey(key({ altKey: true, key: "ArrowLeft" }))).toBe(true);
    expect(isBackKey(key({ key: "ArrowLeft" }))).toBe(false);
    expect(isBackKey(key({ ctrlKey: true, key: "[" }))).toBe(false);
  });
});

describe("a PDF's links", () => {
  it("are followed only by ⌘-click on a Mac, Ctrl+click elsewhere - a plain click is a click on the page", () => {
    const plain = { metaKey: false, ctrlKey: false };
    expect(followsLink(plain, true)).toBe(false);
    expect(followsLink(plain, false)).toBe(false);
    expect(followsLink({ metaKey: true, ctrlKey: false }, true)).toBe(true);
    expect(followsLink({ metaKey: false, ctrlKey: true }, true)).toBe(false);
    expect(followsLink({ metaKey: false, ctrlKey: true }, false)).toBe(true);
    expect(followsLink({ metaKey: true, ctrlKey: false }, false)).toBe(false);
  });

  it("say over them what that click does", () => {
    expect(linkHint({ rect: [0, 0, 1, 1], uri: " https://example.com/ " }, true)).toBe("\u2318-click to open https://example.com/");
    expect(linkHint({ rect: [0, 0, 1, 1], page: 2 }, false)).toBe("Ctrl+click to go to page 3");
    expect(linkHint({ rect: [0, 0, 1, 1] }, true)).toBe("");
  });
});
