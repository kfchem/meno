import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MOST_CONFORMERS, RING_CONFORMERS, soughtOptions, WITHIN_GUIDE } from "../../../lib/chem/conformersSought";
import type { ChemistrySettings } from "../../../lib/settings/appSettings";
import { OwnValues } from "./CalculationSettings";
import { soughtChosen, soughtValues } from "./ChemistrySettings";

// Settings, Chemistry, 3D: how many conformers the page's 3D structure tries - as many as the molecule needs asked in
// rounds, where its search takes draws (lib/chem/conformersSought, chem/conformerRounds).

const plain: ChemistrySettings = { valenceWarnings: true };

describe("conformers sought on the page, in Settings", () => {
  it("shows a search in rounds' own values where its search takes draws - its window empty until the chemist gives one", () => {
    expect(soughtValues(plain, false)).toEqual({ sought: "needed", count: RING_CONFORMERS });
    const values = soughtValues(plain, true);
    expect(Number.isNaN(values.within)).toBe(true);
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

  it("shows the window's guide, and Clear where the chemist has given one, set in as Settings' rows are here", () => {
    const options = soughtOptions("needed", RING_CONFORMERS, {});
    const given = renderToString(OwnValues({ options, own: { within: 2.5 }, keep: () => {}, indent: false }));
    // (as written into the page: its apostrophes as entities)
    expect(given).toContain(WITHIN_GUIDE.replaceAll("'", "&#x27;"));
    expect(given).toMatch(/>Clear<\/button>/);
    expect(given).toContain("pl-3");
    expect(renderToString(OwnValues({ options, own: { within: Number.NaN }, keep: () => {}, indent: false }))).not.toMatch(/>Clear<\/button>/);
  });
});
