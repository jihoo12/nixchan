// Little pictures of 3D things for a game's menus (a fish in the bag, a turnip at the market),
// drawn once with the page's own renderer into an offscreen target and kept as an image URL.
//
// Reading pixels back from WebGPU takes a moment, so a picture is asked for and comes later:
// `get(key, build, from)` gives the picture if it's there, and otherwise starts drawing it and
// gives null for now; once it's drawn, `onDrawn` is called (to draw the menus again).
import * as THREE from 'three';
import { RenderTarget, type WebGPURenderer } from 'three/webgpu';

const SIZE = 128;

export function createPictures(renderer: WebGPURenderer, onDrawn: () => void, ready: Promise<unknown> = renderer.init()) {
	const pictures = new Map<string, string>();
	const drawing = new Set<string>();

	const draw = async (object: THREE.Object3D, from: THREE.Vector3) => {
		const stage = new THREE.Scene();
		const key = new THREE.DirectionalLight('#ffffff', 2.2);
		key.position.set(1, 2, 3);
		stage.add(new THREE.AmbientLight('#ffffff', 1.4), key, object);
		const box = new THREE.Box3().setFromObject(object);
		const centre = box.getCenter(new THREE.Vector3());
		const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
		const span = radius * 0.95;
		const camera = new THREE.OrthographicCamera(-span, span, span, -span, 0.01, radius * 10);
		camera.position.copy(centre).addScaledVector(from.clone().normalize(), radius * 3);
		camera.lookAt(centre);

		const target = new RenderTarget(SIZE, SIZE, { samples: 4 });
		target.texture.colorSpace = THREE.SRGBColorSpace;
		const before = renderer.getRenderTarget();
		const clear = renderer.getClearColor(new THREE.Color());
		const alpha = renderer.getClearAlpha();
		renderer.setRenderTarget(target);
		renderer.setClearColor(0x000000, 0);
		renderer.clear();
		renderer.render(stage, camera);
		renderer.setRenderTarget(before);
		renderer.setClearColor(clear, alpha);
		object.removeFromParent();
		const pixels = new Uint8Array((await renderer.readRenderTargetPixelsAsync(target, 0, 0, SIZE, SIZE)).buffer);
		target.dispose();

		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = SIZE;
		const c2d = canvas.getContext('2d')!;
		const img = c2d.createImageData(SIZE, SIZE);
		// WebGPU reads rows from the top, as a canvas has them; WebGL 2 from the bottom.
		const fromTop = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
		const row = SIZE * 4;
		for (let y = 0; y < SIZE; y++) {
			const src = fromTop ? y : SIZE - 1 - y;
			img.data.set(pixels.subarray(src * row, (src + 1) * row), y * row);
		}
		c2d.putImageData(img, 0, 0);
		return canvas.toDataURL('image/png');
	};

	const start = (key: string, object: THREE.Object3D, from: THREE.Vector3) => {
		drawing.add(key);
		ready
			.then(() => draw(object, from))
			.then((url) => {
				pictures.set(key, url);
				onDrawn();
			})
			.catch(() => {
				// It just goes without a picture (the menus show its colour instead).
			});
	};

	return {
		/** The picture for `key`, if it's drawn; otherwise null, and (given `build`) it starts
		 * drawing what `build` makes, seen from `from` (a direction towards the camera). */
		get(key: string, build?: () => THREE.Object3D | null, from = new THREE.Vector3(1, 0.2, 0)): string | null {
			const done = pictures.get(key);
			if (done) return done;
			if (build && !drawing.has(key)) {
				const object = build();
				if (object) start(key, object, from);
			}
			return null;
		},
		/** Starts drawing `object` as the picture for `key` now. */
		draw(key: string, object: THREE.Object3D, from = new THREE.Vector3(1, 0.2, 0)) {
			if (!drawing.has(key)) start(key, object, from);
		},
	};
}

export type Pictures = ReturnType<typeof createPictures>;
