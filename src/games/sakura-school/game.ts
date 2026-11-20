import * as THREE from 'three';
import type { GameContext } from '../../lib/nixkit/meta';
import { ORDER } from '../../lib/nixkit/engine';
import { buildSchool } from './building';
import { buildCourt } from './court';
import { cameraFraction, schoolWorld } from './physics';

const spots = [
	{ x:0, z:1.7, radius:2.35, label:'현관', line:'신발장에는 이름표가 남아 있고, 복도에는 봄볕이 길게 들어와요.' },
	{ x:-5.8, z:-9.1, radius:2.15, label:'빈 교실', line:'칠판 구석에 오늘의 마지막 숙제가 적혀 있어요. ‘집에 가는 길에 봄을 한 가지 찾아오기.’' },
	{ x:4.9, z:8.1, radius:1.8, label:'벚나무 아래', line:'꽃잎이 어깨에 앉았다가, 바람에 다시 운동장으로 날아갔어요.' },
] as const;

export default function start({ createGame }: GameContext) {
	const staging = new THREE.Scene();
	const indoor = buildSchool(staging);
	const court = buildCourt(staging);
	const solids = [...indoor,...court.blocks];
	const spawn = new THREE.Vector3(0,0,14);
	const game = createGame({
		spawn: {pos:spawn, heading:Math.PI}, world:schoolWorld(solids),
		firstPerson:{label:'1인칭 / 3인칭',eyeHeight:1.52},
	});
	if(!game)return;
	game.scene.add(...[...staging.children]);
	game.orbit.distance=6.2;
	game.orbit.pitch=.13;
	game.orbit.yaw=0;
	game.sky.fog.near=35;
	game.sky.fog.far=76;
	game.sky.clock.on(sky=>{
		if(sky.sunPower>1.75){
			game.sky.sun.color.set('#ffd9ac');
			game.sky.sun.intensity=2.35;
			game.sky.hemi.groundColor.set('#b5a08b');
			game.sky.hemi.intensity=1.65;
			game.sky.fog.color.set('#d6cbbf');
		}
	});
	const warmFill=new THREE.HemisphereLight('#fff0e0','#8d9386',.28);
	game.scene.add(warmFill);
	const place = game.hud.stat('운동장');
	const near = () => spots.find(s=>Math.hypot(game.player.pos.x-s.x,game.player.pos.z-s.z)<s.radius && game.player.pos.y<1.25);
	const inspect = () => {
		const s=near();
		if(s)game.hud.toast(s.line,4.5);
		else game.hud.toast('현관, 교실 중앙 통로, 벚나무 아래에서 주변을 살펴볼 수 있어요.');
	};
	game.hud.button('살펴보기',inspect);
	game.keys.intercept((key,e)=>{
		if(key!=='e'||e.altKey||e.ctrlKey||e.metaKey)return false;
		if(e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement)return false;
		if(!e.repeat)inspect();
		return true;
	},50);
	const reduced=matchMedia('(prefers-reduced-motion: reduce)');
	const eye=new THREE.Vector3();
	let cameraEase=1;
	game.engine.add({order:ORDER.camera+1,always:true,update(dt){
		if(game.firstPerson){cameraEase=1;return;}
		const p=game.player.pos;
		eye.set(p.x,p.y+1.2,p.z);
		const fraction=cameraFraction(eye,game.camera.position,solids);
		cameraEase=fraction<cameraEase?fraction:THREE.MathUtils.damp(cameraEase,fraction,6,dt);
		if(cameraEase<.998){
			game.camera.position.lerpVectors(eye,game.camera.position,cameraEase);
			game.camera.lookAt(eye);
		}
	}});
	game.onUpdate((_dt,t) => {
		if(!reduced.matches)court.update(t);
		const {x,z}=game.player.pos;
		const inside=Math.abs(x)<9.8&&z<-.28&&z>-11.9;
		const spot=near();
		place.set(spot?.label??(inside?(z>-3.05?'복도':x<-.5?'교실':'작은 도서실'):'운동장'));
	});
	game.loaded.then(()=>game.hud.banner('벚꽃학교','수업이 끝나고, 교정에 바람이 분다'),()=>{});
	void game.start();
}
