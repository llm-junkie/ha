import * as T from "three";
import { SYSTEMS } from "./anatomy.ts";

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
    opacity: system === "integumentary" ? 0.1 : 1,
    depthWrite: system !== "integumentary",
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.partState = { value: partTexture };
    shader.uniforms.selectionState = { value: selectionTexture };
    shader.uniforms.stateWidth = { value: width };
    shader.vertexShader =
      "attribute float partIndex; uniform sampler2D partState; uniform sampler2D selectionState; uniform float stateWidth; varying float partSelected;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5); vec4 state = texture2D(partState, stateUv); transformed += state.xyz; partSelected = texture2D(selectionState, stateUv).r;",
    );
    shader.fragmentShader = "varying float partSelected;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.85, 0.78), partSelected * 0.75); diffuseColor.a = mix(diffuseColor.a, 1.0, partSelected);",
    );
  };
  return m;
}
