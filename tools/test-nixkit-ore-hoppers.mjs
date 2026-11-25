import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import * as THREE from 'three';

// All geometry, save loading, routing and interaction logic is real. Only model
// fetching and the browser environment are stubbed; no renderer is needed.
const hooks = registerHooks({resolve(specifier, ctx, next) {
	if (specifier === 'three/examples/jsm/loaders/GLTFLoader.js')
		return { url: 'data:text/javascript,export class GLTFLoader {loadAsync(){return new Promise(()=>{});}}', shortCircuit: true };
	// Keep the game-rule fixture synchronous; the real network store has separate tests.
	if (/\/src\/lib\/island\//.test(ctx.parentURL ?? '') && specifier === './save')
		return { url: new URL('./fixtures/island-save.mjs', import.meta.url).href, shortCircuit: true };
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
}});
const { createPower, ORE_HOPPER } = await import('../src/lib/island/power.ts');
const { terrainAt } = await import('../src/lib/island/terrain.ts');
hooks.deregister();

const powerKey = 'island-power';
const hopper = { x: 14.5, z: 10, yaw: 0 };
const formerSite = { x: 14.5, z: 4.2, yaw: 0 };
const veins = [
	{ id: 'vein-0', x: 14.5, y: terrainAt(14.5, -0.5) - 0.15, z: -0.5 },
	{ id: 'vein-1', x: 14.5, y: terrainAt(14.5, 5.5) - 0.15, z: 5.5 },
];
const beltRun = (z) => Array.from({ length: 3 }, (_, i) => [14, z + i, 0]);
const belts = [...beltRun(7), ...beltRun(1)];
const windmills = [{ x: 14.5, z: 0 }];
const drill = (vein, flight = [], stored = 0) => ({ vein, yaw: 0, from: 10_000, stored, flight });

function fixture(t, initial, startingItems = {}, withAim = false) {
	const saved = new Map([[powerKey, JSON.stringify(initial)]]);
	const oldDocument = globalThis.document;
	const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	globalThis.document = { querySelector: () => null };
	Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
		getItem: (key) => saved.get(key) ?? null,
		setItem: (key, value) => saved.set(key, value),
	}});
	t.after(() => {
		if (oldDocument === undefined) delete globalThis.document;
		else globalThis.document = oldDocument;
		if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
		else delete globalThis.localStorage;
	});
	let now = 10_000, open = true, aim = { mode: 'facing' };
	t.mock.method(Date, 'now', () => now);
	const bag = new Map(Object.entries(startingItems));
	const definitions = new Map(), denied = new Set(), picked = [];
	const inventory = {
		register(def) { definitions.set(def.id, def); }, render() {}, count: (id) => bag.get(id) ?? 0,
		add(id, amount = 1) {
			if (denied.has(id)) return false;
			bag.set(id, inventory.count(id) + amount);
			return true;
		},
		remove(id, amount = 1) {
			if (inventory.count(id) < amount) return false;
			bag.set(id, inventory.count(id) - amount);
			return true;
		},
	};
	const ripe = new Map(veins.map((v) => [v.id, 1e9]));
	const regrowMs = 1_000_000;
	const init = () => {
		const scene = new THREE.Scene(), pos = new THREE.Vector3(), features = [];
		const power = createPower({
			scene, renderer: { init: () => new Promise(() => {}) }, toon: (p) => new THREE.MeshStandardMaterial(p),
			inventory, pos, figure: { group: new THREE.Group(), node: () => null }, modelUrl: '', ore: { id: 'ore', color: '#b79771' },
			veins: { veins: () => veins, ripeAt: (id) => ripe.get(id), take: (id, at) => ripe.set(id, at + regrowMs), regrowMs },
			hopper, ...(withAim ? { aim: () => aim } : {}), groundAt: terrainAt, addFeature(feature) { features.push(feature); }, removeFeature() {}, canAct: () => true, canCarry: () => true, toast() {},
			open: () => open, openForBelt: () => open, selectBuild: (kind) => (picked.push(kind), true),
		});
		return { power, scene, features, at: ({x,z}) => pos.set(x, terrainAt(x, z), z) };
	};
	return {
		init, read: () => JSON.parse(saved.get(powerKey)), count: inventory.count, ready: (...ids) => ids.forEach((id) => ripe.set(id, now)),
		advance: (ms) => (now += ms), setAim: (next) => (aim = next), allowBuild: (value) => (open = value), definitions, picked, denied,
	};
}

test('removing old fixed receiver conserves old flight once, while a valid forge line stays in flight', (t) => {
	const f = fixture(t, { windmills, drills: [drill('vein-0',[9_500,21_000],3), drill('vein-1',[20_000])], belts, hopper: 97 });
	const {power, scene, at} = f.init();
	assert.equal(scene.getObjectByName('Old ore receiver'), undefined);
	assert.ok(scene.getObjectByName('Forge ore hopper'));
	assert.equal(power.hoppers(), 0);
	assert.equal(f.read().hopper, 99);
	assert.deepEqual(f.read().drills.map(d => d.flight), [[],[20_000]]);
	assert.equal(f.read().drills[0].stored, 3);
	assert.deepEqual(f.read().windmills, windmills);
	assert.deepEqual(f.read().belts, belts);
	assert.deepEqual(Object.keys(f.read()).sort(), ['belts', 'drills', 'hopper', 'windmills']);
	at(formerSite);
	assert.equal(power.offer(), null);
	const reloaded = f.init();
	assert.equal(f.read().hopper, 99);
	f.advance(10_500);
	reloaded.power.update(2,0);
	assert.equal(f.read().hopper, 100, 'overflow recovery must never discard mined ore');
	reloaded.at(hopper);
	reloaded.power.offer().go();
	assert.equal(f.count('ore'), 100);
	assert.equal(f.read().hopper, 0);
	reloaded.at(veins[0]);
	reloaded.power.offer().go();
	assert.equal(f.count('ore'), 103, 'the old drill bin retains all three lumps after reload');
	assert.equal(f.read().drills[0].stored, 0);
	assert.deepEqual(f.read().belts, belts);
});

test('E builds the aimed hopper, routes deliver once from each line and Q recovers the built hopper', (t) => {
	const f = fixture(t, { windmills, drills: veins.map(v=>drill(v.id)), belts, hopper: 2 }, { [ORE_HOPPER]: 1 });
	f.ready('vein-0','vein-1');
	const {power, scene, at} = f.init();
	const aim = { x: formerSite.x, z: formerSite.z-2.2 };
	at(aim);
	f.definitions.get(ORE_HOPPER).actions[0].run();
	assert.deepEqual(f.picked, [ORE_HOPPER], 'inventory routes through the same unified build mode');
	assert.equal(power.select(ORE_HOPPER), true);
	f.allowBuild(false);
	power.update(.01,0);
	assert.match(power.buildOffer().label,/No room/);
	assert.equal(power.buildOffer().go, undefined);
	assert.equal(f.count(ORE_HOPPER),1);
	f.allowBuild(true);
	power.update(.01,0);
	const install = power.buildOffer().go;
	assert.match(power.buildOffer().label, /Build ore hopper/);
	install();
	install();
	assert.equal(power.hoppers(),1);
	assert.equal(f.count(ORE_HOPPER),0);
	assert.ok(scene.getObjectByName('Built ore hopper'));
	assert.equal(f.read().hoppers.length,1);
	assert.ok(Math.abs(f.read().hoppers[0].z-formerSite.z)<1e-10);
	assert.deepEqual(f.read().drills.map(d=>d.flight.length),[1,1]);
	f.advance(3000);
	power.update(2,3);
	assert.equal(f.read().hopper,4);
	power.stop();
	at(formerSite);
	assert.match(power.offer().label,/Collect ore \(4\)/);
	power.offer().go();
	assert.equal(f.count('ore'),4);
	at(hopper);
	assert.match(power.offer().label,/empty/);
	const reload=f.init();
	assert.equal(reload.power.hoppers(),1);
	assert.ok(reload.scene.getObjectByName('Built ore hopper'));
	reload.at(aim);
	assert.equal(reload.power.select(ORE_HOPPER),true,'empty bag still allows Q in this mode');
	reload.power.update(.01,0);
	assert.equal(reload.power.buildOffer().go,undefined,'E must not remove');
	assert.equal(reload.power.takeBuild(ORE_HOPPER),true);
	assert.equal(reload.power.hoppers(),0);
	assert.equal(f.count(ORE_HOPPER),1);
	assert.equal(f.read().hoppers,undefined);
	assert.equal(reload.power.takeHopper(),false);
	reload.at({x:hopper.x,z:hopper.z-2.2});
	assert.equal(reload.power.takeHopper(),false,'the forge hopper is permanent');
});

test('Q recovers drill and ore without dropping either when there is no room', (t) => {
	const f = fixture(t, { windmills: [], drills: [drill('vein-0',[],2)], belts: [], hopper: 0 });
	const {power,at} = f.init();
	at(veins[0]);
	assert.equal(power.select('drill'),true);
	assert.match(power.buildOffer().label,/Take back the drill \(Q\)/);
	assert.equal(power.buildOffer().go,undefined);
	f.denied.add('ore');
	assert.equal(power.takeBuild('drill'),false);
	assert.equal(f.count('drill'),0);
	assert.equal(f.read().drills[0].stored,2);
	f.denied.clear();
	assert.equal(power.takeBuild('drill'),true);
	assert.equal(f.count('drill'),1);
	assert.equal(f.count('ore'),2);
	assert.deepEqual(f.read().drills,[]);
});

test('dismantling a built receiver safely settles its in-flight stock, once', (t) => {
	const f = fixture(t, { windmills, drills: [drill('vein-0',[20_000,21_000])], belts, hopper: 2, hoppers: [formerSite] });
	const {power, at} = f.init();
	assert.deepEqual(f.read().drills[0].flight,[20_000,21_000], 'a valid saved route retains its arrival times');
	at({x:formerSite.x,z:formerSite.z-2.2});
	assert.equal(power.select(ORE_HOPPER),true);
	assert.equal(power.takeBuild(ORE_HOPPER),true);
	assert.equal(f.read().hopper,4);
	assert.deepEqual(f.read().drills[0].flight,[]);
	const reloaded=f.init();
	f.advance(11_000);
	reloaded.power.update(2,0);
	assert.equal(f.read().hopper,4);
});

test('E never removes occupied belt or windmill; Q can recover either with an empty bag', (t) => {
	const f = fixture(t, { windmills, drills: [], belts, hopper: 0 });
	const {power, at} = f.init();
	at(windmills[0]);
	assert.equal(power.offer(),null);
	assert.equal(power.select('windmill'),true);
	assert.match(power.buildOffer().label,/windmill \(Q\)/);
	assert.equal(power.buildOffer().go,undefined);
	assert.equal(power.takeBuild('windmill'),true);
	assert.equal(f.count('windmill'),1);
	assert.deepEqual(f.read().windmills,[]);
	assert.equal(power.select('belt'),true);
	assert.match(power.buildOffer().label,/belt back \(Q\)/);
	assert.equal(power.buildOffer().go,undefined);
	assert.equal(power.takeBuild('belt'),true);
	assert.equal(f.count('belt'),1);
	assert.equal(f.read().belts.length,belts.length-1);
});

const mouse = (x, z, kind = 'surface', lift = 0) => ({ mode: 'mouse', hit: { x, y: terrainAt(x,z) + lift, z, kind } });
const emptyPower = { windmills: [], drills: [], belts: [], hopper: 0 };

test('pointer hopper targets the real hit, rejects miss/blocked/distant hits, and Q follows cursor', (t) => {
	const f = fixture(t, emptyPower, { [ORE_HOPPER]: 1 }, true);
	const {power, at} = f.init();
	at({x:14.5,z:4});
	assert.equal(power.select(ORE_HOPPER),true);
	f.setAim(mouse(16.3, 4.15));
	const stale = power.buildOffer().go;
	assert.equal(typeof stale,'function');
	for (const aim of [{mode:'mouse',hit:null}, mouse(16.3,4.15,'blocked'), mouse(24.3,4.15), mouse(16.3,4.15,'surface',1.5)]) {
		f.setAim(aim);
		assert.equal(power.buildOffer().go,undefined);
		stale();
		assert.equal(power.hoppers(),0);
		assert.equal(f.count(ORE_HOPPER),1);
	}
	f.setAim(mouse(16.3,4.15));
	power.buildOffer().go();
	assert.deepEqual(f.read().hoppers.map(({x,z})=>[x,z]),[[16.3,4.15]],'the aimed world position wins over character facing');
	f.setAim({mode:'mouse',hit:null});
	assert.equal(power.takeBuild(ORE_HOPPER),false);
	f.setAim(mouse(16.3,4.15,'blocked',0.7));
	assert.equal(power.buildOffer().go,undefined);
	assert.equal(power.takeBuild(ORE_HOPPER),true);
	assert.equal(power.hoppers(),0);
	f.setAim({mode:'facing'});
	power.buildOffer().go();
	assert.deepEqual(f.read().hoppers.map(({x,z})=>[x,z]),[[14.5,6.2]],'touch/facing still builds in front of her');
});

test('pointer belt snaps to cursor cell while heading supplies belt orientation; only a surface counts', (t) => {
	const f = fixture(t,emptyPower,{belt:2},true);
	const {power,at}=f.init();
	at({x:14.5,z:4});
	assert.equal(power.select('belt'),true);
	f.setAim(mouse(16.95,4.17,'blocked'));
	assert.equal(power.buildOffer().go,undefined);
	f.setAim(mouse(16.95,4.17));
	power.buildOffer().go();
	assert.deepEqual(f.read().belts,[[16,4,0]],'+z direction comes from facing, not the eastward mouse ray');
	f.setAim(mouse(16.95,4.17,'surface',0.14));
	assert.match(power.buildOffer().label,/Take the belt back/);
	assert.equal(power.takeBuild('belt'),true);
	assert.deepEqual(f.read().belts,[]);
});

test('pointer drills only snap close to a pointed vein in player reach and Q cannot remove a nearby unpointed drill', (t) => {
	const f = fixture(t,emptyPower,{drill:2},true);
	const {power,at,features}=f.init();
	at({x:14.5,z:2});
	assert.equal(power.select('drill'),true);
	f.setAim(mouse(14.5,5.5));
	assert.equal(power.buildOffer().go,undefined,'aimed vein is too far from player');
	f.setAim(mouse(14.5,1));
	assert.equal(power.buildOffer().go,undefined,'aimed ground is not close enough to a vein');
	f.setAim(mouse(14.5,-0.5,'blocked',0.35));
	assert.equal(power.buildOffer().go,undefined,'occluding solid cannot install free drill');
	f.setAim(mouse(14.5,-0.5,'surface',0.65));
	power.buildOffer().go();
	assert.deepEqual(f.read().drills.map(d=>d.vein),['vein-0']);
	at(veins[0]);
	f.setAim(mouse(17.5,-0.5));
	assert.equal(power.takeBuild('drill'),false);
	f.setAim(mouse(14.5,-0.5,'blocked',0.15));
	assert.equal(power.takeBuild('drill'),false,'an unrelated collider at the vein center is not a drill component');
	const leg = features.find(feature => feature.r === 0.15);
	f.setAim(mouse(leg.x,leg.z,'blocked'));
	assert.match(power.buildOffer().label,/Take back the drill/);
	assert.equal(power.takeBuild('drill'),true);
	assert.deepEqual(f.read().drills,[]);
});

test('pointer windmill places on dry high ground and never falls back to the nearby machine on Q', (t) => {
	const f = fixture(t,emptyPower,{windmill:1},true);
	const {power,at}=f.init();
	at({x:14.5,z:4});
	assert.equal(power.select('windmill'),true);
	f.setAim(mouse(17.4,4.1));
	power.buildOffer().go();
	assert.deepEqual(f.read().windmills,[{x:17.4,z:4.1}]);
	at({x:17.4,z:4.1});
	f.setAim({mode:'mouse',hit:null});
	assert.equal(power.takeBuild('windmill'),false);
	f.setAim(mouse(17.4,4.1,'blocked',2.4));
	assert.match(power.buildOffer().label,/Take back the windmill/);
	assert.equal(power.takeBuild('windmill'),true);
	assert.deepEqual(f.read().windmills,[]);
});
