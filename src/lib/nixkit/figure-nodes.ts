// Toon shading for WebGPU (nixkit/game.ts draws with three's WebGPURenderer): Nixchan's look (the
// same toon shading, rim light and ink line as experimental/nix-figure.ts's WebGL look, written in
// TSL), and a fix for three's own toon materials.
//
// The fix: three 0.181's ToonLightingModel lights a toon material by its raw vertex normals (in the
// model's own space, before skinning) against a light direction in view space, so the bright and
// dark steps land in the wrong places and the lit band that makes toon shading shine goes missing.
// ToonModel below uses the view-space normal, as three's WebGL toon shading does.
import * as THREE from 'three';
import { LightingModel, MeshBasicNodeMaterial, MeshToonNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import { BRDF_Lambert, clamp, diffuseColor, dot, materialReference, normalLocal, normalView, positionLocal, positionViewDirection, pow, smoothstep, vec2, vec3 } from 'three/tsl';
import type { FigureLook } from '../experimental/nix-figure';

type Direct = { lightDirection: ReturnType<typeof vec3>; lightColor: ReturnType<typeof vec3>; reflectedLight: { directDiffuse: ReturnType<typeof vec3> } };
type Indirect = { context: { ambientOcclusion: ReturnType<typeof vec3>; irradiance: ReturnType<typeof vec3>; reflectedLight: { indirectDiffuse: ReturnType<typeof vec3> } } };

/** Three's toon lighting, with the normal it should have (see above). */
class ToonModel extends LightingModel {
	direct({ lightDirection, lightColor, reflectedLight }: Direct, builder: { material: THREE.MeshToonMaterial }) {
		const coord = vec2(dot(normalView, lightDirection).mul(0.5).add(0.5), 0);
		const irradiance = builder.material.gradientMap ? vec3(materialReference('gradientMap', 'texture').context({ getUV: () => coord }).r) : vec3(smoothstep(0.69, 0.71, coord.x).mul(0.3).add(0.7));
		reflectedLight.directDiffuse.addAssign(irradiance.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseColor.rgb })));
	}

	indirect({ context }: Indirect) {
		const { ambientOcclusion, irradiance, reflectedLight } = context;
		reflectedLight.indirectDiffuse.addAssign(irradiance.mul(BRDF_Lambert({ diffuseColor })));
		reflectedLight.indirectDiffuse.mulAssign(ambientOcclusion);
	}
}

/** MeshToonNodeMaterial, lit by ToonModel. */
export class ToonNodeMaterial extends MeshToonNodeMaterial {
	setupLightingModel() {
		return new ToonModel() as unknown as ReturnType<MeshToonNodeMaterial['setupLightingModel']>;
	}
}

/** Has the renderer draw every MeshToonMaterial (the parts, a game's own) as a ToonNodeMaterial. */
export function fixToon(renderer: WebGPURenderer) {
	// addMaterial won't replace a type it already has, so this sets it in the library's map itself.
	(renderer.library as unknown as { materialNodes: Map<string, typeof ToonNodeMaterial> }).materialNodes.set('MeshToonMaterial', ToonNodeMaterial);
}

/** A soft rim of light along her silhouette, so she lifts off what's behind her. */
const rim = smoothstep(0.45, 0.75, pow(clamp(dot(normalView, positionViewDirection), 0, 1).oneMinus(), 3)).mul(0.22).mul(vec3(1, 0.97, 1));

export const nodeLook: FigureLook = {
	toon(params) {
		const mat = new ToonNodeMaterial(params);
		mat.emissiveNode = rim;
		return mat as unknown as THREE.MeshToonMaterial;
	},
	inkLine(hex, width) {
		const line = new MeshBasicNodeMaterial({ color: hex, side: THREE.BackSide });
		// After skinning, so the line moves with her.
		line.positionNode = positionLocal.add(normalLocal.mul(width));
		return line;
	},
};
