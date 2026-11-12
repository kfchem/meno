import { beforeEach, describe, expect, it, vi } from "vitest";

// (in Meno, not under Vitest: the app's side of a yes takes a while - net_grant answered after the question has gone)
// (and what the app is told, each command with what it is given, in turn - and the commands it has answered)
const slow = vi.hoisted(() => ({ fails: false, told: [] as [string, unknown][], answered: [] as [string, unknown][] }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (cmd: string, args?: unknown) =>
    new Promise((done, fail) => {
      slow.told.push([cmd, args]);
      setTimeout(() => {
        slow.answered.push([cmd, args]);
        if (cmd === "net_grant" && slow.fails) fail(new Error("no app"));
        else done(cmd === "plugins_set_up_before" ? [] : undefined);
      }, 20);
    }),
}));

import { askToConnect, useNetwork } from "./network";
import { DEFAULT_APP_SETTINGS, useAppSettings } from "../settings/appSettings";
import { CATALOGUE_PURPOSE, type Catalogue } from "../plugins/catalogue";
import { CATALOGUE_REQUEST, useOnline } from "../plugins/online";
import { getUsedBefore } from "../plugins/usedBefore";

const ask = (purpose: string, again = false): Promise<boolean> => askToConnect({ purpose, title: `Set up ${purpose}?`, detail: "", sources: [], hosts: [], ...(again ? { again } : {}) });

/** Each question answered yes as it is asked: their titles, in order. */
function answeringYes(): { titles: string[]; stop: () => void } {
  const titles: string[] = [];
  const stop = useNetwork.subscribe((s) => {
    if (!s.asking) return;
    titles.push(s.asking.title);
    s.asking.answer(true);
  });
  return { titles, stop };
}

const HEX = "a".repeat(64);
const CATALOGUE: Catalogue = {
  schema: 1,
  issued: "2026-11-10T00:00:00Z",
  plugins: ["alpha", "beta", "gamma"].map((id) => ({
    id,
    version: "1.0.0",
    name: `${id} interface`,
    licence: "Apache-2.0",
    contract: 1,
    systems: [],
    roles: [],
    kinds: [],
    reads: [],
    fileKinds: [],
    quotedTables: [],
    source: { url: `https://github.com/example/plugins/releases/download/${id}-v1.0.0/${id}-1.0.0.tar.gz`, sha256: HEX, bytes: 1000 },
    manifestSha256: HEX,
  })),
};

describe("a yes to a network question, the app slow to hear of it", () => {
  beforeEach(() => {
    slow.fails = false;
    slow.told.length = 0;
    slow.answered.length = 0;
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useOnline.setState({ state: "unlisted", catalogue: undefined, problem: undefined });
  });

  it("counts at once: what was asked for, used straight after, is not asked of again", async () => {
    const yes = answeringYes();
    // (whether the app had answered for the purpose by the time the page first took it as allowed)
    const heardFirst: boolean[] = [];
    const watch = useNetwork.subscribe((s, was) => {
      if (s.granted.includes("python-env:plugin-quanta") && !was.granted.includes("python-env:plugin-quanta"))
        heardFirst.push(slow.answered.some(([cmd, args]) => cmd === "net_grant" && (args as { purpose?: string })?.purpose === "python-env:plugin-quanta"));
    });
    try {
      expect(await ask("python-env:plugin-quanta", true)).toBe(true);
      expect(useNetwork.getState().granted).toContain("python-env:plugin-quanta");
      // (the app told of it, for that purpose, once - before the yes was taken as given)
      expect(slow.told.filter(([cmd]) => cmd === "net_grant")).toEqual([["net_grant", { purpose: "python-env:plugin-quanta" }]]);
      expect(heardFirst).toEqual([true]);
      expect(await ask("python-env:plugin-quanta")).toBe(true);
      expect(yes.titles).toEqual(["Set up python-env:plugin-quanta?"]);
    } finally {
      yes.stop();
      watch();
    }
  });

  it("is not left waiting where the app could not take it: answered, and the purpose allowed on the page", async () => {
    slow.fails = true;
    const yes = answeringYes();
    try {
      expect(await ask("python-env:plugin-helix")).toBe(true);
      expect(useNetwork.getState().granted).toContain("python-env:plugin-helix");
    } finally {
      yes.stop();
    }
  });

  it("an upgraded Meno asks two questions of the plugins set up before - look them up, get them - not a third to list them", async () => {
    const yes = answeringYes();
    const got: string[] = [];
    try {
      await getUsedBefore(() => {}, {
        setUpBefore: async () => ["alpha", "beta", "gamma"],
        ask: askToConnect,
        // (as lib/plugins/online `listOnline(true)` does: asks for the list's purpose first)
        list: async () => {
          if (await askToConnect(CATALOGUE_REQUEST)) useOnline.setState({ state: "listed", catalogue: CATALOGUE });
        },
        getAndAdd: async (e) => void got.push(e.id),
      });
      expect(yes.titles).toEqual(["Meno now gets its plugins online. Look them up?", "Get these 3 again?"]);
      expect(useNetwork.getState().granted).toEqual([CATALOGUE_PURPOSE]);
      expect(got).toEqual(["alpha", "beta", "gamma"]);
    } finally {
      yes.stop();
    }
  });
});

