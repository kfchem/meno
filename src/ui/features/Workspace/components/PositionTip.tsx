import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { useEditor } from "../store";
import PageTip from "./PageTip";

/**
 * What a bond dragged out of an atom of a projection is leading its group to (docs/EDITOR-2D.md, *Projections*): the position's name - "axial",
 * "equatorial" - under where the new atom will be, as the page's own tip (what the place is, not how it is read). Gone with the drag.
 */
export default function PositionTip() {
  const preview = useEditor((s) => s.extend.preview);
  const active = useEditor((s) => s.extend.active);
  const zoom = useThree((s) => (s.camera as THREE.OrthographicCamera).zoom || 1);
  if (!active || !preview?.position) return null;
  const size = 0.6 * NOMINAL_BOND_LENGTH;
  return <PageTip tipKey={preview.position} x={preview.x} y={preview.y} w={size} h={size} zoom={zoom} text={preview.position} />;
}
