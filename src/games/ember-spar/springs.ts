// Noeul's hair, skirt and sleeves swing as she moves: VRM's spring bones (the VRMC_springBone
// extension her .vrm carries), worked out here since three's GLTFLoader reads the bones but not the
// springs. Each joint's tail is a point with a little inertia, pulled back toward where the bone
// rests (stiffness), dragged, kept its length from the joint, and pushed out of her colliders
// (spheres and capsules on her head, body and limbs); the bone is then turned to point at it.
// It's the algorithm the VRM 1.0 spec describes, without its `center` space.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface SpringJoint {
	node: number;
	hitRadius?: number;
	stiffness?: number;
	gravityPower?: number;
	gravityDir?: [number, number, number];
	dragForce?: number;
}
interface SpringExt {
	colliders?: { node: number; shape: { sphere?: { offset?: number[]; radius?: number }; capsule?: { offset?: number[]; radius?: number; tail?: number[] } } }[];
	colliderGroups?: { colliders: number[] }[];
	springs?: { joints: SpringJoint[]; colliderGroups?: number[] }[];
}

interface Collider {
	bone: THREE.Object3D;
	offset: THREE.Vector3;
	tail: THREE.Vector3 | null;
	radius: number;
	// Where it is this frame, in world space.
	at: THREE.Vector3;
	to: THREE.Vector3;
}

interface Joint {
	bone: THREE.Object3D;
	rest: THREE.Quaternion;
	/** Which way the child lies from the joint, in the joint's own space at rest, and how far. */
	axis: THREE.Vector3;
	length: number;
	stiffness: number;
	drag: number;
	gravity: THREE.Vector3;
	radius: number;
	tail: THREE.Vector3;
	prev: THREE.Vector3;
	colliders: Collider[];
}

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const head = new THREE.Vector3();
const next = new THREE.Vector3();
const q = new THREE.Quaternion();
const qp = new THREE.Quaternion();
const s = new THREE.Vector3();

export function createSprings(gltf: GLTF) {
	const ext = (gltf.parser.json as { extensions?: { VRMC_springBone?: SpringExt } }).extensions?.VRMC_springBone;
	// The glTF's node numbers, to the objects GLTFLoader made of them.
	const byNode = new Map<number, THREE.Object3D>();
	gltf.scene.traverse((o) => {
		const n = gltf.parser.associations.get(o)?.nodes;
		if (n !== undefined && !byNode.has(n)) byNode.set(n, o);
	});

	const colliders: (Collider | null)[] = (ext?.colliders ?? []).map((c) => {
		const bone = byNode.get(c.node);
		const shape = c.shape.sphere ?? c.shape.capsule;
		if (!bone || !shape) return null;
		const tail = c.shape.capsule?.tail;
		return { bone, offset: new THREE.Vector3().fromArray(shape.offset ?? [0, 0, 0]), tail: tail ? new THREE.Vector3().fromArray(tail) : null, radius: shape.radius ?? 0, at: new THREE.Vector3(), to: new THREE.Vector3() };
	});
	const groups = (ext?.colliderGroups ?? []).map((g) => g.colliders.map((i) => colliders[i]).filter((c): c is Collider => !!c));

	const joints: Joint[] = [];
	for (const spring of ext?.springs ?? []) {
		const cs = [...new Set((spring.colliderGroups ?? []).flatMap((g) => groups[g] ?? []))];
		// Each joint swings toward the next; the last is only a tail.
		for (let i = 0; i < spring.joints.length - 1; i++) {
			const j = spring.joints[i];
			const bone = byNode.get(j.node);
			const child = byNode.get(spring.joints[i + 1].node);
			if (!bone || !child) continue;
			joints.push({
				bone,
				rest: bone.quaternion.clone(),
				axis: child.position.clone().normalize(),
				length: child.position.length(),
				stiffness: j.stiffness ?? 1,
				drag: j.dragForce ?? 0.4,
				gravity: new THREE.Vector3().fromArray(j.gravityDir ?? [0, -1, 0]).multiplyScalar(j.gravityPower ?? 0),
				radius: j.hitRadius ?? 0,
				tail: new THREE.Vector3(),
				prev: new THREE.Vector3(),
				colliders: cs,
			});
		}
	}
	const used = [...new Set(joints.flatMap((j) => j.colliders))];

	/** Puts every tail back where its bone points, at rest (after she's blinked across the roof). */
	function reset() {
		gltf.scene.updateMatrixWorld(true);
		for (const j of joints) {
			j.bone.quaternion.copy(j.rest);
			j.bone.updateMatrixWorld(true);
			j.tail.copy(j.axis).multiplyScalar(j.length).applyMatrix4(j.bone.matrixWorld);
			j.prev.copy(j.tail);
		}
	}
	let fresh = true;

	/** Moves the springs on by `dt`, once her bones have been posed for the frame. */
	function update(dt: number) {
		if (!joints.length) return;
		if (fresh) {
			reset();
			fresh = false;
			return;
		}
		gltf.scene.updateMatrixWorld(true);
		for (const c of used) {
			c.at.copy(c.offset).applyMatrix4(c.bone.matrixWorld);
			if (c.tail) c.to.copy(c.tail).applyMatrix4(c.bone.matrixWorld);
		}
		// In small steps, so a fast blink or a long frame doesn't throw the hair about.
		const steps = Math.min(4, Math.ceil(dt / (1 / 60)));
		const h = Math.min(dt, 1 / 15) / steps;
		for (let k = 0; k < steps; k++) {
			for (const j of joints) {
				const parent = j.bone.parent!;
				parent.updateMatrixWorld(false);
				j.bone.updateMatrixWorld(false);
				head.setFromMatrixPosition(j.bone.matrixWorld);
				j.bone.matrixWorld.decompose(w, q, s);
				const scale = s.x;
				parent.getWorldQuaternion(qp);
				// Where it would point at rest, from the parent as it is now.
				const restDir = v.copy(j.axis).applyQuaternion(q.copy(qp).multiply(j.rest));
				next.copy(j.tail)
					.addScaledVector(w.copy(j.tail).sub(j.prev), 1 - j.drag)
					.addScaledVector(restDir, j.stiffness * h)
					.addScaledVector(j.gravity, h);
				// The tail stays its length from the joint, and out of her.
				const len = j.length * scale;
				next.sub(head).setLength(len).add(head);
				for (const c of j.colliders) {
					const r = (c.radius + j.radius) * scale;
					let centre = c.at;
					if (c.tail) {
						// The nearest point on the capsule's middle line.
						w.copy(c.to).sub(c.at);
						const t = THREE.MathUtils.clamp(v.copy(next).sub(c.at).dot(w) / (w.lengthSq() || 1), 0, 1);
						centre = w.multiplyScalar(t).add(c.at);
					}
					const d = v.copy(next).sub(centre);
					const dl = d.length();
					if (dl < r && dl > 1e-6) {
						next.copy(centre).addScaledVector(d, r / dl);
						next.sub(head).setLength(len).add(head);
					}
				}
				j.prev.copy(j.tail);
				j.tail.copy(next);
				// Turn the bone to point at its tail.
				const to = v.copy(next).sub(head).applyQuaternion(q.copy(qp).multiply(j.rest).invert()).normalize();
				j.bone.quaternion.copy(j.rest).multiply(q.setFromUnitVectors(j.axis, to));
				j.bone.updateMatrixWorld(true);
			}
		}
	}

	return { update, reset: () => (fresh = true), count: joints.length };
}
