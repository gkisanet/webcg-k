/**
 * Text Tab — Content / Typography / Alignment / Decoration / Text Style
 *
 * PropertiesPanel에서 추출된 Text 탭 서브 컴포넌트.
 * 텍스트 요소의 내용, 폰트, 크기, 정렬, 장식, 색상, 외곽선, 그림자를 편집한다.
 */

import { SYSTEM_FONTS } from "@/lib/fontRegistry";
import type { TabCommonProps } from "./DesignTab";

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
                    <input
                        type="number"
                        className="ins-input"
                        value={element.fontSize || 24}
                        onChange={(e) => handleChange("fontSize", parseFloat(e.target.value) || 24)}
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
                    <input
                        type="number"
                        className="ins-input"
                        value={element.lineHeight || 1.4}
                        onChange={(e) => handleChange("lineHeight", parseFloat(e.target.value) || 1.4)}
                        step={0.1}
                        min={0.5}
                    />
                    <span className="ins-label">LS</span>
                    <input
                        type="number"
                        className="ins-input"
                        value={element.letterSpacing || 0}
                        onChange={(e) => handleChange("letterSpacing", parseFloat(e.target.value) || 0)}
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
                            <input
                                type="number"
                                className="ins-input"
                                value={element.stroke?.width ?? 2}
                                onChange={(e) => handleStrokeChange("width", parseFloat(e.target.value) || 0)}
                                min={0}
                                style={{ width: "50px" }}
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
                        <div className="ins-row-2col">
                            <span className="ins-label">X</span>
                            <input
                                type="number"
                                className="ins-input"
                                value={element.shadowOffsetX ?? 2}
                                onChange={(e) => handleChange("shadowOffsetX", parseFloat(e.target.value) || 0)}
                            />
                            <span className="ins-label">Y</span>
                            <input
                                type="number"
                                className="ins-input"
                                value={element.shadowOffsetY ?? 2}
                                onChange={(e) => handleChange("shadowOffsetY", parseFloat(e.target.value) || 0)}
                            />
                        </div>
                        <div className="ins-row">
                            <span className="ins-label">Blur</span>
                            <input
                                type="number"
                                className="ins-input"
                                value={element.shadowBlur ?? 4}
                                onChange={(e) => handleChange("shadowBlur", parseFloat(e.target.value) || 0)}
                                min={0}
                            />
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
                            <input
                                type="number"
                                className="ins-input"
                                value={element.glowBlur ?? 10}
                                onChange={(e) => handleChange("glowBlur", parseFloat(e.target.value) || 0)}
                                min={0}
                            />
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
