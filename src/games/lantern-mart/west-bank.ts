// Moonbank: quiet evening meadows beyond the river. The station owns z54.5–65.5.
import * as THREE from 'three';
import type { TownBlock } from './town-layout';

type Shape = 'box' | 'pine' | 'rock' | 'reed';
type Shade = 'matte' | 'light';
type Part = {x:number;y:number;z:number;w:number;h:number;d:number;color:string;yaw:number;lean:number};

export function buildWestBank(scene: THREE.Scene): TownBlock[] {
	const root = new THREE.Group();
	root.name = 'Lantern Town · Moonbank Meadow';
	scene.add(root);
	const blocks: TownBlock[] = [];
	const batches = new Map<`${Shape}-${Shade}`, Part[]>();
	const add = (shape:Shape, shade:Shade, color:string, x:number, y:number, z:number, w:number, h:number, d:number, yaw=0, lean=0) => {
		const key = `${shape}-${shade}` as const;
		const parts = batches.get(key) ?? [];
		parts.push({x,y,z,w,h,d,color,yaw,lean});
		batches.set(key,parts);
	};
	const solid = (color:string,x:number,y:number,z:number,w:number,h:number,d:number) => {
		add('box','matte',color,x,y,z,w,h,d);
		blocks.push({x,z,w,d,bottom:y-h/2,top:y+h/2});
	};
	const detail = (color:string,x:number,y:number,z:number,w:number,h:number,d:number,yaw=0) => add('box','matte',color,x,y,z,w,h,d,yaw);
	const glow = (color:string,x:number,y:number,z:number,w:number,h:number,d:number) => add('box','light',color,x,y,z,w,h,d);

	// Low, purely visual paving. The root terrain stays the actual walkable surface.
	const paving = ['#515567','#5c5e70','#53596c'];
	for(let i=0;i<10;i++)detail(paving[i%3],-128,.006,47.9+i*.69,2.2,.012,.67);
	for(let i=0;i<28;i++)detail(paving[i%3],-127.66+i*.86,.008,47,0.83,.012,2.15);
	for(let i=0;i<9;i++)detail(paving[i%3],-101+i*.72,.006,47,0.69,.012,2.15);
	for(let i=0;i<4;i++)detail('#696879',-103,.008,45.5-i*.58,3.7,.012,.55);

	function beacon(x:number,z:number,height=1.9) {
		solid('#343948',x,.11,z,.42,.22,.42);
		solid('#584953',x,height*.5,z,.16,height,.16);
		solid('#5d5460',x,height+.02,z,.47,.16,.47);
		glow('#ffd9a0',x,height+.29,z,.31,.44,.31);
		solid('#415369',x,height+.56,z,.58,.12,.58);
	}
	for(const z of [53.9,50.4]) {beacon(-129.8,z,1.55);beacon(-126.2,z,1.55);}
	for(const x of [-124,-118,-112,-106,-99]) beacon(x,49,1.55);
	for(const x of [-107,-100]) beacon(x,43.4,2.05);

	// A warm weather shelter with sideboard: its front faces the open path, not the rail line.
	const kioskX=-137.5,kioskZ=48.8;
	solid('#655262',kioskX,1.3,kioskZ-1.2,4.5,2.6,.18);
	for(const x of [kioskX-2.15,kioskX+2.15])for(const z of [kioskZ-1,kioskZ+1.15])solid('#795d5d',x,1.45,z,.18,2.9,.18);
	solid('#8b6e63',kioskX,.57,kioskZ-.94,4.1,1.14,.5);
	solid('#a28673',kioskX,1.18,kioskZ-.94,4.26,.14,.72);
	solid('#3e586c',kioskX,2.92,kioskZ,5.05,.25,3.12);
	solid('#4d6a78',kioskX,3.11,kioskZ,4.55,.14,2.55);
	for(const x of [kioskX-1.35,kioskX+1.35]){
		detail('#49414c',x,2.3,kioskZ+.94,.42,.12,.42);
		glow('#fbc990',x,2.57,kioskZ+.94,.26,.43,.26);
	}
	// Wrapped parcels and a paper notice, no DOM text textures needed.
	for(let i=0;i<5;i++)detail(['#b6a78c','#9386a2','#a58579'][i%3],kioskX-1.5+i*.55,1.34,kioskZ-.93,.35,.18,.25,(i-2)*.11);
	detail('#b9ac98',kioskX+.4,1.82,kioskZ-1.085,1.1,.55,.03);
	for(let i=0;i<3;i++)detail('#7a7073',kioskX+.4,1.97-i*.14,kioskZ-1.062,.76,.027,.018);

	function bench(x:number,z:number){
		for(const side of [-1,1])solid('#4a4955',x+side*.9,.22,z,.15,.44,.56);
		solid('#a6846f',x,.48,z,2.55,.14,.62);
		solid('#856b63',x,.88,z+.26,2.55,.46,.12);
	}
	// Seats look south/east over the edge; leave the marked x=-103 path open.
	bench(-106.25,44.45);
	bench(-99.75,44.45);
	const rockColors=['#55586d','#666a7d','#454e64'];
	for(let i=0;i<10;i++){
		const x=-111+i*1.7,z=42.65+(i%3)*.28,h=.55+(i%4)*.28,w=.76+(i%3)*.23,d=.7;
		// Small angular outcrops are decoration around a low, visibly solid boundary.
		solid(rockColors[i%3],x,h*.23,z,w,.46*h,d);
		add('rock','matte',rockColors[i%3],x,h*.55,z,w*1.15,h,d*1.18,i*.71);
	}

	// Layered pine silhouettes on both sides of the approach, behind the station and along
	// the outer west perimeter. Crown radii never cross the track/shelter reserved band.
	let seed=0x970f;
	const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
	function pine(x:number,z:number,h:number){
		solid('#64595a',x,h*.26,z,.34,h*.52,.34);
		for(let i=0;i<3;i++)add('pine','matte',['#2b474d','#35555a','#466871'][i],x,h*(.45+i*.17),z,h*(.57-i*.12),h*.5,h*(.57-i*.12),rand()*Math.PI);
	}
	for (let i=0;i<19;i++){
		const x=-151+(i%7)*8.4+rand()*2,z=68.7+Math.floor(i/7)*4.1+rand()*1.2;
		pine(x,z,4.1+rand()*2.6);
	}
	for(const [x,z,h] of [[-150,45.6,6.2],[-148.4,51.1,5.1],[-145.5,47.8,6.9],[-142.9,52.4,4.7],[-135,52.2,4.5],[-120,52.1,4.3],[-114,52.4,4.3],[-102,52.4,4.6],[-95.9,52.7,4.1]])pine(x,z,h);

	// Small grass brushes leave the view towards the river open. No movement or physics cost.
	for(let i=0;i<150;i++){
		const x=-152+rand()*58,z=i%2?66.3+rand()*12:42.45+rand()*11.4;
		if((Math.abs(x+128)<2.2 && z>46)||(z>45.6&&z<48.6&&x>-130)||(x>-110&&x<-96&&z<45.6)||(x>-140.4&&x<-134.6&&z>46.9&&z<50.5))continue;
		for(let blade=0;blade<2;blade++){
			const h=.14+rand()*.27;
			add('reed','matte',['#45595e','#536970','#697579'][i%3],x+(blade-.5)*.12,h*.42,z,.04,h,.027,rand()*Math.PI,(blade-.5)*.62);
		}
		if(i%13===0)glow('#b4d7d0',x,.25,z,.06,.06,.06);
	}

	const geos:Record<Shape,THREE.BufferGeometry>={box:new THREE.BoxGeometry(),pine:new THREE.ConeGeometry(.5,1,7),rock:new THREE.IcosahedronGeometry(.5,0),reed:new THREE.ConeGeometry(.5,1,3)};
	const mats:Record<Shade,THREE.Material>={matte:new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.92}),light:new THREE.MeshBasicMaterial({color:'#ffffff'})};
	const brush=new THREE.Object3D(), color=new THREE.Color();
	for(const [key,parts] of batches){
		const [shape,shade]=key.split('-') as [Shape,Shade];
		const mesh=new THREE.InstancedMesh(geos[shape],mats[shade],parts.length);
		mesh.name=`Moonbank ${key}`;
		mesh.castShadow=shade==='matte'&&shape!=='reed';
		mesh.receiveShadow=shade==='matte';
		parts.forEach((p,i)=>{
			brush.position.set(p.x,p.y,p.z);brush.rotation.set(0,p.yaw,p.lean);brush.scale.set(p.w,p.h,p.d);brush.updateMatrix();
			mesh.setMatrixAt(i,brush.matrix);mesh.setColorAt(i,color.set(p.color));
		});
		mesh.computeBoundingSphere();
		root.add(mesh);
	}
	return blocks;
}
