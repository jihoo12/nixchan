## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Before finishing a change, run `npm run check` (types, with `astro check`), `npm run check:games`,
`npm test` (Nixkit's unit tests, `tools/test-nixkit-*.mjs`) and `npm run build`.

## Checking it in a browser

Don't use headless Chromium (or any browser with software rendering, such as SwiftShader or
llvmpipe) to look at the site: the 3D pages draw with WebGPU or WebGL, and a software renderer
neither draws them the way a real GPU does nor runs them fast enough to judge. To see a page, use
Claude in Chrome (the `mcp__claude-in-chrome__*` tools), which drives the user's own Chrome on
their GPU, with the dev server running in the background. If Claude in Chrome isn't available,
say so and ask the user to look instead.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Island and archival games

The Island is the public game. Its code is under `src/lib/island/`; do not remove Nixkit helpers or
linked locations that the Island relies on. The standalone games in `src/games/<id>/` are archived
in source, not published as playable pages. Keep their existing tests and credits intact.

## Links

The site is published at `/nixchan/` (`base` in `astro.config.mjs`). Link to its own pages with
`to('/island/')` from `src/lib/base.ts`, never a bare `/island/`: a bare path is jihoo's site.
