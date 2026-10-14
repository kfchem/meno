// The part of troika-three-text Meno uses directly; drei, which draws the
// text, brings the rest. The package has no types of its own.
declare module "troika-three-text" {
  import type { Material, Mesh } from "three";
  /** A text, its letters set off the page's thread (`sync`) and drawn as one mesh. */
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: string | number | null;
    fillOpacity: number;
    anchorX: number | string;
    anchorY: number | string;
    outlineWidth: number | string;
    outlineColor: string | number;
    outlineOpacity: number;
    strokeOpacity: number;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
    _needsSync?: boolean;
    _isSyncing?: boolean;
  }
  /** Texts added to it drawn in one draw call, each by its own matrix, colour and opacity. */
  export class BatchedText extends Text {
    addText(text: Text): void;
    createDerivedMaterial(base: import("three").Material): import("three").Material;
    removeText(text: Text): void;
  }
  export function configureTextBuilder(config: {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    useWorker?: boolean;
  }): void;
}

// troika-three-text's own helper for materials (a dependency of it): a
// material derived from another, its shaders rewritten.
declare module "troika-three-utils" {
  import type { Material } from "three";
  export function createDerivedMaterial<M extends Material>(
    base: M,
    options: { chained?: boolean; customRewriter?: (shaders: { vertexShader: string; fragmentShader: string }) => { vertexShader: string; fragmentShader: string } },
  ): M;
}
