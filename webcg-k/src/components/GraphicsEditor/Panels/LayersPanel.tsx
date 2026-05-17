/**
 * Layers Panel - 레이어 목록 패널 (트리 구조 + 라인 연결)
 */

import { useState } from "react";
import { Square, Circle, Type, Image, Eye, EyeOff, Lock, Unlock, Trash2, Layers, ChevronRight, ChevronDown } from "lucide-react";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";

interface LayersPanelProps {
    elements: GraphicElement[];
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onDelete: (ids: string[]) => void;
}

// 타입별 아이콘
const typeIcons: Record<GraphicElement["type"], typeof Square> = {
    rect: Square,
    ellipse: Circle,
    text: Type,
    image: Image,
    group: Layers,
    html_plugin: Layers, // 또는 AppWindow 아이콘 사용 가능
};

// 인덴트 라인 색상
const lineColors = [
    "rgba(255, 215, 0, 0.6)",   // 노란색
    "rgba(139, 92, 246, 0.6)",  // 보라색
    "rgba(34, 211, 238, 0.6)",  // 시안
    "rgba(249, 115, 22, 0.6)",  // 주황
    "rgba(236, 72, 153, 0.6)",  // 핑크
];

export function LayersPanel({
    elements,
    selectedIds,
    onSelect,
    onUpdate,
    onReorder,
    onDelete,
}: LayersPanelProps) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    // 그룹 펼침/접힘 토글
    const toggleGroup = (groupId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupId)) {
            newExpanded.delete(groupId);
        } else {
            newExpanded.add(groupId);
        }
        setExpandedGroups(newExpanded);
    };

    // 드래그 시작
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = "move";
    };

    // 드래그 오버
    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (draggedId && draggedId !== id) {
            setDragOverId(id);
        }
    };

    // 드래그 종료
    const handleDragEnd = () => {
        setDraggedId(null);
        setDragOverId(null);
    };

    // 드롭 - z-index 순서 변경
    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        // 현재 요소들의 인덱스 찾기 (zIndex 기준 정렬된 배열에서)
        const sortedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);
        const fromIndex = sortedElements.findIndex((el) => el.id === draggedId);
        const toIndex = sortedElements.findIndex((el) => el.id === targetId);

        if (fromIndex !== -1 && toIndex !== -1) {
            onReorder(fromIndex, toIndex);
        }

        handleDragEnd();
    };

    const handleClick = (id: string, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
            if (selectedIds.includes(id)) {
                onSelect(selectedIds.filter((sid) => sid !== id));
            } else {
                onSelect([...selectedIds, id]);
            }
        } else {
            onSelect([id]);
        }
    };

    // 트리 구조: 최상위 요소만 (parentId가 null)
    const rootElements = elements
        .filter((el) => !el.parentId)
        .sort((a, b) => b.zIndex - a.zIndex);

    // 자식 요소 찾기
    const getChildren = (parentId: string) => {
        return elements
            .filter((el) => el.parentId === parentId)
            .sort((a, b) => b.zIndex - a.zIndex);
    };

    // 레이어 아이템 렌더링
    const renderLayerItem = (el: GraphicElement, depth: number = 0, isLast: boolean = false) => {
        const Icon = typeIcons[el.type] || Square;
        const isSelected = selectedIds.includes(el.id);
        const isGroup = el.type === "group";
        const isExpanded = expandedGroups.has(el.id);
        const children = isGroup ? getChildren(el.id) : [];

        return (
            <div key={el.id} style={{ position: "relative" }}>
                {/* 수직 연결 라인 */}
                {depth > 0 && (
                    <div
                        style={{
                            position: "absolute",
                            left: `${(depth - 1) * 12 + 10}px`,
                            top: 0,
                            bottom: isLast ? "50%" : 0,
                            width: "1px",
                            background: lineColors[(depth - 1) % lineColors.length],
                        }}
                    />
                )}

                {/* 수평 연결 라인 */}
                {depth > 0 && (
                    <div
                        style={{
                            position: "absolute",
                            left: `${(depth - 1) * 12 + 10}px`,
                            top: "50%",
                            width: "8px",
                            height: "1px",
                            background: lineColors[(depth - 1) % lineColors.length],
                        }}
                    />
                )}

                <div
                    className={`layer-item ${isSelected ? "selected" : ""} ${draggedId === el.id ? "dragging" : ""} ${dragOverId === el.id ? "drag-over" : ""}`}
                    onClick={(e) => handleClick(el.id, e)}
                    draggable={!el.parentId} // 최상위 요소만 드래그 가능
                    onDragStart={(e) => handleDragStart(e, el.id)}
                    onDragOver={(e) => handleDragOver(e, el.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, el.id)}
                    style={{
                        paddingLeft: `${4 + depth * 12}px`,
                    }}
                >
                    {/* 그룹 펼침/접힘 아이콘 */}
                    {isGroup ? (
                        <button
                            type="button"
                            onClick={(e) => toggleGroup(el.id, e)}
                            style={{
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                color: "inherit",
                                marginRight: "2px",
                            }}
                        >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                    ) : (
                        <span style={{ width: 14, marginRight: "2px" }} />
                    )}

                    <Icon size={14} className="layer-icon" />
                    <span className="layer-name" title={el.type === "text" && el.content ? el.content : el.name}>
                        {(() => {
                            // 텍스트 요소는 content를 라벨로 표시
                            const label = el.type === "text" && el.content ? el.content : el.name;
                            // 15자 초과시 ...으로 줄임
                            return label.length > 15 ? label.slice(0, 15) + "..." : label;
                        })()}
                    </span>

                    {isGroup && children.length > 0 && (
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginLeft: "4px" }}>
                            ({children.length})
                        </span>
                    )}

                    <div className="layer-actions">
                        <button
                            type="button"
                            className="layer-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdate(el.id, { visible: !el.visible });
                            }}
                            title={el.visible ? "숨기기" : "보이기"}
                        >
                            {el.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                            type="button"
                            className="layer-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdate(el.id, { locked: !el.locked });
                            }}
                            title={el.locked ? "잠금 해제" : "잠금"}
                        >
                            {el.locked ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                        <button
                            type="button"
                            className="layer-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete([el.id]);
                            }}
                            title="삭제"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                {/* 자식 요소들 */}
                {isGroup && isExpanded && (
                    <div style={{ position: "relative" }}>
                        {children.map((child, idx) =>
                            renderLayerItem(child, depth + 1, idx === children.length - 1)
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="layers-panel">
            <div className="layers-panel-header">
                <span className="layers-panel-title">레이어</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {elements.length}개
                </span>
            </div>

            <div className="layers-list">
                {rootElements.length === 0 ? (
                    <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                        요소가 없습니다
                    </div>
                ) : (
                    rootElements.map((el, idx) => renderLayerItem(el, 0, idx === rootElements.length - 1))
                )}
            </div>

            {/* 단축키 가이드 */}
            <div className="shortcuts-guide">
                <div className="shortcuts-guide-title">⌨️ 단축키</div>
                <div className="shortcuts-guide-list">
                    <div className="shortcut-item">
                        <kbd>Ctrl</kbd>+<kbd>D</kbd>
                        <span>도형 복제</span>
                    </div>
                    <div className="shortcut-item">
                        <kbd>Ctrl</kbd>+<kbd>G</kbd>
                        <span>그룹화</span>
                    </div>
                    <div className="shortcut-item">
                        <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>
                        <span>그룹 해제</span>
                    </div>
                    <div className="shortcut-item">
                        <kbd>Ctrl</kbd>+<kbd>Z</kbd>
                        <span>실행 취소</span>
                    </div>
                    <div className="shortcut-item">
                        <kbd>Ctrl</kbd>+<kbd>Y</kbd>
                        <span>다시 실행</span>
                    </div>
                    <div className="shortcut-item">
                        <kbd>Delete</kbd>
                        <span>선택 삭제</span>
                    </div>
                    <div className="shortcut-item">
                        <kbd>Ctrl</kbd>+클릭
                        <span>다중 선택</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
