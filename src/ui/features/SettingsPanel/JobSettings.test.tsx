import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import JobSettings, { calculationsAfter, CORES_SHARED_SAID, coresChosen, coresSharedSaid } from "./JobSettings";

// Vitest runs in Node, with no page to mount on: the card as the server's renderer writes it - with the settings as they
// start, Cores for each job unset.

describe("Jobs in Settings, Calculations", () => {
  it("says the cores are shared among a step's jobs while Cores for each job is unset - and not once it is set", () => {
    expect(coresSharedSaid({})).toBe(CORES_SHARED_SAID);
    expect(coresSharedSaid({ cores: 4 })).toBeNull();
    expect(coresSharedSaid({ cores: 1 })).toBeNull();
    // (drawn under the rows: the renderer escapes its apostrophe, so a part of it without one)
    expect(renderToString(<JobSettings />)).toContain(CORES_SHARED_SAID.split(": ")[1]);
  });

  it("leaves Cores for each job empty while it is unset, what it comes to dimmed in it", () => {
    const html = renderToString(<JobSettings />);
    const field = html.match(/<input[^>]*aria-label="Cores for each job"[^>]*>/)?.[0] ?? "";
    expect(field).toContain('value=""');
    expect(field).toMatch(/placeholder="\d+"/);
  });

  it("takes an emptied field as unset, a number as that number, and an untouched field as it was", () => {
    // (emptied: NaN where a number was; unset again)
    expect(coresChosen(NaN, 4, 4, 16)).toBeUndefined();
    // (a number typed over an empty field: set - even the number it came to)
    expect(coresChosen(8, NaN, undefined, 16)).toBe(8);
    expect(coresChosen(40, NaN, undefined, 16)).toBe(16);
    expect(coresChosen(0, 4, 4, 16)).toBe(1);
    // (not changed: as it was, set or unset)
    expect(coresChosen(NaN, NaN, undefined, 16)).toBeUndefined();
    expect(coresChosen(4, 4, 4, 16)).toBe(4);
  });

  it("is unset by the row's change when Cores for each job is emptied, and set when a number is typed - as the card hands it on", () => {
    const computer = { cores: 16, memory: 0 };
    const set = { cores: 4 };
    // (emptied: the number there before, NaN now; nothing else changed)
    expect(calculationsAfter({ cores: NaN, "cores-all": 16 }, { cores: 4, "cores-all": 16 }, set, computer)).not.toHaveProperty("cores");
    // (typed over the empty field)
    expect(calculationsAfter({ cores: 8, "cores-all": 16 }, { cores: NaN, "cores-all": 16 }, {}, computer)).toMatchObject({ cores: 8 });
    // (another row changed: Cores for each job as it was, set or not)
    expect(calculationsAfter({ cores: 4, "cores-all": 8 }, { cores: 4, "cores-all": 16 }, set, computer)).toMatchObject({ cores: 4, coresAll: 8 });
    expect(calculationsAfter({ cores: NaN, "cores-all": 8 }, { cores: NaN, "cores-all": 16 }, {}, computer)).not.toHaveProperty("cores");
  });
});
