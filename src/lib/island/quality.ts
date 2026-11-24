// Keep the 3D world and camera exactly the same on phones; spend less on their framebuffers.
export function islandQuality(coarse: boolean, small: boolean, requested: string | null) {
	const lighter = requested === 'low' || (requested !== 'high' && coarse && small);
	return lighter
		? { maxPixelRatio: 1.25, antialias: false }
		: { maxPixelRatio: 1.75, antialias: true };
}
