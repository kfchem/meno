import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { askToConnect, revoke, useNetwork } from "../../lib/net/network";
import { acceptAppSettings } from "../../lib/settings/appSettings";
import { Allowed } from "./NetworkSettings";

const LOOKUP = "lookup:finder@names.example.org";
const settle = () => new Promise((go) => setTimeout(go, 0));
const shown = () => renderToString(<Allowed granted={useNetwork.getState().granted} />).replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("Settings, Network: what was allowed", () => {
  beforeEach(() => useNetwork.setState({ available: true, offline: false, granted: [], connections: [], asking: null }));

  it("lists a plugin's look-up allowed, read back from the settings as they were saved, in words, to be withdrawn - whatever the state of its plugin", () => {
    // (as Meno starts: the settings read, what they allow taken - App `applyNetworkSettings`)
    const { granted } = acceptAppSettings({ network: { granted: ["app-update", LOOKUP] } }).network;
    useNetwork.setState({ granted });
    const html = shown();
    expect(html).toContain("Looking names up at names.example.org, for finder");
    expect(html).not.toContain(LOOKUP);
    expect(html.match(/Withdraw/g)).toHaveLength(2);
  });

  it("withdrawn, it is no longer listed - and the next look-up asks again", async () => {
    useNetwork.setState({ granted: [LOOKUP] });
    expect(await askToConnect({ purpose: LOOKUP, title: "Look names up?", detail: "", sources: [], hosts: ["names.example.org"] })).toBe(true);
    expect(useNetwork.getState().asking).toBeNull();
    await revoke(LOOKUP);
    expect(shown()).not.toContain("Looking names up");
    expect(shown()).toContain("Nothing yet.");
    const asked = askToConnect({ purpose: LOOKUP, title: "Look names up?", detail: "", sources: [], hosts: ["names.example.org"] });
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe(LOOKUP);
    useNetwork.getState().asking!.answer(false);
    expect(await asked).toBe(false);
  });
});
