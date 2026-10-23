import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DEFAULT_STYLE_CHOICE } from "../../../../lib/chem/style";
import type { Molecule3D } from "../store/types";
import SummaryBody from "./SummaryBody";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws the summary - with no editor's store about it, as the workflow's
// layer draws it - and what it shows is read off that.

const water = (energies: number[]): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.96, y: 0, z: 0 },
    { el: "H", x: -0.24, y: 0.93, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  frames: energies.slice(1).map(() => [0, 0, 0, 0.96, 0, 0, -0.24, 0.94, 0]),
  energies,
  conformerSet: true,
  made: { how: [], energies: "Field X" },
});

describe("a large set's summary in its frame", () => {
  it("is drawn with no editor's store about it: its count, its sample - being drawn - and its chart, saying what of", () => {
    const html = renderToString(
      <SummaryBody count="400" nouns="conformers of 2 compounds" collection={[water([-76, -75.999, -75.998]), water([-80, -79.99])]} holds="conformers" style={DEFAULT_STYLE_CHOICE} />,
    ).split("<!-- -->").join("");
    expect(html).toContain("conformers of 2 compounds");
    expect(html).toContain("Each compound, drawn once");
    expect(html.match(/Drawing…/g)).toHaveLength(2);
    expect(html).toContain("ΔE above each compound&#x27;s lowest (kcal/mol)");
    expect(html).toContain("Field X · 5 entries");
  });
});
