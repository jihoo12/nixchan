// Noeul (노을, "the glow at sunset"): an ember mage in a black hooded jacket, the one Nixchan spars
// with up on the rooftop. She's jihoo's own VRoid model (models/noeul.vrm, CC BY 4.0,
// LICENSE-ARTWORK), loaded as it is with three's GLTFLoader (a .vrm is a glTF) and drawn in the
// kit's toon look with an ink line.
//
// GLTFLoader doesn't know VRM's own parts, so they're here: her poses are set bone by bone, her
// faces are the model's Fcl_* face keys, and her hair, skirt and sleeves swing on her spring bones
// (springs.ts).
//
// A VRoid model's bones don't rest square to her (each points along its own bone, Blender-like), so
// a pose here is given in her own axes (x to her left, y up, z the way she faces) and turned into
// each bone's space from how it rests: as VRM's "normalized" bones are.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game } from '../../lib/nixkit/game';
import { nodeLook } from '../../lib/nixkit/figure-nodes';
import { createSprings } from './springs';
import noeulUrl from './models/noeul.vrm?url';

/** How big she's drawn: the model is 1.55 m, small beside Nixchan's big head and hat (Bom, in
 * Lantern Mart, is drawn 1.5 times over too). */
export const SCALE = 1.4;

const BONES = [
	'Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head',
	'L_UpperArm', 'L_LowerArm', 'L_Hand', 'R_UpperArm', 'R_LowerArm', 'R_Hand',
	'L_UpperLeg', 'L_LowerLeg', 'L_Foot', 'R_UpperLeg', 'R_LowerLeg', 'R_Foot',
] as const;
type Bone = (typeof BONES)[number];
/** A pose: for some bones, a turn in her own axes (x, y, z in radians, z turned first). */
type Pose = Partial<Record<Bone, [number, number, number]>>;

// Arms rest straight out (a T-pose): z −1.25 (left) / +1.25 (right) lets them down by her sides,
// y −1.5 / +1.5 swings them out in front, z +1.4 / −1.4 lifts them overhead. A thigh comes forward
// with x < 0, a knee bends with x > 0, and the back leans forward with x > 0.
const HOVER: Pose = {
	L_UpperArm: [0, 0.1, -1.05], R_UpperArm: [0, -0.1, 1.05],
	L_LowerArm: [0, -0.35, 0], R_LowerArm: [0, 0.35, 0],
	L_UpperLeg: [-0.3, 0, -0.03], L_LowerLeg: [0.65, 0, 0], L_Foot: [0.45, 0, 0],
	R_UpperLeg: [-0.06, 0, 0.03], R_LowerLeg: [0.3, 0, 0], R_Foot: [0.4, 0, 0],
};
export const POSES = {
	hover: HOVER,
	/** Her right hand drawn back and up, gathering embers. */
	aim: { ...HOVER, Spine: [0, -0.25, 0], R_UpperArm: [-0.2, 0.5, -0.9], R_LowerArm: [0, 1.2, 0], L_UpperArm: [0, -0.6, -0.9] },
	/** ... and thrown out at Nixchan. */
	throw: { ...HOVER, Spine: [0.12, 0.3, 0], R_UpperArm: [0, 1.45, 0.12], R_LowerArm: [0, 0.05, 0], L_UpperArm: [0, 0.4, -1.15] },
	/** Both arms raised, to bring a ring down. */
	gather: { ...HOVER, Spine: [-0.15, 0, 0], Head: [-0.15, 0, 0], L_UpperArm: [0, -0.2, 1.2], R_UpperArm: [0, 0.2, -1.2], L_LowerArm: [0, -0.4, 0], R_LowerArm: [0, 0.4, 0] },
	slam: { ...HOVER, Spine: [0.35, 0, 0], Head: [0.1, 0, 0], L_UpperArm: [0, -0.5, -0.75], R_UpperArm: [0, 0.5, 0.75], L_UpperLeg: [-0.55, 0, -0.05], L_LowerLeg: [1.0, 0, 0] },
	/** Arms straight up, calling embers down out of the sky. */
	call: { ...HOVER, Spine: [-0.12, 0, 0], Head: [-0.35, 0, 0], L_UpperArm: [0, 0, 1.45], R_UpperArm: [0, 0, -1.45], L_LowerArm: [0, 0, 0], R_LowerArm: [0, 0, 0] },
	/** Curled up, for a blink across the roof. */
	curl: { ...HOVER, Spine: [0.45, 0, 0], Head: [0.2, 0, 0], L_UpperLeg: [-1.0, 0, 0], R_UpperLeg: [-0.9, 0, 0], L_LowerLeg: [1.5, 0, 0], R_LowerLeg: [1.4, 0, 0], L_UpperArm: [0, -0.9, -0.9], R_UpperArm: [0, 0.9, 0.9], L_LowerArm: [0, -1.2, 0], R_LowerArm: [0, 1.2, 0] },
	/** Knocked back by a snowball. */
	hit: { ...HOVER, Spine: [-0.35, 0, 0.08], Head: [-0.25, 0, 0], L_UpperArm: [0, 0, -0.6], R_UpperArm: [0, 0, 0.6], L_UpperLeg: [-0.1, 0, -0.1], R_UpperLeg: [0.1, 0, 0.1] },
	/** She's won: both arms up, waving. */
	cheer: { ...HOVER, L_UpperArm: [0, -0.25, 1.0], L_LowerArm: [0, -0.3, 0.3], R_UpperArm: [0, 0.25, -1.0], R_LowerArm: [0, 0.3, -0.3], Head: [0, 0, -0.12] },
	/** She's lost: sat down on the roof, legs out, leaning back on her hands, laughing. */
	sit: {
		Spine: [-0.25, 0, 0], Head: [0.12, 0, 0],
		L_UpperArm: [0, -0.5, -1.25], R_UpperArm: [0, 0.5, 1.25],
		L_UpperLeg: [-1.42, 0, -0.08], R_UpperLeg: [-2.0, 0, 0.15], L_LowerLeg: [0, 0, 0], R_LowerLeg: [2.1, 0, 0], L_Foot: [0.3, 0, 0], R_Foot: [0.3, 0, 0],
	},
} satisfies Record<string, Pose>;
export type PoseName = keyof typeof POSES;

/** Her faces, as weights of the model's face keys. */
const FACES = {
	neutral: {},
	smile: { Fcl_ALL_Joy: 0.55 },
	grin: { Fcl_ALL_Fun: 0.8 },
	laugh: { Fcl_ALL_Joy: 1 },
	fierce: { Fcl_ALL_Angry: 0.55, Fcl_MTH_Fun: 0.35 },
	ouch: { Fcl_ALL_Surprised: 0.85 },
	sad: { Fcl_ALL_Sorrow: 0.7 },
} satisfies Record<string, Record<string, number>>;
export type FaceName = keyof typeof FACES;
const FACE_KEYS = ['Fcl_ALL_Joy', 'Fcl_ALL_Fun', 'Fcl_ALL_Angry', 'Fcl_ALL_Surprised', 'Fcl_ALL_Sorrow', 'Fcl_MTH_Fun', 'Fcl_EYE_Close', 'Fcl_MTH_A'];

export function createNoeul(game: Game) {
	const group = new THREE.Group();
	group.scale.setScalar(SCALE);
	game.scene.add(group);

	const bones = new Map<Bone, THREE.Object3D>();
	/** Each bone's rest, and its parent's turn at rest (in her space), to pose in her axes. */
	const rest = new Map<THREE.Object3D, { local: THREE.Quaternion; parent: THREE.Quaternion; parentInv: THREE.Quaternion }>();
	/** Her pose as it is now, easing toward `target`. */
	const now = new Map<Bone, THREE.Vector3>(BONES.map((b) => [b, new THREE.Vector3()]));
	let target: Pose = POSES.hover;
	let ease = 8;
	const faces: THREE.Mesh[] = [];
	const faceNow: Record<string, number> = Object.fromEntries(FACE_KEYS.map((k) => [k, 0]));
	let face: FaceName = 'smile';
	let faceUntil = 0;
	let faceAfter: FaceName = 'smile';
	let talking = 0;
	let blinkAt = 2;
	let springs: ReturnType<typeof createSprings> | null = null;

	const q = new THREE.Quaternion();
	const e = new THREE.Euler();
	const v = new THREE.Vector3();
	const toNix = new THREE.Vector3();
	let lookYaw = 0;
	let lookPitch = 0;
	let clock = 0;

	const ready = new GLTFLoader().loadAsync(noeulUrl).then((gltf) => {
		const model = gltf.scene;
		const ink = nodeLook.inkLine('#1d1b3a', 0.004 / SCALE);
		const meshes: THREE.Mesh[] = [];
		model.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
		for (const mesh of meshes) {
			const from = mesh.material as THREE.MeshBasicMaterial;
			// Skinned, her bounds move with her bones: don't let the camera's culling guess at them.
			mesh.frustumCulled = false;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			// The eyes' highlights stay as bright as they're painted; the rest takes the light.
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
			// An ink line round her skin and clothes (not hair, eyes or brows: they're cut out of their
			// pictures, so a line round them would draw the whole card).
			if (mesh instanceof THREE.SkinnedMesh && !/HAIR|Streak|Eye|FaceBrow|FaceMouth|Silver/.test(from.name)) {
				const line = new THREE.SkinnedMesh(mesh.geometry, ink);
				line.bind(mesh.skeleton, mesh.bindMatrix);
				line.frustumCulled = false;
				if (mesh.morphTargetInfluences) line.morphTargetInfluences = mesh.morphTargetInfluences;
				mesh.add(line);
			}
		}
		group.add(model);

		model.updateMatrixWorld(true);
		const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
		const parentTurn = (o: THREE.Object3D) => {
			const m = new THREE.Matrix4().multiplyMatrices(inv, o.parent!.matrixWorld);
			return new THREE.Quaternion().setFromRotationMatrix(m);
		};
		for (const b of BONES) {
			const o = model.getObjectByName(`J_Bip_C_${b}`) ?? model.getObjectByName(`J_Bip_${b}`);
			if (!o) continue;
			bones.set(b, o);
			const parent = parentTurn(o);
			rest.set(o, { local: o.quaternion.clone(), parent, parentInv: parent.clone().invert() });
		}
		springs = createSprings(gltf);
	});

	/** Turns a bone by `x, y, z` in her own axes, from where it rests. */
	function turn(b: Bone, x: number, y: number, z: number) {
		const o = bones.get(b);
		if (!o) return;
		const r = rest.get(o)!;
		q.setFromEuler(e.set(x, y, z, 'XYZ'));
		o.quaternion.copy(r.parentInv).multiply(q).multiply(r.parent).multiply(r.local);
	}

	return {
		group,
		ready,
		/** Eases into a pose, `speed` quick (8 is a gentle shift, 20 a snap). */
		pose(name: PoseName, speed = 8) {
			target = POSES[name];
			ease = speed;
		},
		/** A face for `seconds` (for good if not given), then back to `after`. */
		face(name: FaceName, seconds = 0, after: FaceName = faceAfter) {
			face = name;
			faceUntil = seconds ? clock + seconds : 0;
			if (!seconds) faceAfter = name;
			else faceAfter = after;
		},
		/** Moves her mouth as if talking, for a while. */
		talk(seconds: number) {
			talking = seconds;
		},
		/** Where a hand is, in the world. */
		hand(side: 'L' | 'R', out: THREE.Vector3) {
			const o = bones.get(side === 'L' ? 'L_Hand' : 'R_Hand');
			return o ? o.getWorldPosition(out) : out.copy(group.position).setY(group.position.y + 1.4);
		},
		/** The middle of her, for aiming at. */
		chest(out: THREE.Vector3) {
			const o = bones.get('Chest');
			return o ? o.getWorldPosition(out) : out.copy(group.position).setY(group.position.y + 1.3);
		},
		/** After a blink across the roof: her hair shouldn't stream all the way from where she was. */
		settle() {
			springs?.reset();
		},
		update(dt: number, time: number, nix: THREE.Vector3) {
			clock = time;
			if (!bones.size) return;
			// Ease toward the pose.
			const k = 1 - Math.exp(-ease * dt);
			for (const b of BONES) {
				const t = target[b];
				now.get(b)!.lerp(v.set(t?.[0] ?? 0, t?.[1] ?? 0, t?.[2] ?? 0), k);
			}
			// Then what moves on top of it: a breath, a sway, her head turned to Nixchan.
			toNix.copy(nix).sub(group.position);
			let yaw = Math.atan2(toNix.x, toNix.z) - group.rotation.y;
			yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
			if (Math.abs(yaw) > 1.8) yaw = 0;
			const pitch = -Math.atan2(toNix.y + 0.8 - 1.45 * SCALE, Math.hypot(toNix.x, toNix.z) || 1);
			lookYaw += (THREE.MathUtils.clamp(yaw, -1, 1) - lookYaw) * Math.min(1, dt * 5);
			lookPitch += (THREE.MathUtils.clamp(pitch, -0.4, 0.4) - lookPitch) * Math.min(1, dt * 5);
			const sitting = target === POSES.sit;
			for (const b of BONES) {
				const p = now.get(b)!;
				let { x, y, z } = p;
				if (b === 'Chest') x += Math.sin(time * 1.7) * 0.025;
				if (b === 'Neck') y += lookYaw * 0.35;
				if (b === 'Head') {
					y += lookYaw * 0.55;
					x += lookPitch * 0.6 + Math.sin(time * 0.9) * 0.03;
				}
				if (!sitting && (b === 'L_LowerLeg' || b === 'R_LowerLeg')) x += Math.sin(time * 2.1 + (b === 'L_LowerLeg' ? 0 : 1.7)) * 0.08;
				if (target === POSES.cheer && (b === 'R_UpperArm' || b === 'L_UpperArm')) z += Math.sin(time * 8 + (b === 'L_UpperArm' ? Math.PI : 0)) * 0.25;
				turn(b, x, y, z);
			}

			// Her face, easing, with a blink every few seconds (not while her eyes are smiling shut).
			if (faceUntil && time > faceUntil) {
				face = faceAfter;
				faceUntil = 0;
			}
			const want: Record<string, number> = { ...FACES[face] };
			const eyesShut = (want.Fcl_ALL_Joy ?? 0) > 0.8 || (want.Fcl_ALL_Fun ?? 0) > 0.5;
			const since = time - blinkAt;
			const shut = eyesShut || since < 0 || since > 0.15 ? 0 : 1 - Math.abs(since / 0.075 - 1);
			if (since > 0.15) blinkAt = time + 2.5 + Math.random() * 3;
			want.Fcl_EYE_Close = shut;
			talking = Math.max(0, talking - dt);
			want.Fcl_MTH_A = talking > 0 ? 0.25 + 0.3 * Math.abs(Math.sin(time * 13)) : 0;
			for (const key of FACE_KEYS) {
				const goal = want[key] ?? 0;
				faceNow[key] += (goal - faceNow[key]) * (key === 'Fcl_EYE_Close' ? 1 : Math.min(1, dt * 10));
			}
			for (const f of faces) {
				const dict = f.morphTargetDictionary!;
				for (const key of FACE_KEYS) if (key in dict) f.morphTargetInfluences![dict[key]] = faceNow[key];
			}
			springs?.update(dt);
		},
	};
}

export type Noeul = ReturnType<typeof createNoeul>;
