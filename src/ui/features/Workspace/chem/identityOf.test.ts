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

  it("says a secondary phosphine's P drawn with two bonds and its H carried is unread, its wedge stating no configuration - and reads it with its H drawn", () => {
    const phosphine = (h: boolean) => ({
      atoms: [
        { id: 1, el: "P", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "C", x: 1.3, y: 0.75, r: 0.9 },
        { id: 3, el: "C", x: -1.3, y: 0.75, r: 0.9 },
        ...(h ? [{ id: 4, el: "H", x: 0, y: -1.5, r: 0.9 }] : []),
      ],
      bonds: [
        { id: 6, a: 1, b: 2, order: 1 as const, stereo: "up" as const },
        { id: 7, a: 1, b: 3, order: 1 as const },
        ...(h ? [{ id: 8, a: 1, b: 4, order: 1 as const }] : []),
      ],
    });
    expect(identityOfDrawn(phosphine(false)).unread).toEqual([1]);
    expect(identityOfDrawn(phosphine(true)).unread).toEqual([]);
  });

  it("ignores a double bond drawn bent where one end's two other groups are alike, and keeps one where they are not", () => {
    // (HO-CH2-CH=C(CH3)R, its C=C across: the CH2 drawn up or down off it, in line with it, or by a wave; R a methyl - prenol - or none)
    const drawn = (ch2: "up" | "down" | "straight" | "wavy", second = true) => {
      const [x, y] = ch2 === "down" ? [-0.75, -1.3] : ch2 === "straight" ? [-1.5, 0] : [-0.75, 1.3];
      return {
        atoms: [
          { id: 1, el: "O", x: x - 1.5, y, r: 0.9 },
          { id: 2, el: "C", x, y, r: 0.9 },
          { id: 3, el: "C", x: 0, y: 0, r: 0.9 },
          { id: 4, el: "C", x: 1.5, y: 0, r: 0.9 },
          { id: 5, el: "C", x: 2.25, y: 1.3, r: 0.9 },
          ...(second ? [{ id: 6, el: "C", x: 2.25, y: -1.3, r: 0.9 }] : []),
        ],
        bonds: [
          { id: 7, a: 1, b: 2, order: 1 as const },
          { id: 8, a: 2, b: 3, order: 1 as const, ...(ch2 === "wavy" ? { stereo: "wavy" as const } : {}) },
          { id: 9, a: 3, b: 4, order: 2 as const },
          { id: 10, a: 4, b: 5, order: 1 as const },
          ...(second ? [{ id: 11, a: 4, b: 6, order: 1 as const }] : []),
        ],
      };
    };
    const prenol = identityOfDrawn(drawn("straight")).text;
    for (const ch2 of ["up", "down", "wavy"] as const) expect(identityOfDrawn(drawn(ch2)).text, ch2).toBe(prenol);
    // (but-2-en-1-ol: E and Z, and neither, apart)
    const crotyl = (ch2: "up" | "down" | "straight") => identityOfDrawn(drawn(ch2, false)).text;
    expect(new Set([crotyl("up"), crotyl("down"), crotyl("straight")]).size).toBe(3);
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
