import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  BoldIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  ForwardIcon,
  ItalicIcon,
  ListBulletIcon,
  PencilIcon,
  PhotoIcon,
  PlayIcon,
  ScissorsIcon,
  SparklesIcon,
  StopIcon,
  SwatchIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, ReactNode, SVGProps } from "react";

/**
 * The icons along the top of a right-click menu (PartMenu): Heroicons'
 * outline set, as Meno uses elsewhere, as heavy as Quick Add's - and, where
 * that set has none, glyphs of Meno's own on a 20-unit square, drawn as
 * Quick Add's are.
 */
const hero = (I: ComponentType<SVGProps<SVGSVGElement>>) => <I width={20} height={20} strokeWidth={2.1} aria-hidden />;

const own = (paths: ReactNode) => (
  <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {paths}
  </svg>
);

/** A bond's kind as it is drawn, on the 20-unit square, running up to the right (docs/EDITOR-2D.md, *Menus*). */
export const BOND_ICONS = {
  single: own(<path d="M4 16 L16 4" />),
  double: own(<path d="M2.8 13.5 L13.5 2.8 M6.5 17.2 L17.2 6.5" />),
  triple: own(<path d="M1.5 11.5 L11.5 1.5 M5.2 15.2 L15.2 5.2 M8.9 18.9 L18.9 8.9" />),
  wedge: own(<path d="M4 16 L15 3.5 L16.5 5 Z" fill="currentColor" />),
  "hashed-wedge": own(<path d="M4.6 14.2 L5.8 15.4 M6.4 11.7 L8.3 13.6 M8.1 9.1 L10.9 11.9 M9.9 6.5 L13.5 10.1 M11.6 4.0 L16.0 8.4 M13.4 1.4 L18.6 6.6" />),
  wavy: own(<path d="M3.5 16.5 q1.2 -3.2 2.6 -1.8 t2.6 -1.8 t2.6 -1.8 t2.6 -1.8 t1.8 -2" />),
  bold: own(<path d="M4 16 L16 4" strokeWidth={4} />),
  hashed: own(<path d="M4 16 L16 4" strokeDasharray="1.6 2.4" strokeWidth={2.4} />),
  dashed: own(<path d="M4 16 L16 4" strokeDasharray="3.6 3" />),
  dative: own(<path d="M4 16 L15 5 M9.5 4.5 H15.5 V10.5" />),
};

export const MENU_ICONS = {
  cut: hero(ScissorsIcon),
  copy: hero(DocumentDuplicateIcon),
  paste: hero(ClipboardIcon),
  delete: hero(TrashIcon),
  cleanUp: hero(SparklesIcon),
  make3d: hero(CubeIcon),
  read: hero(BookOpenIcon),
  previous: hero(ChevronLeftIcon),
  next: hero(ChevronRightIcon),
  toIcon: hero(ArrowsPointingInIcon),
  fullSize: hero(ArrowsPointingOutIcon),
  run: hero(PlayIcon),
  runFrom: hero(ForwardIcon),
  stop: hero(StopIcon),
  options: hero(AdjustmentsHorizontalIcon),
  edit: hero(PencilIcon),
  picture: hero(PhotoIcon),
  resetTurn: hero(ArrowPathIcon),
  colour: hero(SwatchIcon),
  // (words on the page: their size - a large letter and a small one - and their letters bold or in italics, their lines a list)
  size: own(
    <>
      <path d="M2.5 15.5 L7 4.5 L11.5 15.5 M4.2 11.5 H9.8" />
      <path d="M12.5 15.5 L15 9.5 L17.5 15.5 M13.4 13.3 H16.6" />
    </>,
  ),
  bold: hero(BoldIcon),
  italic: hero(ItalicIcon),
  bullets: hero(ListBulletIcon),
  // (a slide's: its talk given from it, earlier or later in it, the page about it shown)
  present: own(
    <>
      <rect x="2.5" y="4" width="15" height="11" rx="1.5" />
      <path d="M8.5 7.5v5l4.2-2.5z" fill="currentColor" />
    </>,
  ),
  earlier: hero(ChevronLeftIcon),
  later: hero(ChevronRightIcon),
  around: hero(EyeIcon),
  // (a charge's circled sign, as the drawing marks one)
  chargeUp: own(
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 6.6 V13.4 M6.6 10 H13.4" />
    </>,
  ),
  chargeDown: own(
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M6.6 10 H13.4" />
    </>,
  ),
  // (a curved arrow, its head full - a pair of electrons - or half, a fishhook's)
  pushArrow: own(
    <>
      <path d="M3.5 15 C3.5 6.5, 13 3.5, 15.6 11.4" />
      <path d="M12.6 10.2 L16.3 13.6 L17.6 8.8 Z" fill="currentColor" />
    </>,
  ),
  fishhook: own(
    <>
      <path d="M3.5 15 C3.5 6.5, 13 3.5, 15.6 11.4" />
      <path d="M17.6 8.6 L16.1 13.4" />
    </>,
  ),
  // (everything inside a dashed frame)
  selectAll: own(<rect x="3.5" y="3.5" width="13" height="13" rx="1.5" strokeDasharray="2.4 2.2" />),
  // (a paragraph's lines, as they lie)
  alignLeft: own(<path d="M3.5 5 H16.5 M3.5 8.3 H12.5 M3.5 11.7 H16.5 M3.5 15 H11" />),
  alignCentre: own(<path d="M3.5 5 H16.5 M5.5 8.3 H14.5 M3.5 11.7 H16.5 M6.5 15 H13.5" />),
  alignRight: own(<path d="M3.5 5 H16.5 M7.5 8.3 H16.5 M3.5 11.7 H16.5 M9 15 H16.5" />),
  justify: own(<path d="M3.5 5 H16.5 M3.5 8.3 H16.5 M3.5 11.7 H16.5 M3.5 15 H16.5" />),
  // (a molecule in 3D as balls and sticks, or its atoms as spheres - the look it is turned to)
  balls: own(
    <>
      <circle cx="5.5" cy="13.5" r="2.4" />
      <circle cx="14.5" cy="6.5" r="2.4" />
      <path d="M7.4 12 L12.6 8" />
    </>,
  ),
  space: own(
    <>
      <circle cx="7.6" cy="11.6" r="4.6" />
      <path d="M10.4 7.3 A4.6 4.6 0 1 1 12.2 15.9" />
    </>,
  ),
} as const;
