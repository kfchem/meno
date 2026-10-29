import {
  CloudIcon,
  CpuChipIcon,
  CursorArrowRaysIcon,
  FunnelIcon,
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
  // (atoms where they stand, then the same atoms bonded)
  rebond: (
    <>
      <circle cx="2.6" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="5.4" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8.2" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M11.8 13.5 L14.6 6.5 L17.4 13.5" />
      <circle cx="11.8" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // (a chain as drawn, the same as its reference)
  compare: (
    <>
      <path d="M3 6 L7.5 2.5 L12.5 6 L17 2.5 M3 17.5 L7.5 14 L12.5 17.5 L17 14" />
      <path d="M7 8.8 H13 M7 11.7 H13" />
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
