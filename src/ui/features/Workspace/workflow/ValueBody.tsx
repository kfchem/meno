import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NumberValue, Table, TableColumn } from "../../../../lib/table";
import { ABOVE_DECIMALS, numberText } from "../../../../lib/calc/results";
import { axisLabel, chartSaid, howOf, ticksOf, type Axis, type ChartLeft, type ChartPoint, type ChartValue } from "../../../../lib/chart";
import { diagramHow, diagramSaid, frequenciesSaid, type DiagramLevel, type DiagramValue } from "../../../../lib/energyDiagram";
import { CHART_PX, TABLE_COLUMN_GAP_PX, TABLE_FOOT_PX, TABLE_GAP_PX, TABLE_HEAD_PX, TABLE_ROW_PX, TABLE_SHOWN_ROWS } from "./look";

/** How many of a table's rows its frame shows. */
const SHOWN_ROWS = TABLE_SHOWN_ROWS;
/** How many of its columns. */
const SHOWN_COLUMNS = 4;

/** A column's head as its frame shows it: its label - else its name - and a number's unit. */
const headOf = (c: TableColumn) => {
  const shown = c.label ?? c.name;
  return c.kind === "number" && c.unit !== "none" ? `${shown} (${c.unit})` : shown;
};
/** What a column's head says on hover: its head, and the name it is matched on where a label stands for it ("Product · reaction.product"). */
const headTitle = (c: TableColumn) => (c.label && c.label !== c.name ? `${headOf(c)} \u00b7 ${c.name}` : headOf(c));

/** A cell as its frame shows it: a number as Meno writes numbers, true or false, text as it is, none as a dash. */
const cellText = (v: string | number | boolean | null, decimals?: number) => (v == null ? "–" : typeof v === "number" ? numberText(v, decimals) : typeof v === "boolean" ? (v ? "true" : "false") : v);
/**
 * How many decimals a number column's numbers are written with, one count
 * for the column, so that their points line up - "0.00" over "0.37": an
 * energy in kcal/mol as a molecule's chip writes one under ten (calc/results
 * `aboveText`, two), so that the same value reads the same in both; any
 * other as many as the one of those shown that needs most (`numberText`).
 */
const decimalsOf = (c: TableColumn, values: readonly (string | number | boolean | null)[]) =>
  c.kind === "number" && c.unit === "kcal/mol" ? ABOVE_DECIMALS : Math.max(0, ...values.map((v) => (typeof v === "number" ? (numberText(v).split(".")[1]?.length ?? 0) : 0)));

/**
 * A set holding a table, inside its frame (docs/WORKFLOWS.md, *Tables*):
 * its first rows and columns, each number column with its unit; and what
 * it is - how many rows and columns, and how many cells did not read or
 * columns were left, said, never hidden.
 */
export function TableBody({ table }: { table: Table }) {
  const columns = table.columns.slice(0, SHOWN_COLUMNS);
  const rows = table.rows.slice(0, SHOWN_ROWS);
  const decimals = columns.map((c, j) => (c.kind === "number" ? decimalsOf(c, rows.map((r) => r[j])) : undefined));
  const said = [
    `${table.rows.length.toLocaleString("en-US")} ${table.rows.length === 1 ? "row" : "rows"} · ${table.columns.length} ${table.columns.length === 1 ? "column" : "columns"}`,
    ...(table.columns.length > SHOWN_COLUMNS ? [`the first ${SHOWN_COLUMNS} shown`] : []),
    ...(table.unread.length ? [`${table.unread.length} not read`] : []),
    ...(table.left.length ? [`${table.left.length} left`] : []),
  ].join(" · ");
  return (
    // (each height set as the set's frame counts it - look TABLE_*_PX - never left to its text)
    <div className="flex flex-col w-full text-[11px] leading-4" style={{ gap: TABLE_GAP_PX }} data-set-table="">
      <table className="w-full table-fixed border-collapse tabular-nums">
        <thead>
          <tr style={{ height: TABLE_HEAD_PX }}>
            {columns.map((c, j) => (
              // (a number's head over its numbers, at the right as they are; any other at the left)
              <th key={c.name} className={`truncate font-medium text-gh-gray border-b border-gh-line p-0 ${c.kind === "number" ? "text-right" : "text-left"}`} style={{ paddingLeft: j ? TABLE_COLUMN_GAP_PX : 0 }} title={headTitle(c)}>
                {headOf(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ height: TABLE_ROW_PX }}>
              {columns.map((c, j) => (
                <td key={c.name} className={`truncate p-0 text-gh-black ${c.kind === "number" ? "text-right" : ""}`} style={{ paddingLeft: j ? TABLE_COLUMN_GAP_PX : 0 }}>
                  {cellText(r[j], decimals[j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-gh-gray" style={{ height: TABLE_FOOT_PX, lineHeight: `${TABLE_FOOT_PX}px` }} title={[...table.unread.map((u) => `${u.column ? `${u.column}, ` : ""}row ${u.row}: ${u.why}`), ...table.left.map((l) => `${l.column}: ${l.why}`)].join("\n") || undefined}>
        {said}
      </div>
    </div>
  );
}

/** A set holding a number, inside its frame: the number with its unit, and what worked it out, where known. */
export function NumberBody({ number }: { number: NumberValue }) {
  const how = howOf(number);
  return (
    <div className="flex flex-col items-start gap-0.5" data-set-number="">
      <span className="text-2xl leading-8 font-medium text-gh-black tabular-nums">
        {numberText(number.value)}
        {number.unit !== "none" && <span className="ml-1 text-sm text-gh-gray">{number.unit}</span>}
      </span>
      <span className="text-[10px] text-gh-gray">{how || "What worked it out: not stated"}</span>
    </div>
  );
}

/** What a chart left out, a line for each why, with what it names (`ChartLeft.rows`): said when its count line is pointed at. A chart's are rows; a diagram's say what they are. */
const leftSaid = (left: readonly ChartLeft[], rows: boolean) =>
  left.map((l) => `${l.count}${rows ? ` ${l.count === 1 ? "row" : "rows"}` : ""} ${l.why}${l.rows.length ? `: ${l.rows.join(", ")}` : ""}`).join("\n") || undefined;

/** An axis's label in full: its name and unit, and what worked its numbers out. */
const labelOf = (a: Axis) => [axisLabel(a), howOf(a)].filter(Boolean).join(" \u00b7 ");

/** Where a chart's points are drawn inside its frame, in px: room below for the across axis's numbers and label and what it is - and left, for the up axis's label and its widest number (`DIGIT` each character). */
const PLOT = { right: 12, top: 6, bottom: 50, label: 22 };
const DIGIT = 6.2;
/** A point's radius, in px; how far a press moves before it is a drag. */
const DOT = 3;
const DRAG = 4;

/**
 * A chart's axes and ticks: part of what it draws - in its numbers' grey,
 * not a frame's line - and a screen pixel wide at least, whatever the zoom
 * (`--hair`, the page's layer's), so that zoomed out they still read as axes.
 */
const AXIS = { className: "stroke-gh-gray", style: { strokeWidth: "max(1px, var(--hair, 1px))" } } as const;

/**
 * A chart's body, its words - each a span over its drawing, which is SVG -
 * gone where they are too small to read (`.meno-words`, utils/pageScale
 * `wordsReadAt`: switched past a threshold, faded over a short time): a chart at a fit zoom is still its points
 * and axes, never an empty frame.
 */
const wordsOf = () => "meno-words-each relative text-[10px] leading-3 text-gh-gray tabular-nums";

/**
 * A set holding a chart, inside its frame (docs/WORKFLOWS.md, *Charts*):
 * one column against the other, each axis with its numbers, its name and
 * unit and what worked it out; a point for each row with both, said - its
 * row and values - while it is pointed at, its entry shown where it is
 * pressed (`onPoint`); and how many points there are, and how many rows
 * were left and why, never hidden. A point dragged (`onPointDrag`) tells
 * where to, in the axes' own units - for what is to work with it; nothing
 * on the page does yet.
 */
export function ChartBody({
  chart,
  onPoint,
  onPointDrag,
}: {
  chart: ChartValue;
  onPoint?: (p: ChartPoint) => void;
  onPointDrag?: (p: ChartPoint, to: { x: number; y: number }) => void;
}) {
  const [pointed, setPointed] = useState<ChartPoint | null>(null);
  const pressed = useRef<{ p: ChartPoint; x: number; y: number; moved: boolean } | null>(null);
  const xs = chart.points.map((p) => p.x);
  const ys = chart.points.map((p) => p.y);
  const tx = ticksOf(xs.length ? Math.min(...xs) : 0, xs.length ? Math.max(...xs) : 1);
  const ty = ticksOf(ys.length ? Math.min(...ys) : 0, ys.length ? Math.max(...ys) : 1);
  const left = PLOT.label + Math.ceil(DIGIT * Math.max(...ty.ticks.map((t) => numberText(t).length))) + 8;
  const w = CHART_PX.w - left - PLOT.right;
  const h = CHART_PX.h - PLOT.top - PLOT.bottom;
  const px = (v: number) => ((v - tx.from) / (tx.to - tx.from)) * w;
  const py = (v: number) => h - ((v - ty.from) / (ty.to - ty.from)) * h;
  const rowsLeft = chart.left.reduce((n, l) => n + l.count, 0);
  const said = pointed
    ? `Row ${pointed.row + 1}${pointed.is ? ` \u00b7 ${pointed.is}` : ""} \u00b7 ${chart.x.name} ${numberText(pointed.x)}${chart.x.unit === "none" ? "" : ` ${chart.x.unit}`} \u00b7 ${chart.y.name} ${numberText(pointed.y)}${chart.y.unit === "none" ? "" : ` ${chart.y.unit}`}`
    : chartSaid(chart);
  const down = (p: ChartPoint, e: ReactPointerEvent) => {
    e.stopPropagation();
    pressed.current = { p, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const at = pressed.current;
    if (!at) return;
    if (!at.moved && Math.hypot(e.clientX - at.x, e.clientY - at.y) < DRAG) return;
    at.moved = true;
    if (!onPointDrag) return;
    // (where to, in the axes' units: the page's zoom taken out by the plot's own size on screen)
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    onPointDrag(at.p, { x: tx.from + fx * (tx.to - tx.from), y: ty.to - fy * (ty.to - ty.from) });
  };
  const up = () => {
    const at = pressed.current;
    pressed.current = null;
    if (at && !at.moved) onPoint?.(at.p);
  };
  return (
    <div className={wordsOf()} style={{ width: CHART_PX.w, height: CHART_PX.h }} data-set-chart="">
      <svg
        className="absolute overflow-visible"
        style={{ left: left, top: PLOT.top, pointerEvents: "auto" }}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (pressed.current = null)}
      >
        <rect x={0} y={0} width={w} height={h} className="fill-none stroke-gh-gray" style={AXIS.style} />
        {tx.ticks.map((t) => (
          <line key={`x${t}`} x1={px(t)} x2={px(t)} y1={h} y2={h + 4} {...AXIS} />
        ))}
        {ty.ticks.map((t) => (
          <line key={`y${t}`} x1={-4} x2={0} y1={py(t)} y2={py(t)} {...AXIS} />
        ))}
        {chart.points.map((p, i) => (
          <circle
            key={i}
            cx={px(p.x)}
            cy={py(p.y)}
            r={pointed === p ? DOT + 1.5 : DOT}
            className={pointed === p ? "fill-accel-base" : "fill-accel-base/70"}
            style={{ cursor: onPoint ? "pointer" : undefined }}
            onPointerEnter={() => setPointed(p)}
            onPointerLeave={() => setPointed((q) => (q === p ? null : q))}
            onPointerDown={(e) => down(p, e)}
          />
        ))}
      </svg>
      {/* (the axes' numbers and labels in HTML: SVG text is not drawn on the page's layer) */}
      {tx.ticks.map((t) => (
        <span key={`x${t}`} className="absolute -translate-x-1/2" style={{ left: left + px(t), top: PLOT.top + h + 6 }}>
          {numberText(t)}
        </span>
      ))}
      {ty.ticks.map((t) => (
        <span key={`y${t}`} className="absolute -translate-y-1/2 text-right" style={{ right: CHART_PX.w - left + 6, top: PLOT.top + py(t) }}>
          {numberText(t)}
        </span>
      ))}
      <span className="absolute -translate-x-1/2 whitespace-nowrap text-gh-black" style={{ left: left + w / 2, top: PLOT.top + h + 20 }} data-axis="x">
        {labelOf(chart.x)}
      </span>
      <span className="absolute whitespace-nowrap text-gh-black origin-center -rotate-90" style={{ left: PLOT.label / 2 - h / 2, top: PLOT.top + h / 2 - 6, width: h, textAlign: "center" }} data-axis="y">
        {labelOf(chart.y)}
      </span>
      <span className="absolute left-0 right-0 truncate" style={{ top: CHART_PX.h - 12 }} title={leftSaid(chart.left, true)}>
        {said}
        {!pointed && rowsLeft ? ` (${chart.left.map((l) => `${l.count} ${l.why}`).join(", ")})` : ""}
      </span>
    </div>
  );
}

/** A value relative to the reference as a level says it: to a tenth of a kcal/mol, signed. */
const relative = (v: number) => {
  const t = numberText(v, 1);
  return t === "0.0" ? t : v > 0 ? `+${t}` : t;
};

/**
 * A set holding an energy diagram, inside its frame (docs/WORKFLOWS.md,
 * *Energy diagrams*): each level a bar at its energy relative to the
 * reference, its name above and its value below, the lines between levels
 * dashed; the axis its quantity, unit and what worked it out. A level
 * pointed at says its value and, where it stands for several, of how many
 * it is the lowest and which; pressed, its lowest is shown (`onLevel`).
 * How many levels, relative to which, and what was left, never hidden.
 */
export function DiagramBody({ diagram, onLevel }: { diagram: DiagramValue; onLevel?: (l: DiagramLevel) => void }) {
  const [pointed, setPointed] = useState<DiagramLevel | null>(null);
  const values = diagram.levels.map((l) => l.value);
  const ty = ticksOf(Math.min(0, ...values), Math.max(0, ...values));
  const left = PLOT.label + Math.ceil(DIGIT * Math.max(...ty.ticks.map((t) => numberText(t).length))) + 8;
  // (room above the highest bar for its name, below the lowest for its value)
  const top = PLOT.top + 14;
  const w = CHART_PX.w - left - PLOT.right;
  // (room below for the lowest's value, and two lines saying what it is)
  const h = CHART_PX.h - top - 46;
  const slot = w / Math.max(1, diagram.levels.length);
  const bar = Math.min(48, slot * 0.6);
  const cx = (k: number) => slot * (k + 0.5);
  const py = (v: number) => h - ((v - ty.from) / (ty.to - ty.from)) * h;
  const rowsLeft = diagram.left.reduce((n, l) => n + l.count, 0);
  const said = pointed
    ? [
        `${pointed.name} \u00b7 ${relative(pointed.value)} kcal/mol`,
        ...(pointed.lowestOf > 1 ? [`lowest of ${pointed.lowestOf}${pointed.lowest.number != null ? `: #${pointed.lowest.number}` : ""}`] : []),
        // (its imaginary frequencies, as the entry it stands at has them - said, whatever it should be)
        ...(pointed.lowest.imaginary == null ? [] : [frequenciesSaid(pointed.lowest.imaginary)]),
      ].join(" \u00b7 ")
    : [diagramSaid({ ...diagram, left: [] }), diagramHow(diagram.axis), rowsLeft ? `${rowsLeft} left (${diagram.left.map((l) => `${l.count} ${l.why}`).join(", ")})` : ""].filter(Boolean).join(" \u00b7 ");
  return (
    <div className={wordsOf()} style={{ width: CHART_PX.w, height: CHART_PX.h }} data-set-diagram="">
      <svg className="absolute overflow-visible" style={{ left, top, pointerEvents: "auto" }} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line x1={0} x2={0} y1={0} y2={h} {...AXIS} />
        {ty.ticks.map((t) => (
          <line key={t} x1={-4} x2={0} y1={py(t)} y2={py(t)} {...AXIS} />
        ))}
        {diagram.links.map(([a, b], i) => {
          const [p, q] = a < b ? [a, b] : [b, a];
          return <line key={i} x1={cx(p) + bar / 2} x2={cx(q) - bar / 2} y1={py(diagram.levels[p].value)} y2={py(diagram.levels[q].value)} className="stroke-gh-gray" strokeWidth={1} strokeDasharray="3 3" />;
        })}
        {diagram.levels.map((l, k) => (
          <g key={k} style={{ cursor: onLevel ? "pointer" : undefined }} onPointerEnter={() => setPointed(l)} onPointerLeave={() => setPointed((q) => (q === l ? null : q))} onPointerDown={(e) => e.stopPropagation()} onClick={() => onLevel?.(l)}>
            {/* (a band wider than the bar, so that it is easy to point at) */}
            <rect x={cx(k) - slot / 2} y={py(l.value) - 8} width={slot} height={16} fill="transparent" />
            <line x1={cx(k) - bar / 2} x2={cx(k) + bar / 2} y1={py(l.value)} y2={py(l.value)} className={pointed === l ? "stroke-accel-base" : "stroke-gh-black"} strokeWidth={pointed === l ? 3 : 2} />
          </g>
        ))}
      </svg>
      {/* (names, values, the axis's numbers and label in HTML: SVG text is not drawn on the page's layer) */}
      {diagram.levels.map((l, k) => (
        <span key={`n${k}`} className="absolute -translate-x-1/2 truncate text-center text-gh-black" style={{ left: left + cx(k), top: top + py(l.value) - 14, maxWidth: slot }}>
          {l.name}
        </span>
      ))}
      {diagram.levels.map((l, k) => (
        <span key={`v${k}`} className="absolute -translate-x-1/2 text-center" style={{ left: left + cx(k), top: top + py(l.value) + 3 }}>
          {relative(l.value)}
        </span>
      ))}
      {ty.ticks.map((t) => (
        <span key={`y${t}`} className="absolute -translate-y-1/2 text-right" style={{ right: CHART_PX.w - left + 6, top: top + py(t) }}>
          {numberText(t)}
        </span>
      ))}
      <span className="absolute whitespace-nowrap text-gh-black origin-center -rotate-90" style={{ left: PLOT.label / 2 - h / 2, top: top + h / 2 - 6, width: h, textAlign: "center" }} data-axis="y">
        {axisLabel(diagram.axis)}
      </span>
      {/* (wrapped, two lines at most, never cut short where it fits: what worked it out is said here, the axis kept short) */}
      <span className="absolute left-0 right-0 bottom-0 overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} title={leftSaid(diagram.left, false)}>
        {said}
      </span>
    </div>
  );
}
