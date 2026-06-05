/**
 * OverlayCard — 오버레이 카드 (React.memo)
 *
 * OverlayPanel에서 추출된 개별 카드 컴포넌트.
 * props 변경 시에만 re-render되어 목록 스크롤 시 성능을 유지한다.
 *
 * ■ Phase 1 확장:
 *   HTML 플러그인(plugin_type==="html")일 때
 *   dashboard_schema 기반으로 인라인 대시보드 폼을 자동 생성.
 *   폼 값 변경 → onUpdateData → overlay_state.replicant_data 갱신
 *   → Realtime → PluginOverlayLayer iframe → postMessage → 그래픽 업데이트
 */

import React, { useCallback, useState } from "react";
import {
    Bell,
    Check,
    ChevronRight,
    ChevronUp,
    ChevronDown as ChevronDownIcon,
    Code2,
    Copy,
    Eye,
    Minus,
    Monitor,
    Plus,
    Send,
    Tag,
    Trash2,
} from "lucide-react";
import { GraphicPreviewRenderer } from "../GraphicPreviewRenderer";
import type { OverlayAction } from "../../lib/overlayTypes";
import type {
    OverlayStateItem,
    OverlayTemplate,
    DashboardSchemaProperty,
} from "./overlayConstants";
import { CARD_STYLES, ACTION_ICON_MAP } from "./overlayConstants";

/** ■ PVW/PGM 3-state 타입
 *   "off"     → 비활성 (어디에도 미표시)
 *   "preview" → PVW 모니터에만 표시 (렌더러/OBS에는 안 나감)
 *   "program" → PGM 송출 (PVW + 렌더러 모두 표시)
 */
export type OverlayPlayoutState = "off" | "preview" | "program";

export interface OverlayCardProps {
    template: OverlayTemplate;
    overlayState: OverlayStateItem | undefined;
    /** PVW/PGM/OFF 3-state 전환 */
    onSetPlayoutState: (overlay: OverlayStateItem, state: OverlayPlayoutState) => void;
    onAdd: (templateId: string) => void;
    onRemove: (id: string) => void;
    onExecuteAction: (overlayId: string, action: OverlayAction) => void;
    onConfirmData: (overlayId: string) => void;
    onDismissData: (overlayId: string) => void;
    onUpdateData?: (overlayId: string, data: Record<string, unknown>) => void;
    /** ■ 그룹/태그 편집 콜백 */
    onUpdateTags?: (overlayId: string, groupTag: string | null, tags: string[]) => void;
    /** ■ 기저장된 그룹/태그 목록 — 드롭다운 자동완성용 */
    existingGroupTags?: string[];
    existingTags?: string[];
}

export const OverlayCard = React.memo(function OverlayCard({
    template,
    overlayState,
    onSetPlayoutState,
    onAdd,
    onRemove,
    onExecuteAction,
    onConfirmData,
    onDismissData,
    onUpdateData,
    onUpdateTags,
    existingGroupTags = [],
    existingTags = [],
}: OverlayCardProps) {
    const isInSession = !!overlayState;
    const isActive = overlayState?.is_active ?? false;
    const isHtmlPlugin = template.plugin_type === "html";
    const actionButtons: OverlayAction[] =
        template.animation_config?.actions || [];
    const hasPendingData = !!overlayState?.pending_data;

    // ■ 현재 playout 상태 파생
    const currentPlayoutState: OverlayPlayoutState = isActive
        ? "program"
        : overlayState?.animation_state === "preview"
            ? "preview"
            : "off";

    // ■ CQRS: Renderer가 보고한 실제 렌더링 페이즈
    const renderPhase = overlayState?.render_state?.phase;

    // ─── 그룹/태그 편집 상태 ───
    const [showTagEditor, setShowTagEditor] = useState(false);
    const [editGroupTag, setEditGroupTag] = useState(overlayState?.group_tag ?? "");
    const [editTags, setEditTags] = useState(overlayState?.tags?.join(", ") ?? "");

    // ■ 태그 저장 핸들러
    const handleSaveTags = useCallback(() => {
        if (!overlayState || !onUpdateTags) return;
        const groupTag = editGroupTag.trim() || null;
        const tags = editTags
            .split(",")
            .map(t => t.trim())
            .filter(Boolean);
        onUpdateTags(overlayState.id, groupTag, tags);
        setShowTagEditor(false);
    }, [overlayState, onUpdateTags, editGroupTag, editTags]);

    // ─── 대시보드 폼 상태 ───
    // ■ Why 로컬 상태?
    //   매 키 입력마다 DB를 갱신하면 Realtime 이벤트 폭발.
    //   로컬에서 편집 → "전송" 버튼으로 일괄 반영.
    const [showDashboard, setShowDashboard] = useState(false);
    const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
        // 초기값: overlay_state.replicant_data > replicant_defaults > schema defaults
        const defaults: Record<string, unknown> = {};
        const schema = template.dashboard_schema;
        if (schema?.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
                defaults[key] = prop.default ?? "";
            }
        }
        return {
            ...defaults,
            ...(template.replicant_defaults || {}),
            ...(overlayState?.replicant_data || {}),
        };
    });

    const handleFieldChange = useCallback((key: string, value: unknown) => {
        setFormValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    const handleSendData = useCallback(() => {
        if (!overlayState || !onUpdateData) return;
        onUpdateData(overlayState.id, formValues);
    }, [overlayState, onUpdateData, formValues]);

    // ■ CQRS 시각적 피드백: renderPhase에 따른 border 스타일
    const getBorderStyle = (): string => {
        if (!isActive) return hasPendingData ? "#f59e0b" : "var(--border-default)";
        if (renderPhase === "entering") return "#3b82f6"; // blue — entering
        if (renderPhase === "leaving") return "#ef4444";   // red — exiting
        return "var(--accent-primary)"; // blue — stable default
    };
    const getBgStyle = (): string => {
        if (!isActive) return "var(--app-bg-alt)";
        if (renderPhase === "leaving") return "rgba(239, 68, 68, 0.06)";
        return "rgba(59, 130, 246, 0.08)";
    };
    const phaseLabel = isActive && renderPhase && (renderPhase === "entering" || renderPhase === "leaving")
        ? (renderPhase === "entering" ? "진입 중..." : "종료 중...")
        : null;

    return (
        <>
            <style>{`
                @keyframes cgPhasePulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
            <div
                style={{
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: `1px solid ${getBorderStyle()}`,
                    backgroundColor: getBgStyle(),
                    animation: (renderPhase === "entering" || renderPhase === "leaving")
                        ? `cgPhasePulse 1.2s ease-in-out infinite`
                        : undefined,
                    transition: "all 0.2s",
                    display: "flex",
                    flexDirection: "column" as const,
                }}
            >
                {/* 카드 상단: 이름 + 레이어 + 타입 뱃지 + ON/OFF */}
                <div style={CARD_STYLES.header}>
                    <div style={CARD_STYLES.nameGroup}>
                        <span style={CARD_STYLES.name}>{template.name}</span>
                    <span style={CARD_STYLES.layerBadge}>L{template.layer}</span>
                    {/* CQRS: Renderer 실제 상태 표시 */}
                    {phaseLabel && (
                        <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "1px 5px",
                            borderRadius: "0.25rem",
                            fontSize: "0.5625rem",
                            fontWeight: 600,
                            backgroundColor: renderPhase === "entering" ? "rgba(59,130,246,0.15)" : "rgba(239,68,68,0.15)",
                            color: renderPhase === "entering" ? "#3b82f6" : "#ef4444",
                        }}>
                            {phaseLabel}
                        </span>
                    )}
                    {/* HTML 플러그인 뱃지 */}
                    {isHtmlPlugin && (
                        <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            padding: "1px 5px",
                            borderRadius: "0.25rem",
                            fontSize: "0.5625rem",
                            fontWeight: 700,
                            fontFamily: "monospace",
                            backgroundColor: "rgba(6, 182, 212, 0.15)",
                            color: "#06b6d4",
                        }}>
                            <Code2 size={8} /> HTML
                        </span>
                    )}
                    {hasPendingData && (
                        <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            padding: "1px 5px",
                            borderRadius: "8px",
                            fontSize: "0.5625rem",
                            fontWeight: 700,
                            backgroundColor: "#f59e0b",
                            color: "#000",
                            animation: "pulse 1.5s infinite",
                        }}>
                            <Bell size={8} /> 변경
                        </span>
                    )}
                    {/* ■ 그룹 태그 뱃지 — 같은 group_tag 오버레이끼리 데이터 동기화 */}
                    {overlayState?.group_tag && (
                        <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            padding: "1px 5px",
                            borderRadius: "0.25rem",
                            fontSize: "0.5625rem",
                            fontWeight: 700,
                            fontFamily: "monospace",
                            backgroundColor: "rgba(168, 85, 247, 0.15)",
                            color: "#a855f7",
                        }}
                        title={`그룹: ${overlayState.group_tag} — 같은 그룹 오버레이에 데이터 일괄 전송`}
                        >
                            🔗 {overlayState.group_tag}
                        </span>
                    )}
                    {/* ■ 렌더러 필터 태그 — /render?tag=xxx 로 필터링 */}
                    {overlayState?.tags && overlayState.tags.length > 0 && overlayState.tags.map((t) => (
                        <span key={t} style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            padding: "1px 5px",
                            borderRadius: "0.25rem",
                            fontSize: "0.5rem",
                            fontWeight: 600,
                            fontFamily: "monospace",
                            backgroundColor: "rgba(34, 197, 94, 0.12)",
                            color: "#22c55e",
                        }}
                        title={`출력 태그: /render?tag=${t}`}
                        >
                            🏷️ {t}
                        </span>
                    ))}
                </div>
                {isInSession ? (
                    /* ■ PVW / PGM / OFF 3-state 버튼 그룹
                       방송 표준 워크플로우:
                       OFF → PVW(프리뷰 확인) → PGM(실제 송출) → OFF
                       비유: TV 비전 믹서의 PVW/PGM 버스 전환 */
                    <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                        {/* PVW 버튼 — 프리뷰 전용 */}
                        <button
                            type="button"
                            onClick={() => {
                                if (!overlayState) return;
                                onSetPlayoutState(
                                    overlayState,
                                    currentPlayoutState === "preview" ? "off" : "preview",
                                );
                            }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "3px 8px",
                                borderRadius: "4px",
                                border: "none",
                                cursor: "pointer",
                                fontSize: "0.625rem",
                                fontWeight: 600,
                                backgroundColor: currentPlayoutState === "preview" ? "#f59e0b" : "var(--app-bg-muted)",
                                color: currentPlayoutState === "preview" ? "#000" : "var(--text-tertiary)",
                                transition: "all 0.15s",
                            }}
                            title="PVW (프리뷰에만 표시)"
                        >
                            <Eye size={10} />
                            PVW
                        </button>
                        {/* PGM 버튼 — 실제 송출 */}
                        <button
                            type="button"
                            onClick={() => {
                                if (!overlayState) return;
                                onSetPlayoutState(
                                    overlayState,
                                    currentPlayoutState === "program" ? "off" : "program",
                                );
                            }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "3px 8px",
                                borderRadius: "4px",
                                border: "none",
                                cursor: "pointer",
                                fontSize: "0.625rem",
                                fontWeight: 600,
                                backgroundColor: currentPlayoutState === "program" ? "#ef4444" : "var(--app-bg-muted)",
                                color: currentPlayoutState === "program" ? "white" : "var(--text-tertiary)",
                                transition: "all 0.15s",
                            }}
                            title="PGM (렌더러에 송출)"
                        >
                            <Monitor size={10} />
                            PGM
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => onAdd(template.id)}
                        style={CARD_STYLES.addBtn}
                    >
                        + 추가
                    </button>
                )}
            </div>

            {/* 세션에 추가된 경우에만 하단 바디 펼침 (아닐 경우 콤팩트하게 접힘) */}
            {isInSession && (
                <>
                    {/* 설명 */}
                    {template.description && (
                        <p style={CARD_STYLES.description}>{template.description}</p>
                    )}

                    {/* 미니 프리뷰 + 제거 */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: (actionButtons.length > 0 || hasPendingData || isHtmlPlugin) ? "0.5rem" : 0 }}>
                        {template.graphic_data && template.graphic_data.length > 0 && (
                            <div style={CARD_STYLES.preview}>
                                <GraphicPreviewRenderer
                                    elements={template.graphic_data}
                                    canvasWidth={1920}
                                    canvasHeight={1080}
                                    style={CARD_STYLES.previewFull}
                                />
                            </div>
                        )}
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    {/* HTML 플러그인: 대시보드 토글 버튼 */}
                    {isInSession && isHtmlPlugin && template.dashboard_schema && (
                        <button
                            type="button"
                            onClick={() => setShowDashboard(!showDashboard)}
                            style={{
                                background: "none",
                                border: "1px solid var(--border-default)",
                                cursor: "pointer",
                                color: showDashboard ? "var(--accent-primary)" : "var(--text-tertiary)",
                                fontSize: "0.6875rem",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                            }}
                        >
                            {showDashboard ? <ChevronUp size={10} /> : <ChevronDownIcon size={10} />}
                            대시보드
                        </button>
                    )}
                    {/* ■ 태그 편집 토글 버튼 */}
                    <button
                            type="button"
                            onClick={() => setShowTagEditor(!showTagEditor)}
                            style={{
                                background: "none",
                                border: "1px solid var(--border-default)",
                                cursor: "pointer",
                                color: showTagEditor ? "#a855f7" : "var(--text-tertiary)",
                                fontSize: "0.6875rem",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                            }}
                            title="그룹 태그 / 출력 태그 설정"
                        >
                            <Tag size={10} />
                            태그
                        </button>
                    {/* ■ 제거 버튼: OFF 상태일 때만 활성화
                       Why? PGM 송출 중 실수로 제거하면 방송 사고.
                       OFF로 먼저 내린 뒤에만 제거 가능. */}
                    <button
                            type="button"
                            onClick={() => { if (overlayState) onRemove(overlayState.id); }}
                            disabled={currentPlayoutState !== "off"}
                            style={{
                                ...CARD_STYLES.removeBtn,
                                opacity: currentPlayoutState !== "off" ? 0.3 : 1,
                                cursor: currentPlayoutState !== "off" ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "2px",
                            }}
                            title={currentPlayoutState !== "off" ? "OFF 상태에서만 제거 가능" : "세션에서 제거"}
                        >
                            <Trash2 size={10} />
                            제거
                        </button>
                    </div>
                </div>

            {/* ─── 그룹/태그 인라인 편집 패널 ───────────────────── */}
            {/* ■ Why 인라인 편집?
                 DB 직접 수정 없이 컨트롤러 UI에서 group_tag / tags를 설정.
                 group_tag: 같은 데이터를 공유할 오버레이 그룹명
                 tags: 렌더러 필터용 라벨 (콤마로 구분) */}
            {showTagEditor && (
                <div style={{
                    padding: "8px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(168, 85, 247, 0.05)",
                    border: "1px solid rgba(168, 85, 247, 0.15)",
                    marginBottom: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                }}>
                    <div style={{
                        fontSize: "0.625rem",
                        fontWeight: 700,
                        color: "#a855f7",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.5px",
                        marginBottom: "2px",
                    }}>
                        🔗 그룹 / 🏷️ 출력 태그
                    </div>
                    {/* 그룹 태그 입력 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <label style={{
                            fontSize: "0.625rem",
                            color: "var(--text-secondary)",
                            minWidth: "55px",
                            flexShrink: 0,
                        }}>그룹</label>
                        <input
                            type="text"
                            list="group-tag-suggestions"
                            value={editGroupTag}
                            onChange={(e) => setEditGroupTag(e.target.value)}
                            placeholder="예: debate-timer"
                            style={{
                                flex: 1,
                                padding: "3px 6px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-default)",
                                backgroundColor: "var(--app-bg-alt)",
                                color: "var(--text-primary)",
                                fontSize: "0.6875rem",
                                fontFamily: "monospace",
                                outline: "none",
                            }}
                        />
                        {/* ■ 기저장된 group_tag 드롭다운 */}
                        <datalist id="group-tag-suggestions">
                            {existingGroupTags.map((gt) => (
                                <option key={gt} value={gt} />
                            ))}
                        </datalist>
                    </div>
                    {/* 출력 태그 입력 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <label style={{
                            fontSize: "0.625rem",
                            color: "var(--text-secondary)",
                            minWidth: "55px",
                            flexShrink: 0,
                        }}>출력 태그</label>
                        <input
                            type="text"
                            list="output-tag-suggestions"
                            value={editTags}
                            onChange={(e) => setEditTags(e.target.value)}
                            placeholder="예: viewer, lower-third"
                            style={{
                                flex: 1,
                                padding: "3px 6px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-default)",
                                backgroundColor: "var(--app-bg-alt)",
                                color: "var(--text-primary)",
                                fontSize: "0.6875rem",
                                fontFamily: "monospace",
                                outline: "none",
                            }}
                        />
                        {/* ■ 기저장된 출력 태그 드롭다운 */}
                        <datalist id="output-tag-suggestions">
                            {existingTags.map((t) => (
                                <option key={t} value={t} />
                            ))}
                        </datalist>
                    </div>
                    {/* 저장 버튼 */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}>
                        <button
                            type="button"
                            onClick={() => setShowTagEditor(false)}
                            style={{
                                padding: "3px 10px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-default)",
                                background: "none",
                                color: "var(--text-tertiary)",
                                fontSize: "0.625rem",
                                cursor: "pointer",
                            }}
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveTags}
                            style={{
                                padding: "3px 10px",
                                borderRadius: "4px",
                                border: "none",
                                backgroundColor: "#a855f7",
                                color: "white",
                                fontSize: "0.625rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                            }}
                        >
                            <Check size={10} />
                            저장
                        </button>
                    </div>
                </div>
            )}

            {/* ■ 저장된 태그의 렌더러 URL 복사 섹션 (항상 표시) */}
            {/* 비유: OBS 브라우저 소스에 붙여넣을 URL을 클립보드에 복사 */}
            {overlayState?.tags && overlayState.tags.length > 0 && (
                <div style={{
                    marginBottom: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                }}>
                    <div style={{
                        fontSize: "0.5625rem",
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.5px",
                    }}>
                        📎 렌더러 URL (클릭으로 복사)
                    </div>
                    {overlayState.tags.map((t) => {
                        const url = `${window.location.origin}/render?sessionId=${overlayState.session_id}&tag=${t}`;
                        return (
                            <button
                                key={t}
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(url);
                                    alert("클립보드에 복사되었습니다:\n" + url);
                                }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    width: "100%",
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    border: "1px dashed rgba(34, 197, 94, 0.4)",
                                    backgroundColor: "rgba(34, 197, 94, 0.05)",
                                    color: "#22c55e",
                                    fontSize: "0.625rem",
                                    fontFamily: "monospace",
                                    cursor: "pointer",
                                    textAlign: "left" as const,
                                    transition: "all 0.15s",
                                }}
                                title={`클릭하여 복사: ${url}`}
                            >
                                <Copy size={10} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    /render?...&tag={t}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ■ Why 인라인 폼?
                 NodeCG의 dashboard panel과 같은 개념.
                 dashboard_schema.properties를 순회하여
                 타입별로 적절한 입력 컨트롤을 자동 생성.
                 컨트롤러 운용자가 팀명/점수 등을 직접 입력하고
                 "전송" 버튼으로 렌더러에 데이터를 전달한다. */}
            {isHtmlPlugin && showDashboard && template.dashboard_schema && (
                <div style={{
                    padding: "8px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(6, 182, 212, 0.05)",
                    border: "1px solid rgba(6, 182, 212, 0.15)",
                    marginBottom: actionButtons.length > 0 ? "0.5rem" : 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                }}>
                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "4px",
                    }}>
                        <div style={{
                            fontSize: "0.625rem",
                            fontWeight: 700,
                            color: "#06b6d4",
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.5px",
                        }}>
                            대시보드 컨트롤
                        </div>
                    </div>

                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        maxHeight: "200px",
                        overflowY: "auto",
                        paddingRight: "4px", // 스크롤바 영역
                    }}>
                        {Object.entries(template.dashboard_schema.properties).map(
                            ([key, prop]) => (
                                <DashboardField
                                    key={key}
                                    fieldKey={key}
                                    prop={prop}
                                    value={formValues[key]}
                                    onChange={handleFieldChange}
                                />
                            ),
                        )}
                    </div>

                    {/* 데이터 전송 버튼 */}
                    <button
                        type="button"
                        onClick={handleSendData}
                        style={{
                            padding: "5px 12px",
                            borderRadius: "0.375rem",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            backgroundColor: "#06b6d4",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            transition: "all 0.15s",
                            marginTop: "2px",
                        }}
                    >
                        <Send size={10} /> 데이터 전송
                    </button>
                </div>
            )}

            {/* 데이터 변경 확인 바 */}
            {hasPendingData && (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    marginBottom: actionButtons.length > 0 ? "0.5rem" : 0,
                    fontSize: "0.6875rem",
                }}>
                    <Bell size={12} style={{ color: "#f59e0b", flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--text-secondary)" }}>데이터 변경 감지</span>
                    <button
                        type="button"
                        onClick={() => { if (overlayState) onConfirmData(overlayState.id); }}
                        style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.625rem",
                            fontWeight: 600,
                            backgroundColor: "#22c55e",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            gap: "2px",
                        }}
                    >
                        <Check size={10} /> 적용
                    </button>
                    <button
                        type="button"
                        onClick={() => { if (overlayState) onDismissData(overlayState.id); }}
                        style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--border-default)",
                            cursor: "pointer",
                            fontSize: "0.625rem",
                            fontWeight: 600,
                            backgroundColor: "transparent",
                            color: "var(--text-tertiary)",
                        }}
                    >
                        무시
                    </button>
                </div>
            )}

            {/* 액션 버튼 영역 */}
            {actionButtons.length > 0 && (
                <div style={CARD_STYLES.actionsRow}>
                    {actionButtons.map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            onClick={() => {
                                if (overlayState) onExecuteAction(overlayState.id, action);
                            }}
                            title={`${action.type}: ${action.label}`}
                            style={{
                                padding: "3px 10px",
                                fontSize: "0.625rem",
                                fontWeight: 600,
                                border: "1px solid var(--border-default)",
                                borderRadius: "4px",
                                cursor: "pointer",
                                background: action.color || "var(--app-bg-muted)",
                                color: action.color ? "white" : "var(--text-secondary)",
                                transition: "opacity 0.15s",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                            }}
                        >
                            {ACTION_ICON_MAP[action.type] || <ChevronRight size={10} />}
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
                </>
            )}
        </div>
        </>
    );
});


// ─── DashboardField — dashboard_schema 기반 자동 폼 필드 ─────────
// ■ Why 컴포넌트 분리?
//   각 필드 타입(string, number, boolean, enum)별 렌더링을 깔끔히 분리.
//   OverlayCard 안에서 인라인으로 쓰면 코드가 비대해진다.
/** 색상으로 보이는 string 필드를 탐지 (hex 값 또는 색상 키워드 기반) */
function isColorLikeField(prop: DashboardSchemaProperty, value: unknown): boolean {
  if (prop.type === "color") return true;
  if (prop.type !== "string") return false;
  const title = (prop.title || "").toLowerCase();
  const keywords = ["color", "colour", "색", "fill", "bg", "background", "gradient", "그레디언트", "border", "stroke"];
  if (keywords.some((k) => title.includes(k))) return true;
  const val = String(value || "");
  if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(val)) return true;
  return false;
}

function DashboardField({
    fieldKey,
    prop,
    value,
    onChange,
}: {
    fieldKey: string;
    prop: DashboardSchemaProperty;
    value: unknown;
    onChange: (key: string, value: unknown) => void;
}) {
    const fieldStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
    };
    const labelStyle: React.CSSProperties = {
        fontSize: "0.6875rem",
        fontWeight: 600,
        color: "var(--text-secondary)",
        flex: 1,
        lineHeight: 1.2,
        wordBreak: "keep-all",
    };
    const inputStyle: React.CSSProperties = {
        width: "160px", // 쓸데없이 길어지는 것을 방지 (고정 너비)
        flexShrink: 0,
        padding: "4px 8px",
        borderRadius: "4px",
        border: "1px solid var(--border-default)",
        backgroundColor: "var(--app-bg)",
        color: "var(--text-primary)",
        fontSize: "0.75rem",
        textAlign: "center", // 중간 정렬 추가
        outline: "none",
        boxSizing: "border-box",
    };

    // 1. enum → select dropdown
    if (prop.enum && prop.enum.length > 0) {
        return (
            <div style={fieldStyle}>
                <label style={labelStyle}>{prop.title}</label>
                <select
                    style={{ ...inputStyle, cursor: "pointer", textAlign: "center", textAlignLast: "center" }}
                    value={String(value ?? "")}
                    onChange={(e) => onChange(fieldKey, e.target.value)}
                >
                    {prop.enum.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            </div>
        );
    }

    // 2. number → input + stepper
    if (prop.type === "number") {
        const numVal = Number(value) || 0;
        const min = prop.minimum ?? -Infinity;
        const max = prop.maximum ?? Infinity;
        return (
            <div style={fieldStyle}>
                <label style={labelStyle}>{prop.title}</label>
                <div style={{ display: "flex", alignItems: "center", gap: "2px", width: "160px", flexShrink: 0 }}>
                    <input
                        type="number"
                        style={{ ...inputStyle, width: "auto", flex: 1, textAlign: "center" }}
                        value={numVal}
                        min={min}
                        max={max}
                        onChange={(e) => onChange(fieldKey, parseInt(e.target.value, 10) || 0)}
                    />
                    {/* ▲▼ stepper — 방송 중 클릭으로 빠르게 조작 */}
                    <button
                        type="button"
                        onClick={() => onChange(fieldKey, Math.min(numVal + 1, max))}
                        style={stepperBtnStyle}
                        title="증가"
                    >
                        <Plus size={10} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange(fieldKey, Math.max(numVal - 1, min))}
                        style={stepperBtnStyle}
                        title="감소"
                    >
                        <Minus size={10} />
                    </button>
                </div>
            </div>
        );
    }

    // 3. boolean → toggle
    if (prop.type === "boolean") {
        const boolVal = Boolean(value);
        return (
            <div style={fieldStyle}>
                <label style={labelStyle}>{prop.title}</label>
                <div style={{ width: "160px", display: "flex", justifyContent: "flex-start", flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={() => onChange(fieldKey, !boolVal)}
                        style={{
                            padding: "3px 14px",
                            borderRadius: "4px",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.625rem",
                            fontWeight: 600,
                            backgroundColor: boolVal ? "#22c55e" : "var(--app-bg-muted)",
                            color: boolVal ? "white" : "var(--text-secondary)",
                            transition: "all 0.15s",
                            width: "60px",
                        }}
                    >
                        {boolVal ? "ON" : "OFF"}
                    </button>
                </div>
            </div>
        );
    }

    // 4. color (또는 색상처럼 보이는 string) → color picker + hex text
    if (isColorLikeField(prop, value)) {
        return (
            <div style={fieldStyle}>
                <label style={labelStyle}>{prop.title}</label>
                <div style={{ width: "160px", flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                        type="color"
                        style={{ ...inputStyle, width: "40px", height: "28px", padding: "2px", cursor: "pointer" }}
                        value={String(value || "#ffffff")}
                        onChange={(e) => onChange(fieldKey, e.target.value)}
                    />
                    <input
                        type="text"
                        style={{ ...inputStyle, flex: 1, width: "auto" }}
                        value={String(value ?? "")}
                        onChange={(e) => onChange(fieldKey, e.target.value)}
                        placeholder="#RRGGBB"
                    />
                </div>
            </div>
        );
    }

    // 5. string (기본) → text input
    return (
        <div style={fieldStyle}>
            <label style={labelStyle}>{prop.title}</label>
            <input
                type="text"
                style={inputStyle}
                value={String(value ?? "")}
                onChange={(e) => onChange(fieldKey, e.target.value)}
                placeholder={prop.title}
            />
        </div>
    );
}

// Stepper 버튼 공통 스타일
const stepperBtnStyle: React.CSSProperties = {
    width: "22px",
    height: "22px",
    borderRadius: "0.25rem",
    border: "1px solid var(--border-default)",
    backgroundColor: "var(--app-bg-muted)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    transition: "all 0.1s",
};
