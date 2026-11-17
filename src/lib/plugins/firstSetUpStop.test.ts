// Stop on the first start's card (found in review): nothing more is done after the step under way, and it is never taken up again.
import { beforeEach, describe, expect, it } from "vitest";
import { useNetwork } from "../net/network";
import { DEFAULT_APP_SETTINGS, useAppSettings } from "../settings/appSettings";
import type { Catalogue, CatalogueEntry } from "./catalogue";
import { filledOtherwise, setUpChemistry, stopFirstSetUp, useFirstSetUp, type FirstSetUpDeps } from "./firstSetUp";

const HEX = "a".repeat(64);
const ENTRY: CatalogueEntry = {
  id: "chem", version: "1.0.0", name: "chem plugin", licence: "BSD-3-Clause", contract: 1, systems: [], roles: ["smiles", "checks"], kinds: [], reads: [], fileKinds: [],
  quotedTables: [], source: { url: "https://github.com/example/plugins/releases/download/chem-v1.0.0/chem-1.0.0.tar.gz", sha256: HEX, bytes: 52_000 }, manifestSha256: HEX,
};
const CATALOGUE: Catalogue = { schema: 1, issued: "2026-11-14T00:00:00Z", plugins: [ENTRY] };
const answered = () => useAppSettings.getState().plugins.firstSetUp;

describe("Stop pressed, and a plugin added meanwhile", () => {
  beforeEach(() => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useFirstSetUp.setState({ phase: "none" });
  });

  it("Stop while the list is being fetched: the list is let come, and nothing more is got or set up", async () => {
    const got: string[] = [];
    const added: string[] = [];
    let release = () => {};
    const d: FirstSetUpDeps = {
      setUpBefore: async () => [],
      filledHere: () => false,
      here: () => [],
      allow: async () => true,
      list: () => new Promise((ok) => (release = () => ok({ catalogue: CATALOGUE }))),
      offered: () => CATALOGUE.plugins,
      get: async (e) => void got.push(e.id),
      plan: async () => ({ questions: [], files: 0, uses: [] }),
      add: async (e) => void added.push(e.id),
    };
    const going = setUpChemistry(d);
    await new Promise((ok) => setTimeout(ok, 0));
    stopFirstSetUp();
    release();
    await going;
    expect([got, added, useFirstSetUp.getState().phase, answered()]).toEqual([[], [], "none", "no"]);
  });

  it("a plugin that fills the role added meanwhile takes the card that still only asks away, and it is not asked again", () => {
    useFirstSetUp.setState({ phase: "offered" });
    filledOtherwise();
    expect([useFirstSetUp.getState().phase, answered()]).toEqual(["none", "done"]);
  });
});
