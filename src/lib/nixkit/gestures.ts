// Short, visual-only body cues layered over Idle. Nothing here can move the physics player.
import * as THREE from 'three';
import type { Emotion } from './emotions';

export type GestureName = Emotion | 'dance';
export const GESTURE_SECONDS: Readonly<Record<GestureName, number>> = {
	happy: 1.1, surprised: 0.8, determined: 1.25, sad: 1.6, dance: 3.6,
};
type Angles = readonly [number, number, number];
export interface GesturePose { lift: number; bones: Partial<Record<string, Angles>> }
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Stateless sampling makes the same cue independent of rendering frame rate. */
export function sampleGesture(name: GestureName, elapsed: number): GesturePose {
	const duration = GESTURE_SECONDS[name];
	if (!duration || !Number.isFinite(elapsed) || elapsed <= 0 || elapsed >= duration) return { lift: 0, bones: {} };
	const attack = name === 'surprised' ? 0.09 : 0.18;
	const weight = smooth(elapsed / attack) * smooth((duration - elapsed) / 0.3);
	const bones: GesturePose['bones'] = {};
	const bone = (id: string, x = 0, y = 0, z = 0) => { bones[id] = [x * weight, y * weight, z * weight]; };
	let lift = 0;
	if (name === 'dance') {
		// Eight beats at 133 bpm: six opposite-arm knee lifts, then two side taps and a ta-da.
		// The supporting leg remains still; no root translation or real jump is involved.
		const phase = elapsed * Math.PI * 2 / 0.9;
		const groove = Math.sin(phase);
		const left = Math.max(0, groove) ** 2;
		const right = Math.max(0, -groove) ** 2;
		const finale = smooth((elapsed - 2.55) / 0.2);
		for (const [side, step, opposite] of [['L', left, right], ['R', right, left]] as const) {
			const sign = side === 'L' ? 1 : -1;
			bone('Thigh' + side, (-0.48 + 0.16 * finale) * step, 0, sign * (0.1 + 0.18 * finale) * step);
			bone('Shin' + side, (0.92 - 0.32 * finale) * step);
			// Cancel the knee/thigh rotation so her lifted sole stays nearly level.
			bone('Foot' + side, (-0.44 + 0.16 * finale) * step, 0, -sign * (0.1 + 0.18 * finale) * step);
			bone('UpperArm' + side, (-0.25 - 0.65 * opposite) * (1 - finale) - 0.4 * finale, 0,
				sign * ((0.28 + 0.12 * step) * (1 - finale) + 0.75 * finale));
			bone('LowerArm' + side, (-0.65 - 0.35 * opposite) * (1 - finale) - 0.45 * finale);
			bone('Hand' + side, 0, 0, sign * (0.12 * groove + 0.16 * finale));
		}
		bone('Chest', 0.035 * Math.sin(phase * 2) - 0.035 * finale, 0.09 * groove, -0.085 * groove);
		bone('Head', -0.025 * Math.sin(phase * 2), -0.045 * groove, 0.045 * groove);
	} else if (name === 'happy') {
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
	let cue: { name: GestureName; elapsed: number } | null = null;
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
		play(name: GestureName) {
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
			// Ground the visual pose against its own animated baseline. Comparing ankles avoids
			// assuming a model scale or rest height and follows the lower (supporting) foot.
			const feet = cue.name === 'dance' ? [figure.node('FootL'), figure.node('FootR')].filter((n): n is THREE.Object3D => n !== null) : [];
			const footY = () => Math.min(...feet.map(node => node.getWorldPosition(new THREE.Vector3()).y));
			const floor = feet.length === 2 ? footY() : null;
			position = figure.group.position.clone();
			figure.group.position.y += pose.lift;
			for (const [name, angles] of Object.entries(pose.bones)) {
				const node = figure.node(name);
				if (!node || !angles) continue;
				saved.set(node, node.quaternion.clone());
				node.quaternion.multiply(rotation.setFromEuler(euler.set(...angles)));
			}
			if (floor !== null) {
				const correction = floor - footY();
				const parent = figure.group.parent;
				const delta = new THREE.Vector3(0, correction, 0);
				if (parent) {
					const origin = parent.worldToLocal(new THREE.Vector3());
					parent.worldToLocal(delta).sub(origin);
				}
				figure.group.position.add(delta);
			}
		},
	};
}
