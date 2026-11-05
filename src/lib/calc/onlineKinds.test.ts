import { afterEach, describe, expect, it, vi } from "vitest";
import { cataloguedKinds, registerKinds } from "../io/kinds";
import type { CatalogueEntry } from "../plugins/catalogue";
import { useOnline } from "../plugins/online";
import { addOnline } from "./workers";

// (this computer a Mac)
vi.mock("../plugins/here", async (actual) => ({ ...(await actual<typeof import("../plugins/here")>()), systemHere: () => "macos" }));

/** A plugin on offer online that reads one made-up kind: Meno knows none of these names. */
const onOffer = (over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "far",
  version: "1.0.0",
  name: "Far interface",
  licence: "MIT",
  contract: 1,
  systems: [],
  roles: [],
  kinds: [],
  reads: ["far-out"],
  fileKinds: [{ id: "far-out", name: "Far output", extensions: [".far"], marks: [{ text: "F A R   P R O G R A M" }] }],
  quotedTables: [],
  source: { url: "https://github.com/x/far.tar.gz", sha256: "a".repeat(64), bytes: 1 },
  manifestSha256: "a".repeat(64),
  ...over,
});
const listed = (plugins: CatalogueEntry[]) => useOnline.setState({ state: "listed", catalogue: { schema: 1, issued: "", serial: 1, plugins } });

afterEach(() => {
  useOnline.setState({ state: "unlisted", catalogue: undefined });
  registerKinds([]);
});

describe("the kinds of file the plugins online read", () => {
  it("are told as the list comes, and let go of with it - only those of plugins made for this system and this Meno", () => {
    expect(cataloguedKinds().some((k) => k.id === "far-out")).toBe(false);
    listed([onOffer()]);
    expect(cataloguedKinds().find((k) => k.id === "far-out")?.suggest).toEqual(["far"]);
    listed([onOffer({ contract: 99 })]);
    expect(cataloguedKinds().some((k) => k.id === "far-out")).toBe(false);
    listed([onOffer({ systems: ["windows", "linux"] })]);
    expect(cataloguedKinds().some((k) => k.id === "far-out")).toBe(false);
    listed([onOffer({ systems: ["macos"] })]);
    expect(cataloguedKinds().some((k) => k.id === "far-out")).toBe(true);
    useOnline.setState({ state: "unlisted", catalogue: undefined });
    expect(cataloguedKinds().some((k) => k.id === "far-out")).toBe(false);
  });
});

describe("a plugin added from the list", () => {
  it("is got first, then added as any plugin is - and where what was got cannot be read, says so", async () => {
    const got: string[] = [];
    await expect(addOnline(onOffer(), async (e) => void got.push(e.id))).rejects.toThrow("Far interface was got, but Meno could not read it.");
    expect(got).toEqual(["far"]);
    await expect(addOnline(onOffer(), async () => Promise.reject(new Error("Far interface was not got.")))).rejects.toThrow("was not got");
  });
});

describe("the kinds of file the plugins online read, as one is put in place", () => {
  it("are told by the one here from then on - not by its entry", async () => {
    listed([onOffer()]);
    expect(cataloguedKinds().find((k) => k.id === "far-out")?.name).toBe("Far output");
    const { setInstalled, MANIFESTS } = await import("../plugins/known");
    const was = MANIFESTS;
    const manifest = JSON.stringify({ id: "far", name: "Far interface", version: "1.0.0", environment: "uv", reads: ["far-out"], kinds: [{ id: "far-out", name: "Far output, here", extensions: [".far"], marks: [{ text: "F A R   P R O G R A M" }] }], steps: [{ kinds: ["energy"], programs: ["far"] }] });
    setInstalled([{ id: "far", version: "1.0.0", dir: "/data/plugins/far/1.0.0", manifest, grammars: {} }]);
    expect(cataloguedKinds().find((k) => k.id === "far-out")?.name).toBe("Far output, here");
    setInstalled(was.map((m) => ({ id: m.id, version: m.version, dir: `/data/plugins/${m.id}/${m.version}`, manifest: JSON.stringify(m), grammars: {} })));
  });
});
