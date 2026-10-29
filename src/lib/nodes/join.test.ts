import { describe, expect, it } from "vitest";
import type { Property } from "../entry";
import { carriedIn, join } from "./join";
import { entry, quantity } from "./testEntries";

const text = (value: string): Property => ({ value, unit: "none", status: "computed" });
const ids = (es: { id: string }[]) => es.map((x) => x.id);
const why = (es: { id: string; status: unknown }[]) => es.map((x) => [x.id, (x.status as { aside: string }).aside]);

describe("Join", () => {
  it("puts the other input's properties on each entry matched on a property both carry, each record as it was", () => {
    // (saddle points, each with its path; the first ends of their reaction paths, each named by Compare bonding)
    const saddles = [entry("ts1", { path: text("a→b") }), entry("ts2", { path: text("a→c") })];
    const g = quantity(-1.5, "Eh", { program: "P", method: "M" }, { kelvin: 298.15 });
    const ends = [entry("e2", { path: text("a→c"), species: text("a"), g }), entry("e1", { path: text("a→b"), species: text("b"), g })];
    const out = join(saddles, ends, { on: "path", carry: [{ from: "species", as: "first end" }, { from: "g", as: "g" }] });
    if (!out.ok) throw new Error(out.said);
    expect(ids(out.exits.joined)).toEqual(["ts1", "ts2"]);
    expect(out.exits.joined.map((e) => e.properties["first end"].value)).toEqual(["b", "a"]);
    // (each put on as it was: its value, unit, where and by what it was worked out)
    expect(out.exits.joined[0].properties.g).toEqual(g);
    expect(out.said).toBe("2 of 2 entries given species as first end, g, on path");
  });

  it("sets aside an entry with no match, or more than one - saying which - never matching by anything else", () => {
    const es = [entry("x", { path: text("p") }), entry("y", { path: text("q") }), entry("z", {})];
    const others = [entry("o1", { path: text("q"), species: text("b") }), entry("o2", { path: text("q"), species: text("c") }), entry("o3", { path: text("r"), species: text("d") })];
    const out = join(es, others, { on: "path", carry: [{ from: "species", as: "species" }] });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.joined).toEqual([]);
    expect(why(out.exits.rest)).toEqual([
      ["x", "no entry of the other input has its path, p"],
      ["y", "2 entries of the other input have its path, q"],
      ["z", "it has no path"],
    ]);
    expect(out.said).toBe("0 of 3 entries given species, on path · rest 3 (1: no entry of the other input has its path, p; 1: 2 entries of the other input have its path, q; 1: it has no path) · 3 of the other input's entries matched none");
  });

  it("puts nothing on an entry whose match lacks a property asked for, nor overwrites one of its own", () => {
    const es = [entry("x", { path: text("p") }), entry("y", { path: text("q"), species: text("mine") })];
    const others = [entry("o1", { path: text("p") }), entry("o2", { path: text("q"), species: text("b") })];
    const out = join(es, others, { on: "path", carry: [{ from: "species", as: "species" }] });
    if (!out.ok) throw new Error(out.said);
    expect(why(out.exits.rest)).toEqual([
      ["x", "its match has no species"],
      ["y", "it has its own species already"],
    ]);
  });

  it("reads what to put on as typed: names, or names as others, a line or a semicolon each", () => {
    expect(carriedIn("species as first end; g\n  energy as e ")).toEqual({ carry: [{ from: "species", as: "first end" }, { from: "g", as: "g" }, { from: "energy", as: "e" }] });
    expect(carriedIn("a as x; b as x")).toEqual({ why: '"x" is put on twice' });
    expect(carriedIn("")).toEqual({ carry: [] });
  });

  it("says why, and makes nothing, with no property to match on or nothing to put on", () => {
    expect(join([], [], { on: " ", carry: [{ from: "a", as: "a" }] })).toEqual({ ok: false, said: "No property to match on" });
    expect(join([], [], { on: "path", carry: [] })).toEqual({ ok: false, said: "Nothing named to put on" });
  });
});

describe("Join's line", () => {
  it("counts the other input's entries that matched none, one as well as more", () => {
    const out = join([entry("x", { path: { value: "p", unit: "none", status: "computed" } })], [entry("o1", { path: { value: "p", unit: "none", status: "computed" }, s: { value: "a", unit: "none", status: "computed" } }), entry("o2", { path: { value: "q", unit: "none", status: "computed" } })], { on: "path", carry: [{ from: "s", as: "s" }] });
    expect(out.ok && out.said).toBe("1 of 1 entry given s, on path · 1 of the other input's entries matched none");
  });
});
