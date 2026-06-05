import {
	type BroadcastSourceType,
	type NormalizedBroadcastSourceData,
	normalizeBroadcastSourceData,
} from "./broadcastSourceData";
import type {
	GraphicMotionManifest,
	GraphicMotionTimelineItem,
} from "./graphicMotionManifest";

const DEFAULT_MOTION_DURATION_MS = 520;
const MOTION_EXIT_SAFETY_MS = 120;

export interface GraphicLifecyclePolicy {
	/** true면 legacy outer container fade/cut을 사용한다. */
	useContainerAnimation: boolean;
	/** package 내부 object timeline이 lifecycle motion을 소유한다. */
	usesPackageMotion: boolean;
	/** package 내부 object timeline이 show motion을 소유한다. */
	usesPackageEnterMotion: boolean;
	/** package 내부 object timeline이 hide motion을 소유한다. */
	usesPackageExitMotion: boolean;
	/** 외부 stable 전환 전에 내부 show motion을 기다릴 시간. */
	enterHoldMs: number;
	/** 외부 cleanup 전에 내부 hide motion을 기다릴 시간. */
	exitHoldMs: number;
}

export function hasGraphicMotionTimeline(
	motion: GraphicMotionManifest | null | undefined,
): boolean {
	return (motion?.timeline.length ?? 0) > 0;
}

export function getNormalizedBroadcastSourceMotion(
	source: NormalizedBroadcastSourceData,
): GraphicMotionManifest | null {
	if (source.kind === "overlay") return source.overlay.motion ?? null;
	if (source.kind === "ograf") return source.ograf.motion ?? null;
	if (source.kind === "template") return source.motion ?? null;
	return null;
}

export function getGraphicMotionTimelineHoldMs(
	motion: GraphicMotionManifest | null | undefined,
): number {
	if (!hasGraphicMotionTimeline(motion)) return 0;

	const exitTimeline = motion.timeline.filter(hasTimelineExitMotion);
	if (exitTimeline.length === 0) return 0;

	const maxEnd = Math.max(
		...exitTimeline.map((item) => timelineItemEndMs(item)),
		DEFAULT_MOTION_DURATION_MS,
	);
	return maxEnd + MOTION_EXIT_SAFETY_MS;
}

export function getGraphicMotionTimelineEnterHoldMs(
	motion: GraphicMotionManifest | null | undefined,
): number {
	if (!hasGraphicMotionTimeline(motion)) return 0;

	const enterTimeline = motion.timeline.filter(hasTimelineEnterMotion);
	if (enterTimeline.length === 0) return 0;

	const maxEnd = Math.max(
		...enterTimeline.map((item) => timelineItemEndMs(item)),
		DEFAULT_MOTION_DURATION_MS,
	);
	return maxEnd + MOTION_EXIT_SAFETY_MS;
}

export function resolveBroadcastLifecyclePolicy(
	source: NormalizedBroadcastSourceData,
	fallbackFadeDurationMs: number,
): GraphicLifecyclePolicy {
	const motion = getNormalizedBroadcastSourceMotion(source);
	if (hasGraphicMotionTimeline(motion)) {
		const enterHoldMs = getGraphicMotionTimelineEnterHoldMs(motion);
		const exitHoldMs = getGraphicMotionTimelineHoldMs(motion);
		return {
			useContainerAnimation: enterHoldMs === 0 || exitHoldMs === 0,
			usesPackageMotion: true,
			usesPackageEnterMotion: enterHoldMs > 0,
			usesPackageExitMotion: exitHoldMs > 0,
			enterHoldMs,
			exitHoldMs,
		};
	}

	return {
		useContainerAnimation: true,
		usesPackageMotion: false,
		usesPackageEnterMotion: false,
		usesPackageExitMotion: false,
		enterHoldMs: fallbackFadeDurationMs,
		exitHoldMs: fallbackFadeDurationMs,
	};
}

export function resolveBroadcastSourceLifecyclePolicy(
	sourceType: BroadcastSourceType,
	sourceData: unknown,
	fallbackFadeDurationMs: number,
): GraphicLifecyclePolicy {
	return resolveBroadcastLifecyclePolicy(
		normalizeBroadcastSourceData(sourceType, sourceData),
		fallbackFadeDurationMs,
	);
}

export function usesBroadcastPackageMotion(
	sourceType: BroadcastSourceType,
	sourceData: unknown,
): boolean {
	return resolveBroadcastSourceLifecyclePolicy(sourceType, sourceData, 0)
		.usesPackageMotion;
}

export function usesBroadcastPackagePhaseMotion(
	sourceType: BroadcastSourceType,
	sourceData: unknown,
	phase: "enter" | "exit",
): boolean {
	const lifecycle = resolveBroadcastSourceLifecyclePolicy(
		sourceType,
		sourceData,
		0,
	);
	return phase === "enter"
		? lifecycle.usesPackageEnterMotion
		: lifecycle.usesPackageExitMotion;
}

function timelineItemEndMs(item: GraphicMotionTimelineItem): number {
	const start =
		typeof item.at === "number"
			? item.at
			: typeof item.delay === "number"
				? item.delay
				: 0;
	const duration =
		typeof item.duration === "number"
			? item.duration
			: DEFAULT_MOTION_DURATION_MS;
	const stagger = typeof item.stagger === "number" ? item.stagger : 0;
	return start + duration + stagger;
}

function hasTimelineExitMotion(item: GraphicMotionTimelineItem): boolean {
	if (item.out === "none") return false;
	if (item.out) return true;
	if (item.motion === "none" || item.kind === "none") return false;
	return Boolean(item.motion || item.kind);
}

function hasTimelineEnterMotion(item: GraphicMotionTimelineItem): boolean {
	if (item.in === "none") return false;
	if (item.in) return true;
	if (item.motion === "none" || item.kind === "none") return false;
	return Boolean(item.motion || item.kind);
}
