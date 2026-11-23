import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PerspectiveCamera,Vector3} from 'three';
import {createLookoutCamera} from '../src/lib/island/lookout-camera.ts';

const V=(...v)=>new Vector3(...v);
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);
function scene(){
 const camera=new PerspectiveCamera(45,16/9,.5,2000);
 const base=V(-1,3,8), focus=V(2,1,-1), eye=V(2,2,0);
 const follow=()=>{camera.position.copy(base);camera.lookAt(focus);};
 const controller=createLookoutCamera(camera);
 const step=(n=1)=>{for(let i=0;i<n;i++){follow();controller.update(1/60);}};
 step();
 return {camera,base,focus,eye,controller,step};
}

test('enters smoothly from the follow view, holds at the outward ray and restores current follow view',()=>{
 const {camera,base,focus,eye,controller:c,step}=scene();
 const original=camera.quaternion.clone(), initialFov=camera.fov;
 assert.equal(c.enter({eye,yaw:0}),true);
 assert.equal(c.phase,'entering');assert.equal(c.looking,true);assert.equal(c.active,true);
 assert.ok(camera.position.equals(base)&&camera.quaternion.equals(original));
 step(1);
 assert.ok(camera.position.distanceTo(base)<.10);
 assert.ok(camera.position.distanceTo(eye)>1);
 assert.ok(camera.fov<initialFov&&camera.fov>31);
 step(30);
 assert.equal(c.phase,'viewing');assert.equal(c.blend,1);
 assert.ok(camera.position.distanceTo(eye)<1e-10);
 assert.ok(camera.getWorldDirection(V()).distanceTo(V(0,0,1))<1e-9);
 close(camera.fov,31);close(camera.near,.09);close(camera.far,2000);
 assert.ok(c.exit());assert.equal(c.phase,'exiting');assert.equal(c.active,true);assert.equal(c.looking,false);
 base.set(-2,4,9);focus.set(2,0,1);
 step(1);assert.ok(camera.position.distanceTo(eye)<.15);
 step(30);
 assert.equal(c.phase,'idle');assert.equal(c.active,false);
 assert.ok(camera.position.distanceTo(base)<1e-10);
 assert.ok(camera.getWorldDirection(V()).distanceTo(focus.clone().sub(base).normalize())<1e-9);
 close(camera.fov,initialFov);close(camera.near,.5);
});

test('optical pan, pitch and magnification are smoothed and bounded without changing the eye or aspect',()=>{
 const {camera,eye,controller:c,step}=scene();
 c.enter({eye,yaw:Math.PI/2,pitch:.08});step(42);
 const d=()=>camera.getWorldDirection(V());
 assert.ok(d().distanceTo(V(Math.cos(.08),Math.sin(.08),0))<1e-9);
 assert.ok(c.look(1000,1000));assert.ok(c.zoom(1000));
 step(1);assert.ok(d().y>Math.sin(.08)&&d().y<Math.sin(.32));assert.ok(camera.fov>15&&camera.fov<31);
 step(100);
 close(Math.atan2(d().x,d().z),Math.PI/2+.66);
 close(Math.asin(d().y),.32);
 close(camera.fov,15);
 assert.ok(camera.position.equals(eye));
 assert.equal(camera.aspect,16/9);
 c.look(-100,-100);c.zoom(-100);
 step(100);close(Math.atan2(d().x,d().z),Math.PI/2-.66);close(Math.asin(d().y),-.30);close(camera.fov,39);
 assert.equal(c.look(Infinity,0),false);assert.equal(c.zoom(NaN),false);
});

test('rotation, projection and aspect restore after a resize mid-look and an interrupted entry',()=>{
 const {camera,base,eye,controller:c,step}=scene();
 c.enter({eye,yaw:Math.PI*.82});
 step(7);
 const before=camera.position.clone();
 c.exit();step(1);
 assert.ok(camera.position.distanceTo(before)<.72,'reversing entry should not snap');
 step(18);assert.ok(camera.position.equals(base));
 c.enter({eye,yaw:-.6});step(36);
 camera.aspect=.58;camera.fov=60;camera.updateProjectionMatrix();
 step(4);
 assert.equal(camera.aspect,.58);
 close(camera.fov,31);
 c.exit();step(30);
 assert.equal(camera.aspect,.58);
 close(camera.fov,60);close(camera.near,.5);
});

test('reduced motion takes effect without a slide and exiting restores even without ongoing follow',()=>{
 const camera=new PerspectiveCamera(56,1,.5,2000);
 camera.position.set(-3,2,5);camera.lookAt(0,1,0);
 const origin=camera.position.clone(), q=camera.quaternion.clone();
 const c=createLookoutCamera(camera,{reduced:()=>true});
 const eye=V(4,2,6);
 assert.ok(!c.enter({eye:V(NaN,0,0),yaw:0}));
 assert.ok(!c.enter({eye,yaw:NaN}));
 assert.ok(c.enter({eye,yaw:.5}));
 c.update(0);
 assert.ok(camera.position.equals(eye));assert.equal(c.blend,1);
 c.look(.2,.1);c.zoom(1);c.update(0);
 assert.ok(camera.fov<31);
 c.exit();c.update(0);
 assert.ok(camera.position.equals(origin));assert.ok(camera.quaternion.equals(q));
 close(camera.fov,56);assert.equal(c.blend,0);assert.equal(c.active,false);
});
