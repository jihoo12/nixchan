import * as THREE from 'three';
import { benchSeat, type WorldSeat } from './world-seats';

const WOOD = '#845b49';
const INK = '#242238';
const STEEL = '#566474';
const CREAM = '#ffdea3';
const MINT = '#8cede0';
const CORAL = '#e36c63';
const OLD_GOLD = '#e9a960';

const SHOP_FIXTURES = [
	{ x: -0.4, z: -5.3, hx: 0.60, hz: 1.55, height: 1.55 },
	{ x: 2.55, z: -7.30, hx: 1.78, hz: 0.50, height: 1.06 },
	{ x: -4.02, z: -4.65, hx: 0.49, hz: 2.08, height: 2.24 },
	{ x: 2.84, z: -0.57, hx: 1.45, hz: 0.28, height: 1.08 },
	{ x: -2.72, z: -7.34, hx: 1.19, hz: 0.40, height: 1.3 },
	{ x: 4.09, z: -4.35, hx: 0.38, hz: 1.14, height: 2.18 },
] as const;

/** Axis-aligned XZ projections; stools are intentionally not blockers, including the window seat. */
export const shopSolids: readonly (readonly [number, number, number, number])[] = [
	[-4.86, -4.62, -8.20, 0.09], // west wall
	[4.62, 4.86, -8.20, 0.09], // east wall
	[-4.84, 4.84, -8.36, -8.12], // back wall
	[-4.75, -1.275, -0.105, 0.15], // glazed west frontage
	[1.275, 4.75, -0.105, 0.15], // glazed east frontage
	...SHOP_FIXTURES.map(({ x, z, hx, hz }) => [x - hx, x + hx, z - hz, z + hz] as const),
];

type Shape = 'box' | 'cylinder' | 'ball' | 'cup';
type Finish = 'paint' | 'glow';
type Piece = { position: [number, number, number]; size: [number, number, number]; color: string; roll: number };

/** Build a little corner shop from batched reusable shapes. +Z is out toward the street. */
export function buildShop(scene: THREE.Scene, seats?: WorldSeat[]): THREE.Group {
	const shop = new THREE.Group();
	shop.name = 'Lantern Mart';
	scene.add(shop);

	const buckets = new Map<string, Piece[]>();
	function add(shape: Shape, x: number, y: number, z: number, w: number, h: number, d: number, color: string, finish: Finish = 'paint', roll = 0) {
		const k = shape + ':' + finish;
		const parts = buckets.get(k) ?? [];
		parts.push({ position: [x, y, z], size: [w, h, d], color, roll });
		buckets.set(k, parts);
	}
	const box = (x: number, y: number, z: number, w: number, h: number, d: number, tint: string, finish: Finish = 'paint', roll = 0) =>
		add('box', x, y, z, w, h, d, tint, finish, roll);
	const disk = (x: number, y: number, z: number, w: number, h: number, color: string, finish: Finish = 'paint') =>
		add('cylinder', x, y, z, w, h, w, color, finish);
	const ball = (x: number, y: number, z: number, size: number, tint: string, finish: Finish = 'paint') =>
		add('ball', x, y, z, size, size, size, tint, finish);

	// Cool concrete and warm checker tile. Grooves are in the shop art, not the collision mesh.
	box(0, -0.034, -4.12, 9.72, 0.12, 8.42, '#302d42');
	const tileTones = ['#c1a18f', '#625972', '#d6bb9c', '#756377'];
	for (let iz = 0; iz < 12; iz++) {
		for (let ix = 0; ix < 14; ix++) {
			box(-4.55 + ix * 0.70, 0.034, -7.96 + iz * 0.70, 0.684, 0.025, 0.684, tileTones[(ix + iz) % 2 + 2 * Number((ix * 7 + iz * 3) % 11 === 0)]);
		}
	}
	box(0, 0.015, 0.33, 2.46, 0.05, 0.44, STEEL);
	box(0, 0.056, -0.69, 2.35, 0.022, 0.9, '#4a4d69');
	for (let i = 0; i < 7; i++) box(0, 0.07, -1.04 + 0.11 * i, 2.13, 0.007, 0.017, '#687387');

	// Perimeter walls, inset tiles and shadow lines. A cutaway roof keeps the follow camera useful.
	box(0, 2.1, -8.24, 9.68, 4.20, 0.23, '#7a7889');
	box(0, 0.42, -8.105, 9.24, 0.82, 0.039, '#544251');
	box(0, 2.88, -8.10, 9.20, 0.035, 0.05, OLD_GOLD);
	for (const side of [-1, 1]) {
		box(side * 4.74, 1.56, -4.08, 0.24, 3.12, 8.2, '#646477');
		box(side * 4.601, 0.30, -4.08, 0.035, 0.56, 8.12, '#3d374e');
		box(side * 4.6, 2.38, -4.08, 0.04, 0.13, 8.02, '#b49d9a');
		box(side * 4.74, 3.12, -4.07, 0.37, 0.18, 8.38, '#37334c');
		box(side * 4.13, 4.17, -0.49, 1.2, 0.14, 1.2, '#39324c');
		box(side * 3.07, 0.28, 0.02, 3.21, 0.55, 0.18, '#413c55');
		box(side * 3.07, 0.59, -0.013, 3.21, 0.10, 0.21, OLD_GOLD);
		box(side * 1.36, 1.58, 0.03, 0.17, 3.15, 0.25, '#746981');
		box(side * 4.63, 1.58, 0.03, 0.23, 3.15, 0.27, '#746981');
		box(side * 3.0, 1.79, 0.042, 0.070, 2.38, 0.151, STEEL);
		box(side * 3.0, 2.06, 0.042, 3.09, 0.051, 0.108, STEEL);
		// Thin sky-colored graphic on the shop windows (no opaque plane between player and street).
		box(side * 3.7, 2.45, 0.08, 0.43, 0.022, 0.011, '#87a7af', 'paint', -0.98);
		box(side * 3.82, 2.55, 0.08, 0.3, 0.022, 0.011, '#97b7b9', 'paint', -0.98);
	}
	box(0, 3.45, -0.007, 9.75, 0.84, 0.32, '#282a45');
	box(0, 3.98, -0.04, 9.84, 0.18, 0.58, '#332e45');
	box(0, 3.85, 0.263, 9.39, 0.049, 0.04, CORAL, 'glow');
	box(0, 3.05, 0.262, 9.36, 0.055, 0.04, MINT, 'glow');
	box(0, 3.009, 0.56, 9.96, 0.078, 0.96, '#3f3b58');
	box(0, 2.954, 1.025, 9.96, 0.035, 0.041, '#e29a5c', 'glow');
	for (let i = 0; i < 20; i++) {
		box(-4.62 + 0.486 * i, 3.071, 0.58, 0.485, 0.065, 0.87, i % 2 ? '#ad5e67' : '#684b6a');
	}
	for (const x of [-2.7, 0, 2.7]) box(x, 2.947, 0.59, 1.18, 0.054, 0.088, CREAM, 'glow');

	// A translucent reflection in the windows. Keep it weak enough for a clear look inward.
	const glass = new THREE.MeshBasicMaterial({
		color: '#547da1', opacity: 0.12, transparent: true, depthWrite: false, side: THREE.DoubleSide,
	});
	for (const x of [-3.01, 3.01]) {
		const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(3.08, 2.27), glass);
		windowPane.position.set(x, 1.78, 0.06);
		shop.add(windowPane);
	}

	// A softly lit roller rail traces the back half, so the shop feels enclosed without a solid roof.
	box(0, 3.38, -7.42, 8.9, 0.1, 0.13, INK);
	for (const x of [-3.26, -1.12, 1.05, 3.26]) {
		box(x, 3.30, -7.42, 1.83, 0.075, 0.092, CREAM, 'glow');
	}
	for (const x of [-2.75, 2.72]) {
		const warm = new THREE.PointLight('#ffd387', 22, 8, 1.85);
		warm.position.set(x, 2.73, -3.4);
		shop.add(warm);
	}
	const porch = new THREE.PointLight('#fbc584', 13, 6.6, 1.7);
	porch.position.set(0, 2.75, 0.9);
	shop.add(porch);

	// Shop's branded cardboard stock. Use a few deliberate color blocks per package so everything
	// still reads at Nixkit's follow-camera scale.
	const groceries = ['#e5816b', '#ffc167', '#7fb8b2', '#c6b4e8', '#e884ac', '#94c8a0', '#ea9a60'];
	const packet = (x: number, y: number, z: number, tint: string, format: number, facing: 'x' | 'z') => {
		const w = format === 1 ? 0.18 : 0.24;
		const d = format === 2 ? 0.15 : 0.21;
		const h = format === 1 ? 0.38 : format === 2 ? 0.29 : 0.24;
		box(x, y + h * 0.5, z, facing === 'x' ? d : w, h, facing === 'x' ? w : d, tint);
		if (facing === 'x') {
			box(x + d * .51, y + h * .61, z, .008, h * .24, w * .76, CREAM);
			box(x + d * .51, y + h * .15, z, .008, h * .10, w * .7, '#584f53');
		} else {
			box(x, y + h * .61, z + d * .51, w * .76, h * .24, .008, CREAM);
			box(x, y + h * .15, z + d * .51, w * .7, h * .10, .008, '#584f53');
		}
	};

	// Left-hand ramen shelf, open toward the aisle (+X). A halo edge and dedicated plaque make this
	// the visual starting point without a wall of HUD arrows.
	box(-4.42, 1.10, -4.65, 0.12, 2.20, 4.16, '#42354d');
	for (const end of [-6.69, -2.61]) box(-4.02, 1.09, end, 0.98, 2.18, 0.08, '#664d57');
	for (let row = 0; row < 4; row++) {
		const y = 0.24 + row * .47;
		box(-4.02, y, -4.65, .94, .075, 4.05, '#b18166');
		box(-3.54, y + .01, -4.65, .035, .08, 4.07, row === 2 ? '#eaa768' : '#846272');
		for (let j = 0; j < 14; j++) {
			if (row === 2 && j > 5 && j < 9) continue;
			const z = -6.5 + j * 0.285;
			if ((row + j) % 4 === 1 || row === 2) {
				const cupColor = groceries[(j * 3 + row) % groceries.length];
				add('cup', -3.84, y + .18, z, .21, .255, .21, cupColor);
				disk(-3.84, y + .315, z, .239, .028, CREAM);
				box(-3.722, y + .19, z, .012, .077, .064, INK);
			} else packet(-3.85, y + .037, z, groceries[(Math.floor(j / 3) + row * 2) % groceries.length], j % 3, 'x');
		}
	}
	box(-3.95, 2.165, -4.65, .96, .14, 4.13, '#b87955');
	box(-3.46, 2.155, -4.65, .038, .048, 4.10, '#ffba76', 'glow');

	// Gondola: low enough to see over, soft metal edging and mixed box stacks on both faces.
	box(-.4, .71, -5.3, .16, 1.42, 3.1, '#414258');
	for (let row = 0; row < 3; row++) {
		const y = .18 + .415 * row;
		box(-.4, y, -5.3, 1.2, .074, 3.10, row === 2 ? '#adb4ac' : '#74677b');
		for (const sign of [-1, 1]) {
			for (let j = 0; j < 10; j++) {
				if ((j + row * 2) % 7 === 6) continue;
				packet(-.4 + sign * .39, y + .043, -6.63 + j * .293, groceries[(Math.floor(j / 2) + row * 3 + (sign === 1 ? 1 : 0)) % groceries.length], (j + row) % 3, 'x');
			}
		}
	}
	for (const z of [-3.75, -6.85]) {
		box(-.4, .78, z, 1.19, 1.55, .07, '#5a716f');
		box(-.4, 1.43, z + .039, 1.08, .15, .02, CORAL);
		box(-.4, .82, z + .041, .77, .53, .019, '#d3b482');
		for (let i = 0; i < 3; i++) {
			box(-.4, .9 - i * .08, z + .052, .40 - i * .07, .027, .016, '#74606c');
		}
	}

	// Refrigerators flank the east wall: narrow teal jambs rather than opaque glass.
	box(4.09, 1.07, -4.35, .76, 2.14, 2.28, '#50656f');
	box(3.69, 1.17, -4.35, .05, 1.65, 2.10, '#2c4150');
	for (const z of [-5.40, -4.35, -3.3]) {
		box(3.65, 1.11, z, .111, 2.02, .055, '#77a5a4');
		box(3.57, 1.12, z + .09, .11, .23, .044, '#d5c8af');
	}
	for (let row = 0; row < 4; row++) {
		box(3.61, .42 + row * .39, -4.35, .19, .026, 2.01, '#88d3cf', 'glow');
		for (let j = 0; j < 9; j++) {
			const z = -5.27 + j * .229;
			const y = .43 + row * .39;
			const color = groceries[(Math.floor(j / 3) + row) % groceries.length];
			disk(3.59, y + .09, z, .14, .17, color);
			disk(3.59, y + .20, z, .12, .044, CREAM);
		}
	}
	box(3.65, 2.10, -4.35, .105, .13, 2.27, MINT, 'glow');

	// Back counter at x=2.55. Hot-water urn includes water-level glass, press button, spout and drip tray.
	box(2.55, .51, -7.30, 3.56, 1.02, .95, WOOD);
	box(2.55, 1.06, -7.30, 3.56, .10, .98, CREAM);
	box(2.55, .78, -6.806, 3.48, .046, .028, OLD_GOLD);
	for (const x of [1.27, 2.57, 3.85]) {
		box(x, .40, -6.812, 1.13, .49, .022, '#714958');
		box(x + .32, .52, -6.795, .10, .033, .022, CREAM);
	}
	const urnX = 2.70, urnZ = -7.38;
	box(urnX, 1.14, urnZ, .78, .058, .65, '#595970');
	disk(urnX, 1.48, urnZ - .065, .48, .62, '#d7cfc0');
	disk(urnX, 1.77, urnZ - .065, .50, .085, '#43536a');
	disk(urnX, 1.83, urnZ - .065, .23, .046, '#324056');
	box(urnX, 1.47, urnZ + .184, .148, .33, .04, '#788c9c');
	box(urnX, 1.39, urnZ + .207, .067, .15, .012, '#a0dfdc', 'glow');
	box(urnX + .13, 1.55, urnZ + .232, .056, .052, .039, CORAL, 'glow');
	box(urnX, 1.32, urnZ + .31, .087, .06, .14, '#323c55');
	box(urnX, 1.28, urnZ + .36, .065, .08, .072, '#323c55');
	box(urnX, 1.16, urnZ + .274, .33, .05, .31, STEEL);
	for (let i = 0; i < 5; i++) box(urnX - .12 + i * .06, 1.189, urnZ + .278, .029, .011, .182, '#343849');
	// Paper napkins and wooden chopstick box.
	box(1.48, 1.175, -7.49, .38, .16, .26, '#6d897c');
	box(1.48, 1.267, -7.46, .21, .032, .16, '#f4ddbc');
	box(3.57, 1.215, -7.49, .38, .24, .31, '#9c614f');
	for (let i = 0; i < 6; i++) box(3.42 + i * .054, 1.39 + (i % 3) * .045, -7.49, .026, .30, .029, CREAM, 'paint', (i - 2.5) * .037);

	// Service counter fitted to the unobtrusive back-left corner.
	box(-2.72, .52, -7.34, 2.38, 1.02, .74, '#714d66');
	box(-2.72, 1.045, -7.34, 2.38, .093, .79, '#d3a777');
	box(-2.4, 1.19, -7.40, .56, .20, .35, '#384254');
	box(-2.4, 1.39, -7.46, .46, .25, .068, '#4d596b');
	box(-2.4, 1.38, -7.423, .35, .15, .016, '#90cdbe', 'glow');
	box(-3.50, 1.19, -7.31, .40, .21, .36, '#496578');
	box(-3.50, 1.307, -7.31, .29, .03, .25, CREAM);

	// Window bar and three stools. The right-center stool is intentionally collision-free to allow
	// the player's sitting interaction to ease into place.
	box(2.84, 1.05, -.57, 2.9, .096, .56, '#c59568');
	box(2.84, .981, -.57, 2.91, .043, .547, '#795267');
	for (const x of [1.59, 4.10]) box(x, .49, -.385, .077, .96, .092, INK);
	for (const x of [1.69, 2.72, 3.79]) {
		disk(x, .61, -1.55, .45, .082, '#c2716d');
		seats?.push(benchSeat(x, -1.55, .651, 1, .76, .04, -1));
		disk(x, .317, -1.55, .076, .60, STEEL);
		disk(x, .025, -1.55, .36, .045, '#373546');
		disk(x, .27, -1.55, .24, .034, '#615767');
	}
	box(2.72, 1.101, -.71, .49, .017, .285, '#6c9d94');
	box(3.78, 1.101, -.71, .50, .016, .284, '#948292');
	disk(4.08, 1.18, -.47, .17, .18, '#ad6f58');
	for (let i = 0; i < 5; i++) {
		const x = 4.08 + Math.cos(i * 2.4) * .08;
		const z = -.47 + Math.sin(i * 2.4) * .08;
		add('ball', x, 1.32 + (i % 2) * .055, z, .095, .25, .11, i % 2 ? '#86b898' : '#6d9b82');
	}

	// Narrow outdoor fixtures; keep the center apron clear from curb to front door.
	for (const side of [-1, 1]) {
		const x = 4.35 * side;
		box(x, .48, .18, .26, .93, .27, '#373448');
		box(x, .58, .326, .12, .059, .035, MINT, 'glow');
		box(x, .11, .43, .48, .18, .40, '#604950');
	}
	const crateX = -3.79;
	box(crateX, .19, .46, .64, .35, .52, '#6d9086');
	box(crateX, .42, .47, .61, .16, .47, '#6a7d87');
	for (let j = 0; j < 5; j++) {
		box(crateX, .13 + .055 * j, .735, .56, .021, .038, '#354a54');
	}
	disk(3.85, .16, .50, .42, .32, '#9a665b');
	for (let j = 0; j < 9; j++) {
		const a = j * 2.40;
		add('ball', 3.85 + .17 * Math.cos(a), .40 + .08 * (j % 3), .50 + .14 * Math.sin(a), .14, .29, .14, j % 2 ? '#709b91' : '#84ad8b');
	}
	for (const x of [-4.28, 4.28]) {
		box(x, 2.89, .87, .033, .19, .031, OLD_GOLD);
		add('ball', x, 2.70, .87, .218, .34, .218, '#efa45e', 'glow');
		disk(x, 2.845, .87, .19, .065, WOOD);
		disk(x, 2.555, .87, .149, .047, WOOD);
		ball(x, 2.528, .87, .055, '#ef826f', 'glow');
	}

	// One or two readable graphics per surface beat dense prop labels. Texture is generated in-place
	// from original vector-style art, so it works offline and the game makes no asset requests.
	const board = (opts: { at: [number, number, number]; size: [number, number]; yaw?: number; pixels: [number, number]; draw: (ctx: CanvasRenderingContext2D) => void }) => {
		const canvas = document.createElement('canvas');
		[canvas.width, canvas.height] = opts.pixels;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		opts.draw(ctx);
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		const sign = new THREE.Mesh(new THREE.PlaneGeometry(...opts.size), new THREE.MeshBasicMaterial({
			map: tex, toneMapped: false,
		}));
		sign.rotation.y = opts.yaw ?? 0;
		sign.position.set(...opts.at);
		shop.add(sign);
	};
	const letters = (ctx: CanvasRenderingContext2D, word: string, x: number, y: number, font: string, fill: string) => {
		ctx.font = font;
		ctx.fillStyle = fill;
		ctx.textBaseline = 'middle';
		ctx.fillText(word, x, y);
	};
	const crescent = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, bg: string) => {
		ctx.beginPath();
		ctx.arc(x, y, r, 0, 2 * Math.PI);
		ctx.fillStyle = ink;
		ctx.fill();
		ctx.beginPath();
		ctx.arc(x + r * .40, y - r * .24, r * .81, 0, 2 * Math.PI);
		ctx.fillStyle = bg;
		ctx.fill();
	};

	board({
		at: [0, 3.48, .264], size: [7.96, .72], pixels: [1024, 96],
		draw(ctx) {
			ctx.fillStyle = '#272338';
			ctx.fillRect(0, 0, 1024, 96);
			ctx.fillStyle = '#c7756e';
			ctx.fillRect(0, 6, 1024, 2);
			ctx.fillRect(0, 89, 1024, 2);
			crescent(ctx, 73, 49, 27, '#ffe9ad', '#272338');
			ctx.strokeStyle = '#ffc890';
			ctx.lineWidth = 2.7;
			for (const [x, y, r] of [[96, 34, 6], [117, 50, 4], [48, 78, 4]]) {
				ctx.beginPath();
				ctx.moveTo(x-r, y);
				ctx.lineTo(x+r, y);
				ctx.moveTo(x, y-r);
				ctx.lineTo(x, y+r);
				ctx.stroke();
			}
			letters(ctx, 'L A N T E R N   M A R T', 142, 48, 'bold 38px system-ui, sans-serif', '#ffebbb');
			ctx.fillStyle = '#9d697e';
			ctx.fillRect(666, 26, 2, 45);
			letters(ctx, '등불편의점', 691, 41, 'bold 27px system-ui, sans-serif', '#a3ebe0');
			letters(ctx, 'O P E N   A F T E R   D A R K', 693, 69, 'bold 13px system-ui, sans-serif', '#e5adac');
		},
	});
	board({
		at: [-4.38, 2.55, -4.65], size: [2.70, .53], yaw: Math.PI / 2, pixels: [512, 96],
		draw(ctx) {
			ctx.fillStyle = '#422d41';
			ctx.fillRect(0, 0, 512, 96);
			ctx.fillStyle = '#ba756c';
			ctx.fillRect(17, 13, 478, 2);
			ctx.fillRect(17, 81, 478, 2);
			letters(ctx, '01', 32, 49, 'bold 34px system-ui, sans-serif', '#e58e7d');
			letters(ctx, 'CUP RAMEN', 101, 49, 'bold 43px system-ui, sans-serif', '#ffe4b8');
			letters(ctx, '라면', 401, 49, 'bold 32px system-ui, sans-serif', '#a3ded1');
		},
	});
	board({
		at: [2.72, 2.55, -8.095], size: [2.60, .53], pixels: [512, 96],
		draw(ctx) {
			ctx.fillStyle = '#334a56';
			ctx.fillRect(0, 0, 512, 96);
			ctx.fillStyle = '#77b8b3';
			ctx.fillRect(17, 13, 478, 2);
			ctx.fillRect(17, 81, 478, 2);
			letters(ctx, '02', 32, 49, 'bold 34px system-ui, sans-serif', '#94d7ce');
			letters(ctx, 'HOT WATER', 101, 49, 'bold 43px system-ui, sans-serif', '#ffebc3');
			letters(ctx, '온수', 401, 49, 'bold 32px system-ui, sans-serif', '#a3ded1');
		},
	});
	// A tiny moon-shaped OPEN placard in the left display window.
	board({
		at: [-3.97, 2.17, .13], size: [.78, .56], pixels: [192, 128],
		draw(ctx) {
			ctx.fillStyle = '#2d293f';
			ctx.fillRect(0, 0, 192, 128);
			ctx.strokeStyle = '#bf7e81';
			ctx.lineWidth = 4;
			ctx.strokeRect(7, 7, 178, 114);
			crescent(ctx, 96, 48, 21, '#ffe0a0', '#2d293f');
			letters(ctx, 'O P E N', 34, 93, 'bold 25px system-ui, sans-serif', '#a9ead7');
		},
	});
	// Hand-painted noodle poster, visible outside. No franchise or packaged-food artwork.
	board({
		at: [-2.11, 1.28, .121], size: [.81, 1.15], pixels: [192, 272],
		draw(ctx) {
			ctx.fillStyle = '#6d3e53';
			ctx.fillRect(0, 0, 192, 272);
			ctx.fillStyle = '#f2bd80';
			ctx.fillRect(10, 10, 172, 252);
			ctx.fillStyle = '#ac5c62';
			ctx.fillRect(16, 16, 160, 240);
			letters(ctx, 'LATE NIGHT', 30, 52, 'bold 23px system-ui, sans-serif', '#ffe6b7');
			letters(ctx, 'RAMEN', 42, 79, 'bold 29px system-ui, sans-serif', '#ffe6b7');
			ctx.strokeStyle = '#fff1cb';
			ctx.lineWidth = 5;
			for (const x of [76, 96, 116]) {
				ctx.beginPath();
				ctx.moveTo(x, 150);
				ctx.quadraticCurveTo(x - 11, 137, x + 4, 122);
				ctx.stroke();
			}
			ctx.fillStyle = '#42334a';
			ctx.beginPath();
			ctx.moveTo(40, 161);
			ctx.quadraticCurveTo(50, 225, 96, 225);
			ctx.quadraticCurveTo(142, 225, 152, 161);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = '#ffe5a1';
			ctx.beginPath();
			ctx.ellipse(96, 161, 56, 10, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#89b8a1';
			ctx.fillRect(66, 156, 29, 8);
			ctx.fillStyle = '#e78b6d';
			ctx.fillRect(104, 158, 18, 5);
			letters(ctx, '한 그릇 어때요?', 36, 244, 'bold 15px system-ui, sans-serif', '#fff0c9');
		},
	});

	const geo: Record<Shape, THREE.BufferGeometry> = {
		box: new THREE.BoxGeometry(1, 1, 1),
		cylinder: new THREE.CylinderGeometry(.5, .5, 1, 12),
		ball: new THREE.SphereGeometry(.5, 12, 8),
		cup: new THREE.CylinderGeometry(.5, .37, 1, 12),
	};
	const materials: Record<Finish, THREE.Material> = {
		paint: new THREE.MeshStandardMaterial({ roughness: .84, metalness: 0 }),
		glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
	};
	const helper = new THREE.Object3D();
	const hue = new THREE.Color();
	for (const [key, pieces] of buckets) {
		const [shape, finish] = key.split(':') as [Shape, Finish];
		const mesh = new THREE.InstancedMesh(geo[shape], materials[finish], pieces.length);
		mesh.name = 'Shop ' + shape + ' · ' + finish;
		mesh.receiveShadow = finish === 'paint';
		for (let i = 0; i < pieces.length; i++) {
			const piece = pieces[i];
			helper.position.set(...piece.position);
			helper.scale.set(...piece.size);
			helper.rotation.z = piece.roll;
			helper.updateMatrix();
			mesh.setMatrixAt(i, helper.matrix);
			mesh.setColorAt(i, hue.set(piece.color));
		}
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		mesh.computeBoundingSphere();
		shop.add(mesh);
	}
	return shop;
}
