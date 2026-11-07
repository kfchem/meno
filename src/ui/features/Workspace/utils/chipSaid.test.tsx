import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { FramesChip } from "../components/Frames3D";
import { setChipRuns, share, type SetChip } from "./chipSaid";

const none = () => {};

/** What the shut chip's HTML says on its line - its words, the tags and React's markers taken out. */
function saidInHtml(c: SetChip): string {
  const html = renderToString(<FramesChip {...(c as unknown as Parameters<typeof FramesChip>[0])} open={false} onFrame={none} />);
  const line = /<div class="w-max text-\[11px\][^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html)![1];
  return line
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

describe("a set's chip, shut, as runs to draw", () => {
  const kcal = (e: number) => e / 627.509474;
  const cases: [string, SetChip][] = [
    ["frames", { count: 5, frame: 2 }],
    ["conformers with energies and shares", { count: 3, frame: 1, energies: [0, kcal(0.42), kcal(1.3)], populations: [0.62, 0.3, 0.08] }],
    ["numbered and titled", { count: 3, frame: 0, numbers: [4, 9, 12], title: "Conformer A" }],
    ["one failed", { count: 3, frame: 1, energies: [0, kcal(0.4), kcal(0.9)], failed: [null, { kind: "program-error", why: "it stopped" }, null] }],
    ["a path from its start", { count: 4, frame: 3, energies: [0, kcal(2), kcal(5), kcal(1)], fromStart: true }],
  ];
  for (const [name, c] of cases)
    it(`says what its HTML says: ${name}`, () => {
      expect(setChipRuns(c).map((r) => r.text).join("")).toBe(saidInHtml(c));
    });

  it("tells which words are which tone, its title after a little room and cut at 14rem", () => {
    const runs = setChipRuns({ count: 3, frame: 0, numbers: [4, 9, 12], title: "Conformer A", populations: [0.5, 0.3, 0.2] });
    expect(runs.map((r) => r.tone)).toEqual(["ink", "quiet", "ink", "ink"]);
    expect(runs[2]).toMatchObject({ gapPx: 8, mostPx: 224 });
    expect(share(0.001)).toBe("<1%");
    expect(share(0.999)).toBe(">99%");
  });
});
