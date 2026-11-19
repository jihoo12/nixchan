// The 3D Nixchan figure for the experimental homepage. The model is built in Blender by
// tools/nixchan-3d/build.py; this file dresses it in toon shading with an inked outline, paints
// her face on, plays the clips baked into her rig, and turns her head and long hair on top of them.
// Her origin is where she sits: y = 0 is the surface, z = 0 is its front edge, and she faces +z.
import * as THREE from 'three';
import { nodeLook } from '../nixkit/figure-nodes';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { drawLogo, type LogoId } from './logos';
import { loadOutfit, wear, type HatId } from './outfit';
import { createFace, type FaceEmotion } from './nix-face';

export type { FaceEmotion } from './nix-face';

const NAVY = '#2c2a52';
const NAVY_DEEP = '#22203f';
const HAIR = '#eceafc';
const SKIN = '#fde9df';
const SNOW = '#5f9be8';
const INK = '#1d1b3a';


function toonRamp(steps = [150, 215, 255]) {
	const data = new Uint8Array(steps);
	const ramp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
	ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
	ramp.needsUpdate = true;
	return ramp;
}

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	paint(canvas.getContext('2d')!);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

export function snowflakeTexture() {
	return canvasTexture(256, 256, (ctx) => {
		ctx.translate(128, 128);
		ctx.strokeStyle = SNOW;
		ctx.lineCap = 'round';
		ctx.lineWidth = 16;
		for (let i = 0; i < 6; i++) {
			ctx.save();
			ctx.rotate((i * Math.PI) / 3);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(0, -104);
			ctx.moveTo(0, -62);
			ctx.lineTo(-28, -88);
			ctx.moveTo(0, -62);
			ctx.lineTo(28, -88);
			ctx.stroke();
			ctx.restore();
		}
		ctx.fillStyle = NAVY;
		ctx.beginPath();
		ctx.arc(0, 0, 22, 0, Math.PI * 2);
		ctx.fill();
		ctx.lineWidth = 10;
		ctx.stroke();
	});
}

/** Spherical UVs around the head's centre, matching the equirectangular face painting. */
function faceUVs(geometry: THREE.BufferGeometry) {
	const pos = geometry.attributes.position;
	const uv = new Float32Array(pos.count * 2);
	const v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i).normalize();
		const around = Math.atan2(v.x, v.z);
		uv[i * 2] = 0.25 + around / (Math.PI * 2);
		uv[i * 2 + 1] = 1 - Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)) / Math.PI;
	}
	geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** The looping clips baked into the model. */
export type NixClip = 'Sit' | 'Idle' | 'Walk' | 'Run' | 'Wave' | 'Swim' | 'Tread' | 'Cast' | 'Fish' | 'Reel' | 'Show' | 'Water' | 'Tend' | 'Plant' | 'Smith'
	// Carrying something in both arms (the page puts it between her hands), standing and walking.
	| 'Carry' | 'CarryWalk'
	// Asleep in bed, curled up on her side (on /home).
	| 'Sleep'
	// Snow magic (the Snow Magic game): a fighting stance, holding a spell, and the spells themselves.
	| 'Ready' | 'Charge' | 'Shot' | 'Slam' | 'Summon' | 'Dash';
/** Clips that play once through from the top each time they're played, and hold their last pose. */
const ONCE: NixClip[] = ['Water', 'Plant', 'Shot', 'Slam', 'Summon', 'Dash'];
/** The things she can hold, each hidden until she's using it. */
export type NixProp = 'Rod' | 'Can' | 'Hammer';
const PROP_PARTS: Record<NixProp, string[]> = { Rod: ['Rod', 'Reel'], Can: ['Can'], Hammer: ['Hammer'] };
/** What shows on her head with each hat. Under a hat, the hair over her skull is open where the hat
 * covers it (HairShell); with no hat it's whole (HairShellBare), with locks over the top of it. Her
 * X hairpin sits just under the beanie's band, so it shows with the beanie or with nothing on; under
 * the others' brims it would poke through. */
const HAT_PARTS: Record<HatId, string[]> = {
	beanie: ['BeanieCap', 'BeanieRim', 'BeanieEars', 'BeanieEarsInner', 'FlakeHat', 'Pin', 'HairShell'],
	straw: ['StrawHat', 'HairShell'],
	bucket: ['BucketHat', 'HairShell'],
	none: ['HairShellBare', 'HairCrownLocks', 'Pin'],
};
const HEAD_PARTS = [...new Set(Object.values(HAT_PARTS).flat())];
/** Which of her materials stand in for the hoodie's and the beanie's own, so they can be recoloured
 * without her leggings and shoes (which are the same navy) changing with them. */
const OWN_MATERIAL: [RegExp, Record<string, string>][] = [
	[/^(Body|Sleeves|Hood)$/, { Navy: 'Hoodie' }],
	[/^Cuff/, { NavyDeep: 'HoodieTrim' }],
	[/^Beanie/, { Navy: 'Hat', NavyDeep: 'HatTrim' }],
];
/** The jumps, which the page scrubs along her flight, by where she leaps from and lands: a seat or her feet. */
export type NixJump = 'Jump' | 'JumpUp' | 'JumpDown' | 'JumpStand';
/** The jumps that land her on her feet, which a Land clip follows. */
const LANDS_STANDING: NixJump[] = ['JumpDown', 'JumpStand'];
/** Swimming tips her forwards, so her head tips back up to look where she's going. */
const HEAD_LIFT: Partial<Record<NixClip, number>> = { Swim: -0.55, Tread: -0.08 };
/** How far her long hair streams back behind her in each clip. */
/** Where her long hair swings about, from the middle of her head (in the model's metres): at the back
 * of it, a little below the middle under a hat with a brim (so the hair just under the brim stays
 * put), and otherwise at the top of the long hair (so its top edge stays put, under the beanie's band
 * or the hair over her crown, rather than standing out from the back of her head). */
const HAIR_PIVOT = { brim: new THREE.Vector3(0, -0.08, -0.52), bare: new THREE.Vector3(0, 0.14, -0.52) };
/** How far her hair streams back under a hat with a brim (the straw hat, the bucket hat), of how far
 * it does under the beanie. */
const BRIM_STREAM = 0.45;
const HAIR_STREAM: Partial<Record<NixClip, number>> = { Run: 0.3, Walk: 0.1, Swim: 0.45, Tread: 0.12, Dash: 0.35, Charge: 0.08 };

export interface NixFigure {
	group: THREE.Group;
	/** Resolves once the model is in, or rejects if it could not be loaded. */
	ready: Promise<void>;
	setBlink(closed: boolean): void;
	/** Change the painted expression on her face; strength 0 keeps the original neutral art. */
	setEmotion(emotion: FaceEmotion, strength?: number): void;
	/** Show or hide something in her right hand: the fishing rod, the watering can or the hammer. */
	setProp(prop: NixProp, shown: boolean): void;
	/** Which hat she wears (the outfit's in outfit.ts). */
	setHat(hat: HatId): void;
	/** The design on the front of her hoodie (logos.ts), and its colour. */
	setLogo(logo: LogoId, colour: string): void;
	/** A named node of the model once it's in: a bone like "HandL", or the "RodTip" the line hangs from. */
	node(name: string): THREE.Object3D | null;
	/** Recolours one of her materials by name ("Can", "Reel"…), as when a tool is upgraded. */
	tint(material: string, hex: string): void;
	/** How long a clip runs at its natural pace, in seconds (0 until the model's in). */
	duration(clip: NixClip): number;
	/** Blend into a looping clip, played at `speed` times its natural pace. */
	play(clip: NixClip, speed?: number): void;
	/** `jump` is the jump she's in and how far through it she is (0 → 1), or null on the ground.
	 * `landed: false` ends a jump without the landing clip, as when she drops into water. */
	tick(dt: number, time: number, state: { airborne: boolean; look: THREE.Vector2; still: boolean; jump: { t: number; clip: NixJump } | null; landed?: boolean }): void;
}

/** How her materials are made: nixkit/figure-nodes.ts's nodeLook (TSL, for WebGPU) unless a page
 * brings its own. */
export interface FigureLook {
	/** Toon shading, plus a soft rim of light along the silhouette. */
	toon(params: THREE.MeshToonMaterialParameters): THREE.MeshToonMaterial;
	/** The ink line: drawn on a back-facing twin of a mesh, pushed out `width` along its normals. */
	inkLine(hex: string, width: number): THREE.Material;
}

export function buildNixFigure(url: string, made: FigureLook = nodeLook): NixFigure {
	const ramp = toonRamp();
	// Toon shading plus a soft rim of light along the silhouette, so she lifts off the wall.
	const toon = (hex: string, extra: THREE.MeshToonMaterialParameters = {}) => made.toon({ color: hex, gradientMap: ramp, ...extra });
	const face = createFace();
	// Her face keeps a gentler shadow than her clothes, so it never cuts across her cheeks.
	const faceMat = toon('#ffffff', { map: face.map, gradientMap: toonRamp([226, 244, 255]) });
	const materials: Record<string, THREE.Material> = {
		Navy: toon(NAVY),
		NavyDeep: toon(NAVY_DEEP),
		Hoodie: toon(NAVY),
		HoodieTrim: toon(NAVY_DEEP),
		Hat: toon(NAVY),
		HatTrim: toon(NAVY_DEEP),
		Straw: toon('#ecc77a'),
		StrawBand: toon('#f25f6b'),
		Petal: toon('#ff9ec7'),
		PetalCore: toon('#ffd84d'),
		Bucket: toon('#6fa88f'),
		BucketTrim: toon('#f4f3ff'),
		Hair: toon(HAIR, { side: THREE.DoubleSide }),
		Skin: toon(SKIN),
		Ink: toon(INK),
		Cord: toon('#f4f3ff'),
		Rod: toon('#c58b57'),
		Reel: toon('#f25f6b'),
		Can: toon('#5fb0e8'),
		Metal: toon('#9aa3c4'),
	};
	const snowMat = toon('#ffffff', { map: snowflakeTexture(), transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
	// The design on her chest is drawn on a canvas of its own, drawn again when she changes it.
	const logoCanvas = document.createElement('canvas');
	logoCanvas.width = logoCanvas.height = 256;
	const logoTexture = new THREE.CanvasTexture(logoCanvas);
	logoTexture.colorSpace = THREE.SRGBColorSpace;
	logoTexture.anisotropy = 4;
	drawLogo(logoCanvas.getContext('2d')!, 'snowflake', SNOW);
	const logoMat = toon('#ffffff', { map: logoTexture, transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
	const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), logoMat);

	// The ink line: a back-facing twin of each mesh, pushed out along its normals.
	// Hair gets a finer lavender line, so the thin tips don't turn into black spikes.
	const inkLine = (hex: string, width: number) => made.inkLine(hex, width);
	const outline = inkLine(INK, 0.012);
	const hairLine = inkLine('#8a85c4', 0.006);
	// Too fine to carry a line of their own.
	const uninked = /^(Cords|Pin)$|Laces$|^Rod/;

	const group = new THREE.Group();
	let head: THREE.Object3D | null = null;
	let longHair: THREE.Object3D | null = null;
	let mixer: THREE.AnimationMixer | null = null;
	const actions = new Map<string, THREE.AnimationAction>();
	const weights = new Map<THREE.AnimationAction, number>();
	let clip: NixClip = 'Sit';
	let loaded: THREE.Object3D | null = null;
	const propShown: Record<NixProp, boolean> = { Rod: false, Can: false, Hammer: false };
	let hat: HatId = 'beanie';
	const showHat = () => {
		for (const name of HEAD_PARTS) {
			const part = loaded?.getObjectByName(name);
			if (part) part.visible = HAT_PARTS[hat].includes(name);
		}
	};
	const showProps = () => {
		for (const prop of Object.keys(PROP_PARTS) as NixProp[])
			for (const name of PROP_PARTS[prop]) {
				const part = loaded?.getObjectByName(name);
				if (part) part.visible = propShown[prop];
			}
	};
	const rest = { head: new THREE.Quaternion(), hair: new THREE.Quaternion(), hairAt: new THREE.Vector3() };
	/** Where the long hair swings about, in its bone's frame (scaled as the bone is). */
	const hairPivots = { brim: new THREE.Vector3(), bare: new THREE.Vector3() };
	const swung = new THREE.Vector3();

	const ready = new GLTFLoader().loadAsync(url).then((gltf) => {
		const model = gltf.scene;
		const meshes: THREE.Mesh[] = [];
		model.traverse((o) => {
			if (o instanceof THREE.Mesh) meshes.push(o);
		});
		for (const mesh of meshes) {
			// A multi-material object comes in as a group of meshes named after it.
			const owner = mesh.name || mesh.parent?.name || '';
			const placeholder = mesh.material as THREE.Material;
			if (owner.startsWith('Face')) {
				faceUVs(mesh.geometry);
				mesh.material = faceMat;
			} else {
				const own = OWN_MATERIAL.find(([re]) => re.test(owner))?.[1][placeholder.name];
				mesh.material = materials[own ?? placeholder.name] ?? materials.Navy;
			}
			placeholder.dispose();
			mesh.castShadow = true;
			if (uninked.test(owner)) continue;
			const lineMat = mesh.material === materials.Hair ? hairLine : outline;
			if (mesh instanceof THREE.SkinnedMesh) {
				// The hoodie and sleeves bend with the rig, so their ink line has to as well.
				const line = new THREE.SkinnedMesh(mesh.geometry, lineMat);
				line.bind(mesh.skeleton, mesh.bindMatrix);
				// Their bounds are measured standing in rest, which says little about where they are posed.
				mesh.frustumCulled = line.frustumCulled = false;
				mesh.add(line);
			} else {
				mesh.add(new THREE.Mesh(mesh.geometry, lineMat));
			}
		}
		model.getObjectByName('FlakeHat')?.add(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), snowMat));
		model.getObjectByName('FlakeChest')?.add(logoMesh);
		// The rig's bones: the clips pose the body, and the page turns the head and long hair on top.
		head = model.getObjectByName('Head') ?? null;
		longHair = model.getObjectByName('Hair') ?? null;
		if (head) rest.head.copy(head.quaternion);
		if (longHair) {
			rest.hair.copy(longHair.quaternion);
			rest.hairAt.copy(longHair.position);
			// The long hair swings back (running, dashing) about the back of her head, just under where a
			// hat's brim comes, not about the bone at her chest it hangs from. Anything swung back rises
			// behind where it turns about, so swung about the chest, the hair up at the back of her head
			// rose up through the brim of a sun hat; this way only the hair below it lifts.
			const pivot = model.getObjectByName('HeadPivot');
			if (pivot) {
				model.updateMatrixWorld(true);
				for (const kind of ['brim', 'bare'] as const) {
					const at = pivot.getWorldPosition(new THREE.Vector3()).add(HAIR_PIVOT[kind]);
					hairPivots[kind].copy(longHair.worldToLocal(at)).multiply(longHair.scale);
				}
			}
		}
		mixer = new THREE.AnimationMixer(model);
		for (const animation of gltf.animations) {
			const action = mixer.clipAction(animation);
			// The jumps and the landing play once, and the page moves them along itself.
			if (ONCE.includes(animation.name as NixClip)) {
				action.setLoop(THREE.LoopOnce, 1);
				action.clampWhenFinished = true;
			} else if (animation.name.startsWith('Jump') || animation.name === 'Land') {
				action.setLoop(THREE.LoopOnce, 1);
				action.clampWhenFinished = true;
				action.paused = true;
			}
			action.play();
			action.setEffectiveWeight(0);
			actions.set(animation.name, action);
			weights.set(action, 0);
		}
		const sit = actions.get('Sit');
		if (sit) {
			sit.setEffectiveWeight(1);
			weights.set(sit, 1);
		}
		loaded = model;
		showProps();
		wear(figure, loadOutfit());
		group.add(model);
	});

	let yaw = 0;
	let pitch = 0;
	let flow = 0;
	let lift = 0;
	let jumpWeight = 0;
	let jumping: NixJump | null = null;
	// The jump last played, which stays on as it fades out under a sit.
	let shown: NixJump = 'Jump';
	// How far into the landing she is, in seconds, or null when she isn't landing.
	let landing: number | null = null;
	let landWeight = 0;
	const look = new THREE.Quaternion();
	const euler = new THREE.Euler();
	const figure: NixFigure = {
		group,
		ready,
		setBlink(closed) {
			faceMat.map = face.blink(closed);
		},
		setEmotion(emotion, strength = 1) {
			faceMat.map = face.emote(emotion, strength);
		},
		setHat(next) {
			hat = next;
			showHat();
		},
		setLogo(logo, colour) {
			logoMesh.visible = logo !== 'none';
			drawLogo(logoCanvas.getContext('2d')!, logo, colour);
			logoTexture.needsUpdate = true;
		},
		setProp(prop, shown) {
			if (propShown[prop] === shown) return;
			propShown[prop] = shown;
			showProps();
		},
		tint(material, hex) {
			const mat = materials[material] as THREE.MeshToonMaterial | undefined;
			mat?.color.set(hex);
		},
		node(name) {
			return loaded?.getObjectByName(name) ?? null;
		},
		duration(name) {
			return actions.get(name)?.getClip().duration ?? 0;
		},
		play(next, speed = 1) {
			const playing = actions.get(next);
			if (playing) playing.timeScale = speed;
			if (next === clip) return;
			clip = next;
			// A clip that has faded right out starts again from the top, so a wave begins with the hand
			// coming up; one that plays once always does.
			const action = actions.get(next);
			if (action && ONCE.includes(next)) action.reset().play();
			else if (action && (weights.get(action) ?? 0) < 0.05) action.time = 0;
		},
		tick(dt, time, { airborne, look: pointer, still, jump, landed = true }) {
			if (!head || !longHair || !mixer) return;
			const damp = (from: number, to: number, rate: number) => THREE.MathUtils.lerp(from, to, 1 - Math.exp(-rate * dt));
			const landAction = actions.get('Land');
			if (jump) {
				jumping = shown = jump.clip;
				landing = null;
			} else if (jumping) {
				// Down on her feet, she goes straight into the landing: knees bend, then she straightens up.
				if (LANDS_STANDING.includes(jumping) && landAction && !still && landed) {
					landing = 0;
					landWeight = 1;
					jumpWeight = 0;
				}
				jumping = null;
			}
			// The jumps cut in quickly over the looping clips, and the landing over those too.
			jumpWeight = damp(jumpWeight, jump === null ? 0 : 1, jump === null ? 8 : 18);
			if (landing !== null) {
				landing += dt;
				if (landAction && landing >= landAction.getClip().duration) landing = null;
			}
			landWeight = damp(landWeight, landing === null ? 0 : 1, 12);
			const under = (1 - jumpWeight) * (1 - landWeight);
			for (const [name, action] of actions) {
				if (name.startsWith('Jump')) {
					if (jump && name === jump.clip) action.time = THREE.MathUtils.clamp(jump.t, 0, 1) * action.getClip().duration;
					action.setEffectiveWeight(name === shown ? jumpWeight : 0);
				} else if (action === landAction) {
					action.time = Math.min(landing ?? action.getClip().duration, action.getClip().duration);
					action.setEffectiveWeight(landWeight * (1 - jumpWeight));
				} else {
					// Into and out of a clip that plays once, quickly, so its start and end aren't lost in the blend.
					const quick = ONCE.includes(name as NixClip) || ONCE.includes(clip);
					const w = damp(weights.get(action) ?? 0, name === clip ? 1 : 0, quick ? 12 : 5);
					weights.set(action, w);
					action.setEffectiveWeight(w * under);
				}
			}
			mixer.update(still ? 0 : dt);

			// She glances towards the pointer, and her hair streams back when she runs or lifts in the air.
			yaw = damp(yaw, THREE.MathUtils.clamp(pointer.x, -1, 1) * 0.28, 4);
			pitch = damp(pitch, THREE.MathUtils.clamp(-pointer.y, -1, 1) * 0.12, 4);
			// Under a brim, her hair swings back less, so it stays under it.
			const brimmed = hat === 'straw' || hat === 'bucket';
			const stream = (HAIR_STREAM[clip] ?? 0) * (brimmed ? BRIM_STREAM : 1);
			lift = damp(lift, HEAD_LIFT[clip] ?? 0, 5);
			flow = damp(flow, airborne ? -0.2 : stream + (still ? 0 : Math.sin(time * 1.7) * 0.02), airborne ? 6 : 3);
			head.quaternion.copy(rest.head).multiply(look.setFromEuler(euler.set(pitch + lift, yaw, still ? 0 : Math.sin(time * 0.8) * 0.03)));
			// The long hair hangs from her shoulders and is only half as stiff, so it trails a turn of the head.
			look.setFromEuler(euler.set(flow, yaw * 0.55, 0));
			longHair.quaternion.copy(rest.hair).multiply(look);
			// Turned about hairPivot rather than the bone's own origin: move the bone by where the pivot
			// would otherwise have gone.
			const hairPivot = hairPivots[brimmed ? 'brim' : 'bare'];
			swung.copy(hairPivot).applyQuaternion(look).negate().add(hairPivot).applyQuaternion(rest.hair);
			longHair.position.copy(rest.hairAt).add(swung);
		},
	};
	return figure;
}
