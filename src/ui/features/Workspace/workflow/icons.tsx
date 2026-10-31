import {
  CloudIcon,
  CpuChipIcon,
  CursorArrowRaysIcon,
  FunnelIcon,
  NumberedListIcon,
  PhotoIcon,
  PresentationChartLineIcon,
  QueueListIcon,
  SparklesIcon,
  Square2StackIcon,
  Square3Stack3DIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { isValidElement, type ComponentType, type ReactNode, type SVGProps } from "react";
import type { StepIcon } from "./kinds";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Each kind of step's icon (docs/WORKFLOWS.md, *Kinds of step*), each read
 * without its name (docs/LOOK.md, *Icons*; the maintainer, 2026-10-28): from
 * Heroicons' outline set where it has the thing itself, else drawn here on
 * Quick Add's 20-unit square - an energy well, a level, a spring, a mirror's
 * R/S - each kind its own.
 */
const ICONS: Record<StepIcon, Icon | ReactNode> = {
  rings: Square3Stack3DIcon,
  // (a ball at the bottom of an energy well, an arrow down into it)
  curve: (
    <>
      <path d="M2.5 4 C5 16.5, 15 16.5, 17.5 4" />
      <circle cx="10" cy="12.9" r="1.9" fill="currentColor" />
      <path d="M6.4 1.8 L9.2 7.6 M6.8 6.8 L9.3 7.9 L10.3 5.3" strokeWidth={2.2} />
    </>
  ),
  // (a level against an energy axis, measured up to)
  level: (
    <>
      <path d="M3.5 17 H16.5 M3.5 17 V3 M7 7 H15" />
      <path d="M11 16 V9.5 M9.4 11 L11 9 L12.6 11" strokeWidth={1.5} />
    </>
  ),
  // (two atoms on a spring: a vibration)
  wave: (
    <>
      <circle cx="3.6" cy="10" r="2.2" fill="currentColor" />
      <circle cx="16.4" cy="10" r="2.2" fill="currentColor" />
      <path d="M5.8 10 L7 7.5 L8.6 12.5 L10.2 7.5 L11.8 12.5 L13.2 7.5 L14.2 10" />
    </>
  ),
  cloud: CloudIcon,
  picture: PhotoIcon,
  // (levels, the lowest few within a bracket: a window of energies)
  band: (
    <>
      <path d="M4 4 H10 M4 7.5 H10 M4 11 H10 M4 14.5 H10 M4 17 H10" />
      <path d="M13 10 H15.5 V17.5 H13" strokeWidth={1.6} />
    </>
  ),
  // (a ring, ticked)
  check: (
    <>
      <path d="M9.00 16.90 L3.46 13.70 L3.46 7.30 L9.00 4.10 L14.54 7.30 L14.54 13.70 Z" />
      <path d="M6.2 10.6 L8.4 12.8 L12.6 8.2" strokeWidth={2} />
    </>
  ),
  // (R/S, as the drawing writes them: stereoisomers)
  twins: (
    <text x="10" y="14.6" textAnchor="middle" fontStyle="italic" fontWeight={600} fontSize={10} fill="currentColor" stroke="none" style={{ fontFamily: "inherit" }}>
      R/S
    </text>
  ),
  // (one and its copy: duplicates)
  copies: Square2StackIcon,
  // (a pie, one slice drawn out: shares)
  bars: (
    <>
      <path d="M9 11 V4 A7 7 0 1 0 16 11 Z" />
      <path d="M11.4 8.6 V2 A6.6 6.6 0 0 1 18 8.6 Z" />
    </>
  ),
  // (a ring and the lines of what is worked out for it)
  list: (
    <>
      <path d="M5.60 13.60 L2.48 11.80 L2.48 8.20 L5.60 6.40 L8.72 8.20 L8.72 11.80 Z" />
      <path d="M11.5 6 H17.5 M11.5 10 H17.5 M11.5 14 H16" />
    </>
  ),
  // (a ring, the others behind it, kept together in a bracket: one set of conformers)
  grouped: (
    <>
      <path d="M9.20 12.40 L5.74 10.40 L5.74 6.40 L9.20 4.40 L12.66 6.40 L12.66 10.40 Z" />
      <path d="M5.4 13.6 L9.2 15.8 L13 13.6 M5.4 16.2 L9.2 18.4 L13 16.2" strokeDasharray="1.3 1.5" />
      <path d="M16 4 H17.5 V18 H16" strokeWidth={1.5} />
    </>
  ),
  // (one ring, many from it)
  fan: (
    <>
      <path d="M5.00 13.00 L2.40 11.50 L2.40 8.50 L5.00 7.00 L7.60 8.50 L7.60 11.50 Z" />
      <path d="M8.8 10 L12.6 4.5 M8.8 10 H12.6 M8.8 10 L12.6 15.5" />
      <circle cx="15.4" cy="4" r="1.6" />
      <circle cx="15.4" cy="10" r="1.6" />
      <circle cx="15.4" cy="16" r="1.6" />
    </>
  ),
  pointer: CursorArrowRaysIcon,
  chart: PresentationChartLineIcon,
  sliders: FunnelIcon,
  sparks: SparklesIcon,
  // (an energy profile: levels joined over a barrier)
  levels: (
    <>
      <path d="M2 14.5 H5 M15 11.5 H18 M8 5.5 H12" />
      <path d="M5 14.5 C6.5 14.5, 6.5 5.5, 8 5.5 M12 5.5 C13.5 5.5, 13.5 11.5, 15 11.5" strokeDasharray="1.4 1.6" />
    </>
  ),
  tag: TagIcon,
  // (a positive and a negative species)
  charge: (
    <>
      <circle cx="6" cy="10" r="4" />
      <path d="M6 8 V12 M4 10 H8" />
      <circle cx="14.5" cy="10" r="4" />
      <path d="M12.5 10 H16.5" />
    </>
  ),
  // (two coming into one)
  link: (
    <>
      <path d="M2.5 5 C8 5, 8 10, 11 10 M2.5 15 C8 15, 8 10, 11 10 H15.5" />
      <path d="M13.4 7.6 L16.4 10 L13.4 12.4" />
    </>
  ),
  // (a distance between two marks)
  span: (
    <>
      <path d="M3 6 V14 M17 6 V14 M4.5 10 H15.5" />
      <path d="M6.8 8 L4.6 10 L6.8 12 M13.2 8 L15.4 10 L13.2 12" />
    </>
  ),
  // (two lists made one, the first's then the second's)
  merge: (
    <>
      <path d="M2.5 4 H7 M2.5 7 H7 M2.5 13 H7 M2.5 16 H7" />
      <path d="M8.5 5.5 C10.2 5.5, 10 10, 11.5 10 M8.5 14.5 C10.2 14.5, 10 10, 11.5 10" />
      <path d="M13.5 4 H17.5 M13.5 8 H17.5 M13.5 12 H17.5 M13.5 16 H17.5" />
    </>
  ),
  // (three atoms where they stand, then the same atoms bonded)
  rebond: (
    <>
      <circle cx="4" cy="6.5" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="2.8" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="6.5" r="2.1" fill="currentColor" stroke="none" />
      <path d="M4 17 L10 13.3 L16 17" />
      <circle cx="4" cy="17" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="13.3" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="17" r="2.1" fill="currentColor" stroke="none" />
    </>
  ),
  // (the same atom before and after: across the reaction arrow, linked)
  mapped: (
    <>
      <circle cx="3.6" cy="7" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="16.4" cy="7" r="2.3" fill="currentColor" stroke="none" />
      <path d="M6.8 7 H13.4 M11.4 5.1 L13.4 7 L11.4 8.9" />
      <path d="M3.6 10.4 V14.2 H16.4 V10.4" strokeDasharray="1.3 1.6" />
    </>
  ),
  // (an atom moved along: where it stood, dashed)
  moved: (
    <>
      <circle cx="6" cy="10" r="3.2" strokeDasharray="1.4 1.5" />
      <circle cx="14" cy="10" r="3.2" fill="currentColor" stroke="none" />
      <path d="M7.6 10 H9.8 M8.5 8.5 L10 10 L8.5 11.5" strokeWidth={1.5} />
    </>
  ),
  // (a chain as drawn, the same as its reference)
  compare: (
    <>
      <path d="M3 6 L7.5 2.5 L12.5 6 L17 2.5 M3 17.5 L7.5 14 L12.5 17.5 L17 14" />
      <path d="M7 8.8 H13 M7 11.7 H13" />
    </>
  ),
  // (a minimum, held: Optimise's well, its floor hatched as Restraints' wall)
  heldMinimum: (
    <>
      <path d="M2.5 4 C5 16.5, 15 16.5, 17.5 4" />
      <circle cx="10" cy="11.5" r="1.9" fill="currentColor" stroke="none" />
      <path d="M6.4 14.6 l-1.6 2.2 M8.9 15.3 l-1.6 2.2 M11.4 15.3 l-1.6 2.2 M13.9 14.6 l-1.6 2.2" />
    </>
  ),
  // (two atoms held to a wall: restraints)
  held: (
    <>
      <path d="M3.2 3.5 V16.5 M3.2 10 H7 M11.2 10 H13.8" />
      <path d="M3.2 4.2 l-1.8 1.8 M3.2 7.4 l-1.8 1.8 M3.2 10.6 l-1.8 1.8 M3.2 13.8 l-1.8 1.8" />
      <circle cx="9" cy="10" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="2.2" fill="currentColor" stroke="none" />
    </>
  ),
  // (four atoms anti, a torsion at 180, held: Restraints' hatching under it)
  heldAnti: (
    <>
      <path d="M2.6 12.6 L7.2 5.6 L12.8 11.6 L17.4 4.6 M4.8 17 H15.2" />
      <circle cx="2.6" cy="12.6" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="7.2" cy="5.6" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="11.6" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="4.6" r="1.9" fill="currentColor" stroke="none" />
      <path d="M6.6 17 l-1.6 2 M9.4 17 l-1.6 2 M12.2 17 l-1.6 2 M15 17 l-1.6 2" />
      <path d="M10 8.8 V17" strokeWidth={1} strokeDasharray="0.1 1.8" />
    </>
  ),
  // (a gentle path, frames taken along it: one size, none at an end, the line thin under them)
  frames: (
    <>
      <path d="M1.5 13.25 C8 13.25, 12 6.75, 18.5 6.75" strokeWidth={1.5} />
      <circle cx="5.97" cy="12.24" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none" />
      <circle cx="14.03" cy="7.76" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  // (a way over a barrier between two structures, its top the point refined)
  path: (
    <>
      <path d="M5.3 14.5 C7.6 14.5, 7.8 6.5, 10 6.5 C12.2 6.5, 12.4 14.5, 14.7 14.5" />
      <circle cx="3.1" cy="14.5" r="2.2" />
      <circle cx="16.9" cy="14.5" r="2.2" />
      <circle cx="10" cy="6.5" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  // (a list numbered: entries in order, their places)
  numbered: NumberedListIcon,
  // (two tables, a row of each linked: put on by a key)
  join: (
    <>
      <rect x="2" y="3.5" width="6.5" height="13" rx="1.3" />
      <rect x="11.5" y="3.5" width="6.5" height="13" rx="1.3" />
      <path d="M2 7.8 H8.5 M2 12.2 H8.5 M11.5 7.8 H18 M11.5 12.2 H18" strokeWidth={1} />
      <path d="M8.5 10 H11.5" strokeWidth={2.2} />
    </>
  ),
  // (a barrier's height above its start, measured)
  height: (
    <>
      <path d="M6 16.5 H7.5 C10 16.5, 10.3 5, 13 5 C15.4 5, 15.8 12.5, 18 12.5" />
      <path d="M3 16.5 V5.4 M1.5 7.2 L3 5.2 L4.5 7.2 M1.5 16.5 H4.5" />
      <path d="M5.2 5 H10.6" strokeDasharray="1.2 1.6" strokeWidth={1.1} />
    </>
  ),
  // (two values, summed)
  sum: (
    <>
      <rect x="1.8" y="6" width="5.4" height="8" rx="1.2" />
      <rect x="12.8" y="6" width="5.4" height="8" rx="1.2" />
      <path d="M10 7.6 V12.4 M7.6 10 H12.4" />
    </>
  ),
  // (a number typed in a field)
  number: (
    <>
      <rect x="2" y="5.5" width="16" height="9" rx="2" />
      <path d="M5.2 8.2 L6.6 7.6 V12.4 M8.9 12.4 V12.3 M11 8.4 C11.6 7.4, 13.8 7.4, 13.6 9 C13.4 10.2, 11.2 10.9, 11 12.4 H13.9" strokeWidth={1.3} />
      <path d="M15.8 7.6 V12.4" strokeWidth={1} />
    </>
  ),
  // (from the top of a barrier, down both ways)
  descent: (
    <>
      <path d="M4.2 16 C7.2 16, 7.4 6, 10 6 C12.6 6, 12.8 16, 15.8 16" />
      <circle cx="10" cy="6" r="2" fill="currentColor" stroke="none" />
      <path d="M4.4 13.6 L2 16 L4.4 18.4 M15.6 13.6 L18 16 L15.6 18.4 M2.4 16 H4.4 M15.6 16 H17.6" />
    </>
  ),
  // (Optimise's well turned over: a ball at the top of a barrier, an arrow up into it)
  saddle: (
    <>
      <path d="M2.5 17 C5 5, 15 5, 17.5 17" />
      <circle cx="10" cy="6.9" r="1.9" fill="currentColor" />
      <path d="M10 17.2 V10.6 M7.6 12.6 L10 10.2 L12.4 12.6" strokeWidth={2} />
    </>
  ),
  // (levels made one, lower than any: an ensemble's energy)
  ensemble: (
    <>
      <path d="M2.5 4 H6.5 M2.5 7.5 H6.5 M2.5 11 H6.5 M2.5 14.5 H6.5" />
      <path d="M6.5 4 L12 16 M6.5 7.5 L12 16 M6.5 11 L12 16 M6.5 14.5 L12 16" strokeWidth={0.9} />
      <path d="M12 16 H17.5" strokeWidth={2.2} />
    </>
  ),
};

/** A kind of step's icon, `size` px square; `stroke`, its lines' weight, as Heroicons' 24-unit square has them (one drawn here on 20 units as heavy). */
export function StepGlyph({ icon, size = 16, stroke = 1.5 }: { icon: StepIcon; size?: number; stroke?: number }) {
  const I = ICONS[icon];
  if (!isValidElement(I)) {
    const Hero = I as Icon;
    return <Hero width={size} height={size} strokeWidth={stroke} aria-hidden />;
  }
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={(stroke * 20) / 24} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {I}
    </svg>
  );
}

/** Quick Add's button for calculations. */
export function CalculationsGlyph({ size = 20, stroke = 1.5 }: { size?: number; stroke?: number }) {
  return <CpuChipIcon width={size} height={size} strokeWidth={stroke} aria-hidden />;
}

/** A procedure's icon, in Quick Add and Settings: steps one after another. */
export function ProcedureGlyph({ size = 20, stroke = 1.5 }: { size?: number; stroke?: number }) {
  return <QueueListIcon width={size} height={size} strokeWidth={stroke} aria-hidden />;
}
