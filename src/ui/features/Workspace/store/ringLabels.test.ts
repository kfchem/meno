import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { keptLabel } from "../../../../lib/chem/smartLabel";
import { abbreviationOf } from "../../../../lib/chem/abbreviations";
import { labelReading } from "../utils/labelTyping";

/** A ring of six, or a chain of three - the label typed on its middle atom, as the canvas keeps it. */
function drawn(ring: boolean, label: string) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const L = NOMINAL_BOND_LENGTH;
  const ids = ring
    ? Array.from({ length: 6 }, (_, k) => st().addAtom(L * Math.cos((k * Math.PI) / 3), L * Math.sin((k * Math.PI) / 3), "C"))
    : [st().addAtom(-L, 0, "C"), st().addAtom(0, 0.5 * L, "C"), st().addAtom(L, 0, "C")];
  for (let k = 0; k < ids.length - (ring ? 0 : 1); k++) st().addBond(ids[k], ids[(k + 1) % ids.length], 1);
  const at = ring ? ids[0] : ids[2];
  st().beginLabelEdit(at, label[0]);
  st().setLabelEditValue(keptLabel(label, labelReading));
  st().commitLabelEdit(label);
  return { st, at };
}

// (the forms the maintainer asked for: an atom, its H, the groups it carries)
const FORMS: [string, string, number][] = [
  ["SiHCOOH", "Si", 3],
  ["SiMeOMe", "Si", 3],
  ["CHCO2Me", "C", 4],
  ["PHPh", "P", 6],
  ["NHBoc", "N", 7],
  ["NCO2Me", "N", 4],
];

describe("an atom written with its H and the groups it carries (the maintainer, 2026-10-18)", () => {
  it("is read so, typed as it is written - no letter made a capital: SiHCOOH is no SIHCOOH", () => {
    for (const [label] of FORMS) {
      expect(keptLabel(label, labelReading), label).toBe(label);
      const r = labelReading(label);
      expect(r, label).not.toBeNull();
      expect(r?.whole, label).toBe(false);
    }
    expect(abbreviationOf("SiHCOOH")?.smiles).toBe("*[SiH](C(=O)O)");
    expect(abbreviationOf("SiH(COOH)")?.smiles).toBe("*[SiH](C(=O)O)");
    expect(abbreviationOf("SiMeOMe")?.smiles).toBe("*[Si](C)(OC)");
    expect(abbreviationOf("CHCO2Me")?.smiles).toBe("*[CH](C(=O)OC)");
    expect(abbreviationOf("NCO2Me")?.smiles).toBe("*N(C(=O)OC)");
  });

  it("is drawn out on a ring's atom, its two ring bonds kept: the atom, then what it carries", () => {
    for (const [label, el, added] of FORMS) {
      const { st, at } = drawn(true, label);
      const before = st().model.atoms.length;
      st().expandAbbreviation(at);
      const m = st().model;
      expect(m.atoms.find((a) => a.id === at)?.el, label).toBe(el);
      expect(m.atoms.length - before, label).toBe(added);
      const bonds = m.bonds.filter((b) => b.a === at || b.b === at);
      // (its two in the ring, and one to each group)
      const ring = new Set(m.atoms.slice(0, 6).map((a) => a.id));
      expect(bonds.filter((b) => ring.has(b.a) && ring.has(b.b)).length, label).toBe(2);
    }
  });

  it("reads the same on a chain's atom", () => {
    for (const [label] of FORMS) {
      const { st, at } = drawn(false, label);
      expect(st().model.atoms.find((a) => a.id === at)?.el, label).toBe(label);
    }
  });

  it("is no reading of a metal's formula or an anion's: nicl2 is NiCl2, BPh4 an anion", () => {
    expect(keptLabel("nicl2", labelReading)).toBe("NiCl2");
    expect(abbreviationOf("BPh")).toBeUndefined();
  });
});
