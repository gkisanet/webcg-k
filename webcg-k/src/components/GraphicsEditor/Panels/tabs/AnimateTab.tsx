/**
 * Animate Tab — Enter / Exit / Loop 애니메이션 편집
 *
 * PropertiesPanel에서 추출된 Animate 탭 서브 컴포넌트.
 * 그래픽 요소의 등장/퇴장/반복 애니메이션을 프리셋 기반으로 설정한다.
 *
 * 애니메이션 프리셋 상수도 이 파일에 co-locate.
 * → Why? 이 상수들은 Animate 탭에서만 사용되므로 같은 파일에 두는 것이
 *   관심사 분리 원칙에 더 부합 (Feature Colocation 패턴)
 */

import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import type {
    EnterAnimationType,
    ExitAnimationType,
    LoopAnimationType,
    ElementAnimation,
} from "@/components/GraphicPreviewRenderer";

// ─── 애니메이션 프리셋 옵션 ───────────────────────────────────────
const ENTER_PRESETS: { value: EnterAnimationType; label: string }[] = [
    { value: "fadeIn", label: "페이드 인" },
    { value: "slideLeft", label: "← 좌측에서" },
    { value: "slideRight", label: "→ 우측에서" },
    { value: "slideUp", label: "↑ 아래에서" },
    { value: "slideDown", label: "↓ 위에서" },
    { value: "zoomIn", label: "확대 등장" },
    { value: "bounce", label: "바운스" },
    { value: "expand", label: "확장" },
    { value: "reveal", label: "리빌" },
    { value: "typewriter", label: "타이프라이터" },
];

const EXIT_PRESETS: { value: ExitAnimationType; label: string }[] = [
    { value: "fadeOut", label: "페이드 아웃" },
    { value: "slideLeft", label: "← 좌측으로" },
    { value: "slideRight", label: "→ 우측으로" },
    { value: "slideUp", label: "↑ 위로" },
    { value: "slideDown", label: "↓ 아래로" },
    { value: "zoomOut", label: "축소 퇴장" },
    { value: "shrink", label: "수축" },
    { value: "collapse", label: "접기" },
];

const LOOP_PRESETS: { value: LoopAnimationType; label: string }[] = [
    { value: "pulse", label: "펄스" },
    { value: "float", label: "떠다니기" },
    { value: "rotate", label: "회전" },
    { value: "blink", label: "깜빡임" },
    { value: "shimmer", label: "반짝임" },
    { value: "breathe", label: "숨쉬기" },
    { value: "scroll", label: "스크롤" },
];

const EASING_PRESETS = [
    { value: "ease", label: "Ease" },
    { value: "ease-in", label: "Ease In" },
    { value: "ease-out", label: "Ease Out" },
    { value: "ease-in-out", label: "Ease In-Out" },
    { value: "linear", label: "Linear" },
    { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Bouncy" },
    { value: "cubic-bezier(0.25, 0.46, 0.45, 0.94)", label: "Smooth" },
];

interface AnimateTabProps {
    element: GraphicElement;
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
}

export function AnimateTab({ element, onUpdate }: AnimateTabProps) {
    return (
        <>
            {/* Enter 애니메이션 */}
            <div className="ins-section">
                <div className="ins-section-title">Enter</div>
                <div className="ins-row">
                    <span className="ins-label">효과</span>
                    <select
                        className="ins-select"
                        value={element.animation?.enter?.type || ""}
                        onChange={(e) => {
                            const type = e.target.value as EnterAnimationType | "";
                            const anim: ElementAnimation = { ...element.animation };
                            if (type) {
                                anim.enter = {
                                    type: type as EnterAnimationType,
                                    duration: anim.enter?.duration ?? 500,
                                    delay: anim.enter?.delay ?? 0,
                                    easing: anim.enter?.easing ?? "ease-out",
                                };
                            } else {
                                delete anim.enter;
                            }
                            onUpdate(element.id, { animation: anim });
                        }}
                    >
                        <option value="">없음</option>
                        {ENTER_PRESETS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                </div>
                {element.animation?.enter && (
                    <AnimationControls
                        phase="enter"
                        element={element}
                        onUpdate={onUpdate}
                    />
                )}
            </div>

            {/* Exit 애니메이션 */}
            <div className="ins-section">
                <div className="ins-section-title">Exit</div>
                <div className="ins-row">
                    <span className="ins-label">효과</span>
                    <select
                        className="ins-select"
                        value={element.animation?.exit?.type || ""}
                        onChange={(e) => {
                            const type = e.target.value as ExitAnimationType | "";
                            const anim: ElementAnimation = { ...element.animation };
                            if (type) {
                                anim.exit = {
                                    type: type as ExitAnimationType,
                                    duration: anim.exit?.duration ?? 400,
                                    delay: anim.exit?.delay ?? 0,
                                    easing: anim.exit?.easing ?? "ease-in",
                                };
                            } else {
                                delete anim.exit;
                            }
                            onUpdate(element.id, { animation: anim });
                        }}
                    >
                        <option value="">없음</option>
                        {EXIT_PRESETS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                </div>
                {element.animation?.exit && (
                    <AnimationControls
                        phase="exit"
                        element={element}
                        onUpdate={onUpdate}
                    />
                )}
            </div>

            {/* Loop 애니메이션 */}
            <div className="ins-section">
                <div className="ins-section-title">Loop</div>
                <div className="ins-row">
                    <span className="ins-label">효과</span>
                    <select
                        className="ins-select"
                        value={element.animation?.loop?.type || ""}
                        onChange={(e) => {
                            const type = e.target.value as LoopAnimationType | "";
                            const anim: ElementAnimation = { ...element.animation };
                            if (type) {
                                anim.loop = {
                                    type: type as LoopAnimationType,
                                    duration: anim.loop?.duration ?? 2000,
                                    iterationCount: anim.loop?.iterationCount ?? "infinite",
                                };
                            } else {
                                delete anim.loop;
                            }
                            onUpdate(element.id, { animation: anim });
                        }}
                    >
                        <option value="">없음</option>
                        {LOOP_PRESETS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                </div>
                {element.animation?.loop && (
                    <>
                        <div className="ins-row-slider">
                            <span className="ins-label">주기</span>
                            <input
                                type="range" min={200} max={10000} step={100}
                                className="ins-slider"
                                value={element.animation.loop.duration}
                                onChange={(e) => {
                                    const anim = { ...element.animation };
                                    anim.loop = { ...anim.loop!, duration: Number(e.target.value) };
                                    onUpdate(element.id, { animation: anim });
                                }}
                            />
                            <span className="ins-value">{element.animation.loop.duration}ms</span>
                        </div>
                        <div className="ins-row">
                            <span className="ins-label">반복</span>
                            <select
                                className="ins-select"
                                value={String(element.animation.loop.iterationCount)}
                                onChange={(e) => {
                                    const anim = { ...element.animation };
                                    const val = e.target.value;
                                    anim.loop = {
                                        ...anim.loop!,
                                        iterationCount: val === "infinite" ? "infinite" : Number(val),
                                    };
                                    onUpdate(element.id, { animation: anim });
                                }}
                            >
                                <option value="infinite">무한</option>
                                <option value="1">1회</option>
                                <option value="2">2회</option>
                                <option value="3">3회</option>
                                <option value="5">5회</option>
                                <option value="10">10회</option>
                            </select>
                        </div>
                    </>
                )}
            </div>

            {/* 애니메이션 초기화 버튼 */}
            {element.animation && (element.animation.enter || element.animation.exit || element.animation.loop) && (
                <div className="ins-section">
                    <button
                        type="button"
                        className="animation-reset-btn"
                        onClick={() => onUpdate(element.id, { animation: undefined })}
                    >
                        🗑 모든 애니메이션 초기화
                    </button>
                </div>
            )}
        </>
    );
}


// ─── 서브 컴포넌트: Enter/Exit 공통 컨트롤 (시간/딜레이/이징) ───────
// Why 공통화?
// → Enter과 Exit의 컨트롤 UI가 구조적으로 동일 (시간/딜레이/이징 3행).
//   원본에서는 같은 코드가 2번 반복되었으나, phase 인자로 분기하여 DRY화.

function AnimationControls({
    phase,
    element,
    onUpdate,
}: {
    phase: "enter" | "exit";
    element: GraphicElement;
    onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
}) {
    const anim = element.animation?.[phase];
    if (!anim) return null;

    const updatePhase = (field: string, value: number | string) => {
        const updated = { ...element.animation };
        (updated as Record<string, unknown>)[phase] = { ...anim, [field]: value };
        onUpdate(element.id, { animation: updated as ElementAnimation });
    };

    return (
        <>
            <div className="ins-row-slider">
                <span className="ins-label">시간</span>
                <input
                    type="range" min={100} max={3000} step={50}
                    className="ins-slider"
                    value={anim.duration}
                    onChange={(e) => updatePhase("duration", Number(e.target.value))}
                />
                <span className="ins-value">{anim.duration}ms</span>
            </div>
            <div className="ins-row-slider">
                <span className="ins-label">딜레이</span>
                <input
                    type="range" min={0} max={5000} step={50}
                    className="ins-slider"
                    value={anim.delay}
                    onChange={(e) => updatePhase("delay", Number(e.target.value))}
                />
                <span className="ins-value">{anim.delay}ms</span>
            </div>
            <div className="ins-row">
                <span className="ins-label">이징</span>
                <select
                    className="ins-select"
                    value={anim.easing}
                    onChange={(e) => updatePhase("easing", e.target.value)}
                >
                    {EASING_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                </select>
            </div>
        </>
    );
}
