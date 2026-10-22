import { describe, expect, it } from "vitest";
import { rank } from "./rank";
import { entry, quantity } from "./testEntries";

const by = { program: "P", method: "M" };
const e = (id: string, value: number | null, group?: string, unit: "Eh" | "kcal/mol" = "kcal/mol", who = by) => entry(id, value == null ? {} : { energy: quantity(value, unit, who) }, group);
const ids = (es: { id: string }[]) => es.map((x) => x.id);

describe("Rank", () => {
  it("keeps the lowest of each group, in its group's order, the rest saying their place", () => {
    const out = rank([e("a1", 3, "a"), e("b1", 1, "b"), e("a2", 1, "a"), e("a3", 2, "a"), e("b2", 0, "b")], { property: "energy", order: "lowest first", keep: 1, within: "each group" });
    if (!out.ok) throw new Error(out.said);
    expect(ids(out.exits.kept)).toEqual(["a2", "b2"]);
    expect(out.exits.rest.map((x) => [x.id, x.status])).toEqual([
      ["a1", { aside: "ranked 3 of 3 in its group by energy, lowest first; the first 1 kept" }],
      ["b1", { aside: "ranked 2 of 2 in its group by energy, lowest first; the first 1 kept" }],
      ["a3", { aside: "ranked 2 of 3 in its group by energy, lowest first; the first 1 kept" }],
    ]);
    expect(out.exits.kept.length + out.exits.rest.length).toBe(5);
  });

  it("ranks values in different units of one dimension as one: 0.0015936 Eh is 1.000 kcal/mol (CODATA 2018)", () => {
    // (1 Eh = 627.509474 kcal/mol: the hartree, 4.3597447222071e-18 J, times the Avogadro constant over 4184 J/kcal -
    // so 0.0015936 Eh is 1.0000 kcal/mol and ranks above 0.9 kcal/mol and below 1.1)
    const out = rank([e("x", 1.1), e("y", 0.0015936, undefined, "Eh"), e("z", 0.9)], { property: "energy", order: "lowest first", keep: 3, within: "all" });
    expect(out.ok && ids(out.exits.kept)).toEqual(["z", "y", "x"]);
  });

  it("keeps ties in the order they came, and ranks highest first where asked", () => {
    const out = rank([e("p", 1), e("q", 2), e("r", 2)], { property: "energy", order: "highest first", keep: 2, within: "all" });
    expect(out.ok && ids(out.exits.kept)).toEqual(["q", "r"]);
  });

  it("never ranks together values worked out differently, nor one with no value: each set aside, saying so", () => {
    const out = rank([e("a", 1, "g"), e("b", 2, "g", "kcal/mol", { program: "P", method: "N" }), e("c", null, "g")], { property: "energy", order: "lowest first", keep: 1, within: "each group" });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.kept).toEqual([]);
    expect(out.exits.rest.map((x) => x.status)).toEqual([
      { aside: "its group's energy values differ in method: M (a) and N (b), and are not ranked together" },
      { aside: "its group's energy values differ in method: M (a) and N (b), and are not ranked together" },
      { aside: "it has no energy" },
    ]);
  });

  it("refuses to keep none, or a part of one", () => {
    expect(rank([e("a", 1)], { property: "energy", order: "lowest first", keep: 0, within: "all" })).toEqual({ ok: false, said: "How many to keep must be a whole number, 1 or more" });
    expect(rank([e("a", 1)], { property: "energy", order: "lowest first", keep: 1.5, within: "all" }).ok).toBe(false);
  });
});
