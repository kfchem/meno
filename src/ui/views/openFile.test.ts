import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openable, openedAs, openedTexts, sayNoneTold, textsOf } from "./openFile";
import { useNotices } from "../notices";
import { useOnline } from "../../lib/plugins/online";
import type { CatalogueEntry } from "../../lib/plugins/catalogue";
import { registerKinds } from "../../lib/io/kinds";
import { MANIFESTS } from "../../lib/plugins/known";

const MOL = `ethanol
  Meno

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END
`;

describe("openedAs", () => {
  it("holds a file of no kind as a text, as a drop does - but not bytes, which are read as a drop reads them", () => {
    expect(textsOf(openedAs("notes.txt", "line one\nline two\n"))).toEqual([{ name: "notes.txt", text: "line one\nline two\n" }]);
    const bytes = openedAs("blob.bin", "\u0000\u0001\u0002garbage");
    expect(textsOf(bytes)).toBeUndefined();
    expect(bytes.data).toMatchObject({ filename: "blob.bin" });
  });

  it("opens a chemical file on a workspace, named for the file", () => {
    expect(openedAs("ethanol.mol", MOL)).toEqual({
      kind: "workspace",
      label: "ethanol.mol",
      data: { filename: "ethanol.mol", payload: MOL, kind: "mol" },
    });
    // (told what it is, so that the canvas need not ask again; and where it is, where that is known)
    expect(openedAs("ethanol.mol", MOL, "/data/ethanol.mol").data).toMatchObject({ kind: "mol", path: "/data/ethanol.mol" });
  });

  it("opens an XYZ file and a Meno workspace on a workspace too, where 3D stands in 3D", () => {
    const xyz = "3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n";
    expect(openedAs("water.xyz", xyz)).toEqual({ kind: "workspace", label: "water.xyz", data: { filename: "water.xyz", payload: xyz, kind: "xyz" } });
    // (known by its content, whatever it is called)
    expect(openedAs("water.out", xyz).kind).toBe("workspace");
    expect(openedAs("work.meno", "{}").kind).toBe("workspace");
  });

  it("opens text into a workspace's column, as it is - on a canvas of its own where none takes it", () => {
    expect(openedAs("run.py", "print(1)\n", "/w/run.py")).toEqual({
      kind: "workspace",
      label: "run.py",
      data: { texts: [{ name: "run.py", text: "print(1)\n", path: "/w/run.py" }], filename: "run.py", path: "/w/run.py" },
    });
    // (JSON too: its words kept as they are, to be written back as they were)
    expect(textsOf(openedAs("a.json", '{"a":1}'))).toEqual([{ name: "a.json", text: '{"a":1}' }]);
    expect(textsOf(openedAs("notes.abc", "plain words"))).toEqual([{ name: "notes.abc", text: "plain words" }]);
    expect(textsOf(openedAs("ethanol.mol", MOL))).toBeUndefined();
  });

  it("opens texts together on one canvas, named for the first - a new one, with no name, as Untitled", () => {
    const opened = openedTexts([{ name: "a.txt", text: "a" }, { name: "b.txt", text: "b" }]);
    expect(opened).toMatchObject({ kind: "workspace", label: "a.txt", data: { filename: "a.txt" } });
    expect(textsOf(opened)).toHaveLength(2);
    expect(openedTexts([{ name: "", text: "" }])).toEqual({ kind: "workspace", label: "Untitled.txt", data: { texts: [{ name: "", text: "" }] } });
  });

  it("offers chemical files, calculations' output - of the plugins added, and those only plugins not added read - and text to Open, and no kind nothing reads", () => {
    registerKinds([]);
    for (const ext of [".meno", ".mol", ".sdf", ".rxn", ".xyz", ".pdb", ".cube", ".log", ".txt", ".py"]) expect(openable()).toContain(ext);
    // (nothing added or offered that reads or writes them: no calculation's files)
    expect(openable()).not.toContain(".out");
    expect(openable()).not.toContain(".gjf");
    // (none added, all offered: what they read, to name one to add)
    registerKinds([], MANIFESTS);
    expect(openable()).toEqual(expect.arrayContaining([".out", ".fchk", ".molden"]));
    // (what a plugin added writes, a calculation's input, as text to change)
    registerKinds(MANIFESTS.filter((m) => m.id === "gaussian"));
    expect(openable()).toEqual(expect.arrayContaining([".gjf", ".com"]));
    expect(textsOf(openedAs("job.gjf", "# B3LYP/6-31G(d) Opt\n"))).toHaveLength(1);
    registerKinds(MANIFESTS);
    expect(openable()).not.toContain(".ket");
    // (each once)
    expect(new Set(openable()).size).toBe(openable().length);
  });

  describe("with plugins added that read calculations' output", () => {
    beforeEach(() => registerKinds(MANIFESTS));
    afterEach(() => registerKinds([]));

    it("opens a calculation's output on a workspace, a log of something else as text", () => {
      expect(openedAs("job.out", "\n                                 * O   R   C   A *\n")).toMatchObject({ kind: "workspace", label: "job.out" });
      expect(openedAs("run.log", " Entering Gaussian System, Link 0=g16\n")).toMatchObject({ kind: "workspace" });
      expect(textsOf(openedAs("build.log", "compiled in 3 s\n"))).toHaveLength(1);
    });
  });

  it("opens a calculation's output as text where no plugin added reads it: Meno knows no program", () => {
    expect(textsOf(openedAs("run.log", " Entering Gaussian System, Link 0=g16\n"))).toHaveLength(1);
  });
});

describe("texts nothing told, opened while the plugins online are not listed", () => {
  afterEach(() => {
    useNotices.setState({ notices: [] });
    useOnline.setState({ state: "unlisted", catalogue: undefined });
    vi.restoreAllMocks();
  });
  const none = async () => null;

  it("are said once, with the button that lists them - a plain text not - and nothing at all once they are listed", () => {
    sayNoneTold(["water.out", "notes.txt", "run.log"], () => {}, none);
    const [n] = useNotices.getState().notices;
    expect([n.title, n.text, n.action?.label, n.stays]).toEqual(["Opened as text", "No plugin added reads water.out, run.log.", "List the plugins online", true]);
    useNotices.setState({ notices: [] });
    sayNoneTold(["notes.txt", "table.csv"], () => {}, none);
    expect(useNotices.getState().notices).toEqual([]);
    useOnline.setState({ state: "listed", catalogue: { schema: 1, issued: "", serial: 1, plugins: [] } });
    sayNoneTold(["water.out"], () => {}, none);
    expect(useNotices.getState().notices).toEqual([]);
  });

  it("listed, say in the notice's place what each is and the plugin that reads it, with Add - added, the file read again", async () => {
    const online = await import("../../lib/plugins/online");
    const workers = await import("../../lib/calc/workers");
    const far = { id: "far", name: "Far" } as CatalogueEntry;
    vi.spyOn(online, "listOnline").mockImplementation(async () => void useOnline.setState({ state: "listed", catalogue: { schema: 1, issued: "", serial: 1, plugins: [far] } }));
    const added = vi.spyOn(workers, "addOnline").mockResolvedValue();
    const again = vi.fn();
    const kind = { id: "far-out", name: "Far output", extensions: [".far"], suggest: ["far"] };
    useNotices.getState().show({ id: "other", title: "Other", text: "Before it." });
    sayNoneTold(["water.out", "other.out"], again, async (name) => (name === "water.out" ? kind : null));
    useNotices.getState().notices[1].action!.run();
    await vi.waitFor(() => expect(useNotices.getState().notices[1].action?.label).toBe("Add Far"));
    // (in its place: after the one before it)
    expect(useNotices.getState().notices.map((n) => [n.id, n.text])).toEqual([
      ["other", "Before it."],
      ["none-told", "water.out is Far output: the Far plugin reads it."],
    ]);
    useNotices.getState().notices[1].action!.run();
    await vi.waitFor(() => expect(again).toHaveBeenCalledWith(["water.out"]));
    expect(added).toHaveBeenCalledWith(far);
    expect(useNotices.getState().notices.map((n) => n.id)).toEqual(["other"]);
  });

  it("listed, say so where none of them is read by a plugin online - or why the list is not here", async () => {
    const online = await import("../../lib/plugins/online");
    const listing = vi.spyOn(online, "listOnline").mockImplementation(async () => void useOnline.setState({ state: "listed", catalogue: { schema: 1, issued: "", serial: 1, plugins: [] } }));
    sayNoneTold(["water.out"], () => {}, none);
    useNotices.getState().notices[0].action!.run();
    await vi.waitFor(() => expect(useNotices.getState().notices[0].text).toBe("No plugin online reads water.out."));
    listing.mockImplementation(async () => void useOnline.setState({ state: "failed", problem: "Listing them needs the network." }));
    useOnline.setState({ state: "unlisted", catalogue: undefined });
    useNotices.setState({ notices: [] });
    sayNoneTold(["water.out"], () => {}, none);
    useNotices.getState().notices[0].action!.run();
    await vi.waitFor(() => expect(useNotices.getState().notices[0].text).toBe("Listing them needs the network."));
  });
});
