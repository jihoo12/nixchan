// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
export default defineConfig({
	// A project page of jihoo12's: https://jihoo12.github.io/nixchan/. Links to its own pages go
	// through src/lib/base.ts; links to jihoo's site (/, /about/, /blog/, …) are the same origin.
	site: 'https://jihoo12.github.io',
	base: '/nixchan',
	integrations: [sitemap({
		// The root and old game bookmarks lead to the island; don't advertise their stubs.
		filter: (page) => /^\/nixchan\/(?:island|about|ko\/about)\/$/.test(new URL(page).pathname),
	})],
	vite: {
		// Bundle three up front in development. Found one page at a time instead, Vite re-bundles it
		// partway through a session, and a page still holding the old bundle never loads.
		optimizeDeps: {
			include: [
				'three',
				'three/webgpu',
				'three/tsl',
				...['geometries/RoundedBoxGeometry', 'loaders/GLTFLoader', 'postprocessing/EffectComposer', 'postprocessing/OutputPass', 'postprocessing/RenderPass', 'postprocessing/UnrealBloomPass', 'utils/BufferGeometryUtils'].map((m) => `three/examples/jsm/${m}.js`),
			],
		},
	},
});
