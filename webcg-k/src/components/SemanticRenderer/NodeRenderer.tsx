/**
 * NodeRenderer — 재귀적 SemanticNode → DOM 변환 컴포넌트
 *
 * 핵심 렌더링 팩토리:
 * - semantic_role → HTML 요소(h1/h2/p/span/blockquote) 매핑
 * - importance(1~10) → font-weight + opacity 시각적 계층
 * - style_hint → CSS 클래스 (emphasis/muted/warning)
 * - children → 재귀 렌더링 (depth 제한 가드)
 *
 * ■ 방어 장치:
 *   - maxDepth=4: 무한 재귀 JSON으로부터 OBS 소스 보호
 *   - SilentErrorBoundary: 노드별 크래시 격리
 *   - Text-Fit: CSS clamp() + JS Canvas measureText() 2중 방어.
 *     clamp()가 1차 대응, JS scaleX가 최종 overflow 방지.
 *
 * 모든 스타일은 var(--cg-*) CSS 변수 참조. 하드코딩 없음.
 */

import React, { createContext, useContext, useMemo } from "react";
import type { SemanticNode, SemanticRole, StyleHint } from "../../lib/types/semanticTypes";
import {
  fontSizeStrategy,
  importanceToFontWeight,
  importanceToOpacity,
  layoutIntentToCSS,
  layoutWeightStyle,
  iconHintToSVG,
  frameClass,
  dividerAttr,
  filterCustomClasses,
} from "./layoutUtils";
import { calculateAutoFitScale } from "../../lib/textMeasure";
import { themeStore } from "../../stores/themeStore";
import { SilentErrorBoundary } from "../ErrorBoundary";

// ─── Container Width Context ────────────────────────────────────────
// SemanticRenderer가 zone bounds 기반으로 제공.
// NodeRenderer는 이 값을 maxWidth로 사용해 JS text-fit 계산.

export const ContainerWidthContext = createContext<number>(1920);

// ─── Font Size Resolver ─────────────────────────────────────────────
// CSS 변수(--cg-font-size-*)의 실제 px 값을 themeStore에서 계산.

function getThemeFontSizePx(role: SemanticRole): number {
  try {
    const { activeTheme } = themeStore.state;
    const sizeStr = activeTheme.typography.scale[role] || "1.5rem";
    const remVal = parseFloat(sizeStr);
    if (isNaN(remVal)) return 24;
    let rootFontSize = 16;
    if (typeof document !== "undefined") {
      rootFontSize =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    }
    return remVal * rootFontSize;
  } catch {
    return 24;
  }
}

function getThemeFontFamily(): string {
  try {
    const { activeTheme } = themeStore.state;
    return activeTheme.typography.fontFamily || "sans-serif";
  } catch {
    return "sans-serif";
  }
}

// ─── SemanticRole → HTML tag ──────────────────────────────────────

const ROLE_TAG_MAP: Record<SemanticRole, keyof HTMLElementTagNameMap> = {
  headline_primary: "h1",
  secondary_text: "h2",
  meta_info: "span",
  description: "p",
  label: "span",
  quote: "blockquote",
};

// ─── StyleHint → inline 보완 스타일 ───────────────────────────────

const HINT_STYLE: Record<StyleHint, React.CSSProperties> = {
  normal: {},
  emphasis: { fontWeight: "bold" },
  muted: { opacity: 0.6 },
  warning: {
    borderLeft: "3px solid var(--cg-color-accent)",
    padding: "0 0 0 var(--cg-safe-padding)",
  },
};

// ─── Props ─────────────────────────────────────────────────────────

interface NodeRendererProps {
  node: SemanticNode;
  depth?: number;
}

const MAX_DEPTH = 4;

// ─── Component ─────────────────────────────────────────────────────

export const NodeRenderer = React.memo(function NodeRenderer({
  node,
  depth = 0,
}: NodeRendererProps) {
  if (depth > MAX_DEPTH) {
    console.warn(
      `[NodeRenderer] maxDepth(${MAX_DEPTH}) 초과. 노드 렌더링 건너뜀.`,
      node.entity_type,
    );
    return null;
  }

  const {
    semantic_role,
    value = "",
    importance = 5,
    style_hint = "normal",
    icon_hint,
    badge,
    custom_css_classes,
    children,
    layout_intent,
  } = node;

  // 화이트리스트 필터링된 커스텀 CSS 클래스
  const customClasses = filterCustomClasses(custom_css_classes);

  const Tag = ROLE_TAG_MAP[semantic_role] ?? "span";

  // importance → visual
  const fontWeight = importanceToFontWeight(importance);
  const opacity = importanceToOpacity(importance);

  // Text-fit: CSS 변수를 참조하는 clamp() 값. getComputedStyle 없이 순수 CSS.
  const fontVar = `var(--cg-font-size-${semantic_role})`;
  const fontSize = fontSizeStrategy(value.length, fontVar);

  // ■ JS Text-Fit 2차 방어 — ContainerWidthContext 기반
  // CSS clamp()가 커버하지 못하는 극단적 긴 텍스트를 Canvas measureText로 감지
  const containerWidth = useContext(ContainerWidthContext);
  const textScale = useMemo(() => {
    if (!value || containerWidth <= 0) return 1;
    const fontSizePx = getThemeFontSizePx(semantic_role);
    const fontFamily = getThemeFontFamily();
    return calculateAutoFitScale(
      value,
      fontSizePx,
      fontFamily,
      fontWeight,
      containerWidth,
    );
  }, [value, semantic_role, fontWeight, containerWidth]);

  const hintStyle = HINT_STYLE[style_hint] ?? {};

  // 자식 렌더링 (재귀)
  let childContent: React.ReactNode = null;
  if (children && children.length > 0 && depth < MAX_DEPTH) {
    const childNodes = children.map((child, i) => (
      <NodeRenderer key={i} node={child} depth={depth + 1} />
    ));

    if (layout_intent) {
      const containerDeco = layout_intent?.container_decoration;
      const frameCls = frameClass(containerDeco?.frame ?? "none");
      const dividerData = dividerAttr(containerDeco?.divider ?? "none");

      childContent = (
        <div
          className={`cg-child-container${frameCls ? ` ${frameCls}` : ""}`}
          data-container-logic={layout_intent.container_logic}
          data-divider={dividerData !== "none" ? dividerData : undefined}
          style={{
            ...layoutIntentToCSS(layout_intent),
            ...layoutWeightStyle(layout_intent.layout_weight),
            position: "relative",
            left: undefined,
            top: undefined,
            width: "100%",
            height: undefined,
          }}
        >
          {childNodes}
        </div>
      );
    } else {
      childContent = <>{childNodes}</>;
    }
  }

  const iconSvg = iconHintToSVG(icon_hint);

  return (
    <Tag
      className={`cg-text-${semantic_role} cg-style-${style_hint}${customClasses ? ` ${customClasses}` : ""}`}
      style={{
        fontFamily: "var(--cg-font-family)",
        fontSize,
        fontWeight,
        opacity,
        color:
          style_hint === "muted"
            ? "var(--cg-color-text-muted)"
            : style_hint === "warning"
              ? "var(--cg-color-accent)"
              : "var(--cg-color-text)",
        lineHeight: 1.3,
        overflowWrap: "break-word",
        hyphens: "auto",
        padding: 0,
        margin: 0,
        // JS Text-Fit: CSS clamp()로 부족할 때 scaleX로 최종 방어
        transform: textScale < 1 ? `scaleX(${textScale})` : undefined,
        transformOrigin: textScale < 1 ? "left center" : undefined,
        willChange: textScale < 1 ? "transform" : undefined,
        ...hintStyle,
      } as React.CSSProperties}
    >
      {iconSvg && (
        <span
          className="cg-icon"
          dangerouslySetInnerHTML={{ __html: iconSvg }}
          aria-hidden="true"
        />
      )}
      {value}
      {badge && <span className="cg-badge">{badge}</span>}
      {childContent}
    </Tag>
  );
});

// ─── Error-Boundary Wrapped Export ────────────────────────────────

export function SafeNodeRenderer(props: NodeRendererProps) {
  return (
    <SilentErrorBoundary componentName={`NodeRenderer:${props.node.entity_type}`}>
      <NodeRenderer {...props} />
    </SilentErrorBoundary>
  );
}
