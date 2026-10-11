import { describe, expect, it } from "vitest";
import { createSVG, highlightTint, layoutMolecule, ringOfKey, ringTint, type Atom, type Bond } from "./layout2d";
import { acsWorldOptions } from "./acs";
import { colorRef, emfRecords, layoutEmf } from "./emf";

/**
 * Parts of a structure given a colour (docs/EDITOR-2D.md, *Colour*): drawn
 * in it, highlighted in it behind the drawing, or - a ring - filled with
 * it; the same on the canvas, in an SVG and in an EMF, all from the layout.
 */

const L = 1.5;
// a cyclohexanol: a ring of six, an O on its first atom
const ring = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, el: "C", x: L * Math.cos((Math.PI / 3) * i), y: L * Math.sin((Math.PI / 3) * i) }));
const atoms: Atom[] = [...ring, { id: 7, el: "O", x: 2 * L, y: 0 }];
const bonds: Bond[] = [...ring.map((_, i) => ({ a1: i, a2: (i + 1) % 6, order: 1 as const })), { a1: 0, a2: 6, order: 1 }];
const opts = (over = {}) => acsWorldOptions(atoms, bonds, { units: "world", ...over });

describe("a part's colour", () => {
  const coloured = atoms.map((a) => (a.id === 7 ? { ...a, color: "#d55e00" } : a));
  const cbonds = bonds.map((b, i) => (i === 6 ? { ...b, color: "#d55e00" } : b));
  const layout = layoutMolecule(coloured, cbonds, opts(), 60);

  it("is its label's, and its bond's lines' - the rest as the style has them", () => {
    const label = layout.texts.find((t) => t.atom === 6)!;
    expect(label.color).toBe("#d55e00");
    expect(layout.texts.filter((t) => t.atom != null && t.atom !== 6).every((t) => !t.color)).toBe(true);
    const lines = layout.lines.filter((l) => l.color === "#d55e00");
    expect(lines.length).toBeGreaterThan(0);
    expect(layout.lines.some((l) => !l.color)).toBe(true);
  });

  it("is written into an SVG as it is, and nothing that is not a colour is", () => {
    const svg = createSVG(layout, opts());
    expect(svg).toContain('stroke="#d55e00"');
    expect(svg).toContain('fill="#d55e00"');
    const bad = layoutMolecule(atoms.map((a) => (a.id === 7 ? { ...a, color: '"/><script>' } : a)), bonds, opts(), 60);
    expect(createSVG(bad, opts())).not.toContain("<script>");
  });

  it("is drawn in an EMF, a pen and a brush of its own", () => {
    const { emf } = layoutEmf(layout, opts());
    const records = emfRecords(emf)!;
    const colours = records
      .filter((r) => r.type === 95 || r.type === 39) // EXTCREATEPEN, CREATEBRUSHINDIRECT
      .map((r) => new DataView(r.body.buffer, r.body.byteOffset, r.body.byteLength).getUint32(r.type === 95 ? 32 : 8, true));
    expect(colours).toContain(colorRef("#d55e00"));
    const text = records.filter((r) => r.type === 24).map((r) => new DataView(r.body.buffer, r.body.byteOffset, r.body.byteLength).getUint32(0, true)); // SETTEXTCOLOR
    expect(text).toContain(colorRef("#d55e00"));
  });
});

describe("a part's highlight", () => {
  it("lies behind the drawing in a light tint of its colour, round its atoms and along its bonds", () => {
    const lit = atoms.map((a) => (a.id <= 2 ? { ...a, highlight: "#0072b2" } : a));
    const litBonds = bonds.map((b, i) => (i === 0 ? { ...b, highlight: "#0072b2" } : b));
    const layout = layoutMolecule(lit, litBonds, opts(), 60);
    expect(layout.under?.length).toBe(3);
    expect(layout.under!.every((u) => u.color === highlightTint("#0072b2"))).toBe(true);
    expect(highlightTint("#0072b2")).not.toBe("#0072b2");
    // (and in an SVG, first of all)
    const svg = createSVG(layout, opts());
    expect(svg.indexOf(highlightTint("#0072b2"))).toBeLessThan(svg.indexOf("<line"));
  });
});

describe("a ring's fill", () => {
  it("is the ring's outline, round it in order, in a tint of its colour", () => {
    const layout = layoutMolecule(atoms, bonds, opts({ ringFills: { "1-2-3-4-5-6": "#009e73" } }), 60);
    expect(layout.under).toHaveLength(1);
    expect(layout.under![0].color).toBe(ringTint("#009e73"));
    expect(layout.under![0].points).toHaveLength(6);
  });

  it("is none where its atoms are not one ring of bonds", () => {
    expect(ringOfKey(atoms, bonds, "1-2-3-4-5-6")).toHaveLength(6);
    expect(ringOfKey(atoms, bonds, "1-2-3-7")).toBeNull();
    expect(ringOfKey(atoms, bonds, "1-2-3-4-5-99")).toBeNull();
  });
});
