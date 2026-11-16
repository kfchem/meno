import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

const drawn = (card: FirstSetUpCard) => renderToString(<CardBody card={card} />);
import { CardBody } from "./FirstSetUpCard";
import { CARD_TITLE, type FirstSetUpCard } from "../../lib/plugins/firstSetUp";

describe("the card that sets chemistry up as Meno first starts", () => {
  it("asks its question with where it fetches from, its buttons taking no focus; shows nothing once answered", () => {
    const html = drawn({ phase: "offered" });
    expect(html).toContain(CARD_TITLE);
    expect(html).toContain("releases.astral.sh");
    expect(html).toContain(">Set up<");
    expect(html).toContain(">Not now<");
    expect(html.match(/<button/g)?.length).toBe(html.match(/tabindex="-1"/g)?.length);
    expect(drawn({ phase: "none" })).toBe("");
  });

  it("says the step under way and the plugin once named, with Stop; a failure with Try again", () => {
    const going = drawn({ phase: "going", step: "environment", plugin: { id: "chem", name: "chem plugin", licence: "BSD-3-Clause", size: "51 KB" } });
    expect(going).toContain("Setting up chemistry: setting up chem plugin&#x27;s environment.");
    expect(going.replace(/<!-- -->/g, "")).toContain("chem plugin · BSD-3-Clause · 51 KB");
    expect(going).toContain(">Stop<");
    const failed = drawn({ phase: "failed", why: "The plugins online could not be listed." });
    expect(failed).toContain("The plugins online could not be listed.");
    expect(failed).toContain(">Try again<");
  });
});
