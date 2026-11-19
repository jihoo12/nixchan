// Day and night. The site's clock button sets `data-time` on the page; each part of the island
// that changes with it (sky, sea, lamps…) registers with `on`, and is told the palette whenever it
// switches, so nothing has to know about everything else that changes colour (nixkit/daynight.ts).
import { createDayNight, type DayNight } from '../nixkit/daynight';

export { isNight } from '../nixkit/daynight';

export interface Palette {
	top: string;
	horizon: string;
	sunColor: string;
	sun: number;
	ambient: number;
	hemiSky: string;
	hemiGround: string;
	hemi: number;
	shallow: string;
	deep: string;
	foam: string;
	cloud: string;
	night: boolean;
}

export const DAY: Palette = {
	top: '#6fa6ee',
	horizon: '#d9e3fd',
	sunColor: '#fff3dc',
	sun: 1.8,
	ambient: 1.05,
	hemiSky: '#e3ebff',
	hemiGround: '#b6cf96',
	hemi: 0.55,
	shallow: '#86e3d6',
	deep: '#3a86d0',
	foam: '#ffffff',
	cloud: '#ffffff',
	night: false,
};

export const NIGHT: Palette = {
	top: '#0b0d2c',
	horizon: '#2e2c66',
	sunColor: '#c3ccff',
	sun: 0.7,
	ambient: 0.5,
	hemiSky: '#7d84d8',
	hemiGround: '#2c2a52',
	hemi: 0.45,
	shallow: '#3f86a6',
	deep: '#15264f',
	foam: '#c9d3ff',
	cloud: '#6e70a8',
	night: true,
};

export type Theme = DayNight<Palette>;

export const createTheme = (): Theme => createDayNight({ day: DAY, night: NIGHT });
