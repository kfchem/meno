import { describe, expect, it } from "vitest";
import { setInstalled, usePluginsHere } from "./known";
import { removeFiles } from "./online";

describe("the plugins in place, taken anew", () => {
  it("are counted each time, so that what lists them is drawn again - one whose files were taken away gone from it at once", async () => {
    const before = usePluginsHere.getState().taken;
    setInstalled([]);
    expect(usePluginsHere.getState().taken).toBe(before + 1);
    // (Remove its files: its folder taken away, then the plugins in place taken anew)
    const done: string[] = [];
    await removeFiles(
      "gaussian",
      async (id) => void done.push(`removed ${id}`),
      async () => {
        done.push("taken anew");
        setInstalled([]);
      },
    );
    expect(done).toEqual(["removed gaussian", "taken anew"]);
    expect(usePluginsHere.getState().taken).toBe(before + 2);
  });
});
