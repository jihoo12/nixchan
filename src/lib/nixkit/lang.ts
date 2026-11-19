// Which language a page with Nixchan in it speaks: the site's. Reading a Korean page (/ko/…) or
// pressing the site's language sign remembers it (components/BaseHead.astro,
// components/Header.astro); pages with no /ko/ address of their own (the island, the games) read
// what was remembered. ?lang=ko or ?lang=en on the URL tries one without changing it.
import type { Lang } from '../../i18n';

export type { Lang };

export const lang: Lang = (() => {
	try {
		const asked = new URLSearchParams(location.search).get('lang');
		if (asked === 'ko' || asked === 'en') return asked;
		return localStorage.getItem('lang') === 'ko' ? 'ko' : 'en';
	} catch {
		return 'en';
	}
})();

/** Pick the words for the page's language. */
export const pick = <T>(words: Record<Lang, T>): T => words[lang];

/** Whether a Korean word ends in a final consonant (받침); anything not Hangul counts as not. */
const closed = (word: string) => {
	const code = word.charCodeAt(word.length - 1) - 0xac00;
	return code >= 0 && code <= 11171 && code % 28 !== 0;
};

/** A Korean word with the particle that fits it: josa('당근', '이', '가') is 당근이, josa('순무', '이', '가') is 순무가. */
export const josa = (word: string, afterClosed: string, afterOpen: string) => word + (closed(word) ? afterClosed : afterOpen);
