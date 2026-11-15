import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import { Sameness } from "../workflow/sameConformer";
import { asThePageShows } from "./pageConformers";

/** The RDKit plugin's own answers to `conformers`, as the page asks for them: every conformer it made, in its order (scripts/conformers/made_by_rdkit.py). */
const MADE = JSON.parse(readFileSync(resolve(__dirname, "testdata/conformers.rdkit.json"), "utf8")) as {
  conformers: (Pick<Conformers, "atoms" | "bonds" | "frames" | "energies" | "modelEnergies" | "field" | "method" | "how"> & { name: string })[];
};
const made = (name: string): Conformers => {
  const { name: _, ...c } = MADE.conformers.find((x) => x.name === name)!;
  return { ...c, cip: { atoms: {}, bonds: {} }, chosen: { atoms: {}, bonds: {} }, smiles: "" };
};
const rows = (c: Conformers) => Object.fromEntries((c.how ?? []).map((r) => [r.label, r.text]));

describe("a structure's conformers, as the page shows them", () => {
  it("keeps each once, lowest first - none the same as another kept, each it set aside the same as one kept", () => {
    for (const name of ["butan-2-ol", "methylcyclohexane"]) {
      const given = made(name);
      const shown = asThePageShows(given);
      expect(shown.frames.length).toBeLessThan(given.frames.length);
      expect(shown.energies).toEqual([...shown.energies!].sort((a, b) => a - b));
      expect(shown.energies![0]).toBe(Math.min(...given.energies!));
      const same = new Sameness(given.atoms, given.bonds, given.frames[0]);
      shown.frames.forEach((f, i) => shown.frames.slice(i + 1).forEach((g) => expect(same.same(f, g)).toBe(false)));
      // (each one given the same as one kept - turned, moved, its alike atoms in other places, but the same)
      for (const f of given.frames) expect(shown.frames.some((g) => same.same(f, g))).toBe(true);
      const aside = given.frames.length - shown.frames.length;
      expect(rows(shown)).toMatchObject({ "The same": `${aside} set aside, each the same as one kept`, "The same within": "0.01 Å, all atoms (H included), over its symmetries" });
      // (the search's own rows as they were, before them)
      expect(shown.how!.slice(0, given.how!.length)).toEqual(given.how);
    }
    // (none set aside: no row saying so - only what the same is, after the search's own, its Kept among them)
    const one = made("butan-2-ol");
    const alone = asThePageShows({ ...one, frames: one.frames.slice(0, 1), energies: one.energies!.slice(0, 1) });
    expect(alone.how!.map((r) => r.label)).toEqual([...one.how!.map((r) => r.label), "The same within"]);
  });

  it("lays each over the first by its heavy atoms, and keeps every CH2's hydrogens on the side they have in the first", () => {
    for (const name of ["butan-2-ol", "methylcyclohexane"]) {
      const shown = asThePageShows(made(name));
      const { atoms, bonds, frames } = shown;
      expect(frames.length).toBeGreaterThan(1);
      const heavy = atoms.flatMap((a, i) => (a.el === "H" ? [] : [i]));
      const centre = (f: number[]) => [0, 1, 2].map((d) => heavy.reduce((s, i) => s + f[3 * i + d], 0) / heavy.length);
      for (const f of frames) centre(f).forEach((v, d) => expect(v).toBeCloseTo(centre(frames[0])[d], 3));
      const near = (i: number) => bonds.flatMap((b) => (b.a1 === i ? [b.a2] : b.a2 === i ? [b.a1] : []));
      const at = (f: number[], i: number) => [0, 1, 2].map((d) => f[3 * i + d]);
      const side = (f: number[], c: number, [x, y]: number[], h: number) => {
        const [p, u, v, w] = [at(f, c), at(f, x), at(f, y), at(f, h)];
        const [a, b, e] = [u, v, w].map((q) => q.map((t, d) => t - p[d]));
        return Math.sign(a[0] * (b[1] * e[2] - b[2] * e[1]) - a[1] * (b[0] * e[2] - b[2] * e[0]) + a[2] * (b[0] * e[1] - b[1] * e[0]));
      };
      let ch2 = 0;
      atoms.forEach((a, c) => {
        const hs = near(c).filter((i) => atoms[i].el === "H");
        const rest = near(c).filter((i) => atoms[i].el !== "H");
        if (a.el !== "C" || hs.length !== 2 || rest.length !== 2) return;
        ch2++;
        const first = hs.map((h) => side(frames[0], c, rest, h));
        for (const f of frames.slice(1)) expect(hs.map((h) => side(f, c, rest, h))).toEqual(first);
      });
      expect(ch2).toBeGreaterThan(0);
    }
  });

  it("orders by the model's energies where the molecule's are not given, and says so: hexachloroosmate's one octahedron", () => {
    const given = made("hexachloroosmate");
    expect(given.energies).toBeUndefined();
    expect(given.frames).toHaveLength(9);
    const shown = asThePageShows(given);
    // (the nine are the octahedron, its chlorides relabelled: one)
    expect(shown.frames).toHaveLength(1);
    expect(shown.energies).toBeUndefined();
    expect(shown.modelEnergies).toBeUndefined();
    expect(shown.method).toBe(`${given.method}; ordered by the model's energies`);
    expect(rows(shown)["The same"]).toBe("8 set aside, each the same as one kept");
  });

  it("keeps the order they came in where none has an energy, and gives every place to a ten-thousandth of an ångström", () => {
    const given = made("butan-2-ol");
    const { energies: _, ...plain } = given;
    const shown = asThePageShows(plain);
    expect(shown.energies).toBeUndefined();
    expect(shown.frames[0]).toEqual(given.frames[0]);
    for (const f of shown.frames) for (const v of f) expect(Math.round(v * 1e4) / 1e4).toBe(v);
  });
});
