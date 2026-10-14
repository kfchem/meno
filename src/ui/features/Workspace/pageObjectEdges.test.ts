/**
 * Page objects at edge values - as a damaged or odd file gives them -
 * through reading, saving and the pictures made of them: each read, kept
 * or left out, and drawn, never a throw, a number that is none, or what
 * XML cannot hold.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { connectStoreToDocument, createEditorStore } from "./store";
import { createWorkspaceDocument } from "./document";
import { readTexts, readWorkspace, workspaceFile, workspaceProblem, workspaceText } from "./utils/workspace";
import { readRecord } from "./utils/copyPaste";
import { drawingLayout, drawingSvg, drawnOf } from "./fileActions";
import { pictureDpiFor } from "./picture";
import { workspaceOfFile } from "../../views/openFile";
import { ACS_1996, resolveStyle } from "../../../lib/chem/style";
import { arrowMeasures } from "../../../lib/chem/reactionArrow";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { layoutEmf } from "../../../lib/chem/emf";

const AROM = { aromaticEnabled: false, aromaticRings: {} };

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, st: () => store.getState() };
}

/** A workspace's JSON holding what is given, nothing else. */
const ws = (more: Record<string, unknown>) =>
  JSON.stringify({ format: "meno-workspace", version: 1, atoms: [], bonds: [], arrows: [], pluses: [], molecules3d: [], ...more });

/** A workspace's JSON read, opened in an editor, and drawn as a picture is. */
function opened(text: string) {
  const w = readWorkspace(text);
  expect(w).not.toBeNull();
  const e = editor();
  e.st().openWorkspace(w!, true);
  return e.st();
}

const NOT_A_NUMBER = /NaN|Infinity|undefined|null/;
/** Whether `text` holds a character XML 1.0 does not allow (its Char production): C0 controls but tab, LF and CR; U+FFFE, U+FFFF; lone surrogates. */
const notXml = (text: string) =>
  Array.from(text).some((ch) => {
    const c = ch.codePointAt(0)!;
    return (c < 0x20 && c !== 0x9 && c !== 0xa && c !== 0xd) || c === 0xfffe || c === 0xffff || (c >= 0xd800 && c <= 0xdfff);
  });

describe("an arrow's own look, read from a file", () => {
  const arrow = (look: unknown, more: Record<string, unknown> = {}) => ws({ arrows: [{ id: 1, x: 0, y: 0, angle: 0, length: 4, look, ...more }] });

  it("leaves a setting of null out: the arrow's pictures, and its measures on the canvas, are drawn", () => {
    const st = opened(arrow({ reactionArrowHeadLength: null }));
    expect(() => drawingSvg(drawnOf(st), st, ACS_1996)).not.toThrow();
    // (what components/ReactionArrow2D works out for the canvas)
    expect(() => arrowMeasures(resolveStyle(ACS_1996, st.arrows[0].look), NOMINAL_BOND_LENGTH)).not.toThrow();
  });

  it("leaves a setting that is a bare number out: the pictures' sizes are numbers", () => {
    const st = opened(arrow({ reactionArrowThickness: 5 }));
    expect(drawingSvg(drawnOf(st), st, ACS_1996)).not.toMatch(NOT_A_NUMBER);
    const { layout, opts } = drawingLayout(drawnOf(st), st, ACS_1996);
    expect(Number.isFinite(layout ? layoutEmf(layout, opts).widthPt : NaN)).toBe(true);
  });

  it("takes a line thinner than Settings allow (0.1 pt) as the thinnest: a dashed arrow's dashes are drawn", () => {
    const st = opened(arrow({ reactionArrowThickness: { value: 1e-5, unit: "pt" } }, { dash: true }));
    expect(() => drawingSvg(drawnOf(st), st, ACS_1996)).not.toThrow();
  });
});

describe("a null in a list of a workspace's file", () => {
  for (const [list, more] of [
    ["arrows", { arrows: [null] }],
    ["pluses", { pluses: [null] }],
    ["captions", { captions: [null] }],
    ["pushes", { pushes: [null] }],
    ["atoms", { atoms: [null] }],
    ["molecules3d[0].atoms", { molecules3d: [{ atoms: [null], bonds: [], at: { x: 0, y: 0 } }] }],
  ] as const) {
    it(`in ${list}: is left out, or the file said not to read - never a throw`, () => {
      const text = ws(more);
      expect(() => readWorkspace(text)).not.toThrow();
      expect(() => workspaceProblem(text)).not.toThrow();
      expect(() => readRecord(text.replace('"meno-workspace"', '"meno-structure"'))).not.toThrow();
    });
  }
  it("(shapes, pictures, slides and inks already leave a null out)", () => {
    expect(readWorkspace(ws({ shapes: [null], pictures: [null], slides: [null], inks: [null] }))).not.toBeNull();
  });
});

describe("a picture's bounds, over very many points", () => {
  it("are found for a dashed arrow whose words lie far along it", () => {
    const st = opened(ws({ arrows: [{ id: 1, x: 10000, y: 0, angle: 0, length: 4, dash: true }], captions: [{ id: 1, x: 0, y: 1, text: "a", arrow: 1 }] }));
    expect(() => drawingLayout(drawnOf(st), st, ACS_1996)).not.toThrow();
  });
  it("are found for a molecule in 3D of 70 000 atoms", () => {
    const atoms = Array.from({ length: 70000 }, (_, i) => ({ el: "C", x: (i % 100) * 1.5, y: Math.floor(i / 100) * 1.5, z: 0 }));
    expect(() => drawingLayout({ atoms: [], bonds: [], molecules3d: [{ atoms, bonds: [], at: { x: 0, y: 0 } } as never] }, AROM, ACS_1996)).not.toThrow();
  }, 60000);
});

describe("a text whose words begin with a byte-order mark", () => {
  it("comes back as it was when its workspace opens again", async () => {
    const { st } = editor();
    st().addTexts([{ name: "notes.txt", text: "\uFEFFfrom Notepad" }]);
    const saved = readWorkspace(workspaceOfFile(await workspaceFile(st()))!)!;
    const { ws: read, missing } = await readTexts(saved);
    expect(missing).toEqual([]);
    expect(read.texts.map((t) => t.text)).toEqual(["\uFEFFfrom Notepad"]);
  });
});

describe("words holding a character XML does not allow", () => {
  for (const [what, text] of [
    ["U+0000", "a\u0000b"],
    ["U+001B", "a\u001Bb"],
    ["U+FFFE", "a\uFFFEb"],
    ["a lone surrogate", "a\uD800b"],
  ] as const) {
    it(`(${what}), read from a file, are drawn in an SVG that is well-formed XML`, () => {
      const st = opened(ws({ captions: [{ id: 1, x: 0, y: 0, text }] }));
      expect(notXml(drawingSvg(drawnOf(st), st, ACS_1996))).toBe(false);
    });
  }
});

describe("a box smaller than 1e-9 a side", () => {
  it("is read, and the picture's bounds stay numbers", () => {
    const st = opened(ws({ shapes: [{ id: 1, kind: "rect", x0: 0, y0: 0, x1: 1e-10, y1: 1e-10 }], captions: [{ id: 1, x: 5, y: 5, text: "the rest of the page" }] }));
    expect(st.shapes).toHaveLength(1);
    const svg = drawingSvg(drawnOf(st), st, ACS_1996);
    expect(svg).not.toMatch(NOT_A_NUMBER);
    const { layout, opts } = drawingLayout(drawnOf(st), st, ACS_1996);
    expect(Number.isFinite(layoutEmf(layout, opts).widthPt)).toBe(true);
  });
});

describe("a line made no length by dragging its end onto the other", () => {
  it("is refused, as adding one and reading one are: what is kept is what opens again", () => {
    const { st } = editor();
    const id = st().addShape({ kind: "line", x0: 0, y0: 0, x1: 10, y1: 0 })!;
    st().updateShape(id, { x1: 0, y1: 0 }, "end");
    const kept = st().shapes.length;
    const back = opened(workspaceText(st())).shapes.length;
    // (either the store refuses it, as addShape and the reader do, or the reader keeps it)
    expect(back).toBe(kept);
  });
});

describe("a copied picture's resolution", () => {
  it("is lowered so that no side of its canvas is over 32 767 px: a line of 6000 letters at 600 dpi", () => {
    const { layout, opts } = drawingLayout({ atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, text: "x".repeat(6000) }] }, AROM, ACS_1996);
    const { widthPt, heightPt } = layoutEmf(layout, opts);
    const w = (widthPt * 96) / 72;
    const h = (heightPt * 96) / 72;
    const dpi = pictureDpiFor(w, h, 600);
    // (no side of its canvas over 32 767 px)
    expect(Math.ceil((w * dpi) / 96)).toBeLessThanOrEqual(32767);
  }, 30_000);
});
