// Held beside clipboardActions: "Copying..." (useCopyingShown) is shown 250 ms after the EARLIEST copy still being made began, whatever
// small copies begin and end beside it. The two React hooks it uses are stood in for - state kept, effects run at once - since the repo's
// tests have no DOM.
import { afterEach, describe, expect, it, vi } from "vitest";

const rt = vi.hoisted(() => ({ value: false as boolean, cleanup: undefined as undefined | (() => void), mounted: true }));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (init: boolean) => [rt.value ?? init, (v: boolean) => {
      if (!rt.mounted) throw new Error("state set after unmount");
      rt.value = v;
    }],
    useEffect: (fn: () => void | (() => void)) => {
      rt.cleanup = fn() as undefined | (() => void);
    },
  };
});
import { copying } from "../../../lib/clipboard";
import { COPYING_SHOWN_AFTER_MS, useCopyingShown } from "./clipboardActions";

const mount = () => {
  rt.value = false;
  rt.mounted = true;
  // (the hook is run outside a component, its two React hooks stood in for above)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useCopyingShown();
};
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const copy = (ms: number) => copying(() => new Promise<void>((done) => setTimeout(done, ms)));
afterEach(() => {
  vi.useRealTimers();
  rt.cleanup?.();
  rt.cleanup = undefined;
});

describe("Copying... is timed from the earliest copy still being made", () => {
  it("a small copy begun and done beside a large one neither puts it off nor ends it: shown at 250 ms of the large one, hidden when it is done", async () => {
    vi.useFakeTimers();
    mount();
    const large = copy(1000);
    await wait(200);
    const small = copy(100);
    await wait(49);
    expect(rt.value).toBe(false);
    await wait(1);
    expect(rt.value).toBe(true);
    await wait(100);
    await small;
    expect(rt.value).toBe(true);
    await wait(700);
    await large;
    await wait(0);
    expect(rt.value).toBe(false);
  });

  it("a stream of small copies beside a large one does not keep it from showing", async () => {
    vi.useFakeTimers();
    mount();
    const large = copy(2000);
    let shown = -1;
    for (let t = 0; t < 1000; t += 50) {
      const small = copy(20);
      await wait(50);
      await small;
      if (rt.value && shown < 0) shown = t + 50;
    }
    expect(shown).toBeGreaterThanOrEqual(COPYING_SHOWN_AFTER_MS);
    expect(shown).toBeLessThanOrEqual(COPYING_SHOWN_AFTER_MS + 50);
    await wait(1100);
    await large;
    await wait(0);
    expect(rt.value).toBe(false);
  });

  it("a copy that is done within 250 ms is never shown", async () => {
    vi.useFakeTimers();
    mount();
    const short = copy(200);
    await wait(200);
    await short;
    await wait(300);
    expect(rt.value).toBe(false);
  });
});
