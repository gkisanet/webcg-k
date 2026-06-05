/**
 * Grid Editor Component
 * 3-Pane 그리드 에디터 (Zones | Canvas | Properties)
 */

import { Zone, ZoneType, createZone } from "../../lib/gridTypes";
import { GridCanvas } from "./GridCanvas";
import { ZonesPanel } from "./ZonesPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import "./GridEditor.css";

interface GridEditorProps {
    zones: Zone[];
    onZonesChange: (zones: Zone[]) => void;
    selectedZoneId: string | null;
    onSelectZone: (zoneId: string | null) => void;
    canvasWidth: number;
    canvasHeight: number;
}

export function GridEditor({
    zones,
    onZonesChange,
    selectedZoneId,
    onSelectZone,
    canvasWidth,
    canvasHeight,
}: GridEditorProps) {
    const selectedZone = zones.find((z) => z.id === selectedZoneId);

    // 영역 추가
    const handleAddZone = (type: ZoneType) => {
        const newZone = createZone(
            type,
            {
                x: 100,
                y: 100,
                width: 400,
                height: 300,
            },
        );
        newZone.zIndex = zones.length;
        onZonesChange([...zones, newZone]);
        onSelectZone(newZone.id);
    };

    // 영역 삭제
    const handleDeleteZone = (zoneId: string) => {
        onZonesChange(zones.filter((z) => z.id !== zoneId));
        if (selectedZoneId === zoneId) {
            onSelectZone(null);
        }
    };

    // 영역 업데이트
    const handleUpdateZone = (zoneId: string, updates: Partial<Zone>) => {
        onZonesChange(
            zones.map((z) => (z.id === zoneId ? { ...z, ...updates } : z)),
        );
    };

    // 영역 순서 변경 (z-index)
    const handleReorderZones = (newZones: Zone[]) => {
        onZonesChange(newZones);
    };

    return (
        <div className="grid-editor">
            {/* 좌측: Zones 패널 */}
            <ZonesPanel
                zones={zones}
                selectedZoneId={selectedZoneId}
                onSelectZone={onSelectZone}
                onAddZone={handleAddZone}
                onDeleteZone={handleDeleteZone}
                onReorderZones={handleReorderZones}
                onUpdateZone={handleUpdateZone}
            />

            {/* 중앙: Canvas */}
            <GridCanvas
                zones={zones}
                selectedZoneId={selectedZoneId}
                onSelectZone={onSelectZone}
                onUpdateZone={handleUpdateZone}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
            />

            {/* 우측: Properties 패널 */}
            <PropertiesPanel
                zone={selectedZone}
                onUpdateZone={(updates) => {
                    if (selectedZone) {
                        handleUpdateZone(selectedZone.id, updates);
                    }
                }}
            />
        </div>
    );
}
