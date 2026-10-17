import { describe, expect, it } from "vitest";
import { STYLE_3D } from "../../../lib/chem/style3d";
import { workspace3dOf } from "../../../lib/chem/workspaceStyle3d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { style3dOf } from "./style3d";

describe("the 3D style a workspace's molecules are drawn in", () => {
  it("is the workspace's own - its looks and light - with how a drag turns them Settings'", () => {
    const was = useAppSettings.getState().style3d;
    const made = workspace3dOf({ primary: "glossy", secondary: "space", looks: { glossy: { ballScale: 0.3 } }, shared: { keyLight: 0.5 }, own: [] });
    const st = { docStyle3d: made };
    expect(style3dOf(st).primary.ballScale).toBe(0.3);
    expect(style3dOf(st).primary.bondColor).toBe("#6b7280");
    expect(style3dOf(st).keyLight).toBe(0.5);
    // (Settings changed since: the workspace keeps its looks and light; how a drag turns, the viewer's)
    useAppSettings.setState({ style3d: { primary: "balls", secondary: "space", looks: { glossy: { ballScale: 0.1 } }, shared: { keyLight: 1.5, turnPerHalfWidth: 5 }, own: [] } });
    expect(style3dOf(st).primary.ballScale).toBe(0.3);
    expect(style3dOf(st).keyLight).toBe(0.5);
    expect(style3dOf(st).turnPerHalfWidth).toBe(5);
    // (one style for one workspace's and one viewer's)
    expect(style3dOf(st)).toBe(style3dOf(st));
    useAppSettings.setState({ style3d: was });
    // (a page that is no workspace's: Meno's own)
    expect(style3dOf({})).toEqual(STYLE_3D);
  });
});
