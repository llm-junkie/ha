import * as T from "three";
import { SYSTEMS } from "./anatomy.ts";

export function selectionHighlightColor(color: T.Color): T.Color {
  // Keep the original hue; darkening also makes neutral pieces distinguishable.
  const { h, s, l } = color.getHSL({ h: 0, s: 0, l: 0 }, T.SRGBColorSpace);
  return new T.Color().setHSL(h, Math.min(1, s * 2), l * 0.75, T.SRGBColorSpace);
}

export function applyLayerOpacity(material: T.MeshStandardMaterial, opacity: number): boolean {
  const transparent = opacity < 1;
  if (material.opacity === opacity && material.transparent === transparent) return false;
  if (material.transparent !== transparent) material.needsUpdate = true;
  material.opacity = opacity;
  material.transparent = transparent;
  material.depthWrite = !transparent;
  return true;
}

export function createAnatomyMaterial(
  system: string,
  partTexture: T.DataTexture,
  selectionTexture: T.DataTexture,
  width: number,
) {
  const m = new T.MeshStandardMaterial({
    color: SYSTEMS.find((s) => s.id === system)?.color ?? "#aebbb8",
    metalness: 0.08,
    roughness: 0.53,
    side: T.DoubleSide,
    transparent: system === "integumentary",
    opacity: system === "integumentary" ? 0.2 : 1,
    depthWrite: system !== "integumentary",
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.partState = { value: partTexture };
    shader.uniforms.selectionState = { value: selectionTexture };
    shader.uniforms.stateWidth = { value: width };
    shader.uniforms.selectedColor = { value: selectionHighlightColor(m.color) };
    shader.vertexShader =
      "attribute float partIndex; uniform sampler2D partState; uniform sampler2D selectionState; uniform float stateWidth; varying vec2 partSelection;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5); vec4 state = texture2D(partState, stateUv); transformed += state.xyz; partSelection = texture2D(selectionState, stateUv).rg;",
    );
    shader.fragmentShader = "uniform vec3 selectedColor; varying vec2 partSelection;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, selectedColor, partSelection.g); diffuseColor.a = mix(diffuseColor.a, 1.0, partSelection.r);",
    );
  };
  return m;
}
