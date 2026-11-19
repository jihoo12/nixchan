// What a Nixkit game shows over the 3D: the touch stick and jump button, a banner for big moments,
// a toast for small ones, and a row of counters (coins, a clock…). It makes its own elements and
// styles, so a game needs no markup of its own beyond a canvas.

import { EMOTIONS, type Emotion, type EmoteMenu } from './emotions';

const STYLE = `
.nk-hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; font-family: var(--sans, system-ui, sans-serif); -webkit-user-select: none; user-select: none; }
.nk-hud > * { pointer-events: auto; }
.nk-stats { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; pointer-events: none; }
.nk-stat { padding: 6px 13px; border-radius: 999px; background: var(--surface, #fff); color: var(--ink, #1c1a3e); font-size: 15px; font-weight: 900; box-shadow: 0 4px 0 var(--edge, #c9c6e6); font-variant-numeric: tabular-nums; white-space: nowrap; }
.nk-banner { position: fixed; top: 120px; left: 50%; transform: translate(-50%, -6px); width: max-content; max-width: calc(100% - 32px); text-align: center; pointer-events: none; opacity: 0; transition: opacity 0.5s, transform 0.5s; }
.nk-banner.show { opacity: 1; transform: translate(-50%, 0); }
.nk-banner p { margin: 0; }
.nk-banner-title { font-family: var(--display, inherit); font-size: clamp(30px, 6vw, 48px); line-height: 1.1; color: #fdfbff; text-shadow: 0 2px 0 #2c2a52, 0 0 18px rgba(28, 26, 62, 0.45); }
.nk-banner-note { display: inline-block; margin-top: 8px !important; padding: 3px 12px; border-radius: 999px; background: var(--star, #ffd84d); color: #1c1a3e; font-size: 14px; font-weight: 900; }
.nk-banner-note:empty { display: none; }
.nk-toast { position: fixed; left: 50%; bottom: 28px; transform: translate(-50%, 8px); max-width: calc(100% - 32px); margin: 0; padding: 8px 16px; border-radius: 999px; background: var(--surface, #fff); color: var(--ink, #1c1a3e); font-size: 15px; font-weight: 800; box-shadow: 0 4px 0 var(--edge, #c9c6e6); opacity: 0; transition: opacity 0.3s, transform 0.3s; pointer-events: none; text-align: center; }
.nk-toast.show { opacity: 1; transform: translate(-50%, 0); }
.nk-flash { position: fixed; inset: 0; background: #fdfbff; opacity: 0; pointer-events: none; transition: opacity 0.35s; }
.nk-flash.show { opacity: 0.55; transition: none; }
.nk-stick { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.nk-stick[hidden] { display: none; }
.nk-stick::before, .nk-knob { content: ''; position: absolute; border-radius: 50%; }
.nk-stick::before { left: -60px; top: -60px; width: 120px; height: 120px; background: color-mix(in srgb, var(--surface, #fff) 45%, transparent); box-shadow: inset 0 0 0 3px var(--surface, #fff); }
.nk-knob { left: -26px; top: -26px; width: 52px; height: 52px; background: var(--surface, #fff); box-shadow: 0 4px 0 var(--edge, #c9c6e6); }
.nk-jump { display: none; position: fixed; right: 24px; bottom: 96px; width: 76px; height: 76px; border: 0; border-radius: 50%; background: var(--surface, #fff); color: var(--ink, #1c1a3e); font: 900 32px var(--sans, system-ui); box-shadow: 0 5px 0 var(--edge, #c9c6e6); touch-action: none; }
.nk-jump:active { transform: translateY(3px); box-shadow: 0 2px 0 var(--edge, #c9c6e6); }
@media (pointer: coarse) { .nk-jump { display: block; } }
.nk-actions { position: fixed; top: 64px; right: 16px; display: flex; gap: 8px; }
.nk-action { border: 0; border-radius: 9px; padding: 7px 13px; background: var(--surface, #fff); color: var(--ink, #1c1a3e); font: 800 14px var(--sans, system-ui); box-shadow: 0 4px 0 var(--edge, #c9c6e6); cursor: pointer; }
.nk-action:hover { transform: translateY(-2px); }
.nk-emotes { position:relative; }
.nk-emotes[hidden], .nk-emote-panel[hidden] { display:none; }
.nk-emote-panel { position:absolute; inset:calc(100% + 10px) 0 auto auto; width:max-content; max-width:min(260px,calc(100vw - 32px)); box-sizing:border-box;
  padding:9px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; border:1px solid var(--edge,#c9c6e6); border-radius:13px;
  box-shadow:0 8px 25px #14142538; background:var(--surface,#fff); color:var(--ink,#1c1a3e); }
.nk-emote-panel button { min-height:44px; padding:6px 9px; border:0; border-radius:8px; background:var(--accent-soft,#e6e3ff);
  color:inherit; cursor:pointer; font:700 13px var(--sans,system-ui); touch-action:manipulation; }
.nk-emote-panel .nk-emote-dance { grid-column:1/-1; }
.nk-emote-panel button:focus-visible, .nk-emote-panel button:hover { outline:2px solid var(--ink,#1c1a3e); outline-offset:-2px; }
.nk-emote-panel p { grid-column:1/-1; margin:3px 3px 0; max-width:24ch; font-size:11px; }
@media (max-width: 560px) { .nk-actions { top: 104px; } }
.nk-skills { position: fixed; left: 50%; bottom: 58px; transform: translateX(-50%); display: flex; gap: 10px; }
.nk-skill { position: relative; overflow: hidden; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 12px; padding: 9px 14px 9px 10px; background: var(--surface, #fff); color: var(--ink, #1c1a3e); font: 800 14px var(--sans, system-ui); box-shadow: 0 4px 0 var(--edge, #c9c6e6); cursor: pointer; touch-action: manipulation; }
.nk-skill:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--edge, #c9c6e6); }
.nk-skill kbd { display: grid; place-items: center; min-width: 22px; height: 22px; border-radius: 6px; background: var(--accent-soft, #e6e3ff); font: 900 12px ui-monospace, monospace; }
.nk-skill .nk-cool { position: absolute; inset: 0; background: rgba(28, 26, 62, 0.35); transform-origin: left; transform: scaleX(0); pointer-events: none; }
.nk-skill.cooling { cursor: default; }
@media (max-width: 700px) { .nk-skills { bottom: 190px; flex-wrap: wrap; justify-content: center; width: calc(100% - 32px); } .nk-skill { padding: 8px 11px 8px 8px; font-size: 13px; } }
@media (pointer: coarse) { .nk-skill kbd { display: none; } }
/* Going through a portal, everything fades to white. */
.nk-leaving .nk-flash { opacity: 1; transition: opacity 0.4s; }
@media (max-width: 560px) { .nk-stats { top: 62px; } .nk-stat { font-size: 13px; padding: 5px 10px; } }
`;

export function createHud() {
	if (!document.querySelector('style[data-nk-hud]')) {
		const style = document.createElement('style');
		style.dataset.nkHud = '';
		style.textContent = STYLE;
		document.head.append(style);
	}
	const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement) => {
		const e = document.createElement(tag);
		e.className = cls;
		parent.append(e);
		return e;
	};
	const root = el('div', 'nk-hud', document.body);
	const flash = el('div', 'nk-flash', root);
	const stats = el('div', 'nk-stats', root);
	const actions = el('div', 'nk-actions', root);
	const banner = el('div', 'nk-banner', root);
	banner.setAttribute('aria-live', 'polite');
	const bannerTitle = el('p', 'nk-banner-title', banner);
	const bannerNote = el('p', 'nk-banner-note', banner);
	const skills = el('div', 'nk-skills', root);
	const toast = el('p', 'nk-toast', root);
	toast.setAttribute('aria-live', 'polite');
	const stick = el('div', 'nk-stick', root);
	stick.hidden = true;
	stick.setAttribute('aria-hidden', 'true');
	const knob = el('div', 'nk-knob', stick);
	const jump = el('button', 'nk-jump', root);
	jump.type = 'button';
	jump.textContent = '⤒';
	jump.setAttribute('aria-label', 'Jump');

	let bannerTimer = 0;
	let toastTimer = 0;
	return {
		/** For the controls: the touch stick and the jump button. */
		touch: { stick, knob, jump },
		/** A big title across the top (and a note under it), for a while. */
		banner(title: string, note = '', seconds = 3) {
			bannerTitle.textContent = title;
			bannerNote.textContent = note;
			banner.classList.add('show');
			clearTimeout(bannerTimer);
			bannerTimer = window.setTimeout(() => banner.classList.remove('show'), seconds * 1000);
		},
		/** A line at the bottom of the screen, for a moment. */
		toast(text: string, seconds = 2.4) {
			toast.textContent = text;
			toast.classList.add('show');
			clearTimeout(toastTimer);
			toastTimer = window.setTimeout(() => toast.classList.remove('show'), seconds * 1000);
		},
		/** A white flash over everything (as when she's put back at a checkpoint). */
		flash() {
			flash.classList.add('show');
			requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('show')));
		},
		/** A button up in the top corner (Restart, say). */
		button(label: string, onClick: () => void) {
			const b = el('button', 'nk-action', actions);
			b.type = 'button';
			b.textContent = label;
			b.addEventListener('click', () => {
				onClick();
				b.blur();
			});
			return b;
		},
		/** Optional, keyboard- and touch-friendly disclosure for reactions. */
		emotes(opts: EmoteMenu, play: (emotion: Emotion) => void, dance?: () => void) {
			const holder = el('div', 'nk-emotes', actions);
			const button = el('button', 'nk-action', holder);
			const panel = el('div', 'nk-emote-panel', holder);
			const label = opts.label ?? 'Expressions';
			button.textContent = label;
			button.type = 'button';
			button.setAttribute('aria-keyshortcuts', 'B');
			panel.setAttribute('role', 'group');
			panel.setAttribute('aria-label', label);
			const labelDefaults = { happy: 'Happy', surprised: 'Surprised', sad: 'Sad', determined: 'Determined' };
			const addChoice = (label: string, activate: () => void, cls = 'nk-emote-choice') => {
				const choice = el('button', cls, panel);
				choice.type = 'button';
				choice.textContent = label;
				choice.addEventListener('click', () => {
					close(true);
					activate();
				});
			};
			for (const emotion of EMOTIONS) {
				addChoice(opts.labels?.[emotion] ?? labelDefaults[emotion], () => play(emotion));
			}
			if (dance && opts.danceLabel) addChoice(opts.danceLabel, dance, 'nk-emote-dance');
			const hint = opts.hint ?? 'Drag the camera around to see her face.';
			if (hint) el('p', '', panel).textContent = hint;
			function close(focus = false) {
				panel.hidden = true;
				button.setAttribute('aria-expanded', 'false');
				if (focus && !holder.hidden) button.focus();
			}
			const toggle = (focus = false) => {
				if (holder.hidden) return;
				if (!panel.hidden) return close(focus);
				panel.hidden = false;
				button.setAttribute('aria-expanded', 'true');
				if (focus) panel.querySelector('button')?.focus();
			};
			holder.addEventListener('keydown', (e) => {
				if (e.key !== 'Escape' || panel.hidden) return;
				e.preventDefault();
				close(true);
			});
			button.addEventListener('click', () => toggle());
			close();
			return {
				toggle,
				setVisible(visible: boolean) {
					if (holder.hidden === !visible) return;
					holder.hidden = !visible;
					if (!visible) close();
				},
			};
		},
		/** A button in the row along the bottom for something she can do (a skill), with the key
		 * that does it too. `use` is called by either; `cool(f)` greys `f` (1 … 0) of it over while
		 * it can't be used again yet. */
		skill(label: string, key: string, use: () => void) {
			const b = el('button', 'nk-skill', skills);
			b.type = 'button';
			const k = el('kbd', '', b);
			k.textContent = key.toUpperCase();
			b.append(label);
			const cover = el('span', 'nk-cool', b);
			b.addEventListener('click', () => {
				use();
				b.blur();
			});
			return {
				cool(f: number) {
					cover.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
					b.classList.toggle('cooling', f > 0);
				},
			};
		},
		/** A counter in the row along the top; set its text whenever it changes. */
		stat(text = '') {
			const s = el('span', 'nk-stat', stats);
			s.textContent = text;
			return {
				set(t: string) {
					if (s.textContent !== t) s.textContent = t;
				},
			};
		},
	};
}

export type Hud = ReturnType<typeof createHud>;
