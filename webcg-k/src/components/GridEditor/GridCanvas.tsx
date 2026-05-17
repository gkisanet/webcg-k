/**
 * Grid Canvas
 * SVG 기반 캔버스 - 영역 시각화 및 인터랙션
 * 8방향 리사이즈 핸들 지원
 */

import { Zone } from "../../lib/gridTypes";
import { useState, useRef, MouseEvent } from "react";

interface GridCanvasProps {
    zones: Zone[];
    selectedZoneId: string | null;
    onSelectZone: (zoneId: string | null) => void;
    onUpdateZone: (zoneId: string, updates: Partial<Zone>) => void;
    canvasWidth: number;
    canvasHeight: number;
}

// 리사이즈 핸들 타입 (8방향)
type ResizeHandle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

// 핸들 위치 계산
const getHandlePosition = (
    handle: ResizeHandle,
    bounds: Zone["bounds"],
): { x: number; y: number } => {
    const { x, y, width, height } = bounds;
    const positions: Record<ResizeHandle, { x: number; y: number }> = {
        nw: { x, y },
        n: { x: x + width / 2, y },
        ne: { x: x + width, y },
        w: { x, y: y + height / 2 },
        e: { x: x + width, y: y + height / 2 },
        sw: { x, y: y + height },
        s: { x: x + width / 2, y: y + height },
        se: { x: x + width, y: y + height },
    };
    return positions[handle];
};

// 핸들 커서 스타일
const handleCursors: Record<ResizeHandle, string> = {
    nw: "nwse-resize",
    n: "ns-resize",
    ne: "nesw-resize",
    w: "ew-resize",
    e: "ew-resize",
    sw: "nesw-resize",
    s: "ns-resize",
    se: "nwse-resize",
};

export function GridCanvas({
    zones,
    selectedZoneId,
    onSelectZone,
    onUpdateZone,
    canvasWidth,
    canvasHeight,
}: GridCanvasProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragType, setDragType] = useState<"move" | "resize" | null>(null);
    const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
    const [originalBounds, setOriginalBounds] = useState<Zone["bounds"] | null>(null);
    const canvasRef = useRef<SVGSVGElement>(null);

    // 스케일 계산 (캔버스를 화면에 맞추기)
    const containerWidth = 800;
    const scale = containerWidth / canvasWidth;

    // z-index 기준 정렬
    const sortedZones = [...zones].sort((a, b) => a.zIndex - b.zIndex);
    const selectedZone = zones.find((z) => z.id === selectedZoneId);

    // 마우스 좌표 계산
    const getMouseCoords = (e: MouseEvent) => {
        const svg = canvasRef.current;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / scale,
            y: (e.clientY - rect.top) / scale,
        };
    };

    // 이동 시작
    const handleMoveStart = (e: MouseEvent, zone: Zone) => {
        if (zone.locked) return;
        e.stopPropagation();
        onSelectZone(zone.id);

        const { x, y } = getMouseCoords(e);
        setIsDragging(true);
        setDragStart({ x: x - zone.bounds.x, y: y - zone.bounds.y });
        setDragType("move");
        setOriginalBounds({ ...zone.bounds });
    };

    // 리사이즈 시작
    const handleResizeStart = (e: MouseEvent, handle: ResizeHandle) => {
        e.stopPropagation();
        if (!selectedZone || selectedZone.locked) return;

        const { x, y } = getMouseCoords(e);
        setIsDragging(true);
        setDragStart({ x, y });
        setDragType("resize");
        setActiveHandle(handle);
        setOriginalBounds({ ...selectedZone.bounds });
    };

    // 드래그 중
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !selectedZoneId || !originalBounds) return;

        const { x, y } = getMouseCoords(e);
        const snapSize = 10;

        if (dragType === "move") {
            // 이동
            const newX = Math.round((x - dragStart.x) / snapSize) * snapSize;
            const newY = Math.round((y - dragStart.y) / snapSize) * snapSize;

            onUpdateZone(selectedZoneId, {
                bounds: {
                    ...originalBounds,
                    x: Math.max(0, Math.min(newX, canvasWidth - originalBounds.width)),
                    y: Math.max(0, Math.min(newY, canvasHeight - originalBounds.height)),
                },
            });
        } else if (dragType === "resize" && activeHandle) {
            // 리사이즈
            const deltaX = x - dragStart.x;
            const deltaY = y - dragStart.y;
            let newBounds = { ...originalBounds };

            // 핸들 방향에 따른 리사이즈
            if (activeHandle.includes("w")) {
                newBounds.x = Math.max(0, originalBounds.x + deltaX);
                newBounds.width = originalBounds.width - (newBounds.x - originalBounds.x);
            }
            if (activeHandle.includes("e")) {
                newBounds.width = Math.min(
                    canvasWidth - originalBounds.x,
                    originalBounds.width + deltaX,
                );
            }
            if (activeHandle.includes("n")) {
                newBounds.y = Math.max(0, originalBounds.y + deltaY);
                newBounds.height = originalBounds.height - (newBounds.y - originalBounds.y);
            }
            if (activeHandle.includes("s")) {
                newBounds.height = Math.min(
                    canvasHeight - originalBounds.y,
                    originalBounds.height + deltaY,
                );
            }

            // 최소 크기 보장
            const minSize = 50;
            newBounds.width = Math.max(minSize, newBounds.width);
            newBounds.height = Math.max(minSize, newBounds.height);

            // 스냅
            newBounds.x = Math.round(newBounds.x / snapSize) * snapSize;
            newBounds.y = Math.round(newBounds.y / snapSize) * snapSize;
            newBounds.width = Math.round(newBounds.width / snapSize) * snapSize;
            newBounds.height = Math.round(newBounds.height / snapSize) * snapSize;

            onUpdateZone(selectedZoneId, { bounds: newBounds });
        }
    };

    // 드래그 종료
    const handleMouseUp = () => {
        setIsDragging(false);
        setDragType(null);
        setActiveHandle(null);
        setOriginalBounds(null);
    };

    // 캔버스 클릭
    const handleCanvasClick = () => {
        onSelectZone(null);
    };

    // 리사이즈 핸들 렌더링
    const renderResizeHandles = (zone: Zone) => {
        const handles: ResizeHandle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
        const handleSize = 8;

        return handles.map((handle) => {
            const pos = getHandlePosition(handle, zone.bounds);
            return (
                <rect
                    key={handle}
                    x={pos.x - handleSize / 2}
                    y={pos.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#00d4ff"
                    stroke="#fff"
                    strokeWidth={1}
                    rx={2}
                    style={{ cursor: handleCursors[handle] }}
                    onMouseDown={(e) => handleResizeStart(e, handle)}
                />
            );
        });
    };

    return (
        <div className="grid-canvas-container">
            <div className="grid-canvas-toolbar">
                <span className="grid-canvas-info">
                    {canvasWidth} × {canvasHeight}
                </span>
                <span className="grid-canvas-info">
                    스케일: {Math.round(scale * 100)}%
                </span>
                {/* 드래그 중 크기 표시 */}
                {isDragging && selectedZone && (
                    <span className="grid-canvas-info active">
                        {selectedZone.bounds.width} × {selectedZone.bounds.height} px
                    </span>
                )}
            </div>

            <div className="grid-canvas-viewport">
                <svg
                    ref={canvasRef}
                    className="grid-canvas"
                    width={canvasWidth * scale}
                    height={canvasHeight * scale}
                    viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onClick={handleCanvasClick}
                >
                    {/* 배경 */}
                    <rect width={canvasWidth} height={canvasHeight} fill="#1a1a1a" />

                    {/* 그리드 라인 (100px 간격) */}
                    {Array.from({ length: Math.ceil(canvasWidth / 100) }).map((_, i) => (
                        <line
                            key={`v-${i}`}
                            x1={i * 100}
                            y1={0}
                            x2={i * 100}
                            y2={canvasHeight}
                            stroke="#2a2a2a"
                            strokeWidth={0.5}
                        />
                    ))}
                    {Array.from({ length: Math.ceil(canvasHeight / 100) }).map((_, i) => (
                        <line
                            key={`h-${i}`}
                            x1={0}
                            y1={i * 100}
                            x2={canvasWidth}
                            y2={i * 100}
                            stroke="#2a2a2a"
                            strokeWidth={0.5}
                        />
                    ))}

                    {/* Zones */}
                    {sortedZones.map((zone) => (
                        <g
                            key={zone.id}
                            className={`zone ${selectedZoneId === zone.id ? "selected" : ""} ${zone.locked ? "locked" : ""}`}
                            style={{ opacity: zone.visible ? 1 : 0.3 }}
                            onMouseDown={(e) => handleMoveStart(e, zone)}
                        >
                            {/* Zone 배경 */}
                            <rect
                                x={zone.bounds.x}
                                y={zone.bounds.y}
                                width={zone.bounds.width}
                                height={zone.bounds.height}
                                fill={zone.style?.backgroundColor || "#3a3a3a"}
                                stroke={selectedZoneId === zone.id ? "#00d4ff" : "#555"}
                                strokeWidth={selectedZoneId === zone.id ? 3 : 1}
                                rx={4}
                                style={{ cursor: zone.locked ? "not-allowed" : "move" }}
                            />

                            {/* Zone 라벨 */}
                            <text
                                x={zone.bounds.x + zone.bounds.width / 2}
                                y={zone.bounds.y + zone.bounds.height / 2}
                                fill="#fff"
                                fontSize={14}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                pointerEvents="none"
                            >
                                {zone.name}
                            </text>

                            {/* 크기 정보 (선택 시) */}
                            {selectedZoneId === zone.id && (
                                <text
                                    x={zone.bounds.x + zone.bounds.width / 2}
                                    y={zone.bounds.y + zone.bounds.height / 2 + 20}
                                    fill="#00d4ff"
                                    fontSize={11}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    pointerEvents="none"
                                >
                                    {zone.bounds.width} × {zone.bounds.height}
                                </text>
                            )}

                            {/* 8방향 리사이즈 핸들 */}
                            {selectedZoneId === zone.id && !zone.locked && renderResizeHandles(zone)}
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}
