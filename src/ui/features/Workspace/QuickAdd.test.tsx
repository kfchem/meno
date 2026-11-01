import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import QuickAdd, { DrawAs } from "./QuickAdd";
import { labelWidth } from "./quickAddLabel";
import { pastedAs } from "./quickAddPaste";
import { registerKinds } from "../../../lib/io/kinds";
import { MANIFESTS } from "../../../lib/plugins/known";
import { resolve } from "./chem/resolve";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws Quick Add, and what its rows hold is read off that.

const none = () => {};

/** Quick Add as it opens: the names in its first row, in order, and in its row of shapes. */
function rows() {
  const html = renderToString(
    <QuickAdd x={10} y={10} within={{ width: 800, height: 600 }} steps={[]} onChoose={none} onChain={none} onArrow={none} onShape={none} onSmiles={async () => {}} onStep={none} onClose={none} />,
  );
  const first = html.match(/<div role="toolbar" aria-label="Add"[^>]*><div class="flex items-center gap-0.5">(.*?)<div class="mx-1/)?.[1] ?? "";
  const shapes = html.match(/<div role="group" aria-label="Shapes"[^>]*>(.*?)<\/div>/)?.[1] ?? "";
  const names = (s: string) => [...s.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
  return { first: names(first), shapes: names(shapes) };
}

describe("Quick Add", () => {
  it("has one arrow, called Arrow, in its first row - the page's one Arrow, a reaction's or any", () => {
    const { first, shapes } = rows();
    expect(first.filter((n) => /arrow/i.test(n))).toEqual(["Arrow", "Electron-pushing arrow"]);
    expect(shapes).not.toContain("Arrow");
  });

  it("offers as shapes a rectangle - its corners rounded from its menu - an ellipse and a line", () => {
    expect(rows().shapes).toEqual(["Rectangle", "Ellipse", "Line"]);
  });

  it("its rules and its SMILES field span the row whole: each icon, the gaps between them, the divider", () => {
    const html = renderToString(
      <QuickAdd x={10} y={10} within={{ width: 800, height: 600 }} steps={[]} onChoose={none} onChain={none} onArrow={none} onShape={none} onSmiles={async () => {}} onStep={none} onClose={none} />,
    );
    const first = html.match(/<div class="flex items-center gap-0.5">(.*?)<div class="mx-1/)?.[1] ?? "";
    // (36 px an icon, the Calculations one after the divider among them, and 2 the gap before each but the first; 8 + 1 px the divider)
    const icons = (first.match(/<button/g)?.length ?? 0) + 1;
    const row = icons * (36 + 2) + 9;
    expect(html).toMatch(new RegExp(`<form class="[^"]*border-t[^"]*" style="width:${row}px"`));
    expect(html).toMatch(new RegExp(`aria-label="Shapes" class="[^"]*border-t[^"]*" style="width:${row}px"`));
  });
});

describe("what the SMILES field's text will be drawn as", () => {
  const drawAs = (text: string, choice = 0) => {
    const { readings } = resolve(text, "molecule");
    return renderToString(<DrawAs offered={readings} chosen={readings[choice]} onChoose={none} />);
  };

  it("NBS: the SMILES and N-bromosuccinimide each offered, with its formula, the one chosen in Meno's colour", () => {
    const html = drawAs("NBS");
    expect([...html.matchAll(/role="radio" aria-checked="(\w+)"/g)].map((m) => m[1])).toEqual(["true", "false"]);
    expect(html).toContain("SMILES");
    expect(html).toContain("N-bromosuccinimide");
    expect(html.match(/border-accel-base/g)).toHaveLength(1);
    expect(drawAs("NBS", 1).match(/aria-checked="true"[^>]*>N-bromosuccinimide/)).not.toBeNull();
  });

  it("a formula's counts set below the line at the drawing's size, never a font's subscript digits", () => {
    const html = drawAs("DMF");
    expect(html).toContain("N,N-dimethylformamide");
    expect(html).toMatch(/font-size:0.75em[^>]*>3</);
    expect(html).not.toMatch(/[\u2080-\u2089]/);
  });

  it("a label that is its formula said once (PdCl2), one that is not with its formula (Et3N)", () => {
    const words = (html: string) => html.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "");
    expect(words(drawAs("pdcl2"))).toBe("PdCl2");
    expect(words(drawAs("Et3N"))).toBe("Et3N \u00b7 C6H15N");
  });
});

describe("what is pasted in the SMILES field", () => {
  afterEach(() => registerKinds([]));
  // (made up: an output's banner, then a geometry as a text of coordinates would have it)
  const ORCA = ["", "                                 * O   R   C   A *", "", "O 0.000000 0.000000 0.117300", "H 0.000000 0.757200 -0.469200", "H 0.000000 -0.757200 -0.469200"].join("\n");
  const all = { output: true, coordinates: true };

  it("is a calculation's output, whole, where its program's banner says so - its plugin added or only offered - never read as coordinates", () => {
    for (const [added, offered] of [[MANIFESTS, []], [[], MANIFESTS]] as const) {
      registerKinds(added, offered);
      expect(pastedAs(ORCA, all)).toEqual({ output: ORCA });
    }
    // (where Quick Add takes no output - where it is opened for nothing to put down - coordinates, as before)
    expect(pastedAs(ORCA, { output: false, coordinates: true })).toMatchObject({ structures: [{ atoms: expect.any(Array) }] });
  });

  it("is coordinates in a text where no banner says it is an output; and typed as it is where it is neither", () => {
    registerKinds(MANIFESTS);
    const water = ORCA.split("\n").slice(3).join("\n");
    expect(pastedAs(water, all)).toMatchObject({ structures: [{ atoms: [{ el: "O" }, { el: "H" }, { el: "H" }] }] });
    expect(pastedAs("c1ccccc1O", all)).toBeNull();
  });
});

describe("the names of who does each row of steps", () => {
  it("stand as wide as the widest of them, with its padding - whoever's it is, no width sized to one name", () => {
    expect(labelWidth([])).toBe(12);
    const short = labelWidth(["xTB"]);
    const long = labelWidth(["xTB", "A plugin with a long name"]);
    expect(long).toBeGreaterThan(short);
    expect(labelWidth(["A plugin with a long name", "xTB"])).toBe(long);
  });
});
