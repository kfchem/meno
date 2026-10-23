/**
 * Enumerate's products - by R groups and by substituents - against RDKit (the fixture, testdata/enumerate.rdkit.json):
 * each product Meno makes, written as Meno writes a molfile, is the compound
 * written by hand for its combination (testdata/enumerationCases.ts), as
 * RDKit reads both; and the products Meno sets aside as *Same as n* are
 * those RDKit's canonical SMILES join, and only those. The fixture is made
 * as the identity's is (scripts/identity/rdkit.py).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { enumerated } from "./enumerate";
import { substituted } from "./substituents";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { ENUMERATION_CASES, SUBSTITUENT_CASES, SUBSTITUENT_DIFFERENTIAL, template } from "./testdata/enumerationCases";
import { undrawnHydrogens } from "../chem/drawing";

const ROOT = resolve(__dirname, "../../../../..");
const FIXTURE = resolve(__dirname, "testdata/enumerate.rdkit.json");

/** Every product of every case, made or set aside, in its number's order: named by its case and number, with why it was set aside, and the molfile Meno writes of it. */
const products = [
  ...ENUMERATION_CASES.map((c) => ({ c, made: () => enumerated(template(c.template), c.lists) })),
  ...SUBSTITUENT_CASES.map((c) => ({ c, made: () => substituted(drawnFromSmiles(c.template), c.positions, c.groups, c.combine) })),
  ...SUBSTITUENT_DIFFERENTIAL.templates.map((t) => {
    const drawn = drawnFromSmiles(t);
    const hs = undrawnHydrogens(drawn);
    const positions = drawn.atoms.filter((a) => a.el !== "H" && (hs.get(a.id) ?? 0) > 0).map((a) => a.id);
    const groups = SUBSTITUENT_DIFFERENTIAL.groups;
    // (one at a time: each position's groups in turn - its number says which, and RDKit makes its compound)
    const transforms = positions.flatMap((id) => groups.map((g) => ({ t, k: id - 1, group: g.smiles })));
    return { c: { name: `differential: ${t}`, products: transforms.map(() => ""), transforms }, made: () => substituted(drawn, positions, groups.map((g) => g.typed).join("\n"), "one") };
  }),
].flatMap(({ c, made }) => {
  const r = made();
  if (!r.ok) throw new Error(`${c.name}: ${r.problems.join("; ")}`);
  return [...r.made.map((m) => ({ ...m, why: undefined as string | undefined })), ...r.aside]
    .sort((p, q) => p.number - q.number)
    .map((m) => {
      const transform = "transforms" in c ? c.transforms[m.number - 1] : undefined;
      return { case: c.name, name: `${c.name} #${m.number}`, number: m.number, why: m.why, ...(transform ? { transform } : { expected: c.products[m.number - 1] }), molfile: writeMolfile(m.drawn) };
    });
});

describe("Enumerate's products, against RDKit (the fixture)", () => {
  if (process.env.MENO_IDENTITY_MOLFILES) {
    it("writes the molfiles for RDKit to read (the fixture's first step)", () => {
      mkdirSync(resolve(ROOT, ".identity"), { recursive: true });
      writeFileSync(resolve(ROOT, ".identity/products.json"), JSON.stringify(products.map((p) => ({ name: p.name, molfile: p.molfile, ..."transform" in p ? { transform: p.transform } : { expected: p.expected } })), null, 1));
    });
  }

  const fixture = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as { reader: string; command: string[]; products: { name: string; molfile: string; smiles: string; expected: string }[] }) : null;
  const rdkit = new Map(fixture?.products.map((p) => [p.name, p]) ?? []);

  it("are one for each combination of each case, written by hand", () => {
    for (const c of [...ENUMERATION_CASES, ...SUBSTITUENT_CASES]) expect(products.filter((p) => p.case === c.name).map((p) => p.number)).toEqual(c.products.map((_, k) => k + 1));
  });

  it("is of the molfiles Meno writes now (each by its SHA-256), every product in it, read by a named RDKit", () => {
    expect(fixture).not.toBeNull();
    expect(fixture!.reader).toMatch(/^RDKit \d{4}\.\d{2}\.\d+$/);
    const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
    expect(fixture!.products.map((p) => [p.name, p.molfile])).toEqual(products.map((p) => [p.name, sha(p.molfile)]));
  });

  it("are each the compound written for its combination, as RDKit reads both - its configurations as drawn", () => {
    expect(rdkit.size).toBe(products.length);
    expect(products.map((p) => [p.name, rdkit.get(p.name)?.smiles])).toEqual(products.map((p) => [p.name, rdkit.get(p.name)?.expected]));
  });

  it("are set aside as the same as an earlier one exactly where RDKit's SMILES are that one's", () => {
    for (const p of products) {
      const same = products.filter((q) => q.case === p.case && q.number < p.number && rdkit.get(q.name)!.smiles === rdkit.get(p.name)!.smiles);
      expect([p.name, p.why]).toEqual([p.name, same.length ? `Same as ${same[0].number}` : undefined]);
    }
  });
});
