import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { identityInputOf, identityOfDrawn } from "./identityOf";
import { drawnFromSmiles, IDENTITY_CASES } from "./testdata/identityCases";

const ROOT = resolve(__dirname, "../../../../..");
const FIXTURE = resolve(__dirname, "testdata/identity.rdkit.json");

/**
 * The cases RDKit's canonical SMILES split that Meno's identity takes as one
 * structure, by design (lib/chem/identity `aromaticForm`): bond-shift
 * isomers, which RDKit's aromaticity does not join. Each by name.
 */
const APART_IN_RDKIT_BY_DESIGN = new Set([
  "1,2-dimethylcyclooctatetraene, across a double bond",
  "1,2-dimethylcyclooctatetraene, across a single bond",
]);

/** The cases, each with the molfile Meno writes of it as drawn. */
const written = IDENTITY_CASES.map((c) => {
  const drawn = drawnFromSmiles(c.smiles);
  return { ...c, drawn, molfile: writeMolfile(drawn) };
});

/** The names, grouped by what `of` gives each - in the cases' order, each group's first first. */
function groups(of: (name: string) => string): string[][] {
  const by = new Map<string, string[]>();
  for (const c of written) by.set(of(c.name), [...(by.get(of(c.name)) ?? []), c.name]);
  return [...by.values()];
}

describe("a structure drawn, as identity reads it", () => {
  it("is every atom drawn - its mass number and mapping with it - no H folded in yet, and the configurations the drawing shows", () => {
    const { input, unread } = identityInputOf({ ...drawnFromSmiles("F[C@@]([H])(Cl)Br") });
    expect(input.atoms.map((a) => a.el)).toEqual(["F", "C", "H", "Cl", "Br"]);
    expect(input.atoms[1].tetra?.neighbours).toHaveLength(4);
    expect(unread).toEqual([]);
    const d = drawnFromSmiles("[2H]C");
    expect(identityInputOf({ ...d, atoms: d.atoms.map((a) => (a.el === "C" ? { ...a, map: 3 } : a)) }).input.atoms).toEqual([
      { el: "H", isotope: 2, hs: 0 },
      { el: "C", mapped: true, hs: 3 },
    ]);
  });

  it("says which atoms' wedges it could not read: wedge and hashes drawn opposite each other", () => {
    // (a carbon with four groups, a wedge and a hash in line: no configuration can be read)
    const crossed = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "F", x: 1.5, y: 0, r: 0.9 },
        { id: 3, el: "Cl", x: -1.5, y: 0, r: 0.9 },
        { id: 4, el: "Br", x: 0, y: 1.5, r: 0.9 },
        { id: 5, el: "I", x: 0, y: -1.5, r: 0.9 },
      ],
      bonds: [
        { id: 6, a: 1, b: 2, order: 1 as const, stereo: "up" as const },
        { id: 7, a: 1, b: 3, order: 1 as const, stereo: "down" as const },
        { id: 8, a: 1, b: 4, order: 1 as const, stereo: "up" as const },
        { id: 9, a: 1, b: 5, order: 1 as const, stereo: "down" as const },
      ],
    };
    expect(identityOfDrawn(crossed).unread).toEqual([1]);
  });

  it("splits the structures into the groups each was drawn to be in", () => {
    const meno = new Map(written.map((c) => [c.name, identityOfDrawn(c.drawn).text]));
    const same = new Map(written.map((c) => [c.name, c.same]));
    expect(groups((n) => meno.get(n)!)).toEqual(groups((n) => same.get(n)!));
  });
});

describe("a structure's identity, against RDKit's canonical SMILES (the fixture)", () => {
  if (process.env.MENO_IDENTITY_MOLFILES) {
    it("writes the molfiles for RDKit to read (the fixture's first step)", () => {
      mkdirSync(resolve(ROOT, ".identity"), { recursive: true });
      writeFileSync(resolve(ROOT, ".identity/molfiles.json"), JSON.stringify(written.map((c) => ({ name: c.name, molfile: c.molfile })), null, 1));
    });
  }

  const fixture = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as { reader: string; command: string[]; cases: { name: string; molfile: string; smiles: string }[] }) : null;

  it("is of the molfiles Meno writes now (each by its SHA-256), every case in it, read by a named RDKit", () => {
    expect(fixture).not.toBeNull();
    expect(fixture!.reader).toMatch(/^RDKit \d{4}\.\d{2}\.\d+$/);
    const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
    expect(fixture!.cases.map((c) => [c.name, c.molfile])).toEqual(written.map((c) => [c.name, sha(c.molfile)]));
  });

  it("splits them into the groups RDKit's SMILES do - but for the cases listed by name, which Meno joins by its own rule", () => {
    const rdkit = new Map(fixture!.cases.map((c) => [c.name, c.smiles]));
    const meno = new Map(written.map((c) => [c.name, identityOfDrawn(c.drawn).text]));
    // (the cases that differ by design: RDKit has them apart, Meno one structure)
    const apart = written.filter((c) => APART_IN_RDKIT_BY_DESIGN.has(c.name));
    expect(new Set(apart.map((c) => rdkit.get(c.name))).size).toBe(apart.length);
    expect(new Set(apart.map((c) => meno.get(c.name))).size).toBe(1);
    // (every other: the same groups)
    const others = (n: string) => (APART_IN_RDKIT_BY_DESIGN.has(n) ? `by design: ${n}` : "");
    expect(groups((n) => others(n) || `m:${meno.get(n)}`)).toEqual(groups((n) => others(n) || `r:${rdkit.get(n)}`));
  });
});
