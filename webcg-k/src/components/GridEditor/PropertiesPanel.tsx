/**
 * Properties Panel
 * 선택된 영역의 프로퍼티 편집
 */

import { Zone } from "../../lib/gridTypes";

interface PropertiesPanelProps {
    zone: Zone | undefined;
    onUpdateZone: (updates: Partial<Zone>) => void;
}

export function PropertiesPanel({ zone, onUpdateZone }: PropertiesPanelProps) {
    if (!zone) {
        return (
            <div className="properties-panel">
                <div className="properties-panel-header">
                    <h3>Properties</h3>
                </div>
                <div className="properties-empty">
                    <p>영역을 선택하세요</p>
                </div>
            </div>
        );
    }

    return (
        <div className="properties-panel">
            <div className="properties-panel-header">
                <h3>Properties</h3>
            </div>

            <div className="properties-content">
                {/* 기본 정보 */}
                <div className="property-section">
                    <label className="property-label">이름</label>
                    <input
                        type="text"
                        className="property-input"
                        value={zone.name}
                        onChange={(e) => onUpdateZone({ name: e.target.value })}
                    />
                </div>

                <div className="property-section">
                    <label className="property-label">타입</label>
                    <select
                        className="property-input"
                        value={zone.type}
                        onChange={(e) => onUpdateZone({ type: e.target.value as Zone["type"] })}
                    >
                        <option value="background">배경</option>
                        <option value="logo">로고</option>
                        <option value="lowthird">Low Third</option>
                        <option value="video">비디오</option>
                        <option value="text">텍스트</option>
                        <option value="graphic">그래픽</option>
                    </select>
                </div>

                {/* 위치 */}
                <div className="property-section">
                    <h4 className="property-subtitle">위치</h4>
                    <div className="property-grid">
                        <div>
                            <label className="property-label-sm">X</label>
                            <input
                                type="number"
                                className="property-input-sm"
                                value={zone.bounds.x}
                                onChange={(e) =>
                                    onUpdateZone({
                                        bounds: { ...zone.bounds, x: Number(e.target.value) },
                                    })
                                }
                            />
                        </div>
                        <div>
                            <label className="property-label-sm">Y</label>
                            <input
                                type="number"
                                className="property-input-sm"
                                value={zone.bounds.y}
                                onChange={(e) =>
                                    onUpdateZone({
                                        bounds: { ...zone.bounds, y: Number(e.target.value) },
                                    })
                                }
                            />
                        </div>
                    </div>
                </div>

                {/* 크기 */}
                <div className="property-section">
                    <h4 className="property-subtitle">크기</h4>
                    <div className="property-grid">
                        <div>
                            <label className="property-label-sm">Width</label>
                            <input
                                type="number"
                                className="property-input-sm"
                                value={zone.bounds.width}
                                onChange={(e) =>
                                    onUpdateZone({
                                        bounds: { ...zone.bounds, width: Number(e.target.value) },
                                    })
                                }
                            />
                        </div>
                        <div>
                            <label className="property-label-sm">Height</label>
                            <input
                                type="number"
                                className="property-input-sm"
                                value={zone.bounds.height}
                                onChange={(e) =>
                                    onUpdateZone({
                                        bounds: { ...zone.bounds, height: Number(e.target.value) },
                                    })
                                }
                            />
                        </div>
                    </div>
                </div>

                {/* 스타일 */}
                <div className="property-section">
                    <h4 className="property-subtitle">스타일</h4>
                    <div>
                        <label className="property-label-sm">배경색</label>
                        <input
                            type="color"
                            className="property-input-color"
                            value={zone.style?.backgroundColor || "#000000"}
                            onChange={(e) =>
                                onUpdateZone({
                                    style: { ...zone.style, backgroundColor: e.target.value },
                                })
                            }
                        />
                    </div>
                </div>

                {/* Z-Index */}
                <div className="property-section">
                    <label className="property-label">레이어 순서</label>
                    <input
                        type="number"
                        className="property-input"
                        value={zone.zIndex}
                        onChange={(e) => onUpdateZone({ zIndex: Number(e.target.value) })}
                    />
                </div>
            </div>
        </div>
    );
}
