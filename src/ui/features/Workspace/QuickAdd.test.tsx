import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import QuickAdd, { DrawAs } from "./QuickAdd";
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
