// Chemistry set up from the first start's card where the plugin that fills the role is here already but not added - its files got, its set-up
// failed or was ended after them: taken up again as Meno next starts, and set up by Try again, that plugin the one set up (found in review).
// The set-up under test is the real one (DEPS' own filledHere, here and offered, the made-up test plugin Sketchkit in place and not added); only
// the network and the files are the test's.
import { beforeEach, describe, expect, it } from "vitest";
import { useNetwork } from "../net/network";
import { DEFAULT_APP_SETTINGS, useAppSettings } from "../settings/appSettings";
import type { Catalogue, CatalogueEntry } from "./catalogue";
import { DEPS, firstSetUpUnderWay, offerFirstSetUp, setUpChemistry, useFirstSetUp, type FirstSetUpDeps } from "./firstSetUp";

const HEX = "a".repeat(64);
// (Sketchkit: the made-up test plugin that fills the role "smiles", in place at 0.3.0 - src/test/plugins/sketchkit)
const SKETCHKIT: CatalogueEntry = {
  id: "sketchkit",
  version: "0.3.0",
  name: "Sketchkit",
  licence: "Apache-2.0",
  contract: 1,
  systems: [],
  roles: ["smiles", "checks"],
  kinds: [],
  reads: [],
  fileKinds: [],
  quotedTables: [],
  source: { url: "https://github.com/example/plugins/releases/download/sketchkit-v0.3.0/sketchkit-0.3.0.tar.gz", sha256: HEX, bytes: 52_000 },
  manifestSha256: HEX,
};
const CATALOGUE: Catalogue = { schema: 1, issued: "2026-11-14T00:00:00Z", plugins: [SKETCHKIT] };

/** The real deps, with the network and the files the test's: what was got and what was added is recorded. */
function here() {
  const calls: string[] = [];
  const d: FirstSetUpDeps = {
    ...DEPS,
    setUpBefore: async () => [],
    allow: async () => true,
    list: async () => ({ catalogue: CATALOGUE }),
    get: async (e) => void calls.push(`get ${e.id}`),
    plan: async () => ({ questions: [], files: 0, uses: [] }),
    add: async (e) => void calls.push(`add ${e.id}`),
  };
  return { d, calls };
}

describe("chemistry set up from the card, where the plugin is here but not added", () => {
  beforeEach(() => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useFirstSetUp.setState({ phase: "none" });
  });

  it("a yes whose set-up did not finish is taken up again as Meno next starts, with the plugin's files in place", async () => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins, firstSetUp: "yes" } });
    const r = here();
    await offerFirstSetUp(r.d);
    await firstSetUpUnderWay();
    expect(r.calls).toContain("add sketchkit");
  });

  it("Try again sets the plugin up, not offers it as none online does", async () => {
    const r = here();
    await setUpChemistry(r.d);
    expect(useFirstSetUp.getState().phase).not.toBe("choose");
    expect(r.calls).toContain("add sketchkit");
  });
});
