/**
 * GridSelector — Step 1: 그리드 템플릿 선택
 * DB에서 grid_templates를 로드하고 카드 형태로 표시
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { GridTemplateRow } from "../../lib/gridTypes";
import { Grid3x3 } from "lucide-react";

// 분할선으로부터 영역 계산 (GridSplitEditor의 로직 재사용)
interface SimpleZone {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface GridSelectorProps {
    selectedGridId: string | null;
    onSelect: (template: GridTemplateRow) => void;
}

export function GridSelector({ selectedGridId, onSelect }: GridSelectorProps) {
    // 그리드 템플릿 목록 조회
    const { data: templates = [], isLoading } = useQuery({
        queryKey: ["gridTemplates"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("grid_templates")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data as unknown as GridTemplateRow[];
        },
    });

    if (isLoading) {
        return (
            <div className="grid-selector-grid">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="grid-selector-card" style={{ opacity: 0.3, height: 200 }} />
                ))}
            </div>
        );
    }

    if (templates.length === 0) {
        return (
            <div className="wizard-empty">
                <div className="wizard-empty-icon"><Grid3x3 size={48} /></div>
                <div className="wizard-empty-text">
                    그리드 템플릿이 없습니다. 먼저 그리드 템플릿을 만들어주세요.
                </div>
            </div>
        );
    }

    return (
        <div className="grid-selector-grid">
            {templates.map((template) => {
                // splits에서 간단 zone 생성 (template_data.splits 활용)
                const zones = getZonesFromTemplate(template);

                return (
                    <div
                        key={template.id}
                        className={`grid-selector-card ${selectedGridId === template.id ? "selected" : ""}`}
                        onClick={() => onSelect(template)}
                    >
                        {/* 16:9 미니 프리뷰 */}
                        <div className="grid-selector-preview">
                            {zones.map((z, idx) => (
                                <div
                                    key={z.id}
                                    className="grid-selector-zone"
                                    style={{
                                        left: `${z.x}%`,
                                        top: `${z.y}%`,
                                        width: `${z.width}%`,
                                        height: `${z.height}%`,
                                    }}
                                >
                                    {idx + 1}
                                </div>
                            ))}
                        </div>

                        {/* 카드 정보 */}
                        <div className="grid-selector-name">{template.name}</div>
                        <div className="grid-selector-meta">
                            {zones.length}개 영역
                            {template.description && ` · ${template.description}`}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * 템플릿에서 Zone 목록을 추출하는 헬퍼
 * template_data.zones가 있으면 사용, 없으면 splits에서 계산
 */
function getZonesFromTemplate(template: GridTemplateRow): SimpleZone[] {
    const td = template.template_data;

    // zones 데이터가 이미 있는 경우 (bounds가 없는 항목은 건너뜀)
    if (td.zones && td.zones.length > 0) {
        const validZones = td.zones
            .map((z: any) => {
                if (z.bounds && typeof z.bounds.x === "number") {
                    return {
                        id: z.id,
                        x: (z.bounds.x / (td.canvas?.width || 1920)) * 100,
                        y: (z.bounds.y / (td.canvas?.height || 1080)) * 100,
                        width: (z.bounds.width / (td.canvas?.width || 1920)) * 100,
                        height: (z.bounds.height / (td.canvas?.height || 1080)) * 100,
                    };
                }
                if (typeof z.x === "number" && typeof z.width === "number") {
                    return {
                        id: z.id,
                        x: z.x,
                        y: z.y,
                        width: z.width,
                        height: z.height,
                    };
                }
                return null;
            })
            .filter(Boolean);
        // bounds가 유효한 zone이 있으면 반환, 없으면 splits fallback
        if (validZones.length > 0) return validZones as SimpleZone[];
    }

    // splits가 있으면 간단 BSP 계산
    if (td.splits && td.splits.length > 0) {
        return calculateSimpleZones(td.splits);
    }

    // 기본: 전체 1개 Zone
    return [{ id: "zone-full", x: 0, y: 0, width: 100, height: 100 }];
}

/**
 * 분할선 기반 간단 Zone 계산 (BSP 간소화 버전)
 */
function calculateSimpleZones(splits: Array<{
    id: string;
    orientation: string;
    position: number;
    start: number;
    end: number;
}>): SimpleZone[] {
    type BspZone = { x: number; y: number; w: number; h: number };
    let zones: BspZone[] = [{ x: 0, y: 0, w: 100, h: 100 }];

    // 각 분할선으로 Zone을 순차 분할
    for (const split of splits) {
        const newZones: BspZone[] = [];
        for (const zone of zones) {
            if (split.orientation === "vertical") {
                // 수직선이 이 Zone 범위 내에 있으면 분할
                if (split.position > zone.x && split.position < zone.x + zone.w) {
                    const leftW = split.position - zone.x;
                    const rightW = zone.w - leftW;
                    newZones.push({ x: zone.x, y: zone.y, w: leftW, h: zone.h });
                    newZones.push({ x: split.position, y: zone.y, w: rightW, h: zone.h });
                } else {
                    newZones.push(zone);
                }
            } else {
                // 수평선
                if (split.position > zone.y && split.position < zone.y + zone.h) {
                    const topH = split.position - zone.y;
                    const bottomH = zone.h - topH;
                    newZones.push({ x: zone.x, y: zone.y, w: zone.w, h: topH });
                    newZones.push({ x: zone.x, y: split.position, w: zone.w, h: bottomH });
                } else {
                    newZones.push(zone);
                }
            }
        }
        zones = newZones;
    }

    return zones.map((z, i) => ({
        id: `zone-${i}`,
        x: z.x,
        y: z.y,
        width: z.w,
        height: z.h,
    }));
}
