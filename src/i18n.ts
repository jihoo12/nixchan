// The site is English first; Korean pages live under /ko/ with the same paths (inside the base,
// lib/base.ts: /nixchan/ko/…). Only Nixchan's own page has both; the 3D pages read the language
// that was remembered (island/lang.ts).
import { BASE } from './lib/base';

export type Lang = 'en' | 'ko';

/** For `[...lang]` routes: one English page at the root and one Korean page under /ko/. */
export const langPaths = () => [{ params: { lang: undefined } }, { params: { lang: 'ko' } }];

/** The language of a `[...lang]` route. */
export const routeLang = (param: string | undefined): Lang => (param === 'ko' ? 'ko' : 'en');

/** A page's path inside the site, without the base: '/nixchan/ko/' is '/ko/'. */
const inSite = (pathname: string) => pathname.slice(BASE.length) || '/';

/** The language of any page, read from its URL. */
export const urlLang = (url: URL): Lang => (/^\/ko(\/|$)/.test(inSite(url.pathname)) ? 'ko' : 'en');

/** `path` (always the English one inside the site, starting with /) as a link in the given language. */
export const localize = (path: string, lang: Lang) => BASE + (lang === 'ko' ? `/ko${path}` : path);

/** The English path of a page inside the site, whichever language it's in. */
export const unlocalize = (pathname: string) => inSite(pathname).replace(/^\/ko(?=\/|$)/, '') || '/';

/** hreflang links for a page that exists in both languages. */
export const pairAlternates = (path: string) => [
	{ hreflang: 'en', href: localize(path, 'en') },
	{ hreflang: 'ko', href: localize(path, 'ko') },
	{ hreflang: 'x-default', href: localize(path, 'en') },
];

export const ogLocale = (lang: Lang) => (lang === 'ko' ? 'ko_KR' : 'en_US');

export const nav = {
	en: { home: 'Nixchan', island: 'Island', path: '3D path', gallery: 'Gallery', snow: 'Snow magic', jihoo: 'jihoo ↗', main: 'Main navigation', homeLabel: 'Nixchan home', clock: 'Switch between day and night', switchTo: '한국어', switchLabel: '한국어로 보기' },
	ko: { home: '닉스쨩', island: '섬', path: '3D 길', gallery: '갤러리', snow: '눈 마법', jihoo: 'jihoo ↗', main: '주 메뉴', homeLabel: '닉스쨩 홈', clock: '낮과 밤 바꾸기', switchTo: 'EN', switchLabel: 'View in English' },
} satisfies Record<Lang, Record<string, string>>;
