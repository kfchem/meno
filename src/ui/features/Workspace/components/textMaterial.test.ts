import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import ts from "typescript";
import { Text } from "troika-three-text";

const materialsOf = (t: Text): THREE.Material[] => ([] as THREE.Material[]).concat(t.material);

describe("a text's material, set as Labels2D sets it", () => {
  it("is two for an outlined text - its outline's and its letters' - and a setting on what `material` gives reaches neither", () => {
    const t = new Text();
    t.outlineWidth = "3.5%";
    const pair = t.material as unknown as THREE.Material[];
    expect(Array.isArray(pair)).toBe(true);
    expect(pair).toHaveLength(2);
    // (what `material-toneMapped={false}` did to a bold run: set on the pair, not on either)
    (pair as unknown as { toneMapped: boolean }).toneMapped = false;
    expect(pair.map((m) => m.toneMapped)).toEqual([true, true]);
    t.dispose();
  });

  it("follows its own base material, both of an outlined text's: neither tone mapped nor depth tested", () => {
    const t = new Text();
    t.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, toneMapped: false, depthTest: false, depthWrite: false });
    t.outlineWidth = "3.5%";
    expect(materialsOf(t).map((m) => [m.toneMapped, m.depthTest, m.depthWrite])).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
    t.outlineWidth = 0;
    expect(materialsOf(t).map((m) => [m.toneMapped, m.depthTest, m.depthWrite])).toEqual([[false, false, false]]);
    t.dispose();
  });

  it("is never set by `material-*` props on a <Text> anywhere in the UI: an outlined text would miss them", () => {
    const ui = join(__dirname, "../../..");
    const found: string[] = [];
    for (const name of readdirSync(ui, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))) {
      const text = readFileSync(join(ui, name), "utf8");
      if (!text.includes("material-")) continue;
      const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === "Text") {
          for (const a of node.attributes.properties) {
            if (ts.isJsxAttribute(a) && a.name.getText(file).startsWith("material-")) found.push(`${name}: ${a.name.getText(file)}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(found).toEqual([]);
  });
});
