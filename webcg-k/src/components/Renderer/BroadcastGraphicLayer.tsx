import {
	type AnimationEvent,
	type CSSProperties,
	useEffect,
	useMemo,
} from "react";
import {
	type BroadcastSourceType,
	normalizeBroadcastSourceData,
} from "../../lib/broadcastSourceData";
import {
	type GraphicLifecyclePolicy,
	resolveBroadcastLifecyclePolicy,
} from "../../lib/graphicLifecyclePolicy";
import { needsAnimatedGraphicRenderer } from "../../lib/graphicTemplateRuntime";
import type { RendererGraphicCommandDispatch } from "../../lib/rendererGraphicCommand";
import type { Resolution } from "../../lib/types/broadcast";
import { AnimatedGraphicRenderer } from "../AnimatedGraphicRenderer";
import {
	type GraphicElement,
	GraphicPreviewRenderer,
} from "../GraphicPreviewRenderer";
import { BroadcastHtmlOverlay } from "./BroadcastHtmlOverlay";
import {
	type OGrafCommandExecutionResult,
	OGrafWebComponentHost,
} from "./OGrafWebComponentHost";
import { RendererWhiteboard } from "./RendererWhiteboard";

export type BroadcastGraphicLayerPhase = "enter" | "idle" | "exit";
export type BroadcastGraphicLayerTransition = "cut" | "fade";

export interface BroadcastGraphicLayerItem {
	id: string;
	name: string;
	trackId?: number;
	color?: string;
	transitionIn?: BroadcastGraphicLayerTransition;
	transitionOut?: BroadcastGraphicLayerTransition;
	sourceType?: BroadcastSourceType;
	sourceData?: unknown;
}

interface BroadcastGraphicLayerProps {
	item: BroadcastGraphicLayerItem;
	phase?: BroadcastGraphicLayerPhase;
	resolution?: Resolution;
	fadeDurationMs?: number;
	zIndex?: number;
	className?: string;
	style?: CSSProperties;
	hideAnnotation?: boolean;
	fadeInKeyframesName?: string;
	fadeOutKeyframesName?: string;
	pointerEvents?: "auto" | "none";
	placeholderBorder?: CSSProperties["border"];
	command?: RendererGraphicCommandDispatch | null;
	onCommandHandled?: (
		command: RendererGraphicCommandDispatch,
		result: OGrafCommandExecutionResult,
	) => void;
	onEnterComplete?: () => void;
	onExitComplete?: () => void;
}

export function getBroadcastLayerCompletionDelayMs(
	lifecycle: GraphicLifecyclePolicy,
	phase: BroadcastGraphicLayerPhase,
	usesContainerTransition: boolean,
): number | null {
	if (phase === "idle") return null;
	if (usesContainerTransition) return null;
	const usesPackagePhaseMotion =
		phase === "enter"
			? lifecycle.usesPackageEnterMotion
			: lifecycle.usesPackageExitMotion;
	if (!usesPackagePhaseMotion) return 0;
	return phase === "enter" ? lifecycle.enterHoldMs : lifecycle.exitHoldMs;
}

export function BroadcastGraphicLayer({
	item,
	phase = "enter",
	resolution = "1080p",
	fadeDurationMs = 800,
	zIndex,
	className,
	style,
	hideAnnotation = false,
	fadeInKeyframesName = "fadeIn",
	fadeOutKeyframesName = "fadeOut",
	pointerEvents = "none",
	placeholderBorder,
	command,
	onCommandHandled,
	onEnterComplete,
	onExitComplete,
}: BroadcastGraphicLayerProps) {
	const source = useMemo(
		() => normalizeBroadcastSourceData(item.sourceType, item.sourceData),
		[item.sourceType, item.sourceData],
	);
	const lifecycle = useMemo(
		() => resolveBroadcastLifecyclePolicy(source, fadeDurationMs),
		[source, fadeDurationMs],
	);
	const transitionIn = item.transitionIn ?? "fade";
	const transitionOut = item.transitionOut ?? "fade";
	const usesPackagePhaseMotion =
		phase === "enter"
			? lifecycle.usesPackageEnterMotion
			: phase === "exit"
				? lifecycle.usesPackageExitMotion
				: false;
	const usesContainerTransition =
		!usesPackagePhaseMotion &&
		((phase === "enter" && transitionIn === "fade") ||
			(phase === "exit" && transitionOut === "fade"));
	const completionDelayMs = getBroadcastLayerCompletionDelayMs(
		lifecycle,
		phase,
		usesContainerTransition,
	);
	const rendererPhase = phase;
	const animation = usesContainerTransition
		? phase === "enter"
			? `${fadeInKeyframesName} ${fadeDurationMs}ms ease-out forwards`
			: `${fadeOutKeyframesName} ${fadeDurationMs}ms ease-in forwards`
		: undefined;

	useEffect(() => {
		if (completionDelayMs == null) return;
		const timeoutId = window.setTimeout(() => {
			if (phase === "enter") onEnterComplete?.();
			if (phase === "exit") onExitComplete?.();
		}, completionDelayMs);
		return () => window.clearTimeout(timeoutId);
	}, [completionDelayMs, onEnterComplete, onExitComplete, phase]);

	const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
		if (event.currentTarget !== event.target) return;
		if (!usesContainerTransition) return;
		if (phase === "enter") onEnterComplete?.();
		if (phase === "exit") onExitComplete?.();
	};

	if (source.kind === "whiteboard" && hideAnnotation) return null;

	return (
		<div
			className={className}
			style={{
				position: "absolute",
				inset: 0,
				zIndex,
				animation,
				opacity: phase === "idle" ? 1 : undefined,
				...style,
			}}
			onAnimationEnd={handleAnimationEnd}
		>
			{source.kind === "whiteboard" ? (
				<RendererWhiteboard
					whiteboardId={source.whiteboardId}
					phase={rendererPhase}
				/>
			) : source.kind === "overlay" ? (
				<BroadcastHtmlOverlay
					payload={source.overlay}
					title={item.name}
					phase={rendererPhase}
					pointerEvents={pointerEvents}
				/>
			) : source.kind === "ograf" ? (
				<OGrafWebComponentHost
					payload={source.ograf}
					title={item.name}
					command={command ?? null}
					onCommandHandled={onCommandHandled}
					phase={rendererPhase}
					pointerEvents={pointerEvents}
				/>
			) : source.kind === "template" ? (
				needsAnimatedGraphicRenderer(source.elements) ? (
					<AnimatedGraphicRenderer
						elements={source.elements as GraphicElement[]}
						canvasWidth={source.canvasWidth}
						canvasHeight={source.canvasHeight}
						phase={rendererPhase}
						style={{ width: "100%", height: "100%" }}
						resolution={resolution}
					/>
				) : (
					<GraphicPreviewRenderer
						elements={source.elements as GraphicElement[]}
						canvasWidth={source.canvasWidth}
						canvasHeight={source.canvasHeight}
						resolution={resolution}
						style={{ width: "100%", height: "100%" }}
					/>
				)
			) : source.kind === "image" ? (
				<img
					src={source.imageUrl}
					alt={source.imageName || item.name}
					style={getImageStyle(source)}
				/>
			) : (
				<BroadcastLayerPlaceholder item={item} border={placeholderBorder} />
			)}
		</div>
	);
}

function getImageStyle(source: {
	imageX?: number;
	imageY?: number;
	imageW?: number;
	imageH?: number;
}): CSSProperties {
	if (source.imageX !== undefined && source.imageY !== undefined) {
		return {
			position: "absolute",
			left: `${(source.imageX / 1920) * 100}%`,
			top: `${(source.imageY / 1080) * 100}%`,
			width: source.imageW ? `${(source.imageW / 1920) * 100}%` : "100%",
			height: source.imageH ? `${(source.imageH / 1080) * 100}%` : "100%",
			objectFit: "contain",
			pointerEvents: "none",
		};
	}

	return {
		width: "100%",
		height: "100%",
		objectFit: "contain",
		pointerEvents: "none",
	};
}

function BroadcastLayerPlaceholder({
	item,
	border,
}: {
	item: BroadcastGraphicLayerItem;
	border?: CSSProperties["border"];
}) {
	return (
		<div
			className="absolute inset-0 flex items-center justify-center"
			style={{
				backgroundColor:
					item.color?.replace(/[\d.]+\)$/, "0.15)") ||
					"rgba(100, 100, 100, 0.15)",
				border,
			}}
		>
			<div className="text-center">
				<div
					className="text-lg font-bold mb-1"
					style={{
						color: "var(--text-primary)",
						textShadow: "0 1px 3px rgba(0,0,0,0.5)",
					}}
				>
					{item.name}
				</div>
				<div
					className="text-xs opacity-70"
					style={{ color: "var(--text-secondary)" }}
				>
					T{item.trackId ?? 0} | {item.sourceType || "unknown"}
				</div>
			</div>
		</div>
	);
}
