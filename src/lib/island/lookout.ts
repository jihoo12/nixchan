// The telescope is an Island interaction, not a separate world. Its controls live in a
// dialog over the same real-time scene; the player, their save, and their normal orbit stay here.
import type { Vector3 } from 'three';
import type { Offer } from '../nixkit/interact';
import { pick } from './lang';
import type { createLookoutCamera } from './lookout-camera';

export interface LookoutSite {
	eye: Vector3;
	stand: Vector3;
	yaw: number;
}

export function atLookout(spot: LookoutSite, pos: Vector3) {
	return Math.abs(spot.stand.y - pos.y) <= .43
		&& Math.hypot(pos.x - spot.stand.x, pos.z - spot.stand.z) <= .95;
}

export function createLookout({
	site, camera, pos, canLook, halt,
}: {
	site: LookoutSite;
	camera: ReturnType<typeof createLookoutCamera>;
	pos: Vector3;
	canLook: () => boolean;
	halt: () => void;
}) {
	const dialog = document.querySelector<HTMLDialogElement>('[data-lookout]');
	const surface = dialog?.querySelector<HTMLElement>('[data-lookout-drag]');
	const close = dialog?.querySelector<HTMLButtonElement>('[data-lookout-exit]');
	const zoom = dialog?.querySelectorAll<HTMLButtonElement>('[data-lookout-zoom]');
	let previous: HTMLElement | null = null;
	let drag: { id: number; x: number; y: number } | null = null;
	const ko = {
		title: '등대 전망대', keys: '드래그하거나 방향키로 둘러보세요.', touch: '화면을 드래그해 둘러보세요.',
		close: '물러나기', zoomIn: '확대', zoomOut: '축소',
	};
	const setText = (selector: string, text: string) => {
		const el = dialog?.querySelector(selector);
		if (el) el.textContent = text;
	};
	if (pick({ en: false, ko: true })) {
		setText('#lookout-title', ko.title);
		setText('[data-lookout-keys]', ko.keys);
		setText('[data-lookout-touch]', ko.touch);
		setText('[data-lookout-exit]', ko.close);
		zoom?.forEach((button) => button.setAttribute('aria-label', button.dataset.lookoutZoom === '1' ? ko.zoomIn : ko.zoomOut));
		dialog?.setAttribute('lang', 'ko');
	}
	function leave() {
		if (!camera.looking) return;
		drag = null;
		halt();
		camera.exit();
		dialog?.setAttribute('data-leaving', '');
	}
	function enter() {
		if (!dialog?.isConnected || dialog.open || !canLook() || !atLookout(site, pos) || camera.active) return;
		if (!camera.enter({ eye: site.eye, yaw: site.yaw, pitch: -.045 })) return;
		previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		dialog.removeAttribute('data-leaving');
		dialog.showModal();
		halt();
	}
	function offer(): Offer | null {
		if (camera.active || !dialog?.isConnected || !canLook() || !atLookout(site, pos)) return null;
		return { label: pick({ en: 'Look through the telescope', ko: '망원경 보기' }), go: enter };
	}
	close?.addEventListener('click', leave);
	dialog?.addEventListener('cancel', (e) => { e.preventDefault(); leave(); });
	dialog?.addEventListener('close', leave);
	zoom?.forEach((button) => button.addEventListener('click', () => camera.zoom(Number(button.dataset.lookoutZoom))));
	surface?.addEventListener('wheel', (e) => {
		e.preventDefault();
		camera.zoom(-Math.sign(e.deltaY) * .28);
	}, { passive: false });
	surface?.addEventListener('pointerdown', (e) => {
		if (drag || !camera.looking || (e.pointerType === 'mouse' && e.button !== 0)) return;
		surface.setPointerCapture(e.pointerId);
		drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
	});
	surface?.addEventListener('pointermove', (e) => {
		if (!drag || drag.id !== e.pointerId) return;
		camera.look((drag.x - e.clientX) * .0035, (e.clientY - drag.y) * .0035);
		drag.x = e.clientX;
		drag.y = e.clientY;
	});
	for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
		surface?.addEventListener(type, (e) => { if (drag?.id === e.pointerId) drag = null; });

	return {
		offer,
		key(key: string, e: KeyboardEvent) {
			if (!camera.active) return false;
			// Let native controls Tab and activate as usual; no key leaks down to locomotion.
			if (key === 'tab' || key === 'enter' || (key === ' ' && e.target instanceof HTMLElement && e.target.closest('button'))) return true;
			e.preventDefault();
			if ((key === 'escape' || key === 'e') && !e.repeat) leave();
			else if (key === 'arrowleft' || key === 'a') camera.look(-.045, 0);
			else if (key === 'arrowright' || key === 'd') camera.look(.045, 0);
			else if (key === 'arrowup' || key === 'w') camera.look(0, .04);
			else if (key === 'arrowdown' || key === 's') camera.look(0, -.04);
			else if (key === '+' || key === '=') camera.zoom(.5);
			else if (key === '-' || key === '_') camera.zoom(-.5);
			return true;
		},
		update(dt: number) {
			const wasActive = camera.active;
			camera.update(dt);
			if (wasActive && !camera.active) {
				halt();
				if (dialog?.open) dialog.close();
				previous?.focus({ preventScroll: true });
				previous = null;
			}
		},
	};
}
