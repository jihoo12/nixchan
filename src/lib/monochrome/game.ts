// The grey place through the rift: Nixchan, the only colour in it, walking a world that doesn't add
// up. The shape of it is in world.ts (a graph of cells, not a map); this file lays the cells out
// round her, walks her through them, keeps the camera out of the walls, and looks after what
// there is to do: three colour shards to find, ashen ore to chip from the rocks and carry home for
// the forge, stones with things carved on them, and snowflakes she can leave on the floor (her snow
// magic, from Snow Magic) to know a place again.
//
// Everything is worked out in the laid-out frame: her cell is in the middle, at (0, 0). When she
// steps over into the next cell, that cell becomes the middle, everything she's carrying (where she
// is, the camera) shifts back by a cell to match, and the cells round her are laid out afresh.
// The layout keeps its turn as she goes, so the light and the camera never jump.
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { snowflakeTexture, type NixClip } from '../experimental/nix-figure';
import { createEngine, ORDER } from '../nixkit/engine';
import { nodeLook } from '../nixkit/figure-nodes';
import { createNixchan } from '../nixkit/nixchan';
import { createInteractions } from '../nixkit/interact';
import { makeToon } from '../nixkit/look';
import { loadJSON, loadText, saveJSON, saveText } from '../island/save';
import { clamp, damp, noise } from '../nixkit/util';
import { loadBlocks, type CellModel, type Solid, type Spot } from './blocks';
import { greyCollide, greyMoves } from './moves';
import { CELL, DIRS, HALF, REGION_NAMES, SHARDS, START, cellById, place, turn, type Cell, type Placed, type ShardId, type Side } from './world';
import { to as inSite } from '../base';

/** Where she comes out of the rift, in the Threshold's first cell. */
const SPAWN = { x: 0, z: 1.6 };
/** The camera starts out in front of the rift, looking back at her and it. */
const SPAWN_YAW = 0.45;
const HOME = inSite('/island/?from=rift');
/** Where the camera looks for room, backed against a wall: how much higher, how far round. */
const CAMERA_LIFTS = [0, 0.3, 0.6, 0.95];
const CAMERA_SWINGS = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3];
/** How many snowflakes stay on the floor; past that, the oldest melts. */
const MAX_MARKS = 30;
/** How long ashen ore takes to grow back on its rock. */
const REGROW_MS = 10 * 60 * 1000;
/** How often a chip of ashen ore has an ashen lily seed in it (planted in the island's garden). */
const ASHEN_SEED_CHANCE = 0.2;

interface Mark {
	cell: string;
	x: number;
	z: number;
	a: number;
}

/** A solid or spot moved out of its cell's own frame into the laid-out one. */
type Box = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number };
interface NearSpot extends Spot {
	cell: Cell;
}

export async function startMonochrome() {
	const canvas = document.querySelector<HTMLCanvasElement>('[data-stage]');
	if (!canvas) return;
	const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
	const ui = {
		loading: $('[data-loading]'),
		stick: $('[data-stick]'),
		knob: $('[data-knob]'),
		jump: $<HTMLButtonElement>('[data-jump]'),
		mark: $<HTMLButtonElement>('[data-mark]'),
		banner: $('[data-banner]'),
		bannerName: $('[data-banner-name]'),
		bannerNote: $('[data-banner-note]'),
		toast: $('[data-toast]'),
		shards: $('[data-shards]'),
		carried: $('[data-carried]'),
		needle: $('[data-needle]'),
		compass: $('[data-compass]'),
		help: $('[data-help]'),
		fade: $('[data-fade]'),
	};

	// Drawn with three's WebGPURenderer, as the rest of Nixchan's world is (WebGL 2 without WebGPU, or
	// with ?webgl), in Nixkit's engine: each thing below that happens every frame is a system in it.
	const engine = createEngine({
		canvas,
		renderer: (c) => new WebGPURenderer({ canvas: c, antialias: true, forceWebGL: new URLSearchParams(location.search).has('webgl') }),
		camera: { fov: 50, near: 0.1, far: 400 },
	});
	if (!engine) return;
	const { scene, camera } = engine;
	const toon = makeToon();
	const isNight = () => document.documentElement.dataset.time === 'night';

	// ---------- light, and the fog the world ends in ----------

	const fog = new THREE.Fog('#e4e4e4', 9, 34);
	scene.fog = fog;
	const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 0.9);
	const ambient = new THREE.AmbientLight('#ffffff', 0.6);
	const sun = new THREE.DirectionalLight('#ffffff', 1.6);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = sun.shadow.camera.bottom = -26;
	sun.shadow.camera.right = sun.shadow.camera.top = 26;
	sun.shadow.camera.near = 1;
	sun.shadow.camera.far = 90;
	sun.shadow.bias = -0.0006;
	scene.add(hemi, ambient, sun, sun.target);
	const SUN_FROM = new THREE.Vector3(14, 30, 9);

	// ---------- what she's found, and left ----------

	const found = new Set<ShardId>();
	{
		const saved = loadJSON('monoShards');
		if (Array.isArray(saved)) for (const id of saved) if (SHARDS.some((s) => s.id === id)) found.add(id as ShardId);
	}
	const marks: Mark[] = [];
	{
		const saved = loadJSON('monoMarks');
		if (Array.isArray(saved))
			for (const m of saved)
				if (m && typeof m === 'object' && cellById(String(m.cell)) && [m.x, m.z, m.a].every((v) => typeof v === 'number' && Math.abs(v) <= HALF + 1)) marks.push({ cell: m.cell, x: m.x, z: m.z, a: m.a });
	}

	// Ashen ore: when each rock was last chipped, and how much she's carrying home.
	const chipped: Record<string, number> = {};
	{
		const saved = loadJSON('monoVeins');
		if (saved && typeof saved === 'object') for (const [k, v] of Object.entries(saved)) if (typeof v === 'number') chipped[k] = v;
	}
	let carried = 0;
	{
		const saved = loadJSON('monoCarried');
		if (typeof saved === 'number' && saved > 0) carried = Math.floor(saved);
	}
	// And ashen lily seeds, found now and then in the ore, to plant in the island's garden.
	let seeds = 0;
	{
		const saved = loadJSON('monoSeeds');
		if (typeof saved === 'number' && saved > 0) seeds = Math.floor(saved);
	}
	const ripe = (id: string) => chipped[id] === undefined || Date.now() - chipped[id] >= REGROW_MS;
	// Made at the island's forge, the Rift Compass knows the way back to the Threshold from anywhere.
	const riftCompass = (() => {
		const saved = loadJSON('forge');
		return !!saved && typeof saved === 'object' && Array.isArray((saved as { made?: unknown }).made) && (saved as { made: unknown[] }).made.includes('compass');
	})();

	// ---------- Nixchan ----------

	// She moves as Nixkit's player does (nixkit/player.ts), which is as she always has here: the walls
	// and columns of the cells round her push her out as they did (moves.ts), and
	// tools/test-nixkit-grey-feel.mjs keeps it so. The camera's the grey place's own (follow, below).
	const nix = createNixchan(engine, {
		canvas,
		modelUrl: canvas.dataset.model ?? '',
		spawn: { pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z), heading: SPAWN_YAW },
		world: {
			groundAt: () => 0,
			ceilingAt: () => Infinity,
			nearby: () => [],
			inside: () => true,
			collide: greyCollide(() => solidsNear),
		},
		toon,
		look: nodeLook,
		touch: ui,
		orbit: { yaw: SPAWN_YAW, pitch: 0.3, distance: 8 },
		camera: false,
		// E and Q leave snowflakes here (or do what there is to do); she doesn't wave or dash.
		keys: { wave: false, dash: false },
		canGlide: () => false,
		// Casting (or chipping at a rock), reading the help, or stepping through a rift, she stays put
		// (facing what she's chipping at).
		hold: () => (casting > 0 ? (castFacing ?? player.heading) : helpOpen || leaving ? player.heading : null),
		clip: () => (casting > 0 ? castClip : null),
		player: { moves: greyMoves },
	});
	const { player, controls, orbit, keys } = nix;
	const { figure, pos } = player;
	let ready = false;

	let blocks: Awaited<ReturnType<typeof loadBlocks>>;
	try {
		[blocks] = await Promise.all([loadBlocks(canvas.dataset.blocks ?? '', toon), nix.loaded]);
	} catch {
		if (ui.loading) ui.loading.textContent = "The rift won't open just now. Try reloading?";
		return;
	}
	ready = true;
	ui.loading?.setAttribute('hidden', '');

	// ---------- the cells, laid out round her ----------

	const models = new Map<string, CellModel>();
	const model = (cell: Cell) => {
		let m = models.get(cell.id);
		if (!m) models.set(cell.id, (m = blocks.build(cell)));
		return m;
	};
	/** The copies of each cell's model, made as they're needed: one for each time it's laid out at once. */
	const copies = new Map<string, THREE.Group[]>();
	const shown: { group: THREE.Group; cell: Cell }[] = [];
	const copyOf = (cell: Cell, n: number) => {
		const list = copies.get(cell.id) ?? [];
		copies.set(cell.id, list);
		while (list.length <= n) {
			const g = model(cell).group.clone(true);
			g.userData.cubes = [] as THREE.Object3D[];
			g.userData.veins = [] as THREE.Object3D[];
			g.traverse((o) => {
				if (o.name === 'cube') g.userData.cubes.push(o);
				if (o.name.startsWith('vein:')) g.userData.veins.push(o);
				if (o.name === 'shard') g.userData.shard = o;
				if (o.name === 'back') g.userData.back = o;
			});
			g.visible = false;
			scene.add(g);
			list.push(g);
		}
		return list[n];
	};

	let root: Cell = START;
	let rootRot = 0;
	let layout: Placed[] = [];
	/** What she might bump into (her cell and the eight round it), and what the camera keeps out of (two cells out). */
	let solidsNear: { box: Box | null; circle: { x: number; z: number; r: number } | null }[] = [];
	let cameraBoxes: Box[] = [];
	let spotsNear: NearSpot[] = [];

	const toView = (p: Placed, x: number, z: number): [number, number] => {
		const [tx, tz] = turn(x, z, p.rot);
		return [tx + p.gx * CELL, tz + p.gz * CELL];
	};
	const solidToView = (p: Placed, s: Solid): Box => {
		if (s.box) {
			const [ax, az] = toView(p, s.x0, s.z0);
			const [bx, bz] = toView(p, s.x1, s.z1);
			return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), y0: s.y0, y1: s.y1 };
		}
		const [x, z] = toView(p, s.x, s.z);
		return { x0: x - s.r, x1: x + s.r, z0: z - s.r, z1: z + s.r, y0: 0, y1: s.y1 };
	};

	const showShards = () => {
		for (const { group, cell } of shown) {
			if (!cell.shard) continue;
			const taken = found.has(cell.shard);
			if (group.userData.shard) group.userData.shard.visible = !taken;
			if (group.userData.back) group.userData.back.visible = taken;
		}
	};

	const showVeins = () => {
		for (const { group } of shown) for (const o of group.userData.veins as THREE.Object3D[]) o.visible = ripe(o.name.slice(5));
	};

	const relayout = () => {
		layout = place(root, rootRot);
		for (const s of shown) s.group.visible = false;
		shown.length = 0;
		const count = new Map<string, number>();
		for (const p of layout) {
			const n = count.get(p.cell.id) ?? 0;
			count.set(p.cell.id, n + 1);
			const g = copyOf(p.cell, n);
			g.visible = true;
			g.position.set(p.gx * CELL, 0, p.gz * CELL);
			g.rotation.y = (-p.rot * Math.PI) / 2;
			shown.push({ group: g, cell: p.cell });
		}
		showShards();
		showVeins();
		solidsNear = [];
		cameraBoxes = [];
		spotsNear = [];
		for (const p of layout) {
			const reach = Math.max(Math.abs(p.gx), Math.abs(p.gz));
			if (reach > 2) continue;
			const m = model(p.cell);
			for (const s of m.solids) {
				const box = solidToView(p, s);
				// The camera keeps out of walls and the big things; the round ones (columns, lamps) are
				// thin enough to look past, and dodging each column in the wood would leave it fidgeting.
				if (s.box) cameraBoxes.push(box);
				if (reach > 1) continue;
				if (s.box) {
					// Over her head (a lintel, the top of a doorway) isn't in her way.
					if (s.y0 < 1.8) solidsNear.push({ box, circle: null });
				} else {
					const [x, z] = toView(p, s.x, s.z);
					solidsNear.push({ box: null, circle: { x, z, r: s.r } });
				}
			}
			if (reach > 1) continue;
			for (const s of m.spots) {
				const [x, z] = toView(p, s.x, s.z);
				spotsNear.push({ ...s, x, z, cell: p.cell });
			}
		}
	};

	// ---------- the snowflakes she leaves ----------

	const MAX_SHOWN = 512;
	const flakeMat = new THREE.MeshBasicMaterial({ map: snowflakeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
	const flakes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), flakeMat, MAX_SHOWN);
	flakes.frustumCulled = false;
	flakes.renderOrder = 1;
	scene.add(flakes);
	let freshMark: Mark | null = null;
	let freshAge = 1;
	const flakeMatrix = new THREE.Matrix4();
	const flakeQ = new THREE.Quaternion();
	const flakePos = new THREE.Vector3();
	const flakeScale = new THREE.Vector3();
	const UP = new THREE.Vector3(0, 1, 0);
	const drawFlakes = () => {
		let n = 0;
		for (const p of layout) {
			for (const m of marks) {
				if (m.cell !== p.cell.id || n >= MAX_SHOWN) continue;
				const [x, z] = toView(p, m.x, m.z);
				const grow = m === freshMark ? 1 - (1 - Math.min(freshAge / 0.45, 1)) ** 3 : 1;
				flakePos.set(x, 0.03, z);
				flakeQ.setFromAxisAngle(UP, m.a - (p.rot * Math.PI) / 2 + (m === freshMark ? (1 - grow) * 2 : 0));
				flakeScale.setScalar(Math.max(grow, 0.01));
				flakes.setMatrixAt(n++, flakeMatrix.compose(flakePos, flakeQ, flakeScale));
			}
		}
		flakes.count = n;
		flakes.instanceMatrix.needsUpdate = true;
	};

	// ---------- where she is ----------

	let casting = 0;
	/** What she's doing while `casting`: a spell, or chipping at a rock with her hammer. */
	let castClip: NixClip = 'Summon';
	/** Which way she faces while she does it (null: whichever way she was). */
	let castFacing: number | null = null;
	const camLook = new THREE.Vector3(pos.x, 1.3, pos.z);
	const camPos = new THREE.Vector3();
	let camReach = orbit.distance;
	/** How much higher than asked the camera's risen, to see over a wall behind her. */
	let camLift = 0;

	let helpOpen = false;
	/** Set once she's stepping through a rift, when nothing else should happen. */
	let leaving = false;
	const openHelp = (open: boolean) => {
		helpOpen = open;
		ui.help?.toggleAttribute('hidden', !open);
		if (open) controls.clearKeys();
	};
	$('[data-help-open]')?.addEventListener('click', () => openHelp(true));
	$('[data-help-close]')?.addEventListener('click', () => openHelp(false));
	ui.help?.addEventListener('click', (e) => {
		if (e.target === ui.help) openHelp(false);
	});

	keys.intercept((key) => (helpOpen && !['h', '?', 'escape'].includes(key)) || leaving, 100);
	keys.command((key, e) => {
		if (key === 'escape') openHelp(false);
		if (e.repeat) return;
		if (key === 'e') {
			if (!interactions.press()) dropMark();
		} else if (key === 'q') dropMark();
		else if (key === 'h' || key === '?') openHelp(!helpOpen);
	});
	ui.mark?.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		dropMark();
	});

	let toastClock = 0;
	const toast = (text: string, seconds = 3.2) => {
		if (!ui.toast) return;
		ui.toast.textContent = text;
		ui.toast.classList.add('show');
		toastClock = seconds;
	};

	/** She casts a snowflake onto the floor where she stands. */
	function dropMark() {
		if (!ready || !player.grounded || casting > 0 || helpOpen || leaving) return;
		// Where she is in her own cell's frame: her cell is laid out at the middle, turned rootRot.
		const [x, z] = turn(pos.x, pos.z, -rootRot);
		const mark = { cell: root.id, x: clamp(x, -HALF, HALF), z: clamp(z, -HALF, HALF), a: Math.random() * Math.PI * 2 };
		marks.push(mark);
		while (marks.length > MAX_MARKS) marks.shift();
		saveJSON('monoMarks', marks.map((m) => ({ ...m, x: +m.x.toFixed(2), z: +m.z.toFixed(2), a: +m.a.toFixed(2) })));
		freshMark = mark;
		freshAge = 0;
		cast('Summon', 0.7);
	}

	// ---------- moving her, and stepping from cell to cell ----------

	let shownRegion = '';
	const announce = (name: string, note = '') => {
		if (ui.bannerName) ui.bannerName.textContent = name;
		if (ui.bannerNote) {
			ui.bannerNote.textContent = note;
			ui.bannerNote.hidden = !note;
		}
		ui.banner?.classList.add('show');
		clearTimeout(bannerTimer);
		bannerTimer = setTimeout(() => ui.banner?.classList.remove('show'), 3200);
	};
	let bannerTimer: ReturnType<typeof setTimeout> | undefined;
	const arrived = () => {
		const key = root.note ? root.id : root.region;
		if (key === shownRegion) return;
		// Back out of a note's cell into its own region doesn't announce the region again.
		const wasNote = cellById(shownRegion)?.region === root.region;
		shownRegion = key;
		if (root.note) announce(REGION_NAMES[root.region], root.note);
		else if (!wasNote) announce(REGION_NAMES[root.region]);
	};

	/** Into the cell laid out at slot (gx, gz) next to hers. */
	const enter = (p: Placed) => {
		const dx = -p.gx * CELL;
		const dz = -p.gz * CELL;
		pos.x += dx;
		pos.z += dz;
		camLook.x += dx;
		camLook.z += dz;
		camPos.x += dx;
		camPos.z += dz;
		root = p.cell;
		rootRot = p.rot;
		relayout();
		arrived();
	};
	const crossOver = () => {
		for (let k = 0; k < 2; k++) {
			const gx = pos.x > HALF ? 1 : pos.x < -HALF ? -1 : 0;
			const gz = gx === 0 ? (pos.z > HALF ? 1 : pos.z < -HALF ? -1 : 0) : 0;
			if (!gx && !gz) return;
			const p = layout.find((q) => q.gx === gx && q.gz === gz);
			if (p) enter(p);
			else {
				// Nothing there (it can't happen through a wall, but just in case): stay put.
				pos.x = clamp(pos.x, -HALF + 0.01, HALF - 0.01);
				pos.z = clamp(pos.z, -HALF + 0.01, HALF - 0.01);
			}
		}
	};

	/** Straight back to the Threshold, as through the little rift where a shard was. */
	const toThreshold = () => {
		root = START;
		rootRot = 0;
		pos.set(SPAWN.x, 0, SPAWN.z);
		player.vel.set(0, 0, 0);
		player.face(SPAWN_YAW);
		orbit.yaw = SPAWN_YAW;
		camLook.set(pos.x, 1.3, pos.z);
		camReach = 2;
		relayout();
		arrived();
	};

	// ---------- the camera ----------

	const camDir = new THREE.Vector3();
	/** How far along the ray from `o` in `d` it first meets anything solid near her, up to `max`. */
	const rayHit = (o: THREE.Vector3, d: THREE.Vector3, max: number) => {
		let best = max;
		for (const b of cameraBoxes) {
			let t0 = 0;
			let t1 = best;
			const slab = (o: number, d: number, lo: number, hi: number) => {
				if (Math.abs(d) < 1e-6) return o >= lo && o <= hi;
				let a = (lo - o) / d;
				let c = (hi - o) / d;
				if (a > c) [a, c] = [c, a];
				t0 = Math.max(t0, a);
				t1 = Math.min(t1, c);
				return t0 <= t1;
			};
			// A little fatter than they are, so the camera's near plane doesn't clip into them.
			if (slab(o.x, d.x, b.x0 - 0.2, b.x1 + 0.2) && slab(o.y, d.y, b.y0 - 0.2, b.y1 + 0.2) && slab(o.z, d.z, b.z0 - 0.2, b.z1 + 0.2) && t0 > 0) best = Math.min(best, t0);
		}
		return best;
	};
	const follow = (dt: number) => {
		camLook.x = damp(camLook.x, pos.x, 10, dt);
		camLook.y = damp(camLook.y, pos.y + 1.3, 6, dt);
		camLook.z = damp(camLook.z, pos.z, 10, dt);
		const want = Math.min(orbit.distance, 14);
		// Backed up against a wall, rather than closing right in on her the camera looks for room:
		// it rises up over the wall, or swings round away from it (whichever costs least for the
		// room it gets), and comes back down as it can.
		const aim = (yaw: number, pitch: number) => {
			camDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
			return rayHit(camLook, camDir, want);
		};
		let lift = 0;
		let swing = 0;
		const enough = Math.min(want, 4.5);
		if (aim(orbit.yaw, orbit.pitch + camLift) < enough) {
			let best = -Infinity;
			for (const up of CAMERA_LIFTS) {
				const p = Math.min(orbit.pitch + up, 1.3);
				for (const sw of CAMERA_SWINGS) {
					const score = Math.min(aim(orbit.yaw + sw, p), enough) - Math.abs(sw) * 0.9 - (p - orbit.pitch) * 1.2;
					if (score > best + 1e-3) {
						best = score;
						lift = p - orbit.pitch;
						swing = sw;
					}
				}
			}
		}
		// Come back down only once there's room to.
		if (lift < camLift && aim(orbit.yaw, orbit.pitch + lift) < enough) lift = camLift;
		camLift = damp(camLift, lift, lift > camLift ? 5 : 1.5, dt);
		orbit.yaw += swing * (1 - Math.exp(-2.5 * dt));
		const clear = aim(orbit.yaw, orbit.pitch + camLift);
		camReach = clear < camReach ? damp(camReach, clear, 16, dt) : damp(camReach, clear, 2.2, dt);
		camPos.copy(camLook).addScaledVector(camDir, Math.max(Math.min(camReach, want), 0.6));
		camPos.y = Math.max(camPos.y, 0.4);
		camera.position.copy(camPos);
		camera.lookAt(camLook);
	};

	// ---------- things to do ----------

	const interactions = createInteractions();
	const leave = () => {
		if (leaving) return;
		leaving = true;
		ui.fade?.classList.add('show');
		setTimeout(() => location.assign(HOME), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700);
	};
	interactions.add(() => {
		if (!player.grounded || casting > 0) return null;
		let best: NearSpot | null = null;
		let bestD = Infinity;
		for (const s of spotsNear) {
			const d = Math.hypot(pos.x - s.x, pos.z - s.z);
			if (d > s.reach || d >= bestD) continue;
			if (s.kind === 'shard' && found.has(s.cell.shard!)) continue;
			if (s.kind === 'back' && !found.has(s.cell.shard!)) continue;
			best = s;
			bestD = d;
		}
		if (!best) return null;
		const s = best;
		switch (s.kind) {
			case 'tablet':
				return { label: 'Read the stone', go: () => toast(s.text ?? '', 6) };
			case 'shard': {
				const def = SHARDS.find((d) => d.id === s.cell.shard)!;
				return { label: `Take the ${def.name}`, go: () => take(def.id) };
			}
			case 'back':
				return { label: 'Step through, back to the Threshold', go: () => fadeThrough(toThreshold) };
			case 'home': {
				const label = found.size === SHARDS.length ? 'Take the colour home to the island' : 'Step back through to the island';
				return { label: carried ? `${label}, with ${carried} ashen ore` : label, go: leave };
			}
			case 'vein': {
				const id = s.id!;
				if (!ripe(id)) return { label: `Chipped bare. It grows back in about ${Math.max(1, Math.ceil((REGROW_MS - (Date.now() - chipped[id])) / 60000))} min` };
				return { label: 'Chip off some ashen ore', go: () => chip(id, s) };
			}
		}
	});

	/** She plays `clip` for `seconds`, standing still. */
	function cast(clip: NixClip, seconds: number, facing: number | null = null) {
		castClip = clip;
		casting = seconds;
		castFacing = facing;
		figure.setProp('Hammer', clip === 'Smith');
		figure.play(clip);
	}

	/** One strike of her hammer, and a shard or two of ashen ore comes away. */
	const chip = (id: string, at: { x: number; z: number }) => {
		cast('Smith', 0.9, Math.atan2(at.x - pos.x, at.z - pos.z));
		const n = Math.random() < 0.3 ? 2 : 1;
		const seed = Math.random() < ASHEN_SEED_CHANCE;
		carried += n;
		if (seed) seeds++;
		chipped[id] = Date.now();
		saveJSON('monoVeins', chipped);
		saveJSON('monoCarried', carried);
		saveJSON('monoSeeds', seeds);
		showVeins();
		showCarried();
		if (seed) toast('Something rattled loose with the ore: a grey seed! It might grow, back in the garden.');
		else toast(n > 1 ? 'Two pieces of ashen ore came away!' : 'A piece of ashen ore came away, cold as glass.');
	};
	const showCarried = () => {
		if (!ui.carried) return;
		ui.carried.hidden = carried === 0 && seeds === 0;
		ui.carried.textContent = [carried && `Ashen ore \u00d7 ${carried}`, seeds && `Grey seeds \u00d7 ${seeds}`].filter(Boolean).join(' \u00b7 ');
	};
	showCarried();

	const fadeThrough = (then: () => void) => {
		ui.fade?.classList.add('show');
		leaving = true;
		setTimeout(() => {
			then();
			leaving = false;
			ui.fade?.classList.remove('show');
		}, 450);
	};

	const take = (id: ShardId) => {
		found.add(id);
		saveJSON('monoShards', [...found]);
		const def = SHARDS.find((d) => d.id === id)!;
		showShards();
		paint();
		cast('Summon', 0.7);
		if (found.size === SHARDS.length) toast(`The ${def.name}! That's all three. Take them home through the rift at the Threshold.`, 6);
		else toast(`The ${def.name}. A little colour comes back to the grey. (${found.size} of ${SHARDS.length})`, 5);
	};

	// ---------- colour, and day and night ----------

	const paint = () => {
		const night = isNight();
		blocks.paint(night, (found.size / SHARDS.length) * 0.75);
		const sky = night ? '#0c0c0f' : '#e4e4e4';
		fog.color.set(sky);
		scene.background = fog.color;
		hemi.color.set(night ? '#8a8aa0' : '#ffffff');
		hemi.groundColor.set(night ? '#1a1a1e' : '#8a8a8a');
		hemi.intensity = night ? 0.5 : 0.9;
		ambient.intensity = night ? 0.35 : 0.6;
		sun.color.set(night ? '#c8ccff' : '#ffffff');
		sun.intensity = night ? 0.6 : 1.6;
		fog.near = night ? 6 : 9;
		fog.far = night ? 28 : 34;
		const u = blocks.riftMat.uniforms;
		u.uDark.value = night ? 0.6 : 0;
		u.uTint.value = found.size / SHARDS.length;
		const colors = SHARDS.filter((s) => found.has(s.id)).map((s) => s.color);
		colors.forEach((c, i) => (u.uTints.value[i] as THREE.Color).set(c));
		for (let i = colors.length; i < 3; i++) (u.uTints.value[i] as THREE.Color).set(colors[0] ?? '#ffffff');
		if (ui.shards)
			ui.shards.innerHTML = SHARDS.map((s) => `<span class="shard${found.has(s.id) ? ' found' : ''}" style="--c:${s.color}" title="${s.name}${found.has(s.id) ? '' : ' (not yet found)'}"></span>`).join('');
	};
	addEventListener('site-time', paint);
	paint();

	// ---------- the compass, which only knows the way when the rift's close ----------
	// (Once she's made the Rift Compass at the forge, it always knows: for each cell, the side to
	// leave by on the shortest way back to the Threshold, worked out once, from the Threshold out.)

	const homeward = new Map<Cell, Side>();
	{
		const queue: Cell[] = [START];
		const seen = new Set<Cell>([START]);
		while (queue.length) {
			const c = queue.shift()!;
			c.links.forEach((link) => {
				if (!link || seen.has(link.to)) return;
				seen.add(link.to);
				// Back the way it was reached: out of `link.to` by the side it was come into by.
				homeward.set(link.to, link.side);
				queue.push(link.to);
			});
		}
	}

	const compass = (time: number) => {
		let best = Infinity;
		let bx = 0;
		let bz = 0;
		for (const p of layout) {
			if (p.cell !== START) continue;
			const [x, z] = toView(p, 0, -2);
			const d = Math.hypot(x - pos.x, z - pos.z);
			if (d < best) {
				best = d;
				bx = x - pos.x;
				bz = z - pos.z;
			}
		}
		if (best === Infinity && riftCompass) {
			const side = homeward.get(root);
			if (side !== undefined) {
				const view = (side + rootRot) % 4;
				const d = DIRS[view];
				bx = d[0] * HALF - pos.x;
				bz = d[1] * HALF - pos.z;
				best = Math.hypot(bx, bz);
			}
		}
		let angle: number;
		const yaw = orbit.yaw;
		if (best < Infinity) {
			// Straight up on the dial is the way the camera's looking.
			const fwd = -Math.sin(yaw) * bx - Math.cos(yaw) * bz;
			const rgt = Math.cos(yaw) * bx - Math.sin(yaw) * bz;
			angle = Math.atan2(rgt, fwd);
		} else angle = time * 2.3 + noise(time * 0.8, 3.1) * 6;
		if (ui.needle) ui.needle.style.transform = `rotate(${angle}rad)`;
		ui.compass?.classList.toggle('lost', best === Infinity);
	};

	// ---------- the loop ----------

	engine.add({
		resize(w, h) {
			camera.fov = w < h ? 64 : 50;
			camera.updateProjectionMatrix();
		},
	});

	relayout();
	ui.fade?.classList.remove('show');
	announce(REGION_NAMES.threshold, 'Everything’s gone grey');
	shownRegion = 'threshold';
	if (!loadText('monoHelpSeen')) {
		saveText('monoHelpSeen', '1');
		setTimeout(() => openHelp(true), 1800);
	}

	// For poking at from the console while working on it.
	if (import.meta.env.DEV)
		Object.assign(window, {
			mono: { engine, nix, cell: () => root.id, rot: () => rootRot, pos, orbit, cam: () => ({ camReach, camLift, look: camLook.toArray(), at: camPos.toArray() }), layout: () => layout.map((p) => `${p.cell.id}@${p.gx},${p.gz}r${p.rot}`), take: (id: ShardId) => take(id),
				visit: (id: string, x = 0, z = 3) => {
					root = cellById(id) ?? root;
					rootRot = 0;
					pos.set(x, 0, z);
					relayout();
					arrived();
				},
			},
		});

	// ---------- the frame ----------
	// In the engine's order: she steps over into the next cell if she reached it last frame, she moves
	// (ORDER.player), what she's casting runs down, the place moves, the camera follows, and the sun.

	// Stepping over into the next cell shifts everything back by a cell: her, the camera, the place.
	// It has to come before she moves, so that where she's drawn (the player puts her figure where she
	// is as she moves) is shifted with the rest; after it, she'd be drawn a cell off for a frame.
	engine.add({ order: ORDER.player - 1, update: () => crossOver() });
	engine.add({
		order: ORDER.player + 1,
		update(dt) {
			const wasCasting = casting > 0;
			casting = Math.max(0, casting - dt);
			if (wasCasting && casting === 0 && castClip === 'Smith') figure.setProp('Hammer', false);
		},
	});

	let veinClock = 2;
	engine.add({
		order: ORDER.game,
		update(dt, time) {
			interactions.update();
			for (const { group } of shown) {
				for (const c of group.userData.cubes as THREE.Object3D[]) {
					const ph = c.userData.phase as number;
					c.position.y = 2.9 + Math.sin(time * 0.8 + ph) * 0.25;
					c.rotation.set(time * 0.3 + ph, time * 0.45 + ph * 0.5, 0);
				}
				const shard = group.userData.shard as THREE.Object3D | undefined;
				if (shard?.visible) {
					shard.position.y = 1.9 + Math.sin(time * 1.6) * 0.12;
					shard.rotation.y = time * 1.1;
				}
			}
			blocks.riftMat.uniforms.uTime.value = time;
			freshAge += dt;
			drawFlakes();
			// Ore grows back on its rock while she's about.
			veinClock -= dt;
			if (veinClock <= 0) {
				veinClock = 2;
				showVeins();
			}

			toastClock -= dt;
			if (toastClock <= 0) ui.toast?.classList.remove('show');
			compass(time);
		},
	});
	engine.add({ order: ORDER.camera, update: (dt) => follow(dt) });
	engine.add({
		order: ORDER.light,
		update() {
			sun.position.copy(pos).add(SUN_FROM);
			sun.target.position.copy(pos);
		},
	});

	await engine.start();
}
