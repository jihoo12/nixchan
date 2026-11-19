// The player's view choice is separate from the camera a scene is using right now.
// A game can temporarily keep its third-person framing without changing that choice.
import type { PerspectiveCamera, Vector3 } from 'three';

export function createViewMode() {
	let selected = false;
	return {
		/** Whether the player selected first person, even if the game is overriding it. */
		get active() {
			return selected;
		},
		/** Ignore toggles until the player can see the effect of changing view. */
		toggle(forceThirdPerson: boolean) {
			if (!forceThirdPerson) selected = !selected;
			return selected;
		},
		resolve(forceThirdPerson: boolean) {
			return selected && !forceThirdPerson;
		},
	};
}

/** Put the camera at eye level, looking along the same axes as the orbit and movement controls.
 * The caller still owns projection, character visibility, and temporary scripted views. */
export function aimFirstPerson(camera: PerspectiveCamera, feet: Vector3, yaw: number, pitch: number, eyeHeight = 1.55) {
	const y = feet.y + eyeHeight;
	const horizontal = Math.cos(pitch);
	camera.position.set(feet.x, y, feet.z);
	camera.lookAt(
		feet.x - Math.sin(yaw) * horizontal,
		y - Math.sin(pitch),
		feet.z - Math.cos(yaw) * horizontal,
	);
}
