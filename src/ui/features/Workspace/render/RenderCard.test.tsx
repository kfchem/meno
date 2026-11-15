import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import RenderCard from "./RenderCard";

// Vitest runs in Node, with no page to mount on: the card as the server's
// renderer writes it, as it first shows.

const plugin = { name: "Renderer", roleLooks: {}, roleMotions: {}, roleOptions: {} } as unknown as PythonPlugin;

describe("the Render card", () => {
  it("keeps its buttons on a foot of its own, solid and parted from the options by a line, and shows their focus in Meno's colours", () => {
    const html = renderToString(<RenderCard plugin={plugin} motions={["turn"]} surfaces={false} onRender={() => {}} onCancel={() => {}} />);
    const foot = html.match(/<div class="sticky [^"]*">/)?.[0] ?? "";
    expect(foot).toContain("bg-white ");
    expect(foot).not.toContain("bg-white/");
    expect(foot).toContain("border-t border-gh-line");
    const render = html.match(/<button[^>]*>Render<\/button>/)?.[0] ?? "";
    expect(render).toContain("outline-none");
    expect(render).toContain("focus-visible:ring-");
  });

  it("opens on a picture without a plugin's option for a film alone", () => {
    const options = [
      { id: "grain", label: "Grain of the film", type: "choice", choices: [{ value: "fine", label: "Fine" }], default: "fine", when: { id: "kind", in: ["film"] } },
      { id: "glow", label: "Glow", type: "switch", default: false },
    ];
    const withOptions = { ...plugin, roleOptions: { render: options } } as unknown as PythonPlugin;
    const html = renderToString(<RenderCard plugin={withOptions} motions={["turn"]} surfaces={false} onRender={() => {}} onCancel={() => {}} />);
    // (the card opens on a picture)
    expect(html).toContain("Glow");
    expect(html).not.toContain("Grain of the film");
  });

  it("shows no heading of a plugin's options where none of them is for what is rendered", () => {
    const options = [{ id: "grain", label: "Grain of the film", type: "choice", choices: [{ value: "fine", label: "Fine" }], default: "fine", when: { id: "kind", in: ["film"] } }];
    const withOptions = { ...plugin, roleOptions: { render: options } } as unknown as PythonPlugin;
    const html = renderToString(<RenderCard plugin={withOptions} motions={["turn"]} surfaces={false} onRender={() => {}} onCancel={() => {}} />);
    expect(html).not.toContain(">Renderer</h3>");
  });
});
