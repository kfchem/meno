import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import FirstStepsSettings from "./FirstStepsSettings";

// Vitest runs in Node, with no page to mount on: the card as the server's renderer writes it.

describe("First steps in Settings, General", () => {
  it("offers Meno's first steps again, with Show - in the cards' own look", () => {
    const html = renderToString(<FirstStepsSettings />);
    expect(html).toContain(">First steps</div>");
    expect(html).toContain("A short tour of drawing in Meno");
    expect(html).toMatch(/<button[^>]*>Show<\/button>/);
    expect(html).toContain("rounded-lg border border-gh-line bg-white");
  });
});
