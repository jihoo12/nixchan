## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Before finishing a change, run `npm run check:games`, `npm test` (Nixkit's unit tests,
`tools/test-nixkit-*.mjs`) and `npm run build`.

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

## Making a game

Games with Nixchan live in `src/games/<id>/`, one folder each, made with Nixkit (`src/lib/nixkit/`).
To add one, follow `CONTRIBUTING.md`: copy `src/games/_template/`, change only files in that
folder, and run `npm run check:games` and `npm run build` before finishing.

## Links

The site is published at `/nixchan/` (`base` in `astro.config.mjs`). Link to its own pages with
`to('/island/')` from `src/lib/base.ts`, never a bare `/island/`: a bare path is jihoo's site.
