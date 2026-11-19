/** A Repeat's passes as far as they are its own (workflow/repeatRun): what each entry of a pass carries, and when the passes end. */
import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { repeatRead, type RepeatRead } from "./repeat";
import { CAME_IN, lastPass, PASS, passEntries, RAN_OUT, ranOut, startsFrom, TIMES_ROUND } from "./repeatRun";

const read = (v: Record<string, string | number>): RepeatRead => {
  const r = repeatRead(v);
  if ("why" in r) throw new Error(r.why);
  return r;
};
const K = read({ variable: "k", from: "50", step: "50", unit: "kcal/mol/rad2" });
type M = { name: string; properties?: Record<string, Property>[] };
const value = (m: M, name: string) => m.properties?.[0]?.[name]?.value;

describe("each entry of a pass", () => {
  it("carries its pass, its count of times round and its variable's value: counted per entry, From in its first pass", () => {
    const { go, spent } = passEntries<M>([{ name: "a" }, { name: "b", properties: [{ id: { value: "start-1", unit: "none", status: "computed", label: true } }] }], K, 1);
    expect(spent).toEqual([]);
    expect(go.map((m) => [value(m, PASS), value(m, TIMES_ROUND), value(m, "k")])).toEqual([
      [1, 0, 50],
      [1, 0, 50],
    ]);
    // (what it carried before, kept)
    expect(value(go[1], "id")).toBe("start-1");
    expect(go[0].properties![0].k.unit).toBe("kcal/mol/rad2");
  });

  it("counted per entry: one going round twice has From + 2 Steps, one going round once From + Step, whatever the pass", () => {
    const first = passEntries<M>([{ name: "a" }], K, 1).go;
    const second = passEntries<M>(first, K, 2).go;
    const third = passEntries<M>(second, K, 3).go;
    expect([value(second[0], "k"), value(third[0], "k")]).toEqual([100, 150]);
    // (a newcomer in pass 3 - one that came round by another way - starts at From)
    expect(value(passEntries<M>([{ name: "new" }], K, 3).go[0], "k")).toBe(50);
  });

  it("counted per pass: every entry of pass p has From + (p - 1) Steps", () => {
    const P = read({ variable: "k", from: "50", step: "50", counted: "pass" });
    expect(passEntries<M>([{ name: "new" }], P, 3).go.map((m) => value(m, "k"))).toEqual([150]);
  });

  it("over values, counted per entry: one gone round past the last value is spent, not sent again", () => {
    const O = read({ repeat: "over", variable: "T", values: "300\n310" });
    const one = passEntries<M>([{ name: "a" }], O, 1).go;
    const two = passEntries<M>(one, O, 2).go;
    expect(two.map((m) => value(m, "T"))).toEqual([310]);
    expect(passEntries<M>(two, O, 3)).toEqual({ go: [], spent: two });
  });

  it("with no variable carries its pass, its count and which of In's it is, alone", () => {
    const { go } = passEntries<M>([{ name: "a" }], read({}), 2);
    expect(Object.keys(go[0].properties![0]).sort()).toEqual([PASS, CAME_IN, TIMES_ROUND].sort());
  });

  it("left going round when the passes run out is marked so as it leaves by Out", () => {
    expect(value(ranOut<M>({ name: "a" }), RAN_OUT)).toBe("yes");
  });
});

describe("the last pass", () => {
  it("is the last of as many as it makes; until none goes again, the first with nothing on Again, or its cap", () => {
    expect([lastPass(read({ times: 3 }), 2, 5), lastPass(read({ times: 3 }), 3, 5)]).toEqual([false, true]);
    const U = read({ repeat: "until", most: 4 });
    expect([lastPass(U, 1, 2), lastPass(U, 2, 0), lastPass(U, 4, 3)]).toEqual([false, true, true]);
  });
});

describe("where the next pass starts", () => {
  type G = { atoms: { el: string; x: number; y: number; z: number }[]; frames?: number[][]; energies?: number[]; properties?: Record<string, Property>[] };
  const atom = (x: number) => ({ el: "C", x, y: 0, z: 0 });
  const cameIn: G[] = [{ atoms: [atom(0), atom(1)] }, { atoms: [atom(10), atom(11)] }];
  const landed: G = {
    atoms: [atom(5), atom(6)],
    frames: [[5, 0, 0, 6, 0, 0]],
    energies: [-1],
    properties: [{ [CAME_IN]: { value: 1, unit: "none", status: "computed", label: true }, restraints: { value: { restraints: [], start: [2, 0, 0, 3, 0, 0] }, unit: "none", status: "computed" } }],
  };
  const xs = (m: G) => m.atoms.map((a) => a.x);

  it("from the last pass: as it landed", () => {
    expect(startsFrom([landed], "last", cameIn)[0]).toBe(landed);
  });
  it("from where restraints were first held: their start, one geometry, nothing worked out kept; as it landed where it has none", () => {
    const s = startsFrom([landed], "held", cameIn)[0];
    expect([xs(s), s.frames, s.energies]).toEqual([[2, 3], undefined, undefined]);
    expect(s.properties).toBe(landed.properties);
    const none = { ...landed, properties: [{}] };
    expect(startsFrom([none], "held", cameIn)[0]).toBe(none);
  });
  it("from what came in: the molecule it was in In, by its place there, carrying what it carries now", () => {
    const s = startsFrom([landed], "in", cameIn)[0];
    expect(xs(s)).toEqual([10, 11]);
    expect(s.properties).toBe(landed.properties);
  });
  it("each entry of a first pass is told which of In's it is", () => {
    const { go } = passEntries<M>([{ name: "a" }, { name: "b" }], read({}), 1);
    expect(go.map((m) => value(m, CAME_IN))).toEqual([0, 1]);
    expect(passEntries<M>(go, read({}), 2).go.map((m) => value(m, CAME_IN))).toEqual([0, 1]);
  });
});

