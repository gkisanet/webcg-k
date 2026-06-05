/**
 * Design Tab — Transform / Fill / Stroke / Corner Radius
 *
 * PropertiesPanel에서 추출된 Design 탭 서브 컴포넌트.
 * 그래픽 요소의 위치, 크기, 회전, 색상(단색/그라데이션), 테두리, 모서리 속성을 편집한다.
 *
 * Why 별도 파일로 분리했는가?
 * → 1,295줄 거대 컴포넌트에서 가장 큰 부분(~550줄)을 차지하는 Design 탭을
 *   독립시켜 HMR 성능 향상 + 관심사 분리.
 *   다른 탭(Text/Animate/CSS)을 수정핫도 이 파일은 재컴파일되지 않는다.
 */

import { useState, useRef, useEffect } from "react";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import { rgbaToHex } from "@/utils/colorUtils";
import { NumberInput } from "@/components/ui/number-input";
import { Plus, ChevronRight, Trash2, RotateCw } from "lucide-react";

// ─── 공통 Props 타입 ─────────────────────────────────────────────
// 모든 탭 컴포넌트가 공유하는 핸들러 시그니처
export interface TabCommonProps {
    element: GraphicElement;
    selectedElements: GraphicElement[];
    isMultiple: boolean;
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
    handleChange: (field: keyof GraphicElement, value: string | number | boolean) => void;
    handleFillChange: (color: string) => void;
    handleStrokeChange: (field: string, value: string | number) => void;
}

interface AngleDialProps {
    angle: number;
    onChange: (angle: number) => void;
}

export function AngleDial({ angle, onChange }: AngleDialProps) {
    const dialRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        updateAngle(e.clientX, e.clientY);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            updateAngle(moveEvent.clientX, moveEvent.clientY);
        };

        const handleMouseUp = () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    };

    const updateAngle = (clientX: number, clientY: number) => {
        const dial = dialRef.current;
        if (!dial) return;
        const rect = dial.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = clientX - centerX;
        const dy = clientY - centerY;
        let newAngle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));
        
        if (newAngle < 0) newAngle += 360;
        onChange(newAngle);
    };

    return (
        <div
            ref={dialRef}
            className="ins-angle-dial"
            onMouseDown={handleMouseDown}
            title="마우스 드래그로 방향 변경 (0-360°)"
        >
            <div className="ins-angle-dial-center" />
            <div
                className="ins-angle-dial-line"
                style={{ transform: `rotate(${angle}deg)` }}
            />
        </div>
    );
}

export function DesignTab({
    element,
    selectedElements,
    isMultiple,
    onUpdate,
    handleChange,
    handleFillChange,
    handleStrokeChange,
}: TabCommonProps) {
    return (
        <>
            {/* Transform */}
            <div className="ins-section">
                <div className="ins-section-title">Transform</div>
                {/* 위치 */}
                <div className="ins-row-2col">
                    <span className="ins-label" title="X 위치">X</span>
                    <NumberInput
                        value={isMultiple ? undefined : Math.round(element.x)}
                        onChange={(val) => handleChange("x", val)}
                        placeholder={isMultiple ? "다중" : undefined}
                    />
                    <span className="ins-label" title="Y 위치">Y</span>
                    <NumberInput
                        value={isMultiple ? undefined : Math.round(element.y)}
                        onChange={(val) => handleChange("y", val)}
                        placeholder={isMultiple ? "다중" : undefined}
                    />
                </div>
                {/* 크기 */}
                <div className="ins-row-2col">
                    <span className="ins-label" title="너비">W</span>
                    <NumberInput
                        value={isMultiple ? undefined : Math.round(element.width)}
                        onChange={(val) => handleChange("width", val)}
                        placeholder={isMultiple ? "다중" : undefined}
                    />
                    <span className="ins-label" title="높이">H</span>
                    <NumberInput
                        value={isMultiple ? undefined : Math.round(element.height)}
                        onChange={(val) => handleChange("height", val)}
                        placeholder={isMultiple ? "다중" : undefined}
                    />
                </div>
                {/* 회전 */}
                <div className="ins-row">
                    <span className="ins-label" title="회전 (도)">회전</span>
                    <div className="ins-color">
                        <button
                            type="button"
                            className="rotation-btn"
                            title="반시계 방향 45°"
                            onClick={() => handleChange("rotation", (element.rotation - 45 + 360) % 360)}
                        >
                            ↺
                        </button>
                        <div className="ins-input-with-unit" style={{ width: "54px" }}>
                            <NumberInput
                                value={isMultiple ? undefined : element.rotation}
                                onChange={(val) => handleChange("rotation", val)}
                                placeholder={isMultiple ? "다중" : undefined}
                            />
                            <span className="ins-input-unit">°</span>
                        </div>
                        <button
                            type="button"
                            className="rotation-btn"
                            title="시계 방향 45°"
                            onClick={() => handleChange("rotation", (element.rotation + 45) % 360)}
                        >
                            ↻
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Image 전용 속성 ─────────────────────────────────── */}
            {element.type === "image" && (
                <div className="ins-section">
                    <div className="ins-section-title">Image</div>
                    {/* 이미지 맞춤 모드 */}
                    <div className="ins-row">
                        <span className="ins-label">맞춤</span>
                        <select
                            className="ins-select"
                            value={element.objectFit || "contain"}
                            onChange={(e) => handleChange("objectFit", e.target.value)}
                        >
                            <option value="contain">Contain (비율 유지)</option>
                            <option value="cover">Cover (꽉 채움)</option>
                            <option value="fill">Fill (늘리기)</option>
                        </select>
                    </div>
                    {/* 이미지 소스 URL (읽기 전용) */}
                    <div className="ins-row">
                        <span className="ins-label">소스</span>
                        <input
                            type="text"
                            className="ins-input"
                            value={element.src || "(없음)"}
                            readOnly
                            title={element.src || "이미지가 연결되지 않았습니다"}
                            style={{ fontSize: "11px", color: "var(--text-tertiary)" }}
                        />
                    </div>
                    {/* 요소 투명도 */}
                    <div className="ins-row-slider">
                        <span className="ins-label">투명도</span>
                        <input
                            type="range"
                            className="ins-slider"
                            min={0}
                            max={100}
                            value={Math.round((element.opacity ?? 1) * 100)}
                            onChange={(e) => handleChange("opacity", parseInt(e.target.value) / 100)}
                        />
                        <span className="ins-value">
                            {Math.round((element.opacity ?? 1) * 100)}%
                        </span>
                    </div>
                </div>
            )}

            {/* ─── Fill (이미지 이외) ─────────────────────────────── */}
            {element.type !== "image" && (
            <div className="ins-section">
                <div className="ins-section-title">Fill</div>
                {/* 타입 선택 */}
                <div className="ins-row">
                    <span className="ins-label">타입</span>
                    <select
                        className="ins-select"
                        value={element.fill?.type || "solid"}
                        onChange={(e) => {
                            const fillType = e.target.value as "solid" | "linear" | "radial" | "none";
                            selectedElements.forEach((el) => {
                                onUpdate(el.id, {
                                    fill: {
                                        ...el.fill,
                                        type: fillType,
                                        gradientStops: fillType !== "solid" && fillType !== "none"
                                            ? el.fill?.gradientStops || [
                                                { offset: 0, color: "#3b82f6" },
                                                { offset: 100, color: "#8b5cf6" }
                                            ]
                                            : undefined
                                    }
                                });
                            });
                        }}
                    >
                        <option value="solid">단색</option>
                        <option value="linear">선형 그라데이션</option>
                        <option value="radial">원형 그라데이션</option>
                        <option value="none">없음</option>
                    </select>
                </div>

                {/* 단색 색상 */}
                {(element.fill?.type === "solid" || !element.fill?.type) && (
                    <div className="ins-row">
                        <span className="ins-label">색</span>
                        <div className="ins-color">
                            <input
                                type="color"
                                className="ins-color-swatch"
                                value={rgbaToHex(element.fill?.color || "#3b82f6")}
                                onChange={(e) => handleFillChange(e.target.value)}
                            />
                            <input
                                type="text"
                                className="ins-input"
                                value={element.fill?.color || "#3b82f6"}
                                onChange={(e) => handleFillChange(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {/* 그라데이션 설정 */}
                {(element.fill?.type === "linear" || element.fill?.type === "radial") && (
                    <>
                        {/* 그라디언트 프리뷰 바 */}
                        <GradientPreviewBar element={element} />

                        {/* 시작 색상 + 투명도 */}
                        <GradientStopRow
                            label="시작"
                            index={0}
                            element={element}
                            selectedElements={selectedElements}
                            onUpdate={onUpdate}
                        />

                        {/* 끝 색상 + 투명도 */}
                        <GradientStopRow
                            label="끝"
                            index={1}
                            element={element}
                            selectedElements={selectedElements}
                            onUpdate={onUpdate}
                        />

                        {/* 각도 다이얼 (linear only) */}
                        {element.fill?.type === "linear" && (
                            <AngleDialSection
                                element={element}
                                selectedElements={selectedElements}
                                onUpdate={onUpdate}
                            />
                        )}
                    </>
                )}

                {/* 전체 투명도 */}
                {element.fill?.type !== "none" && (
                    <div className="ins-row-slider">
                        <span className="ins-label">투명도</span>
                        <input
                            type="range"
                            className="ins-slider"
                            min={0}
                            max={100}
                            value={Math.round((element.fill?.opacity ?? 1) * 100)}
                            onChange={(e) => {
                                selectedElements.forEach((el) => {
                                    onUpdate(el.id, {
                                        fill: { ...el.fill, opacity: parseInt(e.target.value) / 100 }
                                    });
                                });
                            }}
                        />
                        <span className="ins-value">
                            {Math.round((element.fill?.opacity ?? 1) * 100)}%
                        </span>
                    </div>
                )}
            </div>
            )}

            {/* Stroke (이미지/텍스트 이외) */}
            {element.type !== "text" && element.type !== "image" && (
                <div className="ins-section">
                    <div className="ins-section-title">Stroke</div>
                    <div className="ins-row">
                        <span className="ins-label">색</span>
                        <div className="ins-color">
                            <input
                                type="color"
                                className="ins-color-swatch"
                                value={rgbaToHex(element.stroke?.color || "#1e40af")}
                                onChange={(e) => handleStrokeChange("color", e.target.value)}
                            />
                            <input
                                type="text"
                                className="ins-input"
                                value={element.stroke?.color || "#1e40af"}
                                onChange={(e) => handleStrokeChange("color", e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="ins-row">
                        <span className="ins-label">Width</span>
                        <NumberInput
                            value={element.stroke?.width ?? 2}
                            onChange={(val) => handleStrokeChange("width", val)}
                            min={0}
                        />
                    </div>
                    {/* 🆕 Stroke 스타일: Solid / Dashed / Dotted */}
                    {/* Why: Stroke 인터페이스에 style 필드가 이미 정의되어 있었으나 UI 미연결이었음 */}
                    <div className="ins-row">
                        <span className="ins-label">스타일</span>
                        <select
                            className="ins-select"
                            value={element.stroke?.style || "solid"}
                            onChange={(e) => handleStrokeChange("style", e.target.value)}
                        >
                            <option value="solid">━ Solid</option>
                            <option value="dashed">╌ Dashed</option>
                            <option value="dotted">┈ Dotted</option>
                        </select>
                    </div>
                    {/* 🆕 Stroke 투명도 */}
                    <div className="ins-row-slider">
                        <span className="ins-label">투명도</span>
                        <input
                            type="range"
                            className="ins-slider"
                            min={0}
                            max={100}
                            value={Math.round((element.stroke?.opacity ?? 1) * 100)}
                            onChange={(e) => handleStrokeChange("opacity", parseInt(e.target.value) / 100)}
                        />
                        <span className="ins-value">
                            {Math.round((element.stroke?.opacity ?? 1) * 100)}%
                        </span>
                    </div>
                </div>
            )}

            {/* Border Radius (rect only) */}
            {element.type === "rect" && (
                <CornerRadiusSection element={element} handleChange={handleChange} onUpdate={onUpdate} />
            )}

            {/* ─── Appearance (Blend Mode) ─────────────────────── */}
            <div className="ins-section">
                <div className="ins-section-title">Appearance</div>
                <div className="ins-row">
                    <span className="ins-label">Blend Mode</span>
                    <select
                        className="ins-select"
                        value={element.blendMode || "normal"}
                        onChange={(e) => handleChange("blendMode", e.target.value)}
                    >
                        <option value="normal">Normal</option>
                        <option value="multiply">Multiply</option>
                        <option value="screen">Screen</option>
                        <option value="overlay">Overlay</option>
                        <option value="soft-light">Soft Light</option>
                        <option value="hard-light">Hard Light</option>
                        <option value="color-dodge">Color Dodge</option>
                        <option value="color-burn">Color Burn</option>
                        <option value="difference">Difference</option>
                        <option value="luminosity">Luminosity</option>
                    </select>
                </div>
            </div>

            {/* ─── Effects (Figma-style collapsible cards) ──────── */}
            <EffectsSection element={element} handleChange={handleChange} onUpdate={onUpdate} />

        </>
    );
}


// ─── 서브 컴포넌트: 그라데이션 프리뷰 바 ───────────────────────────

function GradientPreviewBar({ element }: { element: GraphicElement }) {
    const s0 = element.fill?.gradientStops?.[0];
    const s1 = element.fill?.gradientStops?.[1];
    const c0 = s0?.color || "#3b82f6";
    const c1 = s1?.color || "#8b5cf6";
    const a0 = s0?.opacity ?? 1;
    const a1 = s1?.opacity ?? 1;

    const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    };

    return (
        <div
            className="gradient-preview-bar"
            style={{
                background: `linear-gradient(${element.fill?.gradientAngle || 0}deg, ${hexToRgba(c0, a0)}, ${hexToRgba(c1, a1)})`,
            }}
        />
    );
}


// ─── 서브 컴포넌트: 그라데이션 스톱(시작/끝) 행 ────────────────────

function GradientStopRow({
    label,
    index,
    element,
    selectedElements,
    onUpdate,
}: {
    label: string;
    index: 0 | 1;
    element: GraphicElement;
    selectedElements: GraphicElement[];
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
}) {
    const defaultStops = [
        { offset: 0, color: "#3b82f6", opacity: 1 },
        { offset: 100, color: "#8b5cf6", opacity: 1 },
    ];
    const defaultColor = index === 0 ? "#3b82f6" : "#8b5cf6";

    const handleColorChange = (value: string) => {
        const stops = [...(element.fill?.gradientStops || defaultStops)];
        stops[index] = { ...stops[index], color: value };
        selectedElements.forEach((el) => {
            onUpdate(el.id, { fill: { ...el.fill, gradientStops: stops } });
        });
    };

    const handleOpacityChange = (value: number) => {
        const stops = [...(element.fill?.gradientStops || defaultStops)];
        stops[index] = { ...stops[index], opacity: value / 100 };
        selectedElements.forEach((el) => {
            onUpdate(el.id, { fill: { ...el.fill, gradientStops: stops } });
        });
    };

    const handleOffsetChange = (value: number) => {
        const stops = [...(element.fill?.gradientStops || defaultStops)];
        stops[index] = { ...stops[index], offset: value };
        selectedElements.forEach((el) => {
            onUpdate(el.id, { fill: { ...el.fill, gradientStops: stops } });
        });
    };

    return (
        <>
            <div className="ins-row">
                <span className="ins-label">{label}</span>
                <div className="ins-color">
                    <input
                        type="color"
                        className="ins-color-swatch"
                        value={rgbaToHex(element.fill?.gradientStops?.[index]?.color || defaultColor)}
                        onChange={(e) => handleColorChange(e.target.value)}
                    />
                    <input
                        type="text"
                        className="ins-input"
                        value={element.fill?.gradientStops?.[index]?.color || defaultColor}
                        onChange={(e) => handleColorChange(e.target.value)}
                    />
                </div>
            </div>
            <div className="ins-row-slider">
                <span className="ins-label" style={{ visibility: "hidden" }}>투명도</span>
                <input
                    type="range"
                    className="ins-slider"
                    min={0}
                    max={100}
                    value={Math.round((element.fill?.gradientStops?.[index]?.opacity ?? 1) * 100)}
                    onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
                />
                <span className="ins-value">
                    {Math.round((element.fill?.gradientStops?.[index]?.opacity ?? 1) * 100)}%
                </span>
            </div>
            <div className="ins-row-slider">
                <span className="ins-label" style={{ visibility: "hidden" }}>비율</span>
                <input
                    type="range"
                    className="ins-slider"
                    min={0}
                    max={100}
                    value={element.fill?.gradientStops?.[index]?.offset ?? (index === 0 ? 0 : 100)}
                    onChange={(e) => handleOffsetChange(parseInt(e.target.value))}
                />
                <span className="ins-value">
                    {element.fill?.gradientStops?.[index]?.offset ?? (index === 0 ? 0 : 100)}%
                </span>
            </div>
        </>
    );
}


// ─── 서브 컴포넌트: 그라데이션 각도 다이얼 ──────────────────────────

function AngleDialSection({
    element,
    selectedElements,
    onUpdate,
}: {
    element: GraphicElement;
    selectedElements: GraphicElement[];
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
}) {
    return (
        <div className="ins-row">
            <span className="ins-label">각도</span>
            <div className="angle-dial-container" style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                <div
                    className="angle-dial"
                    onMouseDown={(e) => {
                        const dial = e.currentTarget;
                        const rect = dial.getBoundingClientRect();
                        const cx = rect.left + rect.width / 2;
                        const cy = rect.top + rect.height / 2;

                        const calcAngle = (clientX: number, clientY: number, snap: boolean) => {
                            const dx = clientX - cx;
                            const dy = clientY - cy;
                            let deg = Math.round(Math.atan2(dx, -dy) * (180 / Math.PI));
                            if (deg < 0) deg += 360;
                            if (snap) deg = Math.round(deg / 45) * 45;
                            return deg % 360;
                        };

                        const initAngle = calcAngle(e.clientX, e.clientY, e.shiftKey);
                        selectedElements.forEach((el) => {
                            onUpdate(el.id, { fill: { ...el.fill, gradientAngle: initAngle } });
                        });

                        const onMove = (me: MouseEvent) => {
                            const angle = calcAngle(me.clientX, me.clientY, me.shiftKey);
                            selectedElements.forEach((el) => {
                                onUpdate(el.id, { fill: { ...el.fill, gradientAngle: angle } });
                            });
                        };
                        const onUp = () => {
                            document.removeEventListener("mousemove", onMove);
                            document.removeEventListener("mouseup", onUp);
                        };
                        document.addEventListener("mousemove", onMove);
                        document.addEventListener("mouseup", onUp);
                    }}
                >
                    <div
                        className="angle-dial-handle"
                        style={{
                            transform: `translate(-50%, -100%) rotate(${element.fill?.gradientAngle || 0}deg)`,
                        }}
                    />
                    <div className="angle-dial-center" />
                </div>
                <div className="ins-input-with-unit" style={{ width: "54px" }}>
                    <NumberInput
                        value={element.fill?.gradientAngle || 0}
                        onChange={(val) => {
                            selectedElements.forEach((el) => {
                                onUpdate(el.id, {
                                    fill: { ...el.fill, gradientAngle: val }
                                });
                            });
                        }}
                        min={0}
                        max={360}
                    />
                    <span className="ins-input-unit">°</span>
                </div>
                <div className="angle-presets" style={{ display: "flex", marginLeft: "auto" }}>
                    <button
                        type="button"
                        className="angle-preset-btn"
                        onClick={() => {
                            selectedElements.forEach((el) => {
                                const currentAngle = el.fill?.gradientAngle || 0;
                                const nextAngle = (currentAngle + 90) % 360;
                                onUpdate(el.id, { fill: { ...el.fill, gradientAngle: nextAngle } });
                            });
                        }}
                        title="시계 방향 90° 회전"
                    >
                        <RotateCw size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
}


// ─── 서브 컴포넌트: 코너 반경 ──────────────────────────────────────

function CornerRadiusSection({
    element,
    handleChange,
    onUpdate,
}: {
    element: GraphicElement;
    handleChange: (field: keyof GraphicElement, value: string | number | boolean) => void;
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
}) {
    return (
        <div className="ins-section">
            <div className="ins-section-title">
                Corner Radius
                <div className="corner-radius-controls">
                    <button
                        type="button"
                        className={`corner-link-btn ${element.borderRadiusLinked !== false ? "active" : ""}`}
                        onClick={() => handleChange("borderRadiusLinked", !(element.borderRadiusLinked !== false))}
                        title="모든 코너 연결"
                    >
                        🔗
                    </button>
                    <select
                        className="corner-unit-select"
                        value={element.borderRadiusUnit || "px"}
                        onChange={(e) => handleChange("borderRadiusUnit", e.target.value)}
                    >
                        <option value="px">px</option>
                        <option value="%">%</option>
                    </select>
                </div>
            </div>
            {element.borderRadiusLinked !== false ? (
                <div className="ins-row">
                    <span className="ins-label" title="모든 코너">⊡</span>
                    <NumberInput
                        value={element.borderRadius ?? 0}
                        onChange={(val) => {
                            onUpdate(element.id, {
                                borderRadius: val,
                                borderRadiusTL: val,
                                borderRadiusTR: val,
                                borderRadiusBR: val,
                                borderRadiusBL: val,
                            });
                        }}
                        min={0}
                        max={element.borderRadiusUnit === "%" ? 50 : undefined}
                    />
                </div>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "6px 10px",
                        paddingLeft: "28px",
                    }}
                >
                    {/* Why ins-row 미사용? 개별 코너 입력은 ins-row(72px 고정 라벨+28px padding)를
                        2컬럼 그리드에 넣으면 NumberInput이 너무 좁아져 업/다운 버튼 조작이 불가능해진다.
                        대신 compact flex 레이아웃으로 입력폭을 확보한다. */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span
                            style={{
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                                width: "16px",
                                textAlign: "center",
                                flexShrink: 0,
                            }}
                            title="Top-Left"
                        >
                            ↖
                        </span>
                        <NumberInput
                            value={element.borderRadiusTL ?? element.borderRadius ?? 0}
                            onChange={(val) => handleChange("borderRadiusTL", val)}
                            min={0}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span
                            style={{
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                                width: "16px",
                                textAlign: "center",
                                flexShrink: 0,
                            }}
                            title="Top-Right"
                        >
                            ↗
                        </span>
                        <NumberInput
                            value={element.borderRadiusTR ?? element.borderRadius ?? 0}
                            onChange={(val) => handleChange("borderRadiusTR", val)}
                            min={0}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span
                            style={{
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                                width: "16px",
                                textAlign: "center",
                                flexShrink: 0,
                            }}
                            title="Bottom-Left"
                        >
                            ↙
                        </span>
                        <NumberInput
                            value={element.borderRadiusBL ?? element.borderRadius ?? 0}
                            onChange={(val) => handleChange("borderRadiusBL", val)}
                            min={0}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span
                            style={{
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                                width: "16px",
                                textAlign: "center",
                                flexShrink: 0,
                            }}
                            title="Bottom-Right"
                        >
                            ↘
                        </span>
                        <NumberInput
                            value={element.borderRadiusBR ?? element.borderRadius ?? 0}
                            onChange={(val) => handleChange("borderRadiusBR", val)}
                            min={0}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}


// ─── 서브 컴포넌트: Figma 스타일 이펙트 섹션 ──────────────────────
// Why Figma 스타일?
// → 체크박스 리스트는 요소가 많아질수록 시각적으로 복잡해진다.
//   Figma/Penpot처럼 "+ 추가" → 접이식 카드 패턴은:
//   1) 비활성 이펙트가 공간을 차지하지 않아 패널이 깔끔하다.
//   2) 카드 헤더만으로 어떤 이펙트가 활성인지 한눈에 파악된다.
//   3) 접기/펼치기로 세부 파라미터 영역을 선택적으로 노출한다.

interface EffectDef {
    key: string;
    label: string;
    enabledField: keyof GraphicElement;
    /** 이 이펙트가 현재 요소 타입에서 사용 가능한지 */
    isAvailable: boolean;
    /** 현재 활성 상태인지 */
    isActive: boolean;
}

function EffectsSection({
    element,
    handleChange,
    onUpdate,
}: {
    element: GraphicElement;
    handleChange: (field: keyof GraphicElement, value: string | number | boolean) => void;
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
}) {
    // 📐 Drop Shadow 각도 & 거리 양방향 동기화 및 삼각함수 역산
    const shadowOffsetX = element.shadowOffsetX ?? 2;
    const shadowOffsetY = element.shadowOffsetY ?? 2;
    const shadowDistance = element.shadowDistance ?? Math.round(Math.sqrt(shadowOffsetX * shadowOffsetX + shadowOffsetY * shadowOffsetY));
    let shadowAngle = element.shadowAngle;
    if (shadowAngle === undefined) {
        shadowAngle = Math.round(Math.atan2(shadowOffsetY, shadowOffsetX) * (180 / Math.PI));
        if (shadowAngle < 0) shadowAngle += 360;
    }

    const handleShadowAngleChange = (angle: number) => {
        const rad = (angle * Math.PI) / 180;
        const ox = Math.round(shadowDistance * Math.cos(rad));
        const oy = Math.round(shadowDistance * Math.sin(rad));
        onUpdate(element.id, {
            shadowAngle: angle,
            shadowDistance: shadowDistance,
            shadowOffsetX: ox,
            shadowOffsetY: oy
        });
    };

    const handleShadowDistanceChange = (dist: number) => {
        const rad = (shadowAngle * Math.PI) / 180;
        const ox = Math.round(dist * Math.cos(rad));
        const oy = Math.round(dist * Math.sin(rad));
        onUpdate(element.id, {
            shadowAngle: shadowAngle,
            shadowDistance: dist,
            shadowOffsetX: ox,
            shadowOffsetY: oy
        });
    };

    // 📐 Inner Shadow 각도 & 거리 양방향 동기화 및 삼각함수 역산
    const innerShadowOffsetX = element.innerShadowOffsetX ?? 2;
    const innerShadowOffsetY = element.innerShadowOffsetY ?? 2;
    const innerShadowDistance = element.innerShadowDistance ?? Math.round(Math.sqrt(innerShadowOffsetX * innerShadowOffsetX + innerShadowOffsetY * innerShadowOffsetY));
    let innerShadowAngle = element.innerShadowAngle;
    if (innerShadowAngle === undefined) {
        innerShadowAngle = Math.round(Math.atan2(innerShadowOffsetY, innerShadowOffsetX) * (180 / Math.PI));
        if (innerShadowAngle < 0) innerShadowAngle += 360;
    }

    const handleInnerShadowAngleChange = (angle: number) => {
        const rad = (angle * Math.PI) / 180;
        const ox = Math.round(innerShadowDistance * Math.cos(rad));
        const oy = Math.round(innerShadowDistance * Math.sin(rad));
        onUpdate(element.id, {
            innerShadowAngle: angle,
            innerShadowDistance: innerShadowDistance,
            innerShadowOffsetX: ox,
            innerShadowOffsetY: oy
        });
    };

    const handleInnerShadowDistanceChange = (dist: number) => {
        const rad = (innerShadowAngle * Math.PI) / 180;
        const ox = Math.round(dist * Math.cos(rad));
        const oy = Math.round(dist * Math.sin(rad));
        onUpdate(element.id, {
            innerShadowAngle: innerShadowAngle,
            innerShadowDistance: dist,
            innerShadowOffsetX: ox,
            innerShadowOffsetY: oy
        });
    };

    // 1. 각 카드의 접힘/펼침 상태 — 기본값: 모두 펼침
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        shadow: true,
        glow: true,
        innerShadow: true,
    });
    // 2. "+ 추가" 드롭다운 열림/닫힘
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        if (!menuOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [menuOpen]);

    const toggleExpand = (key: string) => {
        setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // 이펙트 정의 — 요소 타입에 따라 가용성(availability) 결정
    const isShape = element.type === "rect" || element.type === "ellipse";
    const isNotText = element.type !== "text";

    const effectDefs: EffectDef[] = [
        {
            key: "shadow",
            label: "Drop Shadow",
            enabledField: "shadowEnabled" as keyof GraphicElement,
            isAvailable: isNotText,
            isActive: isNotText && (element.shadowEnabled || false),
        },
        {
            key: "glow",
            label: "Glow",
            enabledField: "glowEnabled" as keyof GraphicElement,
            isAvailable: isNotText,
            isActive: isNotText && (element.glowEnabled || false),
        },
        {
            key: "innerShadow",
            label: "Inner Shadow",
            enabledField: "innerShadowEnabled" as keyof GraphicElement,
            isAvailable: isShape,
            isActive: isShape && (element.innerShadowEnabled || false),
        },
    ];

    const activeEffects = effectDefs.filter((e) => e.isActive);
    const addableEffects = effectDefs.filter((e) => e.isAvailable && !e.isActive);

    return (
        <div className="ins-section">
            <div className="ins-section-title">
                Effects
                {addableEffects.length > 0 && (
                    <div className="effect-add-wrapper" ref={menuRef}>
                        <button
                            type="button"
                            className="effect-add-btn"
                            onClick={() => setMenuOpen(!menuOpen)}
                            title="이펙트 추가"
                        >
                            <Plus size={12} />
                        </button>
                        {menuOpen && (
                            <div className="effect-add-menu">
                                {addableEffects.map((ef) => (
                                    <button
                                        key={ef.key}
                                        type="button"
                                        className="effect-add-menu-item"
                                        onClick={() => {
                                            handleChange(ef.enabledField, true);
                                            setExpanded((prev) => ({ ...prev, [ef.key]: true }));
                                            setMenuOpen(false);
                                        }}
                                    >
                                        {ef.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── 활성 이펙트 카드 목록 ── */}
            <div className="effect-cards-area">
                {activeEffects.length === 0 && (
                    <div className="effect-empty">이펙트 없음</div>
                )}

                {/* Drop Shadow 카드 */}
                {element.shadowEnabled && isNotText && (
                    <div className="effect-card">
                        <div
                            className="effect-card-header"
                            onClick={() => toggleExpand("shadow")}
                        >
                            <ChevronRight
                                size={12}
                                className={`effect-card-chevron ${expanded.shadow ? "expanded" : ""}`}
                            />
                            <span className="effect-card-name">Drop Shadow</span>
                            <button
                                type="button"
                                className="effect-card-action-btn danger"
                                title="이펙트 제거"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleChange("shadowEnabled", false);
                                }}
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                        {expanded.shadow && (
                            <div className="effect-card-body">
                                <div className="ins-row">
                                    <span className="ins-label">색상</span>
                                    <div className="ins-color">
                                        <input
                                            type="color"
                                            className="ins-color-swatch"
                                            value={rgbaToHex(element.shadowColor || "#000000")}
                                            onChange={(e) => handleChange("shadowColor", e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            className="ins-input"
                                            value={element.shadowColor || "#000000"}
                                            onChange={(e) => handleChange("shadowColor", e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="ins-row">
                                    <span className="ins-label">각도</span>
                                    <div className="ins-angle-control">
                                        <AngleDial angle={shadowAngle} onChange={handleShadowAngleChange} />
                                        <div className="ins-row-slider-container">
                                            <input
                                                type="range"
                                                className="ins-slider"
                                                min="0"
                                                max="360"
                                                value={shadowAngle}
                                                onChange={(e) => handleShadowAngleChange(Number(e.target.value))}
                                            />
                                            <div className="ins-input-with-unit" style={{ width: "54px" }}>
                                                <NumberInput
                                                    value={shadowAngle}
                                                    onChange={(val) => handleShadowAngleChange(val)}
                                                    min={0}
                                                    max={360}
                                                />
                                                <span className="ins-input-unit">°</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="ins-row">
                                    <span className="ins-label">거리</span>
                                    <div className="ins-row-slider-container">
                                        <input
                                            type="range"
                                            className="ins-slider"
                                            min="0"
                                            max="100"
                                            value={shadowDistance}
                                            onChange={(e) => handleShadowDistanceChange(Number(e.target.value))}
                                        />
                                        <NumberInput
                                            value={shadowDistance}
                                            onChange={(val) => handleShadowDistanceChange(val)}
                                            min={0}
                                        />
                                        <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>px</span>
                                    </div>
                                </div>
                                <div className="ins-row">
                                    <span className="ins-label">Blur</span>
                                    <div className="ins-row-slider-container">
                                        <input
                                            type="range"
                                            className="ins-slider"
                                            min="0"
                                            max="50"
                                            value={element.shadowBlur ?? 4}
                                            onChange={(e) => handleChange("shadowBlur", Number(e.target.value))}
                                        />
                                        <NumberInput
                                            value={element.shadowBlur ?? 4}
                                            onChange={(val) => handleChange("shadowBlur", val)}
                                            min={0}
                                        />
                                        <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>px</span>
                                    </div>
                                </div>
                                <div className="ins-row" style={{ marginTop: "-2px", marginBottom: "4px" }}>
                                    <div className="ins-shadow-offset-indicator">
                                        오프셋: X: {shadowOffsetX}px, Y: {shadowOffsetY}px
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Glow 카드 */}
                {element.glowEnabled && isNotText && (
                    <div className="effect-card">
                        <div
                            className="effect-card-header"
                            onClick={() => toggleExpand("glow")}
                        >
                            <ChevronRight
                                size={12}
                                className={`effect-card-chevron ${expanded.glow ? "expanded" : ""}`}
                            />
                            <span className="effect-card-name">Glow</span>
                            <button
                                type="button"
                                className="effect-card-action-btn danger"
                                title="이펙트 제거"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleChange("glowEnabled", false);
                                }}
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                        {expanded.glow && (
                            <div className="effect-card-body">
                                <div className="ins-row">
                                    <span className="ins-label">색상</span>
                                    <div className="ins-color">
                                        <input
                                            type="color"
                                            className="ins-color-swatch"
                                            value={rgbaToHex(element.glowColor || "#00e5ff")}
                                            onChange={(e) => handleChange("glowColor", e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            className="ins-input"
                                            value={element.glowColor || "#00e5ff"}
                                            onChange={(e) => handleChange("glowColor", e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="ins-row">
                                    <span className="ins-label">Blur</span>
                                    <NumberInput
                                        value={element.glowBlur ?? 10}
                                        onChange={(val) => handleChange("glowBlur", val)}
                                        min={0}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Inner Shadow 카드 */}
                {element.innerShadowEnabled && isShape && (
                    <div className="effect-card">
                        <div
                            className="effect-card-header"
                            onClick={() => toggleExpand("innerShadow")}
                        >
                            <ChevronRight
                                size={12}
                                className={`effect-card-chevron ${expanded.innerShadow ? "expanded" : ""}`}
                            />
                            <span className="effect-card-name">Inner Shadow</span>
                            <button
                                type="button"
                                className="effect-card-action-btn danger"
                                title="이펙트 제거"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleChange("innerShadowEnabled", false);
                                }}
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                        {expanded.innerShadow && (
                            <div className="effect-card-body">
                                <div className="ins-row">
                                    <span className="ins-label">색상</span>
                                    <div className="ins-color">
                                        <input
                                            type="color"
                                            className="ins-color-swatch"
                                            value={rgbaToHex(element.innerShadowColor || "#000000")}
                                            onChange={(e) => handleChange("innerShadowColor", e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            className="ins-input"
                                            value={element.innerShadowColor || "#000000"}
                                            onChange={(e) => handleChange("innerShadowColor", e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="ins-row">
                                    <span className="ins-label">각도</span>
                                    <div className="ins-angle-control">
                                        <AngleDial angle={innerShadowAngle} onChange={handleInnerShadowAngleChange} />
                                        <div className="ins-row-slider-container">
                                            <input
                                                type="range"
                                                className="ins-slider"
                                                min="0"
                                                max="360"
                                                value={innerShadowAngle}
                                                onChange={(e) => handleInnerShadowAngleChange(Number(e.target.value))}
                                            />
                                            <div className="ins-input-with-unit" style={{ width: "54px" }}>
                                                <NumberInput
                                                    value={innerShadowAngle}
                                                    onChange={(val) => handleInnerShadowAngleChange(val)}
                                                    min={0}
                                                    max={360}
                                                />
                                                <span className="ins-input-unit">°</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="ins-row">
                                    <span className="ins-label">거리</span>
                                    <div className="ins-row-slider-container">
                                        <input
                                            type="range"
                                            className="ins-slider"
                                            min="0"
                                            max="100"
                                            value={innerShadowDistance}
                                            onChange={(e) => handleInnerShadowDistanceChange(Number(e.target.value))}
                                        />
                                        <NumberInput
                                            value={innerShadowDistance}
                                            onChange={(val) => handleInnerShadowDistanceChange(val)}
                                            min={0}
                                        />
                                        <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>px</span>
                                    </div>
                                </div>
                                <div className="ins-row">
                                    <span className="ins-label">Blur</span>
                                    <div className="ins-row-slider-container">
                                        <input
                                            type="range"
                                            className="ins-slider"
                                            min="0"
                                            max="50"
                                            value={element.innerShadowBlur ?? 4}
                                            onChange={(e) => handleChange("innerShadowBlur", Number(e.target.value))}
                                        />
                                        <NumberInput
                                            value={element.innerShadowBlur ?? 4}
                                            onChange={(val) => handleChange("innerShadowBlur", val)}
                                            min={0}
                                        />
                                        <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>px</span>
                                    </div>
                                </div>
                                <div className="ins-row" style={{ marginTop: "-2px", marginBottom: "4px" }}>
                                    <div className="ins-shadow-offset-indicator">
                                        오프셋: X: {innerShadowOffsetX}px, Y: {innerShadowOffsetY}px
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
