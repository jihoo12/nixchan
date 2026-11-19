// A small playable scene, not a new site route: Nixkit adds its Gallery portal automatically.
import * as THREE from 'three';
import type { GameContext, NixClip } from '../../lib/nixkit/meta';
import type { World } from '../../lib/nixkit/world';
import { buildShop, shopSolids } from './art';
import { buildStreet } from './street';
import { createRamen } from './ramen';
import { createLanternHud, lanternEmotes, lanternKorean } from './ui';
import { createErrand, STEEP_SECONDS, EAT_SECONDS } from './errand';

const SHELF = new THREE.Vector3(-2.72, 0, -4.54);
const KETTLE = new THREE.Vector3(2.70, 0, -6.05);
const WINDOW = new THREE.Vector3(2.72, 0, -1.50);
const SPAWN = new THREE.Vector3(0, 0, 8);
const SEAT_HEADING = 0;
// The first pair of chopsticks reaches her mouth just after a second (see ramen.ts).
const FIRST_BITE = 1.30;
const STREET_CAMERA_DISTANCE = 8.2;
const indoors = (x: number, z: number) => Math.abs(x) < 4.6 && z < -0.32 && z > -8.05;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
type Bounds = readonly [number, number, number, number];
const outdoorSolids: Bounds[] = [
	[-12, -6.4, -9.1, -2.3], [6.4, 12, -9.1, -2.3],
	[-9.15, -6.0, 1.68, 2.2], [7.35, 9.15, 2.66, 3.43],
];
const solids = [...shopSolids, ...outdoorSolids];
const map: World = {
	groundAt: () => 0,
	ceilingAt: () => Infinity,
	nearby: () => [],
	inside(x, z) {
		if (Math.abs(x) > 10.8 || z < -8.95 || z > 12.7) return false;
		return !solids.some(([left, right, back, front]) =>
			x > left - 0.24 && x < right + 0.24 && z > back - 0.24 && z < front + 0.24);
	},
};

/** Where a follow camera would run into the shop shell; the door is the one gap. */
function cameraClear(x: number, z: number, yaw: number, requested: number) {
	const dx = Math.sin(yaw), dz = Math.cos(yaw);
	const candidates: number[] = [];
	const plane = (offset: number, dir: number, within: (t: number) => boolean) => {
		if (Math.abs(dir) < 1e-5) return;
		const t = offset / dir;
		if (t > 0 && within(t)) candidates.push(t);
	};
	for (const wall of [-4.52, 4.52]) plane(wall - x, dx, (t) => z + dz * t > -8 && z + dz * t < 0);
	plane(-7.95 - z, dz, (t) => Math.abs(x + dx * t) < 4.6);
	// The camera shouldn't cross a window just because it's transparent.
	plane(-0.06 - z, dz, (t) => {
		const a = Math.abs(x + dx * t);
		return a > 1.0 && a < 4.6;
	});
	return Math.max(1.55, Math.min(requested, ...candidates.map((t) => t - 0.22)));
}

function makeMarker(scene: THREE.Scene) {
	const root = new THREE.Group();
	const gold = new THREE.MeshBasicMaterial({ color: '#ffd390', transparent: true, opacity: 0.63, depthWrite: false });
	const ring = new THREE.Mesh(new THREE.RingGeometry(0.39, 0.43, 32), gold);
	ring.rotation.x = -Math.PI / 2;
	const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.105), new THREE.MeshBasicMaterial({ color: '#ffd99c' }));
	root.add(ring, gem);
	scene.add(root);
	return (target: THREE.Vector3 | null, t: number, reduced: boolean, near: boolean) => {
		root.visible = !!target;
		if (!target) return;
		root.position.copy(target).setY(0.057);
		gem.position.y = 0.40 + (reduced ? 0 : Math.sin(t * 2.8) * 0.09);
		gem.rotation.y = reduced ? 0.6 : t * 1.3;
		gold.opacity = near ? 0.92 : 0.56;
	};
}

function driftingSnow(scene: THREE.Scene) {
	const count = 112;
	const flake = new THREE.Object3D();
	const spread = (i: number, salt: number) => {
		const x = Math.sin(i * 91.73 + salt * 69.1) * 39619.423;
		return x - Math.floor(x);
	};
	// Small instanced flakes keep their world-space size on both rendering backends.
	const mat = new THREE.MeshBasicMaterial({ color: '#d5ebff', transparent: true, opacity: 0, depthWrite: false });
	const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.039, 0), mat, count);
	mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	mesh.frustumCulled = false;
	mesh.visible = false;
	scene.add(mesh);
	return (time: number, fade: number, reduced: boolean) => {
		mesh.visible = fade > 0.01;
		mat.opacity = fade * 0.67;
		if (!mesh.visible) return;
		const t = reduced ? 0 : time;
		for (let i = 0; i < count; i++) {
			const x = -10 + spread(i, 1) * 20 + 0.22 * Math.sin(t * 0.7 + i);
			const y = ((spread(i, 2) * 7 - t * (0.36 + spread(i, 3) * 0.23)) % 7 + 7) % 7;
			flake.position.set(x, y, 0.55 + spread(i, 4) * 14);
			flake.scale.setScalar(0.57 + 0.72 * spread(i, 5));
			flake.updateMatrix();
			mesh.setMatrixAt(i, flake.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
	};
}

export default function start({ createGame, store }: GameContext) {
	const errand = createErrand();
	const ko = lanternKorean();
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const game = createGame({
		spawn: { pos: SPAWN.clone(), heading: Math.PI },
		world: map,
		firstPerson: {
			label: ko ? '1인칭' : 'First person',
			lockedLabel: ko ? '식사 중에는 3인칭으로 보여요' : 'Third person while eating',
			forceThirdPerson: () => errand.phase === 'eat',
		},
		emotes: lanternEmotes(ko),
		clip: (): NixClip | null => {
			if (errand.phase === 'eat') return errand.elapsed < 4.28 ? 'Sit' : 'Carry';
			if (errand.phase === 'water' || errand.phase === 'wait' || errand.phase === 'seat') {
				return game && Math.hypot(game.player.vel.x, game.player.vel.z) > 0.25 ? 'CarryWalk' : 'Carry';
			}
			return null;
		},
		hold: () => errand.phase === 'eat' ? SEAT_HEADING : null,
		onKey: (key, e) => {
			if (key !== 'e' || e.altKey || e.ctrlKey || e.metaKey) return;
			if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
			if (game && (interact() || errand.phase === 'eat')) game.controls.state.waveQueued = false;
		},
	});
	if (!game) return;

	const { scene, player, orbit } = game;
	orbit.distance = STREET_CAMERA_DISTANCE;
	orbit.pitch = 0.23;
	const fog = new THREE.FogExp2('#192139', 0.046);
	const sky = new THREE.Color('#1e2542');
	const fill = scene.children.find((light) => light instanceof THREE.HemisphereLight) as THREE.HemisphereLight | undefined;
	const key = scene.children.find((light) => light instanceof THREE.DirectionalLight) as THREE.DirectionalLight | undefined;
	const setNight = () => {
		scene.background = sky;
		scene.fog = fog;
		if (fill) {
			fill.color.set('#acc7f8');
			fill.groundColor.set('#756589');
			fill.intensity = 1.48;
		}
		if (key) {
			key.color.set('#abc4ff');
			key.intensity = 0.73;
			key.castShadow = false;
		}
	};
	setNight();
	addEventListener('site-time', setNight);

	buildShop(scene);
	const street = buildStreet(scene);
	const ramen = createRamen(scene, player);
	const mark = makeMarker(scene);
	const snow = driftingSnow(scene);
	const panel = createLanternHud(interact);
	let snowFade = 0;
	let snowStarted = false;
	let elapsed = 0;
	let seatBlend = false;
	const seatPrev = new THREE.Vector3();
	let wantedZoom = STREET_CAMERA_DISTANCE;
	let lastZoom = orbit.distance;

	function target() {
		switch (errand.phase) {
			case 'shelf': case 'after': return SHELF;
			case 'water': return KETTLE;
			case 'seat': return WINDOW;
			default: return null;
		}
	}
	function canReach() {
		const at = target();
		return !!at && player.grounded && indoors(player.pos.x, player.pos.z) &&
			Math.hypot(player.pos.x - at.x, player.pos.z - at.z) <= 1.10;
	}
	function interact() {
		if (!game?.ready || !canReach()) return false;
		const previous = errand.phase;
		if (!errand.act()) return false;
		if (previous === 'water') game.emote('surprised', 1.05); // The first puff of steam.
		if (previous === 'seat') {
			seatPrev.copy(player.pos);
			player.vel.set(0, 0, 0);
			player.face(SEAT_HEADING);
			seatBlend = true;
		}
		return true;
	}

	game.onUpdate((dt, time) => {
		elapsed += dt;
		const sinceSit = errand.elapsed;
		const finished = errand.tick(dt);
		if (errand.phase === 'eat' && sinceSit < FIRST_BITE && errand.elapsed >= FIRST_BITE) {
			game.emote('happy', 1.8);
		}
		if (finished) {
			game.emote('happy', 2.4); // A warm bowl, and the first flakes outside.
			const old = store.get('bowls');
			store.set('bowls', (typeof old === 'number' && Number.isSafeInteger(old) && old >= 0 ? old : 0) + 1);
			snowStarted = true;
		}
		if (seatBlend) {
			const a = reduced.matches ? 1 : THREE.MathUtils.smoothstep(errand.elapsed, 0, 0.32);
			player.pos.lerpVectors(seatPrev, WINDOW, a);
			player.root.position.copy(player.pos);
			if (a >= 1 || errand.phase !== 'eat') seatBlend = false;
		}
		const inShop = indoors(player.pos.x, player.pos.z);
		if (Math.abs(orbit.distance - lastZoom) > 0.008) wantedZoom = THREE.MathUtils.clamp(orbit.distance, 3.0, 12);
		if (errand.phase === 'eat') {
			const angle = 0.77;
			const turn = Math.atan2(Math.sin(angle - orbit.yaw), Math.cos(angle - orbit.yaw));
			orbit.yaw += reduced.matches ? turn : turn * (1 - Math.exp(-4 * dt));
			orbit.pitch = reduced.matches ? 0.18 : damp(orbit.pitch, 0.18, 4, dt);
		}
		// Keep the character and cup visible inside the narrow shop without resetting outdoor zoom.
		if (inShop) orbit.pitch = Math.min(orbit.pitch, 0.53);
		const ideal = errand.phase === 'eat' ? 3.3 : inShop ? Math.min(4.6, wantedZoom) : wantedZoom;
		const clearance = cameraClear(player.pos.x, player.pos.z, orbit.yaw, ideal);
		const preferred = damp(lastZoom, ideal, 5.5, dt);
		orbit.distance = Math.min(preferred, clearance);
		lastZoom = orbit.distance;

		snowFade = reduced.matches ? Number(snowStarted) : damp(snowFade, Number(snowStarted), 1.4, dt);
		snow(time, snowFade, reduced.matches);
		if (!reduced.matches) street?.(dt);
		const phase = errand.phase;
		// The shared Sit clip is based at the seat, not at the avatar's feet.
		const seated = phase === 'eat' ? 0.65 * THREE.MathUtils.smoothstep(errand.elapsed, 0, 0.32)
			* (1 - THREE.MathUtils.smoothstep(errand.elapsed, 4.25, EAT_SECONDS)) : 0;
		player.figure.group.position.y = seated;
		ramen.update(phase === 'water' ? 'dry' : phase === 'wait' || phase === 'seat' ? 'hot' :
			phase === 'eat' ? 'eating' : phase === 'after' ? 'done' : 'empty', phase === 'eat' ? errand.elapsed : elapsed, reduced.matches);

		const near = canReach();
		mark(phase === 'after' ? null : target(), time, reduced.matches, near);
		const c = panel.text;
		const action = !near ? null : phase === 'shelf' ? c.cup : phase === 'water' ? c.pour :
			phase === 'seat' ? c.sit : phase === 'after' ? c.again : null;
		panel.update(phase, action, phase === 'wait' ? errand.elapsed / STEEP_SECONDS :
			phase === 'eat' ? errand.elapsed / EAT_SECONDS : 0);
	});
	game.loaded.then(panel.reveal, () => {});
	void game.start();
}
