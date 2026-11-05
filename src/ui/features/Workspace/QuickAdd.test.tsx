import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import QuickAdd, { DrawAs } from "./QuickAdd";
import { CALC_MOST, CALC_ROW, LIST_LEAST, LIST_MOST, calcHeight, listWidth, stepsMost } from "./quickAddLabel";
import { pastedAs } from "./quickAddPaste";
import { toggledPanel } from "./quickAddPanel";
import { registerKinds } from "../../../lib/io/kinds";
import { MANIFESTS } from "../../../lib/plugins/known";
import { resolve } from "./chem/resolve";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws Quick Add, and what its rows hold is read off that.

const none = () => {};

/** Quick Add as it opens: the names in its first row, in order, and in the rows its groups open below it. */
function rows() {
  const html = renderToString(
    <QuickAdd x={10} y={10} within={{ width: 800, height: 600 }} steps={[]} onChoose={none} onChain={none} onArrow={none} onShape={none} onSmiles={async () => {}} onStep={none} onClose={none} />,
  );
  const first = html.match(/<div role="toolbar" aria-label="Add"[^>]*><div class="flex items-center gap-0.5">(.*?)<div class="mx-1/)?.[1] ?? "";
  const group = (name: string) => html.match(new RegExp(`<div role="group" aria-label="${name}"[^>]*>(.*?)</div>`))?.[1] ?? "";
  const names = (s: string) => [...s.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
  return { first: names(first), scheme: names(group("Scheme")), marks: names(group("Marks on the page")) };
}

describe("Quick Add", () => {
  it("has in its first row what makes a structure and a scheme's words and arrow, then two groups - each opening a row of its own (layout A, 2026-10-29)", () => {
    const { first, scheme, marks } = rows();
    expect(first).toEqual(["Bond", "Chain", "SMILES", "Text", "Arrow", "Scheme", "Marks on the page"]);
    // (Scheme: the "+", the electron-pushing arrow, the catalytic cycle and the slide; one arrow on the page, the Arrow, in the first row)
    expect(scheme).toEqual(["Plus", "Electron-pushing arrow", "Catalytic cycle", "Slide"]);
    // (Marks on the page: the shapes - a rectangle, its corners rounded from its menu, an ellipse and a line - and the pen)
    expect(marks).toEqual(["Rectangle", "Ellipse", "Line", "Pen"]);
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
    expect(html).toMatch(new RegExp(`aria-label="Scheme" class="[^"]*border-t[^"]*" style="width:${row}px"`));
    expect(html).toMatch(new RegExp(`aria-label="Marks on the page" class="[^"]*border-t[^"]*" style="width:${row}px"`));
  });
});

describe("Quick Add's groups", () => {
  const html = () =>
    renderToString(<QuickAdd x={10} y={10} within={{ width: 800, height: 600 }} steps={[]} onChoose={none} onChain={none} onArrow={none} onShape={none} onSmiles={async () => {}} onStep={none} onClose={none} />);

  it("open one row at a time: a group pressed opens its own in place of another's, and pressed again shuts it", () => {
    expect(toggledPanel("none", "scheme")).toBe("scheme");
    expect(toggledPanel("scheme", "marks")).toBe("marks");
    expect(toggledPanel("marks", "marks")).toBe("none");
    expect(toggledPanel("smiles", "scheme")).toBe("scheme");
  });

  it("say they open and are shut, mark only themselves as opening a row, and keep a shut row out of the keys' reach", () => {
    const h = html();
    // (each of the first row's buttons, by name: what it says of opening, and whether it carries the corner mark)
    const buttons = [...h.matchAll(/<button ([^>]*)>(.*?)<\/button>/g)].map((m) => ({
      name: /aria-label="([^"]+)"/.exec(m[1])?.[1],
      expanded: /aria-expanded="(true|false)"/.exec(m[1])?.[1],
      mark: m[2].includes('viewBox="0 0 6 4"'),
    }));
    const of = (name: string) => buttons.find((b) => b.name === name)!;
    expect(of("Scheme")).toMatchObject({ expanded: "false", mark: true });
    expect(of("Marks on the page")).toMatchObject({ expanded: "false", mark: true });
    for (const name of ["Bond", "Chain", "Text", "Arrow"]) expect(of(name), name).toMatchObject({ expanded: undefined, mark: false });
    // (a shut row is inert: hidden, it takes no focus)
    for (const name of ["Scheme", "Marks on the page"]) expect(h, name).toMatch(new RegExp(`inert=""><div role="group" aria-label="${name}"`));
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

describe("how the calculations' list stands", () => {
  it("as wide as its widest name, with what stands about it - whoever's it is - between the least and the most", () => {
    expect(listWidth([])).toBe(LIST_LEAST);
    const long = listWidth(["xTB", "A plugin with a long name that goes on"]);
    expect(long).toBeGreaterThan(LIST_LEAST);
    expect(listWidth(["A plugin with a long name that goes on", "xTB"])).toBe(long);
    // (never wider than the most: a longer name is cut, said whole on hover)
    expect(listWidth(["A plugin whose name runs on and on, far past what a row can hold"])).toBe(LIST_MOST);
  });

  it("as tall as its rows and the largest one's steps opened, those scrolling past the most - and never fewer than six of them shown", () => {
    expect(calcHeight([3, 2])).toBe(2 * CALC_ROW + 3 * CALC_ROW + 4);
    expect(calcHeight([40, 2])).toBe(CALC_MOST);
    expect(stepsMost(40)).toBe(6 * CALC_ROW);
    expect(calcHeight([])).toBe(0);
  });
});
