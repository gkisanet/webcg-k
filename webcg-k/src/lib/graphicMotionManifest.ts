import { z } from "zod";

export const GRAPHIC_MOTION_SCHEMA_VERSION = "webcgk.motion.v2" as const;

const MotionPresetSchema = z.enum([
	"fade",
	"lower-third",
	"headline",
	"scoreboard",
	"stat",
	"pop",
	"slide-left",
	"slide-right",
	"slide-up",
	"slide-down",
	"none",
]);

const MotionDriverSchema = z.enum(["waapi", "gsap"]);

const MotionTimelineItemSchema = z
	.object({
		target: z.string().min(1),
		in: MotionPresetSchema.optional(),
		out: MotionPresetSchema.optional(),
		motion: MotionPresetSchema.optional(),
		kind: MotionPresetSchema.optional(),
		at: z.number().nonnegative().optional(),
		duration: z.number().nonnegative().optional(),
		delay: z.number().nonnegative().optional(),
		stagger: z.number().nonnegative().optional(),
		ease: z.string().optional(),
		easing: z.string().optional(),
		driver: MotionDriverSchema.optional(),
		group: z.string().optional(),
	})
	.passthrough();

const GraphicMotionManifestSchema = z
	.object({
		schemaVersion: z
			.literal(GRAPHIC_MOTION_SCHEMA_VERSION)
			.default(GRAPHIC_MOTION_SCHEMA_VERSION),
		timeline: z.array(MotionTimelineItemSchema).default([]),
	})
	.passthrough();

export type GraphicMotionPreset = z.infer<typeof MotionPresetSchema>;
export type GraphicMotionDriver = z.infer<typeof MotionDriverSchema>;
export type GraphicMotionTimelineItem = z.infer<
	typeof MotionTimelineItemSchema
>;
export type GraphicMotionManifest = z.infer<typeof GraphicMotionManifestSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeMotionCandidate(raw: unknown): unknown {
	if (Array.isArray(raw)) {
		return { schemaVersion: GRAPHIC_MOTION_SCHEMA_VERSION, timeline: raw };
	}
	if (!isRecord(raw)) return raw;
	if (Array.isArray(raw.timeline)) return raw;
	if (Array.isArray(raw.items)) {
		return {
			...raw,
			schemaVersion:
				raw.schemaVersion === GRAPHIC_MOTION_SCHEMA_VERSION
					? raw.schemaVersion
					: GRAPHIC_MOTION_SCHEMA_VERSION,
			timeline: raw.items,
		};
	}
	return raw;
}

export function normalizeGraphicMotionManifest(
	raw: unknown,
): GraphicMotionManifest | null {
	const candidate = normalizeMotionCandidate(raw);
	const parsed = GraphicMotionManifestSchema.safeParse(candidate);
	if (!parsed.success) return null;

	return {
		...parsed.data,
		schemaVersion: GRAPHIC_MOTION_SCHEMA_VERSION,
		timeline: parsed.data.timeline.filter((item) => {
			return (
				item.target.trim().length > 0 &&
				(item.in != null ||
					item.out != null ||
					item.motion != null ||
					item.kind != null)
			);
		}),
	};
}

export function getGraphicMotionItemCount(raw: unknown): number {
	return normalizeGraphicMotionManifest(raw)?.timeline.length ?? 0;
}

export function graphicMotionManifestToRuntimeTimeline(
	manifest: GraphicMotionManifest | null | undefined,
): GraphicMotionTimelineItem[] {
	return manifest?.timeline ?? [];
}

function normalizeLegacyPreset(
	type: unknown,
	direction: "in" | "out",
): GraphicMotionPreset | undefined {
	if (typeof type !== "string") return undefined;
	const normalized = type.trim().toLowerCase();
	const parsed = MotionPresetSchema.safeParse(normalized);
	if (parsed.success) return parsed.data;

	switch (normalized) {
		case "slide":
			return "slide-up";
		case "scale":
		case "zoom":
			return "pop";
		case "cut":
			return "none";
		default:
			return direction === "in" ? "fade" : undefined;
	}
}

function getLegacyDuration(config: unknown): number | undefined {
	return isRecord(config) && typeof config.duration === "number"
		? config.duration
		: undefined;
}

export function buildMotionManifestFromLegacyAnimationConfig(
	animationConfig: unknown,
	target = "#overlay",
): GraphicMotionManifest | null {
	if (!isRecord(animationConfig)) return null;

	const inConfig = isRecord(animationConfig.in) ? animationConfig.in : null;
	const outConfig = isRecord(animationConfig.out) ? animationConfig.out : null;
	const inType = inConfig?.type ?? animationConfig.in_type;
	const outType = outConfig?.type ?? animationConfig.out_type;
	const inPreset = normalizeLegacyPreset(inType, "in");
	const outPreset = normalizeLegacyPreset(outType, "out");

	if (!inPreset && !outPreset) return null;

	return {
		schemaVersion: GRAPHIC_MOTION_SCHEMA_VERSION,
		timeline: [
			{
				target,
				in: inPreset,
				out: outPreset,
				duration:
					getLegacyDuration(inConfig) ??
					getLegacyDuration(outConfig) ??
					(typeof animationConfig.in_duration === "number"
						? animationConfig.in_duration
						: undefined),
			},
		],
	};
}
