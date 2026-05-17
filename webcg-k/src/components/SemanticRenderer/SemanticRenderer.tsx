/**
 * SemanticRenderer — Scene-level 진입점 컴포넌트
 *
 * SemanticScene JSON을 받아 layout_intent → outer container CSS,
 * semantic_nodes → NodeRenderer 리스트로 변환한다.
 *
 * ■ 애니메이션 수명주기:
 *   phase prop을 받아 CompositorLayer의 AnimPhase와 연동.
 *   "entering": WAAPI fadeIn + slideInUp (GPU 가속)
 *   "stable":   그대로 표시
 *   "leaving":  WAAPI fadeOut + slideOutDown → onfinish → onExitComplete
 *              → React unmount 전에 exit 애니메이션 완료 보장
 */

import React, { useEffect, useMemo, useRef } from "react";
import type { SemanticScene } from "../../lib/types/semanticTypes";
import { layoutIntentToCSS, zoneToBounds, boundsWidthToPx, bgClass, accentBarClass, accentWidthClass, resolveAnimationKeyframes } from "./layoutUtils";
import { SafeNodeRenderer, ContainerWidthContext } from "./NodeRenderer";

// ─── Props ─────────────────────────────────────────────────────────

export type SemanticPhase = "entering" | "stable" | "leaving";

interface SemanticRendererProps {
  scene: SemanticScene;
  phase?: SemanticPhase;
  onExitComplete?: () => void;
}

const DEFAULT_FADE_MS = 500;
const TYPING_STAGGER_MS = 80;  // typewriter: 노드당 stagger delay

// ─── Component ─────────────────────────────────────────────────────

export const SemanticRenderer = React.memo(function SemanticRenderer({
  scene,
  phase = "stable",
  onExitComplete,
}: SemanticRendererProps) {
  const { layout_intent, semantic_nodes, scene_id, scene_decoration } = scene;
  const containerRef = useRef<HTMLDivElement>(null);

  const containerStyle = layoutIntentToCSS(layout_intent);

  const bgClassName = bgClass(scene_decoration?.background ?? "solid");
  const accentBar = scene_decoration?.accent_bar;
  const accentWidth = scene_decoration?.accent_width ?? "medium";
  const layoutWeight = layout_intent.layout_weight ?? "balanced";
  const visualRhythm = layout_intent.visual_rhythm ?? "breathing";

  // ContainerWidthContext — zone bounds 기반 가용 폭을 하위 NodeRenderer에 제공
  const containerWidth = useMemo(() => {
    const bounds = zoneToBounds(layout_intent.zone);
    const safePadding =
      typeof document !== "undefined"
        ? parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--cg-safe-padding",
            ),
          ) || 2
        : 2;
    return boundsWidthToPx(bounds, safePadding);
  }, [layout_intent.zone]);

  // WAAPI 애니메이션 — animation_intent 기반 키프레임 선택
  const animIntent = scene.context?.animation_intent;
  const keyframes = resolveAnimationKeyframes(animIntent);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let anim: Animation | null = null;
    const duration = animIntent === "urgent-flash" ? 250 : animIntent === "stomp-bounce" ? 600 : DEFAULT_FADE_MS;

    if (phase === "entering") {
      anim = el.animate(keyframes.enter, {
        duration,
        easing: animIntent === "stomp-bounce" ? "cubic-bezier(0.34, 1.56, 0.64, 1)" : "ease-out",
        fill: "forwards",
      });
    } else if (phase === "leaving") {
      anim = el.animate(keyframes.exit, {
        duration: duration * 0.7,
        easing: "ease-in",
        fill: "forwards",
      });
      anim.onfinish = () => onExitComplete?.();
    }

    return () => anim?.cancel();
  }, [phase, onExitComplete, animIntent, keyframes.enter, keyframes.exit]);

  if (!semantic_nodes || semantic_nodes.length === 0) return null;

  return (
    <div
      ref={containerRef}
      data-cg-scene={scene_id}
      data-layout-weight={layoutWeight}
      data-visual-rhythm={visualRhythm}
      className={`cg-scene ${bgClassName}`}
      style={containerStyle}
    >
      {accentBar && (
        <div
          className={`cg-accent-bar cg-accent-bar--${accentBar} cg-accent-width-${accentWidth}`}
          aria-hidden="true"
        />
      )}
      <ContainerWidthContext.Provider value={containerWidth}>
        {semantic_nodes.map((node, i) => (
          <SafeNodeRenderer key={i} node={node} depth={0} />
        ))}
      </ContainerWidthContext.Provider>
    </div>
  );
});
