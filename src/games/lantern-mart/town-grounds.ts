import * as THREE from 'three';
import { TOWN, trails, townGround, type TownBlock } from './town-layout';

export function buildTownGrounds(scene:THREE.Scene) {
	const group=new THREE.Group();
	group.name='Lantern Town · continuous terraces and paths';
	scene.add(group);
	const mats={
		stone:new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.94}),
		prop:new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.89}),
		glow:new THREE.MeshBasicMaterial({color:'#ffffff'}),
	};
	const geo = new THREE.PlaneGeometry(125,136,125,136);
	geo.rotateX(-Math.PI/2);
	geo.translate(0,0,49);
	const attr=geo.attributes.position;
	const low=new THREE.Color('#363d55'), park=new THREE.Color('#35434d'), shade=new THREE.Color('#262c43');
	const color=new THREE.Color(), colors=new Float32Array(attr.count*3);
	for(let i=0;i<attr.count;i++){
		const x=attr.getX(i),z=attr.getZ(i);
		attr.setY(i,townGround(x,z)-.018);
		const grad=Math.min(1,Math.max(0,(z-43)/58));
		const noise=(Math.sin(x*1.6+Math.sin(z))*.4+Math.cos(z*1.73+x*.1)*.6+1)/2;
		color.copy(low).lerp(park,grad).lerp(shade,.13+noise*.19);
		color.toArray(colors,i*3);
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors,3));geo.computeVertexNormals();
	const terrain=new THREE.Mesh(geo,mats.stone);terrain.receiveShadow=true;group.add(terrain);
	function strip(a:readonly[number,number],b:readonly[number,number],w:number,y:number,palette:string[]) {
		const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),steps=Math.ceil(length/.9), vs=[],cs=[],indices=[];
		const nX=-dz/length,nZ=dx/length;
		for(let i=0;i<=steps;i++) {
			const cx=a[0]+dx*(i/steps),cz=a[1]+dz*(i/steps);
			for(const offset of [-.5,.5]){
				const x=cx+nX*w*offset,z=cz+nZ*w*offset;
				vs.push(x,townGround(x,z)+y,z);
				cs.push(...new THREE.Color(palette[(Math.floor(i/3)+(offset>0?1:0))%palette.length]).toArray());
			}
			const k=i*2;if(i<steps)indices.push(k,k+1,k+2,k+1,k+3,k+2);
		}
		const g=new THREE.BufferGeometry();
		g.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));
		g.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));g.setIndex(indices);g.computeVertexNormals();
		const m=new THREE.Mesh(g,mats.stone);m.receiveShadow=true;group.add(m);
	}
	for (const [i,[a,b]] of trails.entries()){
		const w=i===0?7.2:i===1||i===4?4.75:3.5;
		// Give the paved centre a visible edge; all junctions are level and crossable.
		strip(a,b,w+.48,.012,['#40425a','#50506a']);
		strip(a,b,w,.024+i*.001,['#454a62','#545672','#4c4f67']);
	}
	const paint: Array<{x:number;y:number;z:number;w:number;h:number;d:number;c:string;glow:boolean}>=[];
	const blocks: TownBlock[]=[];
	const add=(x:number,z:number,w:number,h:number,d:number,c:string,y:number,glow=false)=>{
		paint.push({x,y,z,w,h,d,c,glow});
	};
	for(let z=19;z<111;z+=9.6){
		if([32,39,58,65].some(j=>Math.abs(z-j)<1.2))continue;
		for(const x of [-4.25,4.25]) {
			const h=townGround(x,z);
			add(x,z,.27,3.85,.27,'#414966',h+1.84);
			add(x,z,.44,.32,.44,'#53607a',h+.17);
			add(x,z,.63,.58,.63,'#504357',h+3.79);
			add(x,z+.031,.46,.36,.65,z>72?'#c4d1af':'#ffd098',h+3.79,true);
			add(x,z,.77,.13,.77,'#39364b',h+4.13);
			add(x,z,1.95,.023,1.95,z>72?'#5b6f68':'#816368',h+.05);
			blocks.push({x,z,w:.44,d:.44,bottom:h,top:h+4});
		}
	}
	for (const [x,z,w,d] of [[-6.5,24,2.5,6],[6.35,49,2.8,6],[-6.2,47,2.6,7],[6.65,74,2.5,5]] as const){
		const y=townGround(x,z);
		add(x,z,w,.52,d,'#546071',y+.23);
		add(x,z,w-.14,.11,d-.14,'#394f53',y+.5);
		blocks.push({x,z,w,d,bottom:y,top:y+.58});
	}
	for(let i=0;i<15;i++){
		const x=-61+i*8.6,z=-28-(i%3)*3,h=6+(i*11%13);
		add(x,z,8,h,7,['#333950','#30374d','#38425d'][i%3],h*.5);
		for(let j=0;j<4;j++)add(x-2.4+j*1.6,z+3.52,.48,.63,.04,j%3===0?'#9d7e84':'#6c7a99',h*.62+(j%2)*1.6,true);
	}
	for(let i=0;i<20;i++){
		const side=i%2?1:-1,x=side*(57+i%3*2.3),z=11+i*5.2;
		if(side<0&&z>21&&z<79)continue;
		const h=townGround(x,z),height=1.05+i%3*.13;
		add(x,z,3.5,height,4.9,'#414857',h+height*.5-.1);
	}
	// Northern ridge continues past the play area. The skyline is visible without extra textures.
	const ridge=new THREE.BufferGeometry();
	const xy=[],tri=[];
	for(let i=0;i<19;i++){
		const x=-95+i*11;
		xy.push(x,1,138,x,12+Math.sin(i*.93)*5+Math.cos(i*.43)*3,138);
		if(i<18){const j=i*2;tri.push(j,j+2,j+1,j+1,j+2,j+3);}
	}
	ridge.setAttribute('position',new THREE.Float32BufferAttribute(xy,3));ridge.setIndex(tri);
	group.add(new THREE.Mesh(ridge,new THREE.MeshBasicMaterial({color:'#394461',side:THREE.DoubleSide})));
	for(const [index,[x,z,rotation,words]] of [
		[1,[3.18,15.45,Math.PI,['등불마을','LANTERN TOWN']]],
		[2,[2.95,33.7,-Math.PI/2,['물빛시장','WATERSIDE']]],
		[3,[-2.94,40.7,Math.PI/2,['등불역','STATION']]],
		[4,[2.94,68,Math.PI,['별바람 전망대','STARWIND LOOKOUT']]],
	] as const){
		const yy=townGround(x,z);
		add(x,z,.13,2.26,.13,'#5d596e',yy+1.13);
		blocks.push({x,z,w:.14,d:.14,bottom:yy,top:yy+2.45});
		// Sign material is made locally, so no image fetch or font dependency.
		const sheet=document.createElement('canvas');
		sheet.width=420;sheet.height=114;const ctx=sheet.getContext('2d');
		if(!ctx)continue;
		ctx.fillStyle=index===2?'#3e4e61':index===3?'#4b405d':'#36505c';ctx.fillRect(0,0,420,114);
		ctx.strokeStyle='#c9ad91';ctx.lineWidth=3;ctx.strokeRect(10,10,400,94);
		ctx.fillStyle='#ffe4ae';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.font='650 38px system-ui,sans-serif';ctx.fillText(words[0],210,43,368);
		ctx.font='600 21px system-ui,sans-serif';ctx.fillText(words[1],210,82,368);
		const map=new THREE.CanvasTexture(sheet);map.colorSpace=THREE.SRGBColorSpace;
		const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.35,.64),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));
		sign.position.set(x,yy+2.16,z);sign.rotation.y=rotation;group.add(sign);
	}
	const piece=new THREE.BoxGeometry(1,1,1),o=new THREE.Object3D();
	for(const light of [false,true]){
		const rows=paint.filter(b=>b.glow===light);
		const mesh=new THREE.InstancedMesh(piece,light?mats.glow:mats.prop,rows.length);
		rows.forEach((b,i)=>{
			o.position.set(b.x,b.y,b.z);o.scale.set(b.w,b.h,b.d);o.updateMatrix();
			mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,new THREE.Color(b.c));
		});
		mesh.computeBoundingSphere();group.add(mesh);
	}
	return blocks;
}
