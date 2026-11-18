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

  it("says a choice with only one to have as text, with no control, its note beneath", () => {
    const options: Option[] = [
      { id: "engine", label: "Renderer", type: "choice", default: "cycles", choices: [{ value: "cycles", label: "Cycles: light traced" }], note: "This motion is made with light traced" },
    ];
    const html = renderToString(<OptionsForm options={options} values={{ engine: "cycles" }} onChange={() => {}} />);
    expect(html).toContain("Renderer");
    expect(html).toContain("Cycles: light traced");
    expect(html).toContain("This motion is made with light traced");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain('type="radio"');
  });
});

describe("a card's options opened to ask for what it needs", () => {
  const options: Option[] = [
    { id: "within", label: "Within", type: "number", default: Number.NaN, min: 0, unit: "kcal/mol" },
    { id: "other", label: "Other", type: "number", default: Number.NaN },
    { id: "count", label: "Count", type: "number", default: 3 },
  ];
  /** The labels of the fields marked as asked for, in order. */
  const asked = (html: string) => [...html.matchAll(/<label class="block"><span[^>]*>([^<]+)<\/span><span[^>]*><input[^>]*data-asked="true"/g)].map((m) => m[1]);
  it("takes the first number that holds none - only it", () => {
    expect(asked(renderToString(<OptionsForm options={options} values={{}} onChange={() => {}} asks />))).toEqual(["Within"]);
    expect(asked(renderToString(<OptionsForm options={options} values={{ within: 2.5 }} onChange={() => {}} asks />))).toEqual(["Other"]);
    expect(renderToString(<OptionsForm options={options} values={{ within: 2.5, other: 1 }} onChange={() => {}} asks />)).not.toContain("data-asked");
  });
  it("takes none where it is not opened to ask", () => {
    expect(renderToString(<OptionsForm options={options} values={{}} onChange={() => {}} />)).not.toContain("data-asked");
  });

  it("offers a number or text option's value from a property by a button beside it, named on hover; taken so, the property's name in its place", () => {
    const options: Option[] = [{ id: "strength", label: "Strength, kcal/mol/rad\u00b2", type: "text", default: "50", unit: "kcal/mol/rad\u00b2", fromProperty: true }];
    const binds = (bound: Record<string, string>) => ({ can: () => true, bound, offered: ["k", "start"], onBind: () => {} });
    const own = renderToString(<OptionsForm options={options} values={{ strength: "50" }} onChange={() => {}} binds={binds({})} />);
    expect(own).toContain('aria-label="From a property"');
    expect(own).toContain('aria-pressed="false"');
    expect(own).toContain('value="50"');
    const taken = renderToString(<OptionsForm options={options} values={{ strength: "50" }} onChange={() => {}} binds={binds({ strength: "k" })} />);
    expect(taken).toContain('aria-pressed="true"');
    expect(taken).toContain('value="k"');
    expect(taken).toContain('title="k: each entry&#x27;s own, as it comes in"');
    expect(taken).not.toContain('value="50"');
    // (none offered without it: a form for Settings, or a step that takes nothing in)
    expect(renderToString(<OptionsForm options={options} values={{ strength: "50" }} onChange={() => {}} />)).not.toContain("From a property");
  });
});
