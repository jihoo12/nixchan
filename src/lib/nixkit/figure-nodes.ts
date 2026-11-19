// Nixchan's look for WebGPU (nixkit/game.ts draws with three's WebGPURenderer): the same toon
// shading, rim light and ink line as experimental/nix-figure.ts's WebGL look, written in TSL, so
// it runs on WebGPU and on the WebGL 2 the renderer falls back to.
//
// (Before three r186, WebGPU toon shading lit by the wrong normal and looked dull: mrdoob/three.js
// #34246. Keep three at 0.187 or later.)
import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshToonNodeMaterial } from 'three/webgpu';
import { clamp, dot, normalLocal, normalView, positionLocal, positionViewDirection, pow, smoothstep, vec3 } from 'three/tsl';
import type { FigureLook } from '../experimental/nix-figure';

/** A soft rim of light along her silhouette, so she lifts off what's behind her. */
const rim = smoothstep(0.45, 0.75, pow(clamp(dot(normalView, positionViewDirection), 0, 1).oneMinus(), 3)).mul(0.22).mul(vec3(1, 0.97, 1));

export const nodeLook: FigureLook = {
	toon(params) {
		const mat = new MeshToonNodeMaterial(params);
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
