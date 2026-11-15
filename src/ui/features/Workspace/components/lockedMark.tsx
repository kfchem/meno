/**
 * The mark of a PDF locked with a password it has not been opened with
 * (lib/doc/locked): on each page of it, over its white sheet, a padlock in
 * the page's grey, as large as the sheet is wide - drawn by WebGL as a page
 * object is (docs/PDF.md, *Locked with a password*). The password is asked
 * for where the PDF is opened: in the column.
 */
import { NOT_HAD_COLOR } from "./notHadCross";

/** The padlock's parts, in units of the sheet's width, about the sheet's middle. */
const LOCK = {
  /** The body: its width, its height, and how far its middle lies below the sheet's. */
  body: { w: 0.2, h: 0.15, down: 0.03 },
  /** The shackle, a half ring on the body: its outer radius, and its thickness. */
  shackle: { r: 0.065, thick: 0.02 },
};

/** A padlock on a sheet `w` wide, `opacity` as the page is. */
export function LockedMark({ w, opacity }: { w: number; opacity: number }) {
  const { body, shackle } = LOCK;
  return (
    <group position={[0, 0, 0.0031]} scale={[w, w, 1]}>
      <mesh position={[0, -body.down, 0]} scale={[body.w, body.h, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={NOT_HAD_COLOR} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh position={[0, body.h / 2 - body.down, 0]}>
        <ringGeometry args={[shackle.r - shackle.thick, shackle.r, 32, 1, 0, Math.PI]} />
        <meshBasicMaterial color={NOT_HAD_COLOR} transparent opacity={opacity} toneMapped={false} />
      </mesh>
    </group>
  );
}
