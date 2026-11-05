import { describe, expect, it } from "vitest";
import { arrowMovesMenu, wheelClosesMenu } from "./menuKeys";
import { faceFor, parsePoints, parseSpacing, spacingFor } from "./wordsFont";

describe("a text box's size, line spacing and typeface, as they are given", () => {
  it("takes a size typed in points from 4 to 288, a comma as a point, and nothing else", () => {
    expect(parsePoints("14")).toBe(14);
    expect(parsePoints(" 10,5 ")).toBe(10.5);
    expect(parsePoints("4")).toBe(4);
    expect(parsePoints("288")).toBe(288);
    for (const no of ["2", "3.9", "289", "5000", "", "pt", "-12"]) expect(parsePoints(no), no).toBeNull();
  });

  it("takes a line spacing typed from 0.5 to 4 times single, and nothing else", () => {
    expect(parseSpacing("1.5")).toBe(1.5);
    expect(parseSpacing("0,5")).toBe(0.5);
    expect(parseSpacing("4")).toBe(4);
    for (const no of ["0.4", "5", "", "x"]) expect(parseSpacing(no), no).toBeNull();
  });

  it("gives single spacing as none of their own, and the drawing's typeface picked as none of their own", () => {
    expect(spacingFor(1)).toBeNull();
    expect(spacingFor(1.15)).toBe(1.15);
    expect(faceFor("Arial", "Arial")).toBeNull();
    expect(faceFor("IBM Plex Sans", "Arial")).toBe("IBM Plex Sans");
  });
});

describe("the menu the font rows are in", () => {
  it("leaves the arrow keys to a field of its own, and moves through its items from anywhere else", () => {
    expect(arrowMovesMenu({ tagName: "INPUT" } as unknown as EventTarget)).toBe(false);
    expect(arrowMovesMenu({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(true);
    expect(arrowMovesMenu(null)).toBe(true);
  });

  it("closes on a wheel turned outside it, not on a list scrolled inside it", () => {
    const inside = {} as Node;
    const menu = { contains: (n: Node | null) => n === inside };
    expect(wheelClosesMenu(inside as unknown as EventTarget, menu)).toBe(false);
    expect(wheelClosesMenu({} as EventTarget, menu)).toBe(true);
    expect(wheelClosesMenu({} as EventTarget, null)).toBe(true);
  });
});
