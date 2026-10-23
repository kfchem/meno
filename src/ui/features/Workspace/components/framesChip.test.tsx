import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { barsAbove, FAILURES_ASTRAY, FramesChip } from "./Frames3D";

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

  it("says why the frame told failed, and how many warnings its calculation gave - in full, opened, in the program's words", () => {
    const failed = [null, { kind: "not-converged" as const, why: "The optimisation did not converge" }];
    const warnings = [{ kind: "hessian-not-stationary" as const, text: "hessian_numhess: Hessian on incompletely optimized geometry!" }];
    const at = (frame: number) => renderToString(<FramesChip count={2} frame={frame} open={false} onFrame={none} about="xtb" failed={failed} warnings={warnings} />);
    expect(at(1)).toContain("not converged");
    expect(at(1)).toContain("The optimisation did not converge");
    expect(at(1)).toContain("1 warning");
    expect(at(1)).toContain("Frequencies at a geometry not fully optimised");
    expect(at(1)).toContain("hessian_numhess: Hessian on incompletely optimized geometry!");
    // (another frame, which did not fail: its warnings alone)
    expect(at(0)).not.toContain("not converged");
    expect(at(0)).toContain("1 warning");
  });

  it("stands each bar above the lowest of the frames that finished - one that failed is no zero, and has no bar, said on it", () => {
    // (1 Eh = 627.5094740631 kcal/mol, CODATA 2018: 0.0015936014 Eh is 1.000000 kcal/mol; the third, not converged, the lowest)
    const energies = [-76, -76.0015936014, -77];
    const failed = [null, null, { kind: "not-converged" as const, why: "stopped at 200 cycles" }];
    const { above, noBaseline } = barsAbove(energies, failed);
    expect([above[0], above[1], above[2], noBaseline]).toEqual([expect.closeTo(1, 6), 0, null, false]);
    expect(barsAbove(energies, undefined, true)).toEqual({ above: [null, null, null], noBaseline: true });
    // (opened: the failed one's bar outlined, why on it; told, it says it did not finish)
    const html = renderToString(<FramesChip count={3} frame={2} open={false} onFrame={none} energies={energies} failed={failed} conformers />);
    expect(html).toContain("data-unfinished");
    expect(html).toContain("<title>not converged</title>");
    expect(html).toContain("not finished");
    expect(renderToString(<FramesChip count={3} frame={0} open={false} onFrame={none} energies={energies} marksUnread conformers />)).toContain("none finished: no lowest to stand above");
  });

  it("takes no frame as finished where its failures are not one to each frame - none stands above another, and it says so", () => {
    const energies = [-76, -76.0015936014, -77];
    const short = [null, { kind: "not-converged" as const, why: "x" }];
    expect(barsAbove(energies, short)).toEqual({ above: [null, null, null], noBaseline: true, why: FAILURES_ASTRAY });
    expect(renderToString(<FramesChip count={3} frame={0} open={false} onFrame={none} energies={energies} failed={short} conformers />)).toContain(FAILURES_ASTRAY.replace("'", "&#x27;"));
  });

  it("breaks the profile of many frames at one that did not finish - never drawn at the foot, as if the lowest", () => {
    // (200 frames, too many for a bar each: the 101st, not converged, far the lowest)
    const energies = Array.from({ length: 200 }, (_, i) => (i === 100 ? -77 : -76 + i * 1e-5));
    const failed = energies.map((_, i) => (i === 100 ? { kind: "not-converged" as const, why: "x" } : null));
    const html = renderToString(<FramesChip count={200} frame={0} open={false} onFrame={none} energies={energies} failed={failed} conformers />);
    // (two pieces, either side of it, and it marked at the foot, why on it)
    expect(html.match(/<path d="M/g)).toHaveLength(2);
    expect(html.match(/data-unfinished/g)).toHaveLength(1);
    expect(html).toContain("<title>not converged</title>");
  });
});
