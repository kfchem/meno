import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import QuickAdd from "./QuickAdd";

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

  it("offers as shapes the boxes, the line and the callout", () => {
    expect(rows().shapes).toEqual(["Rectangle", "Rounded rectangle", "Ellipse", "Line", "Callout"]);
  });
});
