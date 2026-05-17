/**
 * AnimatedGraphicRenderer — DOM/CSS 기반 애니메이션 그래픽 렌더러
 *
 * SVG 정적 스냅샷 대신 HTML div + CSS animation으로 렌더링하여
 * 요소별 독립적인 등장/퇴장/반복 애니메이션을 지원합니다.
 *
 * 사용처: render.tsx (OBS 브라우저 소스), PGM/PVW 모니터
 * 기존 GraphicPreviewRenderer (SVG)는 에디터 미리보기용으로 유지합니다.
 */

import { type CSSProperties, memo, useEffect, useMemo, useRef, useState } from "react";
import type {
    GraphicElement,
    EnterAnimationType,
    ExitAnimationType,
    LoopAnimationType,
} from "./GraphicPreviewRenderer";
import { buildPluginSrcdoc } from "@/lib/webcgkSrcdoc";
import { calculateAutoFitScale, estimateWrappedTextHeight } from "@/lib/textMeasure";

// ─── 상수 ──────────────────────────────────────────────────────────
const DEFAULT_ENTER_DURATION = 500;   // ms
const DEFAULT_ENTER_EASING = "ease-out";
const DEFAULT_EXIT_DURATION = 400;
const DEFAULT_EXIT_EASING = "ease-in";
const DEFAULT_LOOP_DURATION = 2000;

// ─── WAAPI 키프레임 (JS 객체) ──────────────────────────────────────
// ■ Why WAAPI? CSS @keyframes + setTimeout 추정 대신 element.animate() 사용.
//   onfinish 콜백이 렌더링 엔진의 실제 완료 시점에 호출되어 타이밍 결정론 확보.
//   탭 비활성화 시 타이머 스로틀링에도 정확한 종료 감지 가능.
type AnimKeyframes = Keyframe[];

const ENTER_KEYFRAMES: Record<EnterAnimationType, AnimKeyframes> = {
    fadeIn:      [{ opacity: 0 }, { opacity: 1 }],
    slideLeft:   [{ opacity: 0, transform: "translateX(-60px)" }, { opacity: 1, transform: "translateX(0)" }],
    slideRight:  [{ opacity: 0, transform: "translateX(60px)" },  { opacity: 1, transform: "translateX(0)" }],
    slideUp:     [{ opacity: 0, transform: "translateY(40px)" },   { opacity: 1, transform: "translateY(0)" }],
    slideDown:   [{ opacity: 0, transform: "translateY(-40px)" },  { opacity: 1, transform: "translateY(0)" }],
    zoomIn:      [{ opacity: 0, transform: "scale(0.5)" },         { opacity: 1, transform: "scale(1)" }],
    bounce: [
        { opacity: 0, transform: "translateY(30px)", offset: 0 },
        { opacity: 1, transform: "translateY(-8px)", offset: 0.6 },
        { transform: "translateY(4px)", offset: 0.8 },
        { transform: "translateY(0)", offset: 1 },
    ],
    expand:      [{ opacity: 0, transform: "scaleX(0)" },          { opacity: 1, transform: "scaleX(1)" }],
    reveal:      [{ clipPath: "inset(0 100% 0 0)", opacity: 0 },   { clipPath: "inset(0 0 0 0)", opacity: 1 }],
    typewriter:  [{ width: "0px" },                                { width: "100%" }],
};

const EXIT_KEYFRAMES: Record<ExitAnimationType, AnimKeyframes> = {
    fadeOut:     [{ opacity: 1 }, { opacity: 0 }],
    slideLeft:   [{ opacity: 1, transform: "translateX(0)" },   { opacity: 0, transform: "translateX(-60px)" }],
    slideRight:  [{ opacity: 1, transform: "translateX(0)" },   { opacity: 0, transform: "translateX(60px)" }],
    slideUp:     [{ opacity: 1, transform: "translateY(0)" },   { opacity: 0, transform: "translateY(-40px)" }],
    slideDown:   [{ opacity: 1, transform: "translateY(0)" },   { opacity: 0, transform: "translateY(40px)" }],
    zoomOut:     [{ opacity: 1, transform: "scale(1)" },        { opacity: 0, transform: "scale(0.5)" }],
    shrink:      [{ opacity: 1, transform: "scaleX(1)" },       { opacity: 0, transform: "scaleX(0)" }],
    collapse:    [{ opacity: 1, maxHeight: "200px" },           { opacity: 0, maxHeight: "0px" }],
};

const LOOP_KEYFRAMES: Record<LoopAnimationType, AnimKeyframes> = {
    pulse:   [{ transform: "scale(1)", offset: 0 }, { transform: "scale(1.05)", offset: 0.5 }, { transform: "scale(1)", offset: 1 }],
    float:   [{ transform: "translateY(0)", offset: 0 }, { transform: "translateY(-8px)", offset: 0.5 }, { transform: "translateY(0)", offset: 1 }],
    rotate:  [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    blink:   [{ opacity: 1, offset: 0 }, { opacity: 0.3, offset: 0.5 }, { opacity: 1, offset: 1 }],
    shimmer: [{ backgroundPosition: "-200% center" }, { backgroundPosition: "200% center" }],
    breathe: [{ opacity: 1, offset: 0 }, { opacity: 0.6, offset: 0.5 }, { opacity: 1, offset: 1 }],
    scroll:  [{ transform: "translateX(100%)" }, { transform: "translateX(-100%)" }],
};

// ─── WAAPI Animation 빌더 ──────────────────────────────────────────

interface AnimOptions {
    duration: number;
    easing: string;
    delay: number;
    fill: FillMode;
    iterations: number;
}

function buildAnimOptions(element: GraphicElement, phase: "enter" | "exit" | "idle"): {
    enter?: AnimOptions;
    exit?: AnimOptions;
    loop?: AnimOptions;
} {
    const anim = element.animation;
    if (!anim) return {};

    const result: { enter?: AnimOptions; exit?: AnimOptions; loop?: AnimOptions } = {};

    if (phase === "enter" && anim.enter) {
        result.enter = {
            duration: anim.enter.duration ?? DEFAULT_ENTER_DURATION,
            easing: anim.enter.easing ?? DEFAULT_ENTER_EASING,
            delay: anim.enter.delay ?? 0,
            fill: "forwards",
            iterations: 1,
        };
    }
    if (phase === "exit" && anim.exit) {
        result.exit = {
            duration: anim.exit.duration ?? DEFAULT_EXIT_DURATION,
            easing: anim.exit.easing ?? DEFAULT_EXIT_EASING,
            delay: anim.exit.delay ?? 0,
            fill: "forwards",
            iterations: 1,
        };
    }
    if ((phase === "enter" || phase === "idle") && anim.loop) {
        const loopDelay = anim.enter
            ? (anim.enter.duration ?? DEFAULT_ENTER_DURATION) + (anim.enter.delay ?? 0)
            : 0;
        result.loop = {
            duration: anim.loop.duration ?? DEFAULT_LOOP_DURATION,
            easing: "ease-in-out",
            delay: loopDelay,
            fill: "none",
            iterations: anim.loop.iterationCount === "infinite" ? Infinity : (anim.loop.iterationCount ?? Infinity),
        };
    }

    return result;
}

/**
 * DOM 요소에 WAAPI 애니메이션을 적용하고 Animation 객체를 반환한다.
 * 비표준 속성(typewriter, shimmer)은 CSS animation 폴백을 사용한다.
 */
function applyAnimation(
    el: HTMLElement,
    element: GraphicElement,
    phase: "enter" | "exit" | "idle",
    onFinish?: (animType: "enter" | "exit" | "loop") => void,
): Animation[] {
    const anim = element.animation;
    if (!anim) return [];

    const opts = buildAnimOptions(element, phase);
    const created: Animation[] = [];

    const start = (keyframes: AnimKeyframes, options: AnimOptions, type: "enter" | "exit" | "loop") => {
        // 기존 CSS animation 제거 (폴백 충돌 방지)
        el.style.animation = "none";
        const a = el.animate(keyframes, {
            duration: options.duration,
            easing: options.easing,
            delay: options.delay,
            fill: options.fill,
            iterations: options.iterations,
        });
        if (onFinish) {
            a.onfinish = () => onFinish(type);
        }
        created.push(a);
    };

    // Enter
    if (opts.enter && anim.enter) {
        const kf = ENTER_KEYFRAMES[anim.enter.type];
        if (kf) start(kf, opts.enter, "enter");
    }

    // Exit
    if (opts.exit && anim.exit) {
        const kf = EXIT_KEYFRAMES[anim.exit.type];
        if (kf) start(kf, opts.exit, "exit");
    }

    // Loop — enter가 있을 경우 enter의 onfinish에서 시작되도록 지연
    //         enter가 없으면 즉시 시작
    if (opts.loop && anim.loop) {
        const kf = LOOP_KEYFRAMES[anim.loop.type];
        if (kf) {
            if (opts.enter) {
                // enter 완료 후 loop 시작
                const enterAnim = created[0];
                if (enterAnim) {
                    const origFinish = enterAnim.onfinish;
                    enterAnim.onfinish = (evt) => {
                        origFinish?.call(enterAnim, evt);
                        // 이 시점에 enter fill="forwards"가 적용되어 있으므로
                        // loop는 enter의 최종 상태 위에서 실행됨
                        start(kf, opts.loop!, "loop");
                    };
                }
            } else {
                start(kf, opts.loop, "loop");
            }
        }
    }

    return created;
}

// CSS 폴백용 최소 @keyframes (typewriter, shimmer 등 WAAPI 보간 곤란 타입)
function generateFallbackKeyframeStyles(): string {
    const rules: string[] = [];

    const twKf = ENTER_KEYFRAMES.typewriter;
    if (twKf) {
        const from = twKf[0] as Record<string, string>;
        const to = twKf[twKf.length - 1] as Record<string, string>;
        rules.push(`@keyframes enter-typewriter { from { ${Object.entries(from).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';')}; } to { ${Object.entries(to).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';')}; } }`);
    }

    const shKf = LOOP_KEYFRAMES.shimmer;
    if (shKf) {
        const from = shKf[0] as Record<string, string>;
        const to = shKf[shKf.length - 1] as Record<string, string>;
        rules.push(`@keyframes loop-shimmer { from { ${Object.entries(from).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';')}; } to { ${Object.entries(to).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';')}; } }`);
    }

    return rules.join("\n");
}

// CSS 폴백용 animation 문자열 생성
function buildFallbackCSS(element: GraphicElement, phase: "enter" | "exit" | "idle"): string {
    const anim = element.animation;
    if (!anim) return "";

    const parts: string[] = [];

    if (phase === "enter" && anim.enter?.type === "typewriter") {
        const { duration = DEFAULT_ENTER_DURATION, delay = 0, easing = DEFAULT_ENTER_EASING } = anim.enter;
        parts.push(`enter-typewriter ${duration}ms ${easing} ${delay}ms both`);
    }

    if ((phase === "enter" || phase === "idle") && anim.loop?.type === "shimmer") {
        const { duration = DEFAULT_LOOP_DURATION } = anim.loop;
        const loopDelay = anim.enter ? (anim.enter.duration ?? DEFAULT_ENTER_DURATION) + (anim.enter.delay ?? 0) : 0;
        parts.push(`loop-shimmer ${duration}ms ease-in-out ${loopDelay}ms infinite`);
    }

    return parts.join(", ");
}

// ─── CSS 문자열 → 스타일 객체 파싱 ────────────────────────────────

function parseCssToStyle(cssText?: string): CSSProperties {
    if (!cssText) return {};
    const style: Record<string, string> = {};
    const declarations = cssText.split(";").filter(Boolean);
    for (const decl of declarations) {
        const [prop, value] = decl.split(":").map((s) => s.trim());
        if (prop && value) {
            const camelProp = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
            style[camelProp] = value;
        }
    }
    return style;
}

// ─── Fill → CSS background 변환 ────────────────────────────────────

function fillToBackground(fill?: GraphicElement["fill"]): string {
    if (!fill || fill.type === "none") return "transparent";
    return fill.color || "transparent";
}

// ─── Props ─────────────────────────────────────────────────────────

interface AnimatedGraphicRendererProps {
    elements: GraphicElement[];
    canvasWidth?: number;
    canvasHeight?: number;
    /** 현재 애니메이션 단계 */
    phase?: "enter" | "exit" | "idle";
    /** 데이터 바인딩 값 */
    data?: Record<string, unknown>;
    /** 렌더링 해상도 — 4k일 때 src_4k 이미지를 우선 선택 */
    resolution?: "1080p" | "4k";
    className?: string;
    style?: CSSProperties;
    /** exit 애니메이션이 모두 완료된 후 호출되는 콜백 */
    onExitComplete?: () => void;
}

// ─── 메인 렌더러 컴포넌트 ──────────────────────────────────────────

export const AnimatedGraphicRenderer = memo(function AnimatedGraphicRenderer({
    elements,
    canvasWidth = 1920,
    canvasHeight = 1080,
    phase = "enter",
    data,
    resolution = "1080p",
    className = "",
    style = {},
    onExitComplete,
}: AnimatedGraphicRendererProps) {
    // CSS 폴백 @keyframes (typewriter, shimmer 등 WAAPI 보간 곤란 타입만)
    const fallbackCSS = useMemo(() => generateFallbackKeyframeStyles(), []);

    // ■ 자체 스케일링 (옵션 A: 컴포넌트 내부 캡슐화)
    // Why? render.tsx에서 CSS transform: scale() 제거 후,
    //   DOM 기반 렌더러는 SVG viewBox 같은 네이티브 스케일링이 없으므로
    //   ResizeObserver로 부모 크기를 감지하여 자체 scale을 계산
    const containerRef = useRef<HTMLDivElement>(null);
    const [selfScale, setSelfScale] = useState(1);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width: parentW, height: parentH } = entry.contentRect;
                if (parentW === 0 || parentH === 0) return;
                // 캔버스(canvasWidth×canvasHeight)를 부모 영역에 contain 맞춤
                const sx = parentW / canvasWidth;
                const sy = parentH / canvasHeight;
                setSelfScale(Math.min(sx, sy));
            }
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, [canvasWidth, canvasHeight]);

    // ■ WAAPI 애니메이션 제어 + exit 완료 감지
    // Why WAAPI? element.animate()의 onfinish는 렌더링 엔진이 실제 완료했을 때만 호출.
    //   setTimeout 추정과 달리 탭 비활성화/프레임 드랍에도 정확한 타이밍 보장.
    useEffect(() => {
        if (!containerRef.current) return;

        const allAnimations: Animation[] = [];
        const exitCompletions = new Set<string>();
        let exitElementCount = 0;

        for (const el of elements) {
            if (!el.animation) continue;
            if (el.visible === false) continue;

            const domEl = containerRef.current.querySelector(`[data-element-id="${el.id}"]`) as HTMLElement;
            if (!domEl) continue;

            const isExit = phase === "exit" && !!el.animation.exit;

            const animations = applyAnimation(domEl, el, phase, (animType) => {
                if (animType === "exit") {
                    exitCompletions.add(el.id);
                    if (exitCompletions.size >= exitElementCount) {
                        onExitComplete?.();
                    }
                }
            });

            if (isExit) exitElementCount++;
            allAnimations.push(...animations);
        }

        // exit 대상이 없으면 즉시 완료 콜백
        if (phase === "exit" && exitElementCount === 0) {
            onExitComplete?.();
        }

        return () => {
            for (const a of allAnimations) a.cancel();
        };
    }, [elements, phase, onExitComplete]);

    // 최상위 요소만 (parentId === null) + zIndex 정렬
    const topLevelElements = useMemo(() =>
        elements
            .filter((el) => el.visible !== false && !el.parentId)
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
        [elements],
    );

    // 그룹 자식 찾기 헬퍼
    const getChildren = (parentId: string): GraphicElement[] =>
        elements
            .filter((el) => el.parentId === parentId && el.visible !== false)
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    // 데이터 바인딩: content 치환
    const resolveContent = (element: GraphicElement): string => {
        let content = element.content || "";
        if (element.dataBinding?.field && data) {
            const value = data[element.dataBinding.field];
            if (value !== undefined) {
                if (element.dataBinding.format) {
                    // 포맷 패턴 적용 (예: "{value}°C")
                    content = element.dataBinding.format.replace("{value}", String(value));
                } else {
                    content = String(value);
                }
            }
        }
        return content;
    };

    // ─── 요소 렌더링 (재귀) ────────────────────────────────────

    const renderElement = (element: GraphicElement): React.ReactNode => {
        if (!element.visible) return null;

        const customStyles = parseCssToStyle(element.customCSS);
        const fallbackAnimStr = buildFallbackCSS(element, phase);

        // 공통 스타일 (모든 요소에 적용)
        // 🆕 Visual Effects (Shadow, Glow, Inner Shadow)
        // Why: AnimatedGraphicRenderer는 DOM 기반이므로 SVG <feDropShadow> 대신 CSS 사용
        const hasShadow = (element as any).shadowEnabled;
        const editorShadowCSS = hasShadow
            ? `drop-shadow(${(element as any).shadowOffsetX || 2}px ${(element as any).shadowOffsetY || 2}px ${(element as any).shadowBlur || 4}px ${(element as any).shadowColor || '#000000'}80)`
            : undefined;
            
        const hasGlow = (element as any).glowEnabled;
        const editorGlowCSS = hasGlow
            ? `drop-shadow(0px 0px ${(element as any).glowBlur || 10}px ${(element as any).glowColor || '#00e5ff'}CC)`
            : undefined;

        // 기존 element.filter와 에디터 shadow/glow 합성
        const combinedFilter = [element.filter, editorShadowCSS, editorGlowCSS].filter(Boolean).join(' ') || undefined;

        const hasInnerShadow = (element as any).innerShadowEnabled && (element.type === "rect" || element.type === "ellipse");
        const editorInnerShadowCSS = hasInnerShadow
            ? `inset ${(element as any).innerShadowOffsetX || 2}px ${(element as any).innerShadowOffsetY || 2}px ${(element as any).innerShadowBlur || 4}px ${(element as any).innerShadowColor || '#000000'}CC`
            : undefined;

        // 🆕 에디터 Stroke 스타일 → CSS border 변환
        const editorStroke = (element as any).stroke;
        const strokeStyle = editorStroke?.style || 'solid';
        const strokeOpacity = editorStroke?.opacity ?? 1;

        const baseStyle: CSSProperties = {
            position: element.position || "absolute",
            // 📐 position이 relative면 left/top을 무효화하여 자연스러운 flex 레이아웃에 참여하도록 함
            left: element.position === "relative" ? undefined : `${element.x}px`,
            top: element.position === "relative" ? undefined : `${element.y}px`,
            width: `${element.width}px`,
            height: `${element.height}px`,
            opacity: element.opacity,
            transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
            zIndex: element.zIndex,
            // GPU 가속 힌트
            willChange: fallbackAnimStr ? "transform, opacity" : undefined,
            // 애니메이션
            animation: fallbackAnimStr || undefined,
            // 🆕 고급 시각 효과 (Phase 2 확장)
            boxShadow: [element.boxShadow, editorInnerShadowCSS].filter(Boolean).join(', ') || undefined,
            textShadow: element.textShadow,
            backdropFilter: element.backdropFilter,
            padding: element.padding,
            lineHeight: element.lineHeight,
            letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : undefined,
            // 🆕 Blend Mode: 에디터 blendMode 필드 우선, 없으면 mixBlendMode 필드 사용
            mixBlendMode: ((element as any).blendMode && (element as any).blendMode !== 'normal'
                ? (element as any).blendMode
                : element.mixBlendMode) as any,
            // 🆕 필터: 에디터 shadow와 element.filter를 합성
            filter: combinedFilter,
            // 🆕 고정폭 숫자
            fontVariantNumeric: (element as any).tabularNums ? 'tabular-nums' : undefined,
            // 📐 선언적 레이아웃 시스템 (Phase 3 확장)
            display: element.display === "absolute" ? undefined : element.display, // 기본 HTML absolute와 혼동 피함
            flexDirection: element.flexDirection as any,
            justifyContent: element.justifyContent,
            alignItems: element.alignItems,
            gap: element.gap ? `${element.gap}px` : undefined,
            ...customStyles,
        };

        switch (element.type) {
            case "rect": {
                const bg = fillToBackground(element.fill);
                const fillOpacity = element.fill?.opacity ?? 1;
                // 🆕 Binding Container 슬롯 텍스트 (DOM 렌더러)
                const bc = element.bindingContainer;
                const hasSlots = bc?.enabled && bc.slots.length > 0;
                return (
                    <div
                        key={element.id}
                        data-element-id={element.id}
                        style={{
                            ...baseStyle,
                            background: bg,
                            opacity: element.opacity * fillOpacity,
                            borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined,
                            border: element.stroke?.enabled
                                ? `${element.stroke.width ?? 1}px ${strokeStyle} ${element.stroke.color || "#000"}`
                                : undefined,
                            borderColor: element.stroke?.enabled && strokeOpacity < 1
                                ? undefined  // opacity는 아래에서 별도 처리
                                : undefined,
                            // Stroke 투명도가 1 미만이면 border에 별도 opacity 적용
                            ...(element.stroke?.enabled && strokeOpacity < 1 ? {
                                borderColor: `${element.stroke.color || '#000'}${Math.round(strokeOpacity * 255).toString(16).padStart(2, '0')}`,
                            } : {}),
                            // 슬롯이 있으면 relative 포지셔닝 (자식 absolute 배치용)
                            overflow: hasSlots ? "hidden" : undefined,
                        }}
                    >
                        {/* Binding Container — Text Frame 기반 렌더링 */}
                        {hasSlots && bc.slots.map((slot) => {
                            const content = slot.content || "";
                            const autoFitMode = bc.autoFit;

                            // wrap 모드: 줄바꿈 허용 + auto-expand
                            if (autoFitMode === "wrap") {
                                // 🆕 auto-expand: 저장된 frameHeight가 짧으면 렌더링에서도 자동 확장
                                const estH = estimateWrappedTextHeight(
                                    content, slot.fontSize, slot.fontFamily, slot.fontWeight, slot.frameWidth,
                                );
                                const renderH = estH > slot.frameHeight
                                    ? Math.min(Math.ceil(estH), element.height - slot.frameY)
                                    : slot.frameHeight;
                                return (
                                    <div
                                        key={slot.id}
                                        data-slot-id={slot.id}
                                        style={{
                                            position: "absolute",
                                            left: `${slot.frameX}px`,
                                            top: `${slot.frameY}px`,
                                            width: `${slot.frameWidth}px`,
                                            height: `${renderH}px`,
                                            color: slot.color,
                                            fontSize: `${slot.fontSize}px`,
                                            fontFamily: slot.fontFamily,
                                            fontWeight: slot.fontWeight,
                                            textAlign: slot.textAlign,
                                            display: "flex",
                                            alignItems: "center",
                                            overflow: "hidden",
                                            wordWrap: "break-word",
                                            whiteSpace: "pre-wrap",
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        {content}
                                    </div>
                                );
                            }

                            // shrink 모드: scaleX 압축
                            const scaleX = autoFitMode === "shrink"
                                ? calculateAutoFitScale(
                                    content, slot.fontSize, slot.fontFamily, slot.fontWeight, slot.frameWidth,
                                )
                                : 1;
                            return (
                                <div
                                    key={slot.id}
                                    data-slot-id={slot.id}
                                    style={{
                                        position: "absolute",
                                        left: `${slot.frameX}px`,
                                        top: `${slot.frameY}px`,
                                        width: `${slot.frameWidth}px`,
                                        height: `${slot.frameHeight}px`,
                                        color: slot.color,
                                        fontSize: `${slot.fontSize}px`,
                                        fontFamily: slot.fontFamily,
                                        fontWeight: slot.fontWeight,
                                        textAlign: slot.textAlign,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: slot.textAlign === "center" ? "center" : slot.textAlign === "right" ? "flex-end" : "flex-start",
                                        overflow: "hidden",
                                        whiteSpace: "nowrap",
                                        transform: scaleX < 1 ? `scaleX(${scaleX})` : undefined,
                                        transformOrigin: slot.textAlign === "center" ? "center center" : slot.textAlign === "right" ? "right center" : "left center",
                                    }}
                                >
                                    {content}
                                </div>
                            );
                        })}
                    </div>
                );
            }

            case "ellipse": {
                const bg = fillToBackground(element.fill);
                return (
                    <div
                        key={element.id}
                        data-element-id={element.id}
                        style={{
                            ...baseStyle,
                            background: bg,
                            borderRadius: "50%",
                        }}
                    />
                );
            }

            case "text": {
                const content = resolveContent(element);
                const textColor = element.fill?.color || "#ffffff";

                // 🆕 Auto-fit 오버플로우 가드 (DOM 렌더러)
                // ─────────────────────────────────────────────────────
                // Canvas measureText()로 텍스트 폭을 사전 측정하고,
                // element.width를 초과하면 CSS scaleX로 수평 압축.
                //
                // Why scaleX인가? (SVG는 textLength, DOM은 scaleX)
                // → DOM에는 SVG의 textLength 같은 네이티브 압축 속성이 없음.
                //   CSS scaleX가 가장 자연스러운 수평 압축을 제공하며,
                //   GPU 가속도 지원하므로 애니메이션과 함께 사용해도 60fps 유지.
                const fSize = element.fontSize || 24;
                const fFamily = element.fontFamily || "Pretendard, sans-serif";
                const fWeight = element.fontWeight || 400;
                const scaleX = calculateAutoFitScale(
                    content, fSize, fFamily, fWeight, element.width,
                );

                // transform 조합: rotation + scaleX (세심하게 결합)
                const transforms: string[] = [];
                if (element.rotation) transforms.push(`rotate(${element.rotation}deg)`);
                if (scaleX < 1) transforms.push(`scaleX(${scaleX})`);

                // transform-origin: textAlign에 맞춰 설정
                // → left: 왼쪽 기준 압축, center: 중앙 기준, right: 오른쪽 기준
                const fitOrigin = scaleX < 1
                    ? (element.textAlign === "center" ? "center center"
                        : element.textAlign === "right" ? "right center"
                        : "left center")
                    : undefined;

                return (
                    <div
                        key={element.id}
                        data-element-id={element.id}
                        style={{
                            ...baseStyle,
                            color: textColor,
                            fontSize: `${fSize}px`,
                            fontFamily: fFamily,
                            fontWeight: fWeight,
                            textAlign: element.textAlign || "left",
                            display: "flex",
                            alignItems: "center",
                            lineHeight: 1.2,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            // Auto-fit: rotation + scaleX 결합 (baseStyle의 transform 덮어쓰기)
                            transform: transforms.length > 0 ? transforms.join(" ") : undefined,
                            ...(fitOrigin ? { transformOrigin: fitOrigin } : {}),
                        }}
                    >
                        {content}
                    </div>
                );
            }

            case "image": {
                // ■ 해상도별 이미지 URL 선택 (GraphicPreviewRenderer와 동일한 로직)
                // 4K 렌더링 시 src_4k 우선, 없으면 src_2k, 없으면 기본 src
                const imgSrc = resolution === "4k"
                    ? (element.src_4k || element.src_2k || element.src || "")
                    : (element.src_2k || element.src || "");
                return (
                    <div
                        key={element.id}
                        data-element-id={element.id}
                        style={baseStyle}
                    >
                        {imgSrc && (
                            <img
                                src={imgSrc}
                                alt={element.name}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: element.objectFit || "contain",
                                }}
                            />
                        )}
                    </div>
                );
            }

            case "html_plugin": {
                // ■ Why DOM 기반 iframe?
                //   AnimatedGraphicRenderer는 SVG가 아닌 HTML div 기반이므로,
                //   foreignObject 없이 직접 iframe을 배치할 수 있다.
                //   이는 SVG 기반 GraphicPreviewRenderer보다 투명 배경 호환성이 우수.
                if (!element.pluginSourceCode) return null;
                const srcdoc = buildPluginSrcdoc({
                    html: element.pluginSourceCode.html,
                    css: element.pluginSourceCode.css,
                    js: element.pluginSourceCode.js,
                    width: element.width,
                    height: element.height,
                    // enter phase에서는 자동 SHOW — 외부에서 별도 SHOW를 보내지 않으므로
                    autoShow: phase === "enter" || phase === "idle",
                });
                return (
                    <div
                        key={element.id}
                        data-element-id={element.id}
                        style={{
                            ...baseStyle,
                            overflow: "hidden",
                        }}
                    >
                        <iframe
                            srcDoc={srcdoc}
                            sandbox="allow-scripts allow-same-origin"
                            style={{
                                width: "100%",
                                height: "100%",
                                border: "none",
                                background: "transparent",
                                colorScheme: "normal",
                                pointerEvents: "none",
                            }}
                            title={element.name}
                        />
                    </div>
                );
            }

            case "group": {
                const children = getChildren(element.id);
                return (
                    <div
                        key={element.id}
                        data-element-id={element.id}
                        style={baseStyle}
                    >
                        {children.map(renderElement)}
                    </div>
                );
            }

            default:
                return null;
        }
    };

    return (
        <div
            ref={containerRef}
            className={`animated-graphic-renderer ${className}`}
            style={{
                position: "relative",
                // ■ 외부 컨테이너: 부모(render.tsx의 100vw×100vh)를 꽉 채움
                width: "100%",
                height: "100%",
                overflow: "hidden",
                backgroundColor: "transparent",
                ...style,
            }}
        >
            {/* CSS 폴백 키프레임 (typewriter, shimmer 등 WAAPI 보간 곤란 타입) */}
            {fallbackCSS && <style>{fallbackCSS}</style>}

            {/* ■ 내부 좌표계 래퍼: canvasWidth×canvasHeight px 좌표를 부모 영역에 매핑
                 * selfScale = min(parentW/canvasW, parentH/canvasH)
                 * 브라우저가 처음부터 최종 해상도로 레이아웃하므로 sub-pixel 오차 최소화
                 */}
            <div style={{
                position: "absolute",
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                // 중앙 정렬: 종횡비 불일치 시 letterbox 중앙 배치
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) scale(${selfScale})`,
                transformOrigin: "center center",
            }}>
                {topLevelElements.map(renderElement)}
            </div>
        </div>
    );
});
