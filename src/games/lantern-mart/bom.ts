// Bom (봄, "spring"), on the mart's street a few steps from where Nixchan starts: out on the night
// of the first snow in a T-shirt and shorts, as if it were already spring. She's jihoo's own VRoid
// model (models/bom.vrm, CC BY 4.0, LICENSE-ARTWORK). A .vrm is a glTF underneath, so three's
// GLTFLoader reads it as it is; it doesn't know VRM's own parts (MToon, spring bones, expressions),
// so here she's drawn in the game's toon look with the neighbours' ink line, her arms let down from
// VRM's T-pose, with a breath, a blink (the Fcl_EYE_Close face key), and a head that turns to
// Nixchan when she's near.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game } from '../../lib/nixkit/game';
import { nodeLook } from '../../lib/nixkit/figure-nodes';
import bomUrl from './models/bom.vrm?url';

/** Where she stands, which way she faces (toward where Nixchan starts), and how big she's drawn:
 * the model is 1.6 m, which looks small beside Nixchan's big head and hat. */
export const BOM = { x: 1.7, z: 5.6, facing: Math.atan2(0 - 1.7, 8 - 5.6), scale: 1.5 } as const;
/** Room for her that Nixchan can't walk through: [left, right, back, front]. */
const R = 0.22 * BOM.scale;
export const bomSolid = [BOM.x - R, BOM.x + R, BOM.z - R, BOM.z + R] as const;

export function createBom(game: Game, ko: boolean) {
	const group = new THREE.Group();
	group.position.set(BOM.x, 0, BOM.z);
	group.rotation.y = BOM.facing;
	group.scale.setScalar(BOM.scale);
	game.scene.add(group);

	let update = (_dt: number, _time: number) => {};

	const ready = new GLTFLoader().loadAsync(bomUrl).then((gltf) => {
		const model = gltf.scene;
		const ink = nodeLook.inkLine('#1d1b3a', 0.004 / BOM.scale);
		const faces: THREE.Mesh[] = [];
		const meshes: THREE.Mesh[] = [];
		model.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));

		for (const mesh of meshes) {
			const from = mesh.material as THREE.MeshBasicMaterial;
			// Skinned, her bounds move with her bones: don't let the camera's culling guess at them.
			mesh.frustumCulled = false;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			// The eyes' highlights stay as bright as they're painted; the rest takes the town's light.
			if (!/EyeHighlight/.test(from.name)) {
				mesh.material = game.toon({
					name: from.name,
					color: from.color,
					map: from.map,
					transparent: from.transparent,
					alphaTest: from.alphaTest,
					depthWrite: from.depthWrite,
					side: from.side,
				});
			}
			if (mesh.morphTargetDictionary && 'Fcl_EYE_Close' in mesh.morphTargetDictionary) faces.push(mesh);
			// An ink line round her skin and clothes (hair and eyes are cut out of their pictures, so a
			// line round them would draw the whole card).
			if (mesh instanceof THREE.SkinnedMesh && /_SKIN|_CLOTH/.test(from.name)) {
				const line = new THREE.SkinnedMesh(mesh.geometry, ink);
				line.bind(mesh.skeleton, mesh.bindMatrix);
				line.frustumCulled = false;
				// Blinks with her.
				if (mesh.morphTargetInfluences) line.morphTargetInfluences = mesh.morphTargetInfluences;
				mesh.add(line);
			}
		}
		group.add(model);

		// Her bones as they were (VRM's rest pose is a T-pose), to pose from each moment.
		const names = ['J_Bip_L_UpperArm', 'J_Bip_R_UpperArm', 'J_Bip_L_LowerArm', 'J_Bip_R_LowerArm', 'J_Bip_C_Chest', 'J_Bip_C_Neck', 'J_Bip_C_Head'] as const;
		const bones = Object.fromEntries(names.map((n) => [n, model.getObjectByName(n) ?? null])) as Record<(typeof names)[number], THREE.Object3D | null>;
		const rest = new Map<THREE.Object3D, THREE.Quaternion>();
		for (const b of Object.values(bones)) if (b) rest.set(b, b.quaternion.clone());
		const q = new THREE.Quaternion();
		const e = new THREE.Euler();
		const pose = (b: THREE.Object3D | null, x: number, y: number, z: number) => {
			if (b) b.quaternion.copy(rest.get(b)!).multiply(q.setFromEuler(e.set(x, y, z)));
		};

		const toHer = new THREE.Vector3();
		let look = 0;
		let blinkAt = 2;
		let greeted = false;
		update = (dt, time) => {
			// Arms down by her sides, a little bent, and a breath.
			pose(bones.J_Bip_L_UpperArm, 0, 0, -1.2);
			pose(bones.J_Bip_R_UpperArm, 0, 0, 1.2);
			pose(bones.J_Bip_L_LowerArm, 0, -0.25, 0);
			pose(bones.J_Bip_R_LowerArm, 0, 0.25, 0);
			pose(bones.J_Bip_C_Chest, Math.sin(time * 1.6) * 0.02, 0, 0);

			// Turns her head to Nixchan, if she's near and not behind her.
			toHer.copy(game.player.pos).sub(group.position);
			let want = Math.atan2(toHer.x, toHer.z) - group.rotation.y;
			want = Math.atan2(Math.sin(want), Math.cos(want));
			if (toHer.length() > 8 || Math.abs(want) > 1.6) want = 0;
			want = THREE.MathUtils.clamp(want, -0.9, 0.9);
			look += (want - look) * Math.min(1, dt * 4);
			pose(bones.J_Bip_C_Neck, 0, look * 0.4, 0);
			pose(bones.J_Bip_C_Head, Math.sin(time * 0.9) * 0.03, look * 0.6, Math.sin(time * 0.7) * 0.03);

			// A blink every few seconds.
			const since = time - blinkAt;
			const shut = since < 0 || since > 0.15 ? 0 : 1 - Math.abs(since / 0.075 - 1);
			if (since > 0.15) blinkAt = time + 2.5 + Math.random() * 3;
			for (const f of faces) f.morphTargetInfluences![f.morphTargetDictionary!.Fcl_EYE_Close] = shut;

			if (!greeted && toHer.length() < 2.6) {
				greeted = true;
				game.hud.toast(ko ? '안녕, 닉스쨩! 나 봄이야. 너도 야식 먹으러 왔어?' : "Hi, Nixchan! I'm Bom. Out for a midnight snack too?", 3);
			}
		};
	});

	return { group, ready, update: (dt: number, time: number) => update(dt, time) };
}
