// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
export default defineConfig({
	// A project page of jihoo12's: https://jihoo12.github.io/nixchan/. Links to its own pages go
	// through src/lib/base.ts; links to jihoo's site (/, /about/, /blog/, …) are the same origin.
	site: 'https://jihoo12.github.io',
	base: '/nixchan',
	integrations: [sitemap()],
	vite: {
		// Bundle three up front in development. Found one page at a time instead, Vite re-bundles it
		// partway through a session, and a page still holding the old bundle never loads.
		optimizeDeps: {
			include: [
				'three',
				...['geometries/RoundedBoxGeometry', 'loaders/GLTFLoader', 'objects/Reflector', 'postprocessing/EffectComposer', 'postprocessing/OutputPass', 'postprocessing/RenderPass', 'postprocessing/UnrealBloomPass', 'utils/BufferGeometryUtils'].map((m) => `three/examples/jsm/${m}.js`),
			],
		},
	},
});
