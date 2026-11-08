import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { notedParts, shownOptions } from "../../../lib/options";
import { MOST_CONFORMERS, pageWithinGuide, RING_CONFORMERS, soughtOptions, WITHIN_GUIDE } from "../../../lib/chem/conformersSought";
import { WITHIN_3D, type ChemistrySettings } from "../../../lib/settings/appSettings";
import type { ReactElement } from "react";
import { clearOf } from "./CalculationSettings";
import { pageSoughtOptions, soughtChosen, soughtValues } from "./soughtSettings";

// Settings, Chemistry, 3D: how many conformers the page's 3D structure tries - as many as the molecule needs asked in
// rounds, where its search takes draws (lib/chem/conformersSought, chem/conformerRounds).

const plain: ChemistrySettings = { valenceWarnings: true };

describe("conformers sought on the page, in Settings", () => {
  it("shows the page's window for new conformers as Meno's, 30 kcal/mol until the chemist gives one, saying so - a step's still asks for its own", () => {
    const within = (options: { id: string; note?: string; default?: unknown }[]) => options.find((o) => o.id === "within");
    expect(WITHIN_3D).toBe(30);
    expect(within(pageSoughtOptions(true))).toMatchObject({ default: 30, note: pageWithinGuide(30) });
    expect(pageWithinGuide(30)).toMatch(/^Meno's is 30\u00a0kcal\/mol; yours to change\. A round that brings no new conformer within this of the lowest is the last\. As a guide/);
    expect(soughtValues(plain, true).within).toBe(30);
    // (Meno's own not kept as the chemist's; another is)
    expect(soughtChosen(plain, { ...soughtValues(plain, true), within: 30 })).toEqual(plain);
    expect(soughtChosen(plain, { ...soughtValues(plain, true), within: 2.5 })).toMatchObject({ within3d: 2.5 });
    // (a step's: none, asking for its own, as before)
    expect(within(soughtOptions("needed", RING_CONFORMERS, {}))).toMatchObject({ note: WITHIN_GUIDE });
    expect(Number.isNaN(within(soughtOptions("needed", RING_CONFORMERS, {}))!.default)).toBe(true);
    expect(within(pageSoughtOptions(false))).toBeUndefined();
  });

  it("shows a search in rounds' own values where its search takes draws - its window Meno's until the chemist gives one", () => {
    expect(soughtValues(plain, false)).toEqual({ sought: "needed", count: RING_CONFORMERS });
    const values = soughtValues(plain, true);
    expect(values.within).toBe(WITHIN_3D);
    expect([values.first, values.most]).toEqual([0, MOST_CONFORMERS]);
    expect(soughtValues({ ...plain, within3d: 2.5, first3d: 120, most3d: 1000 }, true)).toMatchObject({ within: 2.5, first: 120, most: 1000 });
  });

  it("keeps what the chemist chose, each kept to what it may be - and none that is Meno's own default, nor a window that is none", () => {
    const base = soughtValues(plain, true);
    expect(soughtChosen(plain, base)).toEqual(plain);
    expect(soughtChosen(plain, { ...base, within: 2.5, first: 120.4, most: 9000 })).toEqual({ ...plain, within3d: 2.5, first3d: 120 });
    expect(soughtChosen(plain, { ...base, within: 0, most: 1000 })).toEqual({ ...plain, within3d: 0, most3d: 1000 });
    // (a window below 0, or none: none - Clear's)
    for (const within of [-1, Number.NaN]) expect(soughtChosen({ ...plain, within3d: 2 }, { ...base, within })).toEqual(plain);
    expect(soughtChosen(plain, { ...base, sought: "fixed", count: 40 })).toEqual({ ...plain, sought3d: "fixed", count3d: 40 });
  });

  it("shows each note right under its own row - the window's guide, and what a first round of 0 is - and Clear just before the window's field where the chemist has given one", () => {
    const options = soughtOptions("needed", RING_CONFORMERS, {});
    // (as many as the molecule needs: the choice and the window, its guide under it; the first round, its note under it; the most)
    const parts = notedParts(shownOptions(options, soughtValues(plain, true)));
    expect(parts.map((p) => p.map((o) => o.id))).toEqual([["sought", "within"], ["first"], ["most"]]);
    expect(parts[0][1].note).toBe(WITHIN_GUIDE);
    expect(parts[1][0].note).toMatch(/^0: the molecule's own count/);
    // (this many: the choice and its number, nothing under them)
    expect(notedParts(shownOptions(options, { ...soughtValues(plain, true), sought: "fixed" })).map((p) => p.map((o) => o.id))).toEqual([["sought", "count"]]);
    const within = options.find((o) => o.id === "within")!;
    let kept: unknown = null;
    const clear = clearOf(within, { within: 2.5 }, () => (kept = "cleared")) as ReactElement<{ onClick: () => void }>;
    expect(renderToString(clear)).toMatch(/>Clear<\/button>/);
    clear.props.onClick();
    expect(kept).toBe("cleared");
    expect(clearOf(within, { within: Number.NaN }, () => {})).toBeNull();
  });
});
