// Nixchan's look (every page with her in it draws with three's WebGPURenderer): toon shading, a rim
// of light and an ink line, written in TSL, so it runs on WebGPU and on the WebGL 2 the renderer
// falls back to. (It was a WebGL look once, patching three's GLSL; this draws it the same.)
//
// (Before three r186, WebGPU toon shading lit by the wrong normal and looked dull: mrdoob/three.js
// #34246. Keep three at 0.187 or later.)
import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshToonNodeMaterial } from 'three/webgpu';
import { clamp, dot, normalLocal, normalView, positionLocal, positionViewDirection, pow, smoothstep, vec3 } from 'three/tsl';
import type { FigureLook } from '../experimental/nix-figure';

/** A soft rim of light along her silhouette, so she lifts off what's behind her. */
const rim = smoothstep(0.45, 0.75, pow(clamp(dot(normalView, positionViewDirection), 0, 1).oneMinus(), 3)).mul(0.22).mul(vec3(1, 0.97, 1));

/** How much further out the ink line is pushed than the WebGL look pushed it (see inkLine). */
const INK_WIDEN = 2;

export const nodeLook: FigureLook = {
	toon(params) {
		const mat = new MeshToonNodeMaterial(params);
		mat.emissiveNode = rim;
		return mat as unknown as THREE.MeshToonMaterial;
	},
	inkLine(hex, width) {
		const line = new MeshBasicNodeMaterial({ color: hex, side: THREE.BackSide });
		// After skinning, so the line moves with her. Pushed out twice as far as the WebGL look did: the
		// shell is only a few millimetres out, and much of the line WebGL drew was the shell showing
		// through where the surface turns away, which WebGPU's finer depth buffer doesn't let it do.
		// Twice the width draws it as thick as it was (compared side by side in /home and on the island).
		line.positionNode = positionLocal.add(normalLocal.mul(width * INK_WIDEN));
		return line;
	},
};
