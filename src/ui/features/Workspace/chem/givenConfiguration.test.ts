import { describe, expect, it } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import { identity } from "../../../../lib/chem/identity";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import type { ConfiguredCentre, Configuration } from "../../../../lib/chem/stereoOpen";
import type { Model } from "../store/types";
import { cipMarksOf } from "./cipMarks";
import { laidOut, notShownOf, openAsCame } from "./cleanUp";
import { identityOfDrawn } from "./identityOf";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { asCameSaid } from "./fromSmiles";
import { cisTransOfGiven } from "./givenConfiguration";
import { centreFrom, configurationOf, plainPicture, polygon } from "./testdata/givenPictures";
import { measured } from "../../../../testing/timeouts";

/**
 * A structure laid out from the configuration its source gives beside its drawing (backlog 106 B; chem/givenConfiguration): the plugin's
 * picture is only places, and Meno's engine draws the configuration given - each centre and double bond as given, by the block's atom and
 * bond numbers - not what the picture's wedges say.
 */



/** R or S at the atom at `index`, read by Meno's own CIP on what was laid out. */
async function labelOf(smiles: string, configuration: Configuration, index: number): Promise<string | undefined> {
  const laid = await laidOut(plainPicture(smiles), MENO, { axes: [], cumulated: [], configuration });
  const id = laid.atoms[index].id;
  const asked: Model = { ...laid, atoms: laid.atoms.map((a) => (a.id === id ? { ...a, stereoShown: true as const } : a)) };
  return cipMarksOf(asked).centres.get(id);
}

describe("a centre given beside the plugin's drawing: its sense, by hand", () => {
  // (R: the H away, Br, Cl, F clockwise as seen - priorities Br > Cl > F > H. FC(Cl)Br: F 0, C 1, Cl 2, Br 3)
  const br = { at: 3, deg: 90 };
  const cl = { at: 2, deg: -30 };
  const f = { at: 0, deg: 210 };
  const mirror = (c: ConfiguredCentre): ConfiguredCentre => ({ ...c, sense: (-c.sense) as 1 | -1 });

  it("lays (R)-bromochlorofluoromethane out as R, its mirror as S - whatever order the neighbours are named in", async () => {
    for (const order of [[f, cl, br], [br, f, cl], [cl, br, f], [br, cl, f]]) {
      const centre = centreFrom(1, order);
      expect(await labelOf("FC(Cl)Br", { centres: [centre], doubles: [] }, 1), order.map((n) => n.at).join()).toBe("R");
      expect(await labelOf("FC(Cl)Br", { centres: [mirror(centre)], doubles: [] }, 1), order.map((n) => n.at).join()).toBe("S");
    }
  });

  it("lays L-alanine out as S, from either way of writing it", async () => {
    // (S: the H away, N, COOH, CH3 counterclockwise as seen. C[C@H](N)C(=O)O: CH3 0, Ca 1, N 2, C 3; N[C@@H](C)C(=O)O: N 0, Ca 1, CH3 2, C 3)
    expect(await labelOf("CC(N)C(=O)O", { centres: [centreFrom(1, [{ at: 0, deg: 330 }, { at: 2, deg: 90 }, { at: 3, deg: 210 }])], doubles: [] }, 1)).toBe("S");
    expect(await labelOf("NC(C)C(=O)O", { centres: [centreFrom(1, [{ at: 0, deg: 90 }, { at: 2, deg: 330 }, { at: 3, deg: 210 }])], doubles: [] }, 1)).toBe("S");
  });

  it("lays a sulfoxide's S out as given - its fourth place a lone pair, not an H - and its mirror as the other", async () => {
    // (CS(=O)c1ccccc1: C 0, S 1, O 2, the ring's C 3; three named, the lone pair away)
    const s = centreFrom(1, [{ at: 2, deg: 90 }, { at: 0, deg: 210 }, { at: 3, deg: 330 }]);
    const one = await labelOf("CS(=O)c1ccccc1", { centres: [s], doubles: [] }, 1);
    const other = await labelOf("CS(=O)c1ccccc1", { centres: [{ ...s, sense: (-s.sense) as 1 | -1 }], doubles: [] }, 1);
    expect(new Set([one, other])).toEqual(new Set(["R", "S"]));
  });

  it("lays L-proline out as S, its centre in a ring", async () => {
    // (OC(=O)C1CCCN1: O 0, C 1, O 2, Ca 3, C 4, C 5, C 6, N 7; S: N, COOH, C4 counterclockwise as seen, the H away)
    for (const order of [[{ at: 1, deg: 210 }, { at: 4, deg: 330 }, { at: 7, deg: 90 }], [{ at: 7, deg: 90 }, { at: 1, deg: 210 }, { at: 4, deg: 330 }]]) {
      expect(await labelOf("OC(=O)C1CCCN1", { centres: [centreFrom(3, order)], doubles: [] }, 3)).toBe("S");
    }
  });
});



describe("a macrocycle given beside the plugin's polygon", () => {
  const lactone36 = "C[C@@H]1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC(=O)O1";
  const diol36 = "O[C@@H]1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC[C@H]1O";

  it("is laid out by Meno, not as a polygon, and states every centre given: the ring-36 lactone and trans-diol are their SMILES", async () => {
    for (const smi of [lactone36, diol36]) {
      const laid = await laidOut(polygon(smi), MENO, { axes: [], cumulated: [], configuration: configurationOf(smi) });
      expect(identityOfDrawn(laid).text, smi).toBe(identity(smilesInput(smi)).text);
    }
    // (a ring-36 macrolide laid out: it ran close to or past Vitest's own 5 s on a busy Windows runner)
  }, measured(1_800));

  it("takes a centre given beside the drawing, though the polygon's wedge at it - its ring bonds in line - says nothing: no 'unread wedge'", async () => {
    // (a ring of 40: its ring bonds at an atom 171 degrees apart, in line - a ring of 36 stands on the 170 degrees of the line itself)
    const lactone40 = "C[C@@H]1" + "C".repeat(37) + "C(=O)O1";
    const came = polygon(lactone40);
    // (the plugin's wedge on the methyl at C1, between two ring bonds near in line: a wedge Clean-up refuses to keep on its own)
    const m: Model = { ...came, bonds: came.bonds.map((b) => (b.a === came.atoms[0].id && b.b === came.atoms[1].id ? { ...b, stereo: "up" as const, narrow: came.atoms[1].id } : b)) };
    await expect(laidOut(m, MENO)).rejects.toThrow(/wedges at C do not say its configuration/);
    const laid = await laidOut(m, MENO, { axes: [], cumulated: [], configuration: configurationOf(lactone40) });
    expect(identityOfDrawn(laid).text).toBe(identity(smilesInput(lactone40)).text);
  });

  it("states nothing given as the polygon came, and says how much: the drawing kept as it came shows none of the centres given", () => {
    const came = polygon(diol36);
    const lost = notShownOf(came, { axes: [], cumulated: [], configuration: configurationOf(diol36) });
    expect(lost).toEqual({ centres: [2, 2], doubles: [0, 0], axes: [0, 0] });
    expect(asCameSaid({ asCame: "the structure could not be laid out", notShown: lost! })).toBe("Drawn as it came: it could not be laid out. 2 of its 2 stereocentres are not shown by this drawing.");
  });
});

describe("a double bond given beside the drawing, as the engine takes it", () => {
  // (the bond 3-4: atom 3 carries 1 and 2, atom 4 carries 5 and 6)
  const around: Record<number, number[]> = { 3: [1, 2, 4], 4: [3, 5, 6] };
  const neighbours = (x: number) => around[x] ?? [];

  it("is in one fixed form, the lowest group on each end - whichever groups were given - so the engine's input does not depend on who gave it", () => {
    expect(cisTransOfGiven({ bond: 0, ends: [1, 5], cis: true }, 3, 4, neighbours)).toEqual({ refs: [1, 5], cis: true });
    // (the other group on one end: the other side of it - the same bond, the cis turned)
    expect(cisTransOfGiven({ bond: 0, ends: [2, 5], cis: false }, 3, 4, neighbours)).toEqual({ refs: [1, 5], cis: true });
    // (the other on both: turned twice)
    expect(cisTransOfGiven({ bond: 0, ends: [2, 6], cis: true }, 3, 4, neighbours)).toEqual({ refs: [1, 5], cis: true });
    // (given from the bond's other end first)
    expect(cisTransOfGiven({ bond: 0, ends: [6, 1], cis: false }, 3, 4, neighbours)).toEqual({ refs: [1, 5], cis: true });
  });

  it("is none where the groups given are not that bond's", () => {
    expect(cisTransOfGiven({ bond: 0, ends: [7, 5], cis: true }, 3, 4, neighbours)).toBeNull();
  });
});

describe("a double bond the field does not name, that could be cis or trans", () => {
  // (hexa-2,4-diene: C1-C2=C3-C4=C5-C6, both bonds drawn trans by the plugin's picture; the field names the first alone, bond 1 - C2=C3)
  const picture = () => {
    const m = drawnFromSmiles("C/C=C/C=C/C");
    return { ...m, bonds: m.bonds.map(({ stereo: _s, narrow: _n, display: _d, ...b }) => b) as Model["bonds"] };
  };
  const firstOnly: Configuration = { centres: [], doubles: [{ bond: 1, ends: [0, 3], cis: false }] };
  const stated = (m: Model) => identityOfDrawn(m).text;

  it("is laid out open - stating neither - with nothing asked of Meno's own reading of the text: one stated, as given", async () => {
    const laid = await laidOut(picture(), MENO, { axes: [], cumulated: [], configuration: firstOnly });
    expect(stated(laid)).toBe(identity(smilesInput("C/C=C/C=CC")).text);
    expect(stated(laid)).not.toBe(identity(smilesInput("C/C=C/C=C/C")).text);
  });

  it("is open in a drawing kept as it came too: the plugin's picture states it, the drawing kept does not", () => {
    expect(stated(picture())).toBe(identity(smilesInput("C/C=C/C=C/C")).text);
    expect(stated(openAsCame(picture(), { axes: [], cumulated: [], configuration: firstOnly }, undefined))).toBe(identity(smilesInput("C/C=C/C=CC")).text);
  });
});

