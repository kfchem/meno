import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Arrow, Atom, Bond, DrawnRecord, Model } from "../store/types";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { countOf, countSaid, lyingIn, type Frame } from "./entries";
import { inputOf } from "./flow";
import { addSet, addStep, connect } from "./model";
import { setStructuresTable } from "./run";
import { recordsWithRoles, schemeRoles, schemeSaid } from "./schemeRoles";

/**
 * A structure of two bonded atoms with its left atom at (`x`, `y`) bond lengths
 * from the origin: A, B, C... by their first atom's id.
 */
const pair = (id: number, x: number, y: number): { atoms: Atom[]; bonds: Bond[] } => ({
  atoms: [{ id, el: "C", x: x * L, y: y * L, r: 0 } as Atom, { id: id + 1, el: "C", x: (x + 1) * L, y: y * L, r: 0 } as Atom],
  bonds: [{ id, a: id, b: id + 1, order: 1 } as Bond],
});
const arrow = (id: number, x: number, y: number, extra: Partial<Arrow> = {}): Arrow => ({ id, x: x * L, y: y * L, angle: 0, length: 3 * L, ...extra });
const FRAME: Frame = { x0: -60 * L, y0: -60 * L, x1: 60 * L, y1: 60 * L };

/** A page of `structures` (each `pair`'s) and `arrows`, its pluses where `pluses` say - the drawing in the order given, or reversed. */
function page(structures: ReturnType<typeof pair>[], arrows: Arrow[], pluses: { x: number; y: number }[] = [], reversed = false): WorkspaceDocument {
  const atoms = structures.flatMap((s) => s.atoms);
  const bonds = structures.flatMap((s) => s.bonds);
  const model = { atoms: reversed ? [...atoms].reverse() : atoms, bonds: reversed ? [...bonds].reverse() : bonds } as Model;
  return {
    ...emptyWorkspaceDocument(),
    model,
    arrows: reversed ? [...arrows].reverse() : arrows,
    pluses: pluses.map((p, i) => ({ id: 500 + i, x: p.x * L, y: p.y * L })),
    nextId: 1000,
  };
}

/** Each structure's role and reaction, by its first atom's id (in the set's order: the structures lying in `FRAME`). */
function rolesOf(doc: WorkspaceDocument, frame: Frame = FRAME): Record<number, string> {
  const { structures } = lyingIn(doc, frame);
  const read = schemeRoles(doc, frame, structures);
  if (!read) throw new Error("no arrow in the frame");
  return Object.fromEntries(structures.map((ids, i) => [Math.min(...ids), read.roles[i] ? `${read.roles[i]!.role}/${read.roles[i]!.reaction}` : "none"]));
}
const saidOf = (doc: WorkspaceDocument, frame: Frame = FRAME) => schemeRoles(doc, frame, lyingIn(doc, frame).structures)!.said;

// A (1) + B (3) -> C (7), a reagent R (5) over the arrow
const A = pair(1, -9, 0);
// (a lone reactant stands as near the tail as a reactant must)
const A1 = pair(1, -5, 0);
const B = pair(3, -5, 0);
const R = pair(5, 0.5, -2);
const C = pair(7, 4, 0);
const plus = { x: -6.5, y: 0 };

describe("a set around a drawn reaction: each structure's role and reaction", () => {
  it("gives A and B reactant, C product and a reagent over the arrow reagent, of reaction 1", () => {
    const doc = page([A, B, R, C], [arrow(1, 0, 0)], [plus]);
    expect(rolesOf(doc)).toEqual({ 1: "reactant/1", 3: "reactant/1", 5: "reagent/1", 7: "product/1" });
    expect(saidOf(doc)).toEqual(["1 reaction: 2 reactants, 1 product, 1 reagent"]);
  });

  it("numbers arrows in the order they lie, top to bottom, left to right: two side by side", () => {
    const doc = page([A1, C, pair(21, 24, 0), pair(24, 34, 0)], [arrow(2, 29, 0), arrow(1, 0, 0)]);
    expect(rolesOf(doc)).toEqual({ 1: "reactant/1", 7: "product/1", 21: "reactant/2", 24: "product/2" });
  });

  it("gives neither of two reactions one above the other the other's structures, nor its reagent", () => {
    const upper = [pair(1, -5, 12), pair(7, 4, 12), pair(5, 0.5, 10)];
    const lower = [pair(21, -5, 0), pair(27, 4, 0), pair(25, 0.5, -2)];
    // (the arrow higher on the page - larger y - is the first)
    const doc = page([...upper, ...lower], [arrow(1, 0, 12), arrow(2, 0, 0)]);
    expect(rolesOf(doc)).toEqual({ 1: "reactant/1", 5: "reagent/1", 7: "product/1", 21: "reactant/2", 25: "reagent/2", 27: "product/2" });
  });

  it("gives a structure on two arrows no role, saying so", () => {
    const chain = page([A1, pair(3, 3.5, 0), pair(8, 9.5, 0)], [arrow(1, 0, 0), arrow(2, 7.5, 0)]);
    expect(rolesOf(chain)).toEqual({ 1: "reactant/1", 3: "none", 8: "product/2" });
    expect(saidOf(chain)).toEqual(["2 reactions: 1 reactant, 1 product", "1 structure on two arrows: draw it once for each"]);
  });

  it("gives a structure on no arrow, in a set that has one, no role, saying so", () => {
    const doc = page([A1, C, pair(40, 20, 15)], [arrow(1, 0, 0)]);
    expect(rolesOf(doc)).toEqual({ 1: "reactant/1", 7: "product/1", 40: "none" });
    expect(saidOf(doc)).toEqual(["1 reaction: 1 reactant, 1 product", "1 structure on no arrow"]);
  });

  it("makes a crossed-out, a retrosynthetic, a headless and a two-headed arrow give no roles, each said", () => {
    const said = (extra: Partial<Arrow>) => {
      const doc = page([A1, C], [arrow(1, 0, 0, extra)]);
      return [rolesOf(doc), saidOf(doc)] as const;
    };
    const none = { 1: "none", 7: "none" };
    expect(said({ kind: "noReaction" })).toEqual([none, ["1 arrow crossed out: no reaction"]]);
    expect(said({ kind: "retrosynthetic" })).toEqual([none, ["1 retrosynthetic arrow: draw the reaction forward"]]);
    expect(said({ heads: 0 })).toEqual([none, ["1 line with no head: no reaction"]]);
    expect(said({ heads: 2 })).toEqual([none, ["1 two-headed arrow: resonance forms, no reaction"]]);
  });

  it("reads an equilibrium as drawn - the tail side the reactants - and says so", () => {
    const doc = page([A1, C], [arrow(1, 0, 0, { kind: "equilibrium", heads: 2 })]);
    expect(rolesOf(doc)).toEqual({ 1: "reactant/1", 7: "product/1" });
    expect(saidOf(doc)).toEqual(["1 reaction: 1 reactant, 1 product", "an equilibrium, read as drawn"]);
  });

  it("says each equilibrium read as drawn, by its number", () => {
    const doc = page([A1, C, pair(21, 24, 0), pair(24, 34, 0)], [arrow(1, 0, 0, { kind: "equilibrium", heads: 2 }), arrow(2, 29, 0, { kind: "equilibrium", heads: 2 })]);
    expect(saidOf(doc)).toEqual(["2 reactions: 2 reactants, 2 products", "2 equilibria, read as drawn"]);
  });

  it("gives a structure beside the arrow but more than five bonds from its words no role - not a reagent - saying it is on no arrow", () => {
    const near = page([A1, C, pair(5, 0.5, -4)], [arrow(1, 0, 0)]);
    expect(rolesOf(near)).toEqual({ 1: "reactant/1", 5: "reagent/1", 7: "product/1" });
    const far = page([A1, C, pair(5, 0.5, -7)], [arrow(1, 0, 0)]);
    expect(rolesOf(far)).toEqual({ 1: "reactant/1", 5: "none", 7: "product/1" });
    expect(saidOf(far)).toEqual(["1 reaction: 1 reactant, 1 product", "1 structure on no arrow"]);
  });

  it("reads only the pluses inside the frame: a plus just outside it, between two structures less than a bond apart, does not part them", () => {
    // (two structures half a bond apart and a "+" between them parts them into two molecules; the frame's top edge, between the row and the "+" - 0.4 bonds above it - leaves the "+" out, and they are one molecule)
    const frame = { x0: -60 * L, y0: -60 * L, x1: 60 * L, y1: 0.2 * L };
    const close = [pair(1, -5, 0), pair(3, -3.5, 0), C];
    const parted = page(close, [arrow(1, 0, 0)], [{ x: -3.75, y: 0 }]);
    expect(saidOf(parted, frame)).toEqual(["1 reaction: 2 reactants, 1 product"]);
    const left = page(close, [arrow(1, 0, 0)], [{ x: -3.75, y: 0.4 }]);
    expect(saidOf(left, frame)).toEqual(["1 reaction: 1 reactant (2 ions), 1 product"]);
  });

  it("counts a salt drawn as its ions one molecule, each ion with its role", () => {
    // (Na and Cl, atoms of their own, closer than a bond: one product)
    const na = { atoms: [{ id: 30, el: "Na", x: 4 * L, y: 0, r: 0, charge: 1 } as Atom], bonds: [] };
    const cl = { atoms: [{ id: 31, el: "Cl", x: 4.6 * L, y: 0, r: 0, charge: -1 } as Atom], bonds: [] };
    const doc = page([A1, na, cl], [arrow(1, 0, 0)]);
    expect(rolesOf(doc)).toEqual({ 1: "reactant/1", 30: "product/1", 31: "product/1" });
    expect(saidOf(doc)).toEqual(["1 reaction: 1 reactant, 1 product (2 ions)"]);
  });

  it("says nothing of a set with no arrow in its frame, whatever arrow lies outside it; its records are as they were", () => {
    const doc = page([A1, C], [arrow(1, 0, 0)]);
    const frame = { x0: -8 * L, y0: -5 * L, x1: -3 * L, y1: 5 * L };
    const { structures } = lyingIn(doc, frame);
    expect(structures).toHaveLength(1);
    expect(schemeRoles(doc, frame, structures)).toBeNull();
    const records = [{ properties: { number: { value: 2, unit: "none" as const, status: "computed" as const } } }];
    expect(recordsWithRoles(doc, frame, structures, records)).toEqual(records);
  });

  it("reads the set's structures alone: one outside its frame, beside the arrow, brings none in", () => {
    // (D, outside the frame, stands near the tail, and A within reach of D: with D read, A would be a reactant)
    const doc = page([A, pair(40, -5, 2.5), C], [arrow(1, 0, 0)]);
    const frame = { x0: -60 * L, y0: -2 * L, x1: 60 * L, y1: 2 * L };
    expect(rolesOf(doc, frame)).toEqual({ 1: "none", 7: "product/1" });
    expect(saidOf(doc, frame)).toEqual(["1 reaction: 1 product", "1 structure on no arrow"]);
  });

  it("changes a structure's role as it is moved across the arrow, live", () => {
    const doc = page([A1, C], [arrow(1, 0, 0)]);
    expect(rolesOf(doc)[7]).toBe("product/1");
    const moved = page([A1, pair(7, -9, 0)], [arrow(1, 0, 0)]);
    expect(rolesOf(moved)[7]).toBe("reactant/1");
  });

  it("gives the same roles whatever the order the drawing's atoms and arrows are held in", () => {
    const cases = [
      page([A, B, R, C], [arrow(1, 0, 0)], [plus]),
      page([A1, C, pair(21, 24, 0), pair(24, 34, 0)], [arrow(2, 29, 0), arrow(1, 0, 0)]),
      page([A1, pair(3, 3.5, 0), pair(8, 9.5, 0)], [arrow(1, 0, 0), arrow(2, 7.5, 0)]),
    ];
    for (const doc of cases) {
      const again = { ...doc, model: { atoms: [...doc.model.atoms].reverse(), bonds: [...doc.model.bonds].reverse() }, arrows: [...doc.arrows].reverse() } as WorkspaceDocument;
      expect(rolesOf(again)).toEqual(rolesOf(doc));
      expect(saidOf(again)).toEqual(saidOf(doc));
    }
  });
});

describe("a set around a drawn reaction, as the page reads it", () => {
  /** The page of A + B -> C with R, a set around it, and a Filter on it. */
  function filtered(): WorkspaceDocument {
    let doc = page([A, B, R, C], [arrow(1, 0, 0)], [plus]);
    doc = addSet(doc, FRAME);
    doc = addStep(doc, "filter", 70 * L, 0, { conditions: "role = reactant", match: "all" });
    return connect(doc, { set: doc.sets![0].id }, doc.steps![0].id);
  }

  it("carries role and reaction as each structure's properties into a step, and says the roles in the set's count line", () => {
    const doc = filtered();
    const input = inputOf(doc, doc.steps![0].id)!;
    expect(input.structures).toHaveLength(4);
    const props = input.records.map((r) => [r?.properties?.role?.value, r?.properties?.reaction?.value, r?.properties?.role?.status]);
    expect(props.filter((p) => p[0] === "reactant")).toEqual([
      ["reactant", 1, "computed"],
      ["reactant", 1, "computed"],
    ]);
    expect(props.map((p) => p[0]).sort()).toEqual(["product", "reactant", "reactant", "reagent"]);
    const set = doc.sets![0];
    expect(countSaid(set, countOf(doc, set), schemeSaid(doc, set))).toBe("4 structures · 1 reaction: 2 reactants, 1 product, 1 reagent");
  });

  it("leaves a set that holds no arrow's count line as it was", () => {
    let doc = page([A1, C], []);
    doc = addSet(doc, FRAME);
    const set = doc.sets![0];
    expect(schemeSaid(doc, set)).toEqual([]);
    expect(countSaid(set, countOf(doc, set), schemeSaid(doc, set))).toBe("2 structures");
  });

  it("keeps a record's own properties - a Tag's id, a name - beside the role and reaction it is given", () => {
    const doc = page([A, B, R, C], [arrow(1, 0, 0)], [plus]);
    const { structures } = lyingIn(doc, FRAME);
    const own = { id: { value: "T-7", unit: "none", status: "computed" }, name: { value: "ketone", unit: "none", status: "computed" } } as const;
    const records = structures.map(() => ({ properties: { ...own } }) as DrawnRecord);
    const out = recordsWithRoles(doc, FRAME, structures, records);
    out.forEach((r, i) => {
      expect(Object.keys(r!.properties!).sort()).toEqual(["id", "name", "reaction", "role"]);
      expect(r!.properties!.id).toEqual(own.id);
      expect(r!.properties!.name).toEqual(own.name);
      expect(r!.properties!.role.value).toBe(rolesOf(doc)[Math.min(...structures[i])].split("/")[0]);
    });
    // (a structure with no record yet is given one holding the role and reaction alone; the records handed in are not changed)
    const bare = recordsWithRoles(doc, FRAME, structures, structures.map(() => undefined));
    expect(Object.keys(bare[0]!.properties!).sort()).toEqual(["reaction", "role"]);
    expect(Object.keys(records[0].properties!)).toEqual(["id", "name"]);
  });

  it("carries role and reaction into the table of a set's structures too", () => {
    const doc = page([A, B, R, C], [arrow(1, 0, 0)], [plus]);
    const { structures } = lyingIn(doc, FRAME);
    const set = { ...addSet(doc, FRAME).sets![0], members: structures.map((s) => ({ structure: s })) };
    const table = setStructuresTable(doc, set);
    const names = table.columns.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["role", "reaction"]));
    const at = names.indexOf("role");
    expect(table.rows.map((r) => String((r[at] as { value?: unknown })?.value ?? r[at])).sort()).toEqual(["product", "reactant", "reactant", "reagent"]);
  });
});
