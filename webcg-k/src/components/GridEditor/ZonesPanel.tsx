/**
 * Zones Panel
 * 영역 목록 및 관리
 */

import { Zone, ZoneType } from "../../lib/gridTypes";
import {
    Plus,
    Eye,
    EyeOff,
    Lock,
    Unlock,
    Trash2,
    GripVertical,
} from "lucide-react";
import { useState } from "react";

interface ZonesPanelProps {
    zones: Zone[];
    selectedZoneId: string | null;
    onSelectZone: (zoneId: string | null) => void;
    onAddZone: (type: ZoneType) => void;
    onDeleteZone: (zoneId: string) => void;
    onReorderZones: (zones: Zone[]) => void;
    onUpdateZone: (zoneId: string, updates: Partial<Zone>) => void;
}

const ZONE_TYPES: { value: ZoneType; label: string }[] = [
    { value: "background", label: "배경" },
    { value: "logo", label: "로고" },
    { value: "lowthird", label: "Low Third" },
    { value: "video", label: "비디오" },
    { value: "text", label: "텍스트" },
    { value: "graphic", label: "그래픽" },
];

export function ZonesPanel({
    zones,
    selectedZoneId,
    onSelectZone,
    onAddZone,
    onDeleteZone,
    onUpdateZone,
}: ZonesPanelProps) {
    const [showAddMenu, setShowAddMenu] = useState(false);

    // z-index 기준 정렬 (낮은 것부터)
    const sortedZones = [...zones].sort((a, b) => a.zIndex - b.zIndex);

    return (
        <div className="zones-panel">
            <div className="zones-panel-header">
                <h3>영역 (Zones)</h3>
                <div className="zones-add-wrapper">
                    <button
                        type="button"
                        className="btn-icon"
                        onClick={() => setShowAddMenu(!showAddMenu)}
                    >
                        <Plus size={18} />
                    </button>
                    {showAddMenu && (
                        <div className="zones-add-menu">
                            {ZONE_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    className="zones-add-menu-item"
                                    onClick={() => {
                                        onAddZone(type.value);
                                        setShowAddMenu(false);
                                    }}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="zones-list">
                {sortedZones.length === 0 && (
                    <div className="zones-empty">
                        <p>영역이 없습니다</p>
                        <p>+ 버튼을 눌러 추가하세요</p>
                    </div>
                )}

                {sortedZones.map((zone) => (
                    <div
                        key={zone.id}
                        className={`zone-item ${selectedZoneId === zone.id ? "selected" : ""}`}
                        onClick={() => onSelectZone(zone.id)}
                    >
                        <GripVertical size={16} className="zone-grip" />
                        <div className="zone-info">
                            <div className="zone-name">{zone.name}</div>
                            <div className="zone-type">{zone.type}</div>
                        </div>
                        <div className="zone-actions">
                            <button
                                type="button"
                                className="btn-icon-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateZone(zone.id, { visible: !zone.visible });
                                }}
                            >
                                {zone.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <button
                                type="button"
                                className="btn-icon-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateZone(zone.id, { locked: !zone.locked });
                                }}
                            >
                                {zone.locked ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                            <button
                                type="button"
                                className="btn-icon-sm danger"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`"${zone.name}" 영역을 삭제하시겠습니까?`)) {
                                        onDeleteZone(zone.id);
                                    }
                                }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
