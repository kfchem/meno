import { afterEach, describe, expect, it, vi } from "vitest";
import { useReaders } from "../lib/calc/workers";
import { useNotices } from "./notices";
import { sayFailedSetUps } from "./setUpSaid";

describe("a plugin's set-up that fails", () => {
  afterEach(() => {
    vi.useRealTimers();
    useReaders.setState({ state: {}, problem: {} });
    useNotices.setState({ notices: [] });
  });

  it("is said in a notice that stays until it is dismissed - one that ends added, or is looked at afresh, says nothing", () => {
    vi.useFakeTimers();
    const stop = sayFailedSetUps();
    useReaders.setState({ state: { crem: "adding", molscribe: "adding" }, problem: {} });
    useReaders.setState({ state: { crem: "absent", molscribe: "added" }, problem: { crem: "CReM was not added: uv pip install failed" } });
    // (looked at afresh, as Plugins is shown: not said again)
    useReaders.setState({ state: { crem: "absent", molscribe: "added" }, problem: { crem: "CReM was not added: uv pip install failed" } });
    expect(useNotices.getState().notices.map((n) => [n.title, n.text, n.stays])).toEqual([["Plugin not added", "CReM was not added: uv pip install failed", true]]);
    vi.advanceTimersByTime(60_000);
    expect(useNotices.getState().notices).toHaveLength(1);
    useNotices.getState().dismiss("set-up crem");
    expect(useNotices.getState().notices).toHaveLength(0);
    stop();
  });

  it("leaves other notices to go after their while", () => {
    vi.useFakeTimers();
    useNotices.getState().show({ id: "x", title: "t", text: "x" });
    vi.advanceTimersByTime(10_000);
    expect(useNotices.getState().notices).toHaveLength(0);
  });
});
