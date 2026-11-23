// Lighthouse Point's telescope: hand-turned brass, painted cast iron, and a low slate footing.
import * as THREE from 'three';
import { addFeature } from './features';
import type { Toon } from './look';
import { terrainAt } from './terrain';

export type LookoutLandmark = { eye: THREE.Vector3; stand: THREE.Vector3; yaw: number };
const R = 1.30;
const PLATE_Z = -.28;
const STAND_Z = -1.18;
const OPTIC_Y = 1.79;
const OBJECTIVE_Z = .754;

export function lighthouseLookoutPlacement(light: {x: number; z: number}) {
	const d = Math.hypot(light.x, light.z) || 1;
	const dx = light.x/d, dz = light.z/d;
	// To one side of the plinth instead of directly behind it.
	const x = light.x + 3.66*dx - 2.54*dz;
	const z = light.z + 3.66*dz + 2.54*dx;
	const yaw = Math.atan2(dx, dz);
	const px = x + PLATE_Z*dx, pz = z + PLATE_Z*dz;
	let low = terrainAt(px, pz), high = low;
	for(let i=0;i<16;i++){
		const a = i*Math.PI/8;
		const g = terrainAt(px+R*Math.cos(a), pz+R*Math.sin(a));
		low = Math.min(low,g); high = Math.max(high,g);
	}
	const floor = high+.055;
	const stand = new THREE.Vector3(x+STAND_Z*dx, floor, z+STAND_Z*dz);
	const entry = OBJECTIVE_Z+.173;
	const eye = new THREE.Vector3(x+entry*dx, floor+OPTIC_Y, z+entry*dz);
	return { x, z, px, pz, floor, low, eye, stand, yaw };
}

export function buildLighthouseLookout(scene: THREE.Scene, toon: Toon, light: {x: number; z: number}): LookoutLandmark {
	const { x, z, px, pz, floor, low, eye, stand, yaw } = lighthouseLookoutPlacement(light);
	const group = new THREE.Group();
	group.name = 'Lighthouse Point · seaward telescope';
	group.position.set(x,floor,z);
	group.rotation.y = yaw;
	const pale = toon({ color:'#a9a6bd' });
	const slate = toon({ color:'#78798f' });
	const seam = toon({ color:'#6a657b' });
	const green = toon({ color:'#315d59' });
	const greenLight = toon({ color:'#53867c' });
	const verdigris = toon({ color:'#689485' });
	const brass = toon({ color:'#be9761' });
	const rub = toon({ color:'#e1b67d' });
	const darkBrass = toon({ color:'#856444' });
	const black = toon({ color:'#282b37' });
	const lens = toon({ color:'#4a8290' });
	const lensRim = toon({ color:'#79a4a0' });
	const glint = new THREE.MeshBasicMaterial({color:'#adc6be'});
	function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, ax=0, ay=0, az=0) {
		const m = new THREE.Mesh(geometry,material);
		m.position.set(ax,ay,az);
		m.castShadow = m.receiveShadow = true;
		group.add(m);
		return m;
	}
	function turned(material: THREE.Material, points: number[][], ax: number, ay: number, az: number, alongZ=false) {
		const geometry = new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),20);
		if(alongZ)geometry.rotateX(Math.PI/2);
		return mesh(geometry,material,ax,ay,az);
	}
	const pierDepth = floor-low+.34;
	const bevel = .10;
	mesh(new THREE.CylinderGeometry(1.34,1.39,pierDepth-bevel,20),slate,0,-(pierDepth+bevel)/2,PLATE_Z);
	// Matching facets keep the pale coping flush without intersecting the dark base.
	mesh(new THREE.CylinderGeometry(1.30,1.34,bevel,20),pale,0,-bevel/2,PLATE_Z);
	// Inlaid arcs and three broad stone joints stay underfoot, without an extra lip.
	turned(seam,[[.882,.002],[.905,.002],[.909,.005]],0,0,PLATE_Z);
	for(const [sx,sz,len,angle] of [[-.466,-.59,.46,-.16],[.424,-.04,.59,.27],[.25,-1.17,.53,-.26]]){
		const joint = mesh(new THREE.PlaneGeometry(len,.013).rotateX(-Math.PI/2),seam,sx,.005,sz);
		joint.rotation.y=angle;
	}
	// Broad black-green base, old exposed bolts, and the tapered painted post.
	turned(black,[[.38,.002],[.43,.013],[.43,.064],[.388,.091],[.386,.107],[.295,.117]],0,0,0);
	turned(green,[[.29,.093],[.30,.125],[.27,.192],[.20,.229],[.158,.333],[.119,.438],[.105,1.054],[.124,1.278],[.172,1.337],[.192,1.398],[.187,1.452],[.14,1.469]],0,0,0);
	turned(greenLight,[[.188,1.333],[.191,1.352],[.191,1.382],[.188,1.395]],0,0,0);
	turned(verdigris,[[.215,.212],[.221,.233],[.209,.250],[.182,.256]],0,0,0);
	turned(darkBrass,[[.119,1.055],[.132,1.067],[.132,1.091],[.116,1.103]],0,0,0);
	for(let i=0;i<4;i++){
		const a=(i+.5)*Math.PI/2;
		mesh(new THREE.CylinderGeometry(.031,.031,.035,6),darkBrass,.332*Math.cos(a),.122,.332*Math.sin(a));
	}
	// Cast arms cradle the pivot, left and right, not a floating barrel.
	for(const side of [-1,1]){
		const bracket = mesh(new THREE.CapsuleGeometry(.06,.205,3,8),green,side*.13,1.533,0);
		bracket.rotation.z=-.425*side;
		mesh(new THREE.CylinderGeometry(.110,.110,.084,12).rotateZ(Math.PI/2),darkBrass,side*.205,1.639,0);
		mesh(new THREE.CylinderGeometry(.071,.071,.088,12).rotateZ(Math.PI/2),rub,side*.232,1.639,0);
	}
	// Lower collar holds the optical axis; the main skin broadens toward an open objective rim.
	turned(black,[[.110,-.645],[.147,-.595],[.164,-.532],[.187,-.405],[.195,-.311],[.212,-.174],[.214,.13],[.225,.273],[.243,.338],[.251,.564],[.249,.622]],0,OPTIC_Y,0,true);
	turned(green,[[.151,-.571],[.173,-.499],[.185,-.412],[.189,-.308],[.214,-.165],[.215,.08],[.224,.234],[.244,.353],[.248,.542]],0,OPTIC_Y,0,true);
	turned(verdigris,[[.215,-.074],[.221,-.068],[.222,-.031],[.215,-.019]],0,OPTIC_Y,0,true);
	turned(darkBrass,[[.176,-.509],[.187,-.500],[.189,-.467],[.184,-.446]],0,OPTIC_Y,0,true);
	turned(brass,[[.244,.331],[.258,.345],[.262,.386],[.249,.397]],0,OPTIC_Y,0,true);
	turned(brass,[[.248,.53],[.268,.542],[.274,.574],[.275,.691],[.268,.746],[.255,OBJECTIVE_Z],[.220,OBJECTIVE_Z],[.222,.706]],0,OPTIC_Y,0,true);
	turned(rub,[[.269,.680],[.279,.689],[.278,.709],[.271,.716]],0,OPTIC_Y,0,true);
	turned(black,[[.137,-.591],[.153,-.597],[.153,-.647],[.143,-.671],[.104,-.670],[.105,-.628]],0,OPTIC_Y,0,true);
	turned(brass,[[.125,-.566],[.139,-.573],[.140,-.597],[.128,-.604]],0,OPTIC_Y,0,true);
	// Recessed glass faces. Marks are on the glass, not screen-space glows.
	const disc = new THREE.CircleGeometry(.215,24);
	mesh(disc,lensRim,0,OPTIC_Y,.709);
	mesh(new THREE.CircleGeometry(.183,24),lens,0,OPTIC_Y,.711);
	const shine = mesh(new THREE.CircleGeometry(.035,9),glint,-.104,OPTIC_Y+.097,.713);
	shine.scale.set(.78,.41,1);
	shine.rotation.z=-.47;
	mesh(new THREE.CircleGeometry(.087,16).rotateY(Math.PI),lens,0,OPTIC_Y,-.641);
	// Hand focus adjuster, worn one edge lighter from use.
	mesh(new THREE.CylinderGeometry(.063,.063,.108,10).rotateZ(-Math.PI/2),darkBrass,.222,OPTIC_Y-.085,-.352);
	mesh(new THREE.CylinderGeometry(.085,.085,.074,10).rotateZ(-Math.PI/2),brass,.309,OPTIC_Y-.085,-.352);
	mesh(new THREE.CylinderGeometry(.062,.062,.012,10).rotateZ(-Math.PI/2),rub,.348,OPTIC_Y-.085,-.352);

	scene.add(group);
	addFeature({ x:px, z:pz, r:R, pad:floor });
	addFeature({ x, z, r:.43, top:floor+OPTIC_Y+.33 });
	return { eye, stand, yaw };
}
