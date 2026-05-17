/**
 * SemanticSceneThumbnail — 1920×1080 방송 캔버스를 CSS scale로 축소하는 공통 썸네일
 *
 * 사용처:
 * - ai-overlay.lazy.tsx (AI Overlay 갤러리 카드)
 * - ai-cuesheet.lazy.tsx StepThemePreview (테마 미리보기)
 */

import { useRef, useEffect, useState } from "react";
import { SemanticRenderer } from "./SemanticRenderer";
import { ThemeProvider } from "./ThemeProvider";
import type { SemanticScene } from "../../lib/types/semanticTypes";

interface SemanticSceneThumbnailProps {
  scene: SemanticScene;
  /** 추가 CSS 클래스 */
  className?: string;
  /** 외부에서 주입할 스타일 (컨테이너 크기 등) */
  style?: React.CSSProperties;
}

export function SemanticSceneThumbnail({ scene, className, style }: SemanticSceneThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.146);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setScale(Math.min(width / 1920, height / 1080));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "1920px",
          height: "1080px",
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      >
        <ThemeProvider>
          <SemanticRenderer scene={scene} phase="stable" />
        </ThemeProvider>
      </div>
    </div>
  );
}
