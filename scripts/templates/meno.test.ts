import { describe, expect, it } from "vitest";
import type { Property } from "../../src/lib/entry";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../../src/ui/features/Workspace/document";
import type { Molecule3D } from "../../src/ui/features/Workspace/store/types";
import { setEntries, setMembers } from "../../src/ui/features/Workspace/workflow/entries";
import { matchesOf } from "../../src/ui/features/Workspace/workflow/pairs";
import { resultOf } from "../../src/ui/features/Workspace/workflow/flow";
import { addSet, addStep, connect } from "../../src/ui/features/Workspace/workflow/model";
import { runStep, type RunWith } from "../../src/ui/features/Workspace/workflow/run";
import { dftRecipe, xtbRecipe } from "./recipe";
import { dftTemplate, xtbTemplate } from "./build";
import { conditionsIn } from "../../src/lib/nodes/filter";
import type { Unit } from "../../src/lib/units";

// Meno's own steps of the template, run on made entries that stand in for what the plugins give (no plugin is run): the path results' validity
// filters and the energy diagram's levels, with the recipe's own options. What a plugin's output carries from step to step is read in
// workflow/programs (a path keeps its start's properties) and docs/STRUCTURE-STEPS.md (Re-bond keeps both entries' labels).

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
const text = (value: string): Property => ({ value, unit: "none", status: "computed" });
const recipe = (key: string) => [...xtbRecipe(), ...dftRecipe()].find((s) => s.key === key)!;

/** A water called `title` at `x`, one conformer of each energy, each carrying the properties given. */
function entry(title: string, x: number, energies: number[], properties: Record<string, string>[]): Omit<Molecule3D, "id"> {
  return {
    at: { x, y: 0 },
    title,
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(energies.length > 1 ? { frames: energies.slice(1).map((_, k) => [0, 0, 0, 0.97 + 0.01 * k, 0, 0, -0.24, 0.94, 0]), conformerSet: true } : {}),
    energies,
    calc: { readers: ["meno"], program: "prog", method: "GFN2-xTB" },
    properties: properties.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, text(v)]))),
  };
}

/** A page: a set of the molecules given (the page's own x going on), its id, and a way to add a step from the recipe wired to sets, and to run it. */
function builder() {
  let doc: WorkspaceDocument = emptyWorkspaceDocument();
  let at = 0;
  return {
    get doc() {
      return doc;
    },
    /** A set of molecules put down in a row. */
    set(molecules: Omit<Molecule3D, "id">[]): number {
      const x0 = at;
      for (const m of molecules) {
        doc = addMolecule3d(doc, { ...m, at: { x: at, y: 0 } });
        at += 4;
      }
      const id = doc.nextWorkflowId ?? 1;
      doc = addSet(doc, { x0: x0 - 2, y0: -2, x1: at - 2, y1: 2 });
      at += 4;
      return id;
    },
    /** The recipe's step `key` (its kind, plugin and options as the recipe has them, `options` laid over them), wired from `inputs`, and run: its id. */
    run(key: string, inputs: Record<string, { set: number }>, options: Record<string, string | number | boolean> = {}): number {
      const r = recipe(key);
      const id = doc.nextWorkflowId ?? 1;
      doc = addStep(doc, r.kind, 200 + 20 * id, 0, { ...r.options, ...options }, r.by);
      for (const [port, from] of Object.entries(inputs)) doc = connect(doc, from, id, port);
      doc = runStep(doc, id, W);
      return id;
    },
    /** What a step's exit holds, each by its path's name (the property `path-forward` its made entry carries). */
    titles(step: number, exit = "out", property = "path-forward"): string[] {
      const set = resultOf(doc, step, exit);
      if (!set) return [];
      return setMembers(doc, set)
        .molecules.map((m) => {
          const mol = doc.molecules3d!.find((x) => x.id === m)!;
          return String((mol.properties ?? []).map((q) => q[property]).find(Boolean)?.value ?? "?");
        })
        .sort();
    },
    /** The value of a property on the entries a step's exit holds, by title. */
    values(step: number, property: string, exit = "out"): Record<string, string | undefined> {
      const set = resultOf(doc, step, exit)!;
      const ids = setMembers(doc, set).molecules;
      return Object.fromEntries(
        ids.map((m) => {
          const mol = doc.molecules3d!.find((x) => x.id === m)!;
          const p = (mol.properties ?? []).map((q) => q[property]).find(Boolean);
          return [mol.title ?? "?", p ? String(p.value) : undefined];
        }),
      );
    },
  };
}

// A saddle point as the path's steps give it: its start's properties (a path keeps its start's), the names of its two ends joined on from the reaction
// path's ends, in the order the program gives them. The reactant is species-1; the products are species-2 and species-3.
const saddle = (title: string, species: string, first: string, last: string, extra: Record<string, string> = {}) => entry(title, 0, [-76.4], [{ species, "path-forward": title, "first end": first, "last end": last, ...extra }]);

describe("the forward paths' validity filters, run on made path results (Meno's own steps only)", () => {
  // (forward: a saddle point's species is the reactant's, the start's; the product it was made for is its target, put on the end it came from)
  const forward = (b: ReturnType<typeof builder>) =>
    b.set([
      saddle("right", "species-1", "species-1", "species-2", { target: "species-2" }),
      saddle("reversed", "species-1", "species-2", "species-1", { target: "species-2" }),
      saddle("both reactant", "species-1", "species-1", "species-1", { target: "species-2" }),
      saddle("wrong product", "species-1", "species-1", "species-3", { target: "species-2" }),
      saddle("two products", "species-1", "species-2", "species-3", { target: "species-2" }),
      saddle("other product, right", "species-1", "species-3", "species-1", { target: "species-3" }),
    ]);

  it("keeps a path whose ends are the reactant and the product it was made for, in either order, and no other", () => {
    const b = builder();
    const set = forward(b);
    const a = b.run("forward/valid-a", { in: { set } });
    const rest = resultOf(b.doc, a, "rest")!;
    const second = b.run("forward/valid-b", { in: { set: rest.id } });
    expect(b.titles(a)).toEqual(["right"]);
    expect(b.titles(second)).toEqual(["other product, right", "reversed"]);
    expect(b.titles(second, "rest")).toEqual(["both reactant", "two products", "wrong product"]);
  });
});

describe("the ends given their roles, so that both orders of the reaction path read alike", () => {
  it("puts on each saddle point its reactant end and its product end, whichever order its two ends came in", () => {
    const b = builder();
    const set = b.set([saddle("right", "species-1", "species-1", "species-2", { target: "species-2" }), saddle("reversed", "species-1", "species-2", "species-1", { target: "species-2" })]);
    // (the ends as the path's steps give them: each end's entry carries its path and the name Compare bonding wrote)
    const firsts = b.set([entry("f1", 0, [-76.4], [{ "path-forward": "right", "first end": "species-1" }]), entry("f2", 0, [-76.4], [{ "path-forward": "reversed", "first end": "species-2" }])]);
    const lasts = b.set([entry("l1", 0, [-76.4], [{ "path-forward": "right", "last end": "species-2" }]), entry("l2", 0, [-76.4], [{ "path-forward": "reversed", "last end": "species-1" }])]);
    const a = b.run("forward/valid-a", { in: { set } });
    const second = b.run("forward/valid-b", { in: { set: resultOf(b.doc, a, "rest")!.id } });
    const done = (group: "a" | "b", from: number) => {
      const reactant = b.run(`forward/roled-${group}`, { onto: { set: resultOf(b.doc, from)!.id }, from: { set: group === "a" ? firsts : lasts } });
      return b.run(`forward/roles-${group}`, { onto: { set: resultOf(b.doc, reactant)!.id }, from: { set: group === "a" ? lasts : firsts } });
    };
    const ra = done("a", a);
    const rb = done("b", second);
    const merged = b.run("forward/valid", { first: { set: resultOf(b.doc, ra)!.id }, second: { set: resultOf(b.doc, rb)!.id } });
    expect(b.titles(merged)).toEqual(["reversed", "right"]);
    const byPath = (property: string) => {
      const set = resultOf(b.doc, merged)!;
      return Object.fromEntries(
        setMembers(b.doc, set).molecules.map((m) => {
          const props = b.doc.molecules3d!.find((x) => x.id === m)!.properties ?? [];
          const get = (n: string) => String(props.map((q) => q[n]).find(Boolean)?.value);
          return [get("path-forward"), get(property)];
        }),
      );
    };
    expect(byPath("reactant end")).toEqual({ right: "species-1", reversed: "species-1" });
    expect(byPath("product end")).toEqual({ right: "species-2", reversed: "species-2" });
  });
});

describe("the forward ends given the species of the product they were made for", () => {
  it("puts on each end the species of the product its ID names - target - where the ends carry the product ID and the reactant's species", () => {
    const b = builder();
    // (two reactant conformers each re-bonded as both products: four ends, each carrying its product and the reactant's species)
    const ends = b.set(
      ["product-1", "product-2"].flatMap((p) => [1, 2].map((c) => entry(`${p}/${c}`, 0, [-76.4], [{ species: "species-1", product: p, start: `start-${c}` }]))),
    );
    // (the products, each with its species ID and its product ID)
    const products = b.set([entry("p1", 0, [-76.4], [{ species: "species-2", product: "product-1" }]), entry("p2", 0, [-76.4], [{ species: "species-3", product: "product-2" }])]);
    const joined = b.run("forward/ends", { onto: { set: ends }, from: { set: products } });
    const set = resultOf(b.doc, joined)!;
    const got = setMembers(b.doc, set).molecules.map((m) => {
      const props = b.doc.molecules3d!.find((x) => x.id === m)!.properties ?? [];
      const get = (n: string) => String(props.map((q) => q[n]).find(Boolean)?.value);
      return `${get("product")}>${get("target")}`;
    });
    expect(got.sort()).toEqual(["product-1>species-2", "product-1>species-2", "product-2>species-3", "product-2>species-3"]);
  });
});

describe("the energy diagram's levels, run on made saddle points of two paths and minima of three species", () => {
  /** A conformer set of the energies given (hartrees), each conformer carrying `properties`. */
  const conformers = (title: string, energies: number[], properties: Record<string, string>) => entry(title, 0, energies, energies.map(() => properties));

  it("draws a level for each species and one for each path - the path's saddle points its thin lines - the reactant in its column, the saddle points in the next, the products in the last", () => {
    const b = builder();
    // (the reactant a and two products b and c, each of two conformers; the paths a>b and a>c each of three saddle points, as the paths' steps leave them: carrying their
    //  product, their start's species, and their two ends by role)
    const set = b.set([
      conformers("a", [-76.4, -76.39], { species: "species-1" }),
      conformers("b", [-76.42, -76.41], { species: "species-2" }),
      conformers("c", [-76.41, -76.4], { species: "species-3" }),
      conformers("TS b", [-76.375, -76.37, -76.36], { product: "product-1", species: "species-1", "reactant end": "species-1", "product end": "species-2" }),
      conformers("TS c", [-76.38, -76.372, -76.365], { product: "product-2", species: "species-1", "reactant end": "species-1", "product end": "species-3" }),
    ]);
    const diagram = recipe("diagram");
    const step = b.run("diagram", { levels: { set } }, { quantity: "energy" });
    const ran = b.doc.steps!.find((x) => x.id === step)!;
    expect([diagram.options!.levelsBy, diagram.options!.joinedBy, diagram.options!.conformers, diagram.options!.reference]).toEqual(["product\nspecies", "reactant end\nproduct end", "every", "species-1"]);
    expect(ran.ran?.ok).toBe(true);
    const d = resultOf(b.doc, step)!.chart as { levels: { name: string; column?: number; lowestOf: number; others?: unknown[] }[]; links: number[][] };
    expect(d.levels.map((l) => [l.name, l.column, l.lowestOf])).toEqual([
      ["species-1", 0, 2],
      ["species-2", 2, 2],
      ["species-3", 2, 2],
      ["product-1", 1, 3],
      ["product-2", 1, 3],
    ]);
    // (each saddle point's other conformers thin lines under its bar)
    expect(d.levels.map((l) => l.others?.length ?? 0)).toEqual([1, 1, 1, 2, 2]);
    // (the reactant to each path's level, each to its product)
    expect(d.links.map((l) => l.join(">")).sort()).toEqual(["0>3", "0>4", "3>1", "4>2"]);
  });
});

describe("the backward paths, run on made results", () => {
  it("gives each product conformer the product it is of - the product's ID matched on its species - and keeps the paths whose ends are the reactant and its own species", () => {
    const b = builder();
    const conformers = b.set([entry("c1", 0, [-76.4], [{ species: "species-2" }]), entry("c2", 0, [-76.4], [{ species: "species-3" }])]);
    const products = b.set([entry("p1", 0, [-76.4], [{ species: "species-2", product: "product-1" }]), entry("p2", 0, [-76.4], [{ species: "species-3", product: "product-2" }])]);
    const of = b.run("backward/geometry-of", { onto: { set: conformers }, from: { set: products } });
    const set = resultOf(b.doc, of)!;
    const got = setMembers(b.doc, set).molecules.map((m) => {
      const props = b.doc.molecules3d!.find((x) => x.id === m)!.properties ?? [];
      const get = (n: string) => String(props.map((q) => q[n]).find(Boolean)?.value);
      return `${get("species")}>${get("product")}`;
    });
    expect(got.sort()).toEqual(["species-2>product-1", "species-3>product-2"]);
    // (a backward saddle point's species is the product's, its start's: its path ends at the reactant and at that species, in either order)
    const paths = b.set([
      saddle("right", "species-2", "species-1", "species-2"),
      saddle("reversed", "species-2", "species-2", "species-1"),
      saddle("other species", "species-2", "species-1", "species-3"),
    ]);
    const a = b.run("backward/valid-a", { in: { set: paths } });
    const second = b.run("backward/valid-b", { in: { set: resultOf(b.doc, a, "rest")!.id } });
    expect([b.titles(a), b.titles(second), b.titles(second, "rest")]).toEqual([["right"], ["reversed"], ["other species"]]);
  });
});

describe("the cap after the two directions are merged, and the split back by direction", () => {
  const found = (name: string, dir: "forward" | "backward", product: string, energy: number) => entry(name, 0, [energy], [{ [`path-${dir}`]: name, product, "path-name": name }]);

  it("keeps the lowest 16 of each path whichever direction they came from, and splits what is kept by the path tag it carries", () => {
    const b = builder();
    // (18 saddle points of path product-1: 9 from each direction, energies rising; 2 of path product-2)
    const many = Array.from({ length: 18 }, (_, i) => found(`s${String(i).padStart(2, "0")}`, i % 2 ? "forward" : "backward", "product-1", -76.4 + 0.001 * i));
    const set = b.set([...many, found("t0", "forward", "product-2", -76.39), found("t1", "backward", "product-2", -76.38)]);
    const capped = b.run("saddles-16", { in: { set } });
    const kept = b.titles(capped, "out", "path-name");
    expect(kept).toHaveLength(18);
    expect(kept.filter((t) => t.startsWith("s"))).toEqual(many.slice(0, 16).map((m) => String(m.properties![0]["path-name"].value)).sort());
    expect(b.titles(capped, "rest", "path-name")).toEqual(["s16", "s17"]);
    const split = b.run("dft-split", { in: { set: resultOf(b.doc, capped)!.id } });
    expect(b.titles(split, "out", "path-name")).toEqual(["s01", "s03", "s05", "s07", "s09", "s11", "s13", "s15", "t0"]);
    expect(b.titles(split, "rest", "path-name")).toEqual(["s00", "s02", "s04", "s06", "s08", "s10", "s12", "s14", "t1"]);
  });
});

describe("the barriers' pairing, run on made saddle points of two paths and the lowest conformer of three species", () => {
  it("sets each saddle point against the lowest conformer of the reactant it was made from, never a product's: 16 of each of two paths, 32 pairs, each with species-1", () => {
    const b = builder();
    // (one conformer of each species; 16 saddle points of each path, each carrying its reactant end as the paths' steps leave it)
    const minimum = (title: string, energy: number, species: string) => entry(title, 0, [energy], [{ species }]);
    const minima = b.set([minimum("a", -76.4, "species-1"), minimum("b", -76.45, "species-2"), minimum("c", -76.5, "species-3")]);
    const ts = (path: string, product: string, i: number) =>
      entry(`${path}-${i}`, 0, [-76.37 - 0.0001 * i], [{ product: path, species: "species-1", "reactant end": "species-1", "product end": product }]);
    const saddles = b.set([...Array.from({ length: 16 }, (_, i) => ts("product-1", "species-2", i)), ...Array.from({ length: 16 }, (_, i) => ts("product-2", "species-3", i))]);
    // (the lowest of each species - by E, as the made entries have no free energy - each named as a reactant end, both by the recipe's own steps)
    const lowest = b.run("lowest", { in: { set: minima } }, { property: "energy" });
    const named = b.run("lowest-named", { onto: { set: resultOf(b.doc, lowest)!.id }, from: { set: resultOf(b.doc, lowest)!.id } });
    expect(b.titles(named, "out", "reactant end")).toEqual(["species-1", "species-2", "species-3"]);
    // (paired as the recipe's Barrier steps pair them - xTB and DFT alike: the saddle points first, the starts second)
    const entriesOf = (step: number) =>
      setEntries(
        setMembers(b.doc, resultOf(b.doc, step)!).molecules.map((m) => b.doc.molecules3d!.find((x) => x.id === m)!),
        "molecules",
      );
    const saddleEntries = setEntries(
      setMembers(b.doc, b.doc.sets!.find((x) => x.id === saddles)!).molecules.map((m) => b.doc.molecules3d!.find((x) => x.id === m)!),
      "molecules",
    );
    for (const key of ["barriers", "dft-barriers"]) {
      const o = recipe(key).options!;
      expect([o.pairs, o.property], key).toEqual(["property", "reactant end"]);
      const starts = entriesOf(named);
      const m = matchesOf(saddleEntries, starts, "property", String(o.property), { first: "Saddle points", second: "Starts", one: "saddle point", other: "start", unlike: () => null });
      expect("ends" in m, key).toBe(true);
      const ends = (m as { ends: number[][] }).ends;
      expect(ends.filter((e) => e.length === 1), key).toHaveLength(32);
      const species = ends.map((e) => String(starts[e[0]].properties?.species?.value));
      expect(new Set(species), key).toEqual(new Set(["species-1"]));
    }
  });
});

describe("the Filter steps' conditions", () => {
  // (the unit of each column a Filter compares with a number, as the step that writes it gives it: Descriptors' molecular weight in g/mol;
  // a count - imaginary frequencies, torsions unlike the reference, atoms moving outside the reacting ones - of no unit. A number given
  // in another unit than its column's is refused when it runs, and what it would have kept goes nowhere)
  const UNIT_OF: Record<string, Unit | "none"> = { mw: "g/mol", imaginary: "none", "torsions unlike reference": "none", "mode.outside": "none" };

  it("give every number the unit of its column, in both templates", () => {
    const filters = [...xtbRecipe(), ...dftRecipe()].filter((s) => s.kind === "filter");
    expect(filters.length).toBeGreaterThan(0);
    for (const s of filters) {
      const read = conditionsIn(String(s.options?.conditions));
      if (!("conditions" in read)) throw new Error(`${s.key}: ${read.why}`);
      for (const c of read.conditions) {
        if (!("value" in c) || typeof c.value !== "number") continue;
        expect(Object.keys(UNIT_OF), `${s.key}: ${c.property}`).toContain(c.property);
        expect(c.unit, `${s.key}: ${c.property}`).toBe(UNIT_OF[c.property]);
      }
    }
  });

  it("are written so in the templates built: the reactants weighed in g/mol", { timeout: 120000 }, () => {
    for (const t of [xtbTemplate(), dftTemplate()]) expect(t.text).toContain("mw <= 512 g/mol");
  });
});
