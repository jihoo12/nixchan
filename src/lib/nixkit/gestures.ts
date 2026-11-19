// Short, visual-only body cues layered over Idle. Nothing here can move the physics player.
import * as THREE from 'three';
import type { Emotion } from './emotions';

export const GESTURE_SECONDS: Readonly<Record<Emotion, number>> = {
	happy: 1.1, surprised: 0.8, determined: 1.25, sad: 1.6,
};
type Angles = readonly [number, number, number];
export interface GesturePose { lift: number; bones: Partial<Record<string, Angles>> }
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Stateless sampling makes the same cue independent of rendering frame rate. */
export function sampleGesture(name: Emotion, elapsed: number): GesturePose {
	const duration = GESTURE_SECONDS[name];
	if (!duration || !Number.isFinite(elapsed) || elapsed <= 0 || elapsed >= duration) return { lift: 0, bones: {} };
	const attack = name === 'surprised' ? 0.09 : 0.18;
	const weight = smooth(elapsed / attack) * smooth((duration - elapsed) / 0.3);
	const bones: GesturePose['bones'] = {};
	const bone = (id: string, x = 0, y = 0, z = 0) => { bones[id] = [x * weight, y * weight, z * weight]; };
	let lift = 0;
	if (name === 'happy') {
		// One small excited hop. The collider, grounded flag and camera target stay on the floor.
		const hop = Math.max(0, Math.sin(Math.PI * Math.max(0, Math.min(1, (elapsed - 0.16) / 0.52))));
		lift = 0.18 * hop;
		bone('UpperArmL', -0.5, 0, 0.18); bone('UpperArmR', -0.5, 0, -0.18);
		bone('LowerArmL', -0.9); bone('LowerArmR', -0.9);
		bone('Chest', -0.06);
	} else if (name === 'surprised') {
		bone('Chest', -0.16); bone('Head', -0.08);
		bone('UpperArmL', -0.4, 0, 0.24); bone('UpperArmR', -0.4, 0, -0.24);
		bone('LowerArmL', -0.65); bone('LowerArmR', -0.65);
	} else if (name === 'determined') {
		const pump = Math.sin(Math.PI * smooth((elapsed - 0.18) / 0.55));
		bone('UpperArmR', -0.75 - 0.35 * pump, 0, -0.25);
		bone('LowerArmR', -1.2); bone('HandR', 0.12);
		bone('Chest', -0.06, -0.08);
	} else {
		bone('Chest', 0.16); bone('Head', 0.12);
		bone('UpperArmL', 0.08, 0, -0.06); bone('UpperArmR', 0.08, 0, 0.06);
	}
	return { lift, bones };
}

interface GestureFigure { group: THREE.Object3D; node(name: string): THREE.Object3D | null }
/** Restore before the animation mixer ticks; apply afterwards. This avoids additive pose drift,
 * even on bones that aren't animated by a clip, or when a cue is interrupted/replaced. */
export function createGestureLayer(figure: GestureFigure) {
	let cue: { name: Emotion; elapsed: number } | null = null;
	const saved = new Map<THREE.Object3D, THREE.Quaternion>();
	let position: THREE.Vector3 | null = null;
	const rotation = new THREE.Quaternion();
	const euler = new THREE.Euler();
	const restore = () => {
		for (const [node, quaternion] of saved) node.quaternion.copy(quaternion);
		saved.clear();
		if (position) figure.group.position.copy(position);
		position = null;
	};
	const clear = () => { restore(); cue = null; };
	return {
		get active() { return cue !== null; },
		play(name: Emotion) {
			if (!Object.hasOwn(GESTURE_SECONDS, name)) return 0;
			clear();
			cue = { name, elapsed: 0 };
			return GESTURE_SECONDS[name];
		},
		restore,
		clear,
		tick(dt: number, allowed = true) {
			if (!allowed) { clear(); return; }
			if (!cue || !Number.isFinite(dt) || dt < 0) return;
			cue.elapsed += dt;
			if (cue.elapsed >= GESTURE_SECONDS[cue.name]) { clear(); return; }
			const pose = sampleGesture(cue.name, cue.elapsed);
			position = figure.group.position.clone();
			figure.group.position.y += pose.lift;
			for (const [name, angles] of Object.entries(pose.bones)) {
				const node = figure.node(name);
				if (!node || !angles) continue;
				saved.set(node, node.quaternion.clone());
				node.quaternion.multiply(rotation.setFromEuler(euler.set(...angles)));
			}
		},
	};
}
