import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNetwork } from "../net/network";
import { CATALOGUE_PURPOSE, type CatalogueEntry } from "./catalogue";
import { getPlugin, listOnline, useOnline, type PluginFiles } from "./online";

const HEX = "b".repeat(64);
const ENTRY = {
  id: "sketch",
  version: "0.2.0",
  name: "Sketch interface",
  licence: "Apache-2.0",
  contract: 1,
  systems: [],
  roles: [],
  kinds: [],
  reads: [],
  source: { url: "https://github.com/example/plugins/releases/download/sketch-v0.2.0/sketch-0.2.0.tar.gz", sha256: HEX, bytes: 10 },
  manifestSha256: HEX,
};
const CATALOGUE = { schema: 1, issued: "2026-11-10T00:00:00Z", serial: 3, plugins: [ENTRY] };

/** Meno's backend, as a test has it: `catalogue_get` answers as given - and says whether it was asked to fetch. */
function backend(answer: () => unknown) {
  const asked: { fetch: boolean }[] = [];
  const ask = vi.fn(async (_cmd: string, args?: Record<string, unknown>) => {
    asked.push(args as { fetch: boolean });
    return answer();
  });
  return { ask: ask as never, asked };
}

/** A fresh launch: the catalogue not yet listed or fetched - the network allowed for it, from before. */
async function fresh() {
  vi.resetModules();
  const { useNetwork: network } = await import("../net/network");
  network.setState({ offline: false, granted: [CATALOGUE_PURPOSE], asking: null });
  return import("./online");
}

beforeEach(() => {
  useNetwork.setState({ offline: false, granted: [], asking: null });
  useOnline.setState({ state: "unlisted", catalogue: undefined, fetchedAt: undefined, kept: undefined, problem: undefined }, true);
});

describe("the plugins online, listed", () => {
  it("asks, fetches and shows nothing as Settings opens where the network was never allowed for it", async () => {
    const { ask, asked } = backend(() => ({ catalogue: CATALOGUE }));
    await listOnline(false, ask);
    expect(asked).toEqual([]);
    expect(useOnline.getState().state).toBe("unlisted");
  });

  it("fetches once a launch where the network was allowed for it, the one kept after that - and fetches whenever asked", async () => {
    const { listOnline: list, useOnline: online } = await fresh();
    const { ask, asked } = backend(() => ({ catalogue: CATALOGUE, fetchedAt: "2026-11-09T10:00:00Z" }));
    await list(false, ask);
    await list(false, ask);
    await list(true, ask);
    expect(asked).toEqual([{ fetch: true }, { fetch: false }, { fetch: true }]);
    expect(online.getState()).toMatchObject({ state: "listed", fetchedAt: "2026-11-09T10:00:00Z", catalogue: { serial: 3 } });
  });

  it("shows the one kept from before offline, saying why - or, none kept, that it needs the network", async () => {
    useNetwork.setState({ offline: true });
    const kept = backend(() => ({ catalogue: CATALOGUE, fetchedAt: "2026-11-09T10:00:00Z" }));
    await listOnline(true, kept.ask);
    expect(kept.asked).toEqual([{ fetch: false }]);
    expect(useOnline.getState()).toMatchObject({ state: "listed", kept: expect.stringMatching(/offline/), catalogue: { serial: 3 } });
    useOnline.setState({ state: "unlisted", catalogue: undefined });
    await listOnline(true, backend(() => null).ask);
    expect(useOnline.getState()).toMatchObject({ state: "failed", problem: expect.stringMatching(/^Listing them needs the network: Meno is offline/) });
  });

  it("shows nothing of a list it cannot read, and says why", async () => {
    useNetwork.setState({ granted: [CATALOGUE_PURPOSE] });
    await listOnline(true, backend(() => ({ catalogue: { ...CATALOGUE, plugins: [{ ...ENTRY, source: { ...ENTRY.source, url: "https://example.org/x.tar.gz" } }] } })).ask);
    expect(useOnline.getState()).toMatchObject({ state: "failed", catalogue: undefined, problem: expect.stringMatching(/could not be read: It holds sketch: where its files are/) });
    await listOnline(
      true,
      backend(() => {
        throw new Error("Its signature is not Meno's");
      }).ask,
    );
    expect(useOnline.getState()).toMatchObject({ state: "failed", problem: "The plugins online could not be listed: Its signature is not Meno's." });
  });
});

/** The backend's handling of a plugin's files, as a test has it: what was staged, taken into use, thrown away and read again. */
function files(manifest: unknown): PluginFiles & { did: string[] } {
  const did: string[] = [];
  return {
    did,
    stage: async (id, version) => (did.push(`stage ${id} ${version}`), { stage: "s1", manifest: typeof manifest === "string" ? manifest : JSON.stringify(manifest) }),
    commit: async (stage) => void did.push(`commit ${stage}`),
    discard: async (stage) => void did.push(`discard ${stage}`),
    reload: async () => void did.push("reload"),
  };
}

const MANIFEST = { id: "sketch", name: "Sketch interface", version: "0.2.0", description: "Draws.", licence: "Apache-2.0", homepage: "https://example.org", environment: "uv", kinds: [], reads: [], roles: [{ role: "smiles" }] };

/** The SHA-256 of a manifest's text, as a catalogue gives it. */
const shaOf = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The entry, with its manifest's fingerprint that of `manifest` as staged. */
const entryFor = async (manifest: unknown) => ({ ...ENTRY, manifestSha256: await shaOf(typeof manifest === "string" ? manifest : JSON.stringify(manifest)) }) as CatalogueEntry;

describe("a plugin got from the list", () => {
  beforeEach(() => useNetwork.setState({ granted: [CATALOGUE_PURPOSE] }));

  it("is staged, its manifest read as any plugin's is, then taken into use and the plugins read again", async () => {
    const f = files(MANIFEST);
    await getPlugin(await entryFor(MANIFEST), f);
    expect(f.did).toEqual(["stage sketch 0.2.0", "commit s1", "reload"]);
  });

  it("is thrown away, nothing of it used, where its files are not the plugin and version the list offered", async () => {
    for (const manifest of [{ ...MANIFEST, id: "other" }, { ...MANIFEST, version: "0.2.1" }, { ...MANIFEST, environment: "anything" }, "{not json"]) {
      const f = files(manifest);
      await expect(getPlugin(await entryFor(manifest), f)).rejects.toThrow("its files are not the plugin the list offered");
      expect(f.did).toEqual(["stage sketch 0.2.0", "discard s1"]);
    }
  });

  it("is thrown away where its manifest's fingerprint is not the one the list gave - the plugin and version right or not", async () => {
    const f = files(MANIFEST);
    await expect(getPlugin({ ...ENTRY, manifestSha256: await shaOf(JSON.stringify({ ...MANIFEST, description: "Other." })) } as CatalogueEntry, f)).rejects.toThrow("its files are not the plugin the list offered");
    expect(f.did).toEqual(["stage sketch 0.2.0", "discard s1"]);
  });

  it("is not got offline, nothing staged", async () => {
    useNetwork.setState({ offline: true });
    const f = files(MANIFEST);
    await expect(getPlugin(await entryFor(MANIFEST), f)).rejects.toThrow("needs the network");
    expect(f.did).toEqual([]);
  });
});

describe("a plugin got, taken into use", () => {
  it("is known at once: the plugins in place read again from Meno's backend", async () => {
    const manifest = JSON.stringify({ ...MANIFEST, id: "sketch-new" });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: async (cmd: string) => (cmd === "plugins_installed" ? [{ id: "sketch-new", version: "0.2.0", dir: "/data/plugins/sketch-new/0.2.0", manifest, grammars: {} }] : null) }));
    vi.resetModules();
    const { PLUGIN_FILES: files } = await import("./online");
    const { anyPluginById } = await import("../calc/catalog");
    expect(anyPluginById("sketch-new")).toBeUndefined();
    await files.reload();
    expect(anyPluginById("sketch-new")?.name).toBe("Sketch interface");
    vi.doUnmock("@tauri-apps/api/core");
  });
});
