import { describe, expect, it } from "vitest";
import { isNotStatedText, ligandTokensOnly, metalNotStated, notStatedAt } from "./ligandsNotStated";
import { constitutionKey, identity, type IdentityInput } from "./identity";
import { readsAsNothing } from "./abbreviations";

// Known answers worked by hand from the grammar (docs/EDITOR-2D.md, *Ligands not stated*).
describe("a metal whose ligands are not stated, by the grammar", () => {
  it("reads LnPd, L2Mg, MgX, PdL4, [Pd]L2 as the metal", () => {
    expect(metalNotStated("LnPd")).toBe("Pd");
    expect(metalNotStated("L2Mg")).toBe("Mg");
    expect(metalNotStated("MgX")).toBe("Mg");
    expect(metalNotStated("PdL4")).toBe("Pd");
    expect(metalNotStated("[Pd]L2")).toBe("Pd");
    expect(metalNotStated("LmCu")).toBe("Cu");
    expect(metalNotStated("MgX2")).toBe("Mg");
    expect(metalNotStated("XnZn")).toBe("Zn");
  });

  it("reads LiX as lithium with its halide not stated: an element's symbol is read first", () => {
    expect(metalNotStated("LiX")).toBe("Li");
  });

  it("leaves what only looks like one as it is: Li, La, Lu, Xe, a lone token, a metal alone, other text", () => {
    for (const label of ["Li", "La", "Lu", "Xe", "Pd", "Mg", "L", "Ln", "X", "L2", "PdCl2", "MgBr", "LnPdCl", "L1Pd", "Lx", "PdL10", "[Pd", "Pd]L", "LnPdMg", "CX", "XeL", "LnSi"]) {
      expect(metalNotStated(label), label).toBeNull();
    }
  });

  it("takes tokens alone - L, X, L2, Xn, LX - as a ligand where bonded to a metal, and nothing else", () => {
    for (const label of ["L", "Ln", "Lm", "L2", "L9", "X", "Xn", "X3"]) expect(ligandTokensOnly(label), label).toBe(true);
    for (const label of ["Li", "La", "Xe", "L1", "Lp", "R", "Pd"]) expect(ligandTokensOnly(label), label).toBe(false);
  });

  it("puts a metal an X or an L is bonded to in the state; an X on carbon stays what it is", () => {
    expect(notStatedAt(["Pd", "X", "X"], [[0, 1], [0, 2]])).toEqual([0]);
    expect(notStatedAt(["Mg", "L"], [[1, 0]])).toEqual([0]);
    expect(notStatedAt(["C", "X"], [[0, 1]])).toEqual([]);
    expect(notStatedAt(["Si", "X"], [[0, 1]])).toEqual([]);
    expect(notStatedAt(["C", "LnPd"], [[0, 1]])).toEqual([1]);
    expect(notStatedAt(["Li"], [])).toEqual([]);
  });

  it("is no label read as nothing: typing one is not words kept", () => {
    for (const label of ["LnPd", "L2Mg", "MgX", "PdL4", "[Pd]L2"]) expect(readsAsNothing(label), label).toBe(false);
  });
});

describe("identity of a structure with a metal whose ligands are not stated", () => {
  const lone = (el: string, hs = 0): IdentityInput => ({ atoms: [{ el, hs }], bonds: [] });
  const pdCl2: IdentityInput = { atoms: [{ el: "Pd", hs: 0 }, { el: "Cl", hs: 0 }, { el: "Cl", hs: 0 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }] };
  const pdX2: IdentityInput = { atoms: [{ el: "Pd", hs: 0 }, { el: "X", hs: 0 }, { el: "X", hs: 0 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }] };

  it("is the same as nothing: not Pd metal, not PdCl2, not another such one, not itself drawn again", () => {
    const texts = [lone("LnPd"), lone("L2Mg"), lone("MgX"), lone("PdL4"), lone("[Pd]L2"), lone("LnPd"), pdX2, pdX2].map((i) => identity(i));
    for (const t of texts) {
      expect(isNotStatedText(t.text)).toBe(true);
      expect(t.complete).toBe(false);
    }
    const all = [...texts.map((t) => t.text), identity(lone("Pd")).text, identity(pdCl2).text];
    expect(new Set(all).size).toBe(all.length);
    expect(constitutionKey(lone("LnPd"))).not.toBe(constitutionKey(lone("LnPd")));
  });

  it("leaves what only looks like one as it is: lithium, lanthanum, xenon, an X on carbon", () => {
    for (const el of ["Li", "La", "Lu", "Xe"]) expect(identity(lone(el)).text).toBe(identity(lone(el)).text);
    const cx: IdentityInput = { atoms: [{ el: "C", hs: 3 }, { el: "X", hs: 0 }], bonds: [{ a: 0, b: 1, order: 1 }] };
    expect(isNotStatedText(identity(cx).text)).toBe(false);
    expect(identity(cx).text).toBe(identity(cx).text);
  });
});
