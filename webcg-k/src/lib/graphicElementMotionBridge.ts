import {
	GRAPHIC_MOTION_SCHEMA_VERSION,
	type GraphicMotionManifest,
	type GraphicMotionPreset,
	type GraphicMotionTimelineItem,
} from "./graphicMotionManifest";
import { isRecord } from "./rundownOverlayData";

interface ElementAnimationPhase {
	type?: unknown;
	duration?: unknown;
	delay?: unknown;
	easing?: unknown;
}

interface GraphicElementMotionSource {
	id?: unknown;
	name?: unknown;
	visible?: unknown;
	animation?: unknown;
}

const DEFAULT_ENTER_DURATION_MS = 500;
const DEFAULT_EXIT_DURATION_MS = 400;

function toNonNegativeNumber(
	value: unknown,
	fallback: number,
	max = 10000,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(0, Math.round(value)));
}

function toOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function cssAttributeString(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function graphicElementMotionTarget(elementId: string): string {
	return `[data-element-id="${cssAttributeString(elementId)}"]`;
}

function enterPresetFromElement(
	type: unknown,
): GraphicMotionPreset | undefined {
	switch (type) {
		case "fadeIn":
			return "fade";
		case "slideLeft":
			return "slide-left";
		case "slideRight":
			return "slide-right";
		case "slideUp":
			return "slide-up";
		case "slideDown":
			return "slide-down";
		case "zoomIn":
		case "bounce":
			return "pop";
		case "expand":
			return "stat";
		case "reveal":
		case "maskIn":
		case "maskInLeft":
		case "maskInRight":
		case "typewriter":
			return "headline";
		default:
			return undefined;
	}
}

function exitPresetFromElement(type: unknown): GraphicMotionPreset | undefined {
	switch (type) {
		case "fadeOut":
			return "fade";
		case "slideLeft":
			return "slide-left";
		case "slideRight":
			return "slide-right";
		case "slideUp":
			return "slide-up";
		case "slideDown":
			return "slide-down";
		case "zoomOut":
		case "shrink":
		case "collapse":
		case "maskOut":
		case "maskOutLeft":
		case "maskOutRight":
			return "pop";
		default:
			return undefined;
	}
}

function timelineItemForPhase(params: {
	target: string;
	preset: GraphicMotionPreset;
	phase: "enter" | "exit";
	animation: ElementAnimationPhase;
	elementName?: string;
}): GraphicMotionTimelineItem {
	const duration = toNonNegativeNumber(
		params.animation.duration,
		params.phase === "enter"
			? DEFAULT_ENTER_DURATION_MS
			: DEFAULT_EXIT_DURATION_MS,
	);
	const at = toNonNegativeNumber(params.animation.delay, 0);
	const easing = toOptionalString(params.animation.easing);

	return {
		target: params.target,
		in: params.phase === "enter" ? params.preset : "none",
		out: params.phase === "exit" ? params.preset : "none",
		at,
		duration,
		easing,
		driver: "waapi",
		group: params.elementName,
	};
}

function timelineItemsForElement(
	element: GraphicElementMotionSource,
): GraphicMotionTimelineItem[] {
	if (element.visible === false) return [];
	if (!isRecord(element.animation)) return [];

	const elementId = toOptionalString(element.id);
	if (!elementId) return [];

	const target = graphicElementMotionTarget(elementId);
	const elementName = toOptionalString(element.name);
	const items: GraphicMotionTimelineItem[] = [];
	const enter = isRecord(element.animation.enter)
		? (element.animation.enter as ElementAnimationPhase)
		: null;
	const exit = isRecord(element.animation.exit)
		? (element.animation.exit as ElementAnimationPhase)
		: null;
	const enterPreset = enter ? enterPresetFromElement(enter.type) : undefined;
	const exitPreset = exit ? exitPresetFromElement(exit.type) : undefined;

	if (enter && enterPreset) {
		items.push(
			timelineItemForPhase({
				target,
				preset: enterPreset,
				phase: "enter",
				animation: enter,
				elementName,
			}),
		);
	}
	if (exit && exitPreset) {
		items.push(
			timelineItemForPhase({
				target,
				preset: exitPreset,
				phase: "exit",
				animation: exit,
				elementName,
			}),
		);
	}

	return items;
}

export function buildMotionManifestFromGraphicElements(
	elements: unknown,
): GraphicMotionManifest | null {
	if (!Array.isArray(elements)) return null;

	const timeline = elements
		.filter(isRecord)
		.flatMap((element) =>
			timelineItemsForElement(element as GraphicElementMotionSource),
		);

	if (timeline.length === 0) return null;

	return {
		schemaVersion: GRAPHIC_MOTION_SCHEMA_VERSION,
		timeline,
	};
}

export function getGraphicElementMotionItemCount(elements: unknown): number {
	return buildMotionManifestFromGraphicElements(elements)?.timeline.length ?? 0;
}
