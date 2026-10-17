import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { createSVG, layoutMolecule } from "../../../../lib/chem/layout2d";
import { styleOf, DEFAULT_STYLE_CHOICE } from "../../../../lib/chem/style";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { createWorkspaceDocument, emptyWorkspaceDocument, bindRing } from "../document";
import { drawnOf, structureFileText } from "../fileActions";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Bond, Model } from "../store/types";
import { editorModelOf } from "../utils/io";
import { inBox } from "../utils/selection";
import { startStroke, strokeTarget } from "../utils/stroke";
import { laidOut } from "./cleanUp";
import { allylChain, etaHeld, etaRingAt, hapticStars, starsAtTheirAtoms, withTheirStars } from "./eta";
import { allylCurve } from "../../../../lib/chem/allylArc";
import { selectedParts } from "../components/selectionParts";

const L = NOMINAL_BOND_LENGTH;

/** A model drawn by hand: atoms and bonds added in order, ids from 1. */
function drawing() {
  let id = 1;
  const atoms: Model["atoms"] = [];
  const bonds: Bond[] = [];
  const atom = (el: string, x: number, y: number) => (atoms.push({ id, x: x * L, y: y * L, r: 0.9, el }), id++);
  const bond = (a: number, b: number, order: 1 | 2 | 3 = 1) => bonds.push({ id: id++, a, b, order, stereo: "none", stereoOrient: "principle" });
  const ring = (n: number, cx: number, cy: number, r: number) => {
    const ids = Array.from({ length: n }, (_, i) => atom("C", cx + r * Math.cos(Math.PI / 2 + (2 * Math.PI * i) / n), cy + r * Math.sin(Math.PI / 2 + (2 * Math.PI * i) / n)));
    ids.forEach((a, i) => bond(a, ids[(i + 1) % n], i % 2 === 0 && i < n - 1 ? 2 : 1));
    return ids;
  };
  return { atoms, bonds, atom, bond, ring, model: (): Model => ({ atoms: [...atoms], bonds: [...bonds] }) };
}

/** Ferrocene drawn by hand: Fe, two pentagons, a bond from the iron to each carbon. */
function ferroceneByHand() {
  const d = drawing();
  const fe = d.atom("Fe", 0, 0);
  const top = d.ring(5, 0, 1.6, 0.85);
  const bottom = d.ring(5, 0, -1.6, 0.85);
  for (const a of [...top, ...bottom]) d.bond(fe, a);
  return { model: d.model(), fe, top, bottom };
}

/** The eta bonds of a model: from its metal, to its star, binding its atoms. */
const etaOf = (m: Model) => m.bonds.filter((b) => b.endpoints?.length);

/** One ferrocene, its rings bound by one bond each to a star at its centre. */
function ferroceneEta() {
  const { model, fe, top, bottom } = ferroceneByHand();
  const keep = new Set([...top, ...bottom]);
  let doc = { ...emptyWorkspaceDocument(), model: { atoms: model.atoms, bonds: model.bonds.filter((b) => !(b.a === fe && keep.has(b.b))) }, nextId: 100 };
  doc = bindRing(doc, fe, top);
  doc = bindRing(doc, fe, bottom);
  return { doc, fe, top, bottom };
}

describe("a ligand bound through a ring or chain of its atoms (eta), drawn as one bond to its centre", () => {
  it("is bound by a bond drawn from the metal into the ring: a star at its centre, its endpoints the ring", () => {
    const { doc, fe, top } = ferroceneEta();
    const eta = etaOf(doc.model);
    expect(eta).toHaveLength(2);
    const b = eta[0];
    expect(b.a).toBe(fe);
    expect(b.endpoints).toEqual(top);
    expect(b.attach).toBe("all");
    const star = doc.model.atoms.find((a) => a.id === b.b)!;
    expect(star.el).toBe("*");
    const ring = doc.model.atoms.filter((a) => top.includes(a.id));
    expect(star.x).toBeCloseTo(ring.reduce((s, a) => s + a.x, 0) / 5, 9);
    expect(star.y).toBeCloseTo(ring.reduce((s, a) => s + a.y, 0) / 5, 9);
    expect(hapticStars(doc.model)).toEqual(new Set(eta.map((e) => e.b)));
  });

  it("is what a bond drawn from a metal ends on inside a ring, with no atom under the pointer - not from a carbon, not on an atom", () => {
    const { model, fe, top } = ferroceneByHand();
    const unbound = { atoms: model.atoms, bonds: model.bonds.filter((b) => b.a !== fe) };
    const centre = { x: 0, y: 1.6 * L };
    const t = strokeTarget(unbound, startStroke("bond", fe), centre, L);
    expect(t?.ring).toEqual(top);
    expect(t!.end.x).toBeCloseTo(centre.x, 6);
    expect(t!.end.y).toBeCloseTo(unbound.atoms.filter((a) => top.includes(a.id)).reduce((s, a) => s + a.y, 0) / 5, 6);
    // on a ring atom: that atom, as any bond
    const onAtom = unbound.atoms.find((a) => a.id === top[0])!;
    expect(strokeTarget(unbound, startStroke("bond", fe), onAtom, L)?.ring).toBeUndefined();
    // from a carbon into a ring: a new atom there, as before (a bridge drawn across)
    expect(strokeTarget(unbound, startStroke("bond", top[0]), { x: 0, y: -1.6 * L }, L)?.ring).toBeUndefined();
    // a ring already bound to the metal so is not bound again
    const { doc } = ferroceneEta();
    expect(etaRingAt(doc.model, fe, centre)).toBeNull();
  });

  it("is one undo step drawn through the store, the stroke ending inside the ring", () => {
    const { model, fe, top } = ferroceneByHand();
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: { atoms: model.atoms, bonds: model.bonds.filter((b) => b.a !== fe) }, nextId: 200 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    st().startExtend(fe, "bond");
    st().updateExtend(0.05 * L, 1.55 * L);
    st().commitExtend();
    const eta = etaOf(doc.getState().model);
    expect(eta).toHaveLength(1);
    expect(eta[0].endpoints).toEqual(top);
    expect(doc.getState().model.atoms.filter((a) => a.el === "C")).toHaveLength(10);
    doc.undo();
    expect(etaOf(doc.getState().model)).toHaveLength(0);
    expect(doc.getState().model.atoms.some((a) => a.el === "*")).toBe(false);
  });

  it("keeps its star where its ring is drawn, and out of the way of hover and selection", () => {
    const { doc, top } = ferroceneEta();
    const star = etaOf(doc.model)[0].b;
    // the ring moved without its star: the star drawn, and held, at the ring's centre
    const moved = doc.model.atoms.map((a) => (top.includes(a.id) ? { ...a, x: a.x + 2 } : a));
    const drawn = starsAtTheirAtoms(moved, doc.model);
    expect(drawn.find((a) => a.id === star)!.x).toBeCloseTo(2, 9);
    const held = etaHeld({ ...doc.model, atoms: moved }, doc.model);
    expect(held.atoms.find((a) => a.id === star)!.x).toBeCloseTo(2, 9);
    // a box round the star alone takes nothing; round the ring, the star with it
    expect(withTheirStars(doc.model, new Set([star]))).toEqual(new Set());
    const box = inBox(doc.model, { x: -L, y: 0.5 * L }, { x: L, y: 2.6 * L });
    expect(box.atoms.has(star)).toBe(true);
    expect(top.every((id) => box.atoms.has(id))).toBe(true);
    // the canvas's own hover lands on no star
    const onCanvas = createWorkspaceDocument();
    onCanvas.reset({ ...onCanvas.getState(), model: doc.model, nextId: doc.nextId });
    const store = createEditorStore(onCanvas);
    const at = doc.model.atoms.find((a) => a.id === star)!;
    expect(store.getState().findAtomNear(at.x, at.y, 0.2 * L)).toBeNull();
  });

  it("is drawn as one line from the metal that reaches the ring's centre, the star drawn as nothing", () => {
    const { doc, fe } = ferroceneEta();
    const m = doc.model;
    const atoms = m.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el }));
    const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE), { minLinePx: 0 });
    const lay = layoutMolecule(atoms, layoutBonds(m.bonds, new Map(m.atoms.map((a, i) => [a.id, i]))), opts, 40);
    expect(lay.texts.map((t) => t.text)).toEqual(["Fe"]);
    for (const b of etaOf(m)) {
      const star = m.atoms.find((a) => a.id === b.b)!;
      const metal = m.atoms.find((a) => a.id === fe)!;
      // (one line along the bond, its far end at the centre)
      const along = lay.lines.filter((l) => Math.abs((l.x2 - l.x1) * (star.y - metal.y) - (l.y2 - l.y1) * (star.x - metal.x)) < 1e-6 && Math.abs(l.x1 - metal.x) < 1e-6 && (l.x2 - l.x1) * (star.x - metal.x) + (l.y2 - l.y1) * (star.y - metal.y) > 0);
      expect(along).toHaveLength(1);
      expect(Math.hypot(along[0].x2 - star.x, along[0].y2 - star.y)).toBeLessThan(1e-6);
    }
  });
});

describe("Clean-up of a ligand drawn bonded atom by atom to its metal", () => {
  it("makes ferrocene's ten Fe-C bonds two bonds to the rings' centres", async () => {
    const laid = await laidOut(ferroceneByHand().model, styleOf(DEFAULT_STYLE_CHOICE));
    expect(etaOf(laid).map((b) => b.endpoints!.length)).toEqual([5, 5]);
    expect(laid.bonds.filter((b) => b.a === 1 || b.b === 1).every((b) => b.endpoints?.length)).toBe(true);
  });

  it("makes (benzene)Cr(CO)3's six Cr-C bonds one, its carbonyls kept", async () => {
    const d = drawing();
    const cr = d.atom("Cr", 0, 0);
    for (const a of d.ring(6, 0, 1.8, 1)) d.bond(cr, a);
    for (const [x, y] of [[-1, -0.8], [0, -1.2], [1, -0.8]]) {
      const c = d.atom("C", x, y);
      d.bond(cr, c);
      d.bond(c, d.atom("O", x * 1.8, y * 1.8), 3);
    }
    const laid = await laidOut(d.model(), styleOf(DEFAULT_STYLE_CHOICE));
    expect(etaOf(laid).map((b) => b.endpoints!.length)).toEqual([6]);
    expect(laid.bonds.filter((b) => (b.a === cr || b.b === cr) && !b.endpoints)).toHaveLength(3);
  });

  it("makes an allyl's three Pd-C bonds one (eta3), each Pd of the chloride dimer its own", async () => {
    const d = drawing();
    const p1 = d.atom("Pd", -1, 0);
    const p2 = d.atom("Pd", 1, 0);
    const cl1 = d.atom("Cl", 0, 0.9);
    const cl2 = d.atom("Cl", 0, -0.9);
    for (const [p, c] of [[p1, cl1], [p1, cl2], [p2, cl1], [p2, cl2]]) d.bond(p, c);
    for (const s of [-1, 1]) {
      const pd = s < 0 ? p1 : p2;
      const a = d.atom("C", s * 2.1, 0.9);
      const b = d.atom("C", s * 2.7, 0);
      const c = d.atom("C", s * 2.1, -0.9);
      d.bond(a, b, 2);
      d.bond(b, c);
      for (const x of [a, b, c]) d.bond(pd, x);
    }
    const laid = await laidOut(d.model(), styleOf(DEFAULT_STYLE_CHOICE));
    const eta = etaOf(laid);
    expect(eta.map((b) => b.endpoints!.length)).toEqual([3, 3]);
    expect(new Set(eta.map((b) => b.a))).toEqual(new Set([p1, p2]));
    // the bridging chlorides kept as drawn
    expect(laid.bonds.filter((b) => [cl1, cl2].includes(b.a) || [cl1, cl2].includes(b.b))).toHaveLength(4);
  });

  it("leaves two atoms bonded to a metal as drawn: a metallacyclopropane is drawn so too", async () => {
    const d = drawing();
    const pt = d.atom("Pt", 0, 0);
    const a = d.atom("C", -0.7, 1.2);
    const b = d.atom("C", 0.7, 1.2);
    d.bond(a, b, 2);
    d.bond(pt, a);
    d.bond(pt, b);
    d.bond(pt, d.atom("Cl", 0, -1.5));
    const laid = await laidOut(d.model(), styleOf(DEFAULT_STYLE_CHOICE));
    expect(etaOf(laid)).toEqual([]);
  });
});

describe("a ligand bound so, in a file", () => {
  const read = (text: string, kind: "mol" | "sdf") => editorModelOf(moleculesToEditorModel(readMoleculesFromText(text, kind)).model);

  it("is written as the multi-centre bond (V3000 ENDPTS, ATTACH=ALL) and read back to the same drawing, in MOL and SD", async () => {
    const laid = await laidOut(ferroceneByHand().model, styleOf(DEFAULT_STYLE_CHOICE));
    for (const path of ["ferrocene.mol", "ferrocene.sdf"]) {
      const s = { ...emptyWorkspaceDocument(), model: laid };
      const text = structureFileText(drawnOf(s as never), path);
      expect(text).toContain("V3000");
      expect(text.match(/ENDPTS=\(5 [\d ]+\) ATTACH=ALL/g)).toHaveLength(2);
      const back = read(text, path.endsWith(".sdf") ? "sdf" : "mol");
      expect(back.atoms.map((a) => a.el)).toEqual(laid.atoms.map((a) => a.el));
      expect(back.bonds).toHaveLength(laid.bonds.length);
      // each eta bond binding the same ring, by place in the file
      const placeOf = (m: Model) => new Map(m.atoms.map((a, i) => [a.id, i]));
      const ringsOf = (m: Model) =>
        etaOf(m)
          .map((b) => [...b.endpoints!].map((e) => placeOf(m).get(e)!).sort((p, q) => p - q).join(","))
          .sort();
      expect(ringsOf(back)).toEqual(ringsOf(laid));
      // each star at its ring's centre, as drawn
      for (const b of etaOf(back)) {
        const at = new Map(back.atoms.map((a) => [a.id, a]));
        const ring = b.endpoints!.map((e) => at.get(e)!);
        const star = at.get(b.b)!.el === "*" ? at.get(b.b)! : at.get(b.a)!;
        expect(star.el).toBe("*");
        const cx = ring.reduce((t, a) => t + a.x, 0) / ring.length;
        expect(Math.abs(star.x - cx)).toBeLessThan(0.01 * L);
      }
    }
  });

  it("drawn with a bond from the metal to each atom (V2000), is read as drawn, and is one bond to each ring's centre after Clean-up", async () => {
    const { model } = ferroceneByHand();
    const v2000 = structureFileText(drawnOf({ ...emptyWorkspaceDocument(), model } as never), "ferrocene.mol");
    expect(v2000).toContain("V2000");
    const back = read(v2000, "mol");
    expect(back.bonds).toHaveLength(20);
    expect(etaOf(back)).toEqual([]);
    const laid = await laidOut(back, styleOf(DEFAULT_STYLE_CHOICE));
    expect(etaOf(laid).map((b) => b.endpoints!.length)).toEqual([5, 5]);
  });
});

/** Zeise's anion drawn without its ethylene bound: Pt, three Cl, a C=C above the platinum. */
function zeise() {
  const d = drawing();
  const pt = d.atom("Pt", 0, 0);
  for (const [x, y] of [[-1, 0], [1, 0], [0, -1]]) d.bond(pt, d.atom("Cl", x, y));
  const c1 = d.atom("C", -0.5, 1.2);
  const c2 = d.atom("C", 0.5, 1.2);
  d.bond(c1, c2, 2);
  return { d, pt, c1, c2 };
}

describe("an alkene bound through both its carbons (eta2), drawn either way and kept as drawn", () => {
  it("is what a bond drawn from a metal ends on at a double bond's middle, with no atom under the pointer", () => {
    const { d, pt, c1, c2 } = zeise();
    const m = d.model();
    const t = strokeTarget(m, startStroke("bond", pt), { x: 0.02 * L, y: 1.25 * L }, L);
    expect(t?.ring).toEqual([c1, c2]);
    expect(t!.end.x).toBeCloseTo(0, 9);
    expect(t!.end.y).toBeCloseTo(1.2 * L, 9);
    // on a carbon: that carbon, as any bond
    expect(strokeTarget(m, startStroke("bond", pt), { x: -0.5 * L, y: 1.2 * L }, L)?.ring).toBeUndefined();
    // from a carbon, or off the bond's middle: no eta2
    expect(strokeTarget(m, startStroke("bond", c1), { x: 0, y: 1.25 * L }, L)?.ring).toBeUndefined();
    expect(strokeTarget(m, startStroke("bond", pt), { x: 0, y: 1.8 * L }, L)?.ring).toBeUndefined();
  });

  it("is one bond to a star at the bond's middle, one undo step, and goes with either carbon", () => {
    const { d, pt, c1, c2 } = zeise();
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: d.model(), nextId: 200 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    st().startExtend(pt, "bond");
    st().updateExtend(0, 1.22 * L);
    st().commitExtend();
    const [b] = etaOf(doc.getState().model);
    expect(b.endpoints).toEqual([c1, c2]);
    const star = doc.getState().model.atoms.find((a) => a.id === b.b)!;
    expect(star.el).toBe("*");
    expect(star.y).toBeCloseTo(1.2 * L, 9);
    st().deleteAtom(c2);
    expect(etaOf(doc.getState().model)).toEqual([]);
    expect(doc.getState().model.atoms.some((a) => a.el === "*")).toBe(false);
    doc.undo();
    expect(etaOf(doc.getState().model)).toHaveLength(1);
    doc.undo();
    expect(etaOf(doc.getState().model)).toEqual([]);
  });

  it("is drawn as one line from the metal to the bond's middle", () => {
    const { d, pt, c1, c2 } = zeise();
    const doc = bindRing({ ...emptyWorkspaceDocument(), model: d.model(), nextId: 100 }, pt, [c1, c2]);
    const m = doc.model;
    const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE), { minLinePx: 0 });
    const lay = layoutMolecule(m.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el })), layoutBonds(m.bonds, new Map(m.atoms.map((a, i) => [a.id, i]))), opts, 40);
    expect(lay.lines.some((l) => Math.abs(l.x2) < 1e-6 && Math.abs(l.y2 - 1.2 * L) < 1e-6 && Math.abs(l.x1) < 1e-6)).toBe(true);
    expect(lay.texts.map((t) => t.text).sort()).toEqual(["Cl", "Cl", "Cl", "Pt"]);
  });

  it("keeps both forms through Clean-up: one bond to the middle stays one, two bonds to the carbons stay two", async () => {
    const { d, pt, c1, c2 } = zeise();
    const eta2 = bindRing({ ...emptyWorkspaceDocument(), model: d.model(), nextId: 100 }, pt, [c1, c2]).model;
    const laid = await laidOut(eta2, styleOf(DEFAULT_STYLE_CHOICE));
    const [b] = etaOf(laid);
    expect(etaOf(laid)).toHaveLength(1);
    expect([...b.endpoints!].sort()).toEqual([c1, c2].sort());
    const at = new Map(laid.atoms.map((a) => [a.id, a]));
    expect(at.get(b.b)!.x).toBeCloseTo((at.get(c1)!.x + at.get(c2)!.x) / 2, 6);
    expect(laid.bonds.some((x) => !x.endpoints && [x.a, x.b].includes(pt) && [x.a, x.b].some((e) => e === c1 || e === c2))).toBe(false);
    // drawn as a metallacyclopropane, kept so
    d.bond(pt, c1);
    d.bond(pt, c2);
    const two = await laidOut(d.model(), styleOf(DEFAULT_STYLE_CHOICE));
    expect(etaOf(two)).toEqual([]);
    expect(two.bonds.filter((x) => [x.a, x.b].includes(pt) && [x.a, x.b].some((e) => e === c1 || e === c2))).toHaveLength(2);
  });

  it("is written as a multi-centre bond with the two carbons (V3000 ENDPTS) and read back to the same drawing", () => {
    const { d, pt, c1, c2 } = zeise();
    const m = bindRing({ ...emptyWorkspaceDocument(), model: d.model(), nextId: 100 }, pt, [c1, c2]).model;
    const text = structureFileText(drawnOf({ ...emptyWorkspaceDocument(), model: m } as never), "zeise.mol");
    expect(text).toMatch(/ENDPTS=\(2 \d+ \d+\) ATTACH=ALL/);
    const back = editorModelOf(moleculesToEditorModel(readMoleculesFromText(text, "mol")).model);
    expect(back.atoms.map((a) => a.el)).toEqual(m.atoms.map((a) => a.el));
    const [b] = etaOf(back);
    const place = new Map(back.atoms.map((a, i) => [a.id, i]));
    expect(b.endpoints!.map((e) => place.get(e))).toEqual([c1, c2].map((id) => m.atoms.findIndex((a) => a.id === id)));
    // and drawn with two bonds, written and read as two
    d.bond(pt, c1);
    d.bond(pt, c2);
    const two = structureFileText(drawnOf({ ...emptyWorkspaceDocument(), model: d.model() } as never), "zeise.mol");
    expect(two).not.toMatch(/ENDPTS/);
    expect(editorModelOf(moleculesToEditorModel(readMoleculesFromText(two, "mol")).model).bonds).toHaveLength(d.model().bonds.length);
  });
});

describe("an η3-allyl, drawn as its chain with a delocalisation curve just inside it (the maintainer, 2026-10-18; IUPAC GR-1.7.2, GR-6)", () => {
  /** A Pd allyl chloride as drawn: Pd below a chain C=C-C bent away from it, bound by one bond, and two chlorides. */
  function allylPd() {
    const d = drawing();
    const pd = d.atom("Pd", 0, 0);
    const a = d.atom("C", -0.87, 1.5);
    const m = d.atom("C", 0, 2);
    const c = d.atom("C", 0.87, 1.5);
    d.bond(a, m, 2);
    d.bond(m, c);
    d.bond(pd, d.atom("Cl", -1, -1));
    d.bond(pd, d.atom("Cl", 1, -1));
    const doc = bindRing({ ...emptyWorkspaceDocument(), model: d.model(), nextId: 100 }, pd, [a, m, c]);
    return { model: etaHeld(doc.model), pd, a, m, c };
  }
  const where = (model: Model) => new Map(model.atoms.map((x) => [x.id, x]));

  it("has its star - where the metal's line ends - at the middle of its curve, inside the chain, not at the chain's centre", () => {
    const { model, a, m, c } = allylPd();
    const at = where(model);
    const [b] = etaOf(model);
    const star = at.get(b.b)!;
    const expected = allylCurve(at.get(a)!, at.get(m)!, at.get(c)!).middle;
    expect(star.x).toBeCloseTo(expected.x, 9);
    expect(star.y).toBeCloseTo(expected.y, 9);
    // (inside the "^": under the middle carbon, above the line between the end carbons)
    expect(star.y).toBeLessThan(at.get(m)!.y);
    expect(star.y).toBeGreaterThan(at.get(a)!.y);
    // (moved with its atoms: there again where they are drawn)
    const moved = model.atoms.map((x) => ([a, m, c].includes(x.id) ? { ...x, x: x.x + 2 * L } : x));
    const shown = where({ ...model, atoms: starsAtTheirAtoms(moved, model) });
    expect(shown.get(b.b)!.x).toBeCloseTo(expected.x + 2 * L, 9);
  });

  it("is drawn as its chain, its curve just inside it and one line from the metal to the curve's middle - the file keeps its multi-centre bond", () => {
    const { model, pd, a, m, c } = allylPd();
    const at = where(model);
    const [b] = etaOf(model);
    expect(b.endpoints).toHaveLength(3);
    expect(b.attach).toBe("all");
    const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE), { minLinePx: 0 });
    const lay = layoutMolecule(model.atoms.map((x) => ({ id: x.id, x: x.x, y: x.y, el: x.el })), layoutBonds(model.bonds, new Map(model.atoms.map((x, i) => [x.id, i]))), opts, 40);
    const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;
    // (the curve: pieces end to end, just inside the chain, a double bond's spacing in the style from its bonds where it comes nearest)
    const curve = allylCurve(at.get(a)!, at.get(m)!, at.get(c)!, opts.doubleOffsetPx);
    const arc = curve.points;
    const fromBond = (p: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }) => Math.abs((v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x)) / Math.hypot(v.x - u.x, v.y - u.y);
    const nearest = Math.min(...arc.map((p) => Math.min(fromBond(p, at.get(m)!, at.get(a)!), fromBond(p, at.get(m)!, at.get(c)!))));
    expect(nearest).toBeCloseTo(opts.doubleOffsetPx, 6);
    // (the metal's line: pointing at the curve's middle, stopping short of it by a label's margin)
    const metal = at.get(pd)!;
    const margin = opts.labelMarginPx ?? opts.fontPx * 0.16;
    const line = lay.lines.find((l) => Math.abs(Math.hypot(l.x2 - curve.middle.x, l.y2 - curve.middle.y) - margin) < 1e-6)!;
    expect(line).toBeDefined();
    const along = ((line.x2 - line.x1) * (curve.middle.x - metal.x) + (line.y2 - line.y1) * (curve.middle.y - metal.y)) / (Math.hypot(line.x2 - line.x1, line.y2 - line.y1) * Math.hypot(curve.middle.x - metal.x, curve.middle.y - metal.y));
    expect(along).toBeCloseTo(1, 9);
    expect(lay.lines.some((l) => arc.some((p) => near({ x: l.x2, y: l.y2 }, p)) && l === line)).toBe(false);
    for (let k = 1; k < arc.length; k++) expect(lay.lines.some((l) => near({ x: l.x1, y: l.y1 }, arc[k - 1]) && near({ x: l.x2, y: l.y2 }, arc[k]))).toBe(true);
    // (and in a picture of it - SVG, and PNG and EMF from the same lines - the arc's pieces as drawn)
    const svg = createSVG(lay, opts);
    const piece = lay.lines.find((l) => near({ x: l.x1, y: l.y1 }, arc[0]) && near({ x: l.x2, y: l.y2 }, arc[1]))!;
    expect(svg).toContain(`<line x1="${piece.x1}" y1="${-piece.y1}" x2="${piece.x2}" y2="${-piece.y2}"`);
    // (its chain drawn as two single bonds, its C=C as drawn kept in the drawing: the arc says it is delocalised)
    const singles = { ...model, bonds: model.bonds.map((x) => (x.order === 2 ? { ...x, order: 1 as const } : x)) };
    const ls = layoutMolecule(singles.atoms.map((x) => ({ id: x.id, x: x.x, y: x.y, el: x.el })), layoutBonds(singles.bonds, new Map(singles.atoms.map((x, i) => [x.id, i]))), opts, 40);
    expect(lay.lines).toEqual(ls.lines);
    expect(model.bonds.some((x) => x.order === 2)).toBe(true);
    // a ring bound so keeps its line to its centre, and no arc
    const { doc } = ferroceneEta();
    const fl = layoutMolecule(doc.model.atoms.map((x) => ({ id: x.id, x: x.x, y: x.y, el: x.el })), layoutBonds(doc.model.bonds, new Map(doc.model.atoms.map((x, i) => [x.id, i]))), opts, 40);
    expect(fl.lines.length).toBeLessThan(lay.lines.length + 30);
    expect(allylChain(etaOf(doc.model)[0], doc.model.bonds)).toBeNull();
  });

  it("is shaded as selected with its arc, in four pieces from one end carbon to the other", () => {
    const { model } = allylPd();
    const [b] = etaOf(model);
    const parts = selectedParts(model, new Set(), new Set([b.id]));
    const pieces = [...parts.entries()].filter(([k]) => k.startsWith(`b${b.id}~`)).map(([, v]) => v.bond!);
    expect(pieces).toHaveLength(4);
    for (let k = 1; k < 4; k++) expect(pieces[k].p).toEqual(pieces[k - 1].q);
  });

  it("in the chloride dimer, each allyl posed with its middle carbon away from its own palladium, its curve inside it", async () => {
    const d = drawing();
    const p1 = d.atom("Pd", -1, 0);
    const p2 = d.atom("Pd", 1, 0);
    const cl1 = d.atom("Cl", 0, 0.9);
    const cl2 = d.atom("Cl", 0, -0.9);
    for (const [p, cc] of [[p1, cl1], [p1, cl2], [p2, cl1], [p2, cl2]]) d.bond(p, cc);
    for (const s of [-1, 1]) {
      const pd = s < 0 ? p1 : p2;
      const x = d.atom("C", s * 2.1, 0.9);
      const y = d.atom("C", s * 2.7, 0);
      const z = d.atom("C", s * 2.1, -0.9);
      d.bond(x, y, 2);
      d.bond(y, z);
      for (const e of [x, y, z]) d.bond(pd, e);
    }
    const laid = etaHeld(await laidOut(d.model(), styleOf(DEFAULT_STYLE_CHOICE)));
    const at = where(laid);
    for (const b of etaOf(laid)) {
      const chain = allylChain(b, laid.bonds)!;
      expect(chain).not.toBeNull();
      const pd = at.get(b.a)!;
      const star = at.get(b.b)!;
      const [e1, mid, e2] = chain.map((id) => at.get(id)!);
      // (the middle carbon and the star - the curve's middle - on the side of the line between the end carbons away from the metal)
      const side = (p: { x: number; y: number }) => (e2.x - e1.x) * (p.y - e1.y) - (e2.y - e1.y) * (p.x - e1.x);
      expect(Math.sign(side(mid))).toBe(-Math.sign(side(pd)));
      expect(Math.sign(side(star))).toBe(-Math.sign(side(pd)));
      // (posed by Clean-up: the line between its end carbons across the metal's line, the curve's middle a bond and a half from the metal)
      const across = ((e2.x - e1.x) * (star.x - pd.x) + (e2.y - e1.y) * (star.y - pd.y)) / (Math.hypot(e2.x - e1.x, e2.y - e1.y) * Math.hypot(star.x - pd.x, star.y - pd.y));
      expect(Math.abs(across)).toBeLessThan(1e-6);
      const bond = (Math.hypot(mid.x - e1.x, mid.y - e1.y) + Math.hypot(mid.x - e2.x, mid.y - e2.y)) / 2;
      expect(Math.hypot(star.x - pd.x, star.y - pd.y) / bond).toBeCloseTo(1.5, 2);
    }
  });

  it("is told from a three-membered ring bound so (cyclopropenyl), which keeps its line to the centre", () => {
    const d = drawing();
    const ni = d.atom("Ni", 0, 0);
    const ring = d.ring(3, 0, 1.6, 0.6);
    const doc = bindRing({ ...emptyWorkspaceDocument(), model: d.model(), nextId: 100 }, ni, ring);
    const model = etaHeld(doc.model);
    const [b] = etaOf(model);
    expect(allylChain(b, model.bonds)).toBeNull();
    const at = where(model);
    const cx = ring.reduce((s, id) => s + at.get(id)!.x, 0) / 3;
    const cy = ring.reduce((s, id) => s + at.get(id)!.y, 0) / 3;
    expect(at.get(b.b)!.x).toBeCloseTo(cx, 9);
    expect(at.get(b.b)!.y).toBeCloseTo(cy, 9);
  });
});
