import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowSaid, askToConnect, purposeName, useNetwork } from "./network";

// (a plugin known by its name, as one here would be: lib/calc/catalog `anyPluginById`)
vi.mock("../calc/catalog", async (original) => ({
  ...(await original<typeof import("../calc/catalog")>()),
  anyPluginById: (id: string) => (id === "finder" ? { id, name: "Names Service" } : undefined),
}));

const ask = (purpose: string) => askToConnect({ purpose, title: `Set up ${purpose}?`, detail: "", sources: [], hosts: [] });
const settle = () => new Promise((go) => setTimeout(go, 0));

describe("asking to use the network", () => {
  beforeEach(() => useNetwork.setState({ offline: false, granted: [], asking: null }));

  it("asks one question at a time: one asked while another is up waits its turn, never taken as a no", async () => {
    const first = ask("python-env:plugin-sketchkit");
    const second = ask("python-env:plugin-manyread");
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe("python-env:plugin-sketchkit");
    useNetwork.getState().asking!.answer(true);
    expect(await first).toBe(true);
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe("python-env:plugin-manyread");
    useNetwork.getState().asking!.answer(false);
    expect(await second).toBe(false);
    expect(useNetwork.getState().asking).toBeNull();
  });

  it("asks once for a purpose asked twice, both given its answer", async () => {
    const a = ask("python-env:plugin-tightbind");
    const b = ask("python-env:plugin-tightbind");
    await settle();
    useNetwork.getState().asking!.answer(true);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    await settle();
    expect(useNetwork.getState().asking).toBeNull();
  });

  it("says no in offline mode without asking - and yes for a purpose allowed before", async () => {
    useNetwork.setState({ offline: true });
    expect(await ask("python-env:plugin-sketchkit")).toBe(false);
    useNetwork.setState({ offline: false, granted: ["python-env:plugin-sketchkit"] });
    expect(await ask("python-env:plugin-sketchkit")).toBe(true);
    expect(useNetwork.getState().asking).toBeNull();
  });
});

describe("a purpose, as Settings, Network names it", () => {
  it("names a model's plugin by the hosts it was allowed for", () => {
    expect(purposeName("model:talker@api.example.com,files.example.com")).toBe("Conversations through talker, to api.example.com, files.example.com");
    expect(purposeName("model:talker")).toBe("model:talker");
    // (the list of plugins online, said as the other purposes are: never its key)
    expect(purposeName("plugin-catalogue")).toBe("Looking up plugins online");
  });
});

describe("a plugin's look-up, as its question and Settings, Network say it", () => {
  it("says what is allowed, at which host, for which plugin - never Meno's key for it", () => {
    expect(purposeName("lookup:finder@names.example.org")).toBe("Looking names up at names.example.org, for Names Service");
    expect(purposeName("lookup:finder@a.example.org,b.example.org")).toBe("Looking names up at a.example.org, b.example.org, for Names Service");
    // (a plugin no longer here: its id, still in words)
    expect(purposeName("lookup:gone@names.example.org")).toBe("Looking names up at names.example.org, for gone");
  });
});

describe("what a question's yes is called", () => {
  it("is \"Allow\" where the yes only sends out what the chemist chose, \"Allow and download\" where it downloads", () => {
    expect(allowSaid({ purpose: "lookup:finder@names.example.org" })).toBe("Allow");
    expect(allowSaid({ purpose: "model:talker@api.example.com" })).toBe("Allow");
    for (const purpose of ["python-env:plugin-rdkit", "python-env:console", "app-update", "plugin-catalogue", "ccd"]) expect(allowSaid({ purpose })).toBe("Allow and download");
    // (several asked in one: a download among them, and the yes downloads)
    expect(allowSaid({ purpose: "lookup:finder@names.example.org", grants: ["python-env:plugin-finder", "lookup:finder@names.example.org"] })).toBe("Allow and download");
    expect(allowSaid({ purpose: "lookup:finder@names.example.org", grants: ["lookup:finder@names.example.org", "model:talker@api.example.com"] })).toBe("Allow");
  });
});
