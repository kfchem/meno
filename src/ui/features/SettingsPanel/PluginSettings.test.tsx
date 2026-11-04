import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALL_PLUGINS } from "../../../lib/calc/catalog";
import type { Online } from "../../../lib/plugins/online";
import PluginSettings from "./PluginSettings";

// (the list online, as the test has it: the server's renderer reads a store as it began, so the store is stood in for)
const shown = vi.hoisted(() => ({ online: { state: "unlisted" } as Online }));
vi.mock("../../../lib/plugins/online", async (actual) => {
  const real = await actual<typeof import("../../../lib/plugins/online")>();
  const hook = Object.assign(<T,>(pick?: (s: Online) => T) => (pick ? pick(shown.online) : shown.online), { setState: () => {}, getState: () => shown.online });
  return { ...real, useOnline: hook, listOnline: async () => {} };
});
// (each plugin here as not added: what the readers' store says once it has looked)
vi.mock("../../../lib/calc/workers", async (actual) => {
  const real = await actual<typeof import("../../../lib/calc/workers")>();
  const { ALL_PLUGINS: all } = await import("../../../lib/calc/catalog");
  const now = { state: Object.fromEntries(all.map((p) => [p.id, "absent"])), problem: {} };
  return { ...real, useReaders: <T,>(pick: (s: typeof now) => T) => pick(now), addedReaders: async () => new Set() };
});
vi.mock("../../../lib/plugins/here", async (actual) => ({ ...(await actual<typeof import("../../../lib/plugins/here")>()), systemHere: () => "macos" }));

const HEX = "c".repeat(64);
const HERE = ALL_PLUGINS.find((p) => !("data" in p))!;

/** A plugin on offer, as the list online has it. */
const entry = (over: Record<string, unknown>) => ({
  version: "0.1.0",
  licence: "Apache-2.0",
  contract: 1,
  systems: [],
  roles: [],
  kinds: [],
  reads: [],
  source: { url: "https://github.com/example/plugins/releases/download/x/x.tar.gz", sha256: HEX, bytes: 245_760 },
  manifestSha256: HEX,
  ...over,
});

function drawn(online: Online): string {
  shown.online = online;
  return renderToString(<PluginSettings />).replace(/<!-- -->/g, "");
}

describe("Plugins in Settings, with the list online", () => {
  it("says what the list is before it is fetched, and gives the button that fetches it", () => {
    const html = drawn({ state: "unlisted" });
    expect(html).toContain("Plugins are got from a list online, which Meno checks is its own before reading it.");
    expect(html).toMatch(/>List them</);
    expect(html).not.toContain("Online, not here yet");
  });

  it("offers a plugin not here yet: what it does, its licence, terms, what to cite and its size - and Add", () => {
    const html = drawn({
      state: "listed",
      fetchedAt: "2026-11-10T09:30:00Z",
      catalogue: {
        schema: 1,
        issued: "2026-11-10T00:00:00Z",
        serial: 4,
        plugins: [entry({ id: "sketch", name: "Sketch interface", description: "Draws a structure from its name.", roles: ["smiles"], terms: "Free for academic use.", cite: "A. Author, J. Chem. 1 (2020) 1." })] as never,
      },
    });
    expect(html).toMatch(/One plugin online, as listed on .+? - the list of .+?\./);
    expect(html).toContain("Online, not here yet");
    expect(html).toContain("Sketch interface <span");
    expect(html).toContain("Draws a structure from its name.");
    expect(html).toContain("SMILES to a structure, and back.");
    expect(html).toContain("Apache-2.0 · 240 KB to download");
    expect(html).toContain("Terms: Free for academic use.");
    expect(html).toContain("Cite: A. Author, J. Chem. 1 (2020) 1.");
    // (not added: the heading says so, the card only Add)
    expect(html).toMatch(/<div class="flex flex-col items-end gap-1\.5"><button[^>]*>Add</);
  });

  it("offers a newer version of a plugin here as an update - and says why one is not for here", () => {
    const html = drawn({
      state: "listed",
      catalogue: {
        schema: 1,
        issued: "2026-11-10T00:00:00Z",
        serial: 4,
        plugins: [entry({ id: HERE.id, name: HERE.name, version: "99.0.0" }), entry({ id: "winonly", name: "Windows thing", systems: ["windows"] }), entry({ id: "future", name: "Future thing", contract: 2 })] as never,
      },
    });
    expect(html).toMatch(/>Update to 99\.0\.0</);
    expect(html).toContain("For Windows only");
    // (one that cannot be added here: its name in grey)
    expect(html).toMatch(/<div class="text-sm text-gh-gray">Windows thing <span/);
    expect(html).not.toMatch(/<div class="text-sm text-gh-black">Windows thing/);
    expect(html).toContain("It is for a newer Meno");
    // (the plugin here not offered again)
    expect(html.split(`${HERE.name} <span`).length).toBe(2);
  });

  it("says why there is no list, in Meno's warning colour, and how it is the one from before where it is", () => {
    expect(drawn({ state: "failed", problem: "The plugins online could not be listed: Its signature is not Meno's." })).toMatch(/text-accel-accent"[^>]*>The plugins online could not be listed: Its signature is not Meno&#x27;s\.</);
    const kept = drawn({ state: "listed", kept: "offline", fetchedAt: "2026-11-09T09:30:00Z", catalogue: { schema: 1, issued: "2026-11-09T00:00:00Z", serial: 3, plugins: [] } });
    expect(kept).toMatch(/The list as it was on .+?: a newer one could not be fetched \(offline\)\./);
    expect(kept).toMatch(/>Look again</);
  });
});
