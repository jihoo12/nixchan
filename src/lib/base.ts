// This site lives at https://jihoo12.github.io/nixchan/ (astro.config.mjs `base`), so every link
// to a page of its own starts with that. Links to jihoo's site (/about/, /blog/, …) don't: it's the
// same origin, one level up.

/** The site's base path, without a trailing slash: '/nixchan'. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** A path inside this site (starting with /), as a link: to('/island/') is '/nixchan/island/'. */
export const to = (path: string) => BASE + path;

/** Where jihoo's own site is. */
export const JIHOO = 'https://jihoo12.github.io/';
