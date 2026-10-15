import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { STYLE_PRESETS } from "../../../lib/chem/style";
import { BALL_AND_STICK, DEFAULT_STYLE_3D_CHOICE, style3dOf, type Style3DChoice } from "../../../lib/chem/style3d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import StyleEditor from "./StyleEditor";
import StyleFileAsk from "./StyleFileAsk";
import StylePicker3D from "./StylePicker3D";
import { presetCards, styleMenuItems3d } from "./styleMenus";

// Vitest runs in Node, with no page to mount on: the server's renderer
// draws each, and what it shows is read off that.

const none = () => {};
const was = useAppSettings.getState().ownDrawingStyles;
afterEach(() => useAppSettings.setState({ ownDrawingStyles: was }));

const withOwn: Style3DChoice = { ...DEFAULT_STYLE_3D_CHOICE, own: [{ id: "own-1", name: "Lab figures", look: { ...BALL_AND_STICK, ballScale: 0.16 } }] };

describe("Settings' 3D styles", () => {
  it("show the primary and the secondary in their slots, and every other style below - the built-in ones, then the user's own", () => {
    const html = renderToString(<StylePicker3D choice={withOwn} style={style3dOf(withOwn)} editing="balls" onEdit={none} onChange={none} />);
    expect(html).toContain('aria-label="Primary: Ball and stick"');
    expect(html).toContain('aria-label="Secondary: Space-filling"');
    const listed = [...html.matchAll(/role="listitem" tabindex="0" aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(listed).toEqual(["Glossy", "Outlined", "Print", "Pastel", "Model kit", "Sticks", "Lab figures"]);
    expect(html.match(/Built in/g)).toHaveLength(6);
    expect(html.match(/Your own/g)).toHaveLength(1);
  });

  it("offer, on a style's menu, its roles, Duplicate and Export - and Rename and Delete for the user's own alone", () => {
    const run = { onUse: none, onDuplicate: none, onExport: none, onRename: none, onDelete: none };
    const of = (role: "primary" | null, own: boolean) => styleMenuItems3d(role, own, run).map((i) => (i.disabled ? `(${i.name})` : i.name));
    expect(of("primary", false)).toEqual(["(Use as primary)", "Use as secondary", "Duplicate", "Export style…"]);
    expect(of(null, true)).toEqual(["Use as primary", "Use as secondary", "Duplicate", "Export style…", "Rename", "Delete"]);
  });
});

describe("the drawing styles to pick from", () => {
  it("are the built-in presets, then the user's own - and a workspace's own style this computer has not got", () => {
    const own = [{ id: "own-1", name: "Group style", style: STYLE_PRESETS[2].style }];
    const cards = (choice: Parameters<typeof presetCards>[1]) => presetCards(own, choice).map((c) => `${c.name}:${c.whose}`);
    expect(cards({ preset: "meno", changes: {} })).toEqual(["Meno:built", "ACS 1996:built", "RSC:built", "Wiley:built", "Nature:built", "Group style:own"]);
    expect(cards({ preset: "own-7", changes: {}, own: { name: "Their style", style: STYLE_PRESETS[3].style } }).slice(-1)).toEqual(["Their style:workspace"]);
    // (one the user has: listed once)
    expect(cards({ preset: "own-1", changes: {}, own: { name: "Group style", style: STYLE_PRESETS[2].style } })).toHaveLength(6);
  });

  it("show the workspace's own style - carried by it - where this computer has not got it", () => {
    useAppSettings.setState({ ownDrawingStyles: [] });
    const choice = { preset: "own-7", changes: {}, own: { name: "Their style", style: STYLE_PRESETS[3].style } };
    const html = renderToString(<StyleEditor choice={choice} onChange={none} layout="narrow" />);
    expect(html).toContain("Their style");
    expect(html).toContain("In this workspace");
    expect(html).toContain("Save as style…");
  });
});

describe("a style file, opened", () => {
  const file = { drawing: [{ name: "Group figures", style: STYLE_PRESETS[0].style }], molecules3d: [{ name: "Group 3D", look: BALL_AND_STICK }] };

  it("asks whether to add its styles, by their names", () => {
    const html = renderToString(<StyleFileAsk file={file} picture={null} canUse onAdd={none} onCancel={none} />).replace(/<!-- -->/g, "");
    expect(html).toContain("Add the styles Group figures and Group 3D to your styles?");
    expect([...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(["Cancel", "Add and use", "Add"]);
  });

  it("offers no use for a drawing style where no workspace is in front", () => {
    const html = renderToString(<StyleFileAsk file={{ ...file, molecules3d: [] }} picture={null} canUse={false} onAdd={none} onCancel={none} />).replace(/<!-- -->/g, "");
    expect(html).toContain("Add the style Group figures to your styles?");
    expect(html).not.toContain("Add and use");
  });
});
