import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Online } from "../../../lib/plugins/online";
import RoleOffer from "./RoleOffer";
import { addOffered, listShown, offeredHere } from "./offerSteps";
import type { Catalogue, CatalogueEntry } from "../../../lib/plugins/catalogue";

// (the list online as the test has it: the server's renderer reads a store as it began, so it is stood in for)
const shown = vi.hoisted(() => ({ online: { state: "unlisted" } as Online }));
vi.mock("../../../lib/plugins/online", async (actual) => {
  const real = await actual<typeof import("../../../lib/plugins/online")>();
  const hook = Object.assign(<T,>(pick?: (s: Online) => T) => (pick ? pick(shown.online) : shown.online), { setState: () => {}, getState: () => shown.online, subscribe: () => () => {} });
  return { ...real, useOnline: hook, listOnline: async () => {} };
});
vi.mock("../../../lib/plugins/here", async (actual) => ({ ...(await actual<typeof import("../../../lib/plugins/here")>()), systemHere: () => "macos" }));

const HEX = "d".repeat(64);
const entry = (over: Record<string, unknown>) => ({
  version: "0.1.0",
  licence: "Apache-2.0",
  contract: 1,
  systems: [],
  roles: [],
  kinds: [],
  reads: [],
  source: { url: "https://github.com/example/plugins/releases/download/x/x.tar.gz", sha256: HEX, bytes: 10 },
  manifestSha256: HEX,
  ...over,
});
const listed = (plugins: unknown[]): Online => ({ state: "listed", catalogue: { schema: 1, issued: "2026-11-10T00:00:00Z", plugins: plugins as never } });

const drawn = (online: Online) => {
  shown.online = online;
  return renderToString(<RoleOffer role="smiles" done={() => {}} />).replace(/<!-- -->/g, "");
};

describe("the plugins offered for a role no plugin here fills", () => {
  it("are those online that fill it, each to add", () => {
    const html = drawn(listed([entry({ id: "sketch", name: "Sketch interface", roles: ["smiles"] }), entry({ id: "other", name: "Other interface", roles: ["checks"] })]));
    expect(html).toMatch(/>Add Sketch interface</);
    expect(html).not.toContain("Other interface");
  });

  it("are listed first, on the person's click, where the list is not here - and say so where none online does it", () => {
    expect(drawn({ state: "unlisted" })).toMatch(/>List the plugins online</);
    expect(drawn({ state: "failed", problem: "Listing them needs the network: Meno is offline." })).toContain("Listing them needs the network");
    expect(drawn(listed([entry({ id: "other", name: "Other interface", roles: ["checks"] })]))).toContain("No plugin online does it yet.");
  });
});

describe("the line's own steps", () => {
  it("offers only what is made for this system", () => {
    const catalogue = (listed([entry({ id: "mac", name: "Mac sketch", roles: ["smiles"], systems: ["macos"] }), entry({ id: "any", name: "Any sketch", roles: ["smiles"] })]).catalogue ?? null) as Catalogue;
    expect(offeredHere("smiles", catalogue, "macos").map((e) => e.id)).toEqual(["mac", "any"]);
    expect(offeredHere("smiles", catalogue, "windows").map((e) => e.id)).toEqual(["any"]);
  });

  it("asks for the list, as it appears, never forcing a fetch: only the person's click does", async () => {
    const asked: (boolean | undefined)[] = [];
    await listShown(async (again) => void asked.push(again));
    expect(asked).toEqual([false]);
  });

  it("says it is done only once the plugin is got and added - and why not, and not done, where a step fails", async () => {
    const said: string[] = [];
    const far = entry({ id: "far", name: "Far interface" }) as unknown as CatalogueEntry;
    await addOffered(far, () => said.push("done"), (why) => said.push(why), async () => void said.push("added"));
    expect(said).toEqual(["added", "done"]);
    said.length = 0;
    await addOffered(far, () => said.push("done"), (why) => said.push(why), async () => Promise.reject(new Error("Far interface was got, but Meno could not read it.")));
    expect(said).toEqual(["Far interface was got, but Meno could not read it."]);
  });
});
