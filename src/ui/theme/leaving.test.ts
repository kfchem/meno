import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { PresenceContext } from "motion/react";
import { createElement } from "react";
import { Leaving, QUESTION_ARRIVING_MS, heldWhile, type HeldHandlers } from "./leaving";

const event = () => {
  const done = { stopped: false, prevented: false };
  return { done, e: { stopPropagation: () => void (done.stopped = true), preventDefault: () => void (done.prevented = true) } };
};

/** Whether each of the handlers keeps an event to itself. */
const holds = (held: HeldHandlers) =>
  [held.onPointerDownCapture, held.onMouseDownCapture, held.onClickCapture, held.onDoubleClickCapture].map((handler) => {
    const { done, e } = event();
    handler(e);
    return done.stopped && done.prevented;
  });

/** The handlers a part under `Leaving` is given as it is first drawn - in view, or going (motion's presence saying so). */
function heldAsDrawn(arriving: number, going = false): HeldHandlers {
  let got: HeldHandlers | null = null;
  const part = createElement(Leaving, {
    arriving,
    children: (held: HeldHandlers) => {
      got = held;
      return createElement("div");
    },
  });
  // (motion's AnimatePresence tells a part going by its context; only `isPresent` is read)
  const presence = { id: "test", initial: false, isPresent: !going, custom: undefined, onExitComplete: () => {}, register: () => () => {} };
  renderToString(createElement(PresenceContext.Provider, { value: presence as never }, part));
  return got!;
}

describe("a part coming into view or going out of it", () => {
  it("keeps a press or a click on it to itself as it goes - a double-click's second does not do the first's again", () => {
    expect(holds(heldWhile(true))).toEqual([true, true, true, true]);
    expect(holds(heldAsDrawn(0, true))).toEqual([true, true, true, true]);
  });

  it("leaves them be while it is in view", () => {
    expect(holds(heldWhile(false))).toEqual([false, false, false, false]);
    expect(holds(heldAsDrawn(0))).toEqual([false, false, false, false]);
  });

  it("takes no click as a question comes - one meant for the question before it is not its answer", () => {
    expect(QUESTION_ARRIVING_MS).toBeGreaterThan(0);
    expect(holds(heldAsDrawn(QUESTION_ARRIVING_MS))).toEqual([true, true, true, true]);
  });
});
