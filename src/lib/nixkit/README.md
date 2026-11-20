# Nixkit

A small kit for making 3D games with Nixchan in them. It came out of Nixchan's island (`/island`):
the island and every Nixkit game share the same Nixchan, the same way of moving her about, the
same camera and controls, and the same toon look.

The first game made with it is **Cloud Hop** (`/play/cloudhop/`, `src/games/cloudhop/`), an
obstacle course in the sky. The **gallery** (`/gallery`, `src/lib/gallery/gallery.ts`) is made
with it too: a plaza where Nixchan walks among portals to the games.

## Adding a game

Games live in `src/games/<id>/`: a `meta.ts` (its name, who made it, its portal's colours) and a
`game.ts` (the game). Each one gets a page at `/play/<id>/` and a portal in the gallery, both made
from `meta.ts`. `CONTRIBUTING.md` says how, and what a game may and mayn't do;
`src/games/_template/` is where to start.

## Making a game

A game's `game.ts` is given `createGame`, which sets up everything round the page's canvas:

```ts
import * as THREE from 'three';
import type { GameContext } from '../../lib/nixkit/meta';

export default function start({ createGame, store }: GameContext) {
	const game = createGame({ spawn: { pos: new THREE.Vector3(0, 0, 0), heading: 0 } });
	if (!game) return;
	const { parts, hud } = game;
	parts.add({ at: [0, -0.5, 0], size: [10, 1, 10] });                                   // somewhere to stand
	parts.add({ at: [0, -0.5, 9], size: [3, 1, 3], move: { by: [6, 0, 0], period: 4 } }); // a moving platform
	parts.add({ at: [0, -0.5, 14], size: [3, 1, 3], kill: true });                       // lava
	parts.checkpoint([0, -0.5, 20], [4, 1, 4]);
	const coins = hud.stat('0 coins');
	let n = 0;
	parts.pickup({ at: [0, 1, 9], onPick: () => coins.set(`${++n} coins`) });
	game.onUpdate((dt, time) => { /* the game's own rules */ });
	game.start();
}
```

`createGame` also takes `canGlide` and `canDash` (both off unless given) and `onKey` (keys that
aren't for moving: `e` waves and `q` dashes unless the game uses them).

Games can opt in to `firstPerson: {}`. The view still starts in third person; **V** or the
on-screen button switches to and from the eye-level camera, and mouse or touch drags still
control looking. Set `firstPerson: { showButton: false }` to keep V without a HUD button. An optional `forceThirdPerson` predicate can hold the orbit view during
a scene and then restore the player's selection. `game.firstPerson` reports the effective view.

Use these from a game event (for example, after completing a quest), without setting up a menu:

| Call | What plays |
| --- | --- |
| `game.emote('happy', 2)` | Just the face for two seconds. Moods: `happy`, `surprised`, `sad`, `determined`. |
| `game.action('hop')` | Just the body gesture. Actions: `hop`, `flinch`, `droop`, `fist-pump`, `dance`. |
| `game.react('happy')` | The matching face and body gesture together. |

`action` and `react` return `true` if the body cue was accepted. They do nothing before the
model has loaded or while paused. When a body cue is unavailable (for example during movement,
in first person, or with reduced motion), `react` still shows the face, and `action` does nothing.
No body cue is queued for later. A face cue returns to neutral when it ends; use
`game.clearEmote()` to reset just the face immediately.

To let players choose, opt in with `emotes: {}`;
the **B** key and a touch-friendly expression button open the palette in third person only.
Set `emotes: { showButton: false }` to keep the palette accessible only via B.
Set `emotes: { gestures: true }` to pair each menu choice with a body gesture on stationary,
grounded Nixchan. Movement, jumping and game-owned poses take priority; with reduced motion
the menu stays face-only. The **E** wave and scripted `game.emote()` cues keep their existing
behavior. The menu uses the same reaction logic as `game.react()`. The options can provide localized
button and choice labels and a short hint. Give a `danceLabel` with `gestures: true` to add
a dance choice with a smile (as in Lantern Mart).

What it gives back:

| | |
| --- | --- |
| `parts` | the world: parts, pickups, checkpoints (below) |
| `hud` | `stat(text)` a counter along the top, `banner(title, note)`, `toast(text)`, `button(label, fn)`, `flash()` |
| `player` | Nixchan: `pos`, `vel`, `grounded`, `airborne`, `launch(speed)`, `respawn()` |
| `onUpdate(fn)` | `fn(dt, time)` every frame, after the parts and she have moved |
| `teleport(pos, heading)` | puts her somewhere, and makes it where she comes back to |
| `scene`, `camera`, `toon` | for adding anything else three.js can draw (`toon` makes a material in the kit's shading) |
| `loaded`, `start()`, `paused` | settles once she's here; starts the loop; stops everything |

`store.get(key)` and `store.set(key, value)` remember things for the game between visits.

## Parts

`parts.add(spec)` makes a box (or, with `shape: 'cylinder'`, a cylinder) with its middle at `at`
and `size` across. What it does is up to the spec:

| field | what it does |
| --- | --- |
| `move: { by, period, phase? }` | slides out by `by` and back once every `period` seconds, carrying her along |
| `conveyor: [vx, vz]` | carries whoever stands on it, like a belt |
| `bounce: speed` | throws her up into the air (16 is about 5 m) |
| `vanish: { after, back }` | fades away `after` seconds once she's stepped on it, back `back` seconds later |
| `kill: true` | sends her back to the last checkpoint |
| `checkpoint: true` | becomes where she comes back to (`parts.checkpoint()` adds a flag too) |
| `solid: false` | not there to stand on: for show, or for `kill` / `onTouch` (a sweeping bar) |
| `onTouch(part)` | called each time she steps onto it (or into it) |

`parts.pickup({ at, onPick })` is a spinning gem to collect. `parts.reset(pos, heading)` starts
over.

How far she can jump, for laying out a course: about 1.4 m up, and 4 to 5 m across at a run
(2 m at a walk). A part's footprint reaches 0.3 m past its edge, for her feet.

## Worlds

What Nixchan and the camera know of where they are is a `World` (`world.ts`): how high the ground
is at a point, how low the ceiling, what obstacles stand near, whether there's a sea to swim in.
The parts are one world; the island's terrain, rocks, trees and sky island are another
(`island/features.ts`, `islandWorld`). A game can bring its own by passing `world` to `createGame`.
`combineWorlds(terrain, parts.world)` makes one world of several: she stands on the highest ground
any of them has, and walks round what stands in all of them.

## The engine

Under `createGame` is an engine (`engine.ts`) that owns the renderer, the scene and the camera
and runs the frame. Everything that happens each frame is a **system**: something with an
`update(dt, time)`, run in `order` (lowest first; `ORDER` names the usual places), and in the
order they were added where two share one. `game.onUpdate(fn)` is a system at `ORDER.game`; a
game can put others anywhere in the frame:

```ts
import { ORDER } from '../../lib/nixkit/engine';

game.engine.add({ order: ORDER.world, update: (dt, time) => { /* before she moves */ } });
game.engine.add({ order: ORDER.camera + 1, always: true, update: () => { /* after the camera */ } });
```

| `ORDER` | What runs there |
| --- | --- |
| `input` (0) | Before anything moves |
| `world` (100) | Parts move |
| `player` (200) | She moves |
| `contact` (250) | What she's touching: pickups, checkpoints, lava |
| `game` (300) | `onUpdate`: the game's own rules |
| `effects` (350) | Her face |
| `camera` (400) | The camera follows her |
| `light` (450) | The sun's shadows follow her |
| `hud` (480) | What the HUD shows |

While `game.paused` is true, or until her model has loaded, time stands still and only systems
marked `always` run (the camera and the light are). `engine.step(dt)` runs one frame by hand, which
is what the tests do (`tools/test-nixkit-engine.mjs`).

A few more things come with it:

- `game.focus.add(() => talking ? { x, z, facing } : null)`: someone for the camera to frame her
  with while she talks to them. The first source that names anyone wins.
- `game.keys.intercept((key, e) => boolean, priority)`: a layer of keys, asked highest priority
  first; returning true takes the key (as a conversation or an open menu would). `keys.command(fn)`
  hears every key that isn't for moving.
- `game.sky`: the sun, the hemisphere light and the fog (`environment.ts`).

A bigger game can put itself together from the same pieces instead of `createGame`:
`createEngine` with a renderer of its choosing, `createSkyLight` or a sky of its own, and
`createNixchan(engine, { world, touch, ... })` (`nixchan.ts`) for Nixchan, her controls, the camera,
the eye-level view and her reactions. Nixchan's island is made this way (`src/lib/island/game.ts`): its
own terrain for a world, its own sky and sea, `view: { fov: [45, 60], near: 0.5 }` for a camera that
suits a big island, `keys: { wave: false, dash: false }` since its E and Q do other things, and every
part of the island a system in the engine.

`createHands([{ holding, stop }, ...])` (`hands.ts`) is for things she carries in her arms: one at a
time, so taking one up puts the rest away. `hands.holding` is what to pass as the player's `carrying`.

## Snow

`addSnow(game, { fall })` (`snow.ts`) is snow worked out on the GPU by a compute shader, so there
can be a great many snowflakes (160,000 on WebGPU, a fifth of that on WebGL 2):

```ts
const snow = addSnow(game, { fall: 0.3 });   // snowfall round Nixchan, 0 (none) to 1
snow.wind.set(1, 0, 0.4);                     // which way it drifts
snow.burst(at, { count: 3000, dir, speed: 9, spread: 0.3, color: '#9fd4ff', size: 1.4 });
snow.vortex.set(at, { radius: 6, swirl: 14, pull: 3, lift: 4 });   // a blizzard; snow.vortex.off()
```

A burst is thrown from `at` along `dir`, scattered as far as `spread` says, then slows and falls
as snow. The vortex spins whatever's near it round, pulls it in and lifts it. Add `?fps` to the
page's address to see how fast it's drawing.

## Talking, the bag, menus, saves and the clock

These came out of the island, and any game can use them. Each draws into the page's own elements,
so the page styles them as it likes.

- `createTalk(camera, ui)` (`talk.ts`): a conversation box and a speech bubble. `open({ name, color })`,
  `say(text, choices)`, `bye(text)`, `bubble(text, at)`, and `update(dt)` each frame.
  `talk.keysFor(game.keys)` gives it the keys while someone's talking.
- `createInventory({ slots, kinds, store, grid, detail, summary })` (`inventory.ts`): a bag of stacks,
  a stack a slot. Register each kind of thing with a name, a picture and what she can do with it.
- `createMenu({ root, close, start, seen, onOpen, onShow })` (`menu.ts`): tabs over the game
  (`data-tab`, `data-panel`, `data-open`), with help that opens by itself on a first visit.
- `createSaves({ short: 'storage-key' })` (`save.ts`): readers and writers for a game's own
  localStorage keys that never throw. (A game in `src/games/` has `store` for this already.)
- `createDayNight({ day, night })` (`daynight.ts`): a palette of the game's own, by the site's clock.
  `clock.on(p => ...)` changes with it; `game.sky.clock` is the default sky's.
- `lang`, `pick({ en, ko })`, `josa(word, '이', '가')` (`lang.ts`): the site's language, words for
  it, and Korean particles.
- `createPictures(renderer, onDrawn)` (`thumbnail.ts`): little pictures of 3D things for the menus.
  `pictures.get(key, build, from)` gives the picture once it's drawn (null until then, since WebGPU
  reads pixels back in its own time), and `onDrawn` says when to draw the menus again.

## What's in the kit

- `game.ts`: `createGame`, an engine with three's `WebGPURenderer` (WebGPU, or WebGL 2 without it; `?webgl` forces that), sky and light, Nixchan, the HUD and parts put in it
- `engine.ts`: `createEngine`, the renderer, scene and camera, and the frame's systems in order
- `environment.ts`: the sky, fog, sun and hemisphere light, by day and by night
- `nixchan.ts`: Nixchan in an engine: her, her controls, the follow camera, the eye-level view, faces and gestures
- `hands.ts`: one thing in her arms at a time
- `meta.ts`, `runner.ts`: what a game in `src/games/` is, its `store`, and what runs it on its page
- `player.ts`: Nixchan and how she moves: walk, run, jump, swim, glide, dash
- `camera.ts`: the camera that follows her, and `createFocus`, who it frames her with
- `controls.ts`: keyboard, mouse and touch, and `createKeyRouter`, keys in layers
- `parts.ts`: parts and pickups, and the world they make
- `world.ts`: what a world is, and `combineWorlds`
- `hud.ts`: what's shown over the game
- `portal.ts`: portals to other pages
- `scenery.ts`: clouds
- `snow.ts`: snow on the GPU: snowfall, bursts and a vortex
- `figure-nodes.ts`: Nixchan's look in TSL, for WebGPU
- `interact.ts`: "press E to …" offers
- `talk.ts`, `inventory.ts`, `menu.ts`: conversations, the bag, and tabs over the game
- `save.ts`, `daynight.ts`, `lang.ts`: saves, day and night, and the site's language
- `thumbnail.ts`: pictures of 3D things for menus
- `look.ts`, `util.ts`: toon materials, and small maths
