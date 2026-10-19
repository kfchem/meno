import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TabStrip } from "./Tabs";
import { dragWithin } from "./tabDrag";

describe("the tabs in the title bar", () => {
  it("are dragged as far as the room's ends, never under the + nor past the bar's start", () => {
    const room = { left: 10, right: 500 };
    // (a tab laid at 300, 100 wide: right as far as 400 - its end at the room's - and left as far as -290)
    expect(dragWithin(50, 300, 100, room)).toBe(50);
    expect(dragWithin(250, 300, 100, room)).toBe(100);
    expect(dragWithin(-400, 300, 100, room)).toBe(-290);
    // (the last tab, laid against the room's end: not right at all)
    expect(dragWithin(30, 400, 100, room)).toBe(0);
  });

  it("leave room on the right for the chosen tab's corners, and are dragged within the strip as it is seen", () => {
    const html = renderToStaticMarkup(
      <TabStrip tabOrder={["a"]} tabsById={{ a: { id: "a", label: "Workspace" } }} activeId="a" reorder={() => {}} select={() => {}} close={() => {}} />,
    );
    expect(html).toContain("pl-1.5 pr-2 overflow-x-auto");
    expect(html).toMatch(/class="absolute inset-y-0 left-1\.5 right-2 pointer-events-none"/);
  });
});
