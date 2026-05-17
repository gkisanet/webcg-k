/**
 * Toolbar Panel - 도구 선택 패널
 */

import { 
    MousePointer2, Square, Circle, Type, Image, Layers,
    AlignStartVertical, AlignCenterVertical, AlignEndVertical,
    AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
    StretchHorizontal, StretchVertical
} from "lucide-react";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";

interface ToolbarPanelProps {
    activeTool: "select" | "rect" | "ellipse" | "text" | "image" | "html_plugin";
    onToolChange: (tool: "select" | "rect" | "ellipse" | "text" | "image" | "html_plugin") => void;
    onAddElement: (type: GraphicElement["type"]) => void;
    selectedCount?: number;
    onAlign?: (alignment: 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right') => void;
    onDistribute?: (type: 'horizontal' | 'vertical') => void;
}

export function ToolbarPanel({ activeTool, onToolChange, onAddElement, selectedCount = 0, onAlign, onDistribute }: ToolbarPanelProps) {
    const tools = [
        { id: "select" as const, icon: MousePointer2, label: "선택" },
        { id: "rect" as const, icon: Square, label: "사각형" },
        { id: "ellipse" as const, icon: Circle, label: "원" },
        { id: "text" as const, icon: Type, label: "텍스트" },
        { id: "image" as const, icon: Image, label: "이미지" },
        { id: "html_plugin" as const, icon: Layers, label: "오버레이" },
    ];

    const handleToolClick = (toolId: typeof activeTool) => {
        if (toolId === "select") {
            onToolChange(toolId);
        } else {
            // 도형 도구 클릭 시 바로 요소 추가
            onAddElement(toolId);
        }
    };

    return (
        <div className="toolbar-panel">
            <div className="toolbar-panel-title">도구</div>
            <div className="toolbar-tools">
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        type="button"
                        className={`tool-btn ${activeTool === tool.id ? "active" : ""}`}
                        onClick={() => handleToolClick(tool.id)}
                        title={tool.label}
                    >
                        <tool.icon size={18} />
                    </button>
                ))}
            </div>
            
            {/* 다중 요소 정렬 툴바 */}
            {selectedCount > 0 && onAlign && onDistribute && (
                <>
                    <div className="toolbar-panel-title" style={{ marginTop: '20px' }}>정렬</div>
                    <div className="toolbar-tools">
                        <button type="button" className="tool-btn" onClick={() => onAlign('left')} title="왼쪽 정렬"><AlignStartVertical size={18} /></button>
                        <button type="button" className="tool-btn" onClick={() => onAlign('center')} title="수평 가운데 정렬"><AlignCenterVertical size={18} /></button>
                        <button type="button" className="tool-btn" onClick={() => onAlign('right')} title="오른쪽 정렬"><AlignEndVertical size={18} /></button>
                        <button type="button" className="tool-btn" onClick={() => onAlign('top')} title="위쪽 정렬"><AlignStartHorizontal size={18} /></button>
                        <button type="button" className="tool-btn" onClick={() => onAlign('middle')} title="수직 가운데 정렬"><AlignCenterHorizontal size={18} /></button>
                        <button type="button" className="tool-btn" onClick={() => onAlign('bottom')} title="아래쪽 정렬"><AlignEndHorizontal size={18} /></button>
                        
                        {selectedCount >= 3 && (
                            <>
                                <button type="button" className="tool-btn" onClick={() => onDistribute('horizontal')} title="가로 간격 동일하게"><StretchHorizontal size={18} /></button>
                                <button type="button" className="tool-btn" onClick={() => onDistribute('vertical')} title="세로 간격 동일하게"><StretchVertical size={18} /></button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
