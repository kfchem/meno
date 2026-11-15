import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { factor } from "../../../../lib/units";
import { setEntries } from "./entries";
import { runMeno } from "./meno";

/**
 * Ammonia's two stationary points: its pyramid, a minimum, and the planar
 * structure it inverts through - a transition state, one imaginary
 * frequency along the umbrella motion - about 5.8 kcal/mol above it (its
 * inversion barrier, 2020 cm-1). A frequency calculation marks the planar
 * one with its imaginary frequency; it is no conformer, and has no
 * population of its own, whatever window or temperature is asked.
 */
const KCAL = factor("kcal/mol", "Eh");
function ammonia(): Molecule3D {
  // (N at the origin, N-H 1.01 Å; the pyramid's hydrogens 0.38 Å below the plane, the planar one's in it)
  const h = (z: number) => [0, 1, 2].flatMap((k) => [Math.cos((2 * Math.PI * k) / 3), Math.sin((2 * Math.PI * k) / 3), z].map((v, i) => (i < 2 ? v * Math.sqrt(1.01 ** 2 - z ** 2) : v)));
  const pyramid = [0, 0, 0, ...h(-0.38)];
  const planar = [0, 0, 0, ...h(0)];
  return {
    id: 1,
    at: { x: 0, y: 0 },
    atoms: ["N", "H", "H", "H"].map((el, i) => ({ el, x: pyramid[3 * i], y: pyramid[3 * i + 1], z: pyramid[3 * i + 2] })),
    bonds: [1, 2, 3].map((i) => ({ a1: 0, a2: i, order: 1 })),
    frames: [planar],
    energies: [-56.5, -56.5 + 5.8 * KCAL],
    imaginary: [null, [-1020.4]],
    conformerSet: true,
  };
}
const SAID = "a #2 has 1 imaginary frequency, 1020.4i cm⁻¹: it is no minimum - take it out first";

describe("a saddle point among conformers", () => {
  it("is refused by Energy window on electronic energies, whether the window would keep it or set it aside: it is no conformer to keep or set aside", () => {
    const entries = setEntries([ammonia()], "conformers");
    // (10 kcal/mol would have kept it, 3 set it aside: neither is asked of a transition state)
    expect(runMeno("energy-window", entries, "conformers", { window: 10 })).toEqual({ ok: false, said: SAID });
    expect(runMeno("energy-window", entries, "conformers", { window: 3 })).toEqual({ ok: false, said: SAID });
  });

  it("is refused by Populations: a Boltzmann share for a transition state would be a population of nothing", () => {
    expect(runMeno("populations", setEntries([ammonia()], "conformers"), "conformers", { temperature: 298.15 })).toEqual({ ok: false, said: SAID });
  });

  it("taken out, leaves the pyramid alone - its window and its share as a minimum's", () => {
    const m = ammonia();
    const [pyramid] = setEntries([{ ...m, frames: undefined, energies: [m.energies![0]], imaginary: undefined }], "conformers");
    expect(runMeno("energy-window", [pyramid], "conformers", { window: 3 })).toMatchObject({ ok: true, kept: [pyramid], aside: [] });
    expect(runMeno("populations", [pyramid], "conformers", { temperature: 298.15 })).toMatchObject({ ok: true, shares: [1] });
  });
});
