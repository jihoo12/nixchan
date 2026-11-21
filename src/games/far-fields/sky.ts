// The night sky over Far Fields: dark, full of stars, and in it the place the sun fell from, a
// black hole in the sky ringed with a thin gold glow, with a thread of light hanging down from it
// to the peak below. At the end the sun goes back up into it, the hole fills, and it's day.
import * as THREE from 'three';
import { glowTexture } from '../../lib/nixkit/look';
import { rng } from './noise';

/** How high the ring hangs over the peak. */
export const RING_UP = 300;

function gradient(top: string, bottom: string) {
	const canvas = document.createElement('canvas');
	canvas.width = 2;
	canvas.height = 256;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createLinearGradient(0, 0, 0, 256);
	g.addColorStop(0, top);
	g.addColorStop(1, bottom);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 2, 256);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return { canvas, ctx, tex };
}

export function createNightSky(scene: THREE.Scene, peak: THREE.Vector3) {
	const NIGHT = [new THREE.Color('#05061a'), new THREE.Color('#1b1c45')];
	const DAY = [new THREE.Color('#7ec8ff'), new THREE.Color('#e7f4ff')];
	const bg = gradient('#05061a', '#1b1c45');
	scene.background = bg.tex;
	const paint = (day: number) => {
		const top = NIGHT[0].clone().lerp(DAY[0], day);
		const bottom = NIGHT[1].clone().lerp(DAY[1], day);
		const g = bg.ctx.createLinearGradient(0, 0, 0, 256);
		g.addColorStop(0, `#${top.getHexString()}`);
		g.addColorStop(1, `#${bottom.getHexString()}`);
		bg.ctx.fillStyle = g;
		bg.ctx.fillRect(0, 0, 2, 256);
		bg.tex.needsUpdate = true;
	};

	// Stars, on a dome that goes along with her.
	const r = rng(7, 7, 77);
	const COUNT = 1400;
	const pos = new Float32Array(COUNT * 3);
	const col = new Float32Array(COUNT * 3);
	const tint = new THREE.Color();
	for (let i = 0; i < COUNT; i++) {
		const a = r() * Math.PI * 2;
		const up = Math.asin(0.04 + r() * 0.96);
		pos.set([Math.cos(a) * Math.cos(up) * 900, Math.sin(up) * 900, Math.sin(a) * Math.cos(up) * 900], i * 3);
		tint.setHSL(0.55 + r() * 0.15, 0.5, 0.65 + r() * 0.35).multiplyScalar(0.5 + r() * 0.5);
		col.set([tint.r, tint.g, tint.b], i * 3);
	}
	const starGeo = new THREE.BufferGeometry();
	starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	const starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false });
	const stars = new THREE.Points(starGeo, starMat);
	stars.frustumCulled = false;
	stars.renderOrder = -2;
	scene.add(stars);

	// The hole the sun fell from: a black disc with a gold ring round it, and a glow.
	const ringAt = peak.clone().setY(peak.y + RING_UP);
	const hole = new THREE.Group();
	hole.position.copy(ringAt);
	const discMat = new THREE.MeshBasicMaterial({ color: '#020208', fog: false, depthWrite: false });
	const disc = new THREE.Mesh(new THREE.CircleGeometry(38, 48), discMat);
	const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd889', fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
	const ring = new THREE.Mesh(new THREE.RingGeometry(38, 41.5, 64), ringMat);
	const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb35c', opacity: 0.5, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
	corona.scale.setScalar(150);
	corona.renderOrder = -1;
	disc.renderOrder = 0;
	ring.renderOrder = 1;
	hole.add(corona, disc, ring);
	scene.add(hole);

	// A thread of light from the ring down to the peak, to show the way.
	const threadMat = new THREE.MeshBasicMaterial({ color: '#ffd889', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
	const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, RING_UP - 38, 8, 1, true), threadMat);
	thread.position.set(peak.x, peak.y + (RING_UP - 38) / 2, peak.z);
	thread.frustumCulled = false;
	scene.add(thread);

	let day = 0;
	return {
		ringAt,
		/** 0 at night, 1 in the day (the hole filled with the sun again). */
		setDay(d: number) {
			if (d === day) return;
			day = d;
			paint(d);
			starMat.opacity = 1 - d;
			stars.visible = d < 1;
			threadMat.opacity = 0.16 * (1 - d);
			discMat.color.set('#020208').lerp(new THREE.Color('#fff6c4'), d);
			ringMat.color.set('#ffd889').lerp(new THREE.Color('#fff1b0'), d);
			corona.material.opacity = 0.5 + d * 0.5;
			corona.scale.setScalar(150 + d * 120);
		},
		update(camera: THREE.Camera, around: THREE.Vector3, time: number) {
			stars.position.copy(around);
			hole.lookAt(camera.position);
			ringMat.opacity = 0.75 + Math.sin(time * 0.9) * 0.2;
		},
	};
}
