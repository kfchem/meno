// As Meno starts, a plugin that fills the role and is set up here is looked at before the card is offered (found in review): the card is not
// offered where it is, though the readers have not been looked at yet.
import { beforeEach, describe, expect, it, vi } from "vitest";

// (every plugin's environment is ready: what a chemist's set-up plugin is, looked at)
vi.mock("../pyEnv", async (actual) => ({ ...(await actual<typeof import("../pyEnv")>()), pyEnvReady: async () => true }));

const { useNetwork } = await import("../net/network");
const { DEFAULT_APP_SETTINGS, useAppSettings } = await import("../settings/appSettings");
const { useReaders } = await import("../calc/workers");
const { DEPS, offerFirstSetUp, useFirstSetUp } = await import("./firstSetUp");

describe("the first start's card, as Meno starts with a plugin set up whose state is not looked at yet", () => {
  beforeEach(() => {
    useAppSettings.setState({ plugins: { ...DEFAULT_APP_SETTINGS.plugins } });
    useNetwork.setState({ offline: false, granted: [], asking: null });
    useFirstSetUp.setState({ phase: "none" });
    useReaders.setState({ state: {}, problem: {} });
  });

  it("is not offered to a chemist whose plugin that fills the role is set up", async () => {
    await offerFirstSetUp({ ...DEPS, setUpBefore: async () => [] });
    expect(useFirstSetUp.getState().phase).toBe("none");
  });
});
