/**
 * useOverlayStore — 오버레이 상태의 단일 진실점 (Single Source of Truth)
 *
 * ■ Why 이 훅이 필요한가?
 *   기존에는 OverlayPanel, OverlayPlayoutLayer, PluginOverlayLayer가
 *   각각 독립적으로 Realtime을 구독하고 DB를 조회했다.
 *   → 동일 세션에서 6~9개 Realtime 채널이 중복 생성되고,
 *     데이터 변경 시 DB를 2번 왕복해야 했다 (UPDATE → Realtime → SELECT).
 *
 *   이 훅은:
 *   1. Realtime 채널을 1개만 생성
 *   2. 모든 컴포넌트가 같은 데이터를 참조
 *   3. 데이터 변경 시 로컬 상태를 즉시 갱신 (Realtime 대기 불필요)
 *
 * ■ 비유:
 *   "같은 신문을 3명이 각각 배달 시키는 대신, 1부만 시켜서 돌려 읽기"
 *
 * ■ API:
 *   const { overlays, svgOverlays, htmlOverlays, previewOverlays, programOverlays,
 *           setPlayoutState, updateReplicantData, addOverlay, removeOverlay, loading } = useOverlayStore(sessionId);
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getServerNow } from "../lib/clockSync";
import type { PluginAction } from "../lib/webcgkSrcdoc";
import type {
    OverlayStateItem,
    OverlayTemplate,
    RenderState,
} from "../components/Controller/overlayConstants";

export type { OverlayStateItem, OverlayTemplate, RenderState };

export type PlayoutState = "off" | "preview" | "program";

// 타이머 유틸은 timerUtils.ts 로 이전 (computeRemaining, isTimerReplicant, TimerReplicant)
import { computeRemaining } from "../lib/timerUtils";
export { computeRemaining, isTimerReplicant, type TimerReplicant } from "../lib/timerUtils";

// ─── 훅 ───────────────────────────────────────────────────────
export function useOverlayStore(sessionId: string | undefined) {
    const [overlays, setOverlays] = useState<OverlayStateItem[]>([]);
    const [loading, setLoading] = useState(true);

    // ■ Realtime 채널 중복 방지용 ref
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    // ─── DB 로드 ──────────────────────────────────────────────
    const loadOverlays = useCallback(async () => {
        if (!sessionId) return;
        try {
            const { data, error } = (await supabase
                .from("overlay_state" as any)
                .select("*, template:overlay_templates(*)")
                .eq("session_id", sessionId)) as any;

            if (error) throw error;
            setOverlays(data || []);
        } catch (err) {
            console.error("[useOverlayStore] 로드 실패:", err);
        }
    }, [sessionId]);

    // ─── 초기 로드 + Realtime 구독 (1개만) ────────────────────
    useEffect(() => {
        if (!sessionId) return;

        // 1. 초기 로드
        setLoading(true);
        loadOverlays().then(() => setLoading(false));

        // 2. Realtime 구독 — 세션당 1개만
        const channelId = `overlay-store:${sessionId}`;
        const channel = supabase
            .channel(channelId)
            .on(
                "postgres_changes" as any,
                {
                    event: "*",
                    schema: "public",
                    table: "overlay_state",
                    filter: `session_id=eq.${sessionId}`,
                },
                () => {
                    // Realtime 이벤트 → DB 재조회 (템플릿 JOIN 필요하므로)
                    loadOverlays();
                },
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            channel.unsubscribe();
            channelRef.current = null;
        };
    }, [sessionId, loadOverlays]);

    // ─── 파생 상태 (useMemo) ──────────────────────────────────
    // ■ Why useMemo?
    //   overlays 배열이 변경될 때만 필터링 재실행.
    //   매 렌더마다 filter()를 호출하면 불필요한 계산.

    /** SVG 기반 오버레이 (graphic_data가 있고 plugin_type !== "html") */
    const svgOverlays = useMemo(
        () => overlays.filter((o) =>
            o.template &&
            o.template.plugin_type !== "html" &&
            o.template.graphic_data?.length > 0
        ),
        [overlays],
    );

    /** HTML iframe 오버레이 (plugin_type === "html") */
    const htmlOverlays = useMemo(
        () => overlays.filter((o) => o.template?.plugin_type === "html"),
        [overlays],
    );

    /**
     * PVW에 표시할 것: preview cue만.
     *
     * Why not include is_active?
     * 상태를 가진 HTML 오버레이(타이머, WAAPI/CSS animation)는 PVW/PGM/render가
     * 각각 별도 iframe runtime을 실행하므로 시간이 흐를수록 drift가 생긴다.
     * PGM으로 TAKE된 오버레이는 PVW에서 숨겨 중복 runtime이 보이지 않게 한다.
     */
    const previewOverlays = useMemo(
        () => overlays.filter((o) =>
            o.animation_state === "preview" && !o.is_active
        ),
        [overlays],
    );

    /** PGM/렌더러에 표시할 것: is_active=true만 */
    const programOverlays = useMemo(
        () => overlays.filter((o) => o.is_active),
        [overlays],
    );

    // ─── 액션: PVW/PGM/OFF 전환 (CQRS Command 채널) ───────────
    // ■ CQRS: Controller는 is_active(의도)만 설정.
    //   animation_state="in" 제거 — is_active=true 로 완전 대체.
    //   animation_state="preview"/"idle"은 Controller 전용 개념이므로 유지.
    const setPlayoutState = useCallback(async (
        overlayId: string,
        state: PlayoutState,
        conflictMode?: string,
    ) => {
        const updatePayload: any = {
            updated_at: new Date().toISOString(),
        };

        switch (state) {
            case "off":
                updatePayload.is_active = false;
                updatePayload.animation_state = "idle";
                break;
            case "preview":
                updatePayload.is_active = false;
                updatePayload.animation_state = "preview";
                break;
            case "program":
                updatePayload.is_active = true;
                // animation_state="in" 제거 — CQRS: is_active가 의도, render_state가 실제 상태
                break;
        }

        if (conflictMode) {
            updatePayload.conflict_mode = conflictMode;
        }

        // ■ Optimistic update — 즉시 로컬 반영
        setOverlays((prev) =>
            prev.map((o) =>
                o.id === overlayId ? { ...o, ...updatePayload } : o,
            ),
        );

        // DB 저장
        try {
            const { error } = (await supabase
                .from("overlay_state")
                .update(updatePayload)
                .eq("id", overlayId)) as any;

            if (error) {
                console.error("[useOverlayStore] setPlayoutState 실패:", error);
                loadOverlays(); // 실패 시 복원
            }
        } catch (err) {
            console.error("[useOverlayStore] setPlayoutState 오류:", err);
            loadOverlays();
        }
    }, [loadOverlays]);

    // ─── 액션: replicant_data 업데이트 ────────────────────────
    // ■ 핵심 개선점: 로컬 즉시 반영 → Realtime/DB 대기 불필요
    const updateReplicantData = useCallback(async (
        overlayId: string,
        data: Record<string, unknown>,
        options?: { skipDb?: boolean },
    ) => {
        // 1. 로컬 즉시 반영 → 모든 CompositorLayer가 바로 새 데이터 참조
        setOverlays((prev) =>
            prev.map((o) =>
                o.id === overlayId
                    ? { ...o, replicant_data: data, updated_at: new Date().toISOString() }
                    : o,
            ),
        );

        // 2. DB 저장 스킵 — Renderer timer tick 등에서 사용
        //    (Controller가 DB 단일 진실점으로 남아야 하는 경우)
        if (options?.skipDb) {
            return;
        }

        // 3. DB 저장 (비동기, fire-and-forget 스타일)
        try {
            const { error } = (await supabase
                .from("overlay_state" as any)
                .update({
                    replicant_data: data,
                    updated_at: new Date().toISOString(),
                } as any)
                .eq("id", overlayId)) as any;

            if (error) {
                console.error("[useOverlayStore] updateReplicantData 실패:", error);
            }
        } catch (err) {
            console.error("[useOverlayStore] updateReplicantData 오류:", err);
        }
    }, []);

    // ─── 액션: 그룹 태그 기반 일괄 replicant_data 업데이트 ────
    // ■ Why?
    //   토론 카운트다운처럼 같은 데이터(남은시간, 시작여부)를 받는
    //   여러 오버레이(후보자용 + 시청자용)를 한 번에 업데이트.
    //   비유: "같은 무전 채널의 모든 수신기에 일괄 송신"
    const updateGroupData = useCallback(async (
        groupTag: string,
        data: Record<string, unknown>,
    ) => {
        if (!sessionId) return;
        // 1. 로컬 즉시 반영 — group_tag가 같은 모든 오버레이
        const now = new Date().toISOString();
        setOverlays((prev) =>
            prev.map((o) =>
                (o as any).group_tag === groupTag
                    ? { ...o, replicant_data: data, updated_at: now }
                    : o,
            ),
        );

        // 2. DB 일괄 업데이트 — 1개 SQL로 N개 오버레이 동시 갱신
        try {
            const { error } = (await supabase
                .from("overlay_state" as any)
                .update({
                    replicant_data: data,
                    updated_at: now,
                } as any)
                .eq("session_id", sessionId)
                .eq("group_tag", groupTag)) as any;

            if (error) {
                console.error("[useOverlayStore] updateGroupData 실패:", error);
            }
        } catch (err) {
            console.error("[useOverlayStore] updateGroupData 오류:", err);
        }
    }, [sessionId]);

    // ─── 액션: Renderer가 render_state 기록 (CQRS Query 채널) ────
    // ■ Why 별도 메서드?
    //   setPlayoutState()는 is_active(의도/Command)만 담당.
    //   reportRenderState()는 Renderer만 호출하며, render_state(실제 상태)만 갱신.
    //   Controller는 이 값을 읽어 실제 렌더링 상태를 UI에 반영.
    // ■ 설계: Renderer가 SSOT이므로 항상 DB에 기록 (skipDb 불필요)
    const reportRenderState = useCallback(async (
        overlayId: string,
        renderState: RenderState,
    ) => {
        // 1. Optimistic: 즉시 로컬 반영
        setOverlays((prev) =>
            prev.map((o) =>
                o.id === overlayId
                    ? { ...o, render_state: renderState, updated_at: new Date().toISOString() }
                    : o,
            ),
        );

        // 2. DB 저장 (비동기)
        try {
            const { error } = (await supabase
                .from("overlay_state" as any)
                .update({
                    render_state: renderState as any,
                    updated_at: new Date().toISOString(),
                } as any)
                .eq("id", overlayId)) as any;

            if (error) {
                console.error("[useOverlayStore] reportRenderState 실패:", error);
                loadOverlays(); // 실패 시 복원
            }
        } catch (err) {
            console.error("[useOverlayStore] reportRenderState 오류:", err);
            loadOverlays();
        }
    }, [loadOverlays]);

    // ─── 액션: 그룹 태그 기반 일괄 PVW/PGM/OFF 전환 ───────────
    // ■ Why?
    //   그룹에 속한 모든 오버레이를 한 번에 PGM에 올리거나 내림.
    //   개별 전환도 가능하지만, 그룹 전환이 운용 편의성 극대화.
    const setGroupPlayoutState = useCallback(async (
        groupTag: string,
        state: PlayoutState,
    ) => {
        if (!sessionId) return;
        const now = new Date().toISOString();
        const updatePayload: any = { updated_at: now };

        switch (state) {
            case "off":
                updatePayload.is_active = false;
                updatePayload.animation_state = "idle";
                break;
            case "preview":
                updatePayload.is_active = false;
                updatePayload.animation_state = "preview";
                break;
            case "program":
                updatePayload.is_active = true;
                // animation_state="in" 제거 — CQRS: is_active가 의도, render_state가 실제 상태
                break;
        }

        // 1. 로컬 즉시 반영
        setOverlays((prev) =>
            prev.map((o) =>
                (o as any).group_tag === groupTag
                    ? { ...o, ...updatePayload }
                    : o,
            ),
        );

        // 2. DB 일괄 업데이트
        try {
            const { error } = (await supabase
                .from("overlay_state")
                .update(updatePayload)
                .eq("session_id", sessionId)
                .eq("group_tag", groupTag)) as any;

            if (error) {
                console.error("[useOverlayStore] setGroupPlayoutState 실패:", error);
                loadOverlays();
            }
        } catch (err) {
            console.error("[useOverlayStore] setGroupPlayoutState 오류:", err);
            loadOverlays();
        }
    }, [sessionId, loadOverlays]);

    // ─── 액션: 플러그인 액션 처리 (iframe → 부모) ────────────
    // ■ Why?
    //   iframe 내부 버튼 클릭 등으로 발생한 액션을 받아
    //   현재 DB 상태 기준으로 연산 후 updateReplicantData 호출.
    //   iframe이 절대값을 직접 덮어쓰는 Race Condition 방지.
    // ■ 설계: iframe은 "의도(Action)"만 보내고, 부모가 Single Source of Truth로서
    //   최신 DB 상태에 연산을 적용한 후 전체 View에 하향 전파.
    const handlePluginAction = useCallback(async (
        overlayId: string,
        action: PluginAction,
    ) => {
        const overlay = overlays.find((o) => o.id === overlayId);
        if (!overlay) return;

        const current = (overlay.replicant_data || {}) as Record<string, unknown>;
        let next: Record<string, unknown>;

        switch (action.action) {
            case "START_TIMER": {
                next = {
                    ...current,
                    running: true,
                    startedAt: getServerNow(),
                    remaining: current.remaining ?? current.duration ?? 60,
                };
                break;
            }
            case "STOP_TIMER": {
                const remaining = computeRemaining(current as any);
                next = {
                    ...current,
                    running: false,
                    remaining,
                };
                break;
            }
            case "RESET_TIMER": {
                next = {
                    ...current,
                    running: false,
                    remaining: current.duration ?? 60,
                    startedAt: null,
                };
                break;
            }
            case "INCREMENT_SCORE": {
                const score = (typeof current.score === "number" ? current.score : 0)
                    + (action.payload?.delta ?? 1);
                next = { ...current, score };
                break;
            }
            case "DECREMENT_SCORE": {
                const score = (typeof current.score === "number" ? current.score : 0)
                    - (action.payload?.delta ?? 1);
                next = { ...current, score };
                break;
            }
            case "SET_VALUE": {
                next = {
                    ...current,
                    [action.payload.key]: action.payload.value,
                };
                break;
            }
            default:
                return;
        }

        await updateReplicantData(overlayId, next);
    }, [overlays, updateReplicantData]);

    // ─── 액션: 세션에 오버레이 추가 ──────────────────────────
    const addOverlay = useCallback(async (templateId: string) => {
        if (!sessionId) return;
        try {
            const { data, error } = (await supabase
                .from("overlay_state" as any)
                .insert({
                    session_id: sessionId,
                    template_id: templateId,
                    is_active: false,
                    animation_state: "idle",
                    current_data: {},
                    replicant_data: {},
                    pending_data: null,
                    active_content_index: 0,
                    conflict_mode: "overlay",
                } as any)
                .select("*, template:overlay_templates(*)")
                .single()) as any;

            if (error) throw error;
            if (data) {
                setOverlays((prev) => [...prev, data]);
            }
        } catch (err) {
            console.error("[useOverlayStore] addOverlay 실패:", err);
        }
    }, [sessionId]);

    // ─── 액션: 세션에서 오버레이 제거 ─────────────────────────
    const removeOverlay = useCallback(async (overlayId: string) => {
        // Optimistic: 즉시 로컬 제거
        setOverlays((prev) => prev.filter((o) => o.id !== overlayId));

        try {
            const { error } = (await supabase
                .from("overlay_state" as any)
                .delete()
                .eq("id", overlayId)) as any;

            if (error) {
                console.error("[useOverlayStore] removeOverlay 실패:", error);
                loadOverlays(); // 실패 시 복원
            }
        } catch (err) {
            console.error("[useOverlayStore] removeOverlay 오류:", err);
            loadOverlays();
        }
    }, [loadOverlays]);

    // ─── 액션: 액션 실행 (toggle, trigger 등) ─────────────────
    const executeAction = useCallback(async (
        overlayId: string,
        actionType: string,
        actionConfig: any,
    ) => {
        const overlay = overlays.find((o) => o.id === overlayId);
        if (!overlay) return;

        try {
            if (actionType === "cycle_content") {
                const contents = actionConfig?.contents || [];
                if (contents.length === 0) return;
                const nextIdx = (overlay.active_content_index + 1) % contents.length;

                setOverlays((prev) =>
                    prev.map((o) =>
                        o.id === overlayId
                            ? { ...o, active_content_index: nextIdx }
                            : o,
                    ),
                );

                await supabase
                    .from("overlay_state")
                    .update({ active_content_index: nextIdx } as any)
                    .eq("id", overlayId);
            } else if (actionType === "data_refresh") {
                // 데이터 리프레시 — 현재 replicant_data를 다시 전송하면 iframe이 갱신
                loadOverlays();
            }
        } catch (err) {
            console.error("[useOverlayStore] executeAction 오류:", err);
        }
    }, [overlays, loadOverlays]);

    return {
        overlays,
        svgOverlays,
        htmlOverlays,
        previewOverlays,
        programOverlays,
        loading,
        setPlayoutState,
        updateReplicantData,
        updateGroupData,
        setGroupPlayoutState,
        reportRenderState,
        handlePluginAction,
        addOverlay,
        removeOverlay,
        executeAction,
        reload: loadOverlays,
    };
}
