import { describe, expect, it } from "vitest";
import {
  ACS_1996,
  DEFAULT_STYLE_CHOICE,
  pt,
  ofBond,
  presetById,
  STYLE_PRESETS,
  layoutOptionsFor,
  styleOf,
  type DrawingStyle,
} from "./style";
import {
  acceptDrawingStyle,
  acceptStyleChoice,
  acceptValue,
  automaticValue,
  isTypefaceName,
  STYLE_FIELDS,
  STYLE_GROUPS,
  withSetting,
} from "./styleFields";

/** Every setting a style has, the ones that may be left unset among them. */
const EVERY_SETTING: (keyof DrawingStyle)[] = [
  ...(Object.keys(ACS_1996) as (keyof DrawingStyle)[]),
  "tripleGap",
  "wedgeBroadEnd",
  "shortHashes",
  "hashedWedgeEnd",
  "hashStartOffset",
  "labelBaseline",
  "reactionArrowThickness",
];

describe("the settings list", () => {
  it("has every setting once, and nothing that is not one", () => {
    const keys = STYLE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...new Set(EVERY_SETTING)].sort());
  });

  it("gives every setting a name, a description and a group, each name its own", () => {
    const labels = STYLE_FIELDS.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const f of STYLE_FIELDS) {
      expect(f.label.length).toBeGreaterThan(3);
      expect(f.description).toMatch(/\.$/);
      expect(STYLE_GROUPS).toContain(f.group);
    }
  });

  it("offers Automatic for exactly the settings that may be left unset", () => {
    const optional = STYLE_FIELDS.filter((f) => f.automatic).map((f) => f.key);
    expect(optional.sort()).toEqual([
      "hashStartOffset",
      "labelBaseline",
      "reactionArrowThickness",
      "tripleGap",
      "wedgeBroadEnd",
    ]);
    expect(automaticValue("tripleGap", ACS_1996)).toEqual(ACS_1996.doubleGap);
    expect(automaticValue("hashStartOffset", ACS_1996)).toEqual(ACS_1996.hashInterval);
    expect(automaticValue("reactionArrowThickness", ACS_1996)).toEqual(ACS_1996.lineThickness);
    expect(automaticValue("wedgeBroadEnd", ACS_1996)).toEqual(pt(3));
    // by the typeface's own capitals
    expect(automaticValue("labelBaseline", ACS_1996)).toBeCloseTo(0.4, 12);
    expect(automaticValue("labelBaseline", presetById("meno").style)).toBeCloseTo(0.391, 3);
  });

  it("takes every preset's own values as they are", () => {
    for (const { style } of STYLE_PRESETS) {
      for (const f of STYLE_FIELDS) {
        const v = style[f.key];
        if (v === undefined) continue;
        expect(acceptValue(f, v, style.bondLengthPt), `${f.key}`).toEqual(v);
      }
    }
  });
});

describe("reading a style choice back", () => {
  it("keeps what it can take and drops what it cannot", () => {
    const choice = acceptStyleChoice({
      preset: "rsc",
      changes: {
        lineThickness: pt(0.8),
        doubleGap: ofBond(0.2),
        bondColor: "#1F4E79",
        ends: "round",
        fontFamily: "  Hiragino Sans ",
        labelColor: "red",
        hashInterval: { value: "2", unit: "pt" },
        waveAmplitude: { value: 1, unit: "mm" },
        notASetting: 3,
      },
    });
    expect(choice).toEqual({
      preset: "rsc",
      changes: {
        lineThickness: pt(0.8),
        doubleGap: ofBond(0.2),
        bondColor: "#1f4e79",
        ends: "round",
        fontFamily: "Hiragino Sans",
      },
    });
    // not a font's name
    for (const bad of ["", "   ", "a\nb", "x".repeat(121), 3]) {
      expect(acceptStyleChoice({ preset: "meno", changes: { fontFamily: bad } }).changes).toEqual({});
    }
  });

  it("takes a typeface's name in any script, and nothing a name is not made of", () => {
    for (const name of ["Hiragino Sans", "\u30d2\u30e9\u30ae\u30ce\u89d2\u30b4\u30b7\u30c3\u30af" /* a Japanese font name */, "M+ 1p", "Bodoni 72 Oldstyle", "O'Neil Sans", "Font_Name-2.0", "Arial & Helvetica"]) {
      expect(isTypefaceName(name)).toBe(true);
      expect(acceptStyleChoice({ preset: "meno", changes: { fontFamily: name } }).changes).toEqual({ fontFamily: name });
    }
    // what would close the attribute or the tag a name is written into, or end a font's rule
    const hostile = ['Bad"Name', 'x"/><script>alert(1)</script><text x="', "A<B", "A>B", "Arial; color: red", "Font\\Name", "Arial, Helvetica", "a\tb", "a\x00b", "a\u{FFFE}b"];
    for (const bad of hostile) {
      expect(isTypefaceName(bad)).toBe(false);
      expect(acceptStyleChoice({ preset: "meno", changes: { fontFamily: bad } }).changes).toEqual({});
    }
  });

  it("brings a number into range, a share of the bond by the bond it is a share of", () => {
    const choice = acceptStyleChoice({
      preset: "acs1996",
      changes: {
        bondLengthPt: 20,
        lineThickness: pt(50),
        // at most 8 pt, which is 40% of a 20 pt bond
        doubleGap: ofBond(0.9),
        doubleCrowdingAngle: -5,
      },
    });
    expect(choice.changes.lineThickness).toEqual(pt(3));
    expect(choice.changes.doubleGap?.value).toBeCloseTo(0.4, 12);
    expect(choice.changes.doubleCrowdingAngle).toBe(0);
  });

  it("falls back to the default for anything that is not a choice", () => {
    expect(acceptStyleChoice(undefined)).toBe(DEFAULT_STYLE_CHOICE);
    expect(acceptStyleChoice({ preset: "nope", changes: {} })).toBe(DEFAULT_STYLE_CHOICE);
    expect(acceptStyleChoice({ preset: "wiley" })).toEqual({ preset: "wiley", changes: {} });
  });
});

describe("changing one setting", () => {
  it("records a change, and drops it again once it is the preset's own value", () => {
    const acs = { preset: "acs1996", changes: {} };
    const changed = withSetting(acs, "ends", "round");
    expect(changed.changes).toEqual({ ends: "round" });
    expect(withSetting(changed, "ends", "square").changes).toEqual({});
    // Meno's own has round ends already
    expect(withSetting(DEFAULT_STYLE_CHOICE, "ends", "round").changes).toEqual({});
    // a length in another unit is a change, even if it comes to the same
    expect(withSetting(DEFAULT_STYLE_CHOICE, "lineThickness", ofBond(0.6 / 14.4)).changes)
      .toHaveProperty("lineThickness");
    // left unset: automatic again
    const own = withSetting(DEFAULT_STYLE_CHOICE, "tripleGap", pt(3));
    expect(withSetting(own, "tripleGap", undefined).changes).toEqual({});
  });
});

describe("the shortest hashed bond, a style's own setting", () => {
  it("is three hashes at least in Meno's own style, and at the spacing in every journal's - as their specifications have it", () => {
    const fewest = Object.fromEntries(STYLE_PRESETS.map((p) => [p.id, layoutOptionsFor(p.style, 1).fewestHashes]));
    expect(fewest).toEqual({ meno: 3, acs1996: undefined, rsc: undefined, wiley: undefined, nature: undefined });
    expect(automaticValue("shortHashes", ACS_1996)).toBe("spaced");
  });

  it("is kept through a save and an open, and a change of it with the style it is made from", () => {
    const acs = { preset: "acs1996", changes: {} };
    const asked = withSetting(acs, "shortHashes", "three");
    const read = acceptStyleChoice(JSON.parse(JSON.stringify(asked)));
    expect(read).toEqual(asked);
    expect(styleOf(read).shortHashes).toBe("three");
    // (a workspace in Meno's style saved before the setting: Meno's, three; a journal's: at the spacing)
    expect(styleOf(acceptStyleChoice({ preset: "meno", changes: {} })).shortHashes).toBe("three");
    expect(styleOf(acceptStyleChoice({ preset: "rsc", changes: {} })).shortHashes).toBeUndefined();
    // (and an own style saved before it, at the spacing it was drawn at then - not Meno's)
    expect(acceptDrawingStyle({ ...presetById("rsc").style }).shortHashes).toBeUndefined();
    expect(acceptDrawingStyle({ ...presetById("meno").style }).shortHashes).toBe("three");
    expect(acceptValue(STYLE_FIELDS.find((f) => f.key === "shortHashes")!, "sometimes", 14.4)).toBeUndefined();
  });
});

describe("a hashed wedge's widest hash, a style's own setting", () => {
  it("reaches the atom in every style as it was, and stops short where asked - kept through a save and an open", () => {
    const short = Object.fromEntries(STYLE_PRESETS.map((p) => [p.id, layoutOptionsFor(p.style, 1).hashedWedgeShort]));
    expect(short).toEqual({ meno: undefined, acs1996: undefined, rsc: undefined, wiley: undefined, nature: undefined });
    expect(automaticValue("hashedWedgeEnd", ACS_1996)).toBe("atom");
    const asked = withSetting({ preset: "meno", changes: {} }, "hashedWedgeEnd", "short");
    const read = acceptStyleChoice(JSON.parse(JSON.stringify(asked)));
    expect(read).toEqual(asked);
    expect(layoutOptionsFor(styleOf(read), 1).hashedWedgeShort).toBe(true);
  });
});
