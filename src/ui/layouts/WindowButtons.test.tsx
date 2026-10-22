import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WindowButtons from "./WindowButtons";

describe("the window buttons Meno draws (not on a Mac)", () => {
  it("are drawn outside Tauri too - the browser dev server - where there is no window for them", () => {
    const html = renderToStaticMarkup(<WindowButtons />);
    expect(html).toContain('aria-label="Minimize"');
    expect(html).toContain('aria-label="Close"');
  });
});
