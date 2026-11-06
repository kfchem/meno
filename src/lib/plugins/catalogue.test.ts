import { describe, expect, it } from "vitest";
import { acceptCatalogue, offeredFor, offersOf, type Catalogue } from "./catalogue";

const HEX = "a".repeat(64);

/** An entry as a catalogue writes it, with what is changed. */
const entry = (over: Record<string, unknown> = {}) => ({
  id: "sketch",
  version: "0.2.0",
  name: "Sketch interface",
  licence: "Apache-2.0",
  contract: 1,
  systems: ["macos", "linux"],
  roles: ["smiles"],
  kinds: ["energy"],
  source: { url: "https://github.com/example/plugins/releases/download/sketch-v0.2.0/sketch-0.2.0.tar.gz", sha256: HEX, bytes: 12_345 },
  manifestSha256: HEX,
  ...over,
});

const catalogue = (plugins: unknown[], over: Record<string, unknown> = {}) => ({ schema: 1, issued: "2026-11-10T00:00:00Z", plugins, ...over });

const read = (raw: unknown) => acceptCatalogue(raw);
const why = (raw: unknown) => (read(raw) as { why?: string }).why;

describe("a catalogue of plugins online, read", () => {
  it("reads each entry as it is written: what Settings says of it, and where its files are", () => {
    const got = read(catalogue([entry({ terms: "For academic use.", cite: "A. Author, J. Chem. 1 (2020) 1.", description: "Draws.", homepage: "https://example.org" })]));
    expect(got).toEqual({
      catalogue: {
        schema: 1,
        issued: "2026-11-10T00:00:00Z",
        plugins: [
          {
            id: "sketch",
            version: "0.2.0",
            name: "Sketch interface",
            licence: "Apache-2.0",
            contract: 1,
            systems: ["macos", "linux"],
            roles: ["smiles"],
            kinds: ["energy"],
            reads: [],
            fileKinds: [],
            quotedTables: [],
            source: { url: "https://github.com/example/plugins/releases/download/sketch-v0.2.0/sketch-0.2.0.tar.gz", sha256: HEX, bytes: 12_345 },
            manifestSha256: HEX,
            description: "Draws.",
            homepage: "https://example.org",
            terms: "For academic use.",
            cite: "A. Author, J. Chem. 1 (2020) 1.",
          },
        ],
      },
    });
  });

  it("refuses the whole of it for one entry it cannot read - a catalogue is signed whole", () => {
    const good = entry();
    for (const bad of [
      entry({ id: "Sketch" }),
      entry({ id: "../up" }),
      entry({ version: "0.2" }),
      entry({ version: "latest" }),
      entry({ contract: "1" }),
      entry({ contract: 0 }),
      entry({ systems: ["amiga"] }),
      entry({ roles: ["anything"] }),
      entry({ kinds: ["Energy Window"] }),
      entry({ manifestSha256: "abc" }),
      entry({ terms: "" }),
      entry({ homepage: "http://example.org" }),
    ]) {
      expect(why(catalogue([good, bad]))).toMatch(/^It holds /);
    }
    expect(why(catalogue([good, { ...good }]))).toBe("It offers sketch twice");
  });

  it("reads the kinds of file an entry reads as its manifest says them - their marks strictly - or refuses the whole list", () => {
    const kind = { id: "sketch-out", name: "Sketch output", extensions: [".out", ".log"], marks: [{ text: "* S K E T C H *" }, { text: "Sketch version", at: "line-start", anyCase: true }], writtenBy: "sketch" };
    const got = read(catalogue([entry({ reads: ["sketch-out"], fileKinds: [kind] })])) as { catalogue: Catalogue };
    expect(got.catalogue.plugins[0].fileKinds).toEqual([kind]);
    // (none said: none)
    expect((read(catalogue([entry()])) as { catalogue: Catalogue }).catalogue.plugins[0].fileKinds).toEqual([]);
    const { writtenBy: _, ...notWritten } = kind;
    expect((read(catalogue([entry({ fileKinds: [notWritten] })])) as { catalogue: Catalogue }).catalogue.plugins[0].fileKinds).toEqual([notWritten]);
    for (const bad of [
      {},
      [{ ...kind, id: "Sketch Out" }],
      [{ ...kind, name: "" }],
      [{ ...kind, extensions: [".OUT"] }],
      [{ ...kind, extensions: "out" }],
      [{ ...kind, marks: [] }],
      [{ ...kind, marks: [{ text: "abc" }] }],
      [{ ...kind, marks: [{ text: "* S K E T C H *", at: null }] }],
      [{ ...kind, marks: [{ text: "* S K E T C H *", anyCase: false }] }],
      [{ ...kind, marks: [{ text: "* S K E T C H *", at: "anywhere" }] }],
      [{ ...kind, marks: [{ text: "* S K E T C H *", pattern: ".*" }] }],
      [{ ...kind, writtenBy: "a program" }],
      [kind, kind],
    ]) {
      expect(why(catalogue([entry(), entry({ id: "other", fileKinds: bad })])), JSON.stringify(bad)).toMatch(/^It holds other: a kind of file/);
    }
  });

  it("reads the tables of atoms an entry's program prints as its manifest keeps them - or refuses the whole list", () => {
    const table = { id: "orientation", headings: ["Standard orientation:"], heads: ["Center Atomic"], columns: ["centre", "atomic-number", "type", "x", "y", "z"] };
    expect((read(catalogue([entry({ quotedTables: [table] })])) as { catalogue: Catalogue }).catalogue.plugins[0].quotedTables).toEqual([table]);
    expect((read(catalogue([entry()])) as { catalogue: Catalogue }).catalogue.plugins[0].quotedTables).toEqual([]);
    for (const bad of [
      {},
      [{ ...table, id: "Orientation" }],
      [{ ...table, headings: [] }],
      [{ ...table, headings: [" Standard orientation:"] }],
      [{ ...table, heads: ["x".repeat(81)] }],
      [{ ...table, columns: ["x", "y", "z"] }],
      [{ ...table, columns: ["element", "atomic-number", "x", "y", "z"] }],
      [{ ...table, columns: ["element", "x", "x", "y", "z"] }],
      [{ ...table, columns: ["element", "x", "y", "z", "charge"] }],
      [{ ...table, pattern: ".*" }],
      [table, table],
      [1, 2, 3, 4, 5].map((k) => ({ ...table, id: `t${k}` })),
    ]) {
      expect(why(catalogue([entry(), entry({ id: "other", quotedTables: bad })])), JSON.stringify(bad).slice(0, 80)).toMatch(/^It holds other: a table of atoms/);
    }
  });

  it("takes a plugin's files only on https, from where the plugins' releases are - nowhere else", () => {
    const at = (url: string, sha256 = HEX, bytes: unknown = 10) => why(catalogue([entry({ source: { url, sha256, bytes } })]));
    expect(at("https://objects.githubusercontent.com/x/sketch.tar.gz")).toBeUndefined();
    expect(at("https://release-assets.githubusercontent.com/x/sketch.tar.gz")).toBeUndefined();
    // (letters made small, as the address reads them: the same host)
    expect(at("https://GITHUB.com/x.tar.gz")).toBeUndefined();
    // (a host only like one of them, or one of them with a dot at its end: none of them, and the whole list refused)
    for (const url of ["https://evilgithub.com/x.tar.gz", "https://github.com.evil.net/x.tar.gz", "https://objects.githubusercontent.com.evil.net/x.tar.gz", "https://github.com./x.tar.gz", "https://xgithub.com/x.tar.gz", "https://api.github.com/x.tar.gz"]) {
      expect(at(url), url).toMatch(/where its files are/);
    }
    for (const url of ["http://github.com/x.tar.gz", "https://example.org/x.tar.gz", "https://github.com:8443/x.tar.gz", "https://user:pw@github.com/x.tar.gz", "file:///tmp/x.tar.gz", "not a url"]) {
      expect(at(url)).toMatch(/where its files are/);
    }
    expect(at("https://github.com/x.tar.gz", "A".repeat(64))).toMatch(/fingerprint/);
    expect(at("https://github.com/x.tar.gz", HEX, 0)).toMatch(/size/);
    expect(at("https://github.com/x.tar.gz", HEX, 1.5)).toMatch(/size/);
  });

  it("reads only the form it knows, saying when it was issued - UTC, to the second, a real time - with its plugins, and no serial", () => {
    expect(why(catalogue([], { schema: 2 }))).toMatch(/newer Meno/);
    for (const issued of ["2026-11-10T00:00:00.5Z", "2026-11-10T00:00Z", "2026-11-10T00:00:00+00:00", "2026-11-10T00:00:00", "2026-11-10", "2026-02-29T00:00:00Z", "2026-11-31T00:00:00Z", "2026-11-10T24:00:00Z", "2026-11-10T00:60:00Z", "2026-11-10T00:00:60Z", "1900-02-29T00:00:00Z", "2026-11-00T00:00:00Z", "2026-00-10T00:00:00Z", "2026-04-31T00:00:00Z", "soon", 20261110, undefined]) {
      expect(why(catalogue([], { issued })), String(issued)).toBe("When it was issued, or its plugins, are not as Meno takes them");
    }
    expect(why(catalogue([], { plugins: {} }))).toBe("When it was issued, or its plugins, are not as Meno takes them");
    // (one that still carries a serial: refused, never read as the other)
    expect(why(catalogue([], { serial: 12 }))).toBe("It carries a serial, which this Meno does not read");
    expect(why(null)).toBe("It is not a catalogue");
    for (const issued of ["2028-02-29T23:59:59Z", "2000-02-29T00:00:00Z", "2026-12-31T00:00:00Z", "2026-04-30T00:00:00Z", "0001-01-01T00:00:00Z"]) {
      expect(read(catalogue([], { issued })), issued).toEqual({ catalogue: { schema: 1, issued, plugins: [] } });
    }
    expect(read(catalogue([]))).toEqual({ catalogue: { schema: 1, issued: "2026-11-10T00:00:00Z", plugins: [] } });
  });
});

describe("what Settings offers of each plugin online", () => {
  const listed = (read(catalogue([entry(), entry({ id: "lens", version: "1.0.0", systems: [] }), entry({ id: "winonly", systems: ["windows"] }), entry({ id: "future", contract: 2 })])) as { catalogue: Catalogue }).catalogue;

  it("adds one not here, updates one older here, and leaves one as new or newer here", () => {
    const offers = (here: [string, string][]) => offersOf(listed, new Map(here), "macos").map((o) => [o.entry.id, o.offer]);
    expect(offers([])).toEqual([["sketch", "add"], ["lens", "add"], ["winonly", "not-here"], ["future", "not-here"]]);
    expect(offers([["sketch", "0.1.9"], ["lens", "1.0.0"]])).toEqual([["sketch", "update"], ["lens", "here"], ["winonly", "not-here"], ["future", "not-here"]]);
    // (a newer one here than the list's - one made locally: never offered as an update back)
    expect(offers([["sketch", "0.10.0"]])[0]).toEqual(["sketch", "here"]);
  });

  it("says why one is not for here: another system, or a newer Meno", () => {
    const why = (here: [string, string][] = []) => offersOf(listed, new Map(here), "macos").flatMap((o) => (o.offer === "not-here" ? [o.why] : []));
    expect(why()).toEqual(["For Windows only", "It is for a newer Meno"]);
    expect(why([["future", "0.1.0"]])[1]).toBe("Its newer versions are for a newer Meno");
    // (a Meno that speaks its contract offers it; a system not known, every one)
    expect(offersOf(listed, new Map(), null, [1, 2]).map((o) => o.offer)).toEqual(["add", "add", "add", "add"]);
  });
});

describe("what is offered for a role no plugin here fills", () => {
  it("the plugins online that fill it, not here yet, for this system and this Meno", () => {
    const listed = (acceptCatalogue(catalogue([entry(), entry({ id: "other", roles: ["checks"] }), entry({ id: "winonly", systems: ["windows"] }), entry({ id: "future", contract: 2 })])) as { catalogue: Catalogue }).catalogue;
    const offers = offersOf(listed, new Map(), "macos");
    expect(offeredFor("smiles", offers).map((e) => e.id)).toEqual(["sketch"]);
    expect(offeredFor("checks", offers).map((e) => e.id)).toEqual(["other"]);
    expect(offeredFor("conformers", offers)).toEqual([]);
    // (one here already: nothing offered for it)
    expect(offeredFor("smiles", offersOf(listed, new Map([["sketch", "0.2.0"]]), "macos"))).toEqual([]);
  });

  it("reads what brings presets for another, and the plugins no longer offered - each as Meno takes it, or the catalogue is refused", () => {
    const ok = read(catalogue([entry(), entry({ id: "rdkit-presets", presetsFor: "rdkit" })], { retired: [{ id: "wfx", name: "WFX reader", why: "Meno reads these files itself now" }] })) as { catalogue: Catalogue };
    expect(ok.catalogue.plugins[1].presetsFor).toBe("rdkit");
    expect(ok.catalogue.retired).toEqual([{ id: "wfx", name: "WFX reader", why: "Meno reads these files itself now" }]);
    expect((read(catalogue([entry()])) as { catalogue: Catalogue }).catalogue.retired).toBeUndefined();
    for (const bad of ["", "Not An Id", 3]) expect(why(catalogue([entry({ presetsFor: bad })])), String(bad)).toContain("the plugin it brings presets for");
    expect(why(catalogue([entry({ presetsFor: entry().id })]))).toContain("the plugin it brings presets for");
    for (const bad of [{}, [{ id: "wfx", name: "WFX" }], [{ id: "wfx", name: "WFX", why: "w" }, { id: "wfx", name: "WFX", why: "w" }], [{ id: "Bad Id", name: "n", why: "w" }]])
      expect(why(catalogue([entry()], { retired: bad })), JSON.stringify(bad)).toBe("Its plugins no longer offered are not as Meno takes them");
    expect(why(catalogue([entry()], { retired: [{ id: entry().id, name: "n", why: "w" }] }))).toBe("It offers a plugin it says is no longer offered");
  });

  it("takes a retired plugin's name up to 60 letters and its why up to 160, as the list's builder writes them; and never one on offer, so that a plugin is said either not made for here or no longer offered, never both", () => {
    const retired = (name: string, why: string) => catalogue([entry()], { retired: [{ id: "wfx", name, why }] });
    expect("catalogue" in read(retired("n".repeat(60), "w".repeat(160)))).toBe(true);
    expect(why(retired("n".repeat(61), "w"))).toBe("Its plugins no longer offered are not as Meno takes them");
    expect(why(retired("n", "w".repeat(161)))).toBe("Its plugins no longer offered are not as Meno takes them");
    // (one made for another system and said retired too: the list is refused - its why would be two)
    expect(why(catalogue([entry({ systems: ["windows"] })], { retired: [{ id: entry().id, name: "n", why: "w" }] }))).toBe("It offers a plugin it says is no longer offered");
  });
});

