/**
 * ZoneSelector — Step 2: Zone 다중 선택
 * 선택된 그리드의 Zone을 16:9 캔버스에 렌더링하고 클릭으로 다중 선택
 */

import { useMemo } from "react";
import { Check } from "lucide-react";
import type { GridTemplateRow } from "../../lib/gridTypes";
import type { ZoneBounds } from "../../lib/overlayTypes";

interface SimpleZone {
    id: string;
    x: number;       // % 기반
    y: number;
    width: number;
    height: number;
}

interface ZoneSelectorProps {
    template: GridTemplateRow;
    selectedZoneIds: Set<string>;
    onToggleZone: (zoneId: string) => void;
}

export function ZoneSelector({ template, selectedZoneIds, onToggleZone }: ZoneSelectorProps) {
    // 템플릿에서 Zone 목록 계산
    const zones = useMemo(() => getZonesFromTemplate(template), [template]);
    const canvasW = template.template_data.canvas?.width || 1920;
    const canvasH = template.template_data.canvas?.height || 1080;

    // 선택된 Zone의 결합 Bounds 계산
    const combinedBounds = useMemo<ZoneBounds | null>(() => {
        if (selectedZoneIds.size === 0) return null;

        const selected = zones.filter((z) => selectedZoneIds.has(z.id));
        if (selected.length === 0) return null;

        // % → 픽셀 변환 후 결합
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const z of selected) {
            const px = (z.x / 100) * canvasW;
            const py = (z.y / 100) * canvasH;
            const pw = (z.width / 100) * canvasW;
            const ph = (z.height / 100) * canvasH;
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px + pw);
            maxY = Math.max(maxY, py + ph);
        }

        return {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY),
        };
    }, [zones, selectedZoneIds, canvasW, canvasH]);

    return (
        <div className="zone-selector-layout">
            {/* 캔버스 */}
            <div className="zone-selector-canvas-wrapper">
                <div className="zone-selector-canvas">
                    {zones.map((zone, idx) => {
                        const isSelected = selectedZoneIds.has(zone.id);
                        return (
                            <div
                                key={zone.id}
                                className={`zone-selector-zone ${isSelected ? "selected" : ""}`}
                                style={{
                                    left: `${zone.x}%`,
                                    top: `${zone.y}%`,
                                    width: `${zone.width}%`,
                                    height: `${zone.height}%`,
                                }}
                                onClick={() => onToggleZone(zone.id)}
                            >
                                {isSelected && (
                                    <div className="zone-selector-zone-check">
                                        <Check size={12} />
                                    </div>
                                )}
                                <span className="zone-selector-zone-label">
                                    영역 {idx + 1}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 선택 정보 */}
            <div className="zone-selector-info">
                {selectedZoneIds.size === 0 ? (
                    <>클릭하여 CG를 배치할 영역을 선택하세요 (다중 선택 가능)</>
                ) : (
                    <>
                        <strong>{selectedZoneIds.size}개 영역</strong> 선택됨
                        {combinedBounds && (
                            <> · 결합 크기: <strong>{combinedBounds.width} × {combinedBounds.height}px</strong></>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * 선택된 Zone들의 결합 Bounds를 계산하는 유틸리티 (외부 사용)
 */
export function calculateCombinedBounds(
    template: GridTemplateRow,
    selectedZoneIds: Set<string>,
): ZoneBounds | null {
    if (selectedZoneIds.size === 0) return null;

    const zones = getZonesFromTemplate(template);
    const selected = zones.filter((z) => selectedZoneIds.has(z.id));
    if (selected.length === 0) return null;

    const canvasW = template.template_data.canvas?.width || 1920;
    const canvasH = template.template_data.canvas?.height || 1080;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const z of selected) {
        const px = (z.x / 100) * canvasW;
        const py = (z.y / 100) * canvasH;
        const pw = (z.width / 100) * canvasW;
        const ph = (z.height / 100) * canvasH;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px + pw);
        maxY = Math.max(maxY, py + ph);
    }

    return {
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.round(maxX - minX),
        height: Math.round(maxY - minY),
    };
}

// ─── Zone 계산 헬퍼 (GridSelector와 동일 로직) ─────────────────

function getZonesFromTemplate(template: GridTemplateRow): SimpleZone[] {
    const td = template.template_data;

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

    if (td.splits && td.splits.length > 0) {
        return calculateSimpleZones(td.splits);
    }

    return [{ id: "zone-full", x: 0, y: 0, width: 100, height: 100 }];
}

function calculateSimpleZones(splits: Array<{
    id: string;
    orientation: string;
    position: number;
    start: number;
    end: number;
}>): SimpleZone[] {
    type BspZone = { x: number; y: number; w: number; h: number };
    let zones: BspZone[] = [{ x: 0, y: 0, w: 100, h: 100 }];

    for (const split of splits) {
        const newZones: BspZone[] = [];
        for (const zone of zones) {
            if (split.orientation === "vertical") {
                if (split.position > zone.x && split.position < zone.x + zone.w) {
                    const leftW = split.position - zone.x;
                    const rightW = zone.w - leftW;
                    newZones.push({ x: zone.x, y: zone.y, w: leftW, h: zone.h });
                    newZones.push({ x: split.position, y: zone.y, w: rightW, h: zone.h });
                } else {
                    newZones.push(zone);
                }
            } else {
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
