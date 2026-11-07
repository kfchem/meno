import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import JobSettings, { CORES_SHARED_SAID, coresSharedSaid } from "./JobSettings";

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
});
