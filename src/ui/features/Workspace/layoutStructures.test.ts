import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutMolecule, type Atom as LAtom, type Bond as LBond, type Layout } from "../../../lib/chem/layout2d";
import { clustersOf, layoutByStructure, structureLayouts } from "../../../lib/chem/layoutStructures";
import { ACS_1996 } from "../../../lib/chem/style";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../utils/importers";
import { editorLayoutOptions, layoutAtomOf, layoutBonds } from "./layoutOptions";
import type { Atom, Bond } from "./store/types";

type M = { atoms: Atom[]; bonds: Bond[] };

function read(path: string, format: "mol" | "sdf"): M {
  return moleculesToEditorModel(readMoleculesFromText(readFileSync(path, "utf8"), format)).model;
}

const cholesterol = read("src/samples/cholesterol.sdf", "sdf");
const taxol = read("scripts/gui/fixtures/messy-taxol.mol", "mol");
const cases = read("scripts/gui/fixtures/depiction-check.mol", "mol");

/** The same structure with what reaches past it, and more besides: names, charges, notes, colours, depth. */
function dressed(m: M): M {
  const ends = new Map<number, number>();
  for (const b of m.bonds) for (const id of [b.a, b.b]) ends.set(id, (ends.get(id) ?? 0) + 1);
  const terminal = m.atoms.filter((a) => ends.get(a.id) === 1).map((a) => a.id);
  const atoms = m.atoms.map((a, i): Atom => {
    if (a.id === terminal[0]) return { ...a, el: "OTBS" };
    if (a.id === terminal[1]) return { ...a, el: "CO2Et" };
    if (a.id === terminal[2]) return { ...a, el: "N", charge: 1, highlight: "#ffe08a" };
    if (i === 3) return { ...a, map: 7, stereoGroup: { kind: "and", n: 1 } };
    if (i === 5) return { ...a, radical: "doublet", color: "#c00000" };
    return a;
  });
  const bonds = m.bonds.map((b, k): Bond => (k === 1 ? { ...b, query: "any" } : k === 4 ? { ...b, reactingCentre: 12 } : k === 6 ? { ...b, highlight: "#ffe08a" } : b));
  return { atoms, bonds };
}

/** In perspective: each atom a little nearer or farther, so that crossing bonds break. */
function deep(m: M): M {
  return { atoms: m.atoms.map((a, i) => ({ ...a, z: ((i * 7) % 5) - 2 })), bonds: m.bonds };
}

/** Structures in a row, `gap` apart (in the drawing's units), each with fresh ids. */
function row(parts: M[], gap: number, rows = 1): M {
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  let id = 1;
  let x = 0;
  for (let r = 0; r < rows; r++) {
    x = 0;
    for (const p of parts) {
      const xs = p.atoms.map((a) => a.x);
      const ys = p.atoms.map((a) => a.y);
      const dx = x - Math.min(...xs);
      const dy = -r * (Math.max(...ys) - Math.min(...ys) + gap) - Math.min(...ys);
      const ids = new Map<number, number>();
      for (const a of p.atoms) {
        ids.set(a.id, id);
        atoms.push({ ...a, id: id++, x: a.x + dx, y: a.y + dy, ...(a.z != null ? { z: a.z } : {}) });
      }
      for (const b of p.bonds) bonds.push({ ...b, id: id++, a: ids.get(b.a)!, b: ids.get(b.b)! });
      x += Math.max(...xs) - Math.min(...xs) + gap;
    }
  }
  return { atoms, bonds };
}

const L = 1.65;
const at = (id: number, x: number, y: number, el = "C"): Atom => ({ id, x: x * L, y: y * L, el }) as Atom;
const bond = (id: number, a: number, b: number, more: Partial<Bond> = {}): Bond => ({ id, a, b, order: 1, ...more }) as Bond;

/** A name on an upright bond, set to the right as it would be but for an atom of another structure there. */
const nameBesideAnother: M = {
  atoms: [at(1, 0, 0), at(2, 0, 1, "OTBS"), at(3, 1.1, 1), at(4, 2.1, 1)],
  bonds: [bond(10, 1, 2), bond(11, 3, 4)],
};

/** A note on a bond, set on the side with more room but for an atom of another structure there. */
const noteBesideAnother: M = {
  atoms: [at(1, 0, 0), at(2, 1, 0), at(3, 0.5, 0.7), at(4, 1.5, 0.7)],
  bonds: [bond(10, 1, 2, { query: "any" }), bond(11, 3, 4)],
};

/** Two bonds in perspective, of two structures, one passing behind the other. */
const crossing: M = {
  atoms: [{ ...at(1, 0, 0), z: 1 }, { ...at(2, 1, 1), z: 1 }, { ...at(3, 0, 1), z: -1 }, { ...at(4, 1, 0), z: -1 }],
  bonds: [bond(10, 1, 2), bond(11, 3, 4)],
};

function laidOut(m: M): { atoms: LAtom[]; bonds: LBond[] } {
  const atoms = m.atoms.map((a) => layoutAtomOf(a));
  return { atoms, bonds: layoutBonds(m.bonds, new Map(atoms.map((a, i) => [a.id, i]))) };
}

const opts = editorLayoutOptions(ACS_1996, { aromaticCircle: true });
const ZOOM = 40;

/** Each kind of mark as a sorted list: the drawing the same, whatever order its pieces come in. */
function marks(l: Layout) {
  const sorted = (xs: readonly unknown[] | undefined) => (xs ?? []).map((x) => JSON.stringify(x)).sort();
  return {
    lines: sorted(l.lines),
    polys: sorted(l.polys),
    texts: sorted(l.texts),
    circles: sorted(l.circles),
    fills: sorted(l.fills),
    under: sorted(l.under),
    reach: JSON.stringify(l.reach),
    bounds: l.bounds,
  };
}

describe("a drawing laid out a structure at a time", () => {
  const drawings: [string, M][] = [
    ["far apart", row([cholesterol, dressed(taxol), dressed(cases), dressed(cholesterol), taxol], 3, 2)],
    ["close together, names reaching across", row([dressed(cholesterol), dressed(cholesterol), dressed(taxol)], 0.4)],
    ["in perspective, one over another", row([deep(cholesterol), deep(taxol), deep(dressed(cholesterol))], -4)],
    ["a name beside another structure", nameBesideAnother],
    ["a note beside another structure", noteBesideAnother],
    ["a bond behind another structure's", crossing],
  ];
  it.each(drawings)("is the drawing laid out whole: %s", (_, m) => {
    const { atoms, bonds } = laidOut(m);
    const whole = layoutMolecule(atoms, bonds, opts, ZOOM);
    const split = layoutByStructure(atoms, bonds, opts, ZOOM, structureLayouts());
    expect(marks(split)).toEqual(marks(whole));
    expect(split.texts.filter((t) => t.atom != null).map((t) => [t.atom, t.text]).sort()).toEqual(whole.texts.filter((t) => t.atom != null).map((t) => [t.atom, t.text]).sort());
  });

  it("would be another drawing laid out a structure at a time, each alone, where something reaches across", () => {
    for (const m of [nameBesideAnother, noteBesideAnother, crossing]) {
      const { atoms, bonds } = laidOut(m);
      const whole = marks(layoutMolecule(atoms, bonds, opts, ZOOM));
      // (each of the two alone, put together)
      const alone = [0, 2].map((k) => layoutMolecule(atoms.slice(k, k + 2), [{ ...bonds[k / 2], a1: 0, a2: 1 }], opts, ZOOM));
      const merged = marks({ ...alone[0], lines: alone.flatMap((l) => l.lines), polys: alone.flatMap((l) => l.polys), texts: alone.flatMap((l, k) => l.texts.map((t) => (t.atom != null ? { ...t, atom: t.atom + 2 * k } : t))) });
      expect({ lines: merged.lines, polys: merged.polys, texts: merged.texts }).not.toEqual({ lines: whole.lines, polys: whole.polys, texts: whole.texts });
    }
  });

  it("lays out apart what nothing reaches across, and together what something does", () => {
    const parts = (m: M) => {
      const { atoms, bonds } = laidOut(m);
      return clustersOf(atoms, bonds).length;
    };
    const plain = cholesterol.atoms.length ? parts(row([cholesterol, cholesterol, cholesterol], 0.2)) : 0;
    expect(plain).toBe(3);
    // (OTBS's letters reach two bonds and more past its atom: within that, together)
    expect(parts(row([dressed(cholesterol), cholesterol], 0.4))).toBe(1);
    expect(parts(row([dressed(cholesterol), cholesterol], 8))).toBe(2);
    // (overlapping, in perspective: one crossing the other)
    expect(parts(row([deep(cholesterol), deep(cholesterol)], -4))).toBe(1);
  });

  it("lays out again only the structure that changed, and keeps what it made of the rest", () => {
    const m = row([cholesterol, taxol, cholesterol], 3);
    const { atoms, bonds } = laidOut(m);
    const kept = structureLayouts();
    const first = layoutByStructure(atoms, bonds, opts, ZOOM, kept);
    // (the middle structure moved: its atoms new, the others' the same)
    const from = cholesterol.atoms.length;
    const to = from + taxol.atoms.length;
    const moved = atoms.map((a, i) => (i >= from && i < to ? { ...a, x: a.x + 0.5 } : a));
    const second = layoutByStructure(moved, bonds, opts, ZOOM, kept);
    const before = new Set<unknown>(first.lines);
    const keptLines = second.lines.filter((l) => before.has(l)).length;
    expect(keptLines).toBeGreaterThan(0);
    expect(keptLines).toBeLessThan(second.lines.length);
    expect(marks(second)).toEqual(marks(layoutMolecule(moved, bonds, opts, ZOOM)));
    // (other options: everything laid out again)
    const third = layoutByStructure(moved, bonds, opts, ZOOM * 2, kept);
    expect(third.lines.some((l) => before.has(l))).toBe(false);
  });

  it("carries a structure turned while a gesture lasts - its layout turned with it, its labels upright - and lays it out again once the gesture ends", () => {
    const m = row([dressed(cholesterol), taxol], 3);
    const { atoms, bonds } = laidOut(m);
    const kept = structureLayouts();
    const first = layoutByStructure(atoms, bonds, opts, ZOOM, kept);
    // (all of it turned by 30 degrees about a point and moved, as the selection's handle turns it)
    const a = Math.PI / 6;
    const turned = atoms.map((p) => ({ ...p, x: p.x * Math.cos(a) - p.y * Math.sin(a) + 2, y: p.x * Math.sin(a) + p.y * Math.cos(a) - 1 }));
    const during = layoutByStructure(turned, bonds, opts, ZOOM, kept, [], true);
    // (each line turned and moved as the atoms were)
    const at = (x: number, y: number) => ({ x: x * Math.cos(a) - y * Math.sin(a) + 2, y: x * Math.sin(a) + y * Math.cos(a) - 1 });
    const sorted = (l: { lines: { x1: number; y1: number; x2: number; y2: number }[] }) => l.lines.map((q) => [q.x1, q.y1, q.x2, q.y2].map((v) => Math.round(v * 1e6) / 1e6).join()).sort();
    expect(sorted(during)).toEqual(sorted({ lines: first.lines.map((q) => ({ x1: at(q.x1, q.y1).x, y1: at(q.x1, q.y1).y, x2: at(q.x2, q.y2).x, y2: at(q.x2, q.y2).y })) }));
    // (each label moved with its atom, upright: its letters as they were)
    const label = first.texts.find((t) => t.atom != null && t.text.length > 1)!;
    const now = during.texts.find((t) => t.atom === label.atom && t.text === label.text)!;
    expect(now.x - turned[label.atom!].x).toBeCloseTo(label.x - atoms[label.atom!].x, 9);
    expect(now.y - turned[label.atom!].y).toBeCloseTo(label.y - atoms[label.atom!].y, 9);
    expect(now.runs).toEqual(label.runs);
    // (an atom changed besides its place - a charge - is laid out again, gesture or not)
    const charged = turned.map((p, i) => (i === 0 ? { ...p, charge: 1 } : p));
    expect(marks(layoutByStructure(charged, bonds, opts, ZOOM, kept, [], true))).toEqual(marks(layoutMolecule(charged, bonds, opts, ZOOM)));
    // (let go: laid out again, as if it had been drawn there)
    layoutByStructure(turned, bonds, opts, ZOOM, kept, [], true);
    expect(marks(layoutByStructure(turned, bonds, opts, ZOOM, kept))).toEqual(marks(layoutMolecule(turned, bonds, opts, ZOOM)));
  });

  it("says which atom each label is of by its place in the drawing, as atoms come and go before it", () => {
    const m = row([dressed(cholesterol), dressed(cholesterol)], 3);
    const { atoms, bonds } = laidOut(m);
    const kept = structureLayouts();
    layoutByStructure(atoms, bonds, opts, ZOOM, kept);
    // (the first structure gone: the second's atoms at other places, the objects the same)
    const n = cholesterol.atoms.length;
    const rest = atoms.slice(n);
    const restBonds = bonds.filter((b) => b.a1 >= n).map((b) => ({ ...b, a1: b.a1 - n, a2: b.a2 - n }));
    const again = layoutByStructure(rest, restBonds, opts, ZOOM, kept);
    expect(marks(again)).toEqual(marks(layoutMolecule(rest, restBonds, opts, ZOOM)));
  });

  it("lays out whole a drawing with a bracket, which may take in several structures", () => {
    const m = row([cholesterol, cholesterol], 3);
    const { atoms, bonds } = laidOut(m);
    const n = cholesterol.atoms.length;
    // (one group over an atom of each)
    const sgroup = { id: 1, type: "COM", componentNumber: 1 } as const;
    const marked = atoms.map((a, i) => (i === 2 || i === n + 2 ? { ...a, sgroups: [sgroup] } : a));
    expect(layoutByStructure(marked, bonds, opts, ZOOM, structureLayouts())).toEqual(layoutMolecule(marked, bonds, opts, ZOOM));
  });

  it("lays out one structure of a thousand moved in a small share of the time the thousand take", () => {
    const m = row(Array.from({ length: 40 }, () => cholesterol), 3, 25);
    const { atoms, bonds } = laidOut(m);
    const kept = structureLayouts();
    const cpu = (f: () => void) => {
      const c = process.cpuUsage();
      f();
      const d = process.cpuUsage(c);
      return (d.user + d.system) / 1000;
    };
    const all = cpu(() => layoutByStructure(atoms, bonds, opts, ZOOM, kept));
    const n = cholesterol.atoms.length;
    let one = Infinity;
    for (let k = 1; k <= 5; k++) {
      const moved = atoms.map((a, i) => (i < n ? { ...a, x: a.x + 0.1 * k } : a));
      one = Math.min(one, cpu(() => layoutByStructure(moved, bonds, opts, ZOOM, kept)));
    }
    // (28 000 atoms: about 2 s whole on this machine, about 20 ms for one structure)
    expect(one).toBeLessThan(all / 20);
  }, 120_000);
});
