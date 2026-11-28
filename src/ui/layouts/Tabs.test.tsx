import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TabStrip } from "./Tabs";
import { dragTo, dragWithin, reorders, scrollToShow, tabGestures, watchDragEnds, type DragMark } from "./tabDrag";

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
    expect(html).toContain("pl-1.5 pr-1 overflow-x-auto");
    // (the last tab's gap and the padding together as wide as the corners)
    expect(html).toContain("margin-right:4px");
    expect(html).toContain("width:192px");
    expect(html).toMatch(/class="absolute inset-y-0 left-1\.5 right-2 pointer-events-none"/);
  });

  it("bring the chosen tab into view by scrolling sideways, as little as shows it whole - never up or down", () => {
    // (a strip 400 across, scrolled to 100: a tab at 50 shown from its start, one at 450 to its end, one in view left)
    expect(scrollToShow(50, 80, 100, 400)).toBe(50);
    expect(scrollToShow(450, 80, 100, 400)).toBe(130);
    expect(scrollToShow(200, 80, 100, 400)).toBeNull();
    // (a tab wider than the strip: from its start)
    expect(scrollToShow(600, 500, 100, 400)).toBe(600);
    // (its corners shown too, 8 either side: the last tab of a full strip shown to its corner, the strip's padding)
    expect(scrollToShow(450, 80, 100, 400, 8)).toBe(138);
    expect(scrollToShow(50, 80, 100, 400, 8)).toBe(42);
    expect(scrollToShow(4, 80, 100, 400, 8)).toBe(0);
  });

  it("choose the tab pressed though a drag's end never came, as the strip gives each tab its gestures - a second pointer during a drag choosing nothing", () => {
    const chosen: string[] = [];
    const mark: DragMark = { current: null };
    const tab = tabGestures(mark, () => chosen.push("settings"));
    // (a drag begun by the mouse, its end never coming - let go outside the window)
    tab.onDragStart({ pointerId: 1, pointerType: "mouse" });
    expect(mark.current).toBe(1);
    // (a second pointer while the drag is in hand: nothing chosen, the drag kept within the strip)
    tab.onPointerDown({ pointerId: 7, isPrimary: false, pointerType: "mouse" });
    expect(chosen).toEqual([]);
    expect(mark.current).toBe(1);
    // (the mouse pressed again: that drag is over, and the tab chosen)
    tab.onPointerDown({ pointerId: 1, isPrimary: true, pointerType: "mouse" });
    expect(chosen).toEqual(["settings"]);
    expect(mark.current).toBeNull();
  });

  it("end a drag at every way one ends: its own end, its pointer let go or cancelled anywhere, the window left, Escape", () => {
    const heard = new Map<string, (e: Event) => void>();
    const on = { addEventListener: (k: string, f: (e: Event) => void) => void heard.set(k, f), removeEventListener: (k: string) => void heard.delete(k) } as unknown as Window;
    const mark: DragMark = { current: null };
    const stop = watchDragEnds(mark, on);
    const ends: [string, object][] = [
      ["pointerup", { pointerId: 1 }],
      ["pointercancel", { pointerId: 1 }],
      ["blur", {}],
      ["keydown", { key: "Escape" }],
    ];
    for (const [kind, e] of ends) {
      mark.current = 1;
      heard.get(kind)!(e as Event);
      expect(mark.current).toBeNull();
    }
    // (another pointer let go, or another key: the drag goes on)
    mark.current = 1;
    heard.get("pointerup")!({ pointerId: 7 } as unknown as Event);
    heard.get("keydown")!({ key: "a" } as unknown as Event);
    expect(mark.current).toBe(1);
    tabGestures(mark, () => {}).onDragEnd();
    expect(mark.current).toBeNull();
    stop();
    expect(heard.size).toBe(0);
  });

  it("take nothing more from a drag ended with its pointer still down - Escape, the window left: the tab back in its place, no other order, and its release chooses nothing", () => {
    const heard = new Map<string, (e: Event) => void>();
    const on = { addEventListener: (k: string, f: (e: Event) => void) => void heard.set(k, f), removeEventListener: (k: string) => void heard.delete(k) } as unknown as Window;
    const within = (x: number) => Math.min(x, 40);
    for (const end of [() => heard.get("keydown")!({ key: "Escape" } as unknown as Event), () => heard.get("blur")!({} as Event)]) {
      const chosen: string[] = [];
      const mark: DragMark = { current: null };
      const stop = watchDragEnds(mark, on);
      const tab = tabGestures(mark, () => chosen.push("tab"));
      tab.onDragStart({ pointerId: 1, pointerType: "mouse" });
      expect(dragTo(mark, 120, within)).toBe(40);
      expect(reorders(mark)).toBe(true);
      end();
      // (the same pointer moving on: the tab at its place, the order kept)
      expect(dragTo(mark, 150, within)).toBe(0);
      expect(reorders(mark)).toBe(false);
      // (let go: nothing chosen, the drag's own end the last of it)
      heard.get("pointerup")!({ pointerId: 1 } as unknown as Event);
      tab.onDragEnd();
      expect(chosen).toEqual([]);
      expect(mark).toMatchObject({ current: null, over: null });
      expect(dragTo(mark, 30, within)).toBe(30);
      stop();
    }
  });

  it("take a new primary touch as a press, the touch that held a drag whose end never came gone - a second finger during a drag choosing nothing", () => {
    const chosen: string[] = [];
    const mark: DragMark = { current: null };
    const tab = tabGestures(mark, () => chosen.push("tab"));
    tab.onDragStart({ pointerId: 5, pointerType: "touch" });
    // (a second finger, while the first is on the screen: not primary - nothing chosen, the drag in hand)
    tab.onPointerDown({ pointerId: 6, isPrimary: false, pointerType: "touch" });
    // (the mouse, another kind of pointer: nothing told of the touch)
    tab.onPointerDown({ pointerId: 1, isPrimary: true, pointerType: "mouse" });
    expect(chosen).toEqual([]);
    expect(mark.current).toBe(5);
    // (a primary touch: no other touch on the screen - the drag's own is gone)
    tab.onPointerDown({ pointerId: 9, isPrimary: true, pointerType: "touch" });
    expect(chosen).toEqual(["tab"]);
    expect(mark.current).toBeNull();
  });
});
