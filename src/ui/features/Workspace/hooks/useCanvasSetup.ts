import * as THREE from "three";
import { useCallback } from "react";
import { RootState } from "@react-three/fiber";
import { watchShaderErrors } from "../utils/menoShader";

export function useCanvasSetup(
  camRef: React.MutableRefObject<THREE.OrthographicCamera | THREE.PerspectiveCamera | null>,
  domRef: React.MutableRefObject<HTMLCanvasElement | null>,
) {
  return useCallback(
    (state: RootState) => {
      try {
        if (state.gl.setClearColor) state.gl.setClearColor("#ffffff", 1);
        if (state.gl.clear) state.gl.clear();
      } catch {}
      const canvas = state.gl.domElement as HTMLCanvasElement;
      const onLost = (e: Event) => e.preventDefault();
      const onRestored = () => state.invalidate();
      canvas.addEventListener("webglcontextlost", onLost as any, false);
      canvas.addEventListener("webglcontextrestored", onRestored as any, false);
      // (a shader of Meno's that fails to compile: said in the log, and drawn plain)
      watchShaderErrors(state.gl);
      camRef.current = state.camera as THREE.OrthographicCamera | THREE.PerspectiveCamera;
      domRef.current = canvas;

      // The canvas `dpr` prop owns the pixel ratio (canvasRatio); overriding it
      // here made the renderer disagree with it.
    },
    [camRef, domRef],
  );
}
