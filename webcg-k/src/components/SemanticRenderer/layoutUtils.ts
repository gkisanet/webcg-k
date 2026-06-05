/**
 * Layout Utils — LayoutIntent → CSS 변환 + Text-Fit 전략
 *
 * Pure functions. React 의존성 없음.
 * 모든 반환값은 % / rem / clamp() 기반 — FHD/UHD 대응.
 */

import type {
  LayoutIntent,
  LayoutZone,
  ContainerLogic,
  Alignment,
  GapSize,
  Sizing,
  ZoneBoundingBox,
  BgType,
  AccentBar,
  AccentWidth,
  FrameType,
  DividerType,
  IconHint,
  AnimationIntent,
  LayoutWeight,
  VisualRhythm,
} from "../../lib/types/semanticTypes";
import type React from "react";

// ─── Zone → Bounding Box ──────────────────────────────────────────
// 1920×1080 참조 캔버스 기준 % 값 반환.

const ZONE_MAP: Record<LayoutZone, ZoneBoundingBox> = {
  L3: { left: "0%", top: "75%", width: "100%", height: "25%" },
  Full_Screen: { left: "0%", top: "0%", width: "100%", height: "100%" },
  Side_Panel_Right: {
    left: "70%",
    top: "0%",
    width: "30%",
    height: "100%",
  },
  OTS: { left: "50%", top: "22.2%", width: "37.5%", height: "50%" },
};

export function zoneToBounds(zone: LayoutZone): ZoneBoundingBox {
  return ZONE_MAP[zone] ?? ZONE_MAP.Full_Screen;
}

// ─── Container Logic → CSS ────────────────────────────────────────

const CONTAINER_MAP: Record<ContainerLogic, React.CSSProperties> = {
  "flex-column": { display: "flex", flexDirection: "column" },
  "flex-row": { display: "flex", flexDirection: "row" },
  grid: { display: "grid" },
};

export function containerLogicToCSS(
  lc: ContainerLogic,
): React.CSSProperties {
  return CONTAINER_MAP[lc] ?? CONTAINER_MAP["flex-column"];
}

// ─── Alignment → CSS ──────────────────────────────────────────────

const ALIGNMENT_MAP: Record<Alignment, React.CSSProperties> = {
  start: { justifyContent: "flex-start", alignItems: "flex-start" },
  center: { justifyContent: "center", alignItems: "center" },
  end: { justifyContent: "flex-end", alignItems: "flex-end" },
  "space-between": {
    justifyContent: "space-between",
    alignItems: "stretch",
  },
};

export function alignmentToCSS(a: Alignment): React.CSSProperties {
  return ALIGNMENT_MAP[a] ?? ALIGNMENT_MAP.start;
}

// ─── Gap → CSS ────────────────────────────────────────────────────

const GAP_MAP: Record<GapSize, string> = {
  none: "0",
  small: "0.5rem",
  medium: "1rem",
  large: "2rem",
};

export function gapToCSS(g: GapSize): string {
  return GAP_MAP[g] ?? GAP_MAP.medium;
}

// ─── Layout Weight → Container CSS ──────────────────────────────
// layout_weight는 컨테이너 전체의 시각적 무게 중심을 제어.

/** layout_weight → 컨테이너에 적용할 추가 CSS. NodeRenderer가 참조 */
export function layoutWeightStyle(weight: LayoutWeight | undefined): React.CSSProperties {
  if (!weight || weight === "balanced") return {};
  if (weight === "skewed-overlap") {
    return { display: "flex", flexDirection: "row", flexWrap: "wrap", columnGap: "-0.2em", alignItems: "baseline" };
  }
  return {};
}

/** visual_rhythm → gap multiplier. compact=0.5x, breathing=1x(기본), dramatic=2x */
export function visualRhythmMultiplier(rhythm: VisualRhythm | undefined): number {
  switch (rhythm) {
    case "compact": return 0.5;
    case "dramatic": return 2.0;
    default: return 1.0;
  }
}

// ─── Custom CSS Classes Whitelist ────────────────────────────────
// AI가 SemanticNode.custom_css_classes로 주입할 수 있는 Tailwind-style 클래스.
// 레이아웃을 깨뜨리지 않는 시각적 효과만 허용.

const ALLOWED_CSS_CLASSES = new Set([
  // 텍스트 그라데이션
  "text-transparent", "bg-clip-text",
  "bg-gradient-to-r", "bg-gradient-to-l", "bg-gradient-to-t", "bg-gradient-to-b",
  "from-red-400", "from-red-500", "from-orange-400", "from-orange-500",
  "from-yellow-400", "from-green-400", "from-blue-400", "from-purple-400", "from-pink-400",
  "to-red-500", "to-orange-500", "to-yellow-500", "to-green-500", "to-blue-500", "to-purple-500", "to-pink-500",
  // 타이포그래피
  "italic", "not-italic",
  "font-bold", "font-extrabold", "font-black",
  "tracking-tighter", "tracking-tight", "tracking-normal", "tracking-wide", "tracking-wider", "tracking-widest",
  "leading-tight", "leading-normal", "leading-relaxed", "leading-loose",
  "underline", "line-through", "no-underline",
  "uppercase", "lowercase", "capitalize",
  // 효과
  "drop-shadow", "drop-shadow-lg", "drop-shadow-xl",
  "blur-sm", "blur",
  "opacity-90", "opacity-80", "opacity-70",
  // 배경
  "bg-black/30", "bg-black/50", "bg-black/70",
  "bg-white/10", "bg-white/20", "bg-white/30",
  // 스타일
  "rounded", "rounded-md", "rounded-lg", "rounded-full",
  "border", "border-2",
  "px-2", "px-3", "px-4", "py-1", "py-2",
  "shadow", "shadow-lg", "shadow-xl",
  // 애니메이션
  "animate-pulse", "animate-bounce",
]);

/** custom_css_classes 문자열을 화이트리스트로 필터링. 허용된 클래스만 공백 구분 문자열로 반환 */
export function filterCustomClasses(raw: string | string[] | undefined): string {
  if (!raw) return "";
  if (Array.isArray(raw)) return raw.filter((cls) => ALLOWED_CSS_CLASSES.has(cls)).join(" ");
  if (typeof raw !== "string") return "";
  return raw
    .split(/\s+/)
    .filter((cls) => ALLOWED_CSS_CLASSES.has(cls))
    .join(" ");
}

// ─── Sizing → CSS ─────────────────────────────────────────────────

const SIZING_MAP: Record<Sizing, React.CSSProperties> = {
  "fit-content": {
    width: "fit-content",
    height: "fit-content",
    minWidth: "0",
    minHeight: "0",
  },
  "fill-available": { width: "100%", height: "100%" },
};

export function sizingToCSS(s: Sizing): React.CSSProperties {
  return SIZING_MAP[s] ?? SIZING_MAP["fit-content"];
}

// ─── Composite: LayoutIntent → CSS ────────────────────────────────

export function layoutIntentToCSS(li: LayoutIntent): React.CSSProperties {
  const bounds = zoneToBounds(li.zone);
  const container = containerLogicToCSS(li.container_logic);
  const align = alignmentToCSS(li.alignment);
  const sizing = sizingToCSS(li.sizing);

  return {
    position: "absolute",
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
    gap: gapToCSS(li.gap),
    overflow: "hidden",
    pointerEvents: "none",
    ...container,
    ...align,
    ...sizing,
  };
}

// ─── Font Size Strategy (Text-Fit) ─────────────────~~~~~~~~~~~~~~~~
//
// 방송 그래픽에서 텍스트 잘림은 치명적이다.
// 글자 수에 따라 CSS clamp()로 폰트 사이즈를 동적 조정한다.
//
// baseSize는 CSS 값 문자열(예: "var(--cg-font-size-headline_primary)" 또는 "1.5rem").
// CSS 변수 참조일 경우 calc()를 사용해 CSS 레벨에서 크기를 계산한다.
// → getComputedStyle() 호출 없이 순수 CSS로 동작 (리플로우 방지).
//
// clamp(MIN, PREFERRED, MAX)
//   MIN   = baseSize * 0.5
//   PREFERRED = baseSize * scale (글자 수 기반)
//   MAX   = baseSize

export function fontSizeStrategy(
  charCount: number,
  baseSize: string,
): string {
  // 글자 수에 따른 scale
  let scale: number;
  if (charCount <= 10) {
    scale = 1.0;
  } else if (charCount <= 20) {
    scale = 0.85;
  } else if (charCount <= 40) {
    scale = 0.7;
  } else if (charCount <= 80) {
    scale = 0.55;
  } else {
    scale = 0.45;
  }

  const isVar = baseSize.startsWith("var(");

  if (isVar) {
    // CSS 변수 참조 → calc()로 CSS 레벨에서 계산
    return `clamp(calc(${baseSize} * 0.5), calc(${baseSize} * ${scale}), ${baseSize})`;
  }

  // 리터럴 값 (예: "1.5rem") → JS에서 계산 후 clamp
  const match = baseSize.match(/^([\d.]+)(\D+)$/);
  if (!match) return baseSize;
  const numVal = parseFloat(match[1]);
  const unit = match[2];
  return `clamp(${numVal * 0.5}${unit}, ${numVal * scale}${unit}, ${numVal}${unit})`;
}

/**
 * importance(1~10)을 font-weight로 변환.
 * 1-3: 300, 4-6: 400-500, 7-8: 600-700, 9-10: 700-900
 */
export function importanceToFontWeight(importance: number): number {
  if (importance <= 3) return 300;
  if (importance <= 6) return 400 + Math.floor((importance - 4) * 50);
  if (importance <= 8) return 600 + (importance - 7) * 100;
  return 700 + (importance - 9) * 100; // 9→700, 10→800
}

/**
 * importance(1~10)을 opacity로 변환.
 * 1-3: 0.6, 4-6: 0.85, 7-10: 1.0
 */
export function importanceToOpacity(importance: number): number {
  if (importance <= 3) return 0.6;
  if (importance <= 6) return 0.85;
  return 1.0;
}

// ─── Animation Intent → WAAPI Keyframes ───────────────────────

const ENTER_KEYFRAMES: Record<AnimationIntent, Keyframe[]> = {
  "stomp-bounce": [
    { opacity: 0, transform: "scale(1.3) translateY(-30px)", offset: 0 },
    { opacity: 1, transform: "scale(0.95) translateY(5px)", offset: 0.6 },
    { opacity: 1, transform: "scale(1.0) translateY(0)", offset: 1 },
  ],
  "urgent-flash": [
    { opacity: 0, filter: "brightness(2)", offset: 0 },
    { opacity: 0.8, filter: "brightness(1.3)", offset: 0.15 },
    { opacity: 1, filter: "brightness(1)", offset: 0.3 },
  ],
  "smooth-fade": [
    { opacity: 0, transform: "translateY(40px)" },
    { opacity: 1, transform: "translateY(0)" },
  ],
  "glitch": [
    { opacity: 0, transform: "translateX(-8px)", offset: 0 },
    { opacity: 0.7, transform: "translateX(6px)", offset: 0.1 },
    { opacity: 0.5, transform: "translateX(-4px)", offset: 0.2 },
    { opacity: 1, transform: "translateX(0)", offset: 0.35 },
  ],
  "slide-up": [
    { opacity: 0, transform: "translateY(60px)" },
    { opacity: 1, transform: "translateY(0)" },
  ],
  "typewriter": [
    { opacity: 0, transform: "translateY(8px)", offset: 0 },
    { opacity: 1, transform: "translateY(0)", offset: 0.4 },
  ],
};

const EXIT_KEYFRAMES: Record<AnimationIntent, Keyframe[]> = {
  "stomp-bounce": [
    { opacity: 1, transform: "scale(1.0) translateY(0)" },
    { opacity: 0, transform: "scale(0.8) translateY(30px)" },
  ],
  "urgent-flash": [
    { opacity: 1, filter: "brightness(1)" },
    { opacity: 0, filter: "brightness(2)" },
  ],
  "smooth-fade": [
    { opacity: 1, transform: "translateY(0)" },
    { opacity: 0, transform: "translateY(40px)" },
  ],
  "glitch": [
    { opacity: 1, transform: "translateX(0)" },
    { opacity: 0, transform: "translateX(-10px)" },
  ],
  "slide-up": [
    { opacity: 1, transform: "translateY(0)" },
    { opacity: 0, transform: "translateY(-40px)" },
  ],
  "typewriter": [
    { opacity: 1, transform: "translateY(0)" },
    { opacity: 0, transform: "translateY(-8px)" },
  ],
};

/** animation_intent에 해당하는 enter/exit 키프레임 쌍 반환. 기본값 smooth-fade */
export function resolveAnimationKeyframes(intent: AnimationIntent | undefined): {
  enter: Keyframe[];
  exit: Keyframe[];
} {
  const key = intent ?? "smooth-fade";
  return {
    enter: ENTER_KEYFRAMES[key] ?? ENTER_KEYFRAMES["smooth-fade"],
    exit: EXIT_KEYFRAMES[key] ?? EXIT_KEYFRAMES["smooth-fade"],
  };
}

// ─── JS Text-Fit (Canvas 기반 스케일 계산) ─────────────────~~~~~~~~

/**
 * ZoneBoundingBox.width(%)를 px로 변환 (1920px 참조 캔버스 기준).
 * safeAreaPadding을 고려한 실질 가용 폭.
 */
// ─── Scene Decoration → CSS ─────────────────────────────────────

/** background type → CSS 클래스명 */
export function bgClass(bg: BgType): string {
  return `cg-bg-${bg}`;
}

/** accent_bar position → CSS 클래스명 */
export function accentBarClass(bar: AccentBar): string {
  return `cg-accent-bar--${bar}`;
}

/** accent_width → CSS 클래스명 */
export function accentWidthClass(width: AccentWidth): string {
  return `cg-accent-width-${width}`;
}

/** frame type → CSS 클래스명 */
export function frameClass(frame: FrameType): string {
  if (frame === "none") return "";
  return `cg-frame-${frame}`;
}

/** divider type → data-divider 속성값 */
export function dividerAttr(divider: DividerType): string {
  return divider;
}

// ─── IconHint → SVG ────────────────────────────────────────────

const ICON_SVG: Record<IconHint, string> = {
  lightbulb: `<svg viewBox="0 0 24 24"><path d="M9 21h6v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17h8v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>`,
  warning: `<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
  info: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
  person: `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  quote: `<svg viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24"><path d="M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2 2H5V5h14v14z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
};

/** icon_hint → SVG 문자열. 렌더러에서 dangerouslySetInnerHTML로 주입 */
export function iconHintToSVG(hint: IconHint | undefined): string | null {
  if (!hint) return null;
  return ICON_SVG[hint] ?? null;
}

// ─── JS Text-Fit (Canvas 기반 스케일 계산) ─────────────────~~~~~~~~

export function boundsWidthToPx(bounds: ZoneBoundingBox, safePaddingRem: number = 2): number {
  const pct = parseFloat(bounds.width);
  if (isNaN(pct)) return 1920;
  const rawPx = (pct / 100) * 1920;
  const rootFontSize = typeof document !== "undefined"
    ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    : 16;
  const paddingPx = safePaddingRem * rootFontSize * 2;
  return Math.max(rawPx - paddingPx, 200);
}
