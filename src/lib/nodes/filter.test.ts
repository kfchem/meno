import { describe, expect, it } from "vitest";
import { conditionsIn, filter } from "./filter";
import { entry, quantity } from "./testEntries";

const rel = (kcal: number) => quantity(kcal, "kcal/mol");
const set = [
  entry("a", { "relative energy": rel(0), imaginary: quantity(0, "none"), label: quantity(1, "none") }),
  entry("b", { "relative energy": rel(2.5), imaginary: quantity(1, "none") }),
  entry("c", { "relative energy": rel(4) }),
  entry("d", {}),
];
const ids = (es: { id: string }[]) => es.map((e) => e.id);

describe("Filter", () => {
  it("keeps those that meet every condition, the rest set aside saying why, the counts adding up", () => {
    const out = filter(set, { conditions: [{ property: "relative energy", compare: "≤", value: 3, unit: "kcal/mol" }], match: "all" });
    if (!out.ok) throw new Error(out.said);
    expect(ids(out.exits.kept)).toEqual(["a", "b"]);
    expect(out.exits.rest.map((e) => [e.id, e.status])).toEqual([
      ["c", { aside: "not relative energy ≤ 3 kcal/mol (4 kcal/mol)" }],
      ["d", { aside: "it has no relative energy" }],
    ]);
    expect(out.exits.kept.length + out.exits.rest.length).toBe(set.length);
    expect(out.said).toBe("2 of 4 entries kept · rest 2 (1: not relative energy ≤ 3 kcal/mol (4 kcal/mol); 1: it has no relative energy)");
  });

  it("compares in the condition's unit: 1 kcal/mol is 4.184 kJ/mol exactly (the thermochemical calorie)", () => {
    // (1 cal = 4.184 J exactly: the thermochemical calorie, as NIST SP 811, B.8, has it)
    const one = [entry("x", { e: rel(1) })];
    const at = (compare: "<" | "≤" | "=", kJ: number) => {
      const out = filter(one, { conditions: [{ property: "e", compare, value: kJ, unit: "kJ/mol" }], match: "all" });
      return out.ok ? out.exits.kept.length : -1;
    };
    expect(at("=", 4.184)).toBe(1);
    expect(at("≤", 4.184)).toBe(1);
    expect(at("<", 4.184)).toBe(0);
    expect(at("<", 4.185)).toBe(1);
  });

  it("never compares across dimensions, or a count with an energy: it says so instead", () => {
    const out = filter([entry("x", { e: quantity(300, "K") }), entry("y", { e: quantity(2, "none") })], { conditions: [{ property: "e", compare: "<", value: 3, unit: "kcal/mol" }], match: "all" });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.rest.map((e) => e.status)).toEqual([{ aside: "its e is in K, which does not convert to kcal/mol" }, { aside: "its e is in no unit, not kcal/mol" }]);
  });

  it("keeps those that meet any condition, where asked; one with no value for one of them can still meet another", () => {
    const out = filter(set, {
      conditions: [
        { property: "imaginary", compare: "=", value: 1, unit: "none" },
        { property: "label", compare: "=", value: 1, unit: "none" },
      ],
      match: "any",
    });
    if (!out.ok) throw new Error(out.said);
    expect(ids(out.exits.kept)).toEqual(["a", "b"]);
    expect(out.exits.rest.find((e) => e.id === "c")!.status).toEqual({ aside: "it has no imaginary; it has no label" });
  });

  it("compares a text or true/false by = and ≠ alone, and refuses a condition it cannot ask", () => {
    const named = [entry("x", { name: quantity(0, "none") }), entry("y", {})];
    named[0].properties.name = { value: "start", unit: "none", status: "computed" };
    const out = filter(named, { conditions: [{ property: "name", compare: "=", value: "start" }], match: "all" });
    expect(out.ok && ids(out.exits.kept)).toEqual(["x"]);
    expect(filter(named, { conditions: [{ property: "name", compare: "<", value: "s" }], match: "all" })).toEqual({ ok: false, said: "name < s: a text or true/false is compared by = or ≠ alone" });
    expect(filter(named, { conditions: [], match: "all" })).toEqual({ ok: false, said: "No conditions yet" });
  });

  it("does not read a property that failed as a value", () => {
    const x = entry("x", {});
    x.properties.e = { value: 0, unit: "kcal/mol", status: { failed: "SCF not converged" } };
    const out = filter([x], { conditions: [{ property: "e", compare: "≤", value: 3, unit: "kcal/mol" }], match: "all" });
    expect(out.ok && out.exits.rest[0].status).toEqual({ aside: "its e failed: SCF not converged" });
  });
});

describe("conditions as typed", () => {
  it("reads a property, a comparison and a value - a number with its unit, true or false, or a text - one to a line or after a semicolon", () => {
    expect(conditionsIn("nll < 30; energy <= -76.4 Eh\nrelative energy ≤ 3 kcal/mol\nshift >= 2.5 cm⁻¹ ; aromatic = true; name != \"water\"")).toEqual({
      conditions: [
        { property: "nll", compare: "<", value: 30, unit: "none" },
        { property: "energy", compare: "≤", value: -76.4, unit: "Eh" },
        { property: "relative energy", compare: "≤", value: 3, unit: "kcal/mol" },
        { property: "shift", compare: "≥", value: 2.5, unit: "cm-1" },
        { property: "aromatic", compare: "=", value: true },
        { property: "name", compare: "≠", value: "water" },
      ],
    });
    // (a minus sign as typeset, and nothing between the lines)
    expect(conditionsIn("  ;\n e ≥ −1.5e-2 eV ;")).toEqual({ conditions: [{ property: "e", compare: "≥", value: -0.015, unit: "eV" }] });
  });

  it("says why of the first that does not read", () => {
    expect(conditionsIn("nll 30")).toEqual({ why: '"nll 30" compares nothing: it takes a property, then < ≤ > ≥ = or ≠, then a value' });
    expect(conditionsIn("< 30")).toEqual({ why: '"< 30" names no property' });
    expect(conditionsIn("mw < 500 furlongs")).toEqual({ why: '"mw < 500 furlongs": furlongs is no unit Meno knows' });
    // (one Meno knows, by its name or as it is written: g/mol, Å2 or Å²)
    expect(conditionsIn("mw < 500 g/mol; tpsa < 90 Å²")).toEqual({ conditions: [{ property: "mw", compare: "<", value: 500, unit: "g/mol" }, { property: "tpsa", compare: "<", value: 90, unit: "Å2" }] });
    expect(conditionsIn("nll <")).toEqual({ why: '"nll <" has nothing to compare with' });
  });

  it("filters as read: what comes in kept by the conditions typed", () => {
    const typed = conditionsIn("relative energy <= 3 kcal/mol; imaginary = 0");
    if ("why" in typed) throw new Error(typed.why);
    const out = filter(set, { conditions: typed.conditions, match: "all" });
    expect(out.ok && ids(out.exits.kept)).toEqual(["a"]);
  });

  it("reads a semicolon or a line inside double quotes as the text's, and refuses a quote not closed", () => {
    expect(conditionsIn('name = "a;b"; nll < 3')).toEqual({
      conditions: [
        { property: "name", compare: "=", value: "a;b" },
        { property: "nll", compare: "<", value: 3, unit: "none" },
      ],
    });
    expect(conditionsIn('name = "a; nll < 3')).toEqual({ why: "A quote is opened and not closed" });
  });

  it("reads a comparison whole: =<, =>, <==, ≥≥ or ! are none, and are refused, never read as = and a text", () => {
    for (const op of ["=<", "=>", "<==", "≥≥", "!"]) expect(conditionsIn(`x ${op} 3`)).toEqual({ why: `"x ${op} 3": ${op} is no comparison - it takes < ≤ > ≥ = or ≠ (or <= >= !=)` });
    expect(conditionsIn("x == 3")).toEqual({ conditions: [{ property: "x", compare: "=", value: 3, unit: "none" }] });
  });
});

describe("Filter, on what cannot be compared", () => {
  it("sets aside a number that is not finite - NaN, an infinity - saying so, whatever the comparison", () => {
    const odd = [entry("n", { x: quantity(NaN, "none") }), entry("i", { x: quantity(Infinity, "none") }), entry("f", { x: quantity(2, "none") })];
    for (const compare of ["≠", "≥", "<"] as const) {
      const out = filter(odd, { conditions: [{ property: "x", compare, value: compare === "<" ? 5 : 1, unit: "none" }], match: "all" });
      if (!out.ok) throw new Error(out.said);
      expect([ids(out.exits.kept), out.exits.rest.map((e) => e.status)]).toEqual([["f"], [{ aside: "its x is not a finite number" }, { aside: "its x is not a finite number" }]]);
    }
  });

  it("says, where any is met, of those kept how many had a condition it could not ask - no value, another unit or kind - never passing over it", () => {
    const two = [entry("a", { nll: quantity(10, "none"), gap: quantity(2, "eV") }), entry("b", { nll: quantity(15, "none") }), entry("c", { nll: quantity(50, "none") })];
    const out = filter(two, { conditions: [{ property: "nll", compare: "<", value: 20, unit: "none" }, { property: "gap", compare: ">", value: 1, unit: "K" }], match: "any" });
    if (!out.ok) throw new Error(out.said);
    expect(ids(out.exits.kept)).toEqual(["a", "b"]);
    expect(out.said).toBe(
      "2 of 3 entries kept · 2 of them with a condition not asked (1: its gap is in eV, which does not convert to K; 1: it has no gap) · rest 1 (1: not nll < 20 (50); it has no gap)",
    );
    // (all met, nothing more to say)
    const met = filter(two.slice(0, 2), { conditions: [{ property: "nll", compare: "<", value: 20, unit: "none" }], match: "any" });
    expect(met.ok && met.said).toBe("2 of 2 entries kept");
  });
});
