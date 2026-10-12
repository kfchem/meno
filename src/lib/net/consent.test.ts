import { afterEach, describe, expect, it } from "vitest";
import { askToConnect, useNetwork, type ConsentRequest } from "./network";

describe("asking to use the network", () => {
  afterEach(() => useNetwork.setState({ offline: false, granted: [], asking: null }));
  const request: ConsentRequest = { purpose: "python-env:plugin-x", title: "Download X?", detail: "X.", sources: ["X, from example.org"] };

  it("does not ask again for a purpose allowed - unless it fetches more than the user was told of", async () => {
    useNetwork.setState({ offline: false, granted: ["python-env:plugin-x"], asking: null });
    expect(await askToConnect(request)).toBe(true);
    expect(useNetwork.getState().asking).toBeNull();
    const answer = askToConnect({ ...request, again: true });
    expect(useNetwork.getState().asking).toMatchObject({ title: "Download X?" });
    useNetwork.getState().asking!.answer(false);
    expect(await answer).toBe(false);
  });

  it("never asks while Meno is offline", async () => {
    useNetwork.setState({ offline: true, granted: ["python-env:plugin-x"], asking: null });
    expect(await askToConnect({ ...request, again: true })).toBe(false);
    expect(useNetwork.getState().asking).toBeNull();
  });
});
