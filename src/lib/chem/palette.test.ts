import { describe, expect, it } from "vitest";
import {
  acceptColours,
  acceptSetColours,
  allSets,
  BUILT_IN_SETS,
  DEFAULT_COLOURS,
  freshName,
  hexOf,
  MENO_SET,
  newSetId,
  rgbOf,
  setInUse,
  SET_COLOURS_MOST,
  SETS_MOST,
} from "./palette";
import { MENO, ACS_1996, RSC, NATURE, WILEY } from "./style";

describe("colour sets", () => {
  it("are Meno's six and Okabe and Ito's, built in, Meno's in use unless the settings say otherwise", () => {
    expect(MENO_SET.colours).toEqual(["#317689", "#cd4560", "#b2d9e4", "#ebb3be", "#141414", "#c0c0c0"]);
    expect(BUILT_IN_SETS.map((s) => s.id)).toEqual(["meno", "okabe-ito"]);
    expect(acceptColours(undefined)).toEqual(DEFAULT_COLOURS);
    expect(setInUse(DEFAULT_COLOURS)).toBe(MENO_SET);
  });

  it("are read back with their own ids, names on one line, and only colours, each once", () => {
    const read = acceptColours({
      use: "set-2",
      sets: [
        { id: "set-1", name: "  Talk\n slides ", colours: ["#ABCDEF", "#abcdef", "red", 3, "#123456"] },
        { id: "meno", name: "Not Meno", colours: ["#000000"] },
        { id: "set-1", name: "Twice", colours: [] },
        { id: "set-2", name: "", colours: [] },
        { id: "Set 3", name: "Bad id", colours: [] },
      ],
    });
    expect(read.sets).toEqual([{ id: "set-1", name: "Talk slides", colours: ["#abcdef", "#123456"] }]);
    // (the one in use gone: Meno's)
    expect(read.use).toBe("meno");
    expect(acceptColours({ use: "set-1", sets: read.sets }).use).toBe("set-1");
    expect(allSets(read).map((s) => s.id)).toEqual(["meno", "okabe-ito", "set-1"]);
  });

  it("hold no more colours, and the user no more sets, than they are kept to", () => {
    const many = Array.from({ length: 40 }, (_, i) => `#0000${(i + 16).toString(16)}`);
    expect(acceptSetColours(many)).toHaveLength(SET_COLOURS_MOST);
    const sets = Array.from({ length: 30 }, (_, i) => ({ id: `set-${i + 1}`, name: `Set ${i + 1}`, colours: [] }));
    expect(acceptColours({ sets }).sets).toHaveLength(SETS_MOST);
  });

  it("give a new set an id and a name of its own", () => {
    expect(newSetId(["set-1", "set-3"])).toBe("set-2");
    expect(freshName("My colours", ["Meno", "My colours", "My colours 2"])).toBe("My colours 3");
    expect(freshName("", [])).toBe("My colours");
  });

  it("put a colour as hex and as red, green and blue, either way", () => {
    expect(rgbOf("#317689")).toEqual([49, 118, 137]);
    expect(hexOf([49, 118, 137])).toBe("#317689");
    expect(hexOf([300, -4, 12.6])).toBe("#ff000d");
  });
});

describe("the ground ink", () => {
  it("is the palette's black in Meno's style, and pure black in a journal's", () => {
    expect([MENO.bondColor, MENO.labelColor]).toEqual(["#141414", "#141414"]);
    for (const s of [ACS_1996, RSC, NATURE, WILEY]) expect([s.bondColor, s.labelColor]).toEqual(["#000000", "#000000"]);
  });
});
