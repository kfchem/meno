import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { Option } from "../../lib/options";
import OptionsForm from "./OptionsForm";

// Vitest runs in Node, with no page to mount on: the form as the server's renderer writes it.

describe("a role's options in a card", () => {
  it("has a list to pick from at least 12rem wide but never past the card's inset on the right - a step's card being narrower", () => {
    const options: Option[] = [
      { id: "kind", label: "Calculation", type: "choice", default: "a", choices: ["a", "b", "c", "d", "e", "f"].map((v) => ({ value: v, label: v })) },
    ];
    const html = renderToString(<OptionsForm options={options} values={{ kind: "a" }} onChange={() => {}} />);
    // (the least width on its name and list together, resolved against the card's content; the list filling it)
    expect(html).toContain('class="block w-fit min-w-[min(12rem,100%)] max-w-full"');
    expect(html).not.toContain("min-w-[12rem]");
  });

  it("has a box of lines whose focus ring shows whole: room for it all round inside the scroll that holds it", () => {
    const options: Option[] = [{ id: "lists", label: "R groups", type: "lines", default: "" }];
    const html = renderToString(<OptionsForm options={options} values={{ lists: "R1: Me" }} onChange={() => {}} />);
    expect(html).toMatch(/<span class="-m-0\.5 [^"]*overflow-y-auto p-0\.5"/);
    expect(html).toMatch(/<textarea[^>]*class="[^"]*outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"/);
  });
});
