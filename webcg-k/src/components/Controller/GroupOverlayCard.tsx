/**
 * GroupOverlayCard — 같은 group_tag를 가진 오버레이들을 하나의 카드로 병합
 *
 * ■ Why?
 *   토론 방송처럼 "후보자A CG + 후보자B CG + 시청자CG"가 같은 데이터를 공유할 때,
 *   3개의 카드를 각각 조작하는 대신 1개의 그룹 카드에서 통합 제어.
 *   비유: "같은 채널의 워키토키 3대를 한 관제실에서 제어"
 *
 * ■ 합집합(Union) 스키마:
 *   멤버마다 dashboard_schema가 다를 수 있으므로,
 *   모든 멤버의 properties를 합집합(Union)으로 병합.
 *   특정 멤버에만 있는 필드에는 소속 라벨을 표시.
 *
 * ■ 그룹의 역할:
 *   오직 "공유 대시보드"만 그룹 기능. PVW/PGM 송출 제어는 항상 개별.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
    ChevronDown as ChevronDownIcon,
    ChevronUp,
    Code2,
    Copy,
    Layers,
    Minus,
    Plus,
    Send,
    Unlink,
    X,
} from "lucide-react";
import type { OverlayAction } from "../../lib/overlayTypes";
import type {
    OverlayStateItem,
    OverlayTemplate,
    DashboardSchemaProperty,
} from "./overlayConstants";
import type { OverlayPlayoutState } from "./OverlayCard";

// ─── 그룹 멤버 정보 ─────────────────────────────────────
export interface GroupMember {
    template: OverlayTemplate;
    overlayState: OverlayStateItem;
}

export interface GroupOverlayCardProps {
    groupTag: string;
    members: GroupMember[];
    onSetPlayoutState: (overlay: OverlayStateItem, state: OverlayPlayoutState) => void;
    onRemove: (id: string) => void;
    onExecuteAction: (overlayId: string, action: OverlayAction) => void;
    onUpdateData?: (overlayId: string, data: Record<string, unknown>) => void;
    onUpdateTags?: (overlayId: string, groupTag: string | null, tags: string[]) => void;
}

// ■ 합집합 스키마 필드 + 소속 메타데이터
interface MergedField {
    key: string;
    prop: DashboardSchemaProperty;
    /** 이 필드를 가진 멤버 이름들 (전체 멤버가 가지면 null) */
    owners: string[] | null;
}

export const GroupOverlayCard = React.memo(function GroupOverlayCard({
    groupTag,
    members,
    onSetPlayoutState,
    onUpdateData,
    onUpdateTags,
}: GroupOverlayCardProps) {
    const [showDashboard, setShowDashboard] = useState(false);

    // ─── 그룹 해제 핸들러 ──────────────────────────────────
    // ■ 개별 멤버를 그룹에서 분리 (group_tag를 null로 설정)
    const handleUnlinkMember = useCallback((overlayId: string, tags: string[]) => {
        if (!onUpdateTags) return;
        onUpdateTags(overlayId, null, tags);
    }, [onUpdateTags]);

    // ■ 그룹 전체 해제 — 모든 멤버의 group_tag를 null로
    const handleDissolveGroup = useCallback(() => {
        if (!onUpdateTags) return;
        for (const m of members) {
            onUpdateTags(m.overlayState.id, null, m.overlayState.tags ?? []);
        }
    }, [onUpdateTags, members]);

    // ─── 그룹 전체 상태 파생 (보더 색상용) ────────────────────
    const anyProgram = members.some((m) => m.overlayState.is_active);

    // ─── 합집합 스키마 병합 ────────────────────────────────
    // Step 1: 모든 멤버의 dashboard_schema.properties를 수집
    // Step 2: 같은 key → 하나로 합침 (첫 발견 정의 우선)
    // Step 3: 특정 멤버에만 있는 필드 → owners에 소속 이름 기록
    const mergedFields = useMemo<MergedField[]>(() => {
        const fieldMap = new Map<string, { prop: DashboardSchemaProperty; ownerNames: Set<string> }>();
        const totalMembers = members.length;

        for (const m of members) {
            const schema = m.template.dashboard_schema;
            if (!schema?.properties) continue;
            for (const [key, prop] of Object.entries(schema.properties)) {
                if (!fieldMap.has(key)) {
                    fieldMap.set(key, { prop, ownerNames: new Set() });
                }
                fieldMap.get(key)!.ownerNames.add(m.template.name);
            }
        }

        return Array.from(fieldMap.entries()).map(([key, { prop, ownerNames }]) => ({
            key,
            prop,
            owners: ownerNames.size === totalMembers ? null : Array.from(ownerNames),
        }));
    }, [members]);

    const hasAnyDashboard = mergedFields.length > 0;

    // ─── 통합 폼 상태 ─────────────────────────────────────
    const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
        const defaults: Record<string, unknown> = {};
        for (const f of mergedFields) {
            defaults[f.key] = f.prop.default ?? "";
        }
        const firstData = members[0]?.overlayState?.replicant_data;
        if (firstData && typeof firstData === "object") {
            Object.assign(defaults, firstData);
        }
        return defaults;
    });

    const handleFieldChange = useCallback((key: string, value: unknown) => {
        setFormValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    // ■ 그룹 데이터 전송
    const handleSendGroupData = useCallback(() => {
        if (!onUpdateData || members.length === 0) return;
        onUpdateData(members[0].overlayState.id, formValues);
    }, [onUpdateData, members, formValues]);

    // ─── 멤버별 playout 상태 ──────────────────────────────
    const getMemberState = (m: GroupMember): OverlayPlayoutState =>
        m.overlayState.is_active
            ? "program"
            : m.overlayState.animation_state === "preview"
                ? "preview"
                : "off";

    return (
        <div
            style={{
                padding: "0.75rem",
                borderRadius: "10px",
                border: `1.5px solid ${anyProgram ? "var(--accent-primary)" : "rgba(168, 85, 247, 0.35)"}`,
                backgroundColor: anyProgram ? "rgba(59, 130, 246, 0.06)" : "rgba(168, 85, 247, 0.04)",
                transition: "all 0.25s",
                display: "flex",
                flexDirection: "column" as const,
            }}
        >
            {/* ─── 그룹 헤더 (제목만 단독 배치) ──────────── */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "0.5rem",
            }}>
                <Layers size={14} style={{ color: "#a855f7", flexShrink: 0 }} />
                <span style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "#a855f7",
                }}>
                    {groupTag}
                </span>
                {/* 그룹 전체 해제 버튼 */}
                <button
                    type="button"
                    onClick={handleDissolveGroup}
                    style={{
                        background: "none",
                        border: "1px dashed rgba(239,68,68,0.3)",
                        cursor: "pointer",
                        color: "var(--text-tertiary)",
                        fontSize: "0.5625rem",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                        transition: "all 0.15s",
                    }}
                    title="그룹 전체 해제 — 모든 멤버를 개별 카드로 분리"
                >
                    <Unlink size={9} />
                    해제
                </button>
                <span style={{
                    fontSize: "0.625rem",
                    color: "var(--text-tertiary)",
                    backgroundColor: "var(--app-bg-muted)",
                    padding: "1px 6px",
                    borderRadius: "8px",
                }}>
                    {members.length}개
                </span>
            </div>

            {/* ─── 멤버 카드 2단 그리드 + 컬럼 구분선 ─────── */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "4px 12px",
                marginBottom: hasAnyDashboard ? "0.5rem" : 0,
            }}>
                {members.map((m, idx) => {
                    const state = getMemberState(m);
                    const isHtml = m.template.plugin_type === "html";
                    const memberUrls = (m.overlayState.tags ?? []).map((t) => ({
                        tag: t,
                        url: `${window.location.origin}/render?sessionId=${m.overlayState.session_id}&tag=${t}`,
                    }));
                    // 홀수 인덱스 = 오른쪽 컬럼 → 왼쪽에 구분선
                    const isRightCol = idx % 2 === 1;
                    return (
                        <div
                            key={m.overlayState.id}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                border: `1px solid ${state === "program" ? "var(--accent-primary)" : state === "preview" ? "#22c55e" : "var(--border-primary)"}`,
                                backgroundColor: state === "program" ? "rgba(59,130,246,0.1)" : "var(--app-bg-alt)",
                                fontSize: "0.8125rem",
                                transition: "all 0.15s",
                                ...(isRightCol ? { borderLeft: "2px solid rgba(168, 85, 247, 0.25)" } : {}),
                            }}
                        >
                                {/* 상단: 이름 + 뱃지 + 해제 */}
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <span style={{ fontWeight: 600, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {m.template.name}
                                    </span>
                                    <span style={{
                                        fontSize: "0.625rem",
                                        padding: "0 4px",
                                        borderRadius: "3px",
                                        backgroundColor: "var(--app-bg-muted)",
                                        color: "var(--text-tertiary)",
                                        flexShrink: 0,
                                    }}>
                                        L{m.template.layer}
                                    </span>
                                    {isHtml && (
                                        <span style={{ fontSize: "0.625rem", fontFamily: "monospace", color: "#06b6d4", flexShrink: 0 }}>
                                            <Code2 size={8} />
                                        </span>
                                    )}
                                    {m.overlayState.tags?.map((t) => (
                                        <span key={t} style={{
                                            fontSize: "0.5625rem",
                                            padding: "0 3px",
                                            borderRadius: "2px",
                                            backgroundColor: "rgba(34,197,94,0.1)",
                                            color: "#22c55e",
                                            fontFamily: "monospace",
                                            flexShrink: 0,
                                        }}>
                                            {t}
                                        </span>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleUnlinkMember(m.overlayState.id, m.overlayState.tags ?? []);
                                        }}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            cursor: "pointer",
                                            padding: "0 2px",
                                            color: "var(--text-tertiary)",
                                            display: "flex",
                                            alignItems: "center",
                                            flexShrink: 0,
                                        }}
                                        title={`"${m.template.name}"을(를) 그룹에서 분리`}
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                                {/* PVW / PGM / OFF 3버튼 */}
                                <div style={{ display: "flex", gap: "3px" }}>
                                    {(["preview", "program", "off"] as OverlayPlayoutState[]).map((s) => {
                                        const label = s === "preview" ? "PVW" : s === "program" ? "PGM" : "OFF";
                                        const isActive = state === s;
                                        const btnColor = s === "program" ? "#ef4444" : s === "preview" ? "#22c55e" : "var(--text-tertiary)";
                                        return (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => onSetPlayoutState(m.overlayState, s)}
                                                style={{
                                                    flex: 1,
                                                    padding: "2px 0",
                                                    borderRadius: "3px",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    fontSize: "0.625rem",
                                                    fontWeight: 700,
                                                    backgroundColor: isActive ? btnColor : "var(--app-bg-muted)",
                                                    color: isActive ? (s === "off" ? "var(--text-primary)" : "white") : "var(--text-tertiary)",
                                                    transition: "all 0.15s",
                                                    opacity: isActive ? 1 : 0.7,
                                                }}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {/* 렌더러 URL (인라인) */}
                                {memberUrls.map((u) => (
                                    <button
                                        key={u.tag}
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(u.url);
                                            alert("클립보드에 복사되었습니다:\n" + u.url);
                                        }}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "3px",
                                            width: "100%",
                                            padding: "2px 6px",
                                            borderRadius: "3px",
                                            border: "1px dashed rgba(34,197,94,0.3)",
                                            backgroundColor: "rgba(34,197,94,0.04)",
                                            color: "#22c55e",
                                            fontSize: "0.6875rem",
                                            fontFamily: "monospace",
                                            cursor: "pointer",
                                            textAlign: "left" as const,
                                        }}
                                        title={`클릭하여 복사: ${u.url}`}
                                    >
                                        <Copy size={8} style={{ flexShrink: 0 }} />
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            &tag={u.tag}
                                        </span>
                                    </button>
                                ))}
                        </div>
                    );
                })}
            </div>

            {/* ─── 공유 대시보드 토글 ─────────────────────── */}
            {hasAnyDashboard && (
                <div style={{ marginBottom: showDashboard ? "0.5rem" : 0 }}>
                    <button
                        type="button"
                        onClick={() => setShowDashboard(!showDashboard)}
                        style={{
                            background: "none",
                            border: "1px solid var(--border-primary)",
                            cursor: "pointer",
                            color: showDashboard ? "#06b6d4" : "var(--text-tertiary)",
                            fontSize: "0.6875rem",
                            padding: "3px 10px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                            transition: "all 0.15s",
                        }}
                    >
                        {showDashboard ? <ChevronUp size={10} /> : <ChevronDownIcon size={10} />}
                        공유 대시보드
                    </button>
                </div>
            )}

            {/* ─── 공유 대시보드 (합집합 스키마) ────────── */}
            {showDashboard && (
                <div style={{
                    padding: "8px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(6, 182, 212, 0.05)",
                    border: "1px solid rgba(6, 182, 212, 0.15)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                }}>
                    <div style={{
                        fontSize: "0.625rem",
                        fontWeight: 700,
                        color: "#06b6d4",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.5px",
                    }}>
                        🔗 그룹 공유 대시보드
                    </div>

                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        maxHeight: "250px",
                        overflowY: "auto",
                        paddingRight: "4px",
                    }}>
                        {mergedFields.map((f) => (
                            <GroupDashboardField
                                key={f.key}
                                fieldKey={f.key}
                                prop={f.prop}
                                value={formValues[f.key]}
                                owners={f.owners}
                                onChange={handleFieldChange}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={handleSendGroupData}
                        style={{
                            padding: "5px 12px",
                            borderRadius: "5px",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            backgroundColor: "#a855f7",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            transition: "all 0.15s",
                            marginTop: "2px",
                        }}
                    >
                        <Send size={10} /> 그룹 데이터 전송
                    </button>
                </div>
            )}
        </div>
    );
});


// ─── GroupDashboardField — 합집합 스키마 필드 렌더러 ────────
// ■ 기존 DashboardField와 유사하지만 owners 라벨 추가
function GroupDashboardField({
    fieldKey,
    prop,
    value,
    owners,
    onChange,
}: {
    fieldKey: string;
    prop: DashboardSchemaProperty;
    value: unknown;
    owners: string[] | null;
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
        width: "160px",
        flexShrink: 0,
        padding: "4px 8px",
        borderRadius: "4px",
        border: "1px solid var(--border-primary)",
        backgroundColor: "var(--app-bg)",
        color: "var(--text-primary)",
        fontSize: "0.75rem",
        textAlign: "center",
        outline: "none",
        boxSizing: "border-box",
    };
    const stepperBtnStyle: React.CSSProperties = {
        width: "22px",
        height: "22px",
        borderRadius: "3px",
        border: "1px solid var(--border-primary)",
        backgroundColor: "var(--app-bg-muted)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        transition: "all 0.1s",
    };

    // 소속 라벨 (일부 멤버 전용 필드)
    const ownerLabel = owners ? (
        <span style={{
            fontSize: "0.5rem",
            color: "rgba(168,85,247,0.7)",
            fontStyle: "italic",
            whiteSpace: "nowrap",
        }}>
            ({owners.join(", ")} 전용)
        </span>
    ) : null;

    // enum → select
    if (prop.enum && prop.enum.length > 0) {
        return (
            <div style={fieldStyle}>
                <div style={{ ...labelStyle, display: "flex", flexDirection: "column", gap: "1px" }}>
                    <span>{prop.title}</span>
                    {ownerLabel}
                </div>
                <select
                    style={{ ...inputStyle, cursor: "pointer", textAlignLast: "center" }}
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

    // number → input + stepper
    if (prop.type === "number") {
        const numVal = Number(value) || 0;
        const min = prop.minimum ?? -Infinity;
        const max = prop.maximum ?? Infinity;
        return (
            <div style={fieldStyle}>
                <div style={{ ...labelStyle, display: "flex", flexDirection: "column", gap: "1px" }}>
                    <span>{prop.title}</span>
                    {ownerLabel}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "2px", width: "160px", flexShrink: 0 }}>
                    <input
                        type="number"
                        style={{ ...inputStyle, width: "auto", flex: 1, textAlign: "center" }}
                        value={numVal}
                        min={min}
                        max={max}
                        onChange={(e) => onChange(fieldKey, parseInt(e.target.value, 10) || 0)}
                    />
                    <button type="button" onClick={() => onChange(fieldKey, Math.min(numVal + 1, max))} style={stepperBtnStyle} title="증가">
                        <Plus size={10} />
                    </button>
                    <button type="button" onClick={() => onChange(fieldKey, Math.max(numVal - 1, min))} style={stepperBtnStyle} title="감소">
                        <Minus size={10} />
                    </button>
                </div>
            </div>
        );
    }

    // boolean → toggle
    if (prop.type === "boolean") {
        const boolVal = Boolean(value);
        return (
            <div style={fieldStyle}>
                <div style={{ ...labelStyle, display: "flex", flexDirection: "column", gap: "1px" }}>
                    <span>{prop.title}</span>
                    {ownerLabel}
                </div>
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

    // string → text input
    return (
        <div style={fieldStyle}>
            <div style={{ ...labelStyle, display: "flex", flexDirection: "column", gap: "1px" }}>
                <span>{prop.title}</span>
                {ownerLabel}
            </div>
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
