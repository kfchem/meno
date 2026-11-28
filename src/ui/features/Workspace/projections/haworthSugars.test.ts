import { describe, expect, it } from "vitest";
import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox } from "../../../../lib/chem/layout2d";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { createWorkspaceDocument } from "../document";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { seenPlaces } from "./chair";
import { haworthDrawing } from "./haworth";

const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
const set = labelSetOf(opts);
type Pt = { x: number; y: number };
type Box = { minX: number; maxX: number; minY: number; maxY: number };

// The sugars a chemist commonly draws as Haworth rings (docs/EDITOR-2D.md, the Haworth ring), each drawn as the page draws it - a ring
// from the tool, a group led out to each free place given and named by typing over it - and read with no graze let pass: no label's ink
// may touch another label's or any line or filled shape of the drawing but its own bond.

/** A group at a ring atom's free place: [ring atom k (C-k; the ring O is atom 0), up or down, what is typed - "C" a carbon drawn out]. */
type G = readonly [number, "up" | "down", string];
/** An atom on a drawn-out carbon: [that carbon's index among the groups, across and up the page in the style's bonds, what is typed]. */
type S = readonly [number, number, number, string];
function draw(size: 5 | 6, groups: readonly G[], side: readonly S[] = []) {
  const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
  const model: Model = { atoms: [...d.atoms], bonds: [...d.bonds] };
  const names: string[] = [];
  groups.forEach(([k, kind, t], n) => {
    const p = seenPlaces(d, k).find((q) => q.free.kind === kind)!;
    // (a side chain led down out of the ring - a Fischer chain, as ST-1.9 allows - is drawn half a bond longer, so that the groups across
    //  its first carbon stand below the ring's near edge: where the free place puts that carbon, a group across it lies on the bold bond)
    const drop = t === "C" && kind === "down" ? 0.5 * NOMINAL_BOND_LENGTH : 0;
    model.atoms.push({ id: 50 + n, x: p.place.x, y: p.place.y - drop, r: 0.9, el: "C" } as Model["atoms"][number]);
    model.bonds.push({ id: 250 + n, a: d.atoms[k].id, b: 50 + n, order: 1 } as Model["bonds"][number]);
    names[50 + n] = `C${k}${kind}:${t}`;
  });
  side.forEach(([g, dx, dy, t], n) => {
    const par = model.atoms.find((a) => a.id === 50 + g)!;
    const id = 80 + n;
    model.atoms.push({ id, x: par.x + dx * NOMINAL_BOND_LENGTH, y: par.y + dy * NOMINAL_BOND_LENGTH, r: 0.9, el: "C" } as Model["atoms"][number]);
    model.bonds.push({ id: 280 + n, a: par.id, b: id, order: 1 } as Model["bonds"][number]);
    names[id] = `side${g}.${n}:${t}`;
  });
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model, nextId: 1000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const typed = [...groups.map((g, n) => [50 + n, g[2]] as const), ...side.map((s, n) => [80 + n, s[3]] as const)];
  for (const [id, t] of typed) {
    if (t === "C") continue;
    store.getState().beginLabelEdit(id, "");
    store.getState().setLabelEditValue(t);
    store.getState().commitLabelEdit(t);
  }
  names[1] = "ringO";
  return { d, model: store.getState().model, names };
}

function meetings(model: Model, names: string[]): string[] {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const lay = layoutMolecule(model.atoms as never, layoutBonds(model.bonds, index) as never, opts, 40);
  const boxes = new Map<number, Box>();
  const texts = new Map<number, string>();
  for (const a of model.atoms) {
    const ts = lay.texts.filter((t) => (t as { atom?: number }).atom === index.get(a.id));
    if (!ts.length) continue;
    texts.set(a.id, ts.map((t) => t.text).join(""));
    boxes.set(
      a.id,
      ts
        .map((t) => {
          const b = labelBox(t, t.fontPx, set);
          return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
        })
        .reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), maxX: Math.max(u.maxX, b.maxX), minY: Math.min(u.minY, b.minY), maxY: Math.max(u.maxY, b.maxY) })),
    );
  }
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const onSeg = (p: Pt, a: Pt, b: Pt) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const cross = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L);
    return cross < 1e-4 && t > -1e-4 && t < 1 + 1e-4;
  };
  const bondOfLine = (l: { x1: number; y1: number; x2: number; y2: number }) =>
    model.bonds.find((b) => {
      const [a, c] = [byId.get(b.a)!, byId.get(b.b)!];
      return onSeg({ x: l.x1, y: l.y1 }, a, c) && onSeg({ x: l.x2, y: l.y2 }, a, c);
    });
  const bondOfPoly = (pts: Pt[]) => {
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    return model.bonds.find((b) => {
      const [a, e] = [byId.get(b.a)!, byId.get(b.b)!];
      const L = Math.hypot(e.x - a.x, e.y - a.y);
      return Math.abs((e.x - a.x) * (c.y - a.y) - (e.y - a.y) * (c.x - a.x)) / L < 0.2;
    });
  };
  const nm = (id: number) => `${names[id] ?? "atom" + id}[${texts.get(id)}]`;
  const out: string[] = [];
  const ids = [...boxes.keys()];
  for (const [i, id] of ids.entries()) {
    const box = boxes.get(id)!;
    for (const o of ids.slice(i + 1)) {
      const q = boxes.get(o)!;
      if (q.minX < box.maxX && box.minX < q.maxX && q.minY < box.maxY && box.minY < q.maxY) {
        const depth = Math.min(box.maxX - q.minX, q.maxX - box.minX, box.maxY - q.minY, q.maxY - box.minY);
        out.push(`${nm(id)} x ${nm(o)} label ${depth.toFixed(3)}`);
      }
    }
    for (const l of lay.lines) {
      const b = bondOfLine(l);
      if (b && (b.a === id || b.b === id)) continue;
      const h = l.widthPx / 40 / 2;
      if (segmentMeetsBox({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }, { minX: box.minX - h, maxX: box.maxX + h, minY: box.minY - h, maxY: box.maxY + h }))
        out.push(`${nm(id)} x line of ${b ? `${names[b.a] ?? b.a}-${names[b.b] ?? b.b}` : "?"}`);
    }
    for (const p of lay.polys) {
      const b = bondOfPoly(p.points);
      if (b && (b.a === id || b.b === id)) continue;
      const pts = p.points;
      const inBox = (q: Pt) => q.x >= box.minX && q.x <= box.maxX && q.y >= box.minY && q.y <= box.maxY;
      if (pts.some(inBox) || pts.some((q, k) => segmentMeetsBox(q, pts[(k + 1) % pts.length], box))) out.push(`${nm(id)} x shape of ${b ? `${b.a}-${b.b}` : "?"}`);
    }
  }
  return out;
}

/** The D-aldohexoses: whether the OH at C-2, C-3 and C-4 is up - on the left in the Fischer projection - or down (on the right). */
const configs: Record<string, [boolean, boolean, boolean]> = {
  allo: [false, false, false],
  altro: [true, false, false],
  gluco: [false, true, false],
  manno: [true, true, false],
  gulo: [false, false, true],
  ido: [true, false, true],
  galacto: [false, true, true],
  talo: [true, true, true],
};
/** A ring atom's two groups: `t` up or down, and `other` the other way. */
const pair = (k: number, up: boolean, t: string, other = "H"): G[] => [
  [k, "up", up ? t : other],
  [k, "down", up ? other : t],
];

type Sugar = { name: string; size: 5 | 6; groups: G[]; side?: S[] };

function hexoses(): Sugar[] {
  const out: Sugar[] = [];
  for (const [name, [c2, c3, c4]] of Object.entries(configs)) {
    for (const beta of [false, true]) {
      const a = beta ? "beta" : "alpha";
      out.push({ name: `${a}-D-${name}pyranose`, size: 6, groups: [...pair(1, beta, "OH"), ...pair(2, c2, "OH"), ...pair(3, c3, "OH"), ...pair(4, c4, "OH"), ...pair(5, true, "CH2OH")] });
      // (the furanose: C-4's side chain up where O-4 was on the right in the Fischer projection, down where it was on the left - its
      //  configuration at C-4 is the open chain's; drawn as a Fischer chain, C-5 with HO on the left and H on the right, C-6 a CH2OH beyond)
      const chainUp = !c4;
      const dir = chainUp ? 1 : -1;
      out.push({
        name: `${a}-D-${name}furanose`,
        size: 5,
        groups: [...pair(1, beta, "OH"), ...pair(2, c2, "OH"), ...pair(3, c3, "OH"), ...pair(4, chainUp, "C")],
        side: [
          [chainUp ? 6 : 7, -1, 0, "OH"],
          [chainUp ? 6 : 7, 1, 0, "H"],
          [chainUp ? 6 : 7, 0, dir, "CH2OH"],
        ],
      });
    }
  }
  return out;
}

/** The deoxy sugars, uronic acids, N-acetyl amino sugars, methyl glycosides and the common pentofuranoses and ketofuranose. */
const others: Sugar[] = [
  { name: "2-deoxy-beta-D-arabino-hexopyranose", size: 6, groups: [...pair(1, true, "OH"), [2, "up", "H"], [2, "down", "H"], ...pair(3, true, "OH"), ...pair(4, false, "OH"), ...pair(5, true, "CH2OH")] },
  { name: "6-deoxy-beta-D-glucopyranose", size: 6, groups: [...pair(1, true, "OH"), ...pair(2, false, "OH"), ...pair(3, true, "OH"), ...pair(4, false, "OH"), ...pair(5, true, "CH3")] },
  { name: "alpha-L-fucopyranose", size: 6, groups: [...pair(1, true, "OH"), ...pair(2, true, "OH"), ...pair(3, false, "OH"), ...pair(4, false, "OH"), ...pair(5, false, "CH3")] },
  { name: "alpha-L-rhamnopyranose", size: 6, groups: [...pair(1, true, "OH"), ...pair(2, false, "OH"), ...pair(3, false, "OH"), ...pair(4, true, "OH"), ...pair(5, false, "CH3")] },
  { name: "beta-D-glucopyranuronic acid", size: 6, groups: [...pair(1, true, "OH"), ...pair(2, false, "OH"), ...pair(3, true, "OH"), ...pair(4, false, "OH"), ...pair(5, true, "COOH")] },
  { name: "alpha-L-idopyranuronic acid", size: 6, groups: [...pair(1, true, "OH"), ...pair(2, true, "OH"), ...pair(3, false, "OH"), ...pair(4, true, "OH"), ...pair(5, false, "COOH")] },
  { name: "2-acetamido-2-deoxy-beta-D-glucopyranose", size: 6, groups: [...pair(1, true, "OH"), ...pair(2, false, "NHAc"), ...pair(3, true, "OH"), ...pair(4, false, "OH"), ...pair(5, true, "CH2OH")] },
  { name: "2-acetamido-2-deoxy-alpha-D-galactopyranose", size: 6, groups: [...pair(1, false, "OH"), ...pair(2, false, "NHAc"), ...pair(3, true, "OH"), ...pair(4, true, "OH"), ...pair(5, true, "CH2OH")] },
  { name: "2-acetamido-2-deoxy-beta-D-mannopyranose", size: 6, groups: [...pair(1, true, "OH"), ...pair(2, true, "NHAc"), ...pair(3, true, "OH"), ...pair(4, false, "OH"), ...pair(5, true, "CH2OH")] },
  { name: "methyl alpha-D-glucopyranoside", size: 6, groups: [...pair(1, false, "OCH3"), ...pair(2, false, "OH"), ...pair(3, true, "OH"), ...pair(4, false, "OH"), ...pair(5, true, "CH2OH")] },
  { name: "methyl beta-D-glucopyranoside", size: 6, groups: [...pair(1, true, "OCH3"), ...pair(2, false, "OH"), ...pair(3, true, "OH"), ...pair(4, false, "OH"), ...pair(5, true, "CH2OH")] },
  { name: "beta-D-ribofuranose", size: 5, groups: [...pair(1, true, "OH"), ...pair(2, false, "OH"), ...pair(3, false, "OH"), ...pair(4, true, "CH2OH")] },
  { name: "2-deoxy-beta-D-ribofuranose", size: 5, groups: [...pair(1, true, "OH"), [2, "up", "H"], [2, "down", "H"], ...pair(3, false, "OH"), ...pair(4, true, "CH2OH")] },
  { name: "beta-D-fructofuranose", size: 5, groups: [...pair(1, false, "OH", "CH2OH"), ...pair(2, true, "OH"), ...pair(3, false, "OH"), ...pair(4, true, "CH2OH")] },
];

/** Each sugar, and the same drawn without its H atoms (a Haworth form ST-1.9 names). */
function every(): Sugar[] {
  const all = [...hexoses(), ...others];
  const bare = (s: Sugar): Sugar => {
    const groups = s.groups.filter((g) => g[2] !== "H");
    // (the side chain's carbon counted again among the groups left)
    const side = s.side?.filter((x) => x[3] !== "H").map((x): S => [groups.indexOf(s.groups[x[0]]), x[1], x[2], x[3]]);
    return { ...s, name: `${s.name} (no H)`, groups, side };
  };
  return [...all, ...all.map(bare)];
}

describe("labels of the sugars a chemist commonly draws as Haworth rings", () => {
  const drawn = every().map((s) => ({ s, ...draw(s.size, s.groups, s.side ?? []) }));

  it("touch nothing: no label's ink meets another label or any bond but its own, every aldohexose in both ring sizes and both anomers, the deoxy sugars, uronic acids, N-acetyl amino sugars and methyl glycosides", () => {
    const touching = drawn.flatMap(({ s, model, names }) => meetings(model, names).map((m) => `${s.name}: ${m}`));
    expect(touching).toEqual([]);
  });

  it("keep every group on its side of the ring's plane, on its own vertical, and the ring as the tool drew it - C-1 at the right", () => {
    for (const { s, d, model } of drawn) {
      const at = new Map(model.atoms.map((a) => [a.id, a]));
      for (const a of d.atoms) expect([at.get(a.id)!.x, at.get(a.id)!.y], s.name).toEqual([a.x, a.y]);
      expect(Math.max(...d.atoms.map((a) => a.x)), s.name).toBe(d.atoms[1].x);
      s.groups.forEach(([k, kind], n) => {
        const g = at.get(50 + n)!;
        expect(g.x, `${s.name}: C-${k} ${kind}`).toBeCloseTo(d.atoms[k].x, 9);
        expect(Math.sign(g.y - d.atoms[k].y), `${s.name}: C-${k} ${kind}`).toBe(kind === "up" ? 1 : -1);
      });
    }
  });

  it("stand both front up OH of a mannopyranose clear, alpha and beta, on the figures' stems", () => {
    for (const name of ["alpha-D-mannopyranose", "beta-D-mannopyranose"]) {
      const { d, model, names } = drawn.find((x) => x.s.name === name)!;
      expect(meetings(model, names), name).toEqual([]);
      // (C-2's and C-3's OH up, groups 2 and 4, each on 0.464 of the level bond)
      for (const [n, k] of [[2, 2], [4, 3]]) expect(((model.atoms.find((a) => a.id === 50 + n)!.y - d.atoms[k].y) / d.scale).toFixed(3), name).toBe("0.464");
    }
  });

  it("raise an NHAc up from C-2 of a beta-D-mannopyranose above the row of C-3's OH, read toward the ring's middle, the OH on its stem", () => {
    const { d, model } = drawn.find((x) => x.s.name === "2-acetamido-2-deoxy-beta-D-mannopyranose")!;
    const index = new Map(model.atoms.map((a, i) => [a.id, i]));
    const lay = layoutMolecule(model.atoms as never, layoutBonds(model.bonds, index) as never, opts, 40);
    const text = (id: number) => lay.texts.filter((t) => (t as { atom?: number }).atom === index.get(id)).map((t) => t.text).join("");
    const length = (n: number, k: number) => (model.atoms.find((a) => a.id === 50 + n)!.y - d.atoms[k].y) / d.scale;
    expect(text(52)).toBe("AcHN");
    expect(text(54)).toBe("OH");
    expect(length(4, 3).toFixed(3)).toBe("0.464");
    expect(length(2, 2)).toBeGreaterThan(0.6);
    // (below the ring's back edge: inside the ring's picture still)
    expect(length(2, 2)).toBeLessThan((d.atoms[0].y - d.atoms[2].y) / d.scale);
  });
});
