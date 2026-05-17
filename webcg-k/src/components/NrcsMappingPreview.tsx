/**
 * NRCS 매핑 미리보기 컴포넌트
 * 뉴스 기사의 CG 텍스트가 번들 슬롯에 어떻게 매핑되는지 시각화
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    AlertCircle,
    CheckCircle2,
    Link2,
    Loader2,
    Package,
    Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CG_TYPE_LABELS, CG_TYPE_COLORS } from "@/lib/nrcsTypes";
import type { NrcsNewsItem } from "@/lib/nrcsTypes";
import { fetchBundles } from "@/services/bundleService";
import type { TemplateBundle } from "@/services/bundleService";
import { mapArticleToCg } from "@/services/nrcsMappingService";
import type { ArticleMappingResult, MappedCgResult } from "@/services/nrcsMappingService";

interface Props {
    newsItem: NrcsNewsItem;
    programName?: string;
}

/** 매핑 상태별 색상 */
const STATUS_COLORS = {
    full: "#10b981",
    partial: "#f59e0b",
    no_slot: "#ef4444",
    no_graphic: "#6b7280",
} as const;

const STATUS_LABELS = {
    full: "완전 매핑",
    partial: "부분 매핑",
    no_slot: "슬롯 없음",
    no_graphic: "그래픽 미연결",
} as const;

export function NrcsMappingPreview({ newsItem, programName: _programName }: Props) {
    const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
    const [mappingResult, setMappingResult] = useState<ArticleMappingResult | null>(null);
    const [isMapping, setIsMapping] = useState(false);

    // 번들 목록 조회
    const { data: bundles = [] } = useQuery({
        queryKey: ["bundles"],
        queryFn: fetchBundles,
    });

    // 매핑 실행
    const runMapping = async (bundleId: string) => {
        setIsMapping(true);
        try {
            const result = await mapArticleToCg(newsItem, bundleId);
            setMappingResult(result);
        } catch (err) {
            console.error("매핑 실패:", err);
        }
        setIsMapping(false);
    };

    // CG 텍스트가 없으면 표시 안 함
    if (!newsItem.cgTexts || newsItem.cgTexts.length === 0) {
        return (
            <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>
                이 기사에는 CG 텍스트가 없습니다.
            </div>
        );
    }

    return (
        <div style={{ borderTop: "1px solid var(--border-primary)", marginTop: 12, paddingTop: 12 }}>
            {/* 번들 선택 + 매핑 실행 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Package size={14} style={{ color: "var(--accent-primary)" }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>매핑 번들:</span>
                <select
                    value={selectedBundleId || ""}
                    onChange={(e) => setSelectedBundleId(e.target.value || null)}
                    style={{
                        flex: 1,
                        background: "var(--app-bg-muted)",
                        border: "1px solid var(--border-primary)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 12,
                    }}
                >
                    <option value="">번들 선택...</option>
                    {bundles.map((b: TemplateBundle) => (
                        <option key={b.id} value={b.id}>
                            {b.name}{b.program_name ? ` (${b.program_name})` : ""}
                        </option>
                    ))}
                </select>
                <Button
                    size="sm"
                    onClick={() => selectedBundleId && runMapping(selectedBundleId)}
                    disabled={!selectedBundleId || isMapping}
                >
                    {isMapping ? <Loader2 size={12} className="animate-spin" /> : "매핑 실행"}
                </Button>
            </div>

            {/* 매핑 결과 */}
            {mappingResult && (
                <div>
                    {/* 요약 */}
                    <div style={{
                        display: "flex", gap: 12, marginBottom: 12, padding: "8px 12px",
                        background: "var(--app-bg-muted)", borderRadius: 6, fontSize: 11,
                    }}>
                        <span>전체: <strong>{mappingResult.summary.total}</strong></span>
                        <span style={{ color: STATUS_COLORS.full }}>
                            ✅ {mappingResult.summary.fully_mapped}
                        </span>
                        <span style={{ color: STATUS_COLORS.partial }}>
                            ⚠ {mappingResult.summary.partially_mapped}
                        </span>
                        <span style={{ color: STATUS_COLORS.no_slot }}>
                            ❌ {mappingResult.summary.no_slot}
                        </span>
                        <span style={{ color: STATUS_COLORS.no_graphic }}>
                            ⬜ {mappingResult.summary.no_graphic}
                        </span>
                    </div>

                    {/* 개별 CG 매핑 결과 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {mappingResult.results.map((r, i) => (
                            <MappedCgRow key={`${r.cg_item.id}-${i}`} result={r} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── 개별 CG 매핑 결과 행 ─────────────────────────────────────

function MappedCgRow({ result }: { result: MappedCgResult }) {
    const [expanded, setExpanded] = useState(false);
    const color = CG_TYPE_COLORS[result.cg_item.type] || "#888";
    const label = CG_TYPE_LABELS[result.cg_item.type] || result.cg_item.type;
    const statusColor = STATUS_COLORS[result.status];
    const statusLabel = STATUS_LABELS[result.status];

    return (
        <div style={{
            border: "1px solid var(--border-primary)",
            borderRadius: 6,
            overflow: "hidden",
        }}>
            {/* 헤더 행 */}
            <div
                style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", cursor: "pointer",
                    background: "var(--app-bg-secondary)",
                }}
                onClick={() => setExpanded(!expanded)}
            >
                {/* CG 타입 배지 */}
                <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: `${color}15`, color: color, border: `1px solid ${color}30`,
                }}>
                    {label}
                </span>

                {/* 그래픽 이름 */}
                <span style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)" }}>
                    {result.graphic_name || (result.slot ? "그래픽 미연결" : "슬롯 없음")}
                </span>

                {/* 상태 아이콘 */}
                <span style={{ fontSize: 10, color: statusColor, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                    {result.status === "full" && <CheckCircle2 size={11} />}
                    {result.status === "partial" && <AlertCircle size={11} />}
                    {result.status === "no_slot" && <Unlink size={11} />}
                    {result.status === "no_graphic" && <Link2 size={11} />}
                    {statusLabel}
                </span>
            </div>

            {/* 확장 상세 */}
            {expanded && (
                <div style={{ padding: "8px 10px", background: "var(--app-bg-muted)", fontSize: 11 }}>
                    {result.mapped_fields.map((f) => (
                        <div
                            key={f.cg_field_key}
                            style={{
                                display: "flex", gap: 8, padding: "3px 0",
                                borderBottom: "1px solid var(--border-primary)",
                            }}
                        >
                            <span style={{ fontWeight: 600, minWidth: 60 }}>{f.cg_field_key}</span>
                            <span style={{ flex: 1, color: "var(--text-secondary)" }}>{f.cg_field_value}</span>
                            <span style={{
                                color: f.status === "mapped" ? "#10b981" : "#ef4444",
                                fontSize: 10,
                            }}>
                                {f.status === "mapped"
                                    ? `→ ${f.target_element_id.substring(0, 8)}…`
                                    : "미매핑"
                                }
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
