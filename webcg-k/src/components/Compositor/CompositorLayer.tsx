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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GraphicPreviewRenderer, type GraphicElement } from "../GraphicPreviewRenderer";
import type { OverlayStateItem, RenderState } from "../../hooks/useOverlayStore";
import { buildPluginSrcdoc } from "../../lib/webcgkSrcdoc";
import type { PluginAction, PluginMessage } from "../../lib/webcgkSrcdoc";
import { SemanticRenderer } from "../SemanticRenderer/SemanticRenderer";
import type { SemanticScene } from "../../lib/types/semanticTypes";

// ─── 상수 ─────────────────────────────────────────────────────
const BASE_W = 1920;
const BASE_H = 1080;
const DEFAULT_FADE_MS = 500;

// ─── 애니메이션 페이즈 ─────────────────────────────────────────
type AnimPhase = "entering" | "stable" | "leaving";

// ─── WAAPI 키프레임 (6종 fade/slide/scale) ──────────────────────
// ■ Why WAAPI? setTimeout 추정 대신 element.animate() + onfinish 사용.
//   렌더링 엔진의 실제 완료 시점에 정확히 호출되어 타이밍 결정론 확보.
//   탭 비활성화/프레임 드랍에도 정확한 종료 감지 가능.
const OVERLAY_KEYFRAMES: Record<string, Keyframe[]> = {
  fadeIn:       [{ opacity: 0 }, { opacity: 1 }],
  fadeOut:      [{ opacity: 1 }, { opacity: 0 }],
  slideInUp:    [{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "translateY(0)" }],
  slideOutDown: [{ opacity: 1, transform: "translateY(0)" },   { opacity: 0, transform: "translateY(30px)" }],
  scaleIn:      [{ opacity: 0, transform: "scale(0.85)" },     { opacity: 1, transform: "scale(1)" }],
  scaleOut:     [{ opacity: 1, transform: "scale(1)" },        { opacity: 0, transform: "scale(0.85)" }],
};

function resolveOverlayKeyframes(type: string, dir: "in" | "out"): Keyframe[] | null {
  switch (type) {
    case "slide": return dir === "in" ? OVERLAY_KEYFRAMES.slideInUp : OVERLAY_KEYFRAMES.slideOutDown;
    case "scale": return dir === "in" ? OVERLAY_KEYFRAMES.scaleIn : OVERLAY_KEYFRAMES.scaleOut;
    default:      return dir === "in" ? OVERLAY_KEYFRAMES.fadeIn : OVERLAY_KEYFRAMES.fadeOut;
  }
}

// ─── webcgk-api ─────────────────────────────────────────────────
// 인라인 API 코드와 srcdoc 생성은 lib/webcgkSrcdoc.ts로 단일 원본화.
// 이전에는 이 파일에 35줄짜리 인라인 코드가 있었으나 DRY 위반이므로 제거.

// ─── 메인 컴포넌트 ────────────────────────────────────────────
interface CompositorLayerProps {
    overlays: OverlayStateItem[];
    /** iframe PluginAction 콜백 — 부모(Controller/Renderer)가 handlePluginAction에 연결 */
    onPluginAction?: (overlayId: string, action: PluginAction) => void;
    /** 렌더링 상태 변경 보고 — Renderer가 useOverlayStore.reportRenderState에 연결 */
    onRenderStateChange?: (overlayId: string, state: RenderState) => void;
}

export function CompositorLayer({ overlays, onPluginAction, onRenderStateChange }: CompositorLayerProps) {
    // ■ 애니메이션 페이즈 관리
    // overlay가 목록에 추가되면 entering → stable
    // overlay가 목록에서 빠지면 leaving → 제거
    const [phases, setPhases] = useState<Map<string, AnimPhase>>(new Map());
    // leaving 중인 overlay를 유지하기 위한 ref
    const [leavingOverlays, setLeavingOverlays] = useState<Map<string, OverlayStateItem>>(new Map());
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
                if (!currentIds.has(id)) {
                    next.set(id, "leaving");
                }
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
                if (!currentIds.has(id) && !next.has(id)) {
                    const item = prevOverlaysRef.current.find((o) => o.id === id);
                    if (item) {
                        next.set(id, item);
                    }
                }
            }
            return next;
        });

        prevIdsRef.current = currentIds;
        prevOverlaysRef.current = overlays;
    }, [overlays]);

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

    const registerIframe = useCallback((win: Window | null, overlayId: string) => {
        if (!win) return;
        windowMapRef.current.set(win, overlayId);
        // cleanup: iframe이 제거되면 맵에서도 제거
        return () => { windowMapRef.current.delete(win); };
    }, []);

    useEffect(() => {
        if (!onPluginAction) return;

        const handler = (event: MessageEvent) => {
            const msg = event.data as PluginMessage;
            if (!msg || msg.source !== "webcgk-plugin") return;

            // PluginAction 타입 확인: type === "action"이고 action 필드가 있는 경우
            if (msg.type === "action" && typeof (msg as any).action === "string") {
                const action = msg as unknown as PluginAction;
                const overlayId = windowMapRef.current.get(event.source as Window);
                if (overlayId) {
                    onPluginAction(overlayId, action);
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

    if (sorted.length === 0) return null;

    return (
        <>
            {sorted.map((overlay) => {
                const phase = phases.get(overlay.id) ?? "stable";
                const isHtml = overlay.template?.plugin_type === "html";
                const isSemantic = overlay.template?.plugin_type === "semantic"
                    && (overlay as any).semantic_scene != null;

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
function getPositionStyle(zb?: { x: number; y: number; width: number; height: number }): React.CSSProperties {
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
function SvgOverlayLayer({ overlay, phase, onEnterComplete, onExitComplete }: {
    overlay: OverlayStateItem; phase: AnimPhase;
    onEnterComplete?: (id: string) => void;
    onExitComplete?: (id: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tpl = overlay.template;
    if (!tpl?.graphic_data?.length) return null;

    const animConfig = tpl.animation_config ?? {};
    const zb = tpl.zone_bounds;
    const canvasW = zb?.width ?? BASE_W;
    const canvasH = zb?.height ?? BASE_H;

    // WAAPI 애니메이션 — setTimeout 추정을 렌더링 엔진 실제 완료로 대체
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        if (phase === "entering") {
            const inType = animConfig?.in?.type ?? animConfig?.in_type ?? "fade";
            const inDuration = animConfig?.in?.duration ?? animConfig?.in_duration ?? DEFAULT_FADE_MS;
            const kf = resolveOverlayKeyframes(inType, "in");
            if (kf) {
                const anim = el.animate(kf, { duration: inDuration, easing: "ease-out", fill: "forwards" });
                anim.onfinish = () => onEnterComplete?.(overlay.id);
            } else {
                onEnterComplete?.(overlay.id);
            }
        } else if (phase === "leaving") {
            const outType = animConfig?.out?.type ?? animConfig?.out_type ?? "fade";
            const outDuration = animConfig?.out?.duration ?? animConfig?.out_duration ?? DEFAULT_FADE_MS;
            const kf = resolveOverlayKeyframes(outType, "out");
            if (kf) {
                const anim = el.animate(kf, { duration: outDuration, easing: "ease-in", fill: "forwards" });
                anim.onfinish = () => onExitComplete?.(overlay.id);
            } else {
                onExitComplete?.(overlay.id);
            }
        }
    }, [phase]);

    // 콘텐츠 순환
    const cycleAction = animConfig.actions?.find((a: any) => a.type === "cycle_content");
    const cycleContents = cycleAction?.config?.contents || [];
    const contentIdx = overlay.active_content_index || 0;
    const displayElements: GraphicElement[] =
        cycleContents.length > 0 && cycleContents[contentIdx]
            ? cycleContents[contentIdx].elements
            : tpl.graphic_data;

    return (
        <div
            ref={containerRef}
            style={{
                ...getPositionStyle(zb),
                zIndex: 100 + (tpl.layer ?? 0),
                mixBlendMode: (tpl.blend_mode && tpl.blend_mode !== "normal") ? tpl.blend_mode as React.CSSProperties["mixBlendMode"] : undefined,
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
function SemanticOverlayLayer({ overlay, phase, onEnterComplete, onExitComplete }: {
    overlay: OverlayStateItem; phase: AnimPhase;
    onEnterComplete?: (id: string) => void;
    onExitComplete?: (id: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tpl = overlay.template;
    const semanticScene: SemanticScene | undefined = (overlay as any).semantic_scene;
    if (!semanticScene) return null;

    const animConfig = tpl?.animation_config ?? {};
    const zb = tpl?.zone_bounds;

    // WAAPI 애니메이션 (오버레이 레벨)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        if (phase === "entering") {
            const inType = animConfig?.in?.type ?? animConfig?.in_type ?? "fade";
            const inDuration = animConfig?.in?.duration ?? animConfig?.in_duration ?? DEFAULT_FADE_MS;
            const kf = resolveOverlayKeyframes(inType, "in");
            if (kf) {
                const anim = el.animate(kf, { duration: inDuration, easing: "ease-out", fill: "forwards" });
                anim.onfinish = () => onEnterComplete?.(overlay.id);
            } else {
                onEnterComplete?.(overlay.id);
            }
        } else if (phase === "leaving") {
            const outType = animConfig?.out?.type ?? animConfig?.out_type ?? "fade";
            const outDuration = animConfig?.out?.duration ?? animConfig?.out_duration ?? DEFAULT_FADE_MS;
            const kf = resolveOverlayKeyframes(outType, "out");
            if (kf) {
                const anim = el.animate(kf, { duration: outDuration, easing: "ease-in", fill: "forwards" });
                anim.onfinish = () => onExitComplete?.(overlay.id);
            } else {
                onExitComplete?.(overlay.id);
            }
        }
    }, [phase]);

    return (
        <div
            ref={containerRef}
            style={{
                ...getPositionStyle(zb),
                zIndex: 100 + (tpl?.layer ?? 0),
                mixBlendMode: (tpl?.blend_mode && tpl.blend_mode !== "normal") ? tpl.blend_mode as React.CSSProperties["mixBlendMode"] : undefined,
                pointerEvents: "none",
                overflow: "hidden",
            }}
        >
            <SemanticRenderer
                scene={semanticScene}
                phase={phase}
            />
        </div>
    );
}

// ─── HTML iframe 레이어 ───────────────────────────────────────
function HtmlIframeLayer({ overlay, phase, registerIframe, onEnterComplete, onExitComplete }: {
    overlay: OverlayStateItem; phase: AnimPhase;
    registerIframe?: (win: Window | null, overlayId: string) => (() => void) | undefined;
    onEnterComplete?: (id: string) => void;
    onExitComplete?: (id: string) => void;
}) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    const tpl = overlay.template;
    if (!tpl?.source_code) return null;

    const { html, css, js } = tpl.source_code;
    const animConfig = tpl.animation_config ?? {};
    const inDuration = animConfig.in?.duration ?? DEFAULT_FADE_MS;
    const outDuration = animConfig.out?.duration ?? DEFAULT_FADE_MS;

    // WAAPI 애니메이션 — CSS transition 대신 element.animate()로 결정론적 완료 감지
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        if (phase === "entering") {
            const anim = el.animate(
                OVERLAY_KEYFRAMES.fadeIn,
                { duration: inDuration, easing: "ease-out", fill: "forwards" },
            );
            anim.onfinish = () => onEnterComplete?.(overlay.id);
        } else if (phase === "leaving") {
            const anim = el.animate(
                OVERLAY_KEYFRAMES.fadeOut,
                { duration: outDuration, easing: "ease-in", fill: "forwards" },
            );
            anim.onfinish = () => onExitComplete?.(overlay.id);
        }
    }, [phase]);

    // ■ 1920×1080 고정 srcdoc — 공통 모듈로 생성
    // autoShow=false: CompositorLayer가 외부에서 INIT + SHOW를 postMessage로 명시적 발행
    const srcdoc = buildPluginSrcdoc({
        html, css, js,
        width: BASE_W,
        height: BASE_H,
        autoShow: false,
    });

    // ■ replicant_data → postMessage (즉시 반영)
    // useOverlayStore가 optimistic update하므로 overlay.replicant_data가 바로 변경됨
    const replicantJson = JSON.stringify(overlay.replicant_data || {});

    useEffect(() => {
        if (!iframeRef.current?.contentWindow) return;
        const data = JSON.parse(replicantJson);
        iframeRef.current.contentWindow.postMessage(
            { type: "REPLICANT_UPDATE", payload: data },
            "*",
        );
    }, [replicantJson]);

    // iframe 로드 완료 시 INIT + SHOW + iframe 등록
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const handleLoad = () => {
            setTimeout(() => {
                if (!iframeRef.current?.contentWindow) return;
                const cw = iframeRef.current.contentWindow;
                const data = JSON.parse(replicantJson);
                cw.postMessage({ type: "INIT", payload: data }, "*");
                cw.postMessage({ type: "SHOW" }, "*");
                // PluginAction 수신을 위해 iframe → overlayId 매핑 등록
                if (registerIframe) registerIframe(cw, overlay.id);
            }, 100);
        };

        iframe.addEventListener("load", handleLoad);
        return () => iframe.removeEventListener("load", handleLoad);
    }, [replicantJson]);

    // ■ ResizeObserver: 컨테이너 크기 대비 scale 계산
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
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

    return (
        <div
            ref={containerRef}
            style={{
                ...getPositionStyle(tpl.zone_bounds),
                zIndex: 100 + (tpl.layer ?? 0),
                mixBlendMode: (tpl.blend_mode && tpl.blend_mode !== "normal") ? tpl.blend_mode as React.CSSProperties["mixBlendMode"] : undefined,
                pointerEvents: "none",
                overflow: "hidden",
            }}
        >
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
        </div>
    );
}
