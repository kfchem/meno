import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { FramesChip } from "./Frames3D";

// Vitest runs in Node: the chip is drawn by the server's renderer, and
// whether it is open is read off its slider's row.

const none = () => {};
const slider = (html: string) => /grid-template-rows:\s*1fr/.test(html);

describe("a frames chip - a molecule's frames, or a stack's", () => {
  it("is shut as its molecule is pointed at or selected: it opens on a click (the maintainer, 2026-10-13)", () => {
    expect(slider(renderToString(<FramesChip count={5} frame={2} open={false} onFrame={none} />))).toBe(false);
    expect(slider(renderToString(<FramesChip count={5} frame={2} open onFrame={none} />))).toBe(false);
    expect(slider(renderToString(<FramesChip count={60} frame={0} open onFrame={none} title="aspirin" />))).toBe(false);
  });

  it("says which of how many, and the record's title, shut", () => {
    const html = renderToString(<FramesChip count={60} frame={2} open={false} onFrame={none} title="aspirin" />);
    expect(html).toContain("3<!-- --> / <!-- -->60");
    expect(html).toContain("aspirin");
    expect(html).toContain("cursor-pointer");
  });

  it("writes a conformer's energy and share by what they round to: 10.0 kcal/mol, not 10.00; >99%, not 100%, beside another", () => {
    const kcal = (e: number) => e / 627.509474;
    const at = (frame: number, energies: number[], populations: number[]) =>
      renderToString(<FramesChip count={energies.length} frame={frame} energies={energies} populations={populations} open={false} onFrame={none} />);
    const html = at(1, [0, kcal(9.9996)], [0.9999, 0.0001]);
    expect(html).toContain("10.0 kcal/mol");
    expect(html).toContain("&lt;1%");
    expect(at(0, [0, kcal(9.9996)], [0.9999, 0.0001])).toContain("&gt;99%");
    expect(at(1, [0, kcal(9.994)], [0.5, 0.5])).toContain("9.99 kcal/mol");
    expect(at(0, [0, kcal(30)], [1, 0])).toContain("100%");
  });
});
