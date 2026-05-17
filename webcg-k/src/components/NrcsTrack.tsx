/**
 * NRCS 전용 트랙 컴포넌트
 * 송출 컨트롤러 타임라인에서 NRCS 기반 CG를 기사별로 그룹화하여 표시
 * Manual 트랙과 분리되어 디자인 격리, 동기화 격리, 권한 격리 달성
 */

import { useState } from "react";
import {
    ChevronDown,
    ChevronRight,
    FileText,
    Newspaper,
    Radio,
    RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CG_TYPE_LABELS, CG_TYPE_COLORS } from "@/lib/nrcsTypes";
import type { NrcsCuesheetItem } from "@/services/cuesheetService";

// ─── 타입 ──────────────────────────────────────────────────────

interface NrcsTrackProps {
    /** 큐시트 아이템 목록 (기사별) */
    items: NrcsCuesheetItem[];
    /** 현재 온에어 아이템 ID */
    activeItemId?: string | null;
    /** 아이템 클릭 핸들러 */
    onItemClick?: (item: NrcsCuesheetItem) => void;
    /** 동기화 콜백 */
    onSync?: () => void;
    /** 실시간 연결 상태 */
    isLive?: boolean;
}

// 매핑 상태 색상
const MAPPING_STATUS_COLORS: Record<string, string> = {
    pending: "#6b7280",
    mapped: "#10b981",
    approved: "#3b82f6",
    aired: "#8b5cf6",
};

const MAPPING_STATUS_LABELS: Record<string, string> = {
    pending: "대기",
    mapped: "매핑됨",
    approved: "승인됨",
    aired: "방송됨",
};

// ─── 메인 컴포넌트 ──────────────────────────────────────────────

export function NrcsTrack({
    items,
    activeItemId,
    onItemClick,
    onSync,
    isLive = false,
}: NrcsTrackProps) {
    return (
        <div style={{
            background: "var(--app-bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderRadius: 8,
            overflow: "hidden",
        }}>
            {/* 트랙 헤더 */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
                borderBottom: "1px solid var(--border-primary)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Newspaper size={14} style={{ color: "#60a5fa" }} />
                    <span style={{
                        fontSize: 12, fontWeight: 700, color: "#e2e8f0",
                        letterSpacing: "0.05em",
                    }}>
                        NRCS 트랙
                    </span>
                    {isLive && (
                        <span style={{
                            display: "flex", alignItems: "center", gap: 4,
                            fontSize: 10, color: "#ef4444", fontWeight: 700,
                        }}>
                            <Radio size={10} className="animate-pulse" /> LIVE
                        </span>
                    )}
                    <span style={{
                        fontSize: 10, color: "#94a3b8",
                        background: "#1e293b", padding: "1px 6px", borderRadius: 4,
                    }}>
                        {items.length}건
                    </span>
                </div>
                {onSync && (
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={onSync}
                        title="NRCS 동기화"
                        style={{ color: "#94a3b8" }}
                    >
                        <RefreshCw size={12} />
                    </Button>
                )}
            </div>

            {/* 아이템 목록 */}
            {items.length === 0 ? (
                <div style={{
                    padding: 24, textAlign: "center",
                    color: "var(--text-tertiary)", fontSize: 12,
                }}>
                    <FileText size={20} style={{ opacity: 0.3, margin: "0 auto 8px" }} />
                    연결된 NRCS 기사가 없습니다
                </div>
            ) : (
                <div>
                    {items.map((item) => (
                        <NrcsTrackItem
                            key={item.id}
                            item={item}
                            isActive={item.id === activeItemId}
                            onClick={() => onItemClick?.(item)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── 기사 아이템 컴포넌트 ────────────────────────────────────────

function NrcsTrackItem({
    item,
    isActive,
    onClick,
}: {
    item: NrcsCuesheetItem;
    isActive: boolean;
    onClick: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const statusColor = MAPPING_STATUS_COLORS[item.status] || "#6b7280";
    const statusLabel = MAPPING_STATUS_LABELS[item.status] || item.status;

    // CG 데이터에서 CG 타입 뱃지 추출
    const cgTypes = (item.cg_data || []).map((cg: any) => cg.type).filter(Boolean);
    const uniqueCgTypes = [...new Set(cgTypes)] as string[];

    return (
        <div
            style={{
                borderBottom: "1px solid var(--border-primary)",
                borderLeft: isActive ? "3px solid #ef4444" : "3px solid transparent",
                background: isActive ? "rgba(239, 68, 68, 0.05)" : "transparent",
                transition: "all 0.15s",
            }}
        >
            {/* 기사 행 */}
            <div
                style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", cursor: "pointer",
                }}
                onClick={onClick}
            >
                {/* 확장 토글 */}
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-tertiary)", padding: 0,
                    }}
                >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>

                {/* 순서 번호 */}
                <span style={{
                    fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)",
                    minWidth: 20, textAlign: "center",
                }}>
                    {item.item_order + 1}
                </span>

                {/* 기사 정보 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {item.title}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", display: "flex", gap: 6 }}>
                        {item.reporter && <span>📹 {item.reporter}</span>}
                        <span>{item.slug}</span>
                    </div>
                </div>

                {/* CG 타입 뱃지들 */}
                <div style={{ display: "flex", gap: 3 }}>
                    {uniqueCgTypes.slice(0, 3).map((t) => (
                        <span
                            key={t}
                            style={{
                                padding: "1px 5px", borderRadius: 3, fontSize: 9,
                                fontWeight: 700,
                                background: `${CG_TYPE_COLORS[t as keyof typeof CG_TYPE_COLORS] || "#888"}20`,
                                color: CG_TYPE_COLORS[t as keyof typeof CG_TYPE_COLORS] || "#888",
                            }}
                        >
                            {CG_TYPE_LABELS[t as keyof typeof CG_TYPE_LABELS] || t}
                        </span>
                    ))}
                    {uniqueCgTypes.length > 3 && (
                        <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                            +{uniqueCgTypes.length - 3}
                        </span>
                    )}
                </div>

                {/* 상태 */}
                <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: `${statusColor}20`, color: statusColor,
                }}>
                    {statusLabel}
                </span>
            </div>

            {/* 확장 영역: CG 상세 */}
            {expanded && (
                <div style={{
                    padding: "6px 10px 10px 40px",
                    background: "var(--app-bg-muted)",
                    fontSize: 11,
                }}>
                    {(item.cg_data || []).map((cg: any, i: number) => {
                        const typeColor = CG_TYPE_COLORS[cg.type as keyof typeof CG_TYPE_COLORS] || "#888";
                        return (
                            <div
                                key={`${cg.id || i}`}
                                style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "3px 0",
                                    borderBottom: "1px solid var(--border-primary)",
                                }}
                            >
                                <span style={{
                                    padding: "1px 6px", borderRadius: 3, fontSize: 9,
                                    fontWeight: 700, minWidth: 50, textAlign: "center",
                                    background: `${typeColor}15`, color: typeColor,
                                    border: `1px solid ${typeColor}30`,
                                }}>
                                    {CG_TYPE_LABELS[cg.type as keyof typeof CG_TYPE_LABELS] || cg.type}
                                </span>
                                <span style={{ flex: 1, color: "var(--text-secondary)" }}>
                                    {Object.values(cg.fields || {}).join(" / ")}
                                </span>
                            </div>
                        );
                    })}
                    {(!item.cg_data || item.cg_data.length === 0) && (
                        <span style={{ color: "var(--text-tertiary)" }}>CG 텍스트 없음</span>
                    )}
                </div>
            )}
        </div>
    );
}
