// The question in the card's place comes before anything beyond the card is allowed (found in review): what the card's yes covers is what it
// named; a question beyond it is asked before anything beyond is allowed, and a no allows nothing.
import { beforeEach, describe, expect, it } from "vitest";
import { useNetwork, type ConsentRequest } from "../net/network";
import { DEFAULT_APP_SETTINGS, useAppSettings } from "../settings/appSettings";
import { CATALOGUE_PURPOSE, type Catalogue, type CatalogueEntry } from "./catalogue";
import { setUpChemistry, useFirstSetUp, type FirstSetUpDeps, type SetUpPlan } from "./firstSetUp";
import { uvSetUp } from "./setUpSources";

const HEX = "a".repeat(64);
const PURPOSE = "python-env:plugin-chem";
const entry = (over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "chem", version: "1.0.0", name: "chem plugin", licence: "BSD-3-Clause", contract: 1, systems: [], roles: ["smiles", "checks"], kinds: [], reads: [], fileKinds: [],
  quotedTables: [], source: { url: "https://github.com/example/plugins/releases/download/chem-v1.0.0/chem-1.0.0.tar.gz", sha256: HEX, bytes: 52_000 }, manifestSha256: HEX, ...over,
});
const setUp = (lock: string): ConsentRequest => {
  const reach = uvSetUp(lock, []);
  return { purpose: PURPOSE, title: "Download chem plugin?", detail: "uv, fetched the first time it is needed, downloads them - once.", sources: reach.sources, hosts: reach.hosts };
};
const PLAIN: SetUpPlan = { questions: [setUp("rdkit==2024.9.6\nnumpy==2.1.0\n")], files: 0, uses: [] };

function run(over: { planned?: SetUpPlan; offering?: CatalogueEntry[] }) {
  const allowed: string[][] = [];
  const added: string[] = [];
  const catalogue: Catalogue = { schema: 1, issued: "2026-11-14T00:00:00Z", plugins: [entry()] };
  const d: FirstSetUpDeps = {
    setUpBefore: async () => [],
    filledHere: () => false,
    here: () => [],
    allow: async (purposes) => {
      allowed.push([...purposes]);
      return true;
    },
    list: async () => ({ catalogue }),
    offered: () => over.offering ?? catalogue.plugins,
    get: async () => {},
    plan: async () => over.planned ?? PLAIN,
    add: async (e) => void added.push(e.id),
  };
  return { d, allowed, added };
}

describe("the question in the card's place comes before anything beyond the card is allowed", () => {
  beforeEach(() => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useFirstSetUp.setState({ phase: "none" });
  });
  const beyond: [string, Parameters<typeof run>[0]][] = [
    ["a host the card did not name", { planned: { questions: [setUp("somepkg @ https://github.com/maker/somepkg/archive/v1.tar.gz\n")], files: 0, uses: [] } }],
    ["a file beside the packages", { planned: { ...PLAIN, files: 1 } }],
    ["terms", { offering: [entry({ terms: "For academic use only." })] }],
    ["another plugin first", { planned: { ...PLAIN, uses: ["helper plugin"] } }],
  ];
  for (const [what, over] of beyond) {
    it(`${what}: only the list is allowed while it is asked; a no allows nothing more, a yes allows the set-up`, async () => {
      const no = run(over);
      const going = setUpChemistry(no.d);
      await new Promise((ok) => setTimeout(ok, 0));
      const card = useFirstSetUp.getState();
      expect(card.phase).toBe("asking");
      expect(no.allowed).toEqual([[CATALOGUE_PURPOSE]]);
      if (card.phase === "asking") card.answer(false);
      await going;
      expect([no.allowed, no.added]).toEqual([[[CATALOGUE_PURPOSE]], []]);
      // (a yes: the set-up's own purposes allowed, then added)
      useFirstSetUp.setState({ phase: "none" });
      const yes = run(over);
      const again = setUpChemistry(yes.d);
      await new Promise((ok) => setTimeout(ok, 0));
      const asked = useFirstSetUp.getState();
      if (asked.phase === "asking") asked.answer(true);
      await again;
      expect(yes.allowed).toEqual([[CATALOGUE_PURPOSE], [PURPOSE]]);
      expect(yes.added).toEqual(["chem"]);
    });
  }
});
