// A plugin the chemist took away counts as their answer, and the plugin here is taken only at the list's version (found in review).
import { beforeEach, describe, expect, it } from "vitest";
import { useNetwork } from "../net/network";
import { DEFAULT_APP_SETTINGS, useAppSettings } from "../settings/appSettings";
import type { Catalogue, CatalogueEntry } from "./catalogue";
import { DEPS, offerFirstSetUp, useFirstSetUp } from "./firstSetUp";

const HEX = "a".repeat(64);
const sketchkit = (version: string): CatalogueEntry => ({
  id: "sketchkit", version, name: "Sketchkit", licence: "Apache-2.0", contract: 1, systems: [], roles: ["smiles", "checks"], kinds: [], reads: [], fileKinds: [],
  quotedTables: [], source: { url: `https://github.com/example/plugins/releases/download/sketchkit-v${version}/sketchkit-${version}.tar.gz`, sha256: HEX, bytes: 52_000 }, manifestSha256: HEX,
});
const listing = (version: string): Catalogue => ({ schema: 1, issued: "2026-11-14T00:00:00Z", plugins: [sketchkit(version)] });

describe("the first start's card and a plugin here that is not added", () => {
  beforeEach(() => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useFirstSetUp.setState({ phase: "none" });
  });

  it("is not offered where the chemist took that plugin away: their own answer", async () => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins, removed: ["sketchkit"] } });
    await offerFirstSetUp({ ...DEPS, setUpBefore: async () => [] });
    expect(useFirstSetUp.getState().phase).toBe("none");
  });

  it("takes the plugin here at the list's version, and not one here at another", () => {
    expect(DEPS.here(listing("0.3.0")).map((e) => e.id)).toEqual(["sketchkit"]);
    expect(DEPS.here(listing("0.4.0"))).toEqual([]);
    expect(DEPS.here(listing("0.2.0"))).toEqual([]);
  });
});
