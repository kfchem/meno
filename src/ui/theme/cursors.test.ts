import { describe, expect, it } from "vitest";
import { CURSORS, cursorCss, cursorSvg, holdCursor, installCursors, setCursor, type CursorName } from "./cursors";

const NAMES = Object.keys(CURSORS) as CursorName[];

describe("Meno's pointers", () => {
  it("are each an SVG of its size, its ink over a white edge", () => {
    for (const name of NAMES) {
      const svg = cursorSvg(name);
      expect(svg).toMatch(/^<svg [^>]*width="24" height="24" viewBox="0 0 24 24">/);
      expect(svg.indexOf('stroke="#ffffff"')).toBeLessThan(svg.indexOf(`stroke="${CURSORS[name].ink}"`));
      // (twice the size, for a screen of twice the pixels: the same drawing)
      expect(cursorSvg(name, 2)).toContain('width="48" height="48" viewBox="0 0 24 24"');
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it("are given by `data-cursor`, at the screen's scale where the webview reads it, the system's behind", () => {
    const css = cursorCss();
    for (const name of NAMES) {
      const rule = css.split("\n").find((r) => r.startsWith(`[data-cursor="${name}"]`))!;
      expect(rule).toBeDefined();
      // (1x first, kept where the second is not read; each with its spot, the middle, and the system's)
      const [plain, scaled] = rule.split("; cursor: ");
      expect(plain).toContain(`url("data:image/svg+xml,`);
      expect(plain.endsWith(`12 12, ${CURSORS[name].fallback}`)).toBe(true);
      expect(scaled).toMatch(/^-webkit-image-set\(url\(.+\) 1x, url\(.+\) 2x, url\(.+\) 3x\) 12 12, /);
    }
    // (no hands: the system's grab and grabbing only behind Meno's turning pointers)
    expect(CURSORS.turn.fallback).toBe("grab");
    expect(CURSORS.sideways.fallback).toBe("ew-resize");
  });

  it("are written into the page once, and asked for and let go on an element", () => {
    // (the page as far as it is touched: its head, and its elements by id)
    const added: { id: string; textContent: string }[] = [];
    const page = {
      getElementById: (id: string) => added.find((e) => e.id === id) ?? null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild: (e: { id: string; textContent: string }) => added.push(e) },
    } as unknown as Document;
    installCursors(page);
    installCursors(page);
    expect(added).toHaveLength(1);
    expect(added[0]).toEqual({ id: "meno-cursors", textContent: cursorCss() });
    const el = { dataset: {} as DOMStringMap } as HTMLElement;
    setCursor(el, "turning");
    expect(el.dataset.cursor).toBe("turning");
    setCursor(el, null);
    expect("cursor" in el.dataset).toBe(false);
  });

  it("are held over the whole page for a drag, before any other asked for, and let go", () => {
    const css = cursorCss();
    for (const name of NAMES) {
      const rule = css.split("\n").find((r) => r.startsWith(`[data-cursor-held="${name}"]`))!;
      // (over every element under the page's root, and over a pointer asked for there - words' text cursor, set on the element itself)
      expect(rule.startsWith(`[data-cursor-held="${name}"], [data-cursor-held="${name}"] * {`)).toBe(true);
      expect(rule.match(/!important/g)).toHaveLength(2);
      expect(rule).toContain(`12 12, ${CURSORS[name].fallback} !important`);
    }
    const page = { documentElement: { dataset: {} as DOMStringMap } } as unknown as Document;
    const letGo = holdCursor("sideways", page);
    expect(page.documentElement.dataset.cursorHeld).toBe("sideways");
    letGo();
    expect("cursorHeld" in page.documentElement.dataset).toBe(false);
    // (one let go late leaves one held since alone)
    const first = holdCursor("sideways", page);
    holdCursor("corner-up", page);
    first();
    expect(page.documentElement.dataset.cursorHeld).toBe("corner-up");
  });
});
