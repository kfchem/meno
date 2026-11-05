import { Fragment } from "react";
import { noDefault, rememberable, valuesOf, type Option, type OptionValues } from "../../../lib/options";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { useReaders } from "../../../lib/calc/workers";
import OptionRows from "../../options/OptionRows";
import { stepRole } from "../Workspace/store/slices/workflowSlice";
import { doersAdded, kindsOf, optionsFor } from "../Workspace/workflow/doers";
import { StepGlyph } from "../Workspace/workflow/icons";
import { kindInfo } from "../Workspace/workflow/kinds";

/**
 * Calculations in Settings (docs/WORKFLOWS.md, *Its options*): the
 * defaults, laid out as the settings beside them are - each plugin added
 * that does steps, then Meno, each its name and a card of the kinds of
 * step it fills, a row each, with under it its default options: what a
 * step put on the page starts with. Set here alone - a step's own options
 * are its own.
 */
export default function CalculationSettings() {
  const remembered = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  // (who does steps changes as plugins are added and taken away)
  useReaders((r) => r.state);
  return (
    <div className="space-y-5">
      {doersAdded().map((d) => (
        <div key={d.id}>
          <h3 className="mb-2 text-sm font-semibold text-gh-black">{d.name}</h3>
          <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
            {kindsOf(d.id).map((kind) => {
              const k = kindInfo(kind);
              // (lines a step reads - Enumerate's R groups - are its own, each for its template: no default of them)
              const options = optionsFor(kind, d.id).filter((o) => o.type !== "lines" && o.type !== "atoms");
              const role = stepRole(kind, d.id);
              return (
                <div key={kind} className="divide-y divide-gh-line/60">
                  <div className="px-3 py-2.5 flex items-center gap-3">
                    <span className="text-gh-gray">
                      <StepGlyph icon={k.icon} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-gh-black">{k.name}</span>
                  </div>
                  {/* (each option with no default - an Energy window's window - with its guide and Clear under it, as one row) */}
                  {partsOf(options).map((part, k) => {
                    const rows = (
                      <OptionRows
                        indent
                        options={part}
                        values={valuesOf(options, remembered[role])}
                        onChange={(values) => rememberOptions(role, rememberable(options, values))}
                      />
                    );
                    return part.some(noDefault) ? (
                      <div key={k}>
                        {rows}
                        <OwnValues options={part} own={remembered[role]} keep={(values) => rememberOptions(role, values)} />
                      </div>
                    ) : (
                      <Fragment key={k}>{rows}</Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A kind's options in parts, each ending at an option with no default - which its guide follows - and the rest after. */
export function partsOf(options: readonly Option[]): Option[][] {
  const parts: Option[][] = [[]];
  for (const o of options) {
    parts[parts.length - 1].push(o);
    if (noDefault(o)) parts.push([]);
  }
  return parts.filter((p) => p.length);
}

/**
 * Under a kind's options, each that has no default - an Energy window's
 * window, the chemist's own: its guide, and *Clear* where the chemist has
 * given one, which empties it again (`keep` given what is left).
 */
export function OwnValues({ options, own, keep }: { options: readonly Option[]; own: OptionValues | undefined; keep: (values: OptionValues) => void }) {
  return (
    <>
      {options.filter(noDefault).map((o) => {
        const given = own?.[o.id];
        const { [o.id]: _, ...rest } = own ?? {};
        return (
          <div key={o.id} className="pl-8 pr-3 pb-2.5 flex items-start gap-3 text-xs text-gh-gray">
            <p className="flex-1 max-w-2xl leading-snug">{o.note}</p>
            {typeof given === "number" && Number.isFinite(given) && (
              <button type="button" className="h-6 shrink-0 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black hover:bg-gh-base" onClick={() => keep(rest)}>
                Clear
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
