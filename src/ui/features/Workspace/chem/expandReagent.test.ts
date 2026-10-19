import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { abbreviationStructure } from "../../../../lib/chem/abbreviations";
import { sameConfiguration } from "../../../../lib/layout/drawn";
import { layout2D } from "../../../../lib/layout/engine";
import { emptyWorkspaceDocument, expandAbbreviation, relayout } from "../document";
import type { Model } from "../store/types";
import { undrawnHydrogens } from "./drawing";
import { layoutJob, relayoutFrom } from "./engineLayout";
import { measured } from "../../../../testing/timeouts";

const alone = (el: string): Model => ({ atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el }], bonds: [] });
const expanded = (model: Model, id = 1) => expandAbbreviation({ ...emptyWorkspaceDocument(), model, nextId: 100 }, id).model;

describe("a reagent's label written out on the canvas", () => {
  it("shows the configuration Clean-up reads back as the reagent's own", () => {
    for (const label of ["L-proline", "(S,S)-DPEN", "(S)-CBS", "Shi's catalyst", "(R,R)-Jacobsen's catalyst", "(1S)-CSA"]) {
      const model = expanded(alone(label));
      const s = abbreviationStructure(label)!;
      // (written out alone, its atoms come in the structure's order, the H the engine drew after them)
      const job = layoutJob(model);
      const given = s.atoms.flatMap((a, i) => (a.tetra ? [[i, a.tetra] as const] : []));
      expect(given.length, label).toBeGreaterThan(0);
      for (const [i, t] of given) {
        const read = job.input.atoms[i].tetra;
        expect(read, `${label}: atom ${i}`).toBeDefined();
        expect(sameConfiguration(read!, t), `${label}: atom ${i}`).toBe(true);
      }
    }
    // (six reagents laid out, Jacobsen's catalyst among them: a few seconds on a busy machine)
  }, measured(1_900));

  it("binds a ligand's neutral donor by a coordination bond, which takes no H from a carbene's carbon", () => {
    const model: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "Pd" },
        { id: 2, x: L, y: 0, r: 0.9, el: "IPr" },
        { id: 3, x: -L, y: 0, r: 0.9, el: "PPh3" },
      ],
      bonds: [
        { id: 10, a: 1, b: 2, order: 1 },
        { id: 11, a: 1, b: 3, order: 1 },
      ],
    };
    const out = expanded(expanded(model, 2), 3);
    expect(out.bonds.filter((b) => b.id === 10 || b.id === 11).every((b) => b.coordination)).toBe(true);
    const carbene = out.atoms.find((a) => a.id === 2)!;
    expect(carbene.el).toBe("C");
    expect(undrawnHydrogens(out).get(2)).toBe(0);
  }, measured(420));

  it("is drawn as Clean-up draws it: a complex cleaned up after it is written out does not move", () => {
    for (const label of ["Cp2Fe", "Cp2ZrCl2", "PdCl2(dppf)", "Cp*RuCl(PPh3)2", "PdCl2(PPh3)2", "Grubbs II", "Ni(cod)2", "[Rh(cod)2]BF4", "[Ir(cod)Cl]2"]) {
      const doc = { ...emptyWorkspaceDocument(), model: alone(label), nextId: 100 };
      const out = expandAbbreviation(doc, 1);
      const model = out.model;
      const job = layoutJob(model);
      const after = relayout(out, relayoutFrom(model, model, job, layout2D(job.input))).model;
      const byId = new Map(after.atoms.map((a) => [a.id, a]));
      const [first] = model.atoms;
      const moved = Math.max(
        ...model.atoms.map((a) => {
          const b = byId.get(a.id)!;
          const f = byId.get(first.id)!;
          return Math.hypot(a.x - first.x - (b.x - f.x), a.y - first.y - (b.y - f.y));
        }),
      );
      expect(moved, label).toBeLessThan(1e-6);
      const bold = (m: Model) => m.bonds.filter((b) => b.display === "bold").map((b) => b.id).sort();
      expect(bold(after), label).toEqual(bold(model));
      expect(after.atoms.length, label).toBe(model.atoms.length);
    }
    // (nine complexes, each laid out twice by the whole engine: slower on CI's runners)
  }, measured(14_000));
});
