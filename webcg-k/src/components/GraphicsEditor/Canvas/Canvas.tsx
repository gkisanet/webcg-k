/**
 * Canvas - SVG 기반 그래픽 캔버스
 */

import { useRef, useState, useCallback, useEffect, MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import { GridOverlay } from "./GridOverlay";
import { estimateWrappedTextHeight } from "@/lib/textMeasure";
import { buildPluginSrcdoc } from "@/lib/webcgkSrcdoc";

// CSS 문자열을 React style 객체로 변환
const parseCssToStyle = (css: string | undefined): React.CSSProperties => {
    if (!css) return {};
    const style: Record<string, string> = {};

    // 주석 제거
    const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");

    // 각 속성 파싱
    const declarations = cleaned.split(";").filter(d => d.trim());
    for (const decl of declarations) {
        const colonIndex = decl.indexOf(":");
        if (colonIndex === -1) continue;

        const property = decl.slice(0, colonIndex).trim();
        const value = decl.slice(colonIndex + 1).trim();

        // CSS 속성명을 camelCase로 변환 (예: background-color -> backgroundColor)
        const camelCase = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        style[camelCase] = value;
    }

    return style as React.CSSProperties;
};

interface CanvasProps {
    elements: GraphicElement[];
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
    gridTemplateId: string | null;
    onGridTemplateChange: (id: string | null) => void;
    canvasWidth: number;
    canvasHeight: number;
    zoom?: number;
    activeTool: string;
    onAddElement: (type: GraphicElement["type"]) => void;
}

// 그리드 템플릿 데이터 타입
interface GridTemplateData {
    zones?: Array<{
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
}

export function Canvas({
    elements,
    selectedIds,
    onSelect,
    onUpdate,
    gridTemplateId,
    canvasWidth,
    canvasHeight,
    zoom = 1,
}: CanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragging, setDragging] = useState<{
        id: string;
        startX: number;
        startY: number;
        elStartX: number;
        elStartY: number;
    } | null>(null);

    // 리사이즈 상태
    const [resizing, setResizing] = useState<{
        id: string;
        handle: string;
        startX: number;
        startY: number;
        elStartX: number;
        elStartY: number;
        elStartWidth: number;
        elStartHeight: number;
    } | null>(null);

    // 🆕 Text Frame 리사이즈 상태
    // Shape 내부 Text Frame 영역을 마우스로 직접 드래그하여 크기 조정
    // Why: 사이드바 X/Y/W/H 숫자 입력보다 직관적, 파워포인트 UX와 일치
    const [frameResizing, setFrameResizing] = useState<{
        elementId: string;
        slotId: string;
        handle: string; // 방향: "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w"
        startX: number;
        startY: number;
        frameStartX: number;
        frameStartY: number;
        frameStartW: number;
        frameStartH: number;
        shapeW: number; // Shape 폭 (클램핑 기준)
        shapeH: number; // Shape 높이 (클램핑 기준)
    } | null>(null);

    // 스냅 가이드라인 상태
    const [snapGuides, setSnapGuides] = useState<{
        vertical: number[];  // x 좌표 배열
        horizontal: number[]; // y 좌표 배열
    }>({ vertical: [], horizontal: [] });

    // 🆕 Text Frame 인라인 편집 상태
    // Shape 더블클릭 시 진입: 해당 슬롯의 텍스트를 직접 편집
    const [editingSlot, setEditingSlot] = useState<{
        elementId: string;
        slotId: string;
    } | null>(null);

    // Escape 키로 편집 모드 종료
    useEffect(() => {
        if (!editingSlot) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setEditingSlot(null);
                setFrameResizing(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [editingSlot]);

    // 그리드 템플릿 로드
    const { data: gridTemplate } = useQuery({
        queryKey: ["gridTemplate", gridTemplateId],
        queryFn: async () => {
            if (!gridTemplateId) return null;
            const { data, error } = await supabase
                .from("grid_templates")
                .select("*")
                .eq("id", gridTemplateId)
                .single();
            if (error) throw error;
            return data as { template_data: GridTemplateData };
        },
        enabled: !!gridTemplateId,
    });

    // 캔버스 스케일 (zoom prop 사용)
    const scale = zoom;
    const displayWidth = canvasWidth * scale;
    const displayHeight = canvasHeight * scale;

    // zones 데이터
    const zones = (gridTemplate?.template_data as GridTemplateData)?.zones || [];

    // 마우스 좌표를 캔버스 좌표로 변환
    const getCanvasCoords = useCallback(
        (e: MouseEvent) => {
            if (!svgRef.current) return { x: 0, y: 0 };
            const rect = svgRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left) / scale;
            const y = (e.clientY - rect.top) / scale;
            return { x, y };
        },
        [scale]
    );

    // 드래그 시작
    const handleMouseDown = useCallback(
        (e: MouseEvent, elementId: string) => {
            const element = elements.find((el) => el.id === elementId);
            if (!element || element.locked) return;

            e.stopPropagation();
            const coords = getCanvasCoords(e);

            // 선택
            if (!selectedIds.includes(elementId)) {
                if (e.ctrlKey || e.metaKey) {
                    onSelect([...selectedIds, elementId]);
                } else {
                    onSelect([elementId]);
                }
            }

            setDragging({
                id: elementId,
                startX: coords.x,
                startY: coords.y,
                elStartX: element.x,
                elStartY: element.y,
            });
        },
        [elements, selectedIds, onSelect, getCanvasCoords]
    );

    // 드래그/리사이즈 중
    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            const coords = getCanvasCoords(e);

            // 🆕 Text Frame 리사이즈 처리
            // Why: Shape 리사이즈와 독립된 상태를 유지하여 Text Frame만 변경하고 Shape에는 영향 없음
            if (frameResizing) {
                const element = elements.find((el) => el.id === frameResizing.elementId);
                if (!element?.bindingContainer) return;
                const slot = element.bindingContainer.slots.find((s) => s.id === frameResizing.slotId);
                if (!slot) return;

                const dx = coords.x - frameResizing.startX;
                const dy = coords.y - frameResizing.startY;

                let newFX = frameResizing.frameStartX;
                let newFY = frameResizing.frameStartY;
                let newFW = frameResizing.frameStartW;
                let newFH = frameResizing.frameStartH;

                const h = frameResizing.handle;
                // 서쪽(w): x와 폭 동시 변경
                if (h.includes("w")) { newFX = frameResizing.frameStartX + dx; newFW = frameResizing.frameStartW - dx; }
                // 동쪽(e): 폭만 변경
                if (h.includes("e")) { newFW = frameResizing.frameStartW + dx; }
                // 북쪽(n): y와 높이 동시 변경
                if (h.includes("n")) { newFY = frameResizing.frameStartY + dy; newFH = frameResizing.frameStartH - dy; }
                // 남쪽(s): 높이만 변경
                if (h.includes("s")) { newFH = frameResizing.frameStartH + dy; }

                // 최소 크기 보장 (w ≥ 40px, h ≥ 20px)
                if (newFW < 40) { if (h.includes("w")) newFX = frameResizing.frameStartX + frameResizing.frameStartW - 40; newFW = 40; }
                if (newFH < 20) { if (h.includes("n")) newFY = frameResizing.frameStartY + frameResizing.frameStartH - 20; newFH = 20; }

                // Shape 바운더리 클램핑 (Text Frame이 Shape 박으로 나가지 않도록)
                newFX = Math.max(0, newFX);
                newFY = Math.max(0, newFY);
                newFW = Math.min(newFW, frameResizing.shapeW - newFX);
                newFH = Math.min(newFH, frameResizing.shapeH - newFY);

                const bc = element.bindingContainer;
                const newSlots = bc.slots.map((s) =>
                    s.id === frameResizing.slotId
                        ? { ...s, frameX: Math.round(newFX), frameY: Math.round(newFY), frameWidth: Math.round(newFW), frameHeight: Math.round(newFH) }
                        : s,
                );
                onUpdate(frameResizing.elementId, { bindingContainer: { ...bc, slots: newSlots } });
                return;
            }

            // 리사이즈 처리
            if (resizing) {
                const element = elements.find((el) => el.id === resizing.id);
                if (!element) return;

                const dx = coords.x - resizing.startX;
                const dy = coords.y - resizing.startY;

                let newX = resizing.elStartX;
                let newY = resizing.elStartY;
                let newWidth = resizing.elStartWidth;
                let newHeight = resizing.elStartHeight;

                // 핸들 위치에 따라 리사이즈
                if (resizing.handle.includes("left")) {
                    newX = resizing.elStartX + dx;
                    newWidth = resizing.elStartWidth - dx;
                }
                if (resizing.handle.includes("right")) {
                    newWidth = resizing.elStartWidth + dx;
                }
                if (resizing.handle.includes("top")) {
                    newY = resizing.elStartY + dy;
                    newHeight = resizing.elStartHeight - dy;
                }
                if (resizing.handle.includes("bottom")) {
                    newHeight = resizing.elStartHeight + dy;
                }

                // 리사이즈 스냅 (8px 임계값)
                const SNAP_THRESHOLD = 8;
                const activeVerticalGuides: number[] = [];
                const activeHorizontalGuides: number[] = [];

                // 그리드 Zone 경계에 스냅
                for (const zone of zones) {
                    const zoneX = Math.round((zone.x / 100) * canvasWidth);
                    const zoneY = Math.round((zone.y / 100) * canvasHeight);
                    const zoneRight = Math.round(((zone.x + zone.width) / 100) * canvasWidth);
                    const zoneBottom = Math.round(((zone.y + zone.height) / 100) * canvasHeight);

                    // 왼쪽 핸들 스냅
                    if (resizing.handle.includes("left")) {
                        if (Math.abs(newX - zoneX) < SNAP_THRESHOLD) {
                            const diff = newX - zoneX;
                            newX = zoneX;
                            newWidth += diff;
                            activeVerticalGuides.push(zoneX);
                        }
                        if (Math.abs(newX - zoneRight) < SNAP_THRESHOLD) {
                            const diff = newX - zoneRight;
                            newX = zoneRight;
                            newWidth += diff;
                            activeVerticalGuides.push(zoneRight);
                        }
                    }

                    // 오른쪽 핸들 스냅
                    if (resizing.handle.includes("right")) {
                        const rightEdge = newX + newWidth;
                        if (Math.abs(rightEdge - zoneRight) < SNAP_THRESHOLD) {
                            newWidth = zoneRight - newX;
                            activeVerticalGuides.push(zoneRight);
                        }
                        if (Math.abs(rightEdge - zoneX) < SNAP_THRESHOLD) {
                            newWidth = zoneX - newX;
                            activeVerticalGuides.push(zoneX);
                        }
                    }

                    // 상단 핸들 스냅
                    if (resizing.handle.includes("top")) {
                        if (Math.abs(newY - zoneY) < SNAP_THRESHOLD) {
                            const diff = newY - zoneY;
                            newY = zoneY;
                            newHeight += diff;
                            activeHorizontalGuides.push(zoneY);
                        }
                        if (Math.abs(newY - zoneBottom) < SNAP_THRESHOLD) {
                            const diff = newY - zoneBottom;
                            newY = zoneBottom;
                            newHeight += diff;
                            activeHorizontalGuides.push(zoneBottom);
                        }
                    }

                    // 하단 핸들 스냅
                    if (resizing.handle.includes("bottom")) {
                        const bottomEdge = newY + newHeight;
                        if (Math.abs(bottomEdge - zoneBottom) < SNAP_THRESHOLD) {
                            newHeight = zoneBottom - newY;
                            activeHorizontalGuides.push(zoneBottom);
                        }
                        if (Math.abs(bottomEdge - zoneY) < SNAP_THRESHOLD) {
                            newHeight = zoneY - newY;
                            activeHorizontalGuides.push(zoneY);
                        }
                    }
                }

                // 다른 shape 모서리 점에 스냅
                for (const other of elements) {
                    if (other.id === resizing.id) continue;
                    const corners = [
                        { x: other.x, y: other.y },
                        { x: other.x + other.width, y: other.y },
                        { x: other.x, y: other.y + other.height },
                        { x: other.x + other.width, y: other.y + other.height },
                    ];
                    for (const corner of corners) {
                        if (resizing.handle.includes("left")) {
                            if (Math.abs(newX - corner.x) < SNAP_THRESHOLD) {
                                const diff = newX - corner.x;
                                newX = corner.x;
                                newWidth += diff;
                                activeVerticalGuides.push(corner.x);
                            }
                        }
                        if (resizing.handle.includes("right")) {
                            if (Math.abs(newX + newWidth - corner.x) < SNAP_THRESHOLD) {
                                newWidth = corner.x - newX;
                                activeVerticalGuides.push(corner.x);
                            }
                        }
                        if (resizing.handle.includes("top")) {
                            if (Math.abs(newY - corner.y) < SNAP_THRESHOLD) {
                                const diff = newY - corner.y;
                                newY = corner.y;
                                newHeight += diff;
                                activeHorizontalGuides.push(corner.y);
                            }
                        }
                        if (resizing.handle.includes("bottom")) {
                            if (Math.abs(newY + newHeight - corner.y) < SNAP_THRESHOLD) {
                                newHeight = corner.y - newY;
                                activeHorizontalGuides.push(corner.y);
                            }
                        }
                    }
                }

                // 스냅 가이드라인 업데이트
                setSnapGuides({
                    vertical: [...new Set(activeVerticalGuides)],
                    horizontal: [...new Set(activeHorizontalGuides)],
                });

                // 최소 크기 보장
                if (newWidth < 10) {
                    if (resizing.handle.includes("left")) {
                        newX = resizing.elStartX + resizing.elStartWidth - 10;
                    }
                    newWidth = 10;
                }
                if (newHeight < 10) {
                    if (resizing.handle.includes("top")) {
                        newY = resizing.elStartY + resizing.elStartHeight - 10;
                    }
                    newHeight = 10;
                }

                onUpdate(resizing.id, {
                    x: Math.round(newX),
                    y: Math.round(newY),
                    width: Math.round(newWidth),
                    height: Math.round(newHeight),
                });
                return;
            }

            // 드래그 처리
            if (!dragging) return;

            const dx = coords.x - dragging.startX;
            const dy = coords.y - dragging.startY;

            let newX = dragging.elStartX + dx;
            let newY = dragging.elStartY + dy;

            // 스냅 (8px 임계값)
            const SNAP_THRESHOLD = 8;
            const activeVerticalGuides: number[] = [];
            const activeHorizontalGuides: number[] = [];

            const element = elements.find((el) => el.id === dragging.id);
            if (!element) return;

            // 그리드 영역 경계에 스냅
            for (const zone of zones) {
                const zoneX = Math.round((zone.x / 100) * canvasWidth);
                const zoneY = Math.round((zone.y / 100) * canvasHeight);
                const zoneRight = Math.round(((zone.x + zone.width) / 100) * canvasWidth);
                const zoneBottom = Math.round(((zone.y + zone.height) / 100) * canvasHeight);

                // 왼쪽 경계
                if (Math.abs(newX - zoneX) < SNAP_THRESHOLD) {
                    newX = zoneX;
                    activeVerticalGuides.push(zoneX);
                }
                // 왼쪽 경계 (요소 왼쪽 → zone 오른쪽)
                if (Math.abs(newX - zoneRight) < SNAP_THRESHOLD) {
                    newX = zoneRight;
                    activeVerticalGuides.push(zoneRight);
                }
                // 오른쪽 경계 (요소 오른쪽)
                if (Math.abs(newX + element.width - zoneRight) < SNAP_THRESHOLD) {
                    newX = zoneRight - element.width;
                    activeVerticalGuides.push(zoneRight);
                }
                // 요소 오른쪽 → zone 왼쪽
                if (Math.abs(newX + element.width - zoneX) < SNAP_THRESHOLD) {
                    newX = zoneX - element.width;
                    activeVerticalGuides.push(zoneX);
                }
                // 위쪽 경계
                if (Math.abs(newY - zoneY) < SNAP_THRESHOLD) {
                    newY = zoneY;
                    activeHorizontalGuides.push(zoneY);
                }
                // 위쪽 경계 (요소 위쪽 → zone 아래쪽)
                if (Math.abs(newY - zoneBottom) < SNAP_THRESHOLD) {
                    newY = zoneBottom;
                    activeHorizontalGuides.push(zoneBottom);
                }
                // 아래쪽 경계 (요소 아래쪽)
                if (Math.abs(newY + element.height - zoneBottom) < SNAP_THRESHOLD) {
                    newY = zoneBottom - element.height;
                    activeHorizontalGuides.push(zoneBottom);
                }
                // 요소 아래쪽 → zone 위쪽
                if (Math.abs(newY + element.height - zoneY) < SNAP_THRESHOLD) {
                    newY = zoneY - element.height;
                    activeHorizontalGuides.push(zoneY);
                }
            }

            // 캔버스 중심선 스냅
            const centerX = canvasWidth / 2;
            const centerY = canvasHeight / 2;
            if (Math.abs(newX + element.width / 2 - centerX) < SNAP_THRESHOLD) {
                newX = centerX - element.width / 2;
                activeVerticalGuides.push(centerX);
            }
            if (Math.abs(newY + element.height / 2 - centerY) < SNAP_THRESHOLD) {
                newY = centerY - element.height / 2;
                activeHorizontalGuides.push(centerY);
            }

            // 다른 shape 모서리 점에 스냅
            for (const other of elements) {
                if (other.id === dragging.id) continue;
                const corners = [
                    { x: other.x, y: other.y },
                    { x: other.x + other.width, y: other.y },
                    { x: other.x, y: other.y + other.height },
                    { x: other.x + other.width, y: other.y + other.height },
                ];
                for (const corner of corners) {
                    if (Math.abs(newX - corner.x) < SNAP_THRESHOLD) {
                        newX = corner.x;
                        activeVerticalGuides.push(corner.x);
                    }
                    if (Math.abs(newX + element.width - corner.x) < SNAP_THRESHOLD) {
                        newX = corner.x - element.width;
                        activeVerticalGuides.push(corner.x);
                    }
                    if (Math.abs(newY - corner.y) < SNAP_THRESHOLD) {
                        newY = corner.y;
                        activeHorizontalGuides.push(corner.y);
                    }
                    if (Math.abs(newY + element.height - corner.y) < SNAP_THRESHOLD) {
                        newY = corner.y - element.height;
                        activeHorizontalGuides.push(corner.y);
                    }
                }
            }

            // 스냅 가이드라인 업데이트
            setSnapGuides({
                vertical: [...new Set(activeVerticalGuides)],
                horizontal: [...new Set(activeHorizontalGuides)],
            });

            onUpdate(dragging.id, { x: Math.round(newX), y: Math.round(newY) });
        },
        [dragging, resizing, frameResizing, getCanvasCoords, zones, canvasWidth, canvasHeight, elements, onUpdate]
    );

    // 드래그/리사이즈 종료
    const handleMouseUp = useCallback(() => {
        setDragging(null);
        setResizing(null);
        setFrameResizing(null);
        setSnapGuides({ vertical: [], horizontal: [] }); // 가이드라인 제거
    }, []);

    // 빈 영역 클릭 시 선택 해제 + 편집 모드 종료
    const handleCanvasClick = useCallback(
        (e: MouseEvent) => {
            if (e.target === svgRef.current) {
                onSelect([]);
                setEditingSlot(null);
            }
        },
        [onSelect]
    );

    // 부모 그룹의 visible/locked 상태 체크
    const isElementVisible = (el: GraphicElement): boolean => {
        if (!el.visible) return false;
        if (el.parentId) {
            const parent = elements.find((p) => p.id === el.parentId);
            if (parent && !isElementVisible(parent)) return false;
        }
        return true;
    };

    const isElementLocked = (el: GraphicElement): boolean => {
        if (el.locked) return true;
        if (el.parentId) {
            const parent = elements.find((p) => p.id === el.parentId);
            if (parent && isElementLocked(parent)) return true;
        }
        return false;
    };

    // fill 스타일 반환 (단색, 그라데이션, 투명)
    const getFillStyle = (element: GraphicElement): string => {
        const fill = element.fill;
        if (!fill || fill.type === "none") return "transparent";
        if (fill.type === "solid") return fill.color || "#3b82f6";
        // 그라데이션은 url(#gradient-{id})
        return `url(#gradient-${element.id})`;
    };

    // fill 투명도 반환
    const getFillOpacity = (element: GraphicElement): number => {
        return element.fill?.opacity ?? 1;
    };

    // 그라데이션 defs 렌더링
    const renderGradientDefs = () => {
        const gradientElements = elements.filter(
            (el) => el.fill?.type === "linear" || el.fill?.type === "radial"
        );

        return (
            <defs>
                {gradientElements.map((el) => {
                    const stops = el.fill?.gradientStops || [
                        { offset: 0, color: "#3b82f6" },
                        { offset: 100, color: "#8b5cf6" },
                    ];
                    const angle = el.fill?.gradientAngle || 0;
                    const radians = (angle - 90) * (Math.PI / 180);
                    const x1 = 50 + 50 * Math.cos(radians + Math.PI);
                    const y1 = 50 + 50 * Math.sin(radians + Math.PI);
                    const x2 = 50 + 50 * Math.cos(radians);
                    const y2 = 50 + 50 * Math.sin(radians);

                    if (el.fill?.type === "linear") {
                        return (
                            <linearGradient
                                key={el.id}
                                id={`gradient-${el.id}`}
                                x1={`${x1}%`}
                                y1={`${y1}%`}
                                x2={`${x2}%`}
                                y2={`${y2}%`}
                            >
                                {stops.map((stop, i) => (
                                    <stop
                                        key={i}
                                        offset={`${stop.offset}%`}
                                        stopColor={stop.color}
                                        stopOpacity={stop.opacity ?? 1}
                                    />
                                ))}
                            </linearGradient>
                        );
                    } else {
                        return (
                            <radialGradient
                                key={el.id}
                                id={`gradient-${el.id}`}
                                cx="50%"
                                cy="50%"
                                r="50%"
                            >
                                {stops.map((stop, i) => (
                                    <stop
                                        key={i}
                                        offset={`${stop.offset}%`}
                                        stopColor={stop.color}
                                        stopOpacity={stop.opacity ?? 1}
                                    />
                                ))}
                            </radialGradient>
                        );
                    }
                })}
            </defs>
        );
    };

    // 요소 렌더링
    const renderElement = (element: GraphicElement) => {
        if (!isElementVisible(element)) return null;

        const isSelected = selectedIds.includes(element.id);
        const isLocked = isElementLocked(element);

        // 라벨 렌더링 — 요소가 상단 근처이면 내부에 배치
        const renderLabel = () => {
            const labelText = element.name;
            const paddingX = 6;
            const paddingY = 3;
            const labelFontSize = 12;
            const textWidth = labelText.length * 7 + paddingX * 2;
            const labelHeight = labelFontSize + paddingY * 2;
            const GAP = 8; // 요소 위 간격

            // 라벨이 캔버스 밖(음수 영역)으로 나가는지 판단
            const labelSpaceNeeded = labelHeight + GAP;
            const placeInside = element.y < labelSpaceNeeded;

            // 외부 배치: 요소 위
            // 내부 배치: 요소 안 상단
            const labelX = element.x;
            const rectY = placeInside
                ? element.y + 4                    // 내부 상단에 4px 여백
                : element.y - GAP - labelHeight;   // 외부 위쪽
            const textY = rectY + labelFontSize + paddingY - 2;

            return (
                <g className="element-label" pointerEvents="none">
                    <rect
                        x={labelX}
                        y={rectY}
                        width={textWidth}
                        height={labelHeight}
                        fill={placeInside ? "rgba(0,0,0,0.6)" : "white"}
                        stroke="var(--accent-primary)"
                        strokeWidth={1}
                        strokeDasharray="3,2"
                        rx={3}
                    />
                    <text
                        x={labelX + paddingX}
                        y={textY}
                        fill={placeInside ? "#ffffff" : "var(--accent-primary)"}
                        fontSize={labelFontSize}
                        fontFamily="sans-serif"
                        fontWeight={500}
                    >
                        {labelText}
                    </text>
                </g>
            );
        };

        // 선택 테두리 렌더링 (SVG rect로 직접 그리기 - 도형에 밀착)
        const renderSelectionBorder = () => {
            if (!isSelected) return null;
            return (
                <rect
                    x={element.x}
                    y={element.y}
                    width={element.width}
                    height={element.height}
                    fill="none"
                    stroke="#FF00FF"
                    strokeWidth={2}
                    strokeDasharray="6,3"
                    pointerEvents="none"
                    rx={element.type === "rect" ? (element.borderRadius || 0) : 0}
                />
            );
        };

        // customCSS 파싱
        const customStyles = parseCssToStyle(element.customCSS);

        const commonProps = {
            className: `element-wrapper ${isSelected ? "selected" : ""} ${isLocked ? "locked" : ""}`,
            onMouseDown: isLocked ? undefined : (e: MouseEvent<SVGGElement>) => handleMouseDown(e, element.id),
            style: {
                opacity: element.opacity,
                transform: `rotate(${element.rotation}deg)`,
                transformOrigin: `${element.x + element.width / 2}px ${element.y + element.height / 2}px`,
                cursor: isLocked ? "not-allowed" : undefined,
                // 🆕 Blend Mode — SVG <g> style에서 네이티브로 동작
                mixBlendMode: (element.blendMode && element.blendMode !== "normal") ? element.blendMode as React.CSSProperties["mixBlendMode"] : undefined,
                ...customStyles, // customCSS 적용
            },
        };

        // 🆕 Visual Effects SVG 필터 헬퍼 (Shadow, Glow, Inner Shadow)
        // Why: 모든 도형에 다중 시각 효과(Glow, Inner Shadow 등)를 중첩 적용하기 위한 필터 체인 구성
        const effectsFilterId = `effects-${element.id}`;
        
        const hasShadow = element.shadowEnabled;
        const hasGlow = element.glowEnabled;
        const hasInnerShadow = element.innerShadowEnabled && (element.type === "rect" || element.type === "ellipse");
        
        const hasEffects = hasShadow || hasGlow || hasInnerShadow;
        const effectsFilterUrl = hasEffects ? `url(#${effectsFilterId})` : undefined;

        const renderVisualEffectsDefs = () => {
            if (!hasEffects) return null;
            return (
                <defs>
                    <filter id={effectsFilterId} x="-50%" y="-50%" width="200%" height="200%">
                        {/* 1. Inner Shadow (내곽선 그림자) */}
                        {hasInnerShadow && (
                            <>
                                <feOffset in="SourceAlpha" dx={element.innerShadowOffsetX ?? 2} dy={element.innerShadowOffsetY ?? 2} result="is-offset" />
                                <feGaussianBlur in="is-offset" stdDeviation={element.innerShadowBlur ?? 4} result="is-blur" />
                                <feComposite operator="out" in="SourceAlpha" in2="is-blur" result="is-inverse" />
                                <feFlood floodColor={element.innerShadowColor || "#000000"} floodOpacity={0.8} result="is-color" />
                                <feComposite operator="in" in="is-color" in2="is-inverse" result="is-shadow" />
                                <feComposite operator="over" in="is-shadow" in2="SourceGraphic" result="inner-out" />
                            </>
                        )}

                        {/* 2. Glow (외부 발광) */}
                        {hasGlow && (
                            <feDropShadow 
                                in={hasInnerShadow ? "inner-out" : "SourceGraphic"} 
                                dx="0" dy="0" 
                                stdDeviation={element.glowBlur ?? 10} 
                                floodColor={element.glowColor || "#00e5ff"} 
                                floodOpacity={0.8} 
                                result="glow-out" 
                            />
                        )}

                        {/* 3. Drop Shadow (외부 그림자) */}
                        {hasShadow && (
                            <feDropShadow 
                                in={hasGlow ? "glow-out" : (hasInnerShadow ? "inner-out" : "SourceGraphic")} 
                                dx={element.shadowOffsetX ?? 2} 
                                dy={element.shadowOffsetY ?? 2} 
                                stdDeviation={element.shadowBlur ?? 4} 
                                floodColor={element.shadowColor || "#000000"} 
                                floodOpacity={0.5} 
                            />
                        )}
                    </filter>
                </defs>
            );
        };

        // 🆕 Stroke 스타일 → SVG strokeDasharray 변환
        // Why: Stroke.style 필드가 "dashed" | "dotted" | "solid"로 정의되어 있으나
        //      Canvas 렌더링에는 연결되지 않았음.
        const getStrokeDasharray = (): string | undefined => {
            const style = element.stroke?.style;
            if (style === "dashed") return "8 4";
            if (style === "dotted") return "2 2";
            return undefined; // solid
        };
        const strokeDasharray = getStrokeDasharray();
        const strokeOpacity = element.stroke?.opacity ?? 1;

        switch (element.type) {
            case "rect": {
                // 개별 코너 radius 계산
                const unit = element.borderRadiusUnit || "px";
                const baseRadius = element.borderRadius || 0;
                const maxRadius = unit === "%" ? Math.min(element.width, element.height) / 2 : 999999;

                const getRadius = (value: number | undefined) => {
                    const r = value ?? baseRadius;
                    if (unit === "%") {
                        return Math.min((r / 100) * Math.min(element.width, element.height) / 2, maxRadius);
                    }
                    return Math.min(r, element.width / 2, element.height / 2);
                };

                const tl = getRadius(element.borderRadiusTL);
                const tr = getRadius(element.borderRadiusTR);
                const br = getRadius(element.borderRadiusBR);
                const bl = getRadius(element.borderRadiusBL);

                // 모든 코너가 같으면 단순 rect 사용
                const allSame = (element.borderRadiusLinked !== false) || (tl === tr && tr === br && br === bl);

                return (
                    <g key={element.id} {...commonProps}
                        onDoubleClick={() => {
                            // Shape 더블클릭 → 첫 번째 슬롯 인라인 편집 진입
                            if (element.bindingContainer?.enabled && element.bindingContainer.slots.length > 0) {
                                setEditingSlot({
                                    elementId: element.id,
                                    slotId: element.bindingContainer.slots[0].id,
                                });
                            }
                        }}
                    >
                        {renderVisualEffectsDefs()}
                        {allSame ? (
                            <rect
                                x={element.x}
                                y={element.y}
                                width={element.width}
                                height={element.height}
                                fill={getFillStyle(element)}
                                fillOpacity={getFillOpacity(element)}
                                stroke={element.stroke?.color || "#1e40af"}
                                strokeWidth={element.stroke?.width ?? 2}
                                strokeDasharray={strokeDasharray}
                                strokeOpacity={strokeOpacity}
                                rx={tl}
                                filter={effectsFilterUrl}
                            />
                        ) : (
                            <path
                                d={`
                                    M ${element.x + tl} ${element.y}
                                    L ${element.x + element.width - tr} ${element.y}
                                    Q ${element.x + element.width} ${element.y} ${element.x + element.width} ${element.y + tr}
                                    L ${element.x + element.width} ${element.y + element.height - br}
                                    Q ${element.x + element.width} ${element.y + element.height} ${element.x + element.width - br} ${element.y + element.height}
                                    L ${element.x + bl} ${element.y + element.height}
                                    Q ${element.x} ${element.y + element.height} ${element.x} ${element.y + element.height - bl}
                                    L ${element.x} ${element.y + tl}
                                    Q ${element.x} ${element.y} ${element.x + tl} ${element.y}
                                    Z
                                `}
                                fill={getFillStyle(element)}
                                fillOpacity={getFillOpacity(element)}
                                stroke={element.stroke?.color || "#1e40af"}
                                strokeWidth={element.stroke?.width ?? 2}
                                strokeDasharray={strokeDasharray}
                                strokeOpacity={strokeOpacity}
                                filter={effectsFilterUrl}
                            />
                        )}
                        {/* 🆕 Binding Container — Text Frame 기반 텍스트 편집 */}
                        {element.bindingContainer?.enabled && element.bindingContainer.slots.map((slot) => {
                            // Text Frame 절대 좌표 계산 (Shape 원점 + 오프셋)
                            const frameAbsX = element.x + slot.frameX;
                            const frameAbsY = element.y + slot.frameY;
                            const frameW = slot.frameWidth;
                            const frameH = slot.frameHeight;
                            const isEditingThis = editingSlot?.elementId === element.id && editingSlot?.slotId === slot.id;
                            const autoFitMode = element.bindingContainer!.autoFit;

                            return (
                                <g key={slot.id}>
                                    {/* Text Frame 바운더리 (편집 중 또는 선택 시: 점선 표시) */}
                                    {(isEditingThis || isSelected) && (
                                        <rect
                                            x={frameAbsX}
                                            y={frameAbsY}
                                            width={frameW}
                                            height={frameH}
                                            fill="transparent"
                                            stroke={isEditingThis ? "#60a5fa" : "rgba(96,165,250,0.3)"}
                                            strokeWidth={1}
                                            strokeDasharray={isEditingThis ? "none" : "4 4"}
                                            pointerEvents="none"
                                        />
                                    )}

                                    {isEditingThis ? (
                                        /* 편집 모드: foreignObject + contentEditable */
                                        <foreignObject
                                            x={frameAbsX}
                                            y={frameAbsY}
                                            width={frameW}
                                            height={frameH}
                                        >
                                            <div
                                                contentEditable
                                                suppressContentEditableWarning
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    fontSize: slot.fontSize,
                                                    fontFamily: slot.fontFamily,
                                                    fontWeight: slot.fontWeight,
                                                    color: slot.color,
                                                    textAlign: slot.textAlign,
                                                    outline: "none",
                                                    border: "none",
                                                    background: "transparent",
                                                    overflow: "hidden",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: slot.textAlign === "center" ? "center" : slot.textAlign === "right" ? "flex-end" : "flex-start",
                                                    wordWrap: autoFitMode === "wrap" ? "break-word" : "normal",
                                                    whiteSpace: autoFitMode === "wrap" ? "pre-wrap" : "nowrap",
                                                    lineHeight: 1.2,
                                                    padding: 0,
                                                    margin: 0,
                                                    cursor: "text",
                                                }}
                                                onBlur={(e) => {
                                                    // 편집 종료 시 content 업데이트 + wrap 모드 auto-expand
                                                    const newContent = (e.target as HTMLDivElement).innerText;
                                                    const bc = element.bindingContainer!;
                                                    // 편집된 특정 슬롯만 업데이트 (나머지는 원본 유지)
                                                    let updatedSlot: typeof slot = { ...slot, content: newContent };

                                                    // 🆕 wrap 모드: 텍스트량에 따라 frameHeight 자동 확장
                                                    // Why: 고정 높이에서 텍스트가 잘리면 오퍼레이터가 인지하기 어렵다.
                                                    //      blur 시점에 쫙 높이를 계산하여 Shape 높이 내에서 자동 확장한다.
                                                    if (autoFitMode === "wrap" && newContent) {
                                                        const estH = estimateWrappedTextHeight(
                                                            newContent, slot.fontSize, slot.fontFamily, slot.fontWeight, frameW,
                                                        );
                                                        if (estH > slot.frameHeight) {
                                                            // Shape 안에서 frameY만큼 이미 사용했으므로 남은 공간까지만 확장
                                                            const maxH = element.height - slot.frameY;
                                                            updatedSlot = { ...updatedSlot, frameHeight: Math.min(Math.ceil(estH), maxH) };
                                                        }
                                                    }

                                                    const hasChange =
                                                        newContent !== slot.content ||
                                                        updatedSlot.frameHeight !== slot.frameHeight;
                                                    if (hasChange) {
                                                        const newSlots = bc.slots.map((s) =>
                                                            s.id === slot.id ? updatedSlot : s
                                                        );
                                                        onUpdate(element.id, {
                                                            bindingContainer: { ...bc, slots: newSlots },
                                                        });
                                                    }
                                                    setEditingSlot(null);
                                                }}
                                                ref={(el) => {
                                                    // 자동 포커스 + 텍스트 전체 선택
                                                    if (el) {
                                                        el.focus();
                                                        const range = document.createRange();
                                                        range.selectNodeContents(el);
                                                        const sel = window.getSelection();
                                                        sel?.removeAllRanges();
                                                        sel?.addRange(range);
                                                    }
                                                }}
                                            >
                                                {slot.content || slot.label || slot.bindingKey}
                                            </div>
                                        </foreignObject>
                                    ) : (
                                        /* 표시 모드: wrap이면 foreignObject, 아니면 SVG text */
                                        autoFitMode === "wrap" ? (
                                            <foreignObject
                                                x={frameAbsX}
                                                y={frameAbsY}
                                                width={frameW}
                                                height={frameH}
                                                pointerEvents="none"
                                            >
                                                <div
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                        fontSize: slot.fontSize,
                                                        fontFamily: slot.fontFamily,
                                                        fontWeight: slot.fontWeight,
                                                        color: slot.color,
                                                        textAlign: slot.textAlign,
                                                        overflow: "hidden",
                                                        wordWrap: "break-word",
                                                        whiteSpace: "pre-wrap",
                                                        lineHeight: 1.2,
                                                        display: "flex",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    {slot.content || slot.label || slot.bindingKey}
                                                </div>
                                            </foreignObject>
                                        ) : (
                                            <text
                                                x={slot.textAlign === "center" ? frameAbsX + frameW / 2 : slot.textAlign === "right" ? frameAbsX + frameW : frameAbsX}
                                                y={frameAbsY + frameH / 2}
                                                fill={slot.color}
                                                fontSize={slot.fontSize}
                                                fontFamily={slot.fontFamily}
                                                fontWeight={slot.fontWeight}
                                                textAnchor={slot.textAlign === "center" ? "middle" : slot.textAlign === "right" ? "end" : "start"}
                                                dominantBaseline="central"
                                                pointerEvents="none"
                                            >
                                                {slot.content || slot.label || slot.bindingKey}
                                            </text>
                                        )
                                    )}
                                </g>
                            );
                        })}
                        {/* 바인딩 컨테이너 표시 아이콘 */}
                        {element.bindingContainer?.enabled && (
                            <text
                                x={element.x + element.width - 16}
                                y={element.y + 14}
                                fontSize={12}
                                fill="#60a5fa"
                                pointerEvents="none"
                            >🔗</text>
                        )}
                        {/* 선택 테두리 (라벨 포함 안함) */}
                        {renderSelectionBorder()}
                        {/* 요소 이름 라벨 */}
                        {renderLabel()}
                        {isSelected && renderResizeHandles(element)}
                        {/* 🆕 Text Frame 리사이즈 핸들 (선택 + 바인딩 활성 시) */}
                        {isSelected && renderTextFrameHandles(element)}
                    </g>
                );
            }

            case "ellipse":
                return (
                    <g key={element.id} {...commonProps}>
                        {renderVisualEffectsDefs()}
                        <ellipse
                            cx={element.x + element.width / 2}
                            cy={element.y + element.height / 2}
                            rx={element.width / 2}
                            ry={element.height / 2}
                            fill={getFillStyle(element)}
                            fillOpacity={getFillOpacity(element)}
                            stroke={element.stroke?.color || "#1e40af"}
                            strokeWidth={element.stroke?.width ?? 2}
                            strokeDasharray={strokeDasharray}
                            strokeOpacity={strokeOpacity}
                            filter={effectsFilterUrl}
                        />
                        {renderSelectionBorder()}
                        {renderLabel()}
                        {isSelected && renderResizeHandles(element)}
                    </g>
                );

            case "text": {
                // 그림자 필터 — 도형과 공용 renderVisualEffectsDefs 사용

                return (
                    <g key={element.id} {...commonProps}>
                        {renderVisualEffectsDefs()}
                        {(() => {
                            // 수직 정렬 계산
                            const vAlign = (element as any).verticalAlign || "top";
                            const fs = element.fontSize || 24;
                            let textY: number;
                            let dominantBaseline: "auto" | "central" | "text-after-edge";
                            if (vAlign === "middle") {
                                textY = element.y + element.height / 2;
                                dominantBaseline = "central";
                            } else if (vAlign === "bottom") {
                                textY = element.y + element.height;
                                dominantBaseline = "text-after-edge";
                            } else {
                                // top (기본)
                                textY = element.y + fs;
                                dominantBaseline = "auto";
                            }

                            return (
                                <text
                                    x={element.x + (element.textAlign === "center" ? element.width / 2 : element.textAlign === "right" ? element.width : 0)}
                                    y={textY}
                                    fill={element.fill?.color || "#ffffff"}
                                    stroke={element.textStrokeEnabled ? (element.stroke?.color || "#000000") : undefined}
                                    strokeWidth={element.textStrokeEnabled ? (element.stroke?.width || 2) : undefined}
                                    fontFamily={element.fontFamily || "Noto Sans KR"}
                                    fontSize={fs}
                                    fontWeight={element.fontWeight || 400}
                                    textAnchor={element.textAlign === "center" ? "middle" : element.textAlign === "right" ? "end" : "start"}
                                    dominantBaseline={dominantBaseline}
                                    filter={effectsFilterUrl}
                                    style={{
                                        letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : undefined,
                                        textTransform: element.textCase === "none" ? undefined : element.textCase,
                                        textDecoration: element.textDecoration === "none" ? undefined : element.textDecoration,
                                        paintOrder: "stroke fill",
                                        // 🆕 고정폭 숫자: 데이터 숫자가 변할 때 텍스트 떨림(Jitter) 방지
                                        fontVariantNumeric: element.tabularNums ? "tabular-nums" : undefined,
                                    }}
                                >
                                    {element.content || "텍스트"}
                                </text>
                            );
                        })()}
                        {renderSelectionBorder()}
                        {renderLabel()}
                        {isSelected && renderResizeHandles(element)}
                    </g>
                );
            }

            case "image": {
                // 이미지 요소 렌더링 (일반 이미지 + AI SVG 포함)
                // ■ Why 별도 case가 필요한가?
                //   이미지는 SVG <image> 태그로 렌더링되며, objectFit에 따라
                //   preserveAspectRatio 속성이 달라진다.
                //   rect/text와 다른 렌더링 로직이므로 독립된 분기가 필수.
                const imgSrc = element.src || "";
                return (
                    <g key={element.id} {...commonProps}>
                        {renderVisualEffectsDefs()}
                        {/* 이미지가 없을 때 플레이스홀더 표시 */}
                        {!imgSrc ? (
                            <>
                                <rect
                                    x={element.x}
                                    y={element.y}
                                    width={element.width}
                                    height={element.height}
                                    fill="var(--app-bg-elevated, #1a1a2e)"
                                    stroke="var(--border-default, #333)"
                                    strokeWidth={1}
                                    strokeDasharray="6 3"
                                    rx={4}
                                />
                                <text
                                    x={element.x + element.width / 2}
                                    y={element.y + element.height / 2}
                                    fill="var(--text-tertiary, #666)"
                                    fontSize={14}
                                    fontFamily="sans-serif"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    pointerEvents="none"
                                >
                                    🖼️ 이미지 없음
                                </text>
                            </>
                        ) : (
                            <image
                                x={element.x}
                                y={element.y}
                                width={element.width}
                                height={element.height}
                                href={imgSrc}
                                preserveAspectRatio={
                                    element.objectFit === "cover" ? "xMidYMid slice" :
                                        element.objectFit === "fill" ? "none" :
                                            "xMidYMid meet"  // contain (기본값)
                                }
                                filter={effectsFilterUrl}
                            />
                        )}
                        {renderSelectionBorder()}
                        {renderLabel()}
                        {isSelected && renderResizeHandles(element)}
                    </g>
                );
            }

            case "html_plugin": {
                // ■ Why foreignObject + iframe?
                //   SVG 캔버스 내부에서 HTML/JS 플러그인을 라이브로 렌더링하기 위해
                //   foreignObject로 HTML 영역을 확보한 뒤 iframe(srcdoc)으로 실행.
                //   iframe은 pointerEvents:none으로 설정하여 드래그/리사이즈는
                //   외부 SVG 핸들을 통해 처리되도록 함.
                if (!element.pluginSourceCode) {
                    // 소스 코드가 없으면 플레이스홀더 표시
                    return (
                        <g key={element.id} {...commonProps}>
                            <rect
                                x={element.x}
                                y={element.y}
                                width={element.width}
                                height={element.height}
                                fill="rgba(99,102,241,0.1)"
                                stroke="#818cf8"
                                strokeWidth={1}
                                strokeDasharray="6 3"
                                rx={4}
                            />
                            <text
                                x={element.x + element.width / 2}
                                y={element.y + element.height / 2}
                                fill="#818cf8"
                                fontSize={14}
                                fontFamily="sans-serif"
                                textAnchor="middle"
                                dominantBaseline="central"
                                pointerEvents="none"
                            >
                                🔌 오버레이 연결 없음
                            </text>
                            {renderSelectionBorder()}
                            {renderLabel()}
                            {isSelected && renderResizeHandles(element)}
                        </g>
                    );
                }

                const pluginSrc = element.pluginSourceCode;
                // ■ Why SVG 내부에는 플레이스홀더만?
                //   SVG foreignObject 내부의 iframe은 브라우저 렌더링 엔진 제약으로
                //   투명 배경이 불가능 (항상 하얀 배경 렌더링).
                //   실제 iframe은 SVG 밖 HTML 오버레이로 렌더링 (아래 return문 참조).
                //   여기서는 드래그/리사이즈용 투명 영역 + 선택 핸들만 표시.
                void pluginSrc; // lint: 변수는 아래 HTML 오버레이에서 사용
                return (
                    <g key={element.id} {...commonProps}>
                        {/* 드래그 대상 투명 영역 + 점선 테두리 */}
                        <rect
                            x={element.x}
                            y={element.y}
                            width={element.width}
                            height={element.height}
                            fill="transparent"
                            stroke="#818cf8"
                            strokeWidth={1}
                            strokeDasharray="4 2"
                            strokeOpacity={0.4}
                            rx={2}
                        />
                        {renderSelectionBorder()}
                        {renderLabel()}
                        {isSelected && renderResizeHandles(element)}
                    </g>
                );
            }

            case "group":
                // 그룹 바운딩 박스 (투명, 선택용) - 리사이즈 없음
                return (
                    <g key={element.id} {...commonProps}>
                        <rect
                            x={element.x}
                            y={element.y}
                            width={element.width}
                            height={element.height}
                            fill="transparent"
                            stroke="transparent"
                            strokeWidth={0}
                        />
                        {renderSelectionBorder()}
                        {renderLabel()}
                        {/* 그룹은 리사이즈 핸들 없음 */}
                    </g>
                );

            default:
                return null;
        }
    };

    // 🆕 Text Frame 리사이즈 핸들 렌더링 (파란 원형 핸들 — Shape 흰 사각형 핸들과 시각적 구별)
    // Shape가 선택되고 bindingContainer가 활성화된 경우에만 표시
    const renderTextFrameHandles = (element: GraphicElement) => {
        if (!element.bindingContainer?.enabled || element.bindingContainer.slots.length === 0) return null;
        const slot = element.bindingContainer.slots[0];
        const frameAbsX = element.x + slot.frameX;
        const frameAbsY = element.y + slot.frameY;
        const fw = slot.frameWidth;
        const fh = slot.frameHeight;
        const r = 5; // 핸들 반경 (px)

        const handles = [
            { handle: "nw", cx: frameAbsX,        cy: frameAbsY,        cursor: "nwse-resize" },
            { handle: "n",  cx: frameAbsX + fw/2,  cy: frameAbsY,        cursor: "ns-resize"   },
            { handle: "ne", cx: frameAbsX + fw,    cy: frameAbsY,        cursor: "nesw-resize" },
            { handle: "e",  cx: frameAbsX + fw,    cy: frameAbsY + fh/2, cursor: "ew-resize"   },
            { handle: "se", cx: frameAbsX + fw,    cy: frameAbsY + fh,   cursor: "nwse-resize" },
            { handle: "s",  cx: frameAbsX + fw/2,  cy: frameAbsY + fh,   cursor: "ns-resize"   },
            { handle: "sw", cx: frameAbsX,         cy: frameAbsY + fh,   cursor: "nesw-resize" },
            { handle: "w",  cx: frameAbsX,         cy: frameAbsY + fh/2, cursor: "ew-resize"   },
        ];

        return (
            <g key={`tf-handles-${slot.id}`}>
                {handles.map((h) => (
                    <circle
                        key={h.handle}
                        cx={h.cx}
                        cy={h.cy}
                        r={r}
                        fill="#60a5fa"
                        stroke="#1e3a8a"
                        strokeWidth={1}
                        style={{ cursor: h.cursor }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            const coords = getCanvasCoords(e as unknown as MouseEvent);
                            setFrameResizing({
                                elementId: element.id,
                                slotId: slot.id,
                                handle: h.handle,
                                startX: coords.x,
                                startY: coords.y,
                                frameStartX: slot.frameX,
                                frameStartY: slot.frameY,
                                frameStartW: slot.frameWidth,
                                frameStartH: slot.frameHeight,
                                shapeW: element.width,
                                shapeH: element.height,
                            });
                        }}
                    />
                ))}
            </g>
        );
    };

    // 리사이즈 핸들 렌더링
    const renderResizeHandles = (element: GraphicElement) => {
        const handleSize = 8;
        const handles = [
            { x: element.x - handleSize / 2, y: element.y - handleSize / 2, cursor: "nwse-resize", position: "top-left" },
            { x: element.x + element.width - handleSize / 2, y: element.y - handleSize / 2, cursor: "nesw-resize", position: "top-right" },
            { x: element.x - handleSize / 2, y: element.y + element.height - handleSize / 2, cursor: "nesw-resize", position: "bottom-left" },
            { x: element.x + element.width - handleSize / 2, y: element.y + element.height - handleSize / 2, cursor: "nwse-resize", position: "bottom-right" },
        ];

        return handles.map((h) => (
            <rect
                key={h.position}
                x={h.x}
                y={h.y}
                width={handleSize}
                height={handleSize}
                className={`resize-handle ${h.position}`}
                style={{ cursor: h.cursor }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    const coords = getCanvasCoords(e as unknown as MouseEvent);
                    setResizing({
                        id: element.id,
                        handle: h.position,
                        startX: coords.x,
                        startY: coords.y,
                        elStartX: element.x,
                        elStartY: element.y,
                        elStartWidth: element.width,
                        elStartHeight: element.height,
                    });
                }}
            />
        ));
    };

    // zIndex 순으로 정렬
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

    return (
        <div
            className="canvas-container"
            style={{ width: displayWidth, height: displayHeight }}
        >
            <svg
                ref={svgRef}
                className="canvas-svg"
                width={displayWidth}
                height={displayHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* 배경 - 클릭 시 선택 해제 */}
                <rect
                    x={0}
                    y={0}
                    width={canvasWidth}
                    height={canvasHeight}
                    fill="#1a1a1a"
                    onClick={() => onSelect([])}
                    style={{ cursor: "default" }}
                />

                {/* 그라데이션 정의 */}
                {renderGradientDefs()}

                {/* 그리드 오버레이 */}
                <GridOverlay zones={zones} canvasWidth={canvasWidth} canvasHeight={canvasHeight} />

                {/* 중심선 가이드 */}
                <line
                    x1={canvasWidth / 2}
                    y1={0}
                    x2={canvasWidth / 2}
                    y2={canvasHeight}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={1}
                    strokeDasharray="8 8"
                />
                <line
                    x1={0}
                    y1={canvasHeight / 2}
                    x2={canvasWidth}
                    y2={canvasHeight / 2}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={1}
                    strokeDasharray="8 8"
                />

                {/* 스냅 가이드라인 (드래그 중에만 표시) */}
                {snapGuides.vertical.map((x, i) => (
                    <line
                        key={`snap-v-${i}`}
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={canvasHeight}
                        stroke="#FF00FF"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                        pointerEvents="none"
                    />
                ))}
                {snapGuides.horizontal.map((y, i) => (
                    <line
                        key={`snap-h-${i}`}
                        x1={0}
                        y1={y}
                        x2={canvasWidth}
                        y2={y}
                        stroke="#FF00FF"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                        pointerEvents="none"
                    />
                ))}

                {/* 요소들 */}
                {sortedElements.map(renderElement)}
            </svg>

            {/* ■ HTML 플러그인 오버레이 레이어
                 SVG foreignObject 내부에서는 iframe 투명 배경이 불가능하므로,
                 SVG 밖에 absolute div로 iframe을 렌더링하고 SVG 좌표계와 동기화.
                 viewBox 비율(displayWidth/canvasWidth)로 SVG→CSS 좌표 변환. */}
            {sortedElements
                .filter((el) => el.type === "html_plugin" && el.visible && el.pluginSourceCode)
                .map((el) => {
                    const src = el.pluginSourceCode!;
                    const scaleRatio = displayWidth / canvasWidth;
                    // 공통 모듈로 srcdoc 생성 — autoShow=true (에디터 내 프리뷰)
                    const srcdoc = buildPluginSrcdoc({
                        html: src.html,
                        css: src.css,
                        js: src.js,
                        width: el.width,
                        height: el.height,
                        autoShow: true,
                    });

                    return (
                        <div
                            key={`plugin-overlay-${el.id}`}
                            style={{
                                position: "absolute",
                                left: el.x * scaleRatio,
                                top: el.y * scaleRatio,
                                width: el.width * scaleRatio,
                                height: el.height * scaleRatio,
                                overflow: "hidden",
                                pointerEvents: "none",
                                opacity: el.opacity,
                                transform: `rotate(${el.rotation}deg)`,
                                transformOrigin: "top left",
                            }}
                        >
                            <iframe
                                srcDoc={srcdoc}
                                sandbox="allow-scripts allow-same-origin"
                                data-plugin-id={el.pluginTemplateId}
                                // @ts-expect-error — allowTransparency is deprecated but needed for iframe bg transparency
                                allowTransparency="true"
                                style={{
                                    width: `${el.width}px`,
                                    height: `${el.height}px`,
                                    border: "none",
                                    background: "transparent",
                                    colorScheme: "normal",
                                    transformOrigin: "top left",
                                    transform: `scale(${scaleRatio})`,
                                    pointerEvents: "none",
                                }}
                                title={el.name}
                            />
                        </div>
                    );
                })}
        </div>
    );
}
