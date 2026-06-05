/**
 * OverlayEditor — 오버레이 그래픽 요소 편집기
 * 좌: 실시간 프리뷰 (GraphicPreviewRenderer)
 * 우: 요소 리스트 + 속성 패널 (텍스트, 색상, 크기, 위치)
 */

import { useState, useCallback } from "react";
import { X, Save, Loader2, Type, Square, Circle, Image } from "lucide-react";
import { GraphicPreviewRenderer } from "../GraphicPreviewRenderer";
import type { GraphicElement } from "../GraphicPreviewRenderer";

// ─── Props ───────────────────────────────────────────────────────

interface OverlayEditorProps {
    /** 오버레이 이름 */
    name: string;
    /** 편집 대상 그래픽 요소 배열 */
    elements: GraphicElement[];
    /** 캔버스 너비 (기본 1920) */
    canvasWidth?: number;
    /** 캔버스 높이 (기본 1080) */
    canvasHeight?: number;
    /** 저장 콜백 */
    onSave: (elements: GraphicElement[]) => Promise<void>;
    /** 닫기 콜백 */
    onClose: () => void;
}

// 요소 타입 아이콘 매핑
const TYPE_ICONS: Record<string, typeof Type> = {
    text: Type,
    rect: Square,
    ellipse: Circle,
    image: Image,
    group: Square,
};

// 요소 타입 한글명
const TYPE_LABELS: Record<string, string> = {
    text: "텍스트",
    rect: "사각형",
    ellipse: "타원",
    image: "이미지",
    group: "그룹",
};

export function OverlayEditor({
    name,
    elements: initialElements,
    canvasWidth = 1920,
    canvasHeight = 1080,
    onSave,
    onClose,
}: OverlayEditorProps) {
    // 편집 중인 요소 배열 (로컬 상태)
    const [elements, setElements] = useState<GraphicElement[]>(
        () => JSON.parse(JSON.stringify(initialElements)),
    );
    // 선택된 요소 ID
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // 저장 중 플래그
    const [saving, setSaving] = useState(false);
    // 변경 플래그
    const [dirty, setDirty] = useState(false);

    // 선택된 요소
    const selectedElement = selectedId
        ? elements.find((e) => e.id === selectedId) ?? null
        : null;

    // 요소 속성 업데이트 헬퍼
    const updateElement = useCallback(
        (id: string, updates: Partial<GraphicElement>) => {
            setElements((prev) =>
                prev.map((el) => (el.id === id ? { ...el, ...updates } : el)),
            );
            setDirty(true);
        },
        [],
    );

    // 저장 핸들러
    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await onSave(elements);
            setDirty(false);
        } catch (err) {
            console.error("[OverlayEditor] 저장 실패:", err);
            alert("저장에 실패했습니다.");
        } finally {
            setSaving(false);
        }
    }, [elements, onSave]);

    // 편집 가능한 요소만 필터 (group 제외)
    const editableElements = elements.filter((e) => e.type !== "group");

    return (
        <div className="overlay-editor-backdrop" onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="overlay-editor-modal" onClick={(e) => e.stopPropagation()}>
                {/* 헤더 */}
                <div className="overlay-editor-header">
                    <h3>
                        <Square size={16} /> 오버레이 편집 — {name}
                    </h3>
                    <button className="overlay-editor-close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                {/* 본문 */}
                <div className="overlay-editor-body">
                    {/* 좌: 프리뷰 */}
                    <div className="overlay-editor-preview">
                        <div className="overlay-editor-preview-canvas">
                            <GraphicPreviewRenderer
                                elements={elements}
                                canvasWidth={canvasWidth}
                                canvasHeight={canvasHeight}
                            />
                        </div>
                    </div>

                    {/* 우: 속성 패널 */}
                    <div className="overlay-editor-props">
                        {/* 요소 리스트 */}
                        <div className="editor-props-section">
                            <div className="editor-props-title">
                                요소 ({editableElements.length})
                            </div>
                            <div className="editor-element-list">
                                {editableElements.map((el) => {
                                    const Icon = TYPE_ICONS[el.type] || Square;
                                    return (
                                        <div
                                            key={el.id}
                                            className={`editor-element-item ${selectedId === el.id ? "selected" : ""}`}
                                            onClick={() => setSelectedId(el.id)}
                                        >
                                            <span className="editor-element-type">
                                                <Icon size={10} style={{ verticalAlign: "middle" }} />{" "}
                                                {TYPE_LABELS[el.type] || el.type}
                                            </span>
                                            <span className="editor-element-name">
                                                {el.name || el.id}
                                            </span>
                                        </div>
                                    );
                                })}
                                {editableElements.length === 0 && (
                                    <div style={{ color: "#475569", fontSize: 12, padding: 8 }}>
                                        편집 가능한 요소가 없습니다.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 선택된 요소 속성 편집 */}
                        {selectedElement && (
                            <>
                                {/* 기본 속성 */}
                                <div className="editor-props-section">
                                    <div className="editor-props-title">기본 속성</div>
                                    <div className="editor-props-field">
                                        <label>이름</label>
                                        <input
                                            value={selectedElement.name || ""}
                                            onChange={(e) =>
                                                updateElement(selectedElement.id, { name: e.target.value })
                                            }
                                        />
                                    </div>
                                </div>

                                {/* 텍스트 속성 */}
                                {selectedElement.type === "text" && (
                                    <div className="editor-props-section">
                                        <div className="editor-props-title">텍스트</div>
                                        <div className="editor-props-field">
                                            <label>내용</label>
                                            <textarea
                                                value={selectedElement.content || ""}
                                                onChange={(e) =>
                                                    updateElement(selectedElement.id, { content: e.target.value })
                                                }
                                            />
                                        </div>
                                        <div className="editor-props-row">
                                            <div className="editor-props-field">
                                                <label>폰트</label>
                                                <input
                                                    value={selectedElement.fontFamily || ""}
                                                    onChange={(e) =>
                                                        updateElement(selectedElement.id, {
                                                            fontFamily: e.target.value,
                                                        })
                                                    }
                                                    placeholder="예: Arial"
                                                />
                                            </div>
                                            <div className="editor-props-field">
                                                <label>크기</label>
                                                <input
                                                    type="number"
                                                    value={selectedElement.fontSize || 16}
                                                    onChange={(e) =>
                                                        updateElement(selectedElement.id, {
                                                            fontSize: parseInt(e.target.value, 10) || 16,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <div className="editor-props-row">
                                            <div className="editor-props-field">
                                                <label>굵기</label>
                                                <select
                                                    value={selectedElement.fontWeight || 400}
                                                    onChange={(e) =>
                                                        updateElement(selectedElement.id, {
                                                            fontWeight: parseInt(e.target.value, 10),
                                                        })
                                                    }
                                                >
                                                    <option value={300}>Light (300)</option>
                                                    <option value={400}>Regular (400)</option>
                                                    <option value={500}>Medium (500)</option>
                                                    <option value={600}>SemiBold (600)</option>
                                                    <option value={700}>Bold (700)</option>
                                                    <option value={800}>ExtraBold (800)</option>
                                                </select>
                                            </div>
                                            <div className="editor-props-field">
                                                <label>정렬</label>
                                                <select
                                                    value={selectedElement.textAlign || "left"}
                                                    onChange={(e) =>
                                                        updateElement(selectedElement.id, {
                                                            textAlign: e.target.value as "left" | "center" | "right",
                                                        })
                                                    }
                                                >
                                                    <option value="left">좌측</option>
                                                    <option value="center">가운데</option>
                                                    <option value="right">우측</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 색상/스타일 속성 */}
                                <div className="editor-props-section">
                                    <div className="editor-props-title">색상</div>
                                    <div className="editor-props-row">
                                        <div className="editor-props-field">
                                            <label>채우기</label>
                                            <input
                                                type="color"
                                                value={selectedElement.fill?.color || "#ffffff"}
                                                onChange={(e) =>
                                                    updateElement(selectedElement.id, {
                                                        fill: { ...selectedElement.fill, color: e.target.value },
                                                    })
                                                }
                                            />
                                        </div>
                                        {selectedElement.type !== "text" && (
                                            <div className="editor-props-field">
                                                <label>테두리</label>
                                                <input
                                                    type="color"
                                                    value={selectedElement.stroke?.color || "#000000"}
                                                    onChange={(e) =>
                                                        updateElement(selectedElement.id, {
                                                            stroke: { ...selectedElement.stroke, color: e.target.value },
                                                        })
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className="editor-props-field">
                                        <label>불투명도 ({Math.round((selectedElement.opacity ?? 1) * 100)}%)</label>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={selectedElement.opacity ?? 1}
                                            onChange={(e) =>
                                                updateElement(selectedElement.id, {
                                                    opacity: parseFloat(e.target.value),
                                                })
                                            }
                                            style={{ width: "100%" }}
                                        />
                                    </div>
                                </div>

                                {/* 위치/크기 */}
                                <div className="editor-props-section">
                                    <div className="editor-props-title">위치 & 크기</div>
                                    <div className="editor-props-row">
                                        <div className="editor-props-field">
                                            <label>X</label>
                                            <input
                                                type="number"
                                                value={selectedElement.x}
                                                onChange={(e) =>
                                                    updateElement(selectedElement.id, {
                                                        x: parseFloat(e.target.value) || 0,
                                                    })
                                                }
                                            />
                                        </div>
                                        <div className="editor-props-field">
                                            <label>Y</label>
                                            <input
                                                type="number"
                                                value={selectedElement.y}
                                                onChange={(e) =>
                                                    updateElement(selectedElement.id, {
                                                        y: parseFloat(e.target.value) || 0,
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="editor-props-row">
                                        <div className="editor-props-field">
                                            <label>너비</label>
                                            <input
                                                type="number"
                                                value={selectedElement.width}
                                                onChange={(e) =>
                                                    updateElement(selectedElement.id, {
                                                        width: parseFloat(e.target.value) || 100,
                                                    })
                                                }
                                            />
                                        </div>
                                        <div className="editor-props-field">
                                            <label>높이</label>
                                            <input
                                                type="number"
                                                value={selectedElement.height}
                                                onChange={(e) =>
                                                    updateElement(selectedElement.id, {
                                                        height: parseFloat(e.target.value) || 100,
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="editor-props-field">
                                        <label>회전 (°)</label>
                                        <input
                                            type="number"
                                            value={selectedElement.rotation || 0}
                                            onChange={(e) =>
                                                updateElement(selectedElement.id, {
                                                    rotation: parseFloat(e.target.value) || 0,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {!selectedElement && editableElements.length > 0 && (
                            <div style={{ color: "#475569", fontSize: 12, padding: 16, textAlign: "center" }}>
                                좌측 목록에서 요소를 선택하세요
                            </div>
                        )}
                    </div>
                </div>

                {/* 푸터 */}
                <div className="overlay-editor-footer">
                    <button className="btn-modal-cancel" onClick={onClose}>
                        취소
                    </button>
                    <button
                        className="btn-modal-save"
                        onClick={handleSave}
                        disabled={saving || !dirty}
                    >
                        {saving ? (
                            <>
                                <Loader2 size={14} className="wizard-loading-spinner" style={{ width: 14, height: 14 }} /> 저장 중...
                            </>
                        ) : (
                            <>
                                <Save size={14} /> 변경사항 저장
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
