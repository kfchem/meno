/**
 * The rules behind icons shown through pictures of themselves (./iconPictureRules): the test at start read from two counts, which
 * icons are shown so, and the clean copy each picture is drawn from (known answers).
 */
import { describe, expect, it } from "vitest";
import { ZIGZAG, cleanCopy, inBetweenAlphas, inkAlpha, pathsLookCoarse, whyLive, type IconLook, type InkNode, type InkPaint } from "./iconPictureRules";

const INK = "rgb(36, 41, 47)";

const paint = (over: Partial<InkPaint> = {}): InkPaint => ({
  fill: "none",
  stroke: INK,
  strokeWidth: "1.8px",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeMiterlimit: "4",
  strokeDasharray: "none",
  strokeDashoffset: "0px",
  opacity: "1",
  fillOpacity: "1",
  strokeOpacity: "1",
  fillRule: "nonzero",
  visibility: "visible",
  display: "inline",
  clipPath: "none",
  mask: "none",
  filter: "none",
  markers: "none",
  vectorEffect: "none",
  animationName: "none",
  transform: "none",
  ...over,
});

const node = (tag: string, attrs: Record<string, string>, over: Partial<InkPaint> = {}, children: InkNode[] = []): InkNode => ({ tag, attrs, paint: paint(over), children });

const icon = (children: InkNode[], over: Partial<IconLook> = {}): IconLook => ({
  width: 20,
  height: 20,
  ratio: 2,
  padding: 0,
  border: 0,
  overflow: "hidden",
  color: INK,
  background: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  maskImage: "none",
  viewBox: "0 0 20 20",
  preserveAspectRatio: null,
  live: false,
  forcedColors: false,
  animating: false,
  root: node("svg", {}, {}, children),
  ...over,
});

const zigzag = () => icon([node("path", { d: ZIGZAG })]);

describe("the test at start", () => {
  it("counts the distinct alphas strictly between none and full", () => {
    // (four pixels: none, a half, full, a half again; then a quarter)
    expect(inBetweenAlphas([0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 64])).toBe(2);
    expect(inBetweenAlphas([])).toBe(0);
  });

  it("reads coarse only where the plain canvas has clearly fewer steps than the kept one", () => {
    expect(pathsLookCoarse(3, 17)).toBe(true);
    expect(pathsLookCoarse(6, 10)).toBe(true);
    expect(pathsLookCoarse(6, 9)).toBe(false);
    expect(pathsLookCoarse(7, 30)).toBe(false);
    expect(pathsLookCoarse(17, 17)).toBe(false);
    // (the kept canvas coarse as well: nothing says the plain one is the coarser)
    expect(pathsLookCoarse(3, 3)).toBe(false);
  });
});

describe("which icons are shown through their pictures", () => {
  it("takes a one-ink icon, its fills and strokes in its own colour", () => {
    expect(whyLive(zigzag())).toBeNull();
    expect(whyLive(icon([node("path", { d: "M4 16 L15 3.5 L16.5 5 Z" }, { fill: INK, fillOpacity: "0.4" }), node("g", {}, { opacity: "0.5" }, [node("circle", { cx: "10", cy: "10", r: "3" })])]))).toBeNull();
  });

  it("leaves an icon of two inks, with text in it, too large, or off whole device pixels", () => {
    expect(whyLive(icon([node("path", { d: ZIGZAG }), node("path", { d: "M0 0 H6" }, { stroke: "rgb(255, 0, 0)" })]))).toBe("a second ink");
    expect(whyLive(icon([node("text", {})]))).toBe("holds <text>");
    expect(whyLive({ ...zigzag(), width: 49, height: 49 })).toBe("larger than an icon");
    expect(whyLive({ ...zigzag(), width: 22.5, height: 22.5, ratio: 1 })).toBe("not on whole device pixels");
    expect(whyLive({ ...zigzag(), width: 11.25, height: 11.25, ratio: 2 })).toBe("not on whole device pixels");
    expect(whyLive({ ...zigzag(), width: 22.5, height: 22.5, ratio: 2 })).toBeNull();
  });

  it("leaves what the picture could not be: a gradient's paint, a use, a clip, an animation, a CSS transform, a translucent ink, a place that refuses", () => {
    expect(whyLive(icon([node("path", { d: ZIGZAG }, { stroke: "url(\"#g\")" })]))).toBe("a second ink");
    expect(whyLive(icon([node("use", {})]))).toBe("holds <use>");
    expect(whyLive(icon([node("path", { d: ZIGZAG }, { clipPath: "url(\"#c\")" })]))).toBe("a clip, mask or filter");
    expect(whyLive({ ...zigzag(), animating: true })).toBe("an animation");
    expect(whyLive(icon([node("path", { d: ZIGZAG }, { transform: "matrix(1, 0, 0, 1, 2, 0)" })]))).toBe("a CSS transform");
    expect(whyLive(icon([node("path", { d: ZIGZAG, transform: "translate(2 0)" }, { transform: "matrix(1, 0, 0, 1, 2, 0)" })]))).toBeNull();
    expect(whyLive({ ...zigzag(), color: "rgba(36, 41, 47, 0.5)" })).toBe("a translucent ink");
    expect(whyLive({ ...zigzag(), live: true })).toBe("data-live");
    expect(whyLive({ ...zigzag(), forcedColors: true })).toBe("forced colours");
    expect(whyLive({ ...zigzag(), padding: 2 })).toBe("padding or border");
    expect(whyLive({ ...zigzag(), overflow: "visible" })).toBe("overflow visible");
    expect(whyLive({ ...zigzag(), background: "rgb(255, 255, 255)" })).toBe("a background or mask of its own");
    // (the svg's and a group's own paint is only what their elements inherit: black by default, painting nothing)
    expect(whyLive(icon([node("g", {}, { fill: "rgb(0, 0, 0)" }, [node("path", { d: "M0 0 H6 L3 4 Z" }, { fill: INK, stroke: "none" })])], { root: node("svg", {}, { fill: "rgb(0, 0, 0)", stroke: "none" }, [node("path", { d: "M0 0 H6 L3 4 Z" }, { fill: INK, stroke: "none" })]) }))).toBeNull();
    // (a title says what it is and draws nothing)
    expect(whyLive(icon([node("title", {}), node("path", { d: ZIGZAG })]))).toBeNull();
  });

  it("reads a colour's opacity", () => {
    expect(inkAlpha("rgb(1, 2, 3)")).toBe(1);
    expect(inkAlpha("rgba(1, 2, 3, 1)")).toBe(1);
    expect(inkAlpha("rgba(1, 2, 3, 0.5)")).toBe(0.5);
    expect(inkAlpha("rgba(0, 0, 0, 0)")).toBe(0);
    expect(inkAlpha("oklch(0.3 0.01 250 / 80%)")).toBeCloseTo(0.8);
    expect(inkAlpha("oklch(0.3 0.01 250)")).toBe(1);
    expect(inkAlpha("transparent")).toBe(0);
  });
});

describe("the clean copy", () => {
  it("is the zigzag at its device pixels, each element's computed paint written in, the ink black", () => {
    const paintAttrs = 'stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="4" stroke-dasharray="none" stroke-dashoffset="0" fill-opacity="1" stroke-opacity="1" fill-rule="nonzero"';
    expect(cleanCopy(zigzag())).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="40" height="40" fill="none" ${paintAttrs}>` +
        `<path d="M2 13.5 L6 7.5 L10 13.5 L14 7.5 L18 13.5" fill="none" ${paintAttrs} opacity="1" visibility="visible" display="inline"/></svg>`,
    );
  });

  it("is another for another size, another child, a group's own; and leaves out what draws nothing", () => {
    const one = cleanCopy(zigzag());
    expect(cleanCopy({ ...zigzag(), ratio: 1 })).not.toBe(one);
    expect(cleanCopy(icon([node("path", { d: "M2 13.5 L6 7.5" })]))).not.toBe(one);
    expect(cleanCopy(icon([node("path", { d: ZIGZAG }, { strokeWidth: "2.1px" })]))).not.toBe(one);
    expect(cleanCopy(icon([node("title", {}), node("path", { d: ZIGZAG })]))).toBe(one);
    expect(cleanCopy(icon([node("g", {}, {}, [node("rect", { x: "1", y: "2", width: "3", height: "4", class: "x" })])]))).toContain('<g fill="none"');
    expect(cleanCopy(icon([node("rect", { x: "1", y: "2", width: "3", height: "4" })]))).toContain('<rect x="1" y="2" width="3" height="4"');
    // (no viewBox: the box itself)
    expect(cleanCopy({ ...zigzag(), viewBox: null })).toContain('viewBox="0 0 20 20"');
  });
});
