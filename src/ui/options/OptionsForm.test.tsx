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
});
