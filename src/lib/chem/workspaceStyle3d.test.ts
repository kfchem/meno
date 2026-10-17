import { describe, expect, it } from "vitest";
import { BALL_AND_STICK, DEFAULT_STYLE_3D_CHOICE, lookOfStyle, withDuplicate3d, withRenamed3d, withRole, type Style3DChoice } from "./style3d";
import {
  acceptWorkspace3d,
  carriedId,
  fromCards,
  mixLook3d,
  sameLook3d,
  style3dIn,
  withRoleIn,
  workspace3dOf,
  workspaceCards,
} from "./workspaceStyle3d";

const OWN = "own-00000000-0000-4000-8000-000000000001";
const lab: Style3DChoice = {
  ...DEFAULT_STYLE_3D_CHOICE,
  primary: OWN,
  looks: { space: { occlusion: 0.3 } },
  shared: { keyLight: 0.6, turnPerHalfWidth: 4 },
  own: [{ id: OWN, name: "Lab figures", look: { ...BALL_AND_STICK, ballScale: 0.16, colours: { C: "#333333" } } }],
};

describe("a workspace's styles in 3D", () => {
  it("are Settings' as it is made, each whole - a built-in one with its changes, one of the user's own - and their light", () => {
    const ws = workspace3dOf(lab);
    expect(ws.primary).toEqual({ id: OWN, name: "Lab figures", look: lab.own[0].look });
    expect(ws.secondary.id).toBe("space");
    expect(ws.secondary.look.occlusion).toBe(0.3);
    expect(ws.scene.keyLight).toBe(0.6);
    // (how a drag turns a molecule is the viewer's, not the workspace's)
    expect("turnPerHalfWidth" in ws.scene).toBe(false);
  });

  it("draw the same wherever they are opened, whatever styles that Settings has, how they turn the viewer's", () => {
    const ws = workspace3dOf(lab);
    const elsewhere: Style3DChoice = { ...DEFAULT_STYLE_3D_CHOICE, shared: { keyLight: 1.4, turnPerHalfWidth: 2 } };
    const here = style3dIn(ws, lab);
    const there = style3dIn(ws, elsewhere);
    expect(there.primary).toEqual(here.primary);
    expect(there.secondary).toEqual(here.secondary);
    expect(there.keyLight).toBe(0.6);
    expect(there.turnPerHalfWidth).toBe(2);
  });

  it("read back from their file exactly as they were written", () => {
    const ws = workspace3dOf(lab);
    expect(acceptWorkspace3d(JSON.parse(JSON.stringify(ws)))).toEqual(ws);
    // (what does not read: none - the file opens in Settings')
    expect(acceptWorkspace3d(null)).toBeNull();
    expect(acceptWorkspace3d({ primary: { id: "nobody's", name: "X", look: {} }, secondary: ws.secondary })).toBeNull();
    expect(acceptWorkspace3d({ ...ws, primary: { ...ws.primary, name: "" } })).toBeNull();
    // (a light's setting out of bounds: Meno's own)
    expect(acceptWorkspace3d({ ...ws, scene: { ...ws.scene, keyLight: 99 } })!.scene.keyLight).toBe(1);
  });

  it("put a style carried that this computer's Settings has none like on a card of its own, In this workspace", () => {
    const ws = workspace3dOf(lab);
    // (here, as made: the user's own and the built-in one, no card of the workspace's)
    expect(workspaceCards(ws, lab).carried.size).toBe(0);
    expect(workspaceCards(ws, lab).choice.primary).toBe(OWN);
    // (on a computer without Lab figures, and with Space-filling as Meno has it: both carried)
    const { choice, carried } = workspaceCards(ws, DEFAULT_STYLE_3D_CHOICE);
    expect([...carried]).toEqual([carriedId("primary"), carriedId("secondary")]);
    expect(choice.own.map((o) => o.name)).toEqual(["Lab figures", "Space-filling"]);
    expect(lookOfStyle(choice, choice.primary)).toEqual(ws.primary.look);
    // (the user's own of the same id, changed since: the workspace's copy a card of its own beside it)
    const changed: Style3DChoice = { ...lab, own: [{ ...lab.own[0], look: { ...lab.own[0].look, ballScale: 0.3 } }] };
    const both = workspaceCards(ws, changed);
    expect(both.choice.primary).toBe(carriedId("primary"));
    expect(both.choice.own.map((o) => o.id)).toEqual([OWN, carriedId("primary")]);
  });

  it("take a style given a role from the cards whole, swap as Settings' do, and leave Settings' own to Settings", () => {
    const ws = workspace3dOf(lab);
    const { choice } = workspaceCards(ws, DEFAULT_STYLE_3D_CHOICE);
    // (Glossy, as this computer has it, as the primary)
    const glossy = fromCards(ws, DEFAULT_STYLE_3D_CHOICE, withRole(choice, "primary", "glossy"));
    expect(glossy.ws.primary.id).toBe("glossy");
    expect(glossy.ws.secondary).toBe(ws.secondary);
    expect(glossy.viewer).toBe(DEFAULT_STYLE_3D_CHOICE);
    // (the two swapped)
    const swapped = fromCards(ws, DEFAULT_STYLE_3D_CHOICE, withRole(choice, "primary", choice.secondary));
    expect(swapped.ws.primary).toBe(ws.secondary);
    expect(swapped.ws.secondary).toBe(ws.primary);
    // (a carried one duplicated: into the user's own, the workspace as it was)
    const dup = fromCards(ws, DEFAULT_STYLE_3D_CHOICE, withDuplicate3d(choice, choice.primary).choice);
    expect(dup.ws).toBe(ws);
    expect(dup.viewer.own).toHaveLength(1);
    expect(dup.viewer.own[0].name).toBe("Lab figures copy");
    expect(sameLook3d(dup.viewer.own[0].look, ws.primary.look)).toBe(true);
    // (the user's own renamed: Settings' alone - the workspace keeps the name it carries)
    const renamed = fromCards(ws, lab, withRenamed3d(workspaceCards(ws, lab).choice, OWN, "Group figures"));
    expect(renamed.ws).toBe(ws);
    expect(renamed.viewer.own[0].name).toBe("Group figures");
    expect(withRoleIn(ws, "primary", ws.primary)).toBe(ws);
  });

  it("go over from one look to another, each number and colour between, the rest at once", () => {
    const a = { ...BALL_AND_STICK, ballScale: 0.2, bondColor: "#000000", colours: {} };
    const b = { ...BALL_AND_STICK, ballScale: 0.4, bondColor: "#ffffff", colours: { C: "#ff0000" }, multipleBonds: "one" as const };
    const half = mixLook3d(a, b, 0.5);
    expect(half.ballScale).toBeCloseTo(0.3, 12);
    expect(half.bondColor).toBe("#808080");
    expect(half.multipleBonds).toBe("one");
    // (carbon from Jmol's grey, #909090, half way to red)
    expect(half.colours.C).toBe("#c84848");
    expect(mixLook3d(a, b, 1)).toBe(b);
    expect(mixLook3d(b, b, 0.5)).toBe(b);
  });
});
