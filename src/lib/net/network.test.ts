import { beforeEach, describe, expect, it } from "vitest";
import { askToConnect, useNetwork } from "./network";

const ask = (purpose: string) => askToConnect({ purpose, title: `Set up ${purpose}?`, detail: "", sources: [] });
const settle = () => new Promise((go) => setTimeout(go, 0));

describe("asking to use the network", () => {
  beforeEach(() => useNetwork.setState({ offline: false, granted: [], asking: null }));

  it("asks one question at a time: one asked while another is up waits its turn, never taken as a no", async () => {
    const first = ask("python-env:plugin-rdkit");
    const second = ask("python-env:plugin-cclib");
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe("python-env:plugin-rdkit");
    useNetwork.getState().asking!.answer(true);
    expect(await first).toBe(true);
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe("python-env:plugin-cclib");
    useNetwork.getState().asking!.answer(false);
    expect(await second).toBe(false);
    expect(useNetwork.getState().asking).toBeNull();
  });

  it("asks once for a purpose asked twice, both given its answer", async () => {
    const a = ask("python-env:plugin-xtb");
    const b = ask("python-env:plugin-xtb");
    await settle();
    useNetwork.getState().asking!.answer(true);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    await settle();
    expect(useNetwork.getState().asking).toBeNull();
  });

  it("says no in offline mode without asking - and yes for a purpose allowed before", async () => {
    useNetwork.setState({ offline: true });
    expect(await ask("python-env:plugin-rdkit")).toBe(false);
    useNetwork.setState({ offline: false, granted: ["python-env:plugin-rdkit"] });
    expect(await ask("python-env:plugin-rdkit")).toBe(true);
    expect(useNetwork.getState().asking).toBeNull();
  });
});
