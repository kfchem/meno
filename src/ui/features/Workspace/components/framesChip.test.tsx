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

  it("holds what the calculation found in the chip itself, shut - none over the molecule - until it is clicked open (the maintainer, 2026-10-14)", () => {
    const results = [{ id: "dipole", on: "molecule" as const, group: "Properties", label: "Dipole moment", quantity: "dipole" as const, value: 1.85, rank: 2 }];
    const html = renderToString(<FramesChip count={5} frame={2} open={false} onFrame={none} about="xtb" results={results} />);
    // (in the chip, its row shut: no box above it)
    expect(html).toContain("Dipole moment");
    expect(html).not.toContain("bottom-full");
    expect(html).toMatch(/grid-template-rows:\s*0fr;\s*opacity:\s*0/);
    // (pointing at it alone opens nothing: open is the molecule's pointer, not a click)
    expect(renderToString(<FramesChip count={5} frame={2} open onFrame={none} about="xtb" results={results} />)).not.toMatch(/grid-template-rows:\s*1fr/);
  });

  it("says which of how many, and the record's title, shut", () => {
    const html = renderToString(<FramesChip count={60} frame={2} open={false} onFrame={none} title="aspirin" />);
    expect(html).toContain("3<!-- --> / <!-- -->60");
    expect(html).toContain("aspirin");
    expect(html).toContain("cursor-pointer");
  });

  it("says under a conformer set's bars what its energies are, in the words of what made them, whichever is shown", () => {
    const kcal = (e: number) => e / 627.509474;
    const energies = [0, kcal(0.5), kcal(1.2)];
    const made = { how: [], energies: "Field X" };
    const at = (frame: number) => renderToString(<FramesChip count={3} frame={frame} energies={energies} open onFrame={none} made={made} />);
    expect(at(0)).toContain("Energies from <!-- -->Field X");
    expect(at(2)).toContain("Energies from <!-- -->Field X");
    // (nothing said where what made them said nothing, nor for a calculation's, which says its own line)
    expect(renderToString(<FramesChip count={3} frame={0} energies={energies} open onFrame={none} made={{ how: [] }} />)).not.toContain("Energies from");
    expect(renderToString(<FramesChip count={3} frame={0} energies={energies} open onFrame={none} made={made} about="a calculation" />)).not.toContain("Energies from");
  });

  it("shows a conformer set of one as a set: its one bar, 1 / 1 with its energy and share, and what its energies are from (the maintainer, 2026-10-21)", () => {
    const made = { how: [], energies: "Field X" };
    const one = (conformers?: boolean) =>
      renderToString(<FramesChip count={1} frame={0} energies={[-100]} populations={[1]} open={false} onFrame={none} made={made} conformers={conformers} />);
    const html = one(true);
    expect(html).toContain("1<!-- --> / <!-- -->1");
    expect(html).toContain("0.00 kcal/mol");
    expect(html).toContain("100%");
    expect(html).toContain("Energies from <!-- -->Field X");
    expect(html).toContain('aria-label="Energy of each frame"');
    // (a single geometry read from a file, no conformer set, says none of it)
    expect(one(false)).not.toContain("1<!-- --> / <!-- -->1");
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
