// A treat bought from one of the stalls: Nixchan holds it in her right hand and takes three bites,
// lifting it to her mouth each time (the same arm reach as the ramen's chopsticks), until it's gone.
import * as THREE from 'three';
import type { Player } from '../../lib/nixkit/player';
import { makeArm } from './ramen';

export type TreatKind = 'bungeo' | 'eomuk';
export const TREAT_SECONDS = 6.0;
/** When each bite starts; a bite takes BITE seconds, up to her mouth and back. */
const BITES = [1.4, 2.9, 4.4] as const;
const BITE = 1.0;
/** Drawn bigger than life, as the ramen cup is, to read in her big chibi hands. */
const SIZE = 1.9;

const ease = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b);
const up = new THREE.Vector3(0, 1, 0);

/** How many bites have been taken `t` seconds in (a bite counts once it's reached her mouth). */
export function bitesTaken(t: number) {
	return BITES.filter((start) => t >= start + BITE * 0.45).length;
}

export function createTreats(scene: THREE.Scene, player: Player) {
	const holder = new THREE.Group();
	holder.visible = false;
	scene.add(holder);
	const props = new Map<TreatKind, THREE.Object3D>();
	let kind: TreatKind | null = null;
	let t = 0;
	let arm: ReturnType<typeof makeArm> | null = null;
	let hand: THREE.Object3D | null = null;
	let head: THREE.Object3D | null = null;
	const at = new THREE.Vector3(), mouth = new THREE.Vector3(), target = new THREE.Vector3();
	const forward = new THREE.Vector3(), side = new THREE.Vector3();

	return {
		/** The models, once they've loaded (stalls.glb). */
		set(k: TreatKind, prop: THREE.Object3D) {
			prop.position.set(0, 0, 0);
			prop.visible = false;
			props.set(k, prop);
			holder.add(prop);
		},
		get holding() {
			return kind;
		},
		start(k: TreatKind) {
			kind = k;
			t = 0;
		},
		/** Call after the player has moved. Returns the kind of treat just finished, if one was. */
		update(dt: number, reduced: boolean): { bite: boolean; done: TreatKind | null } {
			arm?.restore();
			holder.visible = false;
			if (!kind) return { bite: false, done: null };
			const before = bitesTaken(t);
			t += dt;
			const after = bitesTaken(t);
			if (t >= TREAT_SECONDS) {
				const done = kind;
				kind = null;
				return { bite: false, done };
			}
			const { figure, turn } = player;
			hand ??= figure.node('HandR');
			head ??= figure.node('HeadPivot');
			if (!arm) {
				const upper = figure.node('UpperArmR'), lower = figure.node('LowerArmR');
				if (upper && lower && hand) arm = makeArm(upper, lower, hand, -1);
			}
			if (!hand) return { bite: after > before, done: null };
			forward.set(Math.sin(turn), 0, Math.cos(turn));
			side.set(Math.cos(turn), 0, -Math.sin(turn));
			// How far into a bite she is: up to her mouth, a moment there, and back down.
			let lift = 0;
			for (const start of BITES) {
				const u = t - start;
				if (u > 0 && u < BITE) lift = ease(0, 0.38, u) * (1 - ease(0.62, 1, u));
			}
			if (reduced) lift = lift > 0.1 ? 1 : 0;
			if (lift > 0.001 && arm) {
				if (head) head.localToWorld(mouth.set(0, -0.27, 0.56));
				else mouth.copy(player.pos).addScaledVector(up, 1.55).addScaledVector(forward, 0.45);
				hand.getWorldPosition(at);
				// The bite is at the top of the fish, or the fish cake up the skewer.
				target.copy(at).lerp(mouth.addScaledVector(forward, -0.03).addScaledVector(forward, -0.1).addScaledVector(up, kind === 'bungeo' ? -0.2 : -0.42), lift);
				arm.reach(target, turn, 1);
			}
			hand.getWorldPosition(at);
			const prop = props.get(kind);
			for (const [k, p] of props) p.visible = k === kind;
			holder.visible = !!prop;
			holder.position.copy(at).addScaledVector(forward, 0.13).addScaledVector(up, 0.04);
			holder.rotation.set(0, turn, 0);
			// The fish is held head up, the skewer upright in its cup; both tip toward her as they reach her mouth.
			if (kind === 'bungeo') holder.rotateZ(Math.PI / 2 - 0.25).rotateX(-0.3 * lift);
			else holder.rotateX(-0.12 - 0.3 * lift);
			// Each bite leaves a little less (and the last one, nothing at all).
			holder.scale.setScalar(SIZE * (1 - after * 0.24));
			return { bite: after > before, done: null };
		},
	};
}
