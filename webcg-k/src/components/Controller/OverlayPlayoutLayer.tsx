/**
 * @deprecated CompositorLayer로 통합됨.
 * 이 파일은 더 이상 사용되지 않으며, 안정화 후 삭제 예정.
 * 
 * OverlayPlayoutLayer
 * PGM 모니터 위에 활성 오버레이를 합성하는 렌더러.
 * overlay_state 테이블을 Supabase Realtime으로 구독하여
 * is_active === true인 오버레이만 레이어 순으로 렌더링한다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
    GraphicPreviewRenderer,
    type GraphicElement,
} from "../GraphicPreviewRenderer";

// ─── 상수 ─────────────────────────────────────────────────────
const DEFAULT_FADE_MS = 500;

// ─── 타입 ─────────────────────────────────────────────────────
interface ActiveOverlay {
    id: string;
    template_id: string;
    is_active: boolean;
    active_content_index: number;   // 콘텐츠 순환 인덱스
    animation_state: "idle" | "in" | "out" | string;
    conflict_mode: string;
    updated_at: string;
    template: {
        id: string;
        name: string;
        layer: number;
        graphic_data: GraphicElement[];
        animation_config: any;
        zone_bounds?: { x: number; y: number; width: number; height: number };
    } | null;
}

// 개별 레이어 애니메이션 페이즈
type AnimPhase = "entering" | "stable" | "leaving" | "hidden";

interface LayerState {
    overlay: ActiveOverlay;
    phase: AnimPhase;
}

interface OverlayPlayoutLayerProps {
    sessionId: string;
    /** preview=세션 내 전체 오버레이 표시, pgm=활성만 표시 */
    mode?: "preview" | "pgm";
}

// ─── 컴포넌트 ─────────────────────────────────────────────────
export function OverlayPlayoutLayer({ sessionId, mode = "pgm" }: OverlayPlayoutLayerProps) {
    const [layers, setLayers] = useState<Map<string, LayerState>>(new Map());
    const prevActiveRef = useRef<Set<string>>(new Set());

    // overlay_state 로드
    const loadActiveOverlays = useCallback(async () => {
        try {
            console.log(`[OverlayPlayout] 오버레이 로드 시작 (session: ${sessionId}, mode: ${mode})`);
            const { data, error } = (await supabase
                .from("overlay_state" as any)
                .select("*, template:overlay_templates(*)")
                .eq("session_id", sessionId)) as any;

            if (error) {
                console.error("[OverlayPlayout] ❌ DB 쿼리 에러:", error);
                throw error;
            }

            console.log(`[OverlayPlayout] ✅ 로드 완료: ${data?.length ?? 0}개 오버레이`, data);
            const overlays: ActiveOverlay[] = data || [];
            const currentActiveIds = new Set(
                overlays.filter((o: ActiveOverlay) => o.is_active).map((o: ActiveOverlay) => o.id),
            );
            const prevActive = prevActiveRef.current;

            setLayers((prev) => {
                const next = new Map<string, LayerState>();

                for (const ov of overlays) {
                    if (mode === "preview") {
                        // PVW: 비활성(OFF) 오버레이만 표시 — ON 상태는 PGM 독점
                        if (ov.is_active) continue;
                        const existing = prev.get(ov.id);
                        if (!existing) {
                            next.set(ov.id, { overlay: ov, phase: "entering" });
                        } else {
                            next.set(ov.id, {
                                overlay: ov,
                                phase: existing.phase === "entering" ? "entering" : "stable",
                            });
                        }
                    } else {
                        // PGM: is_active === true인 것만 표시
                        if (ov.is_active) {
                            const wasActive = prevActive.has(ov.id);
                            const existing = prev.get(ov.id);

                            if (!wasActive && !existing) {
                                next.set(ov.id, { overlay: ov, phase: "entering" });
                            } else {
                                next.set(ov.id, {
                                    overlay: ov,
                                    phase: existing?.phase === "entering" ? "entering" : "stable",
                                });
                            }
                        } else {
                            // OFF → leaving 애니메이션
                            const wasActive = prevActive.has(ov.id);
                            if (wasActive) {
                                next.set(ov.id, { overlay: ov, phase: "leaving" });
                            }
                        }
                    }
                }

                prevActiveRef.current = currentActiveIds;
                return next;
            });
        } catch (err) {
            console.error("[OverlayPlayout] 로드 실패:", err);
        }
    }, [sessionId, mode]);

    // 초기 로드
    useEffect(() => {
        loadActiveOverlays();
    }, [loadActiveOverlays]);

    // Realtime 구독 (DELETE 이벤트는 column filter 미지원이므로 필터 없이 구독)
    useEffect(() => {
        const channelName = `playout-overlay-${mode}:${sessionId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                "postgres_changes" as any,
                {
                    event: "*",
                    schema: "public",
                    table: "overlay_state",
                },
                (payload: any) => {
                    console.log("[OverlayPlayout] 🔔 postgres_changes 이벤트 수신:", payload);
                    loadActiveOverlays();
                },
            )
            .subscribe((status: string) => {
                console.log(`[OverlayPlayout] 📡 Realtime 구독 상태: ${status} (채널: ${channelName})`);
            });

        return () => {
            console.log(`[OverlayPlayout] 🔌 채널 해제: ${channelName}`);
            channel.unsubscribe();
        };
    }, [sessionId, loadActiveOverlays]);

    // leaving 애니메이션 완료 후 레이어 제거
    useEffect(() => {
        const leavingIds = Array.from(layers.entries())
            .filter(([, s]) => s.phase === "leaving")
            .map(([id]) => id);

        if (leavingIds.length === 0) return;

        const timers = leavingIds.map((id) => {
            const layer = layers.get(id);
            const duration =
                layer?.overlay.template?.animation_config?.out_duration ?? DEFAULT_FADE_MS;

            return setTimeout(() => {
                setLayers((prev) => {
                    const next = new Map(prev);
                    next.delete(id);
                    return next;
                });
            }, duration);
        });

        return () => timers.forEach(clearTimeout);
    }, [layers]);

    // entering → stable 전환
    useEffect(() => {
        const enteringIds = Array.from(layers.entries())
            .filter(([, s]) => s.phase === "entering")
            .map(([id]) => id);

        if (enteringIds.length === 0) return;

        const timers = enteringIds.map((id) => {
            const layer = layers.get(id);
            const duration =
                layer?.overlay.template?.animation_config?.in_duration ?? DEFAULT_FADE_MS;

            return setTimeout(() => {
                setLayers((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(id);
                    if (existing && existing.phase === "entering") {
                        next.set(id, { ...existing, phase: "stable" });
                    }
                    return next;
                });
            }, duration);
        });

        return () => timers.forEach(clearTimeout);
    }, [layers]);

    // 렌더링 대상 레이어 (layer 순 정렬)
    const visibleLayers = Array.from(layers.values())
        .filter((s) => s.phase !== "hidden")
        .sort(
            (a, b) =>
                (a.overlay.template?.layer ?? 0) - (b.overlay.template?.layer ?? 0),
        );

    if (visibleLayers.length === 0) return null;

    return (
        <>
            {visibleLayers.map((layerState) => (
                <OverlayLayer key={layerState.overlay.id} state={layerState} />
            ))}

            <style>{`
				@keyframes overlayFadeIn {
					from { opacity: 0; }
					to   { opacity: 1; }
				}
				@keyframes overlayFadeOut {
					from { opacity: 1; }
					to   { opacity: 0; }
				}
				@keyframes overlaySlideInUp {
					from { opacity: 0; transform: translateY(30px); }
					to   { opacity: 1; transform: translateY(0); }
				}
				@keyframes overlaySlideOutDown {
					from { opacity: 1; transform: translateY(0); }
					to   { opacity: 0; transform: translateY(30px); }
				}
				@keyframes overlayScaleIn {
					from { opacity: 0; transform: scale(0.85); }
					to   { opacity: 1; transform: scale(1); }
				}
				@keyframes overlayScaleOut {
					from { opacity: 1; transform: scale(1); }
					to   { opacity: 0; transform: scale(0.85); }
				}
				/* 콘텐츠 순환 전환 효과 */
				@keyframes contentFadeIn  { from { opacity: 0; } to { opacity: 1; } }
				@keyframes contentFadeOut { from { opacity: 1; } to { opacity: 0; } }
				@keyframes contentSlideLeftIn  { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
				@keyframes contentSlideLeftOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-100%); } }
				@keyframes contentSlideUpIn  { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
				@keyframes contentSlideUpOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-100%); } }
				/* 데이터 변경 알림 펄스 */
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.6; }
				}
			`}</style>
        </>
    );
}

// ─── 개별 오버레이 레이어 ─────────────────────────────────────
// 기준 캔버스 해상도 (PGM 모니터 기준)
const BASE_W = 1920;
const BASE_H = 1080;

function OverlayLayer({ state }: { state: LayerState }) {
    const { overlay, phase } = state;
    const tpl = overlay.template;

    if (!tpl || !tpl.graphic_data || tpl.graphic_data.length === 0) return null;

    // 애니메이션 설정 추출
    const animConfig = tpl.animation_config ?? {};
    const inType: string = animConfig.in_type ?? "fade";
    const inDuration: number = animConfig.in_duration ?? DEFAULT_FADE_MS;
    const outType: string = animConfig.out_type ?? "fade";
    const outDuration: number = animConfig.out_duration ?? DEFAULT_FADE_MS;

    // 애니메이션 키프레임 매핑
    const getAnimName = (type: string, dir: "in" | "out") => {
        switch (type) {
            case "slide":
                return dir === "in" ? "overlaySlideInUp" : "overlaySlideOutDown";
            case "scale":
                return dir === "in" ? "overlayScaleIn" : "overlayScaleOut";
            case "fade":
            default:
                return dir === "in" ? "overlayFadeIn" : "overlayFadeOut";
        }
    };

    let animation = "none";
    if (phase === "entering") {
        animation = `${getAnimName(inType, "in")} ${inDuration}ms ease-out forwards`;
    } else if (phase === "leaving") {
        animation = `${getAnimName(outType, "out")} ${outDuration}ms ease-in forwards`;
    }

    const canvasW = tpl.zone_bounds?.width ?? BASE_W;
    const canvasH = tpl.zone_bounds?.height ?? BASE_H;
    const zb = tpl.zone_bounds;

    // zone_bounds 기반 퍼센트 위치/크기 계산
    const posStyle: React.CSSProperties = zb
        ? {
            position: "absolute",
            left: `${(zb.x / BASE_W) * 100}%`,
            top: `${(zb.y / BASE_H) * 100}%`,
            width: `${(zb.width / BASE_W) * 100}%`,
            height: `${(zb.height / BASE_H) * 100}%`,
        }
        : {
            position: "absolute",
            inset: 0,
        };

    // 콘텐츠 순환 로직: animation_config.actions에서 cycle_content 타입 액션 찾기
    const cycleAction = animConfig.actions?.find(
        (a: any) => a.type === "cycle_content"
    );
    const cycleContents = cycleAction?.config?.contents || [];
    const contentIdx = overlay.active_content_index || 0;
    const transType = cycleAction?.config?.transitionType || "fade";
    const transDuration = cycleAction?.config?.transitionDuration || 400;

    // 순환 콘텐츠가 있으면 해당 인덱스의 elements 사용
    const displayElements: GraphicElement[] =
        cycleContents.length > 0 && cycleContents[contentIdx]
            ? cycleContents[contentIdx].elements
            : tpl.graphic_data;

    // 콘텐츠 전환 애니메이션 이름 매핑
    const getContentAnimName = () => {
        switch (transType) {
            case "slide-left": return "contentSlideLeftIn";
            case "slide-up": return "contentSlideUpIn";
            case "fade":
            default: return "contentFadeIn";
        }
    };

    return (
        <div
            style={{
                ...posStyle,
                zIndex: 100 + (tpl.layer ?? 0),
                pointerEvents: "none",
                animation,
                overflow: "hidden",
            }}
        >
            <div
                key={`content-${contentIdx}`}
                style={{
                    width: "100%",
                    height: "100%",
                    animation: cycleContents.length > 0
                        ? `${getContentAnimName()} ${transDuration}ms ease-out`
                        : "none",
                }}
            >
                <GraphicPreviewRenderer
                    elements={displayElements}
                    canvasWidth={canvasW}
                    canvasHeight={canvasH}
                    style={{ width: "100%", height: "100%" }}
                />
            </div>
        </div>
    );
}
