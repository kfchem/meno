import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import QuickAdd from "./QuickAdd";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws Quick Add, and what its rows hold is read off that.

const none = () => {};

describe("Quick Add's shapes", () => {
  it("are the five shapes and, beside the line, an arrow - the page's one Arrow, not a shape", () => {
    const html = renderToString(
      <QuickAdd x={10} y={10} within={{ width: 800, height: 600 }} steps={[]} onChoose={none} onChain={none} onArrow={none} onShape={none} onSmiles={async () => {}} onStep={none} onClose={none} />,
    );
    const row = html.match(/<div role="group" aria-label="Shapes"[^>]*>(.*?)<\/div>/)?.[1] ?? "";
    const names = [...row.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(["Rectangle", "Rounded rectangle", "Ellipse", "Line", "Arrow", "Callout"]);
  });
});
