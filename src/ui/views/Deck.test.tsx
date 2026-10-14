import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { TabInstance } from "../../lib/core";
import type { ViewEntry } from "./registry";
import Deck from "./Deck";
import { chosen, layerOf, type Shown } from "./deckLayers";

// Vitest runs in Node: the server's renderer draws the deck as it is first
// shown, before any effect - the chosen tab over the others. (In the app the
// switch was caught in bursts of the window's frames.)

const tab = (id: string, kind: string): TabInstance =>
  ({ meta: { id, label: id }, content: { kind, data: {} } }) as unknown as TabInstance;

/** A view with a see-through body, as Settings' tint is. */
const entry = (kind: string): ViewEntry =>
  ({ kind, Component: () => <div className="w-full h-full bg-gh-base/40">{kind}</div>, create: () => tab(kind, kind) }) as unknown as ViewEntry;

function deck(activeId: string) {
  const tabs = { a: tab("a", "workspace"), b: tab("b", "settings") };
  return renderToString(
    <Deck
      order={["a", "b"]}
      tabs={tabs}
      activeId={activeId}
      resolveView={(kind) => entry(kind)}
      patchData={() => {}}
      getDocument={() => undefined}
      renameTab={() => {}}
    />,
  );
}

/** Each tab's layer, by the class it is given. */
const layers = (html: string) => [...html.matchAll(/class="(absolute inset-0[^"]*)"/g)].map((m) => m[1].split(" "));

describe("Deck", () => {
  it("shows the chosen tab opaque, so that no tab beneath it shows through a view see-through in part (the Settings flicker)", () => {
    for (const id of ["a", "b"]) {
      const shown = layers(deck(id)).filter((c) => !c.includes("hidden"));
      expect(shown).toHaveLength(1);
      expect(shown[0]).toContain("z-10");
      expect(shown[0]).toContain("bg-white");
    }
  });

  it("keeps the tab left beneath the chosen one from the choice on - not hidden for a frame first (the page blank under Settings)", () => {
    const start: Shown = { active: "a", beneath: null };
    expect(chosen(start, "a")).toBe(start);
    const over = chosen(start, "b");
    expect(over).toEqual({ active: "b", beneath: "a" });
    expect([layerOf("a", over), layerOf("b", over)]).toEqual(["beneath", "active"]);
    // (chosen again before the fade is over: the one left then goes beneath, the first hidden)
    const again = chosen(over, "c");
    expect(["a", "b", "c"].map((id) => layerOf(id, again))).toEqual(["hidden", "beneath", "active"]);
    // (and back to the one beneath)
    expect(chosen(over, "a")).toEqual({ active: "a", beneath: "b" });
  });
});
