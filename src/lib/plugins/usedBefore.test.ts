import { beforeEach, describe, expect, it } from "vitest";
import { useNetwork, type ConsentRequest } from "../net/network";
import { DEFAULT_APP_SETTINGS, useAppSettings } from "../settings/appSettings";
import { CATALOGUE_HOSTS, CATALOGUE_PURPOSE, type Catalogue, type CatalogueEntry } from "./catalogue";
import { MANIFESTS } from "./known";
import { useOnline } from "./online";
import { getUsedBefore, type UsedBeforeDeps } from "./usedBefore";

const HEX = "a".repeat(64);

const entry = (id: string, name: string, bytes: number, over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id,
  version: "1.0.0",
  name,
  licence: "Apache-2.0",
  contract: 1,
  systems: [],
  roles: [],
  kinds: [],
  reads: [],
  source: { url: `https://github.com/example/plugins/releases/download/${id}-v1.0.0/${id}-1.0.0.tar.gz`, sha256: HEX, bytes },
  manifestSha256: HEX,
  ...over,
});

const CATALOGUE: Catalogue = {
  schema: 1,
  issued: "2026-11-10T00:00:00Z",
  serial: 3,
  plugins: [entry("alpha", "Alpha interface", 40_000), entry("beta", "Beta interface", 2_500_000), entry("gamma", "Gamma interface", 9_000), entry("later", "Later", 1, { contract: 99 })],
};

/** What a run did: the questions asked, whether the list was fetched, the plugins got, what was said. */
function deps(over: Partial<UsedBeforeDeps> & { stamps?: string[]; yes?: boolean[]; listed?: Catalogue | null; fails?: string[] } = {}) {
  const asked: ConsentRequest[] = [];
  const got: string[] = [];
  const said: string[] = [];
  const dontAskAgain: (() => void)[] = [];
  let listed = 0;
  const d: UsedBeforeDeps = {
    setUpBefore: async () => over.stamps ?? ["alpha", "beta", "gone", "taken"],
    ask: async (r) => {
      const yes = over.yes?.[asked.length] ?? true;
      asked.push(r);
      if (yes) useNetwork.setState((s) => ({ granted: [...s.granted, ...(r.grants ?? [r.purpose])] }));
      return yes;
    },
    list: async () => {
      listed++;
      const c = over.listed === undefined ? CATALOGUE : over.listed;
      useOnline.setState(c ? { state: "listed", catalogue: c } : { state: "failed", catalogue: undefined, problem: "The plugins online could not be listed: no route to host." });
    },
    getAndAdd: async (e) => {
      if (over.fails?.includes(e.id)) throw new Error(`${e.name} was not got: the download stopped.`);
      got.push(e.id);
    },
    ...over,
  };
  const say = (title: string, text: string, stop?: () => void) => {
    said.push(`${title}: ${text}`);
    if (stop) dontAskAgain.push(stop);
  };
  return { d, say, asked, got, said, dontAskAgain, listed: () => listed };
}

const asked = () => useAppSettings.getState().plugins.usedBeforeAsked;

describe("the plugins set up before they came online, got again", () => {
  beforeEach(() => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins, removed: ["taken"] } });
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useOnline.setState({ state: "unlisted", catalogue: undefined, problem: undefined });
  });

  it("asks first whether to look them up, naming those set up here - none taken away - then whether to get them, each with its files' size", async () => {
    const r = deps();
    await getUsedBefore(r.say, r.d);
    expect(r.asked).toHaveLength(2);
    expect(r.asked[0]).toMatchObject({ purpose: CATALOGUE_PURPOSE, title: "Meno now gets its plugins online. Look them up?", again: true });
    expect(r.asked[0].detail).toBe("3 were set up here: alpha, beta and gone. Meno fetches the list of plugins online, then asks before it gets any of them.");
    expect(r.asked[0].parts).toBeUndefined();
    // (one no longer offered passed over; one for another Meno never got)
    expect(r.asked[1]).toMatchObject({ purpose: CATALOGUE_PURPOSE, title: "Get these 2 again?", again: true, hosts: CATALOGUE_HOSTS });
    expect(r.asked[1].detail).toContain("2 were set up here: Alpha interface and Beta interface.");
    expect(r.asked[1].parts).toEqual([
      { name: "Alpha interface", detail: "Its files: 39 KB.", sources: [] },
      { name: "Beta interface", detail: "Its files: 2.4 MB.", sources: [] },
    ]);
    expect(r.got).toEqual(["alpha", "beta"]);
    expect(r.said).toEqual([]);
    expect(asked()).toBe(true);
    // (and never again)
    const again = deps();
    await getUsedBefore(again.say, again.d);
    expect(again.asked).toEqual([]);
    expect(again.listed()).toBe(0);
  });

  it("where the list may be fetched already, asks only whether to get them", async () => {
    useNetwork.setState({ granted: [CATALOGUE_PURPOSE] });
    const r = deps();
    await getUsedBefore(r.say, r.d);
    expect(r.asked.map((q) => q.title)).toEqual(["Get these 2 again?"]);
    expect(r.got).toEqual(["alpha", "beta"]);
    expect(asked()).toBe(true);
  });

  it("a no to looking them up: said, and asked again as Meno next starts - unless the chemist says not to", async () => {
    const r = deps({ yes: [false] });
    await getUsedBefore(r.say, r.d);
    expect(r.listed()).toBe(0);
    expect(r.said).toEqual(["Plugins used before: Not looked up: Meno asks again as it next starts, or add them in Settings, Plugins."]);
    expect(asked()).toBeUndefined();
    const next = deps({ yes: [false] });
    await getUsedBefore(next.say, next.d);
    expect(next.asked).toHaveLength(1);
    next.dontAskAgain[0]();
    expect(asked()).toBe(true);
    const last = deps();
    await getUsedBefore(last.say, last.d);
    expect(last.asked).toEqual([]);
  });

  it("a no to getting them, their sizes shown, is kept: never asked again, nothing got", async () => {
    const r = deps({ yes: [true, false] });
    await getUsedBefore(r.say, r.d);
    expect(r.asked).toHaveLength(2);
    expect(r.got).toEqual([]);
    expect(r.said).toEqual([]);
    expect(asked()).toBe(true);
  });

  it("gone offline as it was asked: nothing said of a no, and asked again as Meno next starts", async () => {
    const r = deps({
      ask: async () => {
        useNetwork.setState({ offline: true });
        return false;
      },
    });
    await getUsedBefore(r.say, r.d);
    expect(r.said).toEqual([]);
    expect(asked()).toBeUndefined();
    useNetwork.setState({ offline: false, granted: [CATALOGUE_PURPOSE] });
    const second = deps({
      ask: async () => {
        useNetwork.setState({ offline: true });
        return false;
      },
    });
    await getUsedBefore(second.say, second.d);
    expect(second.got).toEqual([]);
    expect(asked()).toBeUndefined();
  });

  it("offline, or the list not fetched: says so, and asks again as Meno next starts", async () => {
    useNetwork.setState({ offline: true });
    const off = deps();
    await getUsedBefore(off.say, off.d);
    expect(off.asked).toEqual([]);
    expect(off.said).toEqual(["Plugins used before: Meno now gets its plugins online, and is offline: it asks again as it next starts, or add them in Settings, Plugins."]);
    expect(off.dontAskAgain).toEqual([]);
    expect(asked()).toBeUndefined();
    useNetwork.setState({ offline: false });
    const failing = deps({ listed: null });
    await getUsedBefore(failing.say, failing.d);
    expect(failing.said).toEqual(["Plugins used before: The plugins online could not be listed: no route to host. Meno asks again as it next starts."]);
    expect(failing.got).toEqual([]);
    expect(asked()).toBeUndefined();
    // (the next start: the network allowed already, so only whether to get them is asked, and they are got)
    const next = deps();
    await getUsedBefore(next.say, next.d);
    expect(next.asked).toHaveLength(1);
    expect(next.got).toEqual(["alpha", "beta"]);
    expect(asked()).toBe(true);
  });

  it("a list not fetched now is not taken for one, though an older one is still there: said, and asked again", async () => {
    const r = deps({ list: async () => useOnline.setState({ state: "unlisted", catalogue: CATALOGUE, problem: undefined }) });
    await getUsedBefore(r.say, r.d);
    expect(r.got).toEqual([]);
    expect(r.said).toEqual(["Plugins used before: The list of plugins online could not be fetched. Meno asks again as it next starts."]);
    expect(asked()).toBeUndefined();
  });

  it("one that could not be got: said, the rest got, and asked again for those not here", async () => {
    const r = deps({ fails: ["alpha"] });
    await getUsedBefore(r.say, r.d);
    expect(r.got).toEqual(["beta"]);
    expect(r.said).toEqual([
      "Plugins used before: Not all were got: Alpha interface: Alpha interface was not got: the download stopped. Meno asks again, for those not here, as it next starts.",
    ]);
    expect(asked()).toBeUndefined();
  });

  it("none set up before, or all of them in place already: nothing asked, ever", async () => {
    const none = deps({ stamps: [] });
    await getUsedBefore(none.say, none.d);
    expect(none.asked).toEqual([]);
    expect(asked()).toBe(true);
    // (two of the plugins in place in a test: src/test/pluginsInPlace)
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    const placed = deps({ stamps: MANIFESTS.slice(0, 2).map((m) => m.id) });
    await getUsedBefore(placed.say, placed.d);
    expect(placed.asked).toEqual([]);
    expect(placed.listed()).toBe(0);
    expect(asked()).toBe(true);
  });

  it("none of them offered here: nothing more asked, and not asked again", async () => {
    useNetwork.setState({ granted: [CATALOGUE_PURPOSE] });
    const r = deps({ stamps: ["gone", "later"] });
    await getUsedBefore(r.say, r.d);
    expect(r.asked).toEqual([]);
    expect(r.got).toEqual([]);
    expect(asked()).toBe(true);
  });

  it("one of them: asked of as one", async () => {
    useNetwork.setState({ granted: [CATALOGUE_PURPOSE] });
    const r = deps({ stamps: ["gamma"] });
    await getUsedBefore(r.say, r.d);
    expect(r.asked[0].title).toBe("Get it again?");
    expect(r.asked[0].detail).toContain("One was set up here: Gamma interface.");
  });
});
