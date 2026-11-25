import * as THREE from 'three';
import { buildNixFigure, type NixClip, type NixFigure } from '../experimental/nix-figure';
import { DEFAULT_OUTFIT, wear } from '../experimental/outfit';
import { lang } from './lang';

type Pose = Extract<NixClip,'Idle'|'Walk'|'Run'|'Swim'|'Tread'>;
type Snapshot = { x:number; y:number; z:number; yaw:number; pose:Pose };
type Peer = Snapshot & { id:string };
type Avatar = { figure:NixFigure; target:THREE.Vector3; yaw:number; pose:Pose; ready:boolean; failed:boolean };
const colours = ['cherry','mint','sky','plum','cream'] as const;
const poses = new Set<Pose>(['Idle','Walk','Run','Swim','Tread']);
const round = (x:number) => Math.round(x*100)/100;
const ko = (en:string, kr:string) => lang === 'ko' ? kr : en;

export function connectIsland(scene:THREE.Scene, model:string, sample:()=>Snapshot|null, button:HTMLButtonElement, status:HTMLElement) {
	const pool: Avatar[] = [];
	const peers = new Map<string,Avatar>();
	const emptyLook = new THREE.Vector2();
	const local = new THREE.Vector3();
	let joined = false, active = true, inflight = false, timeouts = 0;
	let id = crypto.randomUUID();
	let timer: ReturnType<typeof setTimeout>|undefined;
	const liveStatus = (s:string) => { if (status.textContent!==s) status.textContent=s; };
	const paint = () => {
		button.textContent=ko(joined ? 'Leave' : 'Co-op',joined ? '나가기' : '멀티');
		button.setAttribute('aria-pressed',String(joined));
	};
	function remove(key:string) {
		const a=peers.get(key);
		if (!a) return;
		a.figure.group.removeFromParent();
		peers.delete(key);
	}
	function clear() { for (const key of peers.keys()) remove(key); }
	function avatar(p:Peer) {
		let a=pool.find(v=>!v.failed && !Array.from(peers.values()).includes(v));
		if (!a) {
			if (pool.length>=5) return undefined;
			try {
				const figure=buildNixFigure(model);
				const v:Avatar={figure,target:new THREE.Vector3(),yaw:0,pose:'Idle',ready:false,failed:false};
				figure.ready.then(()=>{
					wear(figure,{ ...DEFAULT_OUTFIT,hoodie:colours[pool.indexOf(v)] ?? 'cherry',hat:'none' });
					v.ready=true;
				},()=>{
					v.failed=true;
					pool.splice(pool.indexOf(v),1);
					for(const [key, value] of peers) if(value===v) remove(key);
				});
				pool.push(v);
				a=v;
			} catch { return undefined; }
		}
		peers.set(p.id,a);
		a.target.set(p.x,p.y,p.z);
		a.figure.group.position.copy(a.target);
		a.figure.group.rotation.y=p.yaw;
		a.figure.group.visible=false;
		scene.add(a.figure.group);
		return a;
	}
	const post=(data:object,keepalive=false)=>fetch('/together-api/players',{
		method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive,
		signal:keepalive ? undefined : AbortSignal.timeout(4000)
	});
	function plan(wait:number) {
		if (timer!==undefined) clearTimeout(timer);
		if(joined && active && !document.hidden) timer=setTimeout(()=>{timer=undefined; void refresh();},wait);
	}
	async function refresh() {
		if (!joined||!active||document.hidden) return;
		if (inflight) { plan(300); return; }
		const source=sample();
		if (!source) { plan(650); return; }
		const nowId=id, {x,y,z,yaw,pose}=source;
		inflight=true;
		try {
			const r=await post({id:nowId,x:round(x),y:round(y),z:round(z),yaw,pose});
			if (id!==nowId||!joined||!active||document.hidden) return;
			if (r.status===429) {
				joined=false; clear(); paint();
				liveStatus(ko('The island room is full.','섬에 접속한 사람이 가득 찼어요.'));
				return;
			}
			if(!r.ok)throw Error('Presence unavailable');
			const body=await r.json() as {peers:Peer[]};
			if (id!==nowId||!joined||!active||document.hidden) return;
			const incoming=body.peers.slice(0,5).filter(p=>typeof p.id==='string'&&[p.x,p.y,p.z,p.yaw].every(Number.isFinite)&&poses.has(p.pose));
			const keys=new Set(incoming.map(p=>p.id));
			for(const key of peers.keys()) if(!keys.has(key))remove(key);
			for(const p of incoming) {
				const a=peers.get(p.id)??avatar(p);
				if(!a) continue;
				a.target.set(p.x,p.y,p.z);
				a.yaw=p.yaw;
				a.pose=p.pose;
			}
			timeouts=0;
			liveStatus(incoming.length?ko(`On the island: ${incoming.length+1}`,`함께 있는 인원: ${incoming.length+1}명`):ko('Co-op on · waiting for company','멀티 켜짐 · 친구를 기다리는 중'));
		} catch {
			if(id!==nowId||!joined||!active||document.hidden)return;
			if (++timeouts>=2)clear();
			liveStatus(ko('Co-op reconnecting…','멀티 재연결 중…'));
		} finally {
			inflight=false;
			plan(timeouts ? Math.min(4500,1000*timeouts+600):850);
		}
	}
	function suspend() {
		const leaving=id;
		id=crypto.randomUUID();
		if (timer!==undefined) { clearTimeout(timer); timer=undefined; }
		clear();
		if(joined)void post({id:leaving,leave:true},true).catch(()=>{});
	}
	button.disabled=false;
	paint();
	button.addEventListener('click',()=>{
		if(joined){suspend();joined=false;liveStatus('');}
		else{joined=true;timeouts=0;liveStatus(ko('Joining co-op…','멀티 연결 중…'));plan(0);}
		paint();
		button.blur();
	});
	document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else plan(0);});
	window.addEventListener('pagehide',()=>{active=false;suspend();});
	window.addEventListener('pageshow',()=>{active=true;plan(0);});
	return (dt:number,time:number) => {
		const player=sample();
		if(!joined||!player)return;
		local.set(player.x,player.y,player.z);
		for(const a of peers.values()) {
			const f=a.figure;
			if(f.group.position.distanceToSquared(a.target)>900)f.group.position.copy(a.target);
			else f.group.position.lerp(a.target,1-Math.exp(-5*dt));
			const turn=a.yaw-f.group.rotation.y;
			f.group.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-8*dt));
			f.group.visible=a.ready&&f.group.position.distanceToSquared(local)<110**2;
			if(f.group.visible){
				f.play(a.pose);
				f.tick(dt,time,{airborne:false,look:emptyLook,still:false,jump:null});
			}
		}
	};
}
