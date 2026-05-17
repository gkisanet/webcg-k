/**
 * ActionLogPanel — 멀티유저 액션 히스토리 로그 패널
 * 헤더 버튼 클릭 시 드롭다운 형태로 최근 액션을 시간순으로 표시
 * 멀티 필터: AND 조건 (송출+PGM = 송출 중 PGM 이벤트만 표시)
 */

import { useStore } from "@tanstack/react-store";
import { Clock, Filter, RotateCcw, ScrollText, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
    ACTION_LABELS,
    type ActionLogEntry,
    type ActionType,
    actionLogStore,
    clearActionLog,
} from "../../stores/actionLogStore";

// 필터 그룹 정의 — labelKey는 i18n 키
const FILTER_GROUPS: { labelKey: string; key: string; types: ActionType[] }[] = [
    { labelKey: "actionLog.broadcastStart", key: "broadcast", types: ["broadcast_start", "broadcast_stop"] },
    { labelKey: "actionLog.pgmOn", key: "pgm", types: ["pgm_on", "pgm_off"] },
    { labelKey: "actionLog.overlayOn", key: "overlay", types: ["overlay_on", "overlay_off", "overlay_update"] },
];

/** 송출 관련 타입인지 판별 */
const BROADCAST_TYPES: Set<ActionType> = new Set(["broadcast_start", "broadcast_stop"]);

/**
 * AND 필터 로직:
 * - 그룹 1개만 선택: 해당 그룹 항목만 표시
 * - 송출 + 다른 그룹 선택: 다른 그룹 항목 중 송출 중에 발생한 것만 표시
 *   (broadcast_start~broadcast_stop 구간 내의 이벤트만)
 * - 비송출 그룹 2개 선택: 양쪽 모두의 타입을 표시 (union)
 */
function applyAndFilter(
    entries: ActionLogEntry[],
    activeGroups: Set<string>,
): ActionLogEntry[] {
    if (activeGroups.size === 0) return entries;

    const hasBroadcast = activeGroups.has("broadcast");
    const otherGroupTypes = new Set<ActionType>();

    for (const group of FILTER_GROUPS) {
        if (group.key === "broadcast") continue;
        if (activeGroups.has(group.key)) {
            for (const t of group.types) otherGroupTypes.add(t);
        }
    }

    // 송출만 선택된 경우: 송출 이벤트만
    if (hasBroadcast && otherGroupTypes.size === 0) {
        return entries.filter((e) => BROADCAST_TYPES.has(e.type));
    }

    // 송출 + 다른 그룹(AND): 송출 구간 내의 다른 그룹 이벤트만 표시
    // + 송출 시작/중단 이벤트도 함께 표시
    if (hasBroadcast && otherGroupTypes.size > 0) {
        // 1. 송출 구간 계산 (broadcast_start ~ broadcast_stop)
        // entries는 시간순 역순(최신 먼저) → 정순으로 정렬 후 구간 추출
        const sorted = [...entries].sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );

        // 송출 구간 배열: { start, end }
        const broadcastWindows: { start: number; end: number }[] = [];
        let windowStart: number | null = null;

        for (const e of sorted) {
            if (e.type === "broadcast_start") {
                windowStart = e.timestamp.getTime();
            } else if (e.type === "broadcast_stop" && windowStart !== null) {
                broadcastWindows.push({ start: windowStart, end: e.timestamp.getTime() });
                windowStart = null;
            }
        }
        // 현재 송출 중(stop 없이 열린 상태)이면 현재 시각까지
        if (windowStart !== null) {
            broadcastWindows.push({ start: windowStart, end: Date.now() });
        }

        // 2. 필터 적용
        return entries.filter((e) => {
            // 송출 시작/중단 이벤트는 항상 표시
            if (BROADCAST_TYPES.has(e.type)) return true;

            // 다른 그룹 타입이면서 송출 구간 내에 있는지 확인
            if (otherGroupTypes.has(e.type)) {
                const ts = e.timestamp.getTime();
                return broadcastWindows.some((w) => ts >= w.start && ts <= w.end);
            }
            return false;
        });
    }

    // 비송출 그룹만 선택: union (OR)
    return entries.filter((e) => otherGroupTypes.has(e.type));
}

export function ActionLogPanel() {
    const { t } = useTranslation("common");
    const [isOpen, setIsOpen] = useState(false);
    // 활성 필터 그룹 (key 기반)
    const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());
    const entries = useStore(actionLogStore, (state) => state.entries);

    // AND 필터 적용
    const filteredEntries = useMemo(
        () => applyAndFilter(entries, activeGroups),
        [entries, activeGroups],
    );

    // 그룹 토글
    const toggleGroup = (key: string) => {
        setActiveGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // 시간 포맷
    const formatTime = (date: Date) => {
        const h = date.getHours().toString().padStart(2, "0");
        const m = date.getMinutes().toString().padStart(2, "0");
        const s = date.getSeconds().toString().padStart(2, "0");
        return `${h}:${m}:${s}`;
    };

    // 활성 필터 설명 텍스트
    const filterDesc = useMemo(() => {
        if (activeGroups.size === 0) return null;
        const labels = FILTER_GROUPS.filter((g) => activeGroups.has(g.key)).map((g) => t(g.labelKey));
        return labels.join(" + ");
    }, [activeGroups, t]);

    return (
        <div style={{ position: "relative" }}>
            {/* 토글 버튼 — 항상 로그 수 표시 */}
            <Button
                variant="secondary"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: "0.25rem 0.5rem", position: "relative",
                    display: "flex", alignItems: "center", gap: "4px",
                    fontSize: "0.6875rem", fontWeight: 500,
                }}
                title={t("actionLog.title")}
            >
                <ScrollText className="w-4 h-4" />
                <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: "18px", height: "16px", borderRadius: "8px",
                    fontSize: "0.625rem", fontWeight: 700, lineHeight: 1,
                    background: entries.length > 0 ? "var(--accent-primary)" : "transparent",
                    color: entries.length > 0 ? "white" : "var(--text-secondary)",
                    border: entries.length > 0 ? "none" : "1px solid var(--border-default)",
                    padding: "0 4px",
                }}>
                    {entries.length}
                </span>
            </Button>

            {/* 드롭다운 패널 */}
            {isOpen && (
                <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    width: "380px", maxHeight: "480px",
                    background: "var(--app-bg-alt)", border: "1px solid var(--border-default)",
                    borderRadius: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    zIndex: 100, display: "flex", flexDirection: "column", overflow: "hidden",
                }}>
                    {/* 패널 헤더 */}
                    <div style={{
                        padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <ScrollText size={14} />
                            {t("actionLog.title")}
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", fontWeight: 400 }}>
                                ({filteredEntries.length})
                            </span>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            {/* 초기화 버튼 — 항상 표시 */}
                            <button
                                type="button"
                                onClick={() => { if (entries.length > 0) clearActionLog(); }}
                                style={{
                                    display: "flex", alignItems: "center", gap: "3px",
                                    background: entries.length > 0 ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
                                    border: "1px solid",
                                    borderColor: entries.length > 0 ? "rgba(239,68,68,0.3)" : "var(--border-default)",
                                    cursor: entries.length > 0 ? "pointer" : "default",
                                    padding: "2px 8px", borderRadius: "4px",
                                    color: entries.length > 0 ? "var(--accent-danger, #ef4444)" : "var(--text-secondary)",
                                    fontSize: "0.625rem", fontWeight: 500,
                                    transition: "all 0.15s",
                                }}
                                title={t("actions.delete")}
                            >
                                <RotateCcw size={10} />
                                Reset {entries.length}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--text-tertiary)" }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* 필터 바 */}
                    <div style={{
                        padding: "6px 12px", borderBottom: "1px solid var(--border-subtle)",
                        display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap",
                    }}>
                        <Filter size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                        {FILTER_GROUPS.map((group) => {
                            const isActive = activeGroups.has(group.key);
                            return (
                                <button
                                    key={group.key}
                                    type="button"
                                    onClick={() => toggleGroup(group.key)}
                                    style={{
                                        padding: "2px 8px", fontSize: "0.625rem", fontWeight: 500,
                                        border: "none", borderRadius: "3px", cursor: "pointer",
                                        background: isActive ? "var(--accent-primary)" : "var(--app-bg-muted)",
                                        color: isActive ? "white" : "var(--text-secondary)",
                                        transition: "all 0.15s",
                                    }}
                                >
                                    {t(group.labelKey)}
                                </button>
                            );
                        })}
                        {/* 전체 리셋 */}
                        <button
                            type="button"
                            onClick={() => setActiveGroups(new Set())}
                            style={{
                                padding: "2px 6px", fontSize: "0.625rem",
                                border: "none", borderRadius: "3px", cursor: "pointer",
                                background: activeGroups.size === 0 ? "var(--accent-primary)" : "transparent",
                                color: activeGroups.size === 0 ? "white" : "var(--text-tertiary)",
                            }}
                        >
                            All
                        </button>
                        {/* AND 필터 설명 */}
                        {filterDesc && (
                            <span style={{
                                marginLeft: "auto", fontSize: "0.5625rem",
                                color: "var(--accent-primary)", fontWeight: 500,
                            }}>
                                {filterDesc}
                            </span>
                        )}
                    </div>

                    {/* 로그 목록 */}
                    <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
                        {filteredEntries.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-tertiary)", fontSize: "0.75rem" }}>
                                <Clock size={24} style={{ marginBottom: "8px", opacity: 0.5 }} />
                                <div>{t("actionLog.noLogs")}</div>
                            </div>
                        ) : (
                            filteredEntries.map((entry) => (
                                <LogEntry key={entry.id} entry={entry} formatTime={formatTime} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/** 개별 로그 엔트리 */
function LogEntry({ entry, formatTime }: { entry: ActionLogEntry; formatTime: (d: Date) => string }) {
    const { t } = useTranslation("common");
    const actionInfo = ACTION_LABELS[entry.type];

    return (
        <div
            style={{
                display: "flex", alignItems: "flex-start", gap: "8px",
                padding: "6px 12px", fontSize: "0.6875rem",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--app-bg-muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
            {/* 타임스탬프 */}
            <span style={{
                color: "var(--text-tertiary)", fontFamily: "monospace",
                fontSize: "0.625rem", flexShrink: 0, marginTop: "1px",
            }}>
                {formatTime(entry.timestamp)}
            </span>

            {/* 아이콘 */}
            <span style={{ flexShrink: 0 }}>{actionInfo.icon}</span>

            {/* 내용 */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: actionInfo.color }}>{t(actionInfo.label)}</span>
                    {entry.targetName && (
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{entry.targetName}</span>
                    )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>by {entry.userName}</span>
                    {entry.detail && (
                        <span style={{ color: "var(--text-tertiary)" }}>· {entry.detail}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
