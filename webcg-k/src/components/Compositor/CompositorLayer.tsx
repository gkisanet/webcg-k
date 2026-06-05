/**
 * CompositorLayer — SVG 오버레이 + HTML 플러그인 iframe + Semantic Renderer 통합 렌더링
 *
 * ■ Why 통합?
 *   기존 OverlayPlayoutLayer(SVG)와 PluginOverlayLayer(HTML)가 각각
 *   독립 Realtime 구독 + DB 조회를 했으나, 실제 하는 일은:
 *   1. overlay 목록 받기 → 2. zone_bounds로 배치 → 3. 타입에 따라 렌더
 *   이 3단계가 동일하므로 하나로 합친다.
 *
 * ■ v3: SemanticRenderer 추가
 *   plugin_type === "semantic" 이면 SemanticOverlayLayer로 라우팅.
 *   기존 SVG/HTML iframe 경로와 공존.
 *
 * ■ props:
 *   overlays — useOverlayStore의 previewOverlays 또는 programOverlays
 *   (이미 PVW/PGM 필터링이 적용된 상태)
 *
 * ■ 비유:
 *   "방송국 합성기(Compositor)는 영상 소스가 SDI든 IP든 상관없이
 *    같은 레이어 시스템으로 합성한다."
 */

import type React from "react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	OverlayStateItem,
	RenderState,
} from "../../hooks/useOverlayStore";
import {
	getGraphicMotionTimelineEnterHoldMs,
	getGraphicMotionTimelineHoldMs,
	hasGraphicMotionTimeline,
} from "../../lib/graphicLifecyclePolicy";
import { normalizeGraphicMotionManifest } from "../../lib/graphicMotionManifest";
import type { SemanticScene } from "../../lib/types/semanticTypes";
import type { PluginAction, PluginMessage } from "../../lib/webcgkSrcdoc";
import { buildPluginSrcdoc } from "../../lib/webcgkSrcdoc";
import {
	type GraphicElement,
	GraphicPreviewRenderer,
} from "../GraphicPreviewRenderer";
import { SemanticRenderer } from "../SemanticRenderer/SemanticRenderer";

// ─── 상수 ─────────────────────────────────────────────────────
const BASE_W = 1920;
const BASE_H = 1080;
const DEFAULT_FADE_MS = 500;
const HTML_IFRAME_STARTUP_STAGGER_MS = 48;

// ─── 애니메이션 페이즈 ─────────────────────────────────────────
type AnimPhase = "entering" | "stable" | "leaving";
type OverlayTemplate = NonNullable<OverlayStateItem["template"]>;

interface OverlayAnimationPhaseConfig {
	type?: string;
	duration?: number;
}

interface OverlayCycleContent {
	elements?: GraphicElement[];
}

interface OverlayCycleAction {
	type?: string;
	config?: {
		contents?: OverlayCycleContent[];
	};
}

interface OverlayAnimationConfig {
	in?: OverlayAnimationPhaseConfig;
	out?: OverlayAnimationPhaseConfig;
	in_type?: string;
	out_type?: string;
	in_duration?: number;
	out_duration?: number;
	actions?: OverlayCycleAction[];
}

type OverlaySourceCodeWithMotion = NonNullable<
	OverlayTemplate["source_code"]
> & {
	motion?: unknown;
};

function safeStableStringify(value: unknown): string {
	if (value == null) return "";
	try {
		return JSON.stringify(value);
	} catch {
		return "";
	}
}

function parseStableJson(value: string): unknown {
	if (!value) return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

// ─── WAAPI 키프레임 (6종 fade/slide/scale) ──────────────────────
// ■ Why WAAPI? setTimeout 추정 대신 element.animate() + onfinish 사용.
//   렌더링 엔진의 실제 완료 시점에 정확히 호출되어 타이밍 결정론 확보.
//   탭 비활성화/프레임 드랍에도 정확한 종료 감지 가능.
const OVERLAY_KEYFRAMES: Record<string, Keyframe[]> = {
	fadeIn: [{ opacity: 0 }, { opacity: 1 }],
	fadeOut: [{ opacity: 1 }, { opacity: 0 }],
	slideInUp: [
		{ opacity: 0, transform: "translateY(30px)" },
		{ opacity: 1, transform: "translateY(0)" },
	],
	slideOutDown: [
		{ opacity: 1, transform: "translateY(0)" },
		{ opacity: 0, transform: "translateY(30px)" },
	],
	scaleIn: [
		{ opacity: 0, transform: "scale(0.85)" },
		{ opacity: 1, transform: "scale(1)" },
	],
	scaleOut: [
		{ opacity: 1, transform: "scale(1)" },
		{ opacity: 0, transform: "scale(0.85)" },
	],
};

function resolveOverlayKeyframes(
	type: string,
	dir: "in" | "out",
): Keyframe[] | null {
	switch (type) {
		case "slide":
			return dir === "in"
				? OVERLAY_KEYFRAMES.slideInUp
				: OVERLAY_KEYFRAMES.slideOutDown;
		case "scale":
			return dir === "in"
				? OVERLAY_KEYFRAMES.scaleIn
				: OVERLAY_KEYFRAMES.scaleOut;
		default:
			return dir === "in"
				? OVERLAY_KEYFRAMES.fadeIn
				: OVERLAY_KEYFRAMES.fadeOut;
	}
}

function getOverlayAnimationConfig(
	template: OverlayTemplate | null | undefined,
): OverlayAnimationConfig {
	return (template?.animation_config ?? {}) as OverlayAnimationConfig;
}

function getOverlaySourceMotion(
	sourceCode: OverlayTemplate["source_code"] | null | undefined,
): unknown {
	return (sourceCode as OverlaySourceCodeWithMotion | null | undefined)?.motion;
}

function getSemanticScene(
	overlay: OverlayStateItem,
): SemanticScene | undefined {
	return (overlay as OverlayStateItem & { semantic_scene?: SemanticScene })
		.semantic_scene;
}

function isPluginActionMessage(
	msg: PluginMessage,
): msg is PluginMessage & PluginAction {
	return (
		msg.type === "action" &&
		typeof (msg as PluginMessage & { action?: unknown }).action === "string"
	);
}

// ─── webcgk-api ─────────────────────────────────────────────────
// 인라인 API 코드와 srcdoc 생성은 lib/webcgkSrcdoc.ts로 단일 원본화.
// 이전에는 이 파일에 35줄짜리 인라인 코드가 있었으나 DRY 위반이므로 제거.

// ─── Map 동등성 비교 헬퍼 ──────────────────────────────────────────
function areMapsEqual<K, V>(map1: Map<K, V>, map2: Map<K, V>): boolean {
	if (map1.size !== map2.size) return false;
	for (const [key, val] of map1) {
		if (map2.get(key) !== val) return false;
	}
	return true;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
interface CompositorLayerProps {
	overlays: OverlayStateItem[];
	/** 다른 monitor surface로 이동한 overlay는 이 surface에서 exit animation을 생략 */
	skipExitOverlayIds?: ReadonlySet<string>;
	/** iframe PluginAction 콜백 — 부모(Controller/Renderer)가 handlePluginAction에 연결 */
	onPluginAction?: (overlayId: string, action: PluginAction) => void;
	/** 렌더링 상태 변경 보고 — Renderer가 useOverlayStore.reportRenderState에 연결 */
	onRenderStateChange?: (overlayId: string, state: RenderState) => void;
}

export function CompositorLayer({
	overlays,
	skipExitOverlayIds,
	onPluginAction,
	onRenderStateChange,
}: CompositorLayerProps) {
	// ■ 애니메이션 페이즈 관리
	// overlay가 목록에 추가되면 entering → stable
	// overlay가 목록에서 빠지면 leaving → 제거
	const [phases, setPhases] = useState<Map<string, AnimPhase>>(new Map());
	// leaving 중인 overlay를 유지하기 위한 ref
	const [leavingOverlays, setLeavingOverlays] = useState<
		Map<string, OverlayStateItem>
	>(new Map());
	const prevIdsRef = useRef<Set<string>>(new Set());
	const prevOverlaysRef = useRef<OverlayStateItem[]>([]);

	// ■ CQRS: render_state 보고용 ref
	const prevPhasesForReportRef = useRef<Map<string, AnimPhase>>(new Map());
	const onRenderStateChangeRef = useRef(onRenderStateChange);
	onRenderStateChangeRef.current = onRenderStateChange;

	// 오버레이 목록 변경 시 페이즈 계산
	useEffect(() => {
		const currentIds = new Set(overlays.map((o) => o.id));
		const prevIds = prevIdsRef.current;

		setPhases((prev) => {
			const next = new Map<string, AnimPhase>();

			// 1. 현재 활성 오버레이
			for (const o of overlays) {
				const wasPresent = prevIds.has(o.id);
				const existingPhase = prev.get(o.id);

				if (!wasPresent && !existingPhase) {
					// 새로 추가됨 → entering
					next.set(o.id, "entering");
				} else {
					// 기존 유지
					next.set(o.id, existingPhase === "entering" ? "entering" : "stable");
				}
			}

			// 2. 이전에 있었지만 지금 없는 → leaving
			for (const id of prevIds) {
				if (skipExitOverlayIds?.has(id)) continue;
				if (!currentIds.has(id)) {
					next.set(id, "leaving");
				}
			}

			if (areMapsEqual(prev, next)) {
				return prev;
			}
			return next;
		});

		// leaving 중인 오버레이 데이터 보존
		setLeavingOverlays((prev) => {
			const next = new Map(prev);
			// 현재 목록에 있는 것은 leaving에서 제거
			for (const o of overlays) {
				next.delete(o.id);
			}
			// 이전에 있었지만 지금 없는 것 → leaving 목록에 추가
			for (const id of prevIds) {
				if (skipExitOverlayIds?.has(id)) continue;
				if (!currentIds.has(id) && !next.has(id)) {
					const item = prevOverlaysRef.current.find((o) => o.id === id);
					if (item) {
						next.set(id, item);
					}
				}
			}
			if (areMapsEqual(prev, next)) {
				return prev;
			}
			return next;
		});

		prevIdsRef.current = currentIds;
		prevOverlaysRef.current = overlays;
	}, [overlays, skipExitOverlayIds]);

	// ■ WAAPI onfinish 콜백 — setTimeout 추정을 렌더링 엔진 실제 완료로 대체
	const handleEnterComplete = useCallback((overlayId: string) => {
		setPhases((prev) => {
			const next = new Map(prev);
			if (next.get(overlayId) === "entering") next.set(overlayId, "stable");
			return next;
		});
	}, []);

	const handleExitComplete = useCallback((overlayId: string) => {
		setPhases((prev) => {
			const next = new Map(prev);
			next.delete(overlayId);
			return next;
		});
		setLeavingOverlays((prev) => {
			const next = new Map(prev);
			next.delete(overlayId);
			return next;
		});
	}, []);

	// ■ CQRS: 페이즈 변경 감지 → render_state 보고
	// Why 별도 useEffect? 기존 phases 로직과 분리하여 변경 영향 최소화.
	// phases Map이 변경될 때만 실행: entering→stable→leaving→제거 전이를
	// onRenderStateChange 콜백으로 전달한다. Phase 3 WAAPI onfinish가 완료되면
	// 전체 라이프사이클이 자동으로 보고된다.
	useEffect(() => {
		const cb = onRenderStateChangeRef.current;
		if (!cb) return;

		const prev = prevPhasesForReportRef.current;

		// 1. 현재 phases에 있는 오버레이 — 페이즈 변경 감지
		for (const [id, currentPhase] of phases) {
			const prevPhase = prev.get(id);
			if (prevPhase !== currentPhase) {
				cb(id, {
					phase: currentPhase,
					phaseChangedAt: new Date().toISOString(),
					context: "pgm",
				});
			}
		}

		// 2. phases에서 제거된 오버레이 — idle 보고
		for (const id of prev.keys()) {
			if (!phases.has(id)) {
				cb(id, {
					phase: "idle",
					phaseChangedAt: new Date().toISOString(),
					context: "none",
				});
			}
		}

		prevPhasesForReportRef.current = new Map(phases);
	}, [phases]);

	// ■ iframe → 부모 PluginAction 수신기
	// postMessage로 수신한 액션을 onPluginAction 콜백으로 전달.
	// window→overlayId 매핑으로 어떤 오버레이의 iframe인지 식별.
	const windowMapRef = useRef<Map<Window, string>>(new Map());

	const registerIframe = useCallback(
		(win: Window | null, overlayId: string) => {
			if (!win) return;
			windowMapRef.current.set(win, overlayId);
			// cleanup: iframe이 제거되면 맵에서도 제거
			return () => {
				windowMapRef.current.delete(win);
			};
		},
		[],
	);

	useEffect(() => {
		if (!onPluginAction) return;

		const handler = (event: MessageEvent) => {
			const msg = event.data as PluginMessage;
			if (!msg || msg.source !== "webcgk-plugin") return;

			// PluginAction 타입 확인: type === "action"이고 action 필드가 있는 경우
			if (isPluginActionMessage(msg)) {
				const overlayId = windowMapRef.current.get(event.source as Window);
				if (overlayId) {
					onPluginAction(overlayId, msg);
				}
			}
		};

		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, [onPluginAction]);

	// 렌더링 대상: 현재 overlays + leaving 중인 overlays
	const allOverlays = [...overlays, ...Array.from(leavingOverlays.values())];
	const sorted = allOverlays
		.filter((o) => phases.has(o.id))
		.sort((a, b) => (a.template?.layer ?? 0) - (b.template?.layer ?? 0));
	const enteringHtmlStartupSlots = new Map<string, number>();
	for (const overlay of sorted) {
		if (
			phases.get(overlay.id) === "entering" &&
			overlay.template?.plugin_type === "html"
		) {
			enteringHtmlStartupSlots.set(overlay.id, enteringHtmlStartupSlots.size);
		}
	}

	if (sorted.length === 0) return null;

	return (
		<>
			{sorted.map((overlay) => {
				const phase = phases.get(overlay.id) ?? "stable";
				const isHtml = overlay.template?.plugin_type === "html";
				const isSemantic =
					overlay.template?.plugin_type === "semantic" &&
					getSemanticScene(overlay) != null;

				if (isSemantic) {
					return (
						<SemanticOverlayLayer
							key={overlay.id}
							overlay={overlay}
							phase={phase}
						/>
					);
				}
				return isHtml ? (
					<HtmlIframeLayer
						key={overlay.id}
						overlay={overlay}
						phase={phase}
						startupDelayMs={
							(enteringHtmlStartupSlots.get(overlay.id) ?? 0) *
							HTML_IFRAME_STARTUP_STAGGER_MS
						}
						registerIframe={registerIframe}
						onEnterComplete={handleEnterComplete}
						onExitComplete={handleExitComplete}
					/>
				) : (
					<SvgOverlayLayer
						key={overlay.id}
						overlay={overlay}
						phase={phase}
						onEnterComplete={handleEnterComplete}
						onExitComplete={handleExitComplete}
					/>
				);
			})}
		</>
	);
}

// ─── 공통: zone_bounds → CSS 위치 계산 ────────────────────────
function getPositionStyle(zb?: {
	x: number;
	y: number;
	width: number;
	height: number;
}): React.CSSProperties {
	return zb
		? {
				position: "absolute",
				left: `${(zb.x / BASE_W) * 100}%`,
				top: `${(zb.y / BASE_H) * 100}%`,
				width: `${(zb.width / BASE_W) * 100}%`,
				height: `${(zb.height / BASE_H) * 100}%`,
			}
		: { position: "absolute", inset: 0 };
}

// ─── SVG 오버레이 레이어 ──────────────────────────────────────
function SvgOverlayLayer({
	overlay,
	phase,
	onEnterComplete,
	onExitComplete,
}: {
	overlay: OverlayStateItem;
	phase: AnimPhase;
	onEnterComplete?: (id: string) => void;
	onExitComplete?: (id: string) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const tpl = overlay.template;
	const hasGraphicData = (tpl?.graphic_data?.length ?? 0) > 0;
	const animConfig = getOverlayAnimationConfig(tpl);
	const zb = tpl?.zone_bounds;
	const canvasW = zb?.width ?? BASE_W;
	const canvasH = zb?.height ?? BASE_H;
	const inType = animConfig.in?.type ?? animConfig.in_type ?? "fade";
	const inDuration =
		animConfig.in?.duration ?? animConfig.in_duration ?? DEFAULT_FADE_MS;
	const outType = animConfig.out?.type ?? animConfig.out_type ?? "fade";
	const outDuration =
		animConfig.out?.duration ?? animConfig.out_duration ?? DEFAULT_FADE_MS;

	// WAAPI 애니메이션 — setTimeout 추정을 렌더링 엔진 실제 완료로 대체
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		if (!hasGraphicData) return;

		if (phase === "entering") {
			const kf = resolveOverlayKeyframes(inType, "in");
			if (kf) {
				const anim = el.animate(kf, {
					duration: inDuration,
					easing: "ease-out",
					fill: "forwards",
				});
				anim.onfinish = () => onEnterComplete?.(overlay.id);
			} else {
				onEnterComplete?.(overlay.id);
			}
		} else if (phase === "leaving") {
			const kf = resolveOverlayKeyframes(outType, "out");
			if (kf) {
				const anim = el.animate(kf, {
					duration: outDuration,
					easing: "ease-in",
					fill: "forwards",
				});
				anim.onfinish = () => onExitComplete?.(overlay.id);
			} else {
				onExitComplete?.(overlay.id);
			}
		}
	}, [
		phase,
		hasGraphicData,
		inType,
		inDuration,
		outType,
		outDuration,
		onEnterComplete,
		onExitComplete,
		overlay.id,
	]);

	if (!hasGraphicData || !tpl) return null;

	// 콘텐츠 순환
	const cycleAction = animConfig.actions?.find(
		(a) => a.type === "cycle_content",
	);
	const cycleContents = cycleAction?.config?.contents || [];
	const contentIdx = overlay.active_content_index || 0;
	const displayElements: GraphicElement[] =
		cycleContents.length > 0 && cycleContents[contentIdx]?.elements
			? cycleContents[contentIdx].elements
			: tpl.graphic_data;

	return (
		<div
			ref={containerRef}
			style={{
				...getPositionStyle(zb),
				zIndex: 100 + (tpl.layer ?? 0),
				mixBlendMode:
					tpl.blend_mode && tpl.blend_mode !== "normal"
						? (tpl.blend_mode as React.CSSProperties["mixBlendMode"])
						: undefined,
				pointerEvents: "none",
				overflow: "hidden",
			}}
		>
			<GraphicPreviewRenderer
				elements={displayElements}
				canvasWidth={canvasW}
				canvasHeight={canvasH}
				style={{ width: "100%", height: "100%" }}
			/>
		</div>
	);
}

// ─── Semantic 오버레이 레이어 (v3) ─────────────────────────────
function SemanticOverlayLayer({
	overlay,
	phase,
	onEnterComplete,
	onExitComplete,
}: {
	overlay: OverlayStateItem;
	phase: AnimPhase;
	onEnterComplete?: (id: string) => void;
	onExitComplete?: (id: string) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const tpl = overlay.template;
	const semanticScene = getSemanticScene(overlay);
	const animConfig = getOverlayAnimationConfig(tpl);
	const zb = tpl?.zone_bounds;
	const inType = animConfig.in?.type ?? animConfig.in_type ?? "fade";
	const inDuration =
		animConfig.in?.duration ?? animConfig.in_duration ?? DEFAULT_FADE_MS;
	const outType = animConfig.out?.type ?? animConfig.out_type ?? "fade";
	const outDuration =
		animConfig.out?.duration ?? animConfig.out_duration ?? DEFAULT_FADE_MS;

	// WAAPI 애니메이션 (오버레이 레벨)
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		if (!semanticScene) return;

		if (phase === "entering") {
			const kf = resolveOverlayKeyframes(inType, "in");
			if (kf) {
				const anim = el.animate(kf, {
					duration: inDuration,
					easing: "ease-out",
					fill: "forwards",
				});
				anim.onfinish = () => onEnterComplete?.(overlay.id);
			} else {
				onEnterComplete?.(overlay.id);
			}
		} else if (phase === "leaving") {
			const kf = resolveOverlayKeyframes(outType, "out");
			if (kf) {
				const anim = el.animate(kf, {
					duration: outDuration,
					easing: "ease-in",
					fill: "forwards",
				});
				anim.onfinish = () => onExitComplete?.(overlay.id);
			} else {
				onExitComplete?.(overlay.id);
			}
		}
	}, [
		phase,
		semanticScene,
		inType,
		inDuration,
		outType,
		outDuration,
		onEnterComplete,
		onExitComplete,
		overlay.id,
	]);

	if (!semanticScene) return null;

	return (
		<div
			ref={containerRef}
			style={{
				...getPositionStyle(zb),
				zIndex: 100 + (tpl?.layer ?? 0),
				mixBlendMode:
					tpl?.blend_mode && tpl.blend_mode !== "normal"
						? (tpl.blend_mode as React.CSSProperties["mixBlendMode"])
						: undefined,
				pointerEvents: "none",
				overflow: "hidden",
			}}
		>
			<SemanticRenderer scene={semanticScene} phase={phase} />
		</div>
	);
}

// ─── HTML iframe 레이어 ───────────────────────────────────────
function HtmlIframeLayer({
	overlay,
	phase,
	startupDelayMs = 0,
	registerIframe,
	onEnterComplete,
	onExitComplete,
}: {
	overlay: OverlayStateItem;
	phase: AnimPhase;
	startupDelayMs?: number;
	registerIframe?: (
		win: Window | null,
		overlayId: string,
	) => (() => void) | undefined;
	onEnterComplete?: (id: string) => void;
	onExitComplete?: (id: string) => void;
}) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [shouldMountIframe, setShouldMountIframe] = useState(
		() => startupDelayMs <= 0,
	);
	const [iframeReady, setIframeReady] = useState(false);
	const showSentRef = useRef(false);
	const previousSourceSignatureRef = useRef("");

	const tpl = overlay.template;
	const sourceCode = tpl?.source_code;
	const html = sourceCode?.html ?? "";
	const css = sourceCode?.css ?? "";
	const js = sourceCode?.js ?? "";
	const sourceMotion = getOverlaySourceMotion(sourceCode);
	const sourceMotionSignature = safeStableStringify(sourceMotion);
	const sourceSignature = `${html}\u001f${css}\u001f${js}\u001f${sourceMotionSignature}`;
	const hasSourceCode = sourceCode != null;

	useEffect(() => {
		if (previousSourceSignatureRef.current === sourceSignature) return;
		previousSourceSignatureRef.current = sourceSignature;
		showSentRef.current = false;
		setIframeReady(false);
		setShouldMountIframe(startupDelayMs <= 0);
	}, [sourceSignature, startupDelayMs]);

	useEffect(() => {
		if (!hasSourceCode) return;
		if (shouldMountIframe) return;
		const timeoutId = window.setTimeout(() => {
			setShouldMountIframe(true);
		}, startupDelayMs);
		return () => window.clearTimeout(timeoutId);
	}, [hasSourceCode, shouldMountIframe, startupDelayMs]);

	const sourceMotionForRuntime = useMemo(() => {
		return parseStableJson(sourceMotionSignature);
	}, [sourceMotionSignature]);
	const motion = useMemo(() => {
		return normalizeGraphicMotionManifest(sourceMotionForRuntime);
	}, [sourceMotionForRuntime]);

	const hasPackageMotion = hasGraphicMotionTimeline(motion);
	const packageMotionEnterHoldMs = getGraphicMotionTimelineEnterHoldMs(motion);
	const packageMotionExitHoldMs = getGraphicMotionTimelineHoldMs(motion);
	const animConfig = getOverlayAnimationConfig(tpl);
	const inDuration = animConfig.in?.duration ?? DEFAULT_FADE_MS;
	const outDuration = animConfig.out?.duration ?? DEFAULT_FADE_MS;

	// WAAPI 애니메이션 — CSS transition 대신 element.animate()로 결정론적 완료 감지
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		if (!hasSourceCode) return;
		if (!shouldMountIframe) return;
		if (phase === "entering" && !iframeReady) return;

		if (hasPackageMotion) {
			if (phase === "entering") {
				const timeoutId = window.setTimeout(
					() => onEnterComplete?.(overlay.id),
					packageMotionEnterHoldMs,
				);
				return () => window.clearTimeout(timeoutId);
			} else if (phase === "leaving") {
				// 명시적 null check — leave phase 진입 시점에 iframe이 이미 unmount되었을 수 있음
				if (iframeRef.current?.contentWindow) {
					iframeRef.current.contentWindow.postMessage({ type: "HIDE" }, "*");
				}
				const timeoutId = window.setTimeout(
					() => onExitComplete?.(overlay.id),
					packageMotionExitHoldMs,
				);
				return () => window.clearTimeout(timeoutId);
			}
			return;
		}

		if (phase === "entering") {
			const anim = el.animate(OVERLAY_KEYFRAMES.fadeIn, {
				duration: inDuration,
				easing: "ease-out",
				fill: "forwards",
			});
			anim.onfinish = () => onEnterComplete?.(overlay.id);
		} else if (phase === "leaving") {
			const anim = el.animate(OVERLAY_KEYFRAMES.fadeOut, {
				duration: outDuration,
				easing: "ease-in",
				fill: "forwards",
			});
			anim.onfinish = () => onExitComplete?.(overlay.id);
		}
	}, [
		phase,
		iframeReady,
		hasPackageMotion,
		packageMotionEnterHoldMs,
		packageMotionExitHoldMs,
		inDuration,
		outDuration,
		onEnterComplete,
		onExitComplete,
		overlay.id,
		hasSourceCode,
		shouldMountIframe,
	]);

	// ■ 1920×1080 고정 srcdoc — 공통 모듈로 생성
	// autoShow=false: CompositorLayer가 외부에서 INIT + SHOW를 postMessage로 명시적 발행
	// useMemo를 사용해 렌더링 간 srcdoc 문자열의 레퍼런스를 보존함으로써,
	// 브라우저가 iframe.srcdoc 재할당으로 인해 iframe을 불필요하게 리로드(깜빡임)하는 현상 방어.
	// [P1-1] motionJson 대신 useMemo로 고정된 motion reference를 의존성에 직접 바인딩
	const srcdoc = useMemo(() => {
		return buildPluginSrcdoc({
			html,
			css,
			js,
			width: BASE_W,
			height: BASE_H,
			motion,
			autoShow: false,
		});
	}, [html, css, js, motion]);

	// ■ replicant_data → postMessage (즉시 반영)
	// useOverlayStore가 optimistic update하므로 overlay.replicant_data가 바로 변경됨
	const replicantJson = JSON.stringify(overlay.replicant_data || {});

	useEffect(() => {
		if (!hasSourceCode) return;
		if (!shouldMountIframe) return;
		if (!iframeRef.current?.contentWindow) return;
		const data = JSON.parse(replicantJson);
		iframeRef.current.contentWindow.postMessage(
			{ type: "REPLICANT_UPDATE", payload: data },
			"*",
		);
	}, [replicantJson, hasSourceCode, shouldMountIframe]);

	// replicantJson 최신 값을 handleLoad에서 이벤트 리스너 재등록 없이 참조할 수 있게 ref에 캐싱
	const replicantJsonRef = useRef(replicantJson);
	useEffect(() => {
		replicantJsonRef.current = replicantJson;
	}, [replicantJson]);

	// iframe 로드 완료 시 INIT + SHOW + iframe 등록
	// 의존성 배열에서 replicantJson을 제거하고 useRef를 사용해,
	// 데이터 업데이트 시마다 이벤트 리스너가 불필요하게 탈착/재등록되는 현상 방어.
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe || !hasSourceCode || !shouldMountIframe) return;
		let unregisterIframe: (() => void) | undefined;
		let cancelled = false;

		const handleLoad = () => {
			// iframe load 직후에는 srcdoc JS 실행과 style/layout cost가 아직 같은
			// 프레임에 남아 있을 수 있다. 두 번의 rAF 뒤에 INIT/SHOW와 부모 WAAPI를
			// 시작하면 첫 visible frame에서 parse/layout 비용과 animation이 겹치지 않는다.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (cancelled) return;
					if (!iframeRef.current?.contentWindow) return;
					const cw = iframeRef.current.contentWindow;
					const data = JSON.parse(replicantJsonRef.current);
					cw.postMessage({ type: "INIT", payload: data }, "*");

					// Double-SHOW 방지를 위해 showSentRef가 false일 때만 SHOW 발행
					if (!showSentRef.current) {
						cw.postMessage({ type: "SHOW" }, "*");
						showSentRef.current = true;
					}

					// PluginAction 수신을 위해 iframe → overlayId 매핑 등록
					unregisterIframe = registerIframe?.(cw, overlay.id);
					setIframeReady(true);
				});
			});
		};

		iframe.addEventListener("load", handleLoad);
		return () => {
			cancelled = true;
			unregisterIframe?.();
			iframe.removeEventListener("load", handleLoad);
		};
	}, [overlay.id, registerIframe, hasSourceCode, shouldMountIframe]);

	// ■ ResizeObserver: 컨테이너 크기 대비 scale 계산
	// 🆕 useLayoutEffect를 사용하여 첫 Paint 시점 전에 getBoundingClientRect로 동기 스케일 보정 (깜빡임 차단)
	useLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const updateScale = () => {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				setScale(Math.min(rect.width / BASE_W, rect.height / BASE_H));
			}
		};

		updateScale();

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					setScale(Math.min(width / BASE_W, height / BASE_H));
				}
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	if (!tpl?.source_code) return null;

	return (
		<div
			ref={containerRef}
			style={{
				...getPositionStyle(tpl.zone_bounds),
				zIndex: 100 + (tpl.layer ?? 0),
				mixBlendMode:
					tpl.blend_mode && tpl.blend_mode !== "normal"
						? (tpl.blend_mode as React.CSSProperties["mixBlendMode"])
						: undefined,
				pointerEvents: "none",
				overflow: "hidden",
				opacity:
					phase === "entering" && (!shouldMountIframe || !iframeReady)
						? 0
						: undefined,
			}}
		>
			{shouldMountIframe && (
				<iframe
					ref={iframeRef}
					sandbox="allow-scripts allow-same-origin"
					srcDoc={srcdoc}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: `${BASE_W}px`,
						height: `${BASE_H}px`,
						border: "none",
						background: "transparent",
						colorScheme: "normal",
						transformOrigin: "top left",
						transform: `scale(${scale})`,
					}}
					title={`Plugin: ${tpl.name}`}
				/>
			)}
		</div>
	);
}
