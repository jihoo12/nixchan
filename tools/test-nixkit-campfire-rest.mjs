import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/.test(s)?s+'.ts':s,c);}});
const {campfireLogLayout,createCampfireRest,restGround}=await import('../src/lib/island/campfire-rest.ts');
const {planIsland}=await import('../src/lib/island/layout.ts');
const {terrainAt}=await import('../src/lib/island/terrain.ts');
const {CAMP}=planIsland();
const seats=campfireLogLayout(CAMP.x,CAMP.z,terrainAt);
const features=[{...CAMP,r:.85}];
for(const s of seats)for(const d of [-.55,.55]){
 const x=s.x+d*s.axisX,z=s.z+d*s.axisZ,base=terrainAt(x,z);
 features.push({x,z,r:.5,dome:{base,top:Math.max(.26,s.y+s.slope*d-base)}});
}
let blocked=false, blocker=null, airborne=false;
const world={
 inside:()=>true,
 ceilingAt:()=>Infinity,
 nearby:()=>blocked?[...features,blocker]:features,
 groundAt(x,z){
  let g=terrainAt(x,z);
  for(const f of features)if(f.dome){
   const p=((x-f.x)**2+(z-f.z)**2)/f.r**2;
   if(p<1)g=Math.max(g,f.dome.base+f.dome.top*Math.sqrt(1-p));
  }
  return g;
 },
};

test('both actual logs have dry approaches clear of the fire and physically supported cylinders',()=>{
 assert.equal(seats.length,2);
 for(const s of seats){
  const floor=world.groundAt(s.sx,s.sz);
  assert.equal(restGround(world,terrainAt,s.sx,s.sz,floor),floor);
  assert.ok(s.y-floor>.34 && s.y-floor<.48);
  assert.ok(Math.hypot(s.sx-CAMP.x,s.sz-CAMP.z)>1.4);
  const o=new T.Mesh(new T.CylinderGeometry(s.radius,s.radius,s.length,8),new T.MeshBasicMaterial({side:T.DoubleSide}));
  o.position.set(s.x,s.middle,s.z);
  o.rotation.set(0,-s.bearing+Math.PI/2,Math.PI/2);
  o.quaternion.premultiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(s.axisX,0,s.axisZ),
    new T.Vector3(s.axisX,s.slope,s.axisZ).normalize()));
  o.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(s.x,s.y+1,s.z),new T.Vector3(0,-1,0));
  const hit=ray.intersectObject(o)[0].point.y;
  assert.ok(Math.abs(hit-s.y)<.004,[hit,s.y].join(', '));
  for(const end of [-.85,.85]){
   const x=s.x+s.axisX*end,z=s.z+s.axisZ*end;
   const lower=s.middle+s.slope*end-s.radius;
   assert.ok(lower<terrainAt(x,z)+.025,'logs cannot float above local ground');
  }
 }
});

async function rig(){
 const restore=[globalThis.self,globalThis.createImageBitmap];
 globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
 let gl;
 try{
  const a=await readFile(new URL('../src/assets/nixchan/nixchan-3d.glb',import.meta.url));
  gl=await new GLTFLoader().parseAsync(a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength),'');
 }finally{
  for(const [i,k] of ['self','createImageBitmap'].entries())if(restore[i]===undefined)delete globalThis[k];else globalThis[k]=restore[i];
 }
 const root=new T.Group(),group=new T.Group();
 root.add(group);group.add(gl.scene);
 const m=new T.AnimationMixer(gl.scene);
 const names=['Idle','Walk','Sit'], acts=names.map(n=>m.clipAction(gl.animations.find(a=>a.name===n)).play());
 const weights=[1,0,0];let current=0;
 const figure={
  group,node:name=>gl.scene.getObjectByName(name),setBlink(){},
  play(name,speed=1){current=names.indexOf(name);acts[current].setEffectiveTimeScale(speed);},
  tick(dt){for(let i=0;i<acts.length;i++){
   weights[i]+=((i===current?1:0)-weights[i])*(1-Math.exp(-5*dt));acts[i].setEffectiveWeight(weights[i]);
  }m.update(dt);root.updateMatrixWorld(true);},
 };
 figure.tick(0);
 const person={root,figure,pos:new T.Vector3(),vel:new T.Vector3(),turn:0,
  get grounded(){return !airborne;},swimming:false,dashing:false,
  face(yaw){this.turn=yaw;},clearGesture(){},
 };
 return person;
}
function position(p,s,off=.28){
 p.pos.set(s.sx+off*s.axisX,terrainAt(s.sx+off*s.axisX,s.sz+off*s.axisZ),s.sz+off*s.axisZ);
 p.root.position.copy(p.pos);p.face(s.facing+.75);p.figure.group.rotation.y=p.turn;
 p.root.updateMatrixWorld(true);
}
const V=()=>new T.Vector3();
function minY(o){let low=Infinity;const v=V();for(let i=0;i<o.geometry.attributes.position.count;i++){
 o.getVertexPosition(i,v);o.localToWorld(v);low=Math.min(low,v.y);
}return low;}
function footStatus(o,terrain){
 const v=V();let low=Infinity;
 for(let i=0;i<o.geometry.attributes.position.count;i++){
  o.getVertexPosition(i,v);o.localToWorld(v);
  low=Math.min(low,v.y-terrain(v.x,v.z));
 }
 return low;
}

test('real rig approaches and turns, plants both boots while resting, and gets up without moving the saved player',async()=>{
 const player=await rig();
 let available=true;
 const ctrl=createCampfireRest({ world,terrain:terrainAt,seats,player,available:()=>available,reduced:()=>false });
 const stats=[];
 for(const s of seats){
  position(player,s);
  const at=player.pos.clone();
  available=false;assert.equal(ctrl.offer(),null);available=true;
  airborne=true;assert.equal(ctrl.offer(),null);airborne=false;
  assert.match(ctrl.offer().label,/Sit/);
  ctrl.offer().go();
  assert.equal(ctrl.phase,'approach');
  assert.ok(player.pos.distanceTo(at)<1e-7,'no initial snap');
  const boots=['KneeLRubber','KneeRRubber'].map(n=>player.figure.node(n));
  const feet=['FootL','FootR'].map(n=>player.figure.node(n));
  let soles=Infinity, minAt={}, phaseMin={};
  const frames=(count,move=false)=>{
   for(let i=0;i<count;i++){
    ctrl.update(1/60,i/60,move);
    player.root.updateMatrixWorld(true);
    if(ctrl.active)for(const boot of boots){
      const low=footStatus(boot,terrainAt);
      phaseMin[ctrl.phase]=Math.min(phaseMin[ctrl.phase]??Infinity,low);
      if(low<soles){soles=low;minAt={phase:ctrl.phase,i,boot:boot.name};}
    }
   }
  };
  frames(140,true);
  assert.equal(ctrl.phase,'seated','held movement before seating must not cancel immediately');
  assert.ok(Math.abs(player.pos.x-s.sx)<1e-7&&Math.abs(player.pos.z-s.sz)<1e-7);
  const body=minY(player.figure.node('Body')), hips=player.figure.node('Hips').getWorldPosition(V());
  assert.ok(Math.abs(body-s.y)<.035,`seat support ${body} vs ${s.y}`);
  const settled=feet.map(o=>o.getWorldPosition(V()));
  frames(30,true);assert.equal(ctrl.phase,'seated');
  feet.forEach((o,i)=>assert.ok(o.getWorldPosition(V()).distanceTo(settled[i])<.002,'ankles stay planted while resting'));
  blocked=true;blocker={x:s.sx,z:s.sz,r:.8};
  assert.equal(ctrl.stand(),false);assert.equal(ctrl.phase,'seated');blocked=false;
  const before=player.pos.clone();
  frames(2,false);frames(1,true);
  assert.equal(ctrl.phase,'rise');frames(60);
  assert.equal(ctrl.active,false);
  assert.ok(player.pos.distanceTo(before)<1e-7,'stands in place');
  assert.ok(player.figure.node('Hips').getWorldPosition(V()).y-hips.y>.22);
  assert.ok(phaseMin.seated>-.004 && phaseMin.rise>-.009, 'anchored boot crosses the ground: '+JSON.stringify(phaseMin));
  assert.ok(soles>-.017,'real boots ground clearance: '+JSON.stringify({soles,minAt,phaseMin}));
  stats.push({seat:s.y,hipDrop:player.figure.node('Hips').getWorldPosition(V()).y-hips.y,soleClearance:soles, seatedSole:phaseMin.seated, riseSole:phaseMin.rise, contact:body-s.y});
 }
 console.info('Campfire actual-asset contact',stats);
});

test('a newly blocked ground path cancels the approach without crossing the obstacle',async()=>{
 const player=await rig(), s=seats[0];position(player,s,.48);
 const ctrl=createCampfireRest({world,terrain:terrainAt,seats,player,available:()=>true,reduced:()=>false});
 ctrl.offer().go();
 const prior=player.pos.clone();
 blocked=true;blocker={x:s.sx,z:s.sz,r:.8};
 try{ctrl.update(.03,0,false);assert.equal(ctrl.active,false);assert.ok(player.pos.distanceTo(prior)<1e-7);}
 finally{blocked=false;}
});
