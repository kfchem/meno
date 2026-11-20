import { describe, expect, it } from "vitest";
import { fromSmiles } from "./testdata/fromSmiles";
import { CHELATE_OPENED, forgetLaidOut, layout2D } from "./engine";
import { measured } from "../../testing/timeouts";

// A six-bond metal's chelates opened where their labelled donors' H would meet (Brecher 2008, GR-4.3.5 and GR-4.3.7): the bonds to the
// metal lengthened along their own spokes, the ring's own bonds one long, its angles opened (docs/LAYOUT-2D.md, section 7).

const d = (l: ReturnType<typeof layout2D>, a: number, b: number) => Math.hypot(l.x[a] - l.x[b], l.y[a] - l.y[b]);

describe("a six-bond metal's ethane-1,2-diamine chelates", () => {
  it("stand out along their spokes, the bonds to their NH2 lengthened, the ring's own bonds one long - [Co(en)2Cl2]+, [Co(en)3]3+", { timeout: measured(10000) }, () => {
    for (const smiles of ["Cl[Co+]1234Cl.[NH2]1CC[NH2]2.[NH2]3CC[NH2]4", "[Co+3]123456.[NH2]1CC[NH2]2.[NH2]3CC[NH2]4.[NH2]5CC[NH2]6"]) {
      forgetLaidOut();
      const input = fromSmiles(smiles);
      const l = layout2D(input);
      const co = input.atoms.findIndex((a) => a.el === "Co");
      const near = (v: number) => input.bonds.flatMap((b) => (b.a === v ? [b.b] : b.b === v ? [b.a] : []));
      const ns = near(co).filter((v) => input.atoms[v].el === "N");
      for (const n of ns) {
        expect(d(l, co, n), smiles).toBeCloseTo(CHELATE_OPENED, 6);
        // (on its spoke: a multiple of 60 degrees from straight up)
        const t = (Math.atan2(l.y[n] - l.y[co], l.x[n] - l.x[co]) * 180) / Math.PI - 90;
        expect(Math.abs(t / 60 - Math.round(t / 60)) * 60, smiles).toBeLessThan(1e-6);
        // (its ring's bonds one long)
        for (const c of near(n).filter((v) => v !== co)) {
          expect(d(l, n, c), smiles).toBeCloseTo(1, 6);
          for (const c2 of near(c).filter((v) => input.atoms[v].el === "C")) expect(d(l, c, c2), smiles).toBeCloseTo(1, 6);
        }
      }
      // (a single donor's bond as long as before)
      for (const cl of near(co).filter((v) => input.atoms[v].el === "Cl")) expect(d(l, co, cl), smiles).toBeLessThan(CHELATE_OPENED - 0.1);
    }
  });

  it("are left as they are where a donor carries no H, or the ring holds an atom other than two plain carbons", { timeout: measured(10000) }, () => {
    for (const [smiles, el] of [["Cl[Co+]1234Cl.O1C(=O)C[NH2]2.O3C(=O)C[NH2]4", "O"], ["Cl[Ru]1234Cl.c5ccn1c(c5)-c5ccccn52.c5ccn3c(c5)-c5ccccn54", "N"]] as const) {
      forgetLaidOut();
      const input = fromSmiles(smiles);
      const l = layout2D(input);
      const m = input.atoms.findIndex((a) => a.el === "Co" || a.el === "Ru");
      const near = input.bonds.flatMap((b) => (b.a === m ? [b.b] : b.b === m ? [b.a] : []));
      for (const v of near.filter((w) => input.atoms[w].el === el)) expect(d(l, m, v), smiles).toBeLessThan(CHELATE_OPENED - 0.1);
    }
  });
});
