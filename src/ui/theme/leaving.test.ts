import { describe, expect, it } from "vitest";
import { heldWhileLeaving } from "./leaving";

const event = () => {
  const done = { stopped: false, prevented: false };
  return { done, e: { stopPropagation: () => void (done.stopped = true), preventDefault: () => void (done.prevented = true) } };
};

describe("a part going out of view", () => {
  it("keeps a press or a click on it to itself as it goes - a double-click's second does not do the first's again", () => {
    const held = heldWhileLeaving(true);
    for (const handler of [held.onPointerDownCapture, held.onMouseDownCapture, held.onClickCapture, held.onDoubleClickCapture]) {
      const { done, e } = event();
      handler(e);
      expect(done).toEqual({ stopped: true, prevented: true });
    }
  });

  it("leaves them be while it is in view", () => {
    const held = heldWhileLeaving(false);
    for (const handler of [held.onPointerDownCapture, held.onMouseDownCapture, held.onClickCapture, held.onDoubleClickCapture]) {
      const { done, e } = event();
      handler(e);
      expect(done).toEqual({ stopped: false, prevented: false });
    }
  });
});
