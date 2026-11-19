import type { GameStore } from '../../lib/nixkit/meta';
import { copy } from './copy';
import { skin } from './skin';
import {
	CHAPTERS, GLYPH_INFO, applyTransform, initialSettings, isSolved, traceFrames, traceOutcome,
	isTransform, type Chapter, type Settings, type Transform,
} from './rules';

const LIGHTS = ['A', 'B', 'C'] as const;
const VERTICES = [0, 1, 2] as const;
const TRANSFORMS = [0, 1, 2, 3, 4, 5] as const;
const ROMAN = ['I', 'II', 'III'];
const SAVE = 'folio-v1';
// XML namespace identifier, not a request or a link out of the game.
const SVG_NS = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');

function element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, value?: string, css?: string) {
	const el = document.createElement(tag);
	if (value) el.textContent = value;
	if (css) el.className = css;
	parent.append(el);
	return el;
}
function vector<K extends keyof SVGElementTagNameMap>(
	parent: SVGElement | HTMLElement, tag: K, attr: Record<string, string | number>,
) {
	const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
	for (const [key, value] of Object.entries(attr)) el.setAttribute(key, String(value));
	parent.append(el);
	return el;
}

/** Slot order, not the destinations of A–B–C: write each original ray into its arrival slot. */
function triplet(parent: HTMLElement, transform: Transform, label: string) {
	const field = element(parent, 'span', undefined, 'a-triplet');
	const slots = [...VERTICES];
	for (const ray of VERTICES) slots[applyTransform(transform, ray)] = ray;
	field.setAttribute('role', 'img');
	field.setAttribute('aria-label', `${label}: ${slots.map((ray) => LIGHTS[ray]).join('–')}`);
	for (const ray of slots) {
		const token = element(field, 'span', LIGHTS[ray], 'a-token');
		token.dataset.light = String(ray);
		token.setAttribute('aria-hidden', 'true');
	}
	return field;
}

function load(store: GameStore) {
	const saved = store.get(SAVE);
	const record = typeof saved === 'object' && saved !== null ? saved as Record<string, unknown> : {};
	const count = CHAPTERS.length;
	const seals = typeof record.seals === 'number' && Number.isInteger(record.seals)
		? Math.max(0, Math.min(record.seals, count)) : 0;
	const unlocked = Math.min(seals, count - 1);
	const active = typeof record.active === 'number' && Number.isInteger(record.active)
		? Math.max(0, Math.min(record.active, unlocked)) : unlocked;
	const finale = CHAPTERS[count - 1]!;
	const original = Array.isArray(record.original) ? record.original.filter(isTransform) : [];
	const reference = original.length === finale.edges.filter((edge) => edge.adjustable).length && seals === count ? original : [];
	const all = Array.isArray(record.lenses) ? record.lenses : [];
	const lenses = CHAPTERS.map((chapter, i) => {
		const stored: unknown = all[i];
		const values = typeof stored === 'object' && stored !== null ? stored as Record<string, unknown> : {};
		const settings = initialSettings(chapter);
		for (const edge of chapter.edges) {
			const value = values[edge.id];
			if (edge.adjustable && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5) {
				settings[edge.id] = value as Transform;
			}
		}
		return settings;
	});
	return { seals, active, lenses, original: reference, alternate: reference.length > 0 && record.alternate === true };
}

export function createAtlas(store: GameStore) {
	const urlLanguage = new URLSearchParams(location.search).get('lang');
	const lang = urlLanguage === 'ko' || (urlLanguage !== 'en' && navigator.language.startsWith('ko')) ? 'ko' : 'en';
	const s = copy[lang];
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const state = load(store);
	const hints = CHAPTERS.map(() => 0);
	let selectedTrace = 0;
	let selectedEdge = '';
	let frame: number | null = null;
	let animation: ReturnType<typeof setInterval> | undefined;
	let ending: false | 'first' | 'alternate' = false;
	let instructionOpen = state.seals === 0;
	let announcement = '';
	let listener: (chapter: number, solved: boolean, links: number) => void = () => {};

	const style = element(document.head, 'style', skin);
	const hud = element(document.body, 'aside');
	hud.dataset.atlasUi = '';
	hud.lang = lang;
	hud.hidden = true;
	const placard = element(hud, 'section');
	element(placard, 'small', s.subtitle);
	element(placard, 'h2', s.name);
	const cue = element(placard, 'p', s.where);
	const hudProgress = element(placard, 'p', '', 'a-progress');
	const openButton = element(hud, 'button', s.enter, 'a-open');
	openButton.type = 'button';
	const dialog = element(document.body, 'dialog');
	dialog.dataset.atlasDialog = '';
	dialog.lang = lang;
	dialog.setAttribute('aria-label', s.name);
	const shell = element(dialog, 'div', undefined, 'a-shell');
	const head = element(shell, 'header', undefined, 'a-head');
	const header = element(head, 'div');
	element(header, 'small', s.subtitle);
	const title = element(header, 'h2', s.name);
	const closeButton = element(head, 'button', '×', 'a-close');
	closeButton.type = 'button';
	closeButton.setAttribute('aria-label', s.close);
	closeButton.addEventListener('click', () => dialog.close());
	const body = element(shell, 'div');
	// Keep this region mounted so assistive technologies announce changes without reloading it.
	const live = element(shell, 'p', '', 'a-status');
	live.setAttribute('role', 'status');

	const chapter = () => CHAPTERS[state.active]!;
	const settings = () => state.lenses[state.active]!;
	const save = () => store.set(SAVE, state);
	const fingerprint = (level: Chapter, values: Settings) =>
		level.edges.filter((edge) => edge.adjustable).map((edge) => values[edge.id] ?? edge.initial);
	function stopped(clearFrame = true) {
		if (animation !== undefined) clearInterval(animation);
		animation = undefined;
		if (clearFrame) frame = null;
	}
	function sync() {
		const current = chapter();
		const count = current.traces.filter((trace) => traceOutcome(current, trace, settings()) === trace.target).length;
		hudProgress.textContent = `${s.progress}  ${state.seals} / ${CHAPTERS.length}${state.alternate ? ' · ✦' : ''}`;
		listener(state.active, count === current.traces.length, count);
	}
	function button(parent: HTMLElement, label: string, action: () => void, key: string, css?: string) {
		const el = element(parent, 'button', label, css);
		el.type = 'button';
		el.dataset.atlasKey = key;
		el.addEventListener('click', action);
		return el;
	}

	function drawGraph(parent: HTMLElement, level: Chapter, active: string) {
		// A rectangular viewport with deliberately expanded horizontal spacing on small screens.
		const map = vector(parent, 'svg', { viewBox: '0 0 280 186', 'aria-hidden': 'true' });
		const points = new Map(level.nodes.map((node) => [node.id, { x: 24 + node.x * 2.32, y: 14 + node.y * 1.55 }]));
		vector(map, 'rect', { x: 2, y: 2, width: 276, height: 182, rx: 10, fill: '#0a1425', stroke: '#2c435c' });
		const pattern = vector(vector(map, 'defs', {}), 'pattern', { id: 'atlas-stars', width: 14, height: 14, patternUnits: 'userSpaceOnUse' });
		vector(pattern, 'circle', { cx: 7, cy: 7, r: 0.6, fill: '#39506a' });
		vector(map, 'rect', { x: 4, y: 4, width: 272, height: 178, rx: 9, fill: 'url(#atlas-stars)' });
		const strokes: { id: string; line: SVGLineElement; arrow: SVGPolygonElement }[] = [];
		for (const edge of level.edges) {
			const a = points.get(edge.from)!, b = points.get(edge.to)!;
			const length = Math.hypot(b.x - a.x, b.y - a.y);
			const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
			const line = vector(map, 'line', {
				x1: a.x + 10 * dx, y1: a.y + 10 * dy, x2: b.x - 12 * dx, y2: b.y - 12 * dy,
				'stroke-dasharray': edge.adjustable ? '0' : '4 3',
			});
			const x = b.x - 18 * dx, y = b.y - 18 * dy;
			const arrow = vector(map, 'polygon', {
				points: `${x},${y} ${x - 6 * dx + 3 * dy},${y - 6 * dy - 3 * dx} ${x - 6 * dx - 3 * dy},${y - 6 * dy + 3 * dx}`,
			});
			strokes.push({ id: edge.id, line, arrow });
		}
		for (const node of level.nodes) {
			const { x, y } = points.get(node.id)!;
			vector(map, 'circle', { cx: x, cy: y, r: 11, fill: '#162d42', stroke: '#92b5ce', 'stroke-width': 1.1 });
			vector(map, 'text', { x, y: y + 4, 'text-anchor': 'middle', fill: '#eaf2fd', 'font-size': 11 }).textContent = node.id;
		}
		return (lit: readonly string[], current?: string) => {
			for (const { id, line, arrow } of strokes) {
				const traveled = lit.includes(id);
				const color = current === id ? '#fef3ba' : active === id ? '#f8c88e' : traveled ? '#70e5d5' : '#5b708a';
				line.setAttribute('stroke', color);
				line.setAttribute('stroke-width', traveled || active === id ? '2.4' : '1.15');
				arrow.setAttribute('fill', color);
			}
		};
	}
	function render() {
		if (!dialog.open) { sync(); return; }
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.atlasKey : undefined;
		const scroll = dialog.scrollTop;
		const level = chapter();
		const values = settings();
		const trace = level.traces[selectedTrace]!;
		const edge = level.edges.find((e) => e.id === selectedEdge) ?? level.edges.find((e) => e.adjustable)!;
		const steps = trace.steps.map((step) => ({ step, edge: level.edges.find((e) => e.id === step.edge)! }));
		const nodePath = steps.length ? [steps[0]!.step.reverse ? steps[0]!.edge.to : steps[0]!.edge.from,
			...steps.map(({ step, edge: traced }) => step.reverse ? traced.from : traced.to)] : [];
		const solved = isSolved(level, values);
		title.textContent = ending ? s.name : level.title[lang];
		body.replaceChildren();
		const tabs = element(body, 'nav', undefined, 'a-steps');
		tabs.setAttribute('aria-label', s.progress);
		CHAPTERS.forEach((other, index) => {
			const tab = button(tabs, `${ROMAN[index]} · ${other.title[lang]}${index < state.seals ? ' ✓' : ''}`, () => activate(index), `folio-${index}`);
			if (state.active === index && !ending) tab.setAttribute('aria-current', 'step');
			tab.disabled = index > state.seals;
		});
		if (ending) {
			const final = element(body, 'section', undefined, 'a-ending');
			element(final, 'h2', ending === 'first' ? s.endingTitle : s.anotherDone);
			element(final, 'p', ending === 'first' ? s.ending : s.anotherText);
			if (ending === 'first') element(final, 'p', s.endingExtra);
			button(final, s.keep, () => dialog.close(), 'return', 'a-primary');
			live.textContent = '';
			sync();
			final.querySelector('button')?.focus({ preventScroll: true });
			return;
		}
		element(body, 'p', level.intro[lang], 'a-intro');
		const how = element(body, 'details', undefined, 'a-help');
		how.open = instructionOpen;
		how.addEventListener('toggle', () => { instructionOpen = how.open; });
		element(how, 'summary', s.ready).dataset.atlasKey = 'instructions';
		element(how, 'p', s.how);
		const grid = element(body, 'div', undefined, 'a-grid');
		const map = element(grid, 'section', undefined, 'a-card a-map');
		element(map, 'h3', s.graph);
		const illuminate = drawGraph(map, level, edge.id);
		element(map, 'p', level.nodes.map((node) => node.id + ' · ' + node.label[lang]).join('  /  '), 'a-legend');
		const lenses = element(map, 'div', undefined, 'a-lenses');
		lenses.setAttribute('role', 'group'); lenses.setAttribute('aria-label', s.stations);
		for (const lens of level.edges) {
			const mark = values[lens.id] ?? lens.initial;
			const b = button(lenses, `${lens.from}→${lens.to} ${GLYPH_INFO[mark].glyph}${lens.adjustable ? '' : ' ·'}`, () => {
				stopped(); selectedEdge = lens.id; announcement = ''; render();
			}, `edge-${lens.id}`);
			b.setAttribute('aria-pressed', String(lens.id === edge.id));
			b.setAttribute('aria-label', `${lens.adjustable ? s.edge : s.fixed} ${lens.from} → ${lens.to}, ${GLYPH_INFO[mark].label[lang]}`);
		}
		const mark = values[edge.id] ?? edge.initial;
		element(map, 'p', `${edge.from} → ${edge.to} · ${edge.adjustable ? s.change : s.fixed}`, 'a-inspect');
		if (edge.adjustable) {
			const options = element(map, 'div', undefined, 'a-glyphs');
			options.setAttribute('role', 'group'); options.setAttribute('aria-label', s.change);
			for (const t of TRANSFORMS) {
				const choose = button(options, `${GLYPH_INFO[t].glyph} `, () => {
					stopped(); values[edge.id] = t; save();
					announcement = `${edge.from} → ${edge.to}: ${GLYPH_INFO[t].label[lang]}`;
					render();
				}, `transform-${t}`);
				choose.title = GLYPH_INFO[t].label[lang];
				choose.setAttribute('aria-label', GLYPH_INFO[t].label[lang]);
				choose.setAttribute('aria-pressed', String(t === mark));
				triplet(choose, t, s.light);
			}
		} else {
			triplet(map, mark, s.light);
		}
		const lab = element(grid, 'section', undefined, 'a-card');
		element(lab, 'h3', s.route);
		const list = element(lab, 'div', undefined, 'a-traces');
		level.traces.forEach((entry, i) => {
			const matches = traceOutcome(level, entry, values) === entry.target;
			const b = button(list, `${matches ? '✓' : '○'} ${entry.label[lang]}`, () => {
				stopped(); selectedTrace = i; announcement = ''; render();
			}, `trace-${i}`);
			b.setAttribute('aria-label', `${entry.label[lang]}: ${matches ? s.pass : s.fail}`);
			b.setAttribute('aria-pressed', String(i === selectedTrace));
			b.toggleAttribute('data-match', matches);
		});
		element(lab, 'p', nodePath.join(' → '), 'a-path');
		const result = traceOutcome(level, trace, values);
		const frames = traceFrames(level, trace, values);
		const compare = element(lab, 'div', undefined, 'a-compare');
		const measured = element(compare, 'div', undefined, 'a-reading');
		const reading = element(measured, 'p');
		let lights: HTMLElement | null = null;
		const drawFrame = () => {
			const current = frame === null ? result : frames[frame] ?? result;
			const lastStep = frame === null || frame === 0 ? null : steps[frame - 1];
			reading.textContent = frame === null ? s.sim : frame === 0 ? s.start :
				`${frame}/${steps.length} · ${nodePath[frame - 1]}→${nodePath[frame]}${lastStep?.step.reverse ? ` · ${s.reversed}` : ''}`;
			lights?.remove();
			lights = triplet(measured, current, s.light);
			illuminate((frame === null ? steps : steps.slice(0, frame)).map(({ step }) => step.edge), lastStep?.step.edge);
		};
		drawFrame();
		const goal = element(compare, 'div', undefined, 'a-reading');
		element(goal, 'p', s.target);
		triplet(goal, trace.target, s.light);
		const transport = element(lab, 'div', undefined, 'a-playline');
		button(transport, s.replay, () => {
			stopped();
			if (reduced.matches) { frame = steps.length; drawFrame(); return; }
			frame = 0; drawFrame();
			animation = setInterval(() => {
				frame = Math.min(steps.length, (frame ?? 0) + 1);
				if (frame >= steps.length) stopped(false);
				drawFrame();
			}, 420);
		}, 'replay');
		button(transport, s.step, () => {
			stopped(false); frame = frame === null || frame >= steps.length ? 0 : frame + 1; drawFrame();
		}, 'step');
		const hintCount = hints[state.active] ?? 0;
		if (hintCount > 0) {
			element(body, 'p', level.hints[hintCount - 1]?.[lang] ?? '', 'a-note');
		}
		const bottom = element(body, 'div', undefined, 'a-bottom');
		if (hintCount < level.hints.length) button(bottom, hintCount ? s.nextHint : s.hint, () => {
			stopped(); hints[state.active] = hintCount + 1; render();
			if (hintCount + 1 >= level.hints.length) body.querySelector<HTMLElement>('[data-atlas-key="reset"]')?.focus();
		}, 'hint');
		button(bottom, s.reset, () => {
			stopped(); state.lenses[state.active] = initialSettings(level); save(); announcement = s.resetDone; render();
		}, 'reset');
		const last = state.active === CHAPTERS.length - 1;
		const signature = last ? fingerprint(level, values) : [];
		const different = state.original.length > 0 && signature.some((value, index) => value !== state.original[index]);
		const advance = button(bottom, last ? (different ? s.another : s.finish) : s.advance, () => {
			if (!isSolved(level, values)) return;
			state.seals = Math.max(state.seals, state.active + 1);
			if (state.active < CHAPTERS.length - 1) activate(state.active + 1);
			else {
				stopped();
				if (!state.original.length) state.original = signature;
				if (different) state.alternate = true;
				ending = different ? 'alternate' : 'first'; save(); render();
			}
		}, 'advance', 'a-primary');
		advance.disabled = !solved;
		const count = level.traces.filter((entry) => traceOutcome(level, entry, values) === entry.target).length;
		const message = `${announcement ? announcement + ' · ' : ''}${s.lit} ${count}/${level.traces.length} · ${solved ? s.match : s.compare}`;
		if (live.textContent !== message) live.textContent = message;
		sync();
		if (previous) [...body.querySelectorAll<HTMLElement>('[data-atlas-key]')].find((b) => b.dataset.atlasKey === previous)?.focus({ preventScroll: true });
		dialog.scrollTop = scroll;
	}

	function activate(index: number) {
		stopped(); ending = false; selectedTrace = 0; selectedEdge = ''; announcement = '';
		state.active = index;
		save(); render();
		dialog.scrollTop = 0;
		body.querySelector<HTMLElement>('[aria-current="step"]')?.focus();
	}
	function open() {
		if (dialog.open) return;
		dialog.showModal(); render();
		closeButton.focus();
	}
	dialog.addEventListener('close', () => { stopped(); ending = false; openButton.focus({ preventScroll: true }); });
	openButton.addEventListener('click', open);
	sync();
	return {
		get isOpen() { return dialog.open; },
		reveal(quiet = false) { hud.hidden = false; hud.toggleAttribute('data-fallback', quiet); cue.textContent = quiet ? s.fallback : s.where; },
		open, close: () => dialog.close(),
		onChange(next: typeof listener) { listener = next; sync(); },
		dispose() { stopped(); dialog.remove(); hud.remove(); style.remove(); },
	};
}
