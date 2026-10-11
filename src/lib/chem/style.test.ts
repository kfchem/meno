import { describe, expect, it } from "vitest";
import { IBM_PLEX_SANS } from "./fonts/ibmPlexSans";
import { automaticBaseline } from "./layout2d";
import {
  ACS_1996,
  bondFraction,
  inPoints,
  layoutOptionsFor,
  wedgeBroadEndOf,
  ofBond,
  pt,
  DEFAULT_STYLE_CHOICE,
  presetById,
  resolveStyle,
  STYLE_PRESETS,
} from "./style";

describe("drawing style", () => {
  it("has ACS 1996 to the letter", () => {
    expect(ACS_1996.bondLengthPt).toBe(14.4);
    expect(ACS_1996.lineThickness).toEqual(pt(0.6));
    expect(ACS_1996.boldThickness).toEqual(pt(2.0));
    expect(ACS_1996.doubleGap).toEqual(ofBond(0.18));
    expect(ACS_1996.hashInterval).toEqual(pt(2.5));
    expect(ACS_1996.fontSize).toEqual(pt(10));
    expect(ACS_1996.ends).toBe("square");
  });

  it("takes a length in points or as a fraction of the bond, alike", () => {
    // 0.6 pt of a 14.4 pt bond is the same line as 1/24 of the bond
    expect(bondFraction(pt(0.6), ACS_1996)).toBeCloseTo(1 / 24, 12);
    expect(bondFraction(ofBond(1 / 24), ACS_1996)).toBeCloseTo(1 / 24, 12);
    expect(inPoints(ofBond(0.18), ACS_1996)).toBeCloseTo(2.592, 12);
    expect(inPoints(pt(2.5), ACS_1996)).toBe(2.5);
  });

  it("keeps a length in points fixed when the bond length changes, and a fraction in step", () => {
    const longer = resolveStyle(ACS_1996, { bondLengthPt: 28.8 });
    expect(inPoints(longer.lineThickness, longer)).toBe(0.6);
    expect(bondFraction(longer.lineThickness, longer)).toBeCloseTo(1 / 48, 12);
    expect(inPoints(longer.doubleGap, longer)).toBeCloseTo(5.184, 12);
  });

  it("keeps a wedge one and a half bold widths across, unless told otherwise", () => {
    expect(inPoints(wedgeBroadEndOf(ACS_1996), ACS_1996)).toBeCloseTo(3.0, 12);
    const bolder = resolveStyle(ACS_1996, { boldThickness: pt(3) });
    expect(inPoints(wedgeBroadEndOf(bolder), bolder)).toBeCloseTo(4.5, 12);
    const set = resolveStyle(ACS_1996, { wedgeBroadEnd: ofBond(0.25) });
    expect(wedgeBroadEndOf(set)).toEqual(ofBond(0.25));
  });

  it("lays styles over one another, the last on top, skipping what a layer leaves unset", () => {
    const doc = { lineThickness: pt(1) };
    const bond = { lineThickness: undefined, ends: "square" as const };
    const s = resolveStyle(ACS_1996, doc, undefined, bond);
    expect(s.lineThickness).toEqual(pt(1));
    expect(s.ends).toBe("square");
    expect(s.boldThickness).toEqual(ACS_1996.boldThickness);
  });

  it("draws with the style's sizes, at the bond length it is given", () => {
    const L = 1.8;
    const o = layoutOptionsFor(ACS_1996, L);
    expect(o.lineWidthPx).toBeCloseTo((0.6 / 14.4) * L, 12);
    // a wedge's broad end is one and a half bold widths: 3.0 pt
    expect(o.wedgeWidthPx).toBeCloseTo((3.0 / 14.4) * L, 12);
    expect(o.doubleOffsetPx).toBeCloseTo(0.18 * L, 12);
    // a triple bond's outer lines are one bond spacing out, like a double's
    expect(o.tripleOffsetPx).toBe(o.doubleOffsetPx);
    expect(o.fontPx).toBeCloseTo((10 / 14.4) * L, 12);
    expect(o.labelMarginPx).toBeCloseTo((1.6 / 14.4) * L, 12);
    // a wavy bond's turns are half circles: the amplitude a quarter period
    expect(o.wavyPeriodPx).toBeCloseTo((3.76 / 14.4) * L, 12);
    expect(o.wavyAmpPx).toBeCloseTo(o.wavyPeriodPx / 4, 12);
    expect(o.joinStyle).toBe("sharp");
    expect(layoutOptionsFor({ ...ACS_1996, ends: "round" }, L).joinStyle).toBe("round");
    expect(o.hashSpacingPx).toBeCloseTo((2.5 / 14.4) * L, 12);
  });
});

describe("style presets", () => {
  it("offers Meno's own, ACS 1996, RSC, Wiley and Nature, each by its own numbers", () => {
    expect(STYLE_PRESETS.map((p) => p.id)).toEqual(["meno", "acs1996", "rsc", "wiley", "nature"]);
    const rsc = presetById("rsc").style;
    expect(rsc.bondLengthPt).toBe(12.2);
    expect(rsc.lineThickness).toEqual(pt(0.45));
    expect(rsc.boldThickness).toEqual(pt(1.6));
    expect(rsc.hashInterval).toEqual(pt(1.75));
    expect(rsc.labelClearance).toEqual(pt(1.25));
    expect(rsc.doubleGap).toEqual(ofBond(0.2));
    expect(rsc.fontFamily).toBe("Helvetica");
    expect(rsc.fontSize).toEqual(pt(7));
    const nature = presetById("nature").style;
    // 0.381 cm bonds, 0.021 cm lines, 6 pt Arial
    expect(nature.bondLengthPt).toBeCloseTo(10.8, 1);
    expect(inPoints(nature.lineThickness, nature)).toBeCloseTo(0.595, 3);
    expect(nature.fontSize).toEqual(pt(6));
    const wiley = presetById("wiley").style;
    // 0.6 cm bonds, 0.026 cm lines, 0.092 cm bold bonds and hashes, 12 pt Arial kept 0.071 cm clear
    const inCm = (l: Parameters<typeof inPoints>[0]) => (inPoints(l, wiley) / 72) * 2.54;
    expect((wiley.bondLengthPt / 72) * 2.54).toBeCloseTo(0.6, 9);
    expect(inCm(wiley.lineThickness)).toBeCloseTo(0.026, 9);
    expect(inCm(wiley.boldThickness)).toBeCloseTo(0.092, 9);
    expect(inCm(wiley.hashInterval)).toBeCloseTo(0.092, 9);
    expect(inCm(wiley.labelClearance)).toBeCloseTo(0.071, 9);
    expect(wiley.doubleGap).toEqual(ofBond(0.18));
    expect([wiley.fontFamily, wiley.fontSize]).toEqual(["Arial", pt(12)]);
    expect(presetById("nonsense")).toBe(STYLE_PRESETS[0]);
  });

  it("makes Meno's own ACS 1996 with round ends in IBM Plex Sans, R and S written bare, in the palette's black", () => {
    const { style } = presetById("meno");
    expect(DEFAULT_STYLE_CHOICE.preset).toBe("meno");
    const { ends, fontFamily, stereoDescriptors, stereoDescriptorGap, bondColor, labelColor, ...rest } = style;
    const { ends: e, fontFamily: f, stereoDescriptors: d, stereoDescriptorGap: g, bondColor: b, labelColor: l, ...acs } = ACS_1996;
    expect(rest).toEqual(acs);
    expect([ends, fontFamily, stereoDescriptors, stereoDescriptorGap, bondColor, labelColor]).toEqual(["round", "IBM Plex Sans", "plain", 0.15, "#141414", "#141414"]);
    expect([e, f, d, g, b, l]).toEqual(["square", "Arial", "parentheses", 0.35, "#000000", "#000000"]);
    // the baseline follows the typeface
    expect(style.labelBaseline).toBeUndefined();
  });

  it("writes R and S bare, as IUPAC's recommendations for diagrams do, but for ACS 1996's parentheses", () => {
    const written = Object.fromEntries(STYLE_PRESETS.map((p) => [p.id, p.style.stereoDescriptors]));
    expect(written).toEqual({ meno: "plain", acs1996: "parentheses", rsc: "plain", wiley: "plain", nature: "plain" });
    // (bare, they stand nearer their atoms; in parentheses, half a capital's height off, as IUPAC's do)
    const gaps = Object.fromEntries(STYLE_PRESETS.map((p) => [p.id, p.style.stereoDescriptorGap]));
    expect(gaps).toEqual({ meno: 0.15, acs1996: 0.35, rsc: 0.15, wiley: 0.15, nature: 0.15 });
  });

  it("sets a capital on its atom as ACS 1996 sets Arial's, whatever the typeface", () => {
    // 0.4 em in Arial, as ACS 1996 has it
    expect(automaticBaseline(1467 / 2048)).toBeCloseTo(0.4, 12);
    // Plex's capitals are a little shorter, so its baseline rises with them
    const plex = automaticBaseline(IBM_PLEX_SANS.capHeight / 1000);
    expect(plex).toBeCloseTo(0.391, 3);
    // the middle of a capital the same distance below the atom in both
    expect(plex - 0.698 / 2).toBeCloseTo(0.4 - 1467 / 2048 / 2, 12);
  });

  it("keeps ACS 1996's proportions for what a journal style does not state", () => {
    // a wavy bond's turns are the same fraction of the bond in RSC's style
    const rsc = presetById("rsc").style;
    expect(bondFraction(rsc.wavelength, rsc)).toBeCloseTo(
      bondFraction(ACS_1996.wavelength, ACS_1996),
      12,
    );
  });

  it("hands every setting on to the layout", () => {
    const style = {
      ...ACS_1996,
      bondColor: "#123456",
      labelColor: "#654321",
      fontFamily: "Helvetica",
      labelBaseline: 0.3,
      subscriptSize: 0.6,
      subscriptDrop: 0.2,
      stackedLineSpacing: 1.1,
      hydrogenVerticalBand: 5,
      symbolCentringAngle: 15,
      labelShareMax: 0.8,
      doubleSideThreshold: 0.1,
      doubleCrowdingAngle: 30,
      innerLineMaxShortening: 0.3,
      centredJoinMinAngle: 25,
      wedgeCutMaxAngle: 170,
      wedgeCornerReach: 0.4,
      aromaticCircleSize: 0.6,
      tripleGap: ofBond(0.12),
      hashStartOffset: pt(1),
    };
    const o = layoutOptionsFor(style, 1.8);
    expect(o.bondColor).toBe("#123456");
    expect(o.labelColor).toBe("#654321");
    expect(o.fontFamily).toBe("Helvetica");
    expect(o.labelSet).toEqual({
      baseline: 0.3,
      subscriptSize: 0.6,
      subscriptDrop: 0.2,
      stackSpacing: 1.1,
      fontFamily: "Helvetica",
    });
    expect(o.hydrogenBandDeg).toBe(5);
    expect(o.symbolCentringDeg).toBe(15);
    expect(o.labelShareMax).toBe(0.8);
    expect(o.doubleSideThreshold).toBe(0.1);
    expect(o.doubleCrowdingDeg).toBe(30);
    expect(o.innerLineMaxShortening).toBe(0.3);
    expect(o.centredJoinMinDeg).toBe(25);
    expect(o.wedgeCutMaxDeg).toBe(170);
    expect(o.wedgeCornerReach).toBe(0.4);
    expect(o.aromaticCircleSize).toBe(0.6);
    expect(o.tripleOffsetPx).toBeCloseTo(0.12 * 1.8, 12);
    expect(o.hashFirstGapPx).toBeCloseTo((1 / 14.4) * 1.8, 12);
  });
});
