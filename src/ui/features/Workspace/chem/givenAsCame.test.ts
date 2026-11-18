import { describe, expect, it, vi } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import type { IsomerConfiguration } from "../../../../lib/chem/stereoOpen";
import { asCameSaid, drawingOf } from "./fromSmiles";
import { centreFrom, configurationOf, molblockOf, plainPicture } from "./testdata/givenPictures";
import { drawnFromSmiles } from "../utils/smilesDrawn";

// (Meno's engine refusing, stood in for: the plugin's drawing kept as it came)
vi.mock("./layOut", async (actual) => ({ ...(await actual<typeof import("./layOut")>()), layOut: () => Promise.reject(new Error("the structure could not be laid out")) }));

/**
 * A plugin's drawing kept as it came, with the configuration given beside it (backlog 106 B): what that drawing does not show of what was
 * given is said with the count, and its double bonds left open come with a wavy bond.
 */

const given = (configuration: IsomerConfiguration) => ({ axes: [], cumulated: [], configuration });
/** The 1,2-diol C0 C1(O2) C3(O4) C5, its two centres named by the field: drawn plain, it shows neither. */
const DIOL = molblockOf(plainPicture("CC(O)C(O)C"));
const c1 = centreFrom(1, [{ at: 0, deg: 330 }, { at: 2, deg: 90 }, { at: 3, deg: 210 }]);
const c3 = centreFrom(3, [{ at: 1, deg: 330 }, { at: 4, deg: 90 }, { at: 5, deg: 210 }]);

describe("a drawing kept as it came, with a configuration given beside it", () => {
  it("says how many of its stereocentres it does not show: one, and two of two", async () => {
    const one = await drawingOf(DIOL, MENO, given({ centres: [c1], doubles: [] }));
    expect(one.notShown?.centres).toEqual([1, 1]);
    expect(asCameSaid(one)).toBe("Drawn as it came: it could not be laid out. Its stereocentre is not shown by this drawing.");
    const two = await drawingOf(DIOL, MENO, given({ centres: [c1, c3], doubles: [] }));
    expect(two.notShown?.centres).toEqual([2, 2]);
    expect(asCameSaid(two)).toBe("Drawn as it came: it could not be laid out. 2 of its 2 stereocentres are not shown by this drawing.");
  });

  it("counts a centre the picture shows turned from what was given: its mirror image's wedge", async () => {
    const block = molblockOf(drawnFromSmiles("F[C@H](Cl)Br"));
    const same = await drawingOf(block, MENO, given(configurationOf("F[C@H](Cl)Br")));
    expect(same.notShown?.centres).toEqual([0, 1]);
    const turned = await drawingOf(block, MENO, given(configurationOf("F[C@@H](Cl)Br")));
    expect(turned.notShown?.centres).toEqual([1, 1]);
  });

  it("counts a double bond given the other way from how the picture shows it, and says so", async () => {
    // (but-2-ene, C0 C1=C2 C3: the picture shows trans; the field gives trans, shown, or cis, not shown)
    const block = molblockOf(plainPicture("C/C=C/C"));
    const shown = await drawingOf(block, MENO, given({ centres: [], doubles: [{ bond: 1, ends: [0, 3], cis: false }] }));
    expect(shown.notShown?.doubles).toEqual([0, 1]);
    const lost = await drawingOf(block, MENO, given({ centres: [], doubles: [{ bond: 1, ends: [0, 3], cis: true }] }));
    expect(lost.notShown?.doubles).toEqual([1, 1]);
    expect(asCameSaid(lost)).toBe("Drawn as it came: it could not be laid out. Its double bond's cis or trans is not shown by this drawing.");
  });

  it("counts an axis given that the picture does not show: an allene's, drawn with no wedge", async () => {
    // (penta-2,3-diene, C0 C1=C2=C3 C4, its axis given by the text)
    const block = molblockOf(plainPicture("CC=C=CC"));
    const drawn = await drawingOf(block, MENO, { axes: [{ atoms: [1, 3], refs: [0, 4], sense: 1 }], cumulated: [] });
    expect(drawn.notShown?.axes).toEqual([1, 1]);
    expect(asCameSaid(drawn)).toBe("Drawn as it came: it could not be laid out. Its axis is not shown by this drawing.");
  });

  it("gives a double bond the field does not name, which could be cis or trans, a wavy bond", async () => {
    // (3-methylpent-2-ene with a centre given elsewhere: its C=C open)
    const block = molblockOf(plainPicture("CC=C(C)C(O)CC"));
    const c5 = centreFrom(5, [{ at: 3, deg: 330 }, { at: 6, deg: 90 }, { at: 7, deg: 210 }]);
    const drawn = await drawingOf(block, MENO, given({ centres: [c5], doubles: [] }));
    expect(drawn.asCame).toBeDefined();
    expect(drawn.bonds.filter((b) => b.order === 2 && b.stereo === "either")).toHaveLength(1);
  });
});
