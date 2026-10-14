import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { resolveStyle } from "../../../../lib/chem/style";
import {
  arrowMeasures,
  arrowPieces,
  type ArrowForm,
  type ArrowLook,
} from "../../../../lib/chem/reactionArrow";
import { useDrawingStyle } from "../useDrawingStyle";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";

/**
 * An arrow from (x1, y1) to its point at (x2, y2): its lines, heads and
 * cross as its form makes them (lib/chem/reactionArrow `arrowPieces`) - its
 * kind, heads, dashes, weight and corners - measured as the drawing style
 * has them, over which `look` sets what this arrow sets for itself; in the
 * bonds' colour unless told otherwise.
 */
export default function ReactionArrow2D({
  x1,
  y1,
  x2,
  y2,
  look,
  form,
  color,
  z = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  look?: ArrowLook;
  form?: ArrowForm;
  color?: string;
  z?: number;
}) {
  const style = useDrawingStyle();
  const { opts } = useDrawnLayout();
  const fill = color ?? opts.bondColor ?? "black";
  // (its form by what it says, not by which object says it: drawn again only when it changes)
  const formKey = JSON.stringify(form ?? {});
  const measures = useMemo(() => arrowMeasures(resolveStyle(style, look), NOMINAL_BOND_LENGTH), [style, look]);
  // no thinner on the screen than a bond is kept, however far out the
  // view is (layout2d's lineHalfOf): a zoom changes it only once the view
  // is out far enough for that
  const thickness = useDrawnZoom((z) => Math.max(measures.thickness, Math.max(0.5, opts.minLinePx ?? 1) / Math.max(z, 1e-6)));
  const geometry = useMemo(() => {
    const pieces = arrowPieces(
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      JSON.parse(formKey) as ArrowForm,
      { ...measures, thickness },
    );
    return new THREE.ShapeGeometry(
      pieces.map((o) => new THREE.Shape(o.map((p) => new THREE.Vector2(p.x, p.y)))),
    );
  }, [measures, formKey, thickness, x1, y1, x2, y2]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, 0, z]}>
      <meshBasicMaterial
        color={fill}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
