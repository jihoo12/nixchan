import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

const file = key => new URL(key, import.meta.url).href;
const mocked = {
	'three/webgpu': "export const WebGPURenderer = globalThis.Renderer;",
	'./figure-nodes': "export const nodeLook = {};",
	'./player': "export const createPlayer = globalThis.mockPlayer;",
};
registerHooks({resolve(specifier, ctx, next) {
	if (ctx.parentURL === file('../src/lib/nixkit/game.ts') && specifier in mocked)
		return {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(mocked[specifier])};
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier))
		return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
}});

let reduced = false, frame, focus, resolveModel;
const events = new Map();
class Element {
	children = [];
	dataset = {};
	style = {};
	attributes = {};
	hidden = false;
	listeners = {};
	classList = {add(){},remove(){}};
	constructor(tag) { this.tag = tag; }
	append(...elements) { this.children.push(...elements); }
	setAttribute(k,v) { this.attributes[k]=v; }
	addEventListener(k,f) { this.listeners[k]=f; }
	querySelector(tag) { return this.children.find(x=>x.tag === tag); }
	closest() { return null; }
	focus() { focus=this; }
	blur() { focus=null; }
	getContext() { return {createLinearGradient: () => ({addColorStop(){}}),fillRect(){}}; }
}
Object.assign(globalThis,{
	Element,
	addEventListener(key, fn) {
		if (!events.has(key)) events.set(key, []);
		events.get(key).push(fn);
	},
	document:{body:new Element('body'),head:new Element('head'),documentElement:new Element('html'),createElement:t=>new Element(t),querySelector:()=>null},
	matchMedia:()=>({ get matches(){ return reduced; } }),
	location:{search:''}, innerWidth:800, innerHeight:600, devicePixelRatio:1,
	Renderer:class { shadowMap={}; backend={}; init(){return Promise.resolve();} setPixelRatio(){} setSize(){} setAnimationLoop(fn){frame=fn;} render(){} },
});
const gestures = [], face = [];
let isGesturing = false, acceptsGesture = true;
globalThis.mockPlayer = ({start, canGesture}) => ({
	figure: {ready:new Promise(resolve => { resolveModel = resolve; }),group:new THREE.Group(),setEmotion:(name,strength)=>face.push([name,strength])},
	root: new THREE.Group(),pos:start,vel:new THREE.Vector3(), gliderOpen: 0,
	update(){if (!canGesture()) this.clearGesture();},playGesture(name){if (!canGesture()) return 0;gestures.push(name);isGesturing=acceptsGesture;return acceptsGesture ? (name === 'dance' ? 3.6 : 1.1) : 0;},
	clearGesture(){isGesturing=false;},
});
const {createGame} = await import('../src/lib/nixkit/game.ts');

// Exercise the real createGame API and its actual emotion scheduler/HUD; stub only rendering
// and the player's physical animation (covered independently by test-nixkit-player-gestures).
const make = emotes => createGame({canvas:new Element('canvas'),modelUrl:'mock',
	spawn:{pos:new THREE.Vector3(),heading:0},firstPerson:{}, ...(emotes ? {emotes} : {})});
const all = (e, cls) => [...(e.className===cls?[e]:[]), ...e.children.filter(c=>c instanceof Element).flatMap(c=>all(c,cls))];
const key = k => events.get('keydown').forEach(fn=>fn({key:k, target:focus, preventDefault(){}}));
let now = performance.now();
const next = (count=1) => { for(let i=0;i<count;i++) frame(now += 40); };
const load = async game => { resolveModel(); await game.loaded; await game.start(); next(); };

// No B menu is needed: a game can react from a pickup, puzzle completion, or another event.
let game = make();
assert.equal(typeof game.react, 'function');
assert.equal(typeof game.action, 'function');
assert.equal(game.action('hop'), false, 'not ready must not queue a body action');
assert.equal(game.react('happy'), false, 'not ready must not queue a cue');
await load(game);
assert.deepEqual(face, []);
assert.equal(all(document.body, 'nk-emotes').length, 0);
assert.equal(game.react('happy'), true);
assert.deepEqual(gestures, ['happy']);
next(); assert.equal(face.at(-1)[0], 'happy');
// A duration of 1.1 returned by the player must govern the face as well.
next(30); assert.deepEqual(face.at(-1), ['neutral', 0]);

for (const invalid of ['unknown', 'neutral', '', null, undefined]) {
	const before = [gestures.length, face.length];
	assert.equal(game.react(invalid), false);
	next(); assert.deepEqual([gestures.length, face.length], before);
}
game.paused = true;
assert.equal(game.react('sad'), false);
assert.equal(game.action('hop'), false);
game.paused = false; next(4);
assert.deepEqual(face.at(-1), ['neutral', 0]);

// Unsafe body states should still supply a facial cue, never pretend to start the body.
acceptsGesture = false;
assert.equal(game.react('sad'), false);
next(5); assert.equal(face.at(-1)[0], 'sad');
acceptsGesture = true;
key('v'); next(); assert.equal(game.firstPerson, true);
const beforeFirst = gestures.length;
assert.equal(game.action('hop'), false);
assert.equal(game.react('surprised'), false);
next(9); assert.equal(face.at(-1)[0], 'surprised');
assert.equal(gestures.length, beforeFirst);
key('v'); next(); assert.equal(game.firstPerson, false);
reduced = true;
const beforeReduced = gestures.length;
assert.equal(game.action('hop'), false);
assert.equal(game.react('determined'), false);
next(); assert.deepEqual(face.at(-1), ['determined', 1]);
assert.equal(gestures.length, beforeReduced);
reduced = false;

// Body-only action uses public action names, never starts or replaces a face cue.
game.clearEmote();
for (const [action, mood] of [['hop', 'happy'], ['flinch', 'surprised'], ['droop', 'sad'], ['fist-pump', 'determined'], ['dance', 'dance']]) {
	const before = face.length;
	assert.equal(game.action(action), true);
	assert.equal(gestures.at(-1), mood);
	next(2);
	assert.equal(face.length, before, 'body action must not paint a facial cue');
}
for (const invalid of ['happy', 'unknown', '', null, undefined]) {
	const before = [gestures.length, face.length];
	assert.equal(game.action(invalid), false);
	next(); assert.deepEqual([gestures.length, face.length], before);
}
game.emote('sad', 3); next(9);
assert.equal(face.at(-1)[0], 'sad');
assert.equal(game.action('hop'), true); next(3);
assert.equal(face.at(-1)[0], 'sad', 'body action must leave an existing face cue intact');
acceptsGesture = false;
const refusedFace = face.length;
assert.equal(game.action('hop'), false); next();
assert.equal(face.length, refusedFace);
acceptsGesture = true;

// Existing explicit face-only API must never start another body cue.
const beforeFaceOnly = gestures.length;
game.emote('happy', 1); next(9);
assert.equal(face.at(-1)[0], 'happy');
assert.equal(gestures.length, beforeFaceOnly);

// A face-only B menu keeps its old behavior, while programmatic react remains available.
game = make({danceLabel:'Starlight Step'}); await load(game);
let menu = all(document.body, 'nk-emotes').at(-1);
let [button, panel] = menu.children;
const beforeMenu = gestures.length;
assert.equal(all(menu, 'nk-emote-dance').length, 0);
button.listeners.click(); panel.children[0].listeners.click(); next(5);
assert.equal(face.at(-1)[0], 'happy');
assert.equal(gestures.length, beforeMenu);
assert.equal(game.react('determined'), true);
assert.equal(gestures.at(-1), 'determined');

// Opt-in B choices and the API share behavior, including face fallback on body refusal.
game = make({gestures:true, danceLabel:'Starlight Step'}); await load(game);
menu = all(document.body, 'nk-emotes').at(-1);
[button, panel] = menu.children;
button.listeners.click(); panel.children[1].listeners.click(); next();
assert.equal(gestures.at(-1), 'surprised');
assert.equal(face.at(-1)[0], 'surprised');
acceptsGesture = false;
button.listeners.click(); panel.children[2].listeners.click(); next(9);
assert.equal(face.at(-1)[0], 'sad');
assert.equal(isGesturing, false);
acceptsGesture = true;
const [dance] = all(menu, 'nk-emote-dance');
assert.equal(dance.textContent, 'Starlight Step');
button.listeners.click(); dance.listeners.click(); next(25);
assert.equal(panel.hidden, true);
assert.equal(focus, button);
assert.equal(gestures.at(-1), 'dance');
assert.deepEqual(face.at(-1), ['happy', 1]);
next(70); assert.deepEqual(face.at(-1), ['neutral', 0]);

// The dance button must not bypass motion preferences or the active view.
reduced = true;
const beforeDance = gestures.length;
button.listeners.click(); dance.listeners.click(); next();
assert.equal(gestures.length, beforeDance);
assert.deepEqual(face.at(-1), ['happy', 1]);
reduced = false;
key('v'); next();
assert.equal(menu.hidden, true);
dance.listeners.click(); next();
assert.equal(gestures.length, beforeDance);

console.log('react/action API: body-only mappings and face isolation, no-HUD use, readiness/invalid/pause guards, duration matching, first-person/reduced-motion/activity fallback, face-only compatibility, and B menu integration passed.');
