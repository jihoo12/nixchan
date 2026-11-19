// The sky and the light a Nixkit game has unless it brings its own: a gradient sky, fog, a sun
// that casts shadows round wherever she is, and a hemisphere light, by day or by night (the site's
// time, documentElement.dataset.time, which it says has changed with a 'site-time' event).
import * as THREE from 'three';
import { createDayNight } from './daynight';
import { ORDER, type Engine } from './engine';

/** The sky's colours, top to bottom, and the light, for one time of day. */
export interface Sky {
	top: string;
	bottom: string;
	fog: string;
	sun: string;
	sunPower: number;
	/** The hemisphere light's colour from below. */
	ground: string;
	hemi: number;
}

export const SKIES: { day: Sky; night: Sky } = {
	day: { top: '#7ec8ff', bottom: '#e7f4ff', fog: '#d7ecff', sun: '#fff4dd', sunPower: 2.4, ground: '#9fb3d9', hemi: 1.5 },
	night: { top: '#141433', bottom: '#3b3a73', fog: '#2c2b5c', sun: '#b7c4ff', sunPower: 1.1, ground: '#2a2850', hemi: 0.9 },
};

export interface SkyLightOptions {
	/** Its skies by day and by night (SKIES without it). */
	skies?: { day: Sky; night: Sky };
	/** Where the sun's shadows are centred each frame: usually her. */
	follow: () => THREE.Vector3;
	/** How far round that the shadows reach, in metres, and how sharp they are. */
	shadow?: { reach?: number; mapSize?: number };
	/** Fog from and to (60 to 260 metres without it). */
	fog?: [number, number];
}

export function createSkyLight(engine: Engine, opts: SkyLightOptions) {
	const { scene } = engine;
	const skies = opts.skies ?? SKIES;
	const hemi = new THREE.HemisphereLight('#ffffff', skies.day.ground, skies.day.hemi);
	const sun = new THREE.DirectionalLight(skies.day.sun, skies.day.sunPower);
	sun.castShadow = true;
	const mapSize = opts.shadow?.mapSize ?? 2048;
	sun.shadow.mapSize.set(mapSize, mapSize);
	const S = opts.shadow?.reach ?? 30;
	Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 140 });
	sun.shadow.bias = -0.0005;
	scene.add(hemi, sun, sun.target);

	const skyCanvas = document.createElement('canvas');
	skyCanvas.width = 2;
	skyCanvas.height = 256;
	const skyTexture = new THREE.CanvasTexture(skyCanvas);
	skyTexture.colorSpace = THREE.SRGBColorSpace;
	scene.background = skyTexture;
	const [near, far] = opts.fog ?? [60, 260];
	const fog = new THREE.Fog(skies.day.fog, near, far);
	scene.fog = fog;

	const clock = createDayNight(skies);
	const paint = (sky: Sky) => {
		const ctx = skyCanvas.getContext('2d')!;
		const g = ctx.createLinearGradient(0, 0, 0, 256);
		g.addColorStop(0, sky.top);
		g.addColorStop(1, sky.bottom);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 2, 256);
		skyTexture.needsUpdate = true;
		fog.color.set(sky.fog);
		sun.color.set(sky.sun);
		sun.intensity = sky.sunPower;
		hemi.groundColor.set(sky.ground);
		hemi.intensity = sky.hemi;
	};
	clock.on(paint);
	clock.start();

	engine.add({
		order: ORDER.light,
		always: true,
		update() {
			// The sun's shadows follow her about.
			const p = opts.follow();
			sun.position.set(p.x + 24, p.y + 50, p.z + 16);
			sun.target.position.copy(p);
		},
		dispose() {
			clock.dispose();
			skyTexture.dispose();
		},
	});

	return { sun, hemi, fog, /** Day or night, and the sky for it: `clock.on(sky => ...)` to change with it. */ clock };
}
