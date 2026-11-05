import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { usePlaced } from "../pageGl/PagePlaced";
import { useFramesChip } from "./useFramesChip";

/**
 * A frames chip hanging where the group it is in stands - a stack's, below
 * the record or the molecule it shows (StackChip3D, StackChips2D) - drawn by
 * WebGL with the page's other chips (useFramesChip, pageGl/PagePlaced).
 */
export default function PlacedFramesChip(props: Parameters<typeof useFramesChip>[0]) {
  const anchor = useRef<THREE.Group>(null);
  // (drawn once its anchor is there: the frame after it is made)
  const [there, setThere] = useState(false);
  useEffect(() => {
    if (!there && anchor.current) setThere(true);
  }, [there]);
  const chip = useFramesChip(props);
  usePlaced(
    chip.drawn && there && anchor.current
      ? { key: props.chipKey, anchor: anchor.current, words: true, control: true, raised: chip.raised, zoomed: chip.zoomed, draw: chip.draw, on: chip.on }
      : null,
  );
  return <group ref={anchor} />;
}
