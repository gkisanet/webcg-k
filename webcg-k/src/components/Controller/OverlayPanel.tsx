/**
 * OverlayPanel - 컨트롤러 오버레이 송출 전용 패널
 * 대시보드에서 사전 정의한 오버레이를 카드 형태로 표시하고,
 * 필터/검색 후 ON/OFF 송출 제어 + 액션 버튼 실행을 수행한다.
 * ⚠️ 오버레이 생성/AI 기능은 대시보드 templates 페이지에서 수행.
 */

import {
    AlertTriangle,
    Calendar,
    Layers,
    Loader2,
    RefreshCw,
    Search,
    ScrollText,
    X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { OverlayAction } from "../../lib/overlayTypes";
import type { OverlayPlayoutState } from "./OverlayCard";
import type {
    OverlayStateItem,
    OverlayTemplate,
    LogEntry,
    ConflictChoice,
    OverlayPanelProps,
} from "./overlayConstants";
import { OverlayCard } from "./OverlayCard";
import { GroupOverlayCard } from "./GroupOverlayCard";
import type { GroupMember } from "./GroupOverlayCard";

// 타입, 상수, OverlayCard는 overlayConstants.tsx / OverlayCard.tsx에서 import

export function OverlayPanel({
    sessionId,
    currentPgmBlock,
    overlayStore,
}: OverlayPanelProps) {
    const { user } = useAuth();

    // ■ useOverlayStore에서 오버레이 상태와 액션을 가져옴
    // 자체 Realtime 구독 / DB SELECT 제거 — 단일 진실점에서 관리
    const overlayStates = overlayStore?.overlays ?? [];

    const [availableTemplates, setAvailableTemplates] = useState<
        OverlayTemplate[]
    >([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showLogs, setShowLogs] = useState(false);

    // 필터 상태
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFilter, setDateFilter] = useState(""); // yyyy-mm-dd 형식

    // ■ 기저장된 그룹/태그 목록 추출 — 드롭다운 자동완성용
    // 비유: "이미 쓴 해시태그를 제안해주는 SNS 입력창"
    const existingGroupTags = useMemo(() => {
        const set = new Set<string>();
        overlayStates.forEach((o) => {
            if (o.group_tag) set.add(o.group_tag);
        });
        return Array.from(set).sort();
    }, [overlayStates]);

    const existingTags = useMemo(() => {
        const set = new Set<string>();
        overlayStates.forEach((o) => {
            o.tags?.forEach((t) => set.add(t));
        });
        return Array.from(set).sort();
    }, [overlayStates]);

    // 충돌 모달 상태
    const [conflictModal, setConflictModal] = useState<{
        overlayName: string;
        overlayId: string;
        pgmBlockName: string;
    } | null>(null);

    // 오버레이 상태 로드 — overlayStore가 담당하므로 래퍼만 유지
    const loadOverlayStates = useCallback(async () => {
        overlayStore?.reload();
    }, [overlayStore]);

    // 사용 가능한 템플릿 로드
    const loadTemplates = useCallback(async () => {
        try {
            const { data, error } = (await supabase
                .from("overlay_templates" as any)
                .select("*")
                .order("created_at", { ascending: false })) as any;

            if (error) throw error;
            setAvailableTemplates(data || []);
        } catch (err) {
            console.error("Load templates error:", err);
        }
    }, []);

    // 로그 로드
    const loadLogs = useCallback(async () => {
        try {
            const { data, error } = (await supabase
                .from("session_action_logs" as any)
                .select("*")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: false })
                .limit(50)) as any;

            if (error) throw error;
            setLogs(data || []);
        } catch (err) {
            console.error("Load logs error:", err);
        }
    }, [sessionId]);

    // 초기 로드 — overlayStates는 overlayStore가 자동 로드
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([loadTemplates(), loadLogs()]);
            setLoading(false);
        };
        init();
    }, [loadTemplates, loadLogs]);

    // Realtime 구독 — overlayStore가 담당하므로 제거됨
    // (기존 ctrl-overlay 채널 제거)

    // 로그 기록 유틸리티
    const writeLog = useCallback(
        async (actionType: string, actionDetail: any) => {
            if (!user) return;
            try {
                await supabase.from("session_action_logs" as any).insert({
                    session_id: sessionId,
                    user_id: user.id,
                    action_type: actionType,
                    action_detail: actionDetail,
                } as any);
                loadLogs();
            } catch (err) {
                console.error("Write log error:", err);
            }
        },
        [sessionId, user, loadLogs],
    );

    // 오버레이 세션에 추가 (사용 가능한 템플릿 → overlay_state에 추가)
    const addOverlayToSession = async (templateId: string) => {
        // 이미 추가되어 있으면 무시
        if (overlayStates.some((o) => o.template_id === templateId)) return;

        try {
            await overlayStore?.addOverlay(templateId);
            // Realtime 구독 및 store의 optimistic update가 동작하므로 화면 즉시 갱신
        } catch (err) {
            console.error("Add overlay error:", err);
        }
    };

    // ■ PVW/PGM/OFF 3-state 전환 (CQRS: store 위임)
    const setOverlayPlayoutState = async (
        overlay: OverlayStateItem,
        newState: OverlayPlayoutState,
        conflictChoice?: ConflictChoice,
    ) => {
        // PGM으로 올리려는데 PGM 블록이 있으면 충돌 감지
        if (newState === "program" && currentPgmBlock && !conflictChoice) {
            setConflictModal({
                overlayName: overlay.template?.name || "오버레이",
                overlayId: overlay.id,
                pgmBlockName: currentPgmBlock.name,
            });
            return;
        }

        if (conflictChoice === "cancel") {
            setConflictModal(null);
            return;
        }

        // ■ CQRS: store의 setPlayoutState 사용 — 중복 DB 쓰기 제거
        overlayStore?.setPlayoutState(overlay.id, newState, conflictChoice);

        // 비블로킹 로그 기록
        const logAction = newState === "program" ? "overlay_pgm" : newState === "preview" ? "overlay_pvw" : "overlay_off";
        void writeLog(logAction, {
            overlay_name: overlay.template?.name,
            conflict_mode: conflictChoice || "none",
        });

        if (conflictChoice === "hide_block") {
            void writeLog("conflict_override", {
                overlay_name: overlay.template?.name,
                hidden_block: currentPgmBlock?.name,
            });
        }

        setConflictModal(null);
    };

    // 오버레이 세션에서 제거 — overlayStore가 optimistic update 담당
    const removeOverlayFromSession = async (id: string) => {
        overlayStore?.removeOverlay(id);
    };

    // ─── 액션 버튼 실행 로직 ───────────────────────────────────────
    const executeAction = async (overlayId: string, action: OverlayAction) => {
        const overlay = overlayStates.find((o) => o.id === overlayId);
        if (!overlay) return;

        try {
            switch (action.type) {
                case "toggle": {
                    // 필드 값 교대 전환
                    const vals = action.config.values || [];
                    if (vals.length < 2) break;
                    const currentVal = overlay.current_data?.[action.config.targetField || ""];
                    const nextIdx = (vals.indexOf(currentVal) + 1) % vals.length;
                    const newData = { ...overlay.current_data, [action.config.targetField || ""]: vals[nextIdx] };
                    await supabase.from("overlay_state")
                        .update({ current_data: newData, updated_at: new Date().toISOString() })
                        .eq("id", overlayId);
                    break;
                }
                case "trigger": {
                    // 일회성 애니메이션 실행 (애니메이션 상태 변경 후 자동 복원)
                    await supabase.from("overlay_state")
                        .update({ animation_state: action.config.animationName || "trigger", updated_at: new Date().toISOString() })
                        .eq("id", overlayId);
                    // duration 후 idle로 복원
                    const dur = action.config.duration || 1000;
                    setTimeout(async () => {
                        await supabase.from("overlay_state")
                            .update({ animation_state: "idle", updated_at: new Date().toISOString() })
                            .eq("id", overlayId);
                    }, dur);
                    break;
                }
                case "data_refresh": {
                    // 데이터 재호출 — TODO: 실제 API 폴링 연동 시 확장
                    void writeLog("data_refresh", { overlay_name: overlay.template?.name });
                    break;
                }
                case "style_switch": {
                    // 스타일 프리셋 순환
                    const presets = action.config.presets || [];
                    if (presets.length === 0) break;
                    const currentStyle = overlay.current_data?._styleIndex || 0;
                    const nextStyle = (currentStyle + 1) % presets.length;
                    const newStyleData = { ...overlay.current_data, ...presets[nextStyle], _styleIndex: nextStyle };
                    await supabase.from("overlay_state")
                        .update({ current_data: newStyleData, updated_at: new Date().toISOString() })
                        .eq("id", overlayId);
                    break;
                }
                case "cycle_content": {
                    // 콘텐츠 순환 인덱스 증가
                    const contentsLen = action.config.contents?.length || 1;
                    const nextContentIdx = ((overlay.active_content_index || 0) + 1) % contentsLen;
                    await supabase.from("overlay_state")
                        .update({ active_content_index: nextContentIdx, updated_at: new Date().toISOString() })
                        .eq("id", overlayId);
                    break;
                }
            }
            void writeLog("action_execute", { action_type: action.type, action_label: action.label, overlay_name: overlay.template?.name });
        } catch (err) {
            console.error("Execute action error:", err);
        }
    };

    // 데이터 변경 확인 (운용자 적용)
    const confirmPendingData = async (overlayId: string) => {
        const overlay = overlayStates.find((o) => o.id === overlayId);
        if (!overlay?.pending_data) return;
        try {
            await supabase.from("overlay_state")
                .update({
                    current_data: overlay.pending_data,
                    pending_data: null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", overlayId);
            void writeLog("data_confirm", { overlay_name: overlay.template?.name });
        } catch (err) {
            console.error("Confirm data error:", err);
        }
    };

    // 데이터 변경 무시
    const dismissPendingData = async (overlayId: string) => {
        try {
            await supabase.from("overlay_state")
                .update({ pending_data: null, updated_at: new Date().toISOString() })
                .eq("id", overlayId);
        } catch (err) {
            console.error("Dismiss data error:", err);
        }
    };

    // ─── HTML 플러그인 대시보드 데이터 전송 ─────────────────────
    // ■ overlayStore.updateReplicantData / updateGroupData 사용
    // group_tag가 있으면 → 그룹 전체에 일괄 전송 (1번 호출 → N개 동시 업데이트)
    // group_tag가 없으면 → 개별 오버레이에만 전송 (기존 동작)
    const updateOverlayData = useCallback(async (overlayId: string, data: Record<string, unknown>) => {
        // 해당 오버레이에 group_tag가 있는지 확인
        const overlay = overlayStates.find((o) => o.id === overlayId);
        const groupTag = overlay?.group_tag;

        if (groupTag) {
            // ■ 그룹 전송: 같은 group_tag를 가진 모든 오버레이에 일괄 전송
            console.log("[OverlayPanel] 그룹 일괄 전송:", { groupTag, data });
            overlayStore?.updateGroupData(groupTag, data);
            void writeLog("group_data_update", { group_tag: groupTag, fields: Object.keys(data) });
        } else {
            // ■ 개별 전송: 해당 오버레이에만 전송
            console.log("[OverlayPanel] 개별 전송:", { overlayId, data });
            overlayStore?.updateReplicantData(overlayId, data);
            void writeLog("data_update", { overlay_id: overlayId, fields: Object.keys(data) });
        }
    }, [writeLog, overlayStore, overlayStates]);

    // ─── 그룹/태그 편집 저장 ──────────────────────────
    // ■ DB에 group_tag + tags 컨럼 직접 업데이트
    const updateOverlayTags = useCallback(async (
        overlayId: string,
        groupTag: string | null,
        tags: string[],
    ) => {
        try {
            const { error } = (await supabase
                .from("overlay_state" as any)
                .update({
                    group_tag: groupTag,
                    tags,
                    updated_at: new Date().toISOString(),
                } as any)
                .eq("id", overlayId)) as any;

            if (error) throw error;

            // Realtime이 자동 감지하지만 빠른 반영을 위해 수동 reload
            overlayStore?.reload();
            void writeLog("tags_update", { overlay_id: overlayId, group_tag: groupTag, tags });
        } catch (err) {
            console.error("Update tags error:", err);
        }
    }, [overlayStore, writeLog]);

    // 시간 포맷
    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    // 액션 타입 라벨 한글화
    const getActionLabel = (type: string) => {
        const labels: Record<string, string> = {
            overlay_on: "오버레이 ON",
            overlay_off: "오버레이 OFF",
            overlay_edit: "오버레이 편집",
            pgm_change: "PGM 변경",
            block_edit: "블록 편집",
            conflict_override: "⚠️ 충돌 무시",
        };
        return labels[type] || type;
    };

    // 필터링된 템플릿 (검색어 + 날짜 필터 적용)
    const filteredTemplates = useMemo(() => {
        let result = availableTemplates;

        // 이름 검색 필터
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (t) =>
                    t.name.toLowerCase().includes(q) ||
                    (t.description && t.description.toLowerCase().includes(q)),
            );
        }

        // 날짜 필터 (해당 날짜 이후 생성된 것만)
        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            result = result.filter(
                (t) => new Date(t.created_at) >= filterDate,
            );
        }

        return result;
    }, [availableTemplates, searchQuery, dateFilter]);

    // ─── 그룹 병합 렌더링 데이터 ─────────────────────────────
    // ■ Why 병합?
    //   같은 group_tag를 가진 오버레이들을 하나의 GroupOverlayCard로 묶어
    //   공유 대시보드에서 일괄 데이터 전송. 운용 편의성 극대화.
    //   비유: "같은 무전 채널의 단말기를 한 관제실에서 통합 관리"
    const { groupCards, ungroupedTemplates } = useMemo(() => {
        const groups = new Map<string, GroupMember[]>();
        const ungrouped: OverlayTemplate[] = [];

        for (const template of filteredTemplates) {
            const state = overlayStates.find((o) => o.template_id === template.id);
            if (state?.group_tag) {
                // 그룹에 소속된 오버레이
                const tag = state.group_tag;
                if (!groups.has(tag)) groups.set(tag, []);
                groups.get(tag)!.push({ template, overlayState: state });
            } else {
                // 그룹 미소속 → 개별 카드
                ungrouped.push(template);
            }
        }

        return {
            groupCards: Array.from(groups.entries()),
            ungroupedTemplates: ungrouped,
        };
    }, [filteredTemplates, overlayStates]);

    // 로딩 중
    if (loading) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "2rem",
                }}
            >
                <Loader2
                    size={20}
                    className="animate-spin"
                    style={{ color: "var(--accent-primary)" }}
                />
            </div>
        );
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
            }}
        >
            {/* 헤더: 카운트 + 로그 토글 */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--border-default)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                    }}
                >
                    <Layers size={16} />
                    오버레이 ({filteredTemplates.length})
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {/* 새로고침 */}
                    <button
                        type="button"
                        onClick={() => { loadTemplates(); loadOverlayStates(); }}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: "var(--text-tertiary)",
                            borderRadius: "4px",
                        }}
                        title="새로고침"
                    >
                        <RefreshCw size={14} />
                    </button>
                    {/* 로그 토글 */}
                    <button
                        type="button"
                        onClick={() => setShowLogs(!showLogs)}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: showLogs
                                ? "var(--accent-primary)"
                                : "var(--text-tertiary)",
                            borderRadius: "4px",
                        }}
                        title="로그 보기"
                    >
                        <ScrollText size={16} />
                    </button>
                </div>
            </div>

            {/* 필터 바 */}
            <div
                style={{
                    display: "flex",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    borderBottom: "1px solid var(--border-default)",
                    alignItems: "center",
                }}
            >
                {/* 이름 검색 */}
                <div style={{ position: "relative", flex: 1 }}>
                    <Search
                        size={14}
                        style={{
                            position: "absolute",
                            left: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--text-tertiary)",
                            pointerEvents: "none",
                        }}
                    />
                    <input
                        type="text"
                        placeholder="오버레이 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "6px 8px 6px 28px",
                            borderRadius: "6px",
                            border: "1px solid var(--border-default)",
                            backgroundColor: "var(--app-bg-alt)",
                            color: "var(--text-primary)",
                            fontSize: "0.75rem",
                            outline: "none",
                        }}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            style={{
                                position: "absolute",
                                right: "6px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--text-tertiary)",
                                padding: "2px",
                            }}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* 날짜 필터 */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                    <Calendar
                        size={14}
                        style={{
                            position: "absolute",
                            left: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--text-tertiary)",
                            pointerEvents: "none",
                        }}
                    />
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        style={{
                            padding: "6px 8px 6px 28px",
                            borderRadius: "6px",
                            border: "1px solid var(--border-default)",
                            backgroundColor: "var(--app-bg-alt)",
                            color: "var(--text-primary)",
                            fontSize: "0.75rem",
                            outline: "none",
                        }}
                    />
                </div>
            </div>

            {/* 본문: 오버레이 카드 갤러리 또는 로그 */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "0.5rem",
                }}
            >
                {showLogs ? (
                    /* 로그 뷰어 */
                    <div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "0.5rem",
                                padding: "0 0.5rem",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                📋 세션 로그 (최근 50개)
                            </span>
                            <button
                                type="button"
                                onClick={loadLogs}
                                style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--text-tertiary)",
                                    padding: "2px",
                                }}
                                title="새로고침"
                            >
                                <RefreshCw size={12} />
                            </button>
                        </div>
                        {logs.length === 0 ? (
                            <div
                                style={{
                                    textAlign: "center",
                                    padding: "2rem",
                                    color: "var(--text-tertiary)",
                                    fontSize: "0.8125rem",
                                }}
                            >
                                기록된 로그가 없습니다
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                {logs.map((log) => (
                                    <div
                                        key={log.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.5rem",
                                            padding: "0.375rem 0.5rem",
                                            fontSize: "0.6875rem",
                                            borderRadius: "4px",
                                            backgroundColor: "var(--app-bg-muted)",
                                        }}
                                    >
                                        <span
                                            style={{
                                                color: "var(--text-tertiary)",
                                                fontFamily: "monospace",
                                                flexShrink: 0,
                                            }}
                                        >
                                            {formatTime(log.created_at)}
                                        </span>
                                        <span
                                            style={{
                                                color: log.action_type.includes("conflict")
                                                    ? "#f59e0b"
                                                    : "var(--text-secondary)",
                                                flexShrink: 0,
                                            }}
                                        >
                                            {getActionLabel(log.action_type)}
                                        </span>
                                        <span
                                            style={{
                                                color: "var(--text-tertiary)",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {log.action_detail?.overlay_name ||
                                                log.action_detail?.block_name ||
                                                ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* 오버레이 카드 갤러리 (사전 정의 오버레이 송출 전용) */
                    <div>
                        {filteredTemplates.length === 0 ? (
                            <div
                                style={{
                                    textAlign: "center",
                                    padding: "2rem",
                                    color: "var(--text-tertiary)",
                                    fontSize: "0.8125rem",
                                }}
                            >
                                <Layers
                                    size={24}
                                    style={{ marginBottom: "0.5rem", opacity: 0.5 }}
                                />
                                {searchQuery || dateFilter ? (
                                    <p>검색 결과가 없습니다</p>
                                ) : (
                                    <>
                                        <p>등록된 오버레이가 없습니다</p>
                                        <p style={{ fontSize: "0.75rem" }}>
                                            대시보드 → 오버레이 템플릿에서 먼저 생성하세요
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(384px, 1fr))", gap: "0.5rem", alignItems: "start" }}>
                                {/* ■ 그룹 카드 — 같은 group_tag 멤버를 하나로 병합 */}
                                {groupCards.map(([tag, members]) => (
                                    <div
                                        key={`group-${tag}`}
                                        style={{
                                            // ■ 멤버 2개 이상이면 그리드 2칸 span → 내부 2컬럼이 넘치지 않음
                                            gridColumn: members.length >= 2 ? "span 2" : "span 1",
                                        }}
                                    >
                                        <GroupOverlayCard
                                            groupTag={tag}
                                            members={members}
                                            onSetPlayoutState={(overlay, state) => setOverlayPlayoutState(overlay, state)}
                                            onRemove={removeOverlayFromSession}
                                            onExecuteAction={executeAction}
                                            onUpdateData={updateOverlayData}
                                            onUpdateTags={updateOverlayTags}
                                        />
                                    </div>
                                ))}
                                {/* ■ 개별 카드 — 그룹 미소속 오버레이 */}
                                {ungroupedTemplates.map((template) => (
                                    <OverlayCard
                                        key={template.id}
                                        template={template}
                                        overlayState={overlayStates.find((o) => o.template_id === template.id)}
                                        onSetPlayoutState={(overlay, state) => setOverlayPlayoutState(overlay, state)}
                                        onAdd={addOverlayToSession}
                                        onRemove={removeOverlayFromSession}
                                        onExecuteAction={executeAction}
                                        onConfirmData={confirmPendingData}
                                        onDismissData={dismissPendingData}
                                        onUpdateData={updateOverlayData}
                                        onUpdateTags={updateOverlayTags}
                                        existingGroupTags={existingGroupTags}
                                        existingTags={existingTags}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 충돌 모달 */}
            {conflictModal && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0,0,0,0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2000,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: "var(--app-bg)",
                            borderRadius: "12px",
                            padding: "1.5rem",
                            width: "360px",
                            maxWidth: "90vw",
                            border: "1px solid var(--border-default)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                marginBottom: "1rem",
                                color: "#f59e0b",
                                fontSize: "1rem",
                                fontWeight: 600,
                            }}
                        >
                            <AlertTriangle size={20} />
                            레이어 충돌 감지
                        </div>
                        <p
                            style={{
                                fontSize: "0.875rem",
                                color: "var(--text-secondary)",
                                marginBottom: "1.5rem",
                                lineHeight: 1.5,
                            }}
                        >
                            <strong>"{conflictModal.overlayName}"</strong> 오버레이가 현재
                            PGM 블록{" "}
                            <strong>"{conflictModal.pgmBlockName}"</strong>과 겹칩니다.
                        </p>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.5rem",
                            }}
                        >
                            <Button
                                onClick={() => {
                                    const overlay = overlayStates.find(
                                        (o) => o.id === conflictModal.overlayId,
                                    );
                                    if (overlay) setOverlayPlayoutState(overlay, "program", "overlay");
                                }}
                                style={{ fontSize: "0.8125rem" }}
                            >
                                겹쳐서 표시
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    const overlay = overlayStates.find(
                                        (o) => o.id === conflictModal.overlayId,
                                    );
                                    if (overlay) setOverlayPlayoutState(overlay, "program", "hide_block");
                                }}
                                style={{ fontSize: "0.8125rem" }}
                            >
                                블록 숨기고 표시
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setConflictModal(null)}
                                style={{ fontSize: "0.8125rem" }}
                            >
                                취소
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
