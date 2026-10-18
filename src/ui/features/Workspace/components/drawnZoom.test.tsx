import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import ts from "typescript";
import { DrawnZoomContext, drawnZoomOf, useDrawnZoom } from "./drawnLayoutContext";
import { measured } from "../../../../testing/timeouts";

/** A line kept a pixel wide on the screen, in page units, at the zoom the drawing is taken up at. */
function Hair() {
  return <i>{(1 / useDrawnZoom()).toFixed(3)}</i>;
}

/** Something drawn only past a zoom: a number that changes as it is crossed, and only then. */
function Past() {
  return <i>{String(useDrawnZoom((z) => z < 2))}</i>;
}

describe("the zoom the drawing is taken up at", () => {
  it("is what a layer sized on the screen draws at: a zoom taken up draws it at the new one", () => {
    const zoom = drawnZoomOf(2);
    const drawn = () => renderToString(<DrawnZoomContext.Provider value={zoom}><Hair /><Past /></DrawnZoomContext.Provider>);
    expect(drawn()).toBe("<i>0.500</i><i>false</i>");
    zoom.set(4);
    expect(drawn()).toBe("<i>0.250</i><i>false</i>");
    zoom.set(1);
    expect(drawn()).toBe("<i>1.000</i><i>true</i>");
  });

  it("tells those who read it of a change, and of nothing else", () => {
    const zoom = drawnZoomOf(1);
    let heard = 0;
    const stop = zoom.subscribe(() => heard++);
    zoom.set(1);
    zoom.set(1.5);
    zoom.set(1.5);
    zoom.set(2);
    stop();
    zoom.set(3);
    expect(heard).toBe(2);
  });

  it("is read through useDrawnZoom by every layer of the drawing sized on the screen, never off the camera while it renders", () => {
    // (a layer reading the camera's zoom as it renders was drawn again at every
    // step of a zoom only because the layout's context changed with it; it no
    // longer does, so such a size would stay at the zoom it was last drawn at)
    const dir = join(__dirname);
    const offenders: string[] = [];
    for (const name of readdirSync(dir).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))) {
      const text = readFileSync(join(dir, name), "utf8");
      // (only the layers that read the drawing - but not those that draw themselves again as the view zooms, by a zoom
      // of their own: the PDF layer, and a workflow's parts, which start theirs at the camera's)
      if (!/from "\.\/drawnLayoutContext"/.test(text) || name === "Pdfs2D.tsx" || name === "Workflow2D.tsx") continue;
      const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isPropertyAccessExpression(node) && node.name.text === "zoom" && /\bcam(era)?\b/.test(node.expression.getText(file))) {
          // (the function it is read in: a component's own body is its render; a callback - a frame's, an effect's, a handler - is not)
          let f: ts.Node | undefined = node.parent;
          while (f && !ts.isFunctionLike(f)) f = f.parent;
          const named = f && (ts.isFunctionDeclaration(f) ? f.name?.text : ts.isVariableDeclaration(f.parent) ? f.parent.name.getText(file) : undefined);
          if (named && /^[A-Z]/.test(named)) offenders.push(`${name}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${named}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(offenders).toEqual([]);
  }, measured(260));
});
