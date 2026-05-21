import type { ZoneHint } from "@/lib/aiCuesheetTypes";

export interface AiCuesheetZoneBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface AiCuesheetZoneDefinition {
	id: ZoneHint;
	label: string;
	bounds: AiCuesheetZoneBounds;
	sourceZoneId?: string;
	sourceZoneName?: string;
}

export interface AiCuesheetZoneProfile {
	name: string;
	canvas: { width: number; height: number };
	gridTemplateId?: string;
	splits?: unknown[];
	zones: Record<ZoneHint, AiCuesheetZoneDefinition>;
	updatedAt?: string;
}

export const AI_CUESHEET_ZONE_ORDER: ZoneHint[] = [
	"bottom_bar",
	"top_bar",
	"center",
	"left_third",
	"fullscreen",
];

export const DEFAULT_AI_CUESHEET_ZONE_PROFILE: AiCuesheetZoneProfile = {
	name: "표준 방송 그래픽 Zone",
	canvas: { width: 1920, height: 1080 },
	zones: {
		bottom_bar: {
			id: "bottom_bar",
			label: "Bottom Bar",
			bounds: { x: 0, y: 800, width: 1920, height: 230 },
		},
		top_bar: {
			id: "top_bar",
			label: "Top Bar",
			bounds: { x: 0, y: 40, width: 1920, height: 180 },
		},
		center: {
			id: "center",
			label: "Center",
			bounds: { x: 360, y: 220, width: 1200, height: 640 },
		},
		left_third: {
			id: "left_third",
			label: "Left Third",
			bounds: { x: 80, y: 180, width: 600, height: 720 },
		},
		fullscreen: {
			id: "fullscreen",
			label: "Fullscreen",
			bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		},
	},
};

interface TemplateZone {
	id?: string;
	name?: string;
	type?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	bounds?: AiCuesheetZoneBounds;
}

function toPixelBounds(
	zone: TemplateZone,
	canvas: { width: number; height: number },
): AiCuesheetZoneBounds | null {
	if (zone.bounds && typeof zone.bounds.x === "number") {
		return {
			x: Math.round(zone.bounds.x),
			y: Math.round(zone.bounds.y),
			width: Math.round(zone.bounds.width),
			height: Math.round(zone.bounds.height),
		};
	}
	if (
		typeof zone.x === "number" &&
		typeof zone.y === "number" &&
		typeof zone.width === "number" &&
		typeof zone.height === "number"
	) {
		return {
			x: Math.round((zone.x / 100) * canvas.width),
			y: Math.round((zone.y / 100) * canvas.height),
			width: Math.round((zone.width / 100) * canvas.width),
			height: Math.round((zone.height / 100) * canvas.height),
		};
	}
	return null;
}

function scoreZoneForHint(bounds: AiCuesheetZoneBounds, hint: ZoneHint): number {
	const cx = bounds.x + bounds.width / 2;
	const cy = bounds.y + bounds.height / 2;
	const area = bounds.width * bounds.height;
	const fullArea = 1920 * 1080;

	switch (hint) {
		case "bottom_bar":
			return cy + bounds.width * 0.2 - Math.abs(bounds.height - 220) * 1.5;
		case "top_bar":
			return 1080 - cy + bounds.width * 0.2 - Math.abs(bounds.height - 190) * 1.5;
		case "left_third":
			return 1920 - cx + bounds.height * 0.2 - Math.abs(bounds.width - 620);
		case "center":
			return 2000 - Math.abs(cx - 960) - Math.abs(cy - 540) + Math.min(area / 1000, 900);
		case "fullscreen":
			return area / fullArea + (bounds.x === 0 && bounds.y === 0 ? 1 : 0);
		default:
			return 0;
	}
}

function nameHint(name: string | undefined, hint: ZoneHint): number {
	const normalized = (name ?? "").toLowerCase().replace(/\s+/g, "_");
	const aliases: Record<ZoneHint, string[]> = {
		bottom_bar: ["bottom", "lower", "lower_third", "l3"],
		top_bar: ["top", "headline", "upper"],
		center: ["center", "main", "middle"],
		left_third: ["left", "left_third", "side", "panel"],
		fullscreen: ["fullscreen", "full_screen", "full"],
	};
	return aliases[hint].some((alias) => normalized.includes(alias)) ? 10000 : 0;
}

function pickZone(
	zones: Array<{ zone: TemplateZone; bounds: AiCuesheetZoneBounds }>,
	hint: ZoneHint,
): { zone: TemplateZone; bounds: AiCuesheetZoneBounds } | null {
	let best: { zone: TemplateZone; bounds: AiCuesheetZoneBounds } | null = null;
	let bestScore = Number.NEGATIVE_INFINITY;

	for (const candidate of zones) {
		const score = scoreZoneForHint(candidate.bounds, hint) + nameHint(candidate.zone.name ?? candidate.zone.type, hint);
		if (score > bestScore) {
			best = candidate;
			bestScore = score;
		}
	}
	return best;
}

export function applyGridTemplateToZoneProfile(
	template: { id?: string; name?: string; template_data?: any },
	fallback: AiCuesheetZoneProfile = DEFAULT_AI_CUESHEET_ZONE_PROFILE,
): AiCuesheetZoneProfile {
	const templateData = template.template_data ?? {};
	const canvas = {
		width: templateData.canvas?.width ?? fallback.canvas.width,
		height: templateData.canvas?.height ?? fallback.canvas.height,
	};
	const rawZones = Array.isArray(templateData.zones) ? templateData.zones : [];
	const candidates = rawZones
		.map((zone: TemplateZone) => ({ zone, bounds: toPixelBounds(zone, canvas) }))
		.filter((entry: { zone: TemplateZone; bounds: AiCuesheetZoneBounds | null }): entry is { zone: TemplateZone; bounds: AiCuesheetZoneBounds } => Boolean(entry.bounds));

	const nextZones = { ...fallback.zones };
	for (const hint of AI_CUESHEET_ZONE_ORDER) {
		const picked = hint === "fullscreen" ? null : pickZone(candidates, hint);
		if (!picked) {
			nextZones[hint] = {
				...fallback.zones[hint],
				bounds: hint === "fullscreen"
					? { x: 0, y: 0, width: canvas.width, height: canvas.height }
					: fallback.zones[hint].bounds,
			};
			continue;
		}
		nextZones[hint] = {
			...fallback.zones[hint],
			bounds: picked.bounds,
			sourceZoneId: picked.zone.id,
			sourceZoneName: picked.zone.name,
		};
	}

	return {
		name: `${template.name ?? "Grid Template"} 기반 세션 Zone`,
		canvas,
		gridTemplateId: template.id,
		splits: templateData.splits,
		zones: nextZones,
		updatedAt: new Date().toISOString(),
	};
}

export function getZoneDefinition(
	profile: AiCuesheetZoneProfile | null | undefined,
	hint: ZoneHint,
): AiCuesheetZoneDefinition {
	return (profile ?? DEFAULT_AI_CUESHEET_ZONE_PROFILE).zones[hint] ?? DEFAULT_AI_CUESHEET_ZONE_PROFILE.zones[hint];
}

export function formatZoneDefinitionForPrompt(zone: AiCuesheetZoneDefinition): string {
	const b = zone.bounds;
	return `${zone.id}: x=${b.x}px, y=${b.y}px, width=${b.width}px, height=${b.height}px`;
}
