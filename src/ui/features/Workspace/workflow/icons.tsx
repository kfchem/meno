import {
  AdjustmentsHorizontalIcon,
  ArrowTrendingDownIcon,
  BoltIcon,
  ChartBarIcon,
  CloudIcon,
  CpuChipIcon,
  CursorArrowRaysIcon,
  FunnelIcon,
  PhotoIcon,
  PresentationChartLineIcon,
  QueueListIcon,
  RectangleGroupIcon,
  SignalIcon,
  SparklesIcon,
  Square2StackIcon,
  Square3Stack3DIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import type { StepIcon } from "./kinds";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Each kind of step's icon (docs/WORKFLOWS.md, *Kinds of step*): from
 * Heroicons' outline set, the icons Meno uses elsewhere (*How it looks*).
 */
const ICONS: Record<StepIcon, Icon> = {
  rings: Square3Stack3DIcon,
  curve: ArrowTrendingDownIcon,
  level: BoltIcon,
  wave: SignalIcon,
  cloud: CloudIcon,
  picture: PhotoIcon,
  band: FunnelIcon,
  twins: Square2StackIcon,
  bars: ChartBarIcon,
  "grouped": RectangleGroupIcon,
  pointer: CursorArrowRaysIcon,
  chart: PresentationChartLineIcon,
  sliders: AdjustmentsHorizontalIcon,
  sparks: SparklesIcon,
};

/** A kind of step's icon, `size` px square; `stroke`, its lines' weight, as Heroicons' 24-unit square has them. */
export function StepGlyph({ icon, size = 16, stroke = 1.5 }: { icon: StepIcon; size?: number; stroke?: number }) {
  const I = ICONS[icon];
  return <I width={size} height={size} strokeWidth={stroke} aria-hidden />;
}

/** Quick Add's button for calculations. */
export function CalculationsGlyph({ size = 20, stroke = 1.5 }: { size?: number; stroke?: number }) {
  return <CpuChipIcon width={size} height={size} strokeWidth={stroke} aria-hidden />;
}

/** A procedure's icon, in Quick Add and Settings: steps one after another. */
export function ProcedureGlyph({ size = 20, stroke = 1.5 }: { size?: number; stroke?: number }) {
  return <QueueListIcon width={size} height={size} strokeWidth={stroke} aria-hidden />;
}
