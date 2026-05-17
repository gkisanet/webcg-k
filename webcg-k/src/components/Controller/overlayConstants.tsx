/**
 * 오버레이 패널 상수 및 인터페이스
 *
 * OverlayPanel.tsx에서 추출된 타입 정의, 카드 스타일 상수, 액션 아이콘 매핑.
 * Why 분리? → OverlayCard와 OverlayPanel이 공유하는 타입/상수를 단일 진실점에서 관리.
 */

import React from "react";
import {
    ToggleLeft,
    Play,
    RefreshCw,
    Palette,
    Repeat,
} from "lucide-react";
import type { GraphicElement } from "../GraphicPreviewRenderer";
import type { OverlayActionType } from "../../lib/overlayTypes";


// ─── RenderState: Renderer 실제 상태 (CQRS Query 채널) ─────────
export interface RenderState {
    /** 현재 렌더링 페이즈 */
    phase: "idle" | "entering" | "stable" | "leaving";
    /** 마지막 페이즈 변경 시각 (ISO 8601) */
    phaseChangedAt: string;
    /** 렌더링 컨텍스트 */
    context: "pgm" | "none";
}

// ─── 타입 정의 ──────────────────────────────────────────────────

export interface OverlayStateItem {
    id: string;
    session_id: string;
    template_id: string;
    is_active: boolean;
    current_data: any;
    replicant_data: any;           // HTML 플러그인 전용 실시간 데이터
    pending_data: any;             // 운용자 확인 대기 중인 데이터
    active_content_index: number;  // 콘텐츠 순환 현재 인덱스
    animation_state: string;
    /** Renderer가 보고한 실제 렌더링 상태 (CQRS Query 채널). Controller가 이 값을 읽어 UI 피드백. */
    render_state?: RenderState | null;
    conflict_mode: string;
    updated_at: string;
    // ■ 그룹 태그: 같은 group_tag를 가진 오버레이끼리 데이터 일괄 동기화
    // 예: "debate-timer" → 후보자CG + 시청자CG가 동시에 카운트다운 데이터 수신
    group_tag?: string | null;
    // ■ 렌더러 필터 태그: /render?tag=viewer 로 특정 태그만 표시
    // 예: ["viewer", "lower-third"]
    tags?: string[];
    template?: {
        id: string;
        name: string;
        description: string | null;
        layer: number;
        blend_mode?: string | null;
        graphic_data: GraphicElement[];
        animation_config: any;
        plugin_type?: string;
        source_code?: { html: string; css: string; js: string } | null;
        dashboard_schema?: DashboardSchema | null;
        replicant_defaults?: Record<string, unknown> | null;
        zone_bounds?: { x: number; y: number; width: number; height: number };
    } | null;
}

export interface OverlayTemplate {
    id: string;
    name: string;
    description: string | null;
    layer: number;
    blend_mode?: string | null;
    graphic_data: GraphicElement[];
    animation_config: any;
    created_at: string;
    plugin_type?: string;
    source_code?: { html: string; css: string; js: string };
    dashboard_schema?: DashboardSchema | null;
    replicant_defaults?: Record<string, unknown> | null;
}

// ─── 대시보드 스키마 (JSON Schema 기반 자동 폼 생성) ─────────
// ■ Why JSON Schema?
//   플러그인 개발자가 dashboard_schema를 정의하면
//   컨트롤러 카드에서 자동으로 폼 UI가 생성됨.
//   NodeCG의 dashboard panel과 같은 개념.
export interface DashboardSchemaProperty {
    type: string;       // "string" | "number" | "boolean"
    title: string;      // 표시 라벨
    default?: unknown;
    enum?: string[];    // 선택 목록
    minimum?: number;
    maximum?: number;
}

export interface DashboardSchema {
    properties: Record<string, DashboardSchemaProperty>;
}

export interface LogEntry {
    id: string;
    action_type: string;
    action_detail: any;
    created_at: string;
    user_id: string;
    user_email?: string;
}

export type ConflictChoice = "overlay" | "hide_block" | "cancel";

export interface OverlayPanelProps {
    sessionId: string;
    currentPgmBlock?: { id: string; name: string; trackId: number } | null;
    /** useOverlayStore 반환값 — 컨트롤러 페이지에서 전달 */
    overlayStore?: ReturnType<typeof import("../../hooks/useOverlayStore").useOverlayStore>;
}


// ─── 오버레이 카드 상수 스타일 (re-render 시 참조 재생성 방지) ────────

export const CARD_STYLES = {
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "8px",
        marginBottom: "0.5rem",
    } as React.CSSProperties,
    nameGroup: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flexWrap: "wrap",
        flex: 1,
        minWidth: 0,
    } as React.CSSProperties,
    name: {
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "var(--text-primary)",
        wordBreak: "keep-all",
    } as React.CSSProperties,
    layerBadge: {
        padding: "1px 6px",
        borderRadius: "3px",
        fontSize: "0.625rem",
        backgroundColor: "var(--app-bg-muted)",
        color: "var(--text-tertiary)",
        whiteSpace: "nowrap",
    } as React.CSSProperties,
    description: {
        fontSize: "0.75rem",
        color: "var(--text-tertiary)",
        margin: "0 0 0.5rem",
    } as React.CSSProperties,
    preview: {
        width: "120px",
        height: "68px",
        borderRadius: "4px",
        overflow: "hidden" as const,
        border: "1px solid var(--border-primary)",
        backgroundColor: "#000",
    } as React.CSSProperties,
    previewFull: { width: "100%", height: "100%" } as React.CSSProperties,
    removeBtn: {
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-tertiary)",
        fontSize: "0.6875rem",
        padding: "2px 4px",
    } as React.CSSProperties,
    addBtn: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 12px",
        borderRadius: "6px",
        border: "1px dashed var(--border-primary)",
        cursor: "pointer",
        fontSize: "0.6875rem",
        fontWeight: 600,
        backgroundColor: "transparent",
        color: "var(--text-tertiary)",
        transition: "all 0.2s",
        flexShrink: 0,
    } as React.CSSProperties,
    actionsRow: {
        display: "flex",
        gap: "4px",
        flexWrap: "wrap" as const,
        borderTop: "1px solid var(--border-subtle)",
        paddingTop: "0.5rem",
    } as React.CSSProperties,
} as const;


// ─── 액션 버튼 타입별 아이콘 매핑 ──────────────────────────────────

export const ACTION_ICON_MAP: Record<OverlayActionType, React.ReactNode> = {
    toggle: <ToggleLeft size={10} />,
    trigger: <Play size={10} />,
    data_refresh: <RefreshCw size={10} />,
    style_switch: <Palette size={10} />,
    cycle_content: <Repeat size={10} />,
};
