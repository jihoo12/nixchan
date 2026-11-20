// Lantern Town keeps the original shop, controls and save key on the existing play route.
import * as THREE from 'three';
import type { GameContext, NixClip } from '../../lib/nixkit/meta';
import { ORDER } from '../../lib/nixkit/engine';
import { buildShop } from './art';
import { buildStreet } from './street';
import { createRamen } from './ramen';
import { createLanternHud, lanternEmotes, lanternKorean, ramenAction } from './ui';
import { createErrand, EAT_SECONDS } from './errand';
import { buildTownGrounds } from './town-grounds';
import { buildRiverDistrict } from './river-district';
import { buildStationDistrict } from './station-district';
import { buildHillDistrict } from './hill-district';
import { townArea, townCameraClear, townPhysics } from './town-layout';
import { townMap } from './town-map';
import { createTownHelp } from './town-help';
import { buildRailcar } from './railcar';
import { buildWestBank } from './west-bank';
import { CABIN, clearRailcar, createRailShuttle, insideCabin, keepInCabin, RAIL } from './rail-shuttle';

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
	const shuttle = createRailShuttle();
	const ko = lanternKorean();
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const districts = new THREE.Scene();
	const {world,blocks} = townPhysics([
		...buildTownGrounds(districts),
		...buildRiverDistrict(districts),
		...buildStationDistrict(districts),
		...buildHillDistrict(districts),
		...buildWestBank(districts),
	]);
	const car = buildRailcar(districts);
	car.setPose(shuttle.pose.x, shuttle.pose.door);
	const platformGround = world.groundAt;
	const oldCollide = world.collide;
	const walkingInside = world.inside;
	world.inside = (x,z) => shuttle.riding ? insideCabin(shuttle.pose,x,z) : walkingInside(x,z);
	world.groundAt = (x,z,y)=>shuttle.riding ? RAIL.floor : platformGround(x,z,y);
	world.collide = (p,r,v)=>{
		if(shuttle.riding){
			if(!shuttle.seated)keepInCabin(shuttle.pose,p,r,v);
			return;
		}
		oldCollide?.(p,r,v);
		clearRailcar(shuttle.pose,p,r,v);
	};
	const game = createGame({
		spawn: { pos: SPAWN.clone(), heading: Math.PI },
		world,
		firstPerson: {
			showButton: false,
			get eyeHeight() { return shuttle.seated ? 1.17 : 1.52; },
			label: ko ? '1인칭' : 'First person',
			lockedLabel: ko ? '식사 중에는 3인칭으로 보여요' : 'Third person while eating',
			forceThirdPerson: () => errand.phase === 'eat',
		},
		emotes: { ...lanternEmotes(ko), showButton: false },
		clip: (): NixClip | null => {
			if(shuttle.seated) return 'Sit';
			if (errand.phase === 'eat') return errand.elapsed < 4.28 ? 'Sit' : 'Carry';
			if (errand.phase === 'water' || errand.phase === 'wait' || errand.phase === 'seat') {
				return game && Math.hypot(game.player.vel.x, game.player.vel.z) > 0.25 ? 'CarryWalk' : 'Carry';
			}
			return null;
		},
		hold: () => shuttle.seated?.heading ?? (errand.phase === 'eat' ? SEAT_HEADING : null),
		onKey: (key, e) => {
			if (key !== 'e' || e.altKey || e.ctrlKey || e.metaKey) return;
			if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
			if (game && (interact() || shuttle.riding || errand.phase === 'eat')) game.controls.state.waveQueued = false;
		},
	});
	if (!game) return;

	const { scene, player, orbit } = game;
	scene.add(...[...districts.children]);
	const followingRailcar = {x:shuttle.pose.x,z:RAIL.z,w:RAIL.halfLength*2,d:RAIL.halfDepth*2,bottom:0,top:RAIL.roof};
	const cameraBlocks = [...blocks,followingRailcar];
	function movePassenger(at:{x:number;y:number;z:number}) {
		player.pos.set(at.x,at.y,at.z);
		player.root.position.copy(player.pos);
		player.vel.set(0,0,0);
	}
	game.engine.add({order: ORDER.world+1,update(_dt,time){
		const previousX=shuttle.pose.x;
		const pose=shuttle.update(time);
		followingRailcar.x=pose.x;
		car.setPose(pose.x,pose.door);
		if(shuttle.riding){
			game.controls.state.jumpQueued=false;
			if(shuttle.seated) movePassenger(shuttle.seatPoint(shuttle.seated));
			else {
				player.pos.x+=pose.x-previousX;
				player.root.position.copy(player.pos);
			}
		}
	}});

	const tour = townMap(ko);
	const panel = createLanternHud(interact, ko);
	const focusMapButton = document.querySelector<HTMLButtonElement>('[data-town-map]');
	const helpButton = document.querySelector<HTMLButtonElement>('[data-town-help]');
	const showMap=(show:boolean)=>{
		tour.panel.hidden=!show;
		game.paused=show;
		if(show)panel.update(null);
		focusMapButton?.setAttribute('aria-expanded',String(show));
		if(show){
			const l=townArea(player.pos.x,player.pos.z);
			tour.update(player.pos.x,player.pos.z,l?(ko?l.ko:l.en):(ko?'등불마을':'Lantern Town'));
			tour.close.focus();
		}else focusMapButton?.focus();
	};
	tour.close.onclick=()=>showMap(false);
	focusMapButton?.addEventListener('click', () => showMap(Boolean(tour.panel.hidden)));
	if (focusMapButton && ko) {
		focusMapButton.textContent = '지도';
		focusMapButton.setAttribute('aria-label', '마을 지도 (M)');
	}
	const help = createTownHelp(ko);
	helpButton?.addEventListener('click', () => {
		if (help.dialog.open) return;
		if (!tour.panel.hidden) showMap(false);
		panel.update(null);
		game.paused = true;
		help.dialog.showModal();
		help.close.focus();
	});
	const closeHelp = () => {
		help.dialog.close();
		game.paused = false;
		helpButton?.focus();
	};
	help.close.onclick = closeHelp;
	help.dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeHelp(); });
	game.keys.intercept((key,e)=>{
		if(help.dialog.open){
			// Keep modal Tab/Enter/Space working. Nixkit's window listener must not move Nixchan.
			if(key==='escape'){e.preventDefault();closeHelp();}
			return true;
		}
		if(e.altKey||e.ctrlKey||e.metaKey)return false;
		if(key==='m'||(key==='escape'&&!tour.panel.hidden)){
			e.preventDefault();if(!e.repeat)showMap(key!=='escape'&&Boolean(tour.panel.hidden));
			return true;
		}
		return !tour.panel.hidden;
	},50);
	// Trim the camera against new facades after Nixkit's usual follow camera; the original shop
	// keeps its own window-seat framing. Restore slowly after a wall leaves the line of sight.
	const eye=new THREE.Vector3(), cabinCamera=new THREE.Vector3();
	let cameraReach=1;
	game.engine.add({order:ORDER.camera+1,always:true,update(dt){
		if(game.firstPerson||indoors(player.pos.x,player.pos.z)){cameraReach=1;return;}
		eye.copy(player.pos);eye.y+=shuttle.seated?1.04:1.14;
		if(shuttle.riding){
			// The normal wide outdoor orbit would spend the ride staring at the roof from outside.
			const x=shuttle.pose.x;
			cabinCamera.set(
				THREE.MathUtils.clamp(eye.x+Math.sin(orbit.yaw)*2.35,x-CABIN.halfLength+.16,x+CABIN.halfLength-.16),
				THREE.MathUtils.clamp(eye.y+.27+Math.sin(orbit.pitch)*.9,RAIL.floor+.62,RAIL.roof-.52),
				THREE.MathUtils.clamp(eye.z+Math.cos(orbit.yaw)*2.35,RAIL.z-CABIN.halfWidth+.20,RAIL.z+CABIN.halfWidth-.20)
			);
			if(Math.hypot(cabinCamera.x-eye.x,cabinCamera.z-eye.z)<.7)
				cabinCamera.z=RAIL.z+(eye.z>RAIL.z?-.57:.57);
			game.camera.position.copy(cabinCamera);game.camera.lookAt(eye);cameraReach=1;return;
		}
		eye.y=player.pos.y+1.2;
		const clear=townCameraClear(eye,game.camera.position,cameraBlocks);
		cameraReach=clear<cameraReach?clear:damp(cameraReach,clear,5,dt);
		if(cameraReach<.999){game.camera.position.lerpVectors(eye,game.camera.position,cameraReach);game.camera.lookAt(eye);}
	}});
	orbit.distance = STREET_CAMERA_DISTANCE;
	orbit.pitch = 0.23;
	const fog = new THREE.Fog('#252d49', 29, 157);
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
	const snow = driftingSnow(scene);
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
		if (!game?.ready || game.paused) return false;
		const previousSeat=shuttle.seated;
		const train = shuttle.interact({x:player.pos.x,y:player.pos.y,z:player.pos.z,grounded:player.grounded});
		if (train) {
			if(train==='sit'&&shuttle.seated){
				movePassenger(shuttle.seatPoint(shuttle.seated));
				player.face(shuttle.seated.heading);
			}else if(train==='stand'&&previousSeat){
				movePassenger(shuttle.standingPoint(previousSeat));
			}else if(train==='board' || train==='leave'){
				movePassenger(train==='board'?shuttle.boardingPoint():shuttle.platformPoint());
				player.face(Math.PI);
				if (train==='board') orbit.yaw=0;
			}
			panel.update(null);
			return true;
		}
		if (!canReach()) return false;
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
		player.figure.group.position.y = shuttle.seated ? CABIN.seatHeight : seated;
		ramen.update(phase === 'water' ? 'dry' : phase === 'wait' || phase === 'seat' ? 'hot' :
			phase === 'eat' ? 'eating' : phase === 'after' ? 'done' : 'empty', phase === 'eat' ? errand.elapsed : elapsed, reduced.matches);

		const railAction=shuttle.action({x:player.pos.x,y:player.pos.y,z:player.pos.z,grounded:player.grounded});
		panel.update(railAction==='board'?(ko?'기차 타기':'Board train'):
			railAction==='leave'?(ko?'기차에서 내리기':'Get off train'):
			railAction==='sit'?(ko?'창가에 앉기':'Sit by the window'):
			railAction==='stand'?(ko?'일어나기':'Stand up'):ramenAction(phase, canReach(), ko));
	});
	game.loaded.then(() => {
		if (focusMapButton) focusMapButton.disabled = false;
		if (helpButton) helpButton.disabled = false;
	}, () => {});
	void game.start();
}
