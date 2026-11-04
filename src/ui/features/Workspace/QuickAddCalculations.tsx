import { useEffect, useRef, useState } from "react";
import { useAppSettings } from "../../../lib/settings/appSettings";
import ScrollRail from "../../controls/ScrollRail";
import { ProcedureGlyph, StepGlyph } from "./workflow/icons";
import { kindInfo, STEP_FAMILIES, type StepKind } from "./workflow/kinds";
import type { QuickGroup } from "./workflow/offered";
import { CALC_ROW, stepsMost } from "./quickAddLabel";

/** What Quick Add remembers of its list (lib/settings/appSettings `options`): who was opened last. */
const REMEMBERED = "quick-add";
/** The procedures' row, among who does steps. */
const PROCEDURES = "procedures";

/**
 * Quick Add's calculations (docs/WORKFLOWS.md, *A step: from Quick Add*; the maintainer, 2026-11-04): who does steps, a row
 * each - Meno's own first, then each plugin added, then the procedures saved - with how many it offers; one opened at a time
 * - who was opened last, Meno the first time - its steps under it, each its icon and its name, in their families (what
 * makes or sorts structures; energies; paths; charts) parted by a thin rule, opening and closing in a short ease, scrolling
 * within the list where they go past it, with a rail of Meno's own while they do. Up and Down go from row to row, Enter
 * does what is on it; a step's name is said on hover, as it is on the page.
 */
export default function QuickAddCalculations({
  steps,
  procedures,
  width,
  shown,
  onStep,
  onProcedure,
}: {
  steps: readonly QuickGroup[];
  procedures: readonly { id: string; name: string; needs: readonly string[] }[];
  width: number;
  /** Whether it shows - Calculations opened, or a wire let go - and so takes Up and Down. */
  shown: boolean;
  onStep: (kind: StepKind, by: string) => void;
  onProcedure?: (id: string) => void;
}) {
  const remembered = useAppSettings((s) => s.options[REMEMBERED]?.open);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  // (Meno's own first, then the plugins in their order)
  const groups = [...steps.filter((g) => g.by === "meno"), ...steps.filter((g) => g.by !== "meno")];
  const ids = [...groups.map((g) => g.by), ...(procedures.length ? [PROCEDURES] : [])];
  const [open, setOpen] = useState<string | undefined>(() => (typeof remembered === "string" && ids.includes(remembered) ? remembered : ids[0]));
  const choose = (by: string) => {
    setOpen((o) => (o === by ? undefined : by));
    rememberOptions(REMEMBERED, { open: by });
  };
  // (Up and Down: the row before or after, among those that show - taken wherever the keys are while it shows, as a click
  //  on a row leaves them on the page in a Mac's webview; never from a field being typed in, the SMILES field's)
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>("button[data-row]") ?? [])].filter((b) => !b.closest("[inert]") && !b.disabled);
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      const next = rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shown]);
  const most = stepsMost(ids.length);
  return (
    <div ref={list} role="group" aria-label="Calculations" style={{ width }}>
      {groups.map((g) => {
        const isOpen = open === g.by;
        // (each family together, in order: what is kept of each kind's own order)
        const rank = (kind: StepKind) => STEP_FAMILIES.indexOf(kindInfo(kind).family);
        const sorted = [...g.steps].sort((a, b) => rank(a.kind) - rank(b.kind));
        return (
          <Section key={g.by} name={g.name} count={g.steps.length} open={isOpen} onToggle={() => choose(g.by)} most={most}>
            {sorted.map((k, i) => (
              <div key={k.kind}>
                {i > 0 && rank(k.kind) !== rank(sorted[i - 1].kind) && <div className="mx-3 my-1 border-t border-gh-line" role="separator" />}
                <Row name={k.name} label={`${k.name} · ${g.name}`} onClick={() => onStep(k.kind, g.by)}>
                  <StepGlyph icon={k.icon} size={18} stroke={2} />
                </Row>
              </div>
            ))}
          </Section>
        );
      })}
      {procedures.length > 0 && (
        <Section name="Procedures" count={procedures.length} open={open === PROCEDURES} onToggle={() => choose(PROCEDURES)} most={most}>
          {procedures.map((p) => (
            <Row key={p.id} name={p.needs.length ? `${p.name} - needs ${p.needs.join(" and ")}` : p.name} label={`Procedure: ${p.name}`} disabled={p.needs.length > 0} onClick={() => onProcedure?.(p.id)} text={p.name}>
              <ProcedureGlyph size={18} stroke={2} />
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

/** Who does steps: its row - its name and how many it offers, a chevron turning as it opens - and its steps under it, eased open and shut. */
function Section({ name, count, open, onToggle, most, children }: { name: string; count: number; open: boolean; onToggle: () => void; most: number; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={name}>
      <button
        data-row
        aria-expanded={open}
        onClick={onToggle}
        className={`w-full flex items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-colors duration-150 ease-meno focus-visible:bg-gh-base ${open ? "text-gh-black" : "text-gh-gray hover:bg-gh-base hover:text-gh-black"}`}
        style={{ height: CALC_ROW }}
      >
        <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden className="shrink-0 transition-transform duration-200 ease-meno" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1 truncate font-medium" title={name}>
          {name}
        </span>
        <span className="text-[11px] tabular-nums text-gh-gray">{count}</span>
      </button>
      <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
        <div className="overflow-hidden" inert={!open}>
          <ScrollRail maxHeight={most}>
            <div className="pb-1">{children}</div>
          </ScrollRail>
        </div>
      </div>
    </div>
  );
}

/** A step, or a procedure: its icon and its name, named in full on hover. */
function Row({ name, label, text, disabled, onClick, children }: { name: string; label: string; text?: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      data-row
      aria-label={label}
      title={name}
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center gap-2 rounded-md pl-5 pr-3 text-left text-xs text-gh-black outline-none hover:bg-gh-base focus-visible:bg-gh-base disabled:opacity-35 disabled:hover:bg-transparent transition-colors duration-150 ease-meno"
      style={{ height: CALC_ROW }}
    >
      {children}
      <span className="truncate">{text ?? name}</span>
    </button>
  );
}
