import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { ScreenShade, screenShadeWanted } from "../utils/screenShade";
import { OVER_PAGE } from "./Molecule3DView";

/**
 * Hollows shaded on the screen, for the molecules on this canvas whose look
 * shades them so (utils/screenShade): worked out each frame any of them is
 * shaded there, at half the canvas's resolution - drawn over them at its
 * own, the shade being soft - and laid over them just after they are
 * drawn. Nothing at all while none is.
 */
export default function ScreenShade3D() {
  const { gl, scene, camera, size } = useThree();
  // (after the molecules, before what is drawn over them: their outlines' light, their measurements, their surfaces)
  const shade = useMemo(() => new ScreenShade(scene, OVER_PAGE + 0.5), [scene]);
  useEffect(() => () => shade.dispose(), [shade]);
  useFrame(() => {
    const k = gl.getPixelRatio() / 2;
    shade.update(gl, camera, Math.max(1, Math.round(size.width * k)), Math.max(1, Math.round(size.height * k)), screenShadeWanted(gl));
  });
  return <primitive object={shade.sheet} />;
}
