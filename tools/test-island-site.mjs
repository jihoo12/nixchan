// Run after npm run build. Exercise the generated static Pages entry points, not a 3D browser.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const origin = 'https://jihoo12.github.io';
const base = '/nixchan';
const island = `${origin}${base}/island/`;
const dist = new URL('../dist/', import.meta.url);
const html = (path) => readFileSync(new URL(`${path}index.html`, dist), 'utf8');
const games = readdirSync(new URL('../src/games/', import.meta.url), { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_')).map(({ name }) => name);

function entry(path, search = '', { blockedStorage = false } = {}) {
	const source = html(path);
	assert.doesNotMatch(source, /<canvas|type="module"|src="[^"]*\.js/);
	const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
	assert.ok(script, path);
	let destination;
	const stored = new Map();
	runInNewContext(script, {
		URL,
		URLSearchParams,
		location: { origin, search, replace: (url) => { destination = url.href; } },
		localStorage: { setItem: (key, value) => {
			if (blockedStorage) throw Error('storage disabled');
			stored.set(key, value);
		} },
	});
	assert.match(source, /http-equiv="refresh" content="0;url=\/nixchan\/island\//);
	return { destination, lang: stored.get('lang') };
}

test('the main and Korean entry URLs lead to the canonical Island and preserve known options', () => {
	assert.deepEqual(entry(''), { destination: island, lang: undefined });
	assert.deepEqual(entry('ko/'), { destination: `${island}?lang=ko`, lang: 'ko' });
	assert.deepEqual(entry('ko/', '', { blockedStorage: true }), { destination: `${island}?lang=ko`, lang: undefined });
	assert.deepEqual(entry('ko/', '?lang=en'), { destination: `${island}?lang=en`, lang: undefined });
	assert.equal(entry('', '?from=gallery&lang=ko&webgl&nix-hour=20').destination, `${island}?lang=ko&webgl=&nix-hour=20`);
	assert.equal(entry('', '?lang=not-a-locale&next=https://example.org').destination, island);
});

test('legacy standalone routes and the Gallery have redirects only', () => {
	assert.ok(games.length > 0);
	for (const path of ['gallery/', 'skills/', ...games.map((id) => `play/${id}/`)]) {
		assert.equal(entry(path, '?lang=ko').destination, `${island}?lang=ko`, path);
	}
});

test('the Island, linked areas and translated profile remain; retired pages are not advertised', () => {
	for (const path of ['island/', 'home/', 'monochrome/', 'experimental/']) assert.match(html(path), /<canvas/);
	for (const path of ['island/', 'about/', 'ko/about/']) assert.doesNotMatch(html(path), /href="\/nixchan\/(?:gallery|play|skills)\//);
	assert.match(html('about/'), /href="\/nixchan\/island\/\?lang=en"/);
	assert.match(html('ko/about/'), /href="\/nixchan\/island\/\?lang=ko"/);
	const sitemap = readFileSync(new URL('sitemap-0.xml', dist), 'utf8');
	assert.match(sitemap, /<loc>https:\/\/jihoo12\.github\.io\/nixchan\/island\/<\/loc>/);
	assert.doesNotMatch(sitemap, /\/nixchan\/(?:gallery|play|skills)\//);
	const assets = readdirSync(new URL('_astro/', dist));
	assert.ok(assets.some((file) => /^nixchan-3d\..*\.glb$/.test(file)));
	assert.ok(assets.every((file) => !/\.vrm$/.test(file)), 'no standalone games’ VRM assets should ship');
});

test('the built island has one keyboard and touch building palette for every construction item', () => {
	const islandHtml = html('island/');
	assert.equal((islandHtml.match(/data-build-toggle/g) ?? []).length, 1);
	assert.equal((islandHtml.match(/data-build-picker/g) ?? []).length, 1);
	assert.match(islandHtml, /data-build-remove/);
	assert.match(islandHtml, /data-act hidden/);
	assert.doesNotMatch(islandHtml, /data-belts(?:-take|-done)?[ =>]|data-build-(?:take|done)/);
	for (const id of ['stone-block', 'belt', 'windmill', 'drill', 'sprinkler', 'ore-hopper'])
		assert.ok(islandHtml.includes(`data-build-item="${id}"`), id);
});
