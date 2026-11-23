import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
import * as T from 'three';

registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/.test(s)?s+'.ts':s,c);}});
const {buildLighthouseLookout,lighthouseLookoutPlacement}=await import('../src/lib/island/lookout-landmark.ts');
const {planIsland}=await import('../src/lib/island/layout.ts');
const {scatter}=await import('../src/lib/island/scatter.ts');
const {terrainAt}=await import('../src/lib/island/terrain.ts');
const {addFeature,islandWorld}=await import('../src/lib/island/features.ts');

const scene=new T.Scene(),toon=({color='#ffffff'})=>new T.MeshBasicMaterial({color});
const layout=planIsland();
scatter(scene,toon,layout);
const site=lighthouseLookoutPlacement(layout.LIGHT);
const {eye,stand,yaw}=buildLighthouseLookout(scene,toon,layout.LIGHT);
const out=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)),right=new T.Vector3(-out.z,0,out.x);
const plinth=Array.from({length:12},(_,i)=>terrainAt(layout.LIGHT.x+2.6*Math.cos(i*Math.PI/6),layout.LIGHT.z+2.6*Math.sin(i*Math.PI/6)));
addFeature({...layout.LIGHT,r:2.65,pad:Math.max(terrainAt(layout.LIGHT.x,layout.LIGHT.z),...plinth)+.3});
addFeature({...layout.LIGHT,r:1.5});
scene.updateMatrixWorld(true);

test('lookout eye clears the front lens and actual seeded scenery faces open sea',()=>{
 const point=eye.clone().sub(stand);
 assert.ok(point.dot(out)>2.1);
 assert.ok(Math.abs(point.dot(right))<1e-8);
 assert.ok(point.y>1.7&&point.y<1.9);
 assert.ok(eye.x*out.x+eye.z*out.z>50);
 const ray=new T.Raycaster(eye.clone(),out.clone(),.004,70);
 for(const angle of [-.19,-.095,0,.095,.19]){
  ray.ray.direction.copy(out).applyAxisAngle(new T.Vector3(0,1,0),angle);
  assert.equal(ray.intersectObject(scene,true).length,0,'default sightline hits scenery');
 }
 for(let i=0;i<=36;i++){
  const p=eye.clone().addScaledVector(out,i*.5);
  assert.ok(terrainAt(p.x,p.z)<eye.y-.35);
 }
});

test('worn slate platform has measured support, a ramp-free route and no tower collision',()=>{
 const down=new T.Raycaster(stand.clone().add(new T.Vector3(0,3,0)),new T.Vector3(0,-1,0));
 const hit=down.intersectObject(scene,true)[0];
 assert.ok(Math.abs(hit.point.y-stand.y)<.015);
 assert.ok(Math.abs(islandWorld.groundAt(stand.x,stand.z)-stand.y)<.015);
 const footing=scene.children.find(o=>o.name.includes('seaward telescope'));
 assert.ok(Math.abs(new T.Box3().setFromObject(footing).min.y-site.low)>.25,'base must extend into uneven rock');
 const route=Array.from({length:25},(_,i)=>{
  const p=(24-i)/24;
  return stand.clone().addScaledVector(out,-2.62*p).addScaledVector(right,.69*Math.min(1,p*4));
 });
 let previous;
 for(const p of route){
  const y=islandWorld.groundAt(p.x,p.z);
  assert.ok(islandWorld.inside(p.x,p.z)&&y>1.1);
  assert.ok(Math.hypot(p.x-layout.LIGHT.x,p.z-layout.LIGHT.z)>2.94);
  assert.ok(islandWorld.nearby(p.x,p.z).every(f=>f.dome||f.pad!==undefined||(f.top!==undefined&&y>=f.top)||Math.hypot(p.x-f.x,p.z-f.z)>=f.r+.45));
  if(previous!==undefined)assert.ok(Math.abs(y-previous)<.23);
  previous=y;
 }
});
