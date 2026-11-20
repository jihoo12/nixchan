import * as THREE from 'three';
import type { Player } from '../../lib/nixkit/player';

export type RamenState = 'empty' | 'dry' | 'hot' | 'eating' | 'done';

const CUP_RADIUS = 0.195;
const CUP_HEIGHT = 0.25;
const ink = (color: string) => new THREE.MeshBasicMaterial({ color });

function cupLabel() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 128;
	const g = canvas.getContext('2d')!;
	g.fillStyle = '#c45143';
	g.fillRect(0, 0, 512, 128);
	g.fillStyle = '#e98057';
	g.fillRect(0, 6, 512, 4);
	g.fillRect(0, 116, 512, 5);
	// Repeat the illustration on the opposite side so it reads from either aisle.
	for (const x of [128, 384]) {
		g.fillStyle = '#f6d89c';
		g.beginPath();
		g.ellipse(x, 60, 73, 29, 0, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = '#7a3039';
		g.font = 'bold 31px sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText('NIGHT', x, 63);
		g.fillStyle = '#fff1c7';
		g.font = 'bold 17px sans-serif';
		g.fillText('CUP NOODLES', x, 101);
	}
	const map = new THREE.CanvasTexture(canvas);
	map.colorSpace = THREE.SRGBColorSpace;
	return map;
}

function makeCup() {
	const cup = new THREE.Group();
	const paper = new THREE.MeshStandardMaterial({ color: '#fff1dc', map: cupLabel(), roughness: 0.75 });
	const cream = ink('#fee8bf');
	const soup = new THREE.Group();
	const body = new THREE.Mesh(new THREE.CylinderGeometry(CUP_RADIUS, 0.137, CUP_HEIGHT, 32, 1, true), paper);
	body.position.y = CUP_HEIGHT / 2;
	cup.add(body);
	const ring = (r: number, width: number, y: number, material: THREE.Material) => {
		const m = new THREE.Mesh(new THREE.TorusGeometry(r, width, 8, 32), material);
		m.rotation.x = -Math.PI / 2;
		m.position.y = y;
		cup.add(m);
	};
	ring(CUP_RADIUS, 0.012, CUP_HEIGHT, cream);
	ring(0.136, 0.009, 0.012, cream);
	const disk = (r: number, y: number, material: THREE.Material, parent: THREE.Group) => {
		const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), material);
		m.rotation.x = -Math.PI / 2;
		m.position.y = y;
		parent.add(m);
		return m;
	};
	const lid = disk(CUP_RADIUS - 0.008, CUP_HEIGHT + 0.003, ink('#ffd88f'), cup);
	const pullTab = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, 0.045), cream);
	pullTab.position.set(0, CUP_HEIGHT + 0.004, 0.189);
	cup.add(pullTab);
	const interior = new THREE.Mesh(
		new THREE.CylinderGeometry(CUP_RADIUS - 0.01, 0.145, 0.10, 32, 1, true),
		new THREE.MeshBasicMaterial({ color: '#ffe4ac', side: THREE.BackSide }),
	);
	interior.position.y = CUP_HEIGHT - 0.05;
	soup.add(interior);
	disk(0.165, 0.197, ink('#d88942'), soup);
	const noodle = ink('#ffe09a');
	for (let i = 0; i < 5; i++) {
		const points: THREE.Vector3[] = [];
		for (let j = 0; j < 13; j++) {
			const x = -0.111 + j * 0.0185;
			points.push(new THREE.Vector3(x, 0.205 + (i % 3) * 0.002, (i - 2) * 0.046 + Math.sin(j * 0.94 + i * 2) * 0.019));
		}
		soup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, 0.0075, 5, false), noodle));
	}
	const garnish = ink('#619060');
	for (let i = 0; i < 3; i++) {
		const scallion = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.009, 0.014), garnish);
		scallion.position.set(-0.102 + i * 0.097, 0.212, Math.cos(i * 2.8) * 0.077);
		scallion.rotation.y = i * 1.8;
		soup.add(scallion);
	}
	cup.add(soup);
	const wispCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.034, 0.075, 0),
		new THREE.Vector3(-0.018, 0.155, 0.015), new THREE.Vector3(-0.007, 0.23, 0),
	]);
	const wispGeometry = new THREE.TubeGeometry(wispCurve, 12, 0.011, 5, false);
	const wisps = Array.from({ length: 3 }, () => {
		const m = new THREE.Mesh(wispGeometry, new THREE.MeshBasicMaterial({ color: '#fff3cf', transparent: true, opacity: 0.32, depthWrite: false }));
		cup.add(m);
		return m;
	});
	return { cup, lid, pullTab, soup, wisps, noodle };
}

const ease = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b);

/** Aim an animated limb at a nearby world-space target. The authored pose supplies its twist;
 * the pole keeps the elbow bent out rather than cutting backwards through her jacket. */
export function makeArm(upper: THREE.Object3D, lower: THREE.Object3D, wrist: THREE.Object3D, side: number) {
	const upperStart = new THREE.Quaternion(), lowerStart = new THREE.Quaternion();
	const upperPosed = new THREE.Quaternion(), lowerPosed = new THREE.Quaternion();
	const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), hand = new THREE.Vector3();
	const axis = new THREE.Vector3(), elbowTarget = new THREE.Vector3(), handTarget = new THREE.Vector3();
	const normal = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
	const delta = new THREE.Quaternion(), parent = new THREE.Quaternion(), local = new THREE.Quaternion();
	const old = { changed: false };
	function aim(joint: THREE.Object3D, start: THREE.Vector3, have: THREE.Vector3, want: THREE.Vector3) {
		if (!joint.parent) return;
		from.copy(have).sub(start).normalize();
		to.copy(want).sub(start).normalize();
		delta.setFromUnitVectors(from, to);
		joint.parent.getWorldQuaternion(parent);
		local.copy(parent).invert().multiply(delta).multiply(parent).multiply(joint.quaternion);
		joint.quaternion.copy(local);
	}
	return {
		// Call before leaving the emote: the player's animation mixer owns the rig again after this.
		restore() {
			if (!old.changed) return;
			// Don't overwrite a fresher pose if Nixkit's mixer has already updated this joint.
			if (upper.quaternion.equals(upperPosed)) upper.quaternion.copy(upperStart);
			if (lower.quaternion.equals(lowerPosed)) lower.quaternion.copy(lowerStart);
			old.changed = false;
		},
		reach(target: THREE.Vector3, yaw: number, weight: number) {
			if (weight <= 0.0001) return;
			upperStart.copy(upper.quaternion);
			lowerStart.copy(lower.quaternion);
			upper.getWorldPosition(shoulder);
			lower.getWorldPosition(elbow);
			wrist.getWorldPosition(hand);
			const a = shoulder.distanceTo(elbow);
			const b = elbow.distanceTo(hand);
			hand.lerp(target, weight);
			axis.copy(hand).sub(shoulder);
			const len = axis.length();
			if (len < 0.001 || a < 0.001 || b < 0.001) return;
			axis.multiplyScalar(1 / len);
			const reach = Math.min(a + b - 0.005, Math.max(Math.abs(a - b) + 0.005, len));
			normal.set(side, -0.68, -0.5).applyAxisAngle(up, yaw);
			normal.addScaledVector(axis, -normal.dot(axis)).normalize();
			const along = (a * a + reach * reach - b * b) / (2 * reach);
			handTarget.copy(shoulder).addScaledVector(axis, reach);
			elbowTarget.copy(shoulder).addScaledVector(axis, along).addScaledVector(normal, Math.sqrt(Math.max(0, a * a - along * along)));
			aim(upper, shoulder, elbow, elbowTarget);
			lower.getWorldPosition(elbow);
			wrist.getWorldPosition(hand);
			aim(lower, elbow, hand, handTarget);
			upperPosed.copy(upper.quaternion);
			lowerPosed.copy(lower.quaternion);
			old.changed = true;
		},
	};
}

const up = new THREE.Vector3(0, 1, 0);

/** After the Nixkit player updates, align the props to its hands. The custom arm pose is used
 * solely for the meal; walking, idle, and jumping still belong to the stock character rig. */
export function createRamen(scene: THREE.Scene, player: Player) {
	const { cup, lid, pullTab, soup, wisps, noodle } = makeCup();
	cup.visible = false;
	scene.add(cup);
	const sticks = new THREE.Group();
	sticks.visible = false;
	const wood = new THREE.MeshStandardMaterial({ color: '#d38a43', roughness: 0.9 });
	const tipCaps = ink('#fff1c7');
	for (const x of [-0.018, 0.018]) {
		const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.015, 0.29, 8), wood);
		shaft.position.set(x, 0.064, 0);
		sticks.add(shaft);
		const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.052, 8), tipCaps);
		grip.position.set(x, -0.058, 0);
		sticks.add(grip);
	}
	scene.add(sticks);
	const dangling = new THREE.Group();
	dangling.visible = false;
	for (let i = 0; i < 3; i++) {
		const j = (i - 1) * 0.008;
		const strand = new THREE.CatmullRomCurve3([
			new THREE.Vector3(j, 0, 0), new THREE.Vector3(j + 0.006, -0.053, 0.008),
			new THREE.Vector3(j - 0.011, -0.103 - i * 0.009, -0.006), new THREE.Vector3(j, -0.147 - i * 0.012, 0.007),
		]);
		dangling.add(new THREE.Mesh(new THREE.TubeGeometry(strand, 10, 0.0055, 4, false), noodle));
	}
	scene.add(dangling);

	const mid = new THREE.Vector3(), leftAt = new THREE.Vector3(), rightAt = new THREE.Vector3();
	const carryAt = new THREE.Vector3(), leftTarget = new THREE.Vector3(), rightTarget = new THREE.Vector3();
	const eatAt = new THREE.Vector3(), mouth = new THREE.Vector3(), soupAt = new THREE.Vector3();
	const tips = new THREE.Vector3(), aim = new THREE.Vector3(), forward = new THREE.Vector3(), side = new THREE.Vector3();
	const motion = new THREE.Vector3();
	let leftArm: ReturnType<typeof makeArm> | null = null;
	let rightArm: ReturnType<typeof makeArm> | null = null;
	let left: THREE.Object3D | null = null;
	let right: THREE.Object3D | null = null;
	let head: THREE.Object3D | null = null;

	function update(state: RamenState, elapsed: number, reducedMotion: boolean) {
		const visible = state === 'dry' || state === 'hot' || state === 'eating';
		const eating = state === 'eating';
		// The mixer can skip identical keys. Clear any procedural pose it hasn't overwritten yet.
		leftArm?.restore();
		rightArm?.restore();
		cup.visible = false;
		sticks.visible = false;
		dangling.visible = false;
		if (!visible) return;

		const { figure, turn } = player;
		left ??= figure.node('HandL');
		right ??= figure.node('HandR');
		if (!left || !right) return;
		cup.visible = true;
		left.getWorldPosition(leftAt);
		right.getWorldPosition(rightAt);
		mid.copy(leftAt).add(rightAt).multiplyScalar(0.5);
		forward.set(Math.sin(turn), 0, Math.cos(turn));
		side.set(Math.cos(turn), 0, -Math.sin(turn));
		carryAt.copy(mid).addScaledVector(forward, 0.105).y -= 0.145;
		cup.rotation.set(0, turn, 0);
		cup.position.copy(carryAt);
		lid.visible = pullTab.visible = state === 'dry';
		soup.visible = state !== 'dry';
		if (eating) {
			if (!leftArm) {
				const upper = figure.node('UpperArmL'), lower = figure.node('LowerArmL');
				if (upper && lower) leftArm = makeArm(upper, lower, left, 1);
			}
			if (!rightArm) {
				const upper = figure.node('UpperArmR'), lower = figure.node('LowerArmR');
				if (upper && lower) rightArm = makeArm(upper, lower, right, -1);
			}
			const phase = elapsed < 2.5 ? Math.max(0, elapsed - 0.40) : elapsed - 2.5;
			const hasBite = elapsed >= 0.40 && elapsed < 4.36;
			const lift = hasBite ? ease(0.12, 0.82, phase) * (1 - ease(1.23, 1.82, phase)) : 0;
			const settle = ease(0.04, 0.46, elapsed) * (1 - ease(4.13, 4.59, elapsed));
			eatAt.copy(carryAt).addScaledVector(side, 0.065).addScaledVector(forward, 0.028);
			eatAt.y += settle * (0.12 + lift * 0.12);
			cup.position.lerp(eatAt, settle);
			cup.rotateX(-0.095 * lift);
			// Wrist targets are at the sleeve joints, just outside the cup and the prop's actual grip.
			leftTarget.copy(cup.position).addScaledVector(side, 0.218).addScaledVector(forward, -0.086);
			leftTarget.y += 0.107;
			leftArm?.reach(leftTarget, turn, settle);

			head ??= figure.node('HeadPivot');
			if (head) head.localToWorld(mouth.set(0, -0.255, 0.512));
			else mouth.copy(player.pos).addScaledVector(forward, 0.51).addScaledVector(up, 1.6);
			const bite = reducedMotion && lift > 0.2 ? Math.min(1, 0.24 + lift * 0.76) : lift;
			cup.localToWorld(soupAt.set(-0.055, 0.214, 0));
			tips.copy(soupAt).lerp(mouth, bite).addScaledVector(forward, 0.019 * bite);
			motion.copy(side).multiplyScalar(0.16).addScaledVector(up, 0.20).addScaledVector(forward, -0.05);
			motion.lerp(aim.copy(side).multiplyScalar(0.19).addScaledVector(up, -0.06).addScaledVector(forward, -0.08), bite);
			rightTarget.copy(tips).sub(motion);
			rightArm?.reach(rightTarget, turn, settle);
			right.getWorldPosition(rightAt);
			sticks.visible = settle > 0.32;
			if (sticks.visible) {
				// After clamping arm reach, let the chopsticks swivel without leaving the hand.
				sticks.position.copy(rightAt).addScaledVector(forward, 0.052).addScaledVector(side, 0.022);
				aim.copy(tips).sub(sticks.position).normalize();
				if (aim.lengthSq() > 0.5) sticks.quaternion.setFromUnitVectors(up, aim);
				const noodleHeight = ease(0.15, 0.52, phase) * (1 - ease(0.99, 1.23, phase));
				dangling.visible = hasBite && noodleHeight > 0.02;
				dangling.position.copy(sticks.position).addScaledVector(aim, 0.20);
				dangling.scale.y = Math.max(0.15, noodleHeight);
			}
		}
		for (let i = 0; i < wisps.length; i++) {
			const wisp = wisps[i];
			wisp.visible = state !== 'dry';
			if (!wisp.visible) continue;
			const u = reducedMotion ? 0.30 + i * 0.13 : (elapsed * 0.68 + i / wisps.length) % 1;
			wisp.position.set((i - 1) * 0.095 + (reducedMotion ? 0 : 0.025 * Math.sin(u * Math.PI)), 0.22 + u * 0.19, (i - 1) * 0.04);
			wisp.rotation.y = i * 1.9;
			wisp.scale.setScalar(0.65 + u * 0.65);
			wisp.material.opacity = Math.sin(u * Math.PI) * (reducedMotion ? 0.19 : 0.33);
		}
	}
	return { update };
}
