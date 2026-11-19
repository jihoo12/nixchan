import type { GameStore } from '../../lib/nixkit/meta';
import { CHAPTERS, WORDS, evaluate, line, type Chapter, type Localized } from './rules';
import { NPCS, caseForChapter, hasAllTestimony, meetNpc, restoreStory, testimonyForNpc, visibleTestimony, type NpcId } from './story';
import cover from './cover.webp?url';
import { styleText } from './styles';

type Draft = Record<string, number>;
type Ending = 'hold' | 'carry';
const key = 'docket-v1';
const numerals = ['I', 'II', 'III'];
const create = <K extends keyof HTMLElementTagNameMap>(tag: K, content = '', className = '') => {
	const node = document.createElement(tag);
	if (content) node.textContent = content;
	if (className) node.className = className;
	return node;
};
const button = (label: string, action: () => void, className = '') => {
	const node = create('button', label, className);
	node.type = 'button';
	node.addEventListener('click', action);
	return node;
};
const has = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function createDocket(store: GameStore) {
	const lang = new URLSearchParams(location.search).get('lang');
	const ko = lang === 'ko' || lang !== 'en' && navigator.language.startsWith('ko');
	const t = (koText: string, en: string) => ko ? koText : en;
	const l = (copy: Localized) => ko ? copy.ko : copy.en;
	const saved = store.get(key);
	const raw = has(saved) ? saved : {};
	const drafts: Draft[] = CHAPTERS.map((chapter, index) => {
		const candidate: unknown = Array.isArray(raw.drafts) ? raw.drafts[index] : null;
		const draft: Draft = {};
		if (has(candidate)) chapter.slots.forEach((slot) => {
			const option = candidate[slot.id];
			if (typeof option === 'number' && Number.isInteger(option) && slot.options[option]) draft[slot.id] = option;
		});
		return draft;
	});
	let complete = 0;
	const claimed = typeof raw.complete === 'number' ? raw.complete : 0;
	while (complete < CHAPTERS.length && complete < claimed && evaluate(CHAPTERS[complete], drafts[complete]).solved) complete++;
	const notes: string[] = CHAPTERS.map((_, index) => {
		const entry: unknown = Array.isArray(raw.notes) ? raw.notes[index] : null;
		return typeof entry === 'string' ? entry.slice(0, 1800) : '';
	});
	let ending: Ending | undefined = complete === CHAPTERS.length && (raw.ending === 'hold' || raw.ending === 'carry') ? raw.ending : undefined;
	let chapterIndex = Math.min(complete, CHAPTERS.length - 1);
	let gloss = raw.gloss === true;
	let story = restoreStory(raw.story, complete);
	let fallback = false;
	let nearWitness: NpcId | undefined;
	let near: number | undefined;
	let feedback = false;
	let hintCount = 0;
	let change = (_chapter: number, _completed: number) => {};
	let lastFocus: HTMLElement | null = null;
	const save = () => store.set(key, { drafts, notes, complete, ending, gloss, story });

	const launcher = create('div', '', 'tv-launch');
	const launch = button('', () => interact());
	const objective = create('p', '', 'tv-objective');
	launcher.append(objective, launch);
	launcher.hidden = true;
	const dialog = create('dialog', '', 'tv-book');
	dialog.setAttribute('aria-labelledby', 'tv-title');
	const head = create('header', '', 'tv-head');
	const art = create('img');
	art.src = cover;
	art.alt = '';
	art.dataset.art = '';
	const stamp = create('div', 'ARVEL   /   VA · YA · NU · DU', 'tv-kicker');
	const title = create('h2', t('제3의 목소리', 'The Third Voice'));
	title.id = 'tv-title';
	const prologue = create('p', t('수문 마을의 기록관이 닉스쨩을 불렀다. 판결을 쓰기 전에, 물가와 기록소와 종탑에서 각자의 말을 들어보자.', 'The archivist of Weirhaven has summoned Nixchan. Before drafting a verdict, listen at the landing, archive and bell tower.'));
	const closeButton = button(t('닫기', 'Close'), () => dialog.close(), 'tv-close');
	head.append(art, stamp, title, prologue, closeButton);
	const nav = create('nav', '', 'tv-nav');
	nav.setAttribute('aria-label', t('심리 기록', 'Hearings'));
	const main = create('div', '', 'tv-main');
	dialog.append(head, nav, main);
	const styles = create('style', styleText);
	document.head.append(styles);
	document.body.append(launcher, dialog);

	const current = () => Math.min(complete, CHAPTERS.length - 1);
	const syncLauncher = () => {
		const witness = NPCS.find(npc => npc.id === nearWitness);
		const next = CHAPTERS[current()];
		const records = visibleTestimony(story, current());
		const count = records.length;
		const missing = NPCS.find(npc => testimonyForNpc(current(), npc.id).some(entry => !records.some(record => record.id === entry.id)));
		launch.textContent = witness
			? t(`${l(witness.name)} · 말 걸기`, `${l(witness.name)} · Talk`)
			: near !== undefined && near <= complete
				? t(`${numerals[near]} · 석판 읽기`, `${numerals[near]} · Read tablet`)
				: t('사건 기록철', 'Case docket');
		objective.textContent = complete === CHAPTERS.length
			? t('판결 뒤의 마을 · 증인에게 다시 물어볼 수 있어요', 'After the verdict · revisit the witnesses')
			: count < next.corpus.length
				? t(`증거 ${count}/${next.corpus.length}${missing ? ` · ${l(missing.location)}` : ''}`, `Evidence ${count}/${next.corpus.length}${missing ? ` · ${l(missing.location)}` : ''}`)
				: t(`법정 ${numerals[current()]}번 석판에서 제출`, `Submit at tribunal tablet ${numerals[current()]}`);
	};
	const focusHeading = () => main.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
	function selectChapter(index: number) {
		chapterIndex = index;
		feedback = false;
		hintCount = 0;
		render();
		const heading = main.querySelector<HTMLElement>('h3');
		if (heading) { dialog.scrollTop = head.offsetHeight; focusHeading(); }
		change(chapterIndex, complete);
	}

	const list = <T,>(rows: readonly T[], renderRow: (row: T) => Node) => {
		const items = create('ul');
		for (const row of rows) { const item = create('li'); item.append(renderRow(row)); items.append(item); }
		return items;
	};

	function addLanguage(parent: HTMLElement, chapter: Chapter) {
		const lexicon = create('details');
		lexicon.append(create('summary', t('선택 도움말 · 어휘와 문법', 'Optional aid · grammar and lexicon')));
		lexicon.append(create('p', t('아르벨어의 어순은 [출처] [대상] [증거 상태]. 규칙에서 A kel B ser C는 A와 B의 증거가 있으면 C의 증거를 더하라는 뜻이다. 어말은 사건 자체가 아니라 출처에서 얻은 증거를 말한다.', 'Arvel order: [source] [subject] [evidence state]. In a rule, A kel B ser C means to add evidence for C when A and B have their stated evidence. The ending describes the evidence, not what ultimately happened.')));
		const glossary = create('div', '', 'tv-lexicon');
		for (const entry of [...Object.values(WORDS.sources), ...chapter.atoms, ...Object.values(WORDS.moods)]) {
			const chip = create('span');
			chip.append(create('code', entry.word), document.createTextNode(` · ${l(entry.label)}`));
			glossary.append(chip);
		}
		lexicon.append(glossary);
		for (const entry of [...Object.values(WORDS.sources), ...Object.values(WORDS.moods)]) {
			const entryLine = create('p', '', 'tv-mute');
			entryLine.append(create('code', entry.word), document.createTextNode(` · ${l(entry.description)}`));
			lexicon.append(entryLine);
		}
		parent.append(lexicon);
	}
	function addEnding(parent: HTMLElement) {
		const box = create('section', '', 'tv-epilogue');
		box.append(create('div', t('판결 이후', 'AFTER THE VERDICT'), 'tv-kicker'));
		box.append(create('h3', t('기록은 무엇을 해야 하는가?', 'What should a record do?')));
		const statement = create('p');
		statement.setAttribute('role', 'status');
		const setEnding = (choice: Ending) => { ending = choice; save(); refreshEnding(); };
		const hold = button(t('두 목소리를 그대로 보관한다', 'Keep both voices in the record'), () => setEnding('hold'));
		const carry = button(t('판결을 낭독하고 질문을 넘긴다', 'Read the verdict and pass on the question'), () => setEnding('carry'));
		function refreshEnding() {
			hold.setAttribute('aria-pressed', String(ending === 'hold'));
			carry.setAttribute('aria-pressed', String(ending === 'carry'));
			hold.dataset.mark = ending === 'hold' ? 'pass' : '';
			carry.dataset.mark = ending === 'carry' ? 'pass' : '';
			statement.textContent = ending === 'hold'
				? t('닫힌 기록철에는 두 개의 서명이 남았다. 그것은 합의의 모양을 하지 않았다.', 'Two signatures remained in the closed docket. They did not resemble agreement.')
				: ending === 'carry'
					? t('닉스쨩이 판결을 읽자 문 밖에서 누군가 물었다. “그럼 우리가 아직 모르는 것은 어디에 적나요?”', 'After Nixchan read the verdict, someone outside asked, “Where do we write what we still don’t know?”')
					: t('어느 쪽을 택해도 증거의 내용은 바뀌지 않아요.', 'Neither choice changes the evidence.');
		}
		const picks = create('div', '', 'tv-actions');
		picks.append(hold, carry);
		box.append(statement, picks);
		refreshEnding();
		parent.append(box);
	}

	function render() {
		const chapter = CHAPTERS[chapterIndex];
		const draft = drafts[chapterIndex];
		const sealed = chapterIndex < complete;
		const records = visibleTestimony(story, chapterIndex);
		const hasEvidence = sealed || hasAllTestimony(story, chapterIndex);
		const atTribunal = fallback || near === chapterIndex;
		const incident = caseForChapter(chapterIndex);
		nav.replaceChildren(...CHAPTERS.map((item, index) => {
			const tab = button(`${numerals[index]} · ${l(item.title)}${index < complete ? ' ✓' : ''}`, () => selectChapter(index));
			tab.disabled = index > complete;
			if (index === chapterIndex) tab.setAttribute('aria-current', 'step');
			return tab;
		}));
		const heading = create('h3', `${numerals[chapterIndex]} · ${l(chapter.title)}`);
		heading.tabIndex = -1;
		const brief = create('section', '', 'tv-section');
		brief.append(create('div', l(incident.title), 'tv-kicker'), heading, create('p', l(incident.summary)), create('p', l(chapter.intro)));
		const directory = create('details', '', 'tv-directory');
		directory.open = !hasEvidence;
		directory.append(create('summary', t('마을 길잡이 · 증인과 증거', 'Village guide · witnesses and evidence')));
		const cards = create('div', '', 'tv-witness-grid');
		NPCS.forEach((npc) => {
			const card = create('div', '', 'tv-witness-card');
			card.append(create('strong', l(npc.name)), create('span', l(npc.role), 'tv-mute'), create('span', l(npc.location)));
			const required = testimonyForNpc(chapterIndex, npc.id);
			const gathered = required.filter((entry) => records.some(record => record.id === entry.id)).length;
			if (required.length) card.append(create('span', t(`기록 ${gathered}/${required.length}`, `Records ${gathered}/${required.length}`), 'tv-mute'));
			if (fallback || nearWitness === npc.id) card.append(button(t('말 걸기', 'Talk'), () => renderWitness(npc.id, chapterIndex), 'tv-visit'));
			cards.append(card);
		});
		directory.append(cards);
		if (!fallback) directory.append(create('p', t('길을 따라 증인에게 다가가 E 또는 말 걸기 버튼을 누르세요. 법정은 종탑을 지나 더 안쪽이에요.', 'Follow the path to a witness, then press E or Talk. The tribunal is just beyond the bell tower.'), 'tv-mute'));
		brief.append(directory);
		const grid = create('div', '', 'tv-grid');
		const evidence = create('section', '', 'tv-section');
		evidence.append(create('h3', t('아르벨어 원본', 'The Arvel record')));
		const translate = button('', () => { gloss = !gloss; save(); setGloss(); });
		function setGloss() {
			translate.textContent = gloss ? t('번역 숨기기', 'Hide translations') : t('번역 나란히 보기', 'Show translations');
			translate.setAttribute('aria-pressed', String(gloss));
			evidence.dataset.gloss = String(gloss);
		}
		evidence.append(translate);
		setGloss();
		if (!hasEvidence) evidence.append(create('p', t('증인에게 받은 줄만 이 기록에 나타나요.', 'Only testimony collected from witnesses appears here.'), 'tv-mute'));
		evidence.append(list(records, (entry) => {
			const fragment = document.createDocumentFragment();
			fragment.append(create('code', line({ atom: entry.atom, source: entry.source, value: entry.sign })),
				create('div', l(entry.text), 'tv-mute tv-gloss'));
			return fragment;
		}));
		if (hasEvidence && chapter.rules.length) {
			evidence.append(create('h4', t('기록관의 추론 규칙', 'Archivist’s inference rules')),
				list(chapter.rules, (rule) => {
					const fragment = document.createDocumentFragment();
					const signed = (bit: typeof rule.conclusion) => line({ ...bit, source: 'thae', value: bit.sign }).replace(/^thae /, '');
					fragment.append(create('code', `thae · ${rule.premises.map(signed).join(' kel ')} ser ${signed(rule.conclusion)}`),
						create('div', l(rule.text), 'tv-mute tv-gloss'));
					return fragment;
				}));
		}
		addLanguage(evidence, chapter);

		const puzzle = create('section', '', 'tv-section');
		puzzle.append(create('h3', t('판결문 조립', 'Compose a verdict')));
		const status = create('p', '', 'tv-mute');
		status.setAttribute('role', 'status');
		if (sealed) status.textContent = t('봉인된 기록이에요. 처음 제출한 판결이 보존돼요.', 'This record is sealed. Your accepted verdict is preserved.');
		const slotMarks = new Map<string, HTMLElement>();
		const selects = new Map<string, HTMLSelectElement>();
		for (const slot of chapter.slots) {
			const label = create('label', '', 'tv-slot');
			const mark = create('small', '', 'tv-mute');
			const select = create('select');
			select.setAttribute('aria-label', l(slot.label));
			const placeholder = create('option', t('문장 고르기', 'Choose a clause'));
			placeholder.value = '';
			select.append(placeholder);
			slot.options.forEach((clause, index) => {
				const option = create('option', line(clause));
				option.value = String(index);
				select.append(option);
			});
			select.value = slot.id in draft ? String(draft[slot.id]) : '';
			select.disabled = sealed;
			slotMarks.set(slot.id, mark);
			selects.set(slot.id, select);
			select.addEventListener('change', () => {
				if (!select.value) delete draft[slot.id];
				else draft[slot.id] = Number(select.value);
				feedback = false;
				save();
				refreshMarks();
			});
			label.append(create('span', l(slot.label)), select, mark);
			puzzle.append(label);
		}
		const constraintMarks = new Map<string, HTMLElement>();
		if (chapter.constraints.length) {
			puzzle.append(create('h4', t('판결문의 계약', 'Contract of the verdict')));
			puzzle.append(list(chapter.constraints, (condition) => {
				const row = create('span', l(condition.text));
				const mark = create('small');
				mark.className = 'tv-mute';
				constraintMarks.set(condition.id, mark);
				row.append(mark);
				return row;
			}));
		}
		function refreshMarks() {
			const result = evaluate(chapter, draft);
			for (const [id, mark] of slotMarks) {
				const flag = result.slots[id];
				mark.textContent = !feedback || sealed ? '' : flag === 'empty' ? t('미기입', 'Empty') : flag === 'licensed' ? t('국소 증거와 일치', 'Licensed by local evidence') : t('이 출처의 증거와 불일치', 'Not licensed by this source');
				mark.dataset.mark = !feedback || flag === 'empty' ? '' : flag === 'licensed' ? 'pass' : 'fail';
			}
			for (const [id, mark] of constraintMarks) {
				const flag = result.constraints[id];
				mark.textContent = !feedback || flag === 'pending' ? '' : flag === 'pass' ? t(' · 충족', ' · Met') : t(' · 불충족', ' · Unmet');
				mark.dataset.mark = !feedback || flag === 'pending' ? '' : flag;
			}
			if (!sealed) status.textContent = !hasEvidence
				? t('먼저 마을에서 아직 받지 못한 증언을 모으세요.', 'First gather the missing testimony in the village.')
				: !atTribunal
					? t(`초안은 여기서 써도 되지만 심사는 법정 ${numerals[chapterIndex]}번 석판에서만 할 수 있어요.`, `Draft here, but submit at tribunal tablet ${numerals[chapterIndex]}.`)
					: feedback ? t('판결이 보류됐어요. 기록과 계약을 다시 대조해 보세요.', 'Verdict withheld. Compare your clauses with the record and the contract.')
				: t('바꾸는 동안에는 판정하지 않아요.', 'The tribunal does not judge while you edit.');
		}
		const actions = create('div', '', 'tv-actions');
		const submit = button(t('판결 심사', 'Test the verdict'), () => {
			if (!hasEvidence || !atTribunal || sealed) return;
			if (!evaluate(chapter, draft).solved) { feedback = true; refreshMarks(); return; }
			complete = chapterIndex + 1;
			feedback = false;
			save(); syncLauncher(); change(chapterIndex, complete);
			render(); focusHeading();
		}, 'tv-primary');
		submit.disabled = !hasEvidence || !atTribunal;
		if (!sealed) actions.append(submit, button(t('초안 비우기', 'Clear draft'), () => {
			for (const [id, select] of selects) { delete draft[id]; select.value = ''; }
			feedback = false;
			save();
			refreshMarks();
		}));
		else if (chapterIndex + 1 < CHAPTERS.length) actions.append(button(t('다음 심리', 'Next hearing'), () => selectChapter(chapterIndex + 1), 'tv-primary'));
		puzzle.append(actions, status);
		refreshMarks();
		const notesPanel = create('details');
		notesPanel.append(create('summary', t('나의 기록 · 자동 저장', 'Scratch notes · saved')));
		const memo = create('textarea');
		memo.setAttribute('aria-label', t('나의 기록', 'Scratch notes'));
		memo.maxLength = 1800;
		memo.value = notes[chapterIndex];
		memo.addEventListener('input', () => { notes[chapterIndex] = memo.value; save(); });
		notesPanel.append(memo);
		puzzle.append(notesPanel);

		if (!sealed && hasEvidence && chapter.hints.length) {
			const help = create('details');
			const shown = list(chapter.hints.slice(0, hintCount), (item) => create('span', l(item)));
			shown.setAttribute('aria-live', 'polite');
			const request = button(t('단서 하나 열기', 'Reveal one clue'), () => {
				const clue = chapter.hints[hintCount++];
				if (clue) shown.append(create('li', l(clue)));
				request.disabled = hintCount >= chapter.hints.length;
			});
			help.append(create('summary', t('막혔을 때만 · 추가 단서', 'Only if stuck · further clues')), shown, request);
			puzzle.append(help);
		}
		grid.append(evidence, puzzle);
		main.replaceChildren(brief, grid);
		if (sealed) {
			const note = create('p', t('마을로 돌아가 같은 증인에게 말을 걸면, 이 판결에 대한 이야기도 들을 수 있어요.', 'Return to a witness to hear what changed after this verdict.'), 'tv-afterword');
			brief.append(note);
		}
		if (complete === CHAPTERS.length && chapterIndex === CHAPTERS.length - 1) addEnding(main);
	}

	// Conversations live in the same modal so movement, touch and keyboard focus
	// behave identically in the field and in the screen-reader-friendly text route.
	function renderWitness(id: NpcId, reading = current()) {
		const npc = NPCS.find(person => person.id === id);
		if (!npc) return;
		const meeting = meetNpc(story, reading, id, complete);
		nav.replaceChildren(button(t('사건 기록철', 'Case docket'), () => selectChapter(reading)));
		const card = create('section', '', 'tv-section tv-conversation');
		const title = create('h3', l(npc.name));
		title.tabIndex = -1;
		card.append(create('div', `${l(npc.role)} · ${l(npc.location)}`, 'tv-kicker'), title);
		const dialogue = create('div', '', 'tv-dialogue');
		dialogue.setAttribute('role', 'status');
		let cursor = 0;
		const next = button('', () => {
			if (cursor + 1 < meeting.lines.length) { cursor++; speak(); return; }
			story = meeting.state;
			save();
			syncLauncher();
			showReceipt();
		}, 'tv-primary');
		const actions = create('div', '', 'tv-actions');
		const prior = complete > 0 && reading >= complete ? complete - 1 : undefined;
		const currentReading = current();
		const home = button(t('마을로 돌아가기', 'Return to the village'), () => fallback ? selectChapter(reading) : dialog.close());
		actions.append(next, home);
		function speak() {
			dialogue.replaceChildren(create('p', meeting.lines[cursor] ? l(meeting.lines[cursor]) : ''));
			next.textContent = cursor + 1 < meeting.lines.length
				? t('계속 듣기', 'Keep listening')
				: meeting.newRecords > 0 ? t('증언을 기록한다', 'Record the testimony') : t('이야기를 마친다', 'Finish listening');
		}
		function showReceipt() {
			dialogue.replaceChildren(create('p', meeting.newRecords > 0
				? t(`기록철에 증언 ${meeting.newRecords}개를 옮겼어요.`, `${meeting.newRecords} record(s) added to the docket.`)
				: t('이야기를 끝까지 들었어요.', 'You heard their account.')));
			if (meeting.records.length) dialogue.append(list(meeting.records, (entry) => create('code', line({ atom: entry.atom, source: entry.source, value: entry.sign }))));
			const read = button(t('기록철 보기', 'Read docket'), () => selectChapter(reading), 'tv-primary');
			actions.replaceChildren(read, home);
			if (prior !== undefined) actions.append(button(t('지난 판결을 어떻게 봤나요?', 'What did you think of the last verdict?'), () => renderWitness(id, prior)));
			else if (reading !== currentReading) actions.append(button(t('오늘의 이야기', 'Today’s account'), () => renderWitness(id, currentReading)));
			read.focus();
		}
		speak();
		card.append(dialogue, actions);
		main.replaceChildren(card);
		dialog.scrollTop = 0;
		focusHeading();
	}

	function interact() {
		if (!nearWitness || dialog.open) { open(near); return; }
		lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		dialog.showModal();
		renderWitness(nearWitness);
	}

	function open(index?: number) {
		if (dialog.open) return;
		if (index !== undefined && index >= 0 && index <= complete && index < CHAPTERS.length) {
			chapterIndex = index;
		} else chapterIndex = current();
		feedback = false;
		hintCount = 0;
		lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		render();
		dialog.showModal();
		dialog.scrollTop = 0;
		focusHeading();
		change(chapterIndex, complete);
	}
	dialog.addEventListener('close', () => {
		if (lastFocus?.isConnected && lastFocus !== document.body) lastFocus.focus();
		change(complete === CHAPTERS.length ? -1 : complete, complete);
	});
	syncLauncher();
	return {
		get isOpen() { return dialog.open; },
		open,
		interact,
		setNear(index: number | undefined, witness?: NpcId) { near = index; nearWitness = witness; syncLauncher(); },
		onChange(set: typeof change) { change = set; change(complete === CHAPTERS.length ? -1 : complete, complete); },
		reveal(noGraphics = false) {
			launcher.hidden = false;
			fallback = noGraphics;
			if (fallback) {
				launcher.dataset.fallback = '';
				open();
			}
		},
		dispose() { if (dialog.open) dialog.close(); dialog.remove(); launcher.remove(); styles.remove(); },
	};
}
