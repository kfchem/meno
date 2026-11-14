import { beforeEach, describe, expect, it } from "vitest";
import { askToConnect, useNetwork, type ConsentRequest } from "../net/network";
import { DEFAULT_APP_SETTINGS, useAppSettings } from "../settings/appSettings";
import { firstSetUpWait } from "../roles/worker";
import { CATALOGUE_PURPOSE, type Catalogue, type CatalogueEntry } from "./catalogue";
import { beyondCard, CARD_HOSTS, CARD_SOURCES, filledOtherwise, firstSetUpUnderWay, notNow, offerFirstSetUp, setUpChemistry, stopFirstSetUp, useFirstSetUp, type FirstSetUpDeps, type SetUpPlan } from "./firstSetUp";
import { uvSetUp } from "./setUpSources";

const HEX = "a".repeat(64);

const entry = (id: string, over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id,
  version: "1.0.0",
  name: `${id} plugin`,
  licence: "BSD-3-Clause",
  contract: 1,
  systems: [],
  roles: ["smiles", "checks"],
  kinds: [],
  reads: [],
  fileKinds: [],
  quotedTables: [],
  source: { url: `https://github.com/example/plugins/releases/download/${id}-v1.0.0/${id}-1.0.0.tar.gz`, sha256: HEX, bytes: 52_000 },
  manifestSha256: HEX,
  ...over,
});

const CATALOGUE: Catalogue = { schema: 1, issued: "2026-11-14T00:00:00Z", plugins: [entry("chem")] };

/** A plugin's set-up question as lib/pyEnv asks it, its hosts those its lock's set-up reaches (lib/plugins/setUpSources). */
const setUp = (lock: string, purpose = "python-env:plugin-chem"): ConsentRequest => {
  const reach = uvSetUp(lock, []);
  return { purpose, title: "Download chem plugin?", detail: "uv, fetched the first time it is needed, downloads them - once.", sources: reach.sources, hosts: reach.hosts };
};
/** The plugin in use here: its packages from the index only - nothing beyond the card. */
const PLAIN: SetUpPlan = { questions: [setUp("rdkit==2024.9.6\nnumpy==2.1.0\n")], files: 0, uses: [] };

/** What a run did: what was allowed, listed, got, added. */
function deps(over: Partial<FirstSetUpDeps> & { planned?: SetUpPlan; offering?: CatalogueEntry[]; stamps?: string[]; filled?: boolean } = {}) {
  const { planned, offering, stamps, filled, ...steps } = over;
  const allowed: string[][] = [];
  const got: string[] = [];
  const added: string[] = [];
  let listed = 0;
  const d: FirstSetUpDeps = {
    setUpBefore: async () => stamps ?? [],
    filledHere: () => filled ?? false,
    allow: async (purposes) => {
      if (useNetwork.getState().offline) return false;
      allowed.push([...purposes]);
      return true;
    },
    list: async () => {
      listed++;
      return { catalogue: CATALOGUE };
    },
    offered: () => offering ?? CATALOGUE.plugins,
    get: async (e) => void got.push(e.id),
    plan: async () => planned ?? PLAIN,
    add: async (e) => void added.push(e.id),
    ...steps,
  };
  return { d, allowed, got, added, listed: () => listed };
}

const answered = () => useAppSettings.getState().plugins.firstSetUp;

describe("chemistry set up from one card as Meno first starts", () => {
  beforeEach(() => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useFirstSetUp.setState({ phase: "none" });
  });

  it("is offered only where nothing here reads SMILES, nothing was set up here before, it was never answered and Meno is online", async () => {
    await offerFirstSetUp(deps().d);
    expect(useFirstSetUp.getState().phase).toBe("offered");
    for (const r of [deps({ filled: true }), deps({ stamps: ["chem-old"] })]) {
      useFirstSetUp.setState({ phase: "none" });
      await offerFirstSetUp(r.d);
      expect(useFirstSetUp.getState().phase).toBe("none");
    }
    for (const was of ["no", "done"] as const) {
      useFirstSetUp.setState({ phase: "none" });
      useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins, firstSetUp: was } });
      await offerFirstSetUp(deps().d);
      expect(useFirstSetUp.getState().phase).toBe("none");
    }
    // (offline: nothing, and nothing kept - looked at again as Meno next starts)
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useNetwork.setState({ offline: true });
    await offerFirstSetUp(deps().d);
    expect(useFirstSetUp.getState().phase).toBe("none");
    expect(answered()).toBeUndefined();
  });

  it("names before the click every host its yes covers: the list's, uv's and Python's, the index's - one list with the lines", () => {
    expect([...CARD_HOSTS].sort()).toEqual(["files.pythonhosted.org", "github.com", "objects.githubusercontent.com", "pypi.org", "release-assets.githubusercontent.com", "releases.astral.sh"]);
    expect(CARD_SOURCES.join(" ")).toContain("releases.astral.sh");
    expect(CARD_SOURCES.join(" ")).toContain("pypi.org");
  });

  it("one yes: the list, the plugin that fills the role, its set-up taken as asked - no question over the page - and never asked again", async () => {
    const r = deps();
    await setUpChemistry(r.d);
    expect(r.allowed).toEqual([[CATALOGUE_PURPOSE], ["python-env:plugin-chem"]]);
    expect([r.listed(), r.got, r.added]).toEqual([1, ["chem"], ["chem"]]);
    expect(useNetwork.getState().asking).toBeNull();
    expect(useFirstSetUp.getState().phase).toBe("none");
    expect(answered()).toBe("done");
  });

  it("says each step as it goes, naming the plugin with its licence and size once the list has them", async () => {
    const seen: string[] = [];
    const stop = useFirstSetUp.subscribe((s) => {
      if (s.phase === "going") seen.push(`${s.doing}${s.plugin ? ` | ${s.plugin.name} · ${s.plugin.licence} · ${s.plugin.size}` : ""}`);
    });
    await setUpChemistry(deps().d);
    stop();
    expect([...new Set(seen)]).toEqual(["Listing the plugins online", "Getting chem plugin | chem plugin · BSD-3-Clause · 51 KB", "Setting up chem plugin | chem plugin · BSD-3-Clause · 51 KB"]);
  });

  it("stops on what the card did not name - a host, a file beside, terms, another plugin first - and asks it in its place: never taken as answered", async () => {
    const outside: SetUpPlan = { questions: [setUp("somepkg @ https://github.com/maker/somepkg/archive/v1.tar.gz\n")], files: 0, uses: [] };
    const cases: [string, Parameters<typeof deps>[0], string][] = [
      ["a host", { planned: outside }, "codeload.github.com"],
      ["a file beside", { planned: { ...PLAIN, files: 1 } }, "a file besides its packages"],
      ["terms", { offering: [entry("chem", { terms: "For academic use only." })] }, "For academic use only."],
      ["another plugin", { planned: { ...PLAIN, uses: ["helper plugin"] } }, "It uses helper plugin"],
    ];
    for (const [what, over, says] of cases) {
      useFirstSetUp.setState({ phase: "none" });
      useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
      const r = deps(over);
      const going = setUpChemistry(r.d);
      await new Promise((ok) => setTimeout(ok, 0));
      const card = useFirstSetUp.getState();
      expect([what, card.phase]).toEqual([what, "asking"]);
      if (card.phase !== "asking") continue;
      expect(card.question.detail).toContain(says);
      // (nothing set up until it is answered; a no sets up nothing, and is kept)
      expect(r.added).toEqual([]);
      card.answer(false);
      await going;
      expect([what, r.added, answered()]).toEqual([what, [], "no"]);
    }
    // (a yes to the question in its place: set up)
    const r = deps({ planned: outside });
    const going = setUpChemistry(r.d);
    await new Promise((ok) => setTimeout(ok, 0));
    const card = useFirstSetUp.getState();
    if (card.phase === "asking") card.answer(true);
    await going;
    expect(r.added).toEqual(["chem"]);
  });

  it("asks nothing beyond the card for a plugin whose set-up reaches only uv, Python and the index", () => {
    expect(beyondCard(entry("chem"), PLAIN)).toBeNull();
    expect(beyondCard(entry("chem"), { ...PLAIN, questions: [setUp("x @ https://example.org/x.whl\n")] })?.detail).toContain("example.org");
  });

  it("offers each to add, or why not, where the list has no one plugin for the role here", async () => {
    for (const offered of [[], [entry("chem"), entry("other")]]) {
      useFirstSetUp.setState({ phase: "none" });
      const r = deps({ offering: offered });
      await setUpChemistry(r.d);
      expect(useFirstSetUp.getState().phase).toBe("choose");
      expect(r.got).toEqual([]);
    }
    // (one added from it - the chemist's own click: the card goes)
    filledOtherwise();
    expect(useFirstSetUp.getState().phase).toBe("none");
    expect(answered()).toBe("done");
  });

  it("says why it failed, with Try again; a yes not finished is taken up again as Meno next starts, with no question", async () => {
    const r = deps({ list: async () => ({ problem: "The plugins online could not be listed: no route to host." }) });
    await setUpChemistry(r.d);
    expect(useFirstSetUp.getState()).toEqual({ phase: "failed", why: "The plugins online could not be listed: no route to host." });
    expect(answered()).toBe("yes");
    const again = deps();
    useFirstSetUp.setState({ phase: "none" });
    await offerFirstSetUp(again.d);
    await firstSetUpUnderWay();
    expect(again.added).toEqual(["chem"]);
    expect(answered()).toBe("done");
  });

  it("Not now: gone, never asked again of itself; Stop: nothing more done after the step under way", async () => {
    useFirstSetUp.setState({ phase: "offered" });
    notNow();
    expect([useFirstSetUp.getState().phase, answered()]).toEqual(["none", "no"]);
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    let release = () => {};
    const r = deps({ get: (e) => new Promise((ok) => (release = () => ok(void r.got.push(e.id)))) });
    const going = setUpChemistry(r.d);
    await new Promise((ok) => setTimeout(ok, 0));
    stopFirstSetUp();
    expect(useFirstSetUp.getState()).toMatchObject({ phase: "going", stopping: true });
    release();
    await going;
    expect([r.got, r.added, useFirstSetUp.getState().phase, answered()]).toEqual([["chem"], [], "none", "no"]);
  });

  it("holds up nothing: a question the chemist's own click asks meanwhile is asked over the page as ever", async () => {
    useFirstSetUp.setState({ phase: "offered" });
    const asked = askToConnect({ purpose: "app-update", title: "Keep Meno up to date?", detail: "", sources: [], hosts: [] });
    await new Promise((ok) => setTimeout(ok, 0));
    expect(useNetwork.getState().asking?.purpose).toBe("app-update");
    useNetwork.getState().asking!.answer(false);
    expect(await asked).toBe(false);
  });

  it("is what a role asked of meanwhile waits for, while it is under way", async () => {
    let release: (() => void) | null = null;
    const r = deps({ get: () => new Promise((ok) => (release = () => ok())) });
    const going = setUpChemistry(r.d);
    expect(firstSetUpWait.now()).toBe(going);
    while (!release) await new Promise((ok) => setTimeout(ok, 0));
    (release as () => void)();
    await going;
    expect(firstSetUpWait.now()).toBeNull();
  });
});
