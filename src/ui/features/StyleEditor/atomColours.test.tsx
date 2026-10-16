import type React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BALL_AND_STICK } from "../../../lib/chem/style3d";
import AtomColours from "./AtomColours";
import { COMMON, elementColours } from "./atomColourCells";

// (drawn by the server's renderer: what it shows read off that)
const none = () => {};
// (the markup without the marks between a text's parts, its apostrophes as typed)
const markup = (el: React.ReactElement) => renderToString(el).replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");

describe("Settings' atom colours", () => {
  it("offer every element's colour, in the table, and the elements most drawn above it", () => {
    const html = markup(<AtomColours look={BALL_AND_STICK} preset={BALL_AND_STICK} onSet={none} onReset={none} />);
    const inputs = [...html.matchAll(/aria-label="([^"]+)'s colour"/g)].map((m) => m[1]);
    expect(inputs).toHaveLength(118 + COMMON.length);
    expect(new Set(inputs).size).toBe(118);
    for (const name of ["Hydrogen", "Ruthenium", "Uranium", "Oganesson"]) expect(inputs).toContain(name);
    // (the series' places in group 3 say which numbers stand below)
    expect(html).toContain("57–71");
    expect(html).toContain("89–103");
    // (nothing changed: nothing to take back)
    expect(html).not.toContain("Back to Jmol");
  });
  it("ring those changed, and offer to take them all back to the colour set's", () => {
    const look = { ...BALL_AND_STICK, colours: { Ru: "#123456", C: "#000000" } };
    const html = markup(<AtomColours look={look} preset={BALL_AND_STICK} onSet={none} onReset={none} />);
    expect(html).toContain("Back to Jmol's colours (2)");
    expect(html.match(/title="[A-Za-z]+ \(changed\)"/g)).toHaveLength(2 + 1); // (carbon in the row above too)
    expect(elementColours(look, BALL_AND_STICK).filter((c) => c.changed).map((c) => c.symbol)).toEqual(["C", "Ru"]);
  });
  it("say an element is changed only where it differs from the colour set chosen", () => {
    const pastel = { ...BALL_AND_STICK, colourSet: "pastel" };
    expect(elementColours(pastel, BALL_AND_STICK).some((c) => c.changed)).toBe(false);
  });
});
