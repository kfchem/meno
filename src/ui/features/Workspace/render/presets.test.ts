import { describe, expect, it, vi } from "vitest";

// (the renderer Meno carries, declaring an interface; and two made-up plugins that bring it presets through it, in Meno's order - as no plugin Meno carries yet)
vi.mock("../../../../lib/plugins/known", async (importOriginal) => {
  const known = await importOriginal<typeof import("../../../../lib/plugins/known")>();
  const { acceptManifest } = await import("../../../../lib/plugins/manifest");
  const renderer = known.MANIFESTS.find((m) => m.roles.some((r) => r.role === "render"))!;
  const brings = (id: string, name: string, presets: object) =>
    acceptManifest({ id, name, version: "1.0.0", depends: [{ plugin: renderer.id, versions: `>=${renderer.version} <100.0.0`, interfaces: [{ id: "styling", versions: ">=1.0.0 <2.0.0" }] }], presets: { interface: "styling", ...presets } })!;
  const grain = { id: "grain", label: "Grain", type: "choice", choices: [{ value: "fine", label: "Fine" }, { value: "coarse", label: "Coarse" }], default: "fine", section: "look", when: { id: "look", in: ["chalk"] } };
  return {
    ...known,
    MANIFESTS: [
      ...known.MANIFESTS.map((m) => (m.id === renderer.id ? { ...m, interfaces: [{ id: "styling", version: "1.2.0" }] } : m)),
      brings("more-looks", "More looks", { looks: [{ id: "chalk", label: "Chalk", file: "chalk.py" }, { id: "felt", label: "Felt", file: "felt.py" }] }),
      brings("test-looks", "Test looks", {
        looks: [
          { id: "chalk", label: "Chalk again", file: "look_chalk.py" },
          { id: "glossy", label: "Glossy again", file: "glossy.py" },
        ],
        studios: [{ id: "attic", label: "Attic", file: "attic.py" }],
        motions: [{ id: "wobble", label: "Wobble", shortest: { film: 3 }, file: "wobble.py" }],
        files: ["shared.py"],
        options: [grain, { id: "dust", label: "Dust", type: "switch", default: false, section: "scene" }],
      }),
    ],
  };
});

const { pluginsFilling, presetsFor } = await import("../../../../lib/calc/catalog");
const { looksOffered, renderOptions, askOf } = await import("./renderOptions");
const { chosenFrom, handOff, notOfferedSaid, presetOffer, presetOptionsShown, stepRefused, studioOption, withPresets } = await import("./presets");
const { useReaders } = await import("../../../../lib/calc/workers");
const { optionsFor, presetsStamp } = await import("../workflow/doers");

const renderer = pluginsFilling("render")[0];
const all = new Set([renderer.id, "test-looks", "more-looks"]);
const offered = presetsFor(renderer, all);
const offer = presetOffer(offered, looksOffered(renderer.roleLooks.render).map((l) => l.id), ["turn"]);

describe("the presets the plugins added bring the renderer, on the Render card", () => {
  it("are offered after Meno's and the renderer's own, each id once - the first plugin's, in Meno's order", () => {
    expect(offered.map((o) => o.from.id)).toEqual(["more-looks", "test-looks"]);
    // (Meno's own Lacquered is glossy: not offered again)
    expect(offer.looks.map((l) => [l.id, l.from])).toEqual([
      ["chalk", "more-looks"],
      ["felt", "more-looks"],
    ]);
    expect(offer.studios.map((s) => s.id)).toEqual(["attic"]);
    expect(offer.motions.map((m) => [m.id, m.from])).toEqual([["wobble", "test-looks"]]);
  });

  it("bring a Studio choice, where any brings a studio: the scene as asked first, then each", () => {
    expect(studioOption([])).toEqual([]);
    expect(studioOption(offer.studios)[0]).toMatchObject({ id: "studio", section: "scene", default: "asked", choices: [{ value: "asked", label: "As asked" }, { value: "attic", label: "Attic" }] });
    const options = renderOptions("picture", [], true, offer.looks, undefined, undefined, offer.studios);
    expect(options.find((o) => o.id === "studio")).toBeDefined();
    expect(askOf("picture", { width: 100, shape: "fit", look: "chalk", studio: "attic" }).studio).toBe("attic");
    expect(askOf("picture", { width: 100, shape: "fit", look: "chalk", studio: "asked" }).studio).toBeUndefined();
  });

  it("show a plugin's options only while one of its looks, studios or motions is chosen - and each when it says", () => {
    const shown = (chosen: object, values = {}) => presetOptionsShown(offered, offer, chosen, values, { ...chosen }).map((t) => [t.from.id, t.options.map((o) => o.id)]);
    expect(shown({ look: "chalk" })).toEqual([]);
    expect(shown({ look: "meno", studio: "attic" })).toEqual([["test-looks", ["dust"]]]);
    expect(chosenFrom(offer, { look: "chalk", studio: "attic" })).toMatchObject({ look: { from: "more-looks" }, studio: { from: "test-looks" } });
  });

  it("hand the renderer, of those chosen, each plugin's files and its own options' values - nothing else - and the entry says the canvas's look in their place", () => {
    const values = { "test-looks": { dust: true, other: "x" } };
    const handed = handOff(offered, offer, { look: "felt", studio: "attic", motion: "wobble" }, values);
    expect(handed).toEqual([
      { interface: "styling", from: "more-looks", look: { id: "felt", file: "felt.py" }, values: {} },
      { interface: "styling", from: "test-looks", studio: { id: "attic", file: "attic.py" }, motion: { id: "wobble", file: "wobble.py" }, values: { dust: true } },
    ]);
    expect(handOff(offered, offer, { look: "meno" }, values)).toEqual([]);
    expect(withPresets({ look: "felt", motion: "wobble", mode: "loop" }, handed, "meno")).toEqual({ look: "meno", mode: "loop", presets: handed });
    expect(withPresets({ look: "glossy", motion: "turn" }, [], "meno")).toEqual({ look: "glossy", motion: "turn" });
  });

  it("chosen last and not offered now, are said in a line by name, with the plugin and why - and the first is used", () => {
    const ids = new Set(looksOffered([...offer.looks]).map((l) => l.id));
    expect(notOfferedSaid("look", "chalk", ids, renderer.id, all)).toBeNull();
    expect(notOfferedSaid("look", "felt", new Set(), renderer.id, new Set([renderer.id]))).toBe("Felt is a look of More looks, which is not added: the first look is used.");
    expect(notOfferedSaid("studio", "attic", new Set(), renderer.id, new Set(["test-looks"]))).toBe(`Attic is a studio of Test looks, which is stopped (Needs ${renderer.name}, which is not added): the first studio is used.`);
    expect(notOfferedSaid("motion", "wobble", new Set(), "another", all)).toBe("Wobble is a motion of Test looks, which brings it to another renderer: the first motion is used.");
    // (none of any plugin's, or none chosen: nothing said)
    expect(notOfferedSaid("look", "nowhere", new Set(), renderer.id, all)).toBeNull();
    expect(notOfferedSaid("look", undefined, new Set(), renderer.id, all)).toBeNull();
  });
});

describe("the presets the plugins added bring the renderer, in a Render step", () => {
  it("are offered among its choices - its looks and the Studio - only while added", () => {
    useReaders.setState({ state: { [renderer.id]: "added" }, problem: {} });
    const plain = optionsFor("render", renderer.id);
    expect(plain.find((o) => o.id === "studio")).toBeUndefined();
    useReaders.setState({ state: Object.fromEntries([...all].map((id) => [id, "added"])), problem: {} });
    const options = optionsFor("render", renderer.id);
    const look = options.find((o) => o.id === "look");
    expect(look?.type === "choice" && look.choices.map((c) => c.value)).toEqual(expect.arrayContaining(["chalk", "felt"]));
    expect(options.find((o) => o.id === "studio")).toBeDefined();
  });

  it("make its key the versions of the plugins its look and studio are of - another version, another run", () => {
    useReaders.setState({ state: Object.fromEntries([...all].map((id) => [id, "added"])), problem: {} });
    expect(presetsStamp("render", renderer.id, { look: "felt", studio: "attic" })).toBe("|more-looks@1.0.0|test-looks@1.0.0");
    expect(presetsStamp("render", renderer.id, { look: "meno", studio: "asked" })).toBe("");
    expect(presetsStamp("energy", renderer.id, { look: "felt" })).toBe("");
  });

  it("refuse it before it runs where its look or studio is one nothing added brings now", () => {
    const looks = new Set(["meno", "chalk"]);
    const studios = new Set(["attic"]);
    expect(stepRefused({ look: "chalk", studio: "attic" }, looks, studios)).toBeNull();
    expect(stepRefused({ look: "meno", studio: "asked" }, looks, studios)).toBeNull();
    expect(stepRefused({}, looks, studios)).toBeNull();
    expect(stepRefused({ look: "felt" }, looks, studios)).toBe("This look is not offered by any added plugin");
    expect(stepRefused({ look: "chalk", studio: "cellar" }, looks, studios)).toBe("This studio is not offered by any added plugin");
  });
});
