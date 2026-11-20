// Someone else in the world: a rigged character made in Blender (a .glb with looping clips), drawn in
// the kit's toon look with an ink line round it, blending from clip to clip and turning its head to
// look at something. It's what Pebble on the island does (island/npc.ts), for any game: what the
// character says and when is the game's own business.
//
//   const mochi = createCharacter(game.scene, game.toon, { url, at: [x, 0, z], facing: 0 });
//   mochi.play('Wave');                       // blends over from whatever it was doing
//   game.onUpdate((dt) => mochi.update(dt, game.player.pos));
//
// The model's head should be a bone or node named `Head` whose local +y is up (as Blender's bones are
// when they point straight up with no roll), so turning it about y turns the head.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { nodeLook } from './figure-nodes';
import type { Toon } from './look';
import { clamp, damp } from './util';

export interface CharacterOptions {
	/** The .glb (import it with `?url`). */
	url: string;
	/** Where its feet go, and which way it faces (radians; 0 is toward +z). */
	at: THREE.Vector3 | readonly [number, number, number];
	facing: number;
	scale?: number;
	/** The clip it starts in (default `Idle`). */
	clip?: string;
	/** The ink line's colour and width, or `null` for none. */
	ink?: { color: string; width: number } | null;
	/** Materials (by name) drawn without an ink line: eyes, whiskers, shines. */
	noInk?: RegExp;
	/** How far its head turns either way to look at something (radians, default 0.9), and how near
	 * that something has to be (default 9 m). */
	look?: { limit?: number; within?: number };
	/** How fast clips blend into each other (default 8: about a quarter of a second). */
	blend?: number;
}

const up = new THREE.Vector3(0, 1, 0);

export function createCharacter(scene: THREE.Object3D, toon: Toon, opts: CharacterOptions) {
	const root = new THREE.Group();
	const at = opts.at instanceof THREE.Vector3 ? opts.at : new THREE.Vector3(...opts.at);
	root.position.copy(at);
	root.rotation.y = opts.facing;
	root.scale.setScalar(opts.scale ?? 1);
	scene.add(root);

	const actions = new Map<string, THREE.AnimationAction>();
	const weights = new Map<string, number>();
	let mixer: THREE.AnimationMixer | null = null;
	let head: THREE.Object3D | null = null;
	let clip = opts.clip ?? 'Idle';
	let yaw = 0;
	const turn = new THREE.Quaternion();
	const limit = opts.look?.limit ?? 0.9;
	const within = opts.look?.within ?? 9;
	const blend = opts.blend ?? 8;
	const noInk = opts.noInk ?? /Eye|Shine|Whisker|Blush/;
	const ink = opts.ink === null ? null : nodeLook.inkLine(opts.ink?.color ?? '#1d1b3a', opts.ink?.width ?? 0.01);

	const loaded = new GLTFLoader().loadAsync(opts.url).then(
		(gltf) => {
			const model = gltf.scene;
			const meshes: THREE.Mesh[] = [];
			model.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
			for (const mesh of meshes) {
				const placeholder = mesh.material as THREE.MeshStandardMaterial;
				mesh.material = toon({ color: placeholder.color });
				mesh.castShadow = true;
				if (!ink || noInk.test(placeholder.name)) continue;
				if (mesh instanceof THREE.SkinnedMesh) {
					// The line bends with the rig, for the parts that are skinned.
					const line = new THREE.SkinnedMesh(mesh.geometry, ink);
					line.bind(mesh.skeleton, mesh.bindMatrix);
					mesh.frustumCulled = line.frustumCulled = false;
					mesh.add(line);
				} else {
					mesh.add(new THREE.Mesh(mesh.geometry, ink));
				}
			}
			head = model.getObjectByName('Head') ?? null;
			mixer = new THREE.AnimationMixer(model);
			for (const animation of gltf.animations) {
				const action = mixer.clipAction(animation);
				action.play();
				const w = animation.name === clip ? 1 : 0;
				action.setEffectiveWeight(w);
				actions.set(animation.name, action);
				weights.set(animation.name, w);
			}
			root.add(model);
			return true;
		},
		() => false, // Nobody there, then; the game goes on without them.
	);

	const above = new THREE.Vector3();
	return {
		root,
		/** Settles with whether the model loaded. */
		loaded,
		/** The clip it's in (or blending into). */
		get clip() {
			return clip;
		},
		/** Blends into `name` (a clip in the .glb), starting it from the top if it wasn't showing. */
		play(name: string) {
			if (name === clip) return;
			clip = name;
			const action = actions.get(name);
			if (action && (weights.get(name) ?? 0) < 0.05) action.time = 0;
		},
		/** The point `height` metres above its feet (for a speech bubble), kept up to date. */
		above(height = 1.6) {
			return above.copy(root.position).addScaledVector(up, height * root.scale.y);
		},
		/** Which way Nixchan (or anyone at `from`) would face to look at it. */
		facingFrom(from: THREE.Vector3) {
			return Math.atan2(root.position.x - from.x, root.position.z - from.z);
		},
		/** Moves its clips on, and turns its head toward `lookAt` if that's near enough and in front. */
		update(dt: number, lookAt?: THREE.Vector3 | null) {
			if (!mixer) return;
			for (const [name, action] of actions) {
				const w = damp(weights.get(name) ?? 0, name === clip ? 1 : 0, blend, dt);
				weights.set(name, w);
				action.setEffectiveWeight(w);
			}
			mixer.update(dt);
			let want = 0;
			if (lookAt) {
				const dx = lookAt.x - root.position.x, dz = lookAt.z - root.position.z;
				const local = Math.atan2(dx, dz) - root.rotation.y;
				const wrapped = Math.atan2(Math.sin(local), Math.cos(local));
				// Something behind it is out of sight, not worth cricking its neck for.
				if (Math.hypot(dx, dz) < within && Math.abs(wrapped) < limit + 0.9) want = clamp(wrapped, -limit, limit);
			}
			yaw = damp(yaw, want, 5, dt);
			head?.quaternion.multiply(turn.setFromAxisAngle(up, yaw));
		},
	};
}

export type Character = ReturnType<typeof createCharacter>;
