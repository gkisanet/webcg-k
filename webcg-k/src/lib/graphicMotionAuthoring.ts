import {
	GRAPHIC_MOTION_SCHEMA_VERSION,
	type GraphicMotionDriver,
	type GraphicMotionManifest,
	type GraphicMotionPreset,
	type GraphicMotionTimelineItem,
	normalizeGraphicMotionManifest,
} from "./graphicMotionManifest";

export const MOTION_AUTHORING_PRESETS: {
	value: GraphicMotionPreset;
	label: string;
}[] = [
	{ value: "lower-third", label: "Lower third" },
	{ value: "headline", label: "Headline" },
	{ value: "scoreboard", label: "Scoreboard" },
	{ value: "stat", label: "Stat pop" },
	{ value: "fade", label: "Fade" },
	{ value: "slide-up", label: "Slide up" },
	{ value: "slide-down", label: "Slide down" },
	{ value: "slide-left", label: "Slide left" },
	{ value: "slide-right", label: "Slide right" },
	{ value: "pop", label: "Pop" },
	{ value: "none", label: "None" },
];

export const MOTION_AUTHORING_DRIVERS: {
	value: GraphicMotionDriver;
	label: string;
	description: string;
}[] = [
	{
		value: "waapi",
		label: "WAAPI",
		description: "기본 브라우저 motion driver",
	},
	{
		value: "gsap",
		label: "GSAP",
		description: "runtime에 GSAP이 있을 때만 사용, 없으면 WAAPI fallback",
	},
];

const DEFAULT_TARGET = "#overlay";
const DEFAULT_DURATION_MS = 520;

export interface MotionAuthoringSummary {
	enabled: boolean;
	itemCount: number;
	usesGsap: boolean;
	targets: string[];
}

export function createMotionTimelineItem(
	overrides: Partial<GraphicMotionTimelineItem> = {},
): GraphicMotionTimelineItem {
	return sanitizeMotionItem({
		target: DEFAULT_TARGET,
		in: "lower-third",
		out: "fade",
		duration: DEFAULT_DURATION_MS,
		driver: "waapi",
		...overrides,
	});
}

export function createDefaultMotionManifest(
	target = DEFAULT_TARGET,
): GraphicMotionManifest {
	return {
		schemaVersion: GRAPHIC_MOTION_SCHEMA_VERSION,
		timeline: [createMotionTimelineItem({ target })],
	};
}

export function ensureEditableMotionManifest(
	raw: GraphicMotionManifest | null | undefined,
	target = DEFAULT_TARGET,
): GraphicMotionManifest {
	const normalized = normalizeGraphicMotionManifest(raw);
	if (normalized && normalized.timeline.length > 0) {
		return normalized;
	}
	return createDefaultMotionManifest(target);
}

export function addMotionTimelineItem(
	raw: GraphicMotionManifest | null | undefined,
	item: Partial<GraphicMotionTimelineItem> = {},
): GraphicMotionManifest {
	const base = normalizeGraphicMotionManifest(raw) ?? {
		schemaVersion: GRAPHIC_MOTION_SCHEMA_VERSION,
		timeline: [],
	};
	return {
		...base,
		timeline: [...base.timeline, createMotionTimelineItem(item)],
	};
}

export function updateMotionTimelineItem(
	raw: GraphicMotionManifest | null | undefined,
	index: number,
	patch: Partial<GraphicMotionTimelineItem>,
): GraphicMotionManifest {
	const base = ensureEditableMotionManifest(raw);
	return {
		...base,
		timeline: base.timeline.map((item, itemIndex) =>
			itemIndex === index ? sanitizeMotionItem({ ...item, ...patch }) : item,
		),
	};
}

export function removeMotionTimelineItem(
	raw: GraphicMotionManifest | null | undefined,
	index: number,
): GraphicMotionManifest | null {
	const base = normalizeGraphicMotionManifest(raw);
	if (!base) return null;
	const timeline = base.timeline.filter((_, itemIndex) => itemIndex !== index);
	return timeline.length > 0 ? { ...base, timeline } : null;
}

export function getMotionAuthoringSummary(
	raw: GraphicMotionManifest | null | undefined,
): MotionAuthoringSummary {
	const normalized = normalizeGraphicMotionManifest(raw);
	if (!normalized || normalized.timeline.length === 0) {
		return { enabled: false, itemCount: 0, usesGsap: false, targets: [] };
	}

	return {
		enabled: true,
		itemCount: normalized.timeline.length,
		usesGsap: normalized.timeline.some((item) => item.driver === "gsap"),
		targets: normalized.timeline.map((item) => item.target),
	};
}

function sanitizeMotionItem(
	item: GraphicMotionTimelineItem,
): GraphicMotionTimelineItem {
	const next: GraphicMotionTimelineItem = {
		...item,
		target: item.target.trim() || DEFAULT_TARGET,
	};

	if (typeof next.duration === "number") {
		next.duration = clamp(Math.round(next.duration), 100, 3000);
	}
	if (typeof next.at === "number") {
		next.at = clamp(Math.round(next.at), 0, 10000);
	}
	if (typeof next.delay === "number") {
		next.delay = clamp(Math.round(next.delay), 0, 10000);
	}
	if (typeof next.stagger === "number") {
		next.stagger = clamp(Math.round(next.stagger), 0, 1000);
	}

	return removeUndefined(next);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
	const next = { ...value };
	for (const key of Object.keys(next)) {
		if (next[key] === undefined) delete next[key];
	}
	return next;
}
