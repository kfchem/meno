import { describe, expect, it } from "vitest";
import type { CalcInfo } from "../../../../lib/calc/output";
import type { SetEntry } from "./entries";
import { kindInfo, optionsOf } from "./kinds";
import { runMeno } from "./meno";

/** O-H-O, the hydrogen between the oxygens: its imaginary vibration moves the hydrogen along x (0.9) against the oxygens (-0.3 each); a bend, real. */
const calc = (frequencies: number[]): CalcInfo => ({
  readers: ["test 1"],
  results: [
    {
      id: "vibrations",
      on: "list",
      group: "Vibrations",
      label: "Vibrations",
      columns: [{ label: "Frequency", quantity: "wavenumber" }],
      rows: [
        { cells: [frequencies[0]], move: [-0.3, 0, 0, 0.9, 0, 0, -0.3, 0, 0] },
        { cells: [frequencies[1]], move: [0, 0.1, 0, 0, -0.2, 0, 0, 0.1, 0] },
      ],
    },
  ],
});
const ts = (frequencies: number[], extra: Partial<SetEntry> = {}): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [
      { el: "O", x: -1.2, y: 0, z: 0 },
      { el: "H", x: 0, y: 0, z: 0 },
      { el: "O", x: 1.2, y: 0, z: 0 },
    ],
    bonds: [],
    xyz: [-1.2, 0, 0, 0, 0, 0, 1.2, 0, 0],
    energy: -151.2,
    calc: calc(frequencies),
    ...extra,
  }) as unknown as SetEntry;

const ok = (o: ReturnType<typeof runMeno>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};

describe("Displace, as a step", () => {
  it("moves each geometry along its imaginary vibration, the atom moving most by the amplitude; its energy, of the old geometry, not its own", () => {
    const o = ok(runMeno("displace", [ts([-1450, 300])], "molecules", { amplitude: "0.1" }));
    expect(o.kept).toHaveLength(1);
    expect(o.kept[0].xyz[3]).toBeCloseTo(0.1, 12);
    expect(o.kept[0].xyz[0]).toBeCloseTo(-1.2 - 0.1 / 3, 12);
    expect(o.kept[0].energy).toBeUndefined();
    expect(o.kept[0].calc).toBeUndefined();
    expect(o.said).toBe("1 entry displaced");
  });

  it("moves along a vibration chosen by number, from 1 on the card - the other way for a negative amplitude", () => {
    const o = ok(runMeno("displace", [ts([-1450, 300])], "molecules", { vibration: "number", number: "2", amplitude: "-0.2" }));
    expect(o.kept[0].xyz[4]).toBeCloseTo(0.2, 12);
  });

  it("sets aside one with no imaginary vibration, or none at all, saying why", () => {
    const o = ok(runMeno("displace", [ts([1450, 300]), ts([-1450, 300], { calc: undefined, number: 2 } as Partial<SetEntry>)], "molecules", { amplitude: "0.1" }));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => e.properties?.set_aside?.value)).toEqual(["It has no imaginary vibration.", "The entry has no vibrations."]);
    expect(o.said).toBe("0 entries displaced · 2 not displaced");
  });

  it("will not run without an amplitude, or with a vibration's number that does not read; says what it does on its card, defaults unsaid", () => {
    const info = kindInfo("displace");
    const needs = (v: Record<string, string>) => info.needs!(optionsOf(info.options ?? [], v));
    const how = (v: Record<string, string>) => info.how!(optionsOf(info.options ?? [], v));
    expect(needs({})).toBe("Give the amplitude");
    expect(needs({ amplitude: "0" })).toBe('"0" is no amplitude in Å');
    expect(needs({ amplitude: "0.1", vibration: "number", number: "0" })).toBe('"0" is no vibration\'s number, from 1');
    expect(needs({ amplitude: "0.1" })).toBeUndefined();
    expect(how({ amplitude: "0.1" })).toBe("0.1 Å");
    expect(how({ amplitude: "-0.1", vibration: "number", number: "7" })).toBe("-0.1 Å along vibration 7");
    expect(runMeno("displace", [ts([-1450, 300])], "molecules", {})).toEqual({ ok: false, said: "Give the amplitude" });
  });
});
