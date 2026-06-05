/**
 * Text Tab — Content / Typography / Alignment / Decoration / Text Style
 *
 * PropertiesPanel에서 추출된 Text 탭 서브 컴포넌트.
 * 텍스트 요소의 내용, 폰트, 크기, 정렬, 장식, 색상, 외곽선, 그림자를 편집한다.
 */

import { SYSTEM_FONTS } from "@/lib/fontRegistry";
import type { TabCommonProps } from "./DesignTab";
import { AngleDial } from "./DesignTab";
import { NumberInput } from "@/components/ui/number-input";

/** Weight 라벨 매핑 */
const WEIGHT_LABELS: Record<number, string> = {
    100: "Thin", 200: "ExtraLight", 300: "Light",
    400: "Regular", 500: "Medium", 600: "SemiBold",
    700: "Bold", 800: "ExtraBold", 900: "Black",
};

export function TextTab({
    element,
    selectedElements,
    onUpdate,
    handleChange,
    handleFillChange,
    handleStrokeChange,
}: TabCommonProps) {
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

    return (
        <>
            <div className="ins-section">
                <div className="ins-section-title">Content</div>
                <textarea
                    className="ins-textarea"
                    value={element.content || ""}
                    onChange={(e) => handleChange("content", e.target.value)}
                />
            </div>

            <div className="ins-section">
                <div className="ins-section-title">Typography</div>
                <div className="ins-row">
                    <span className="ins-label">Font</span>
                    <select
                        className="ins-select"
                        value={element.fontFamily || "Noto Sans KR"}
                        onChange={(e) => {
                            const newFamily = e.target.value;
                            // 새 폰트의 지원 weight 확인
                            const fontDef = SYSTEM_FONTS.find(f => f.family === newFamily);
                            const currentWeight = element.fontWeight || 400;
                            if (fontDef && !fontDef.weights.includes(currentWeight)) {
                                // 가장 가까운 weight로 자동 조정
                                const closest = fontDef.weights.reduce((prev, curr) =>
                                    Math.abs(curr - currentWeight) < Math.abs(prev - currentWeight) ? curr : prev
                                );
                                selectedElements.forEach((el) => {
                                    onUpdate(el.id, { fontFamily: newFamily, fontWeight: closest });
                                });
                            } else {
                                handleChange("fontFamily", newFamily);
                            }
                        }}
                    >
                        {/* 한글 폰트 그룹 */}
                        <optgroup label="🇰🇷 한글 폰트">
                            {SYSTEM_FONTS.filter(f => f.isKorean).map(f => (
                                <option key={f.family} value={f.family}>{f.label}</option>
                            ))}
                        </optgroup>
                        {/* 영문 폰트 그룹 */}
                        <optgroup label="🔤 영문 폰트">
                            {SYSTEM_FONTS.filter(f => !f.isKorean).map(f => (
                                <option key={f.family} value={f.family}>{f.label}</option>
                            ))}
                        </optgroup>
                    </select>
                </div>
                <div className="ins-row-2col">
                    <span className="ins-label">Size</span>
                    <NumberInput
                        value={element.fontSize || 24}
                        onChange={(val) => handleChange("fontSize", val)}
                        min={1}
                    />
                    <span className="ins-label">Wt</span>
                    <select
                        className="ins-select"
                        value={element.fontWeight || 400}
                        onChange={(e) => handleChange("fontWeight", parseInt(e.target.value))}
                    >
                        {(() => {
                            const fontDef = SYSTEM_FONTS.find(f => f.family === (element.fontFamily || "Noto Sans KR"));
                            const weights = fontDef ? fontDef.weights : [400, 700];
                            return weights.map(w => (
                                <option key={w} value={w}>{WEIGHT_LABELS[w] || `w${w}`}</option>
                            ));
                        })()}
                    </select>
                </div>
                <div className="ins-row-2col">
                    <span className="ins-label">LH</span>
                    <NumberInput
                        value={element.lineHeight || 1.4}
                        onChange={(val) => handleChange("lineHeight", val)}
                        step={0.1}
                        min={0.5}
                    />
                    <span className="ins-label">LS</span>
                    <NumberInput
                        value={element.letterSpacing || 0}
                        onChange={(val) => handleChange("letterSpacing", val)}
                        step={0.5}
                    />
                </div>
            </div>

            <div className="ins-section">
                <div className="ins-section-title">Alignment</div>
                <div className="ins-row-2col">
                    <span className="ins-label">H</span>
                    <select
                        className="ins-select"
                        value={element.textAlign || "left"}
                        onChange={(e) => handleChange("textAlign", e.target.value)}
                    >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                        <option value="justify">Justify</option>
                    </select>
                    <span className="ins-label">V</span>
                    <select
                        className="ins-select"
                        value={element.verticalAlign || "top"}
                        onChange={(e) => handleChange("verticalAlign", e.target.value)}
                    >
                        <option value="top">Top</option>
                        <option value="middle">Middle</option>
                        <option value="bottom">Bottom</option>
                    </select>
                </div>
            </div>

            <div className="ins-section">
                <div className="ins-section-title">Decoration</div>
                <div className="ins-row">
                    <span className="ins-label">Case</span>
                    <select
                        className="ins-select"
                        value={element.textCase || "none"}
                        onChange={(e) => handleChange("textCase", e.target.value)}
                    >
                        <option value="none">None</option>
                        <option value="uppercase">UPPERCASE</option>
                        <option value="lowercase">lowercase</option>
                        <option value="capitalize">Capitalize</option>
                    </select>
                </div>
                <div className="ins-row">
                    <span className="ins-label">Deco</span>
                    <select
                        className="ins-select"
                        value={element.textDecoration || "none"}
                        onChange={(e) => handleChange("textDecoration", e.target.value)}
                    >
                        <option value="none">None</option>
                        <option value="underline">Underline</option>
                        <option value="line-through">Strikethrough</option>
                    </select>
                </div>
                {/* 🆕 고정폭 숫자 (Tabular Nums)
                    Why: 속도, 점수, 시간 등 실시간 데이터가 빠르게 변할 때
                         숫자 1과 8의 폭이 다르면 텍스트가 좌우로 떨림(Jitter).
                         tabular-nums는 모든 숫자를 동일 폭으로 렌더링하여
                         방송 품질의 안정적인 데이터 표시를 보장. */}
                <div className="ins-row-toggle">
                    <span className="ins-label">고정폭 숫자</span>
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={element.tabularNums || false}
                            onChange={(e) => handleChange("tabularNums" as keyof typeof element, e.target.checked)}
                        />
                        <span>Tabular</span>
                    </label>
                </div>
            </div>

            {/* 텍스트 스타일 */}
            <div className="ins-section">
                <div className="ins-section-title">Text Style</div>
                <div className="ins-row">
                    <span className="ins-label">색상</span>
                    <div className="ins-color">
                        <input
                            type="color"
                            className="ins-color-swatch"
                            value={element.fill?.color || "#ffffff"}
                            onChange={(e) => handleFillChange(e.target.value)}
                        />
                        <input
                            type="text"
                            className="ins-input"
                            value={element.fill?.color || "#ffffff"}
                            onChange={(e) => handleFillChange(e.target.value)}
                        />
                    </div>
                </div>
                <div className="ins-row-toggle">
                    <span className="ins-label">외곽선</span>
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={element.textStrokeEnabled || false}
                            onChange={(e) => handleChange("textStrokeEnabled", e.target.checked)}
                        />
                        <span>활성화</span>
                    </label>
                </div>
                {element.textStrokeEnabled && (
                    <div className="ins-row">
                        <span className="ins-label" style={{ visibility: "hidden" }}>외곽선</span>
                        <div className="ins-color">
                            <input
                                type="color"
                                className="ins-color-swatch"
                                value={element.stroke?.color || "#000000"}
                                onChange={(e) => handleStrokeChange("color", e.target.value)}
                            />
                            <NumberInput
                                value={element.stroke?.width ?? 2}
                                onChange={(val) => handleStrokeChange("width", val)}
                                min={0}
                                className="w-16"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 그림자 */}
            <div className="ins-section">
                <div className="ins-section-title">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={element.shadowEnabled || false}
                            onChange={(e) => handleChange("shadowEnabled", e.target.checked)}
                        />
                        <span>Shadow</span>
                    </label>
                </div>
                {element.shadowEnabled && (
                    <>
                        <div className="ins-row">
                            <span className="ins-label">색상</span>
                            <div className="ins-color">
                                <input
                                    type="color"
                                    className="ins-color-swatch"
                                    value={element.shadowColor || "#000000"}
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
                    </>
                )}
            </div>

            {/* 🆕 Glow (외부 발광) */}
            <div className="ins-section">
                <div className="ins-section-title">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={element.glowEnabled || false}
                            onChange={(e) => handleChange("glowEnabled", e.target.checked)}
                        />
                        <span>Glow (발광)</span>
                    </label>
                </div>
                {element.glowEnabled && (
                    <>
                        <div className="ins-row">
                            <span className="ins-label">색상</span>
                            <div className="ins-color">
                                <input
                                    type="color"
                                    className="ins-color-swatch"
                                    value={element.glowColor || "#00e5ff"}
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
                    </>
                )}
            </div>
        </>
    );
}
