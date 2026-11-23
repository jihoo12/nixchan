// A short-lived overlay on the Island's ordinary follow camera. It never
// changes the player or their orbit controls; each frame can return to the
// still-running follow camera, including after a viewport resize.
import { MathUtils, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three';

export type LookoutAim = {
	/** Optical view origin, clear of the physical telescope's front. */
	eye: Vector3;
	/** Heading in radians (zero +Z; positive turns toward +X). */
	yaw: number;
	/** Pitch in radians, positive toward the sky. */
	pitch?: number;
};
type Phase = 'idle' | 'entering' | 'viewing' | 'exiting';

const PAN = .66, DOWN = -.30, UP = .32;
const FOV = 31, WIDEST = 39, TIGHTEST = 15, NEAR = .09;
const ENTER = .48, EXIT = .40;
const smooth = (x: number) => x * x * (3 - 2 * x);
const UP_AXIS = new Vector3(0,1,0);

export function createLookoutCamera(camera: PerspectiveCamera, {
	reduced = () => false,
}: { reduced?: () => boolean } = {}) {
	let phase: Phase = 'idle', intent = false, progress = 0;
	let yaw = 0, pitch = 0, fov = FOV;
	let wantYaw = 0, wantPitch = 0, wantFov = FOV;
	let bearing = 0;
	const eye = new Vector3(), center = new Vector3();
	const rotation = new Quaternion(), matrix = new Matrix4();
	const followPosition = camera.position.clone(), followRotation = camera.quaternion.clone();
	let followFov = camera.fov, followNear = camera.near;
	// Follow rewrites position/rotation every frame and lens on resize. If it did
	// not write this particular property, the matching value is still from us.
	const appliedPosition = new Vector3(), appliedRotation = new Quaternion();
	let applied = false, appliedFov = 0, appliedNear = 0;
	function captureFollow() {
		if (!applied || !camera.position.equals(appliedPosition)) followPosition.copy(camera.position);
		if (!applied || !camera.quaternion.equals(appliedRotation)) followRotation.copy(camera.quaternion);
		if (!applied || camera.fov !== appliedFov) followFov = camera.fov;
		if (!applied || camera.near !== appliedNear) followNear = camera.near;
	}
	function lens(nextFov: number, nextNear: number) {
		if (camera.fov === nextFov && camera.near === nextNear) return;
		camera.fov = nextFov;
		camera.near = nextNear;
		camera.updateProjectionMatrix();
	}
	function enter(target: LookoutAim) {
		if (phase !== 'idle' || !target.eye.toArray().every(Number.isFinite)
			|| !Number.isFinite(target.yaw) || !Number.isFinite(target.pitch ?? 0)) return false;
		eye.copy(target.eye); bearing = target.yaw;
		yaw = wantYaw = 0;
		pitch = wantPitch = MathUtils.clamp(target.pitch ?? 0, DOWN, UP);
		fov = wantFov = FOV;
		intent = true; phase = 'entering';
		return true;
	}
	function exit() {
		if (!intent) return false;
		intent = false; phase = 'exiting';
		return true;
	}
	function look(yawBy: number, pitchBy: number) {
		if (!intent || !Number.isFinite(yawBy) || !Number.isFinite(pitchBy)) return false;
		wantYaw = MathUtils.clamp(wantYaw + yawBy, -PAN, PAN);
		wantPitch = MathUtils.clamp(wantPitch + pitchBy, DOWN, UP);
		return true;
	}
	function zoom(stops: number) {
		if (!intent || !Number.isFinite(stops)) return false;
		wantFov = MathUtils.clamp(wantFov * Math.exp(-.19 * MathUtils.clamp(stops, -12, 12)), TIGHTEST, WIDEST);
		return true;
	}

	/** After normal follow-camera movement and before rendering. No resize or DOM work here. */
	function update(dt: number) {
		captureFollow();
		if (phase === 'idle') return;
		const d = Number.isFinite(dt) ? Math.max(0,Math.min(dt,.10)) : 0;
		const short = reduced();
		progress = short ? Number(intent) : MathUtils.clamp(progress + (intent ? d / ENTER : -d / EXIT), 0, 1);
		if (progress === 0 && !intent) {
			camera.position.copy(followPosition); camera.quaternion.copy(followRotation);
			lens(followFov, followNear);
			applied = false; phase = 'idle';
			return;
		}
		const smoothing = short ? 1 : -Math.expm1(-14*d);
		yaw = MathUtils.lerp(yaw,wantYaw,smoothing);
		pitch = MathUtils.lerp(pitch,wantPitch,smoothing);
		fov = MathUtils.lerp(fov,wantFov,smoothing);
		const a = bearing + yaw, flat = Math.cos(pitch);
		center.set(Math.sin(a)*flat, Math.sin(pitch), Math.cos(a)*flat).add(eye);
		rotation.setFromRotationMatrix(matrix.lookAt(eye,center,UP_AXIS));
		const w = smooth(progress);
		camera.position.lerpVectors(followPosition,eye,w);
		// A slight arc gives the approach room over the player/prop without
		// adding sway or a separate animation to the held view.
		if (!short) camera.position.y += Math.sin(Math.PI*w) * Math.min(.42, followPosition.distanceTo(eye)*.065);
		camera.quaternion.copy(followRotation).slerp(rotation,w);
		lens(MathUtils.lerp(followFov,fov,w), MathUtils.lerp(followNear,NEAR,w));
		appliedPosition.copy(camera.position); appliedRotation.copy(camera.quaternion);
		appliedFov = camera.fov; appliedNear = camera.near; applied = true;
		if (intent && progress === 1) phase = 'viewing';
	}

	return {
		enter, exit, look, zoom, update,
		get phase() { return phase; },
		/** Includes the way back out, when the player should still be held. */
		get active() { return phase !== 'idle'; },
		get looking() { return intent; },
		/** Optical fade weight for a reticle or vignette, if the caller shows one. */
		get blend() { return smooth(progress); },
	};
}
