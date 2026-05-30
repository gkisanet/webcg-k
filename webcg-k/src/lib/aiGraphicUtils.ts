/**
 * AI 그래픽 관련 유틸리티 함수 — CSS sanitize + 텍스트 검증
 */

/** AI 생성 CSS에서 잠재적 위협 요소 제거 */
export function sanitizeGraphicCss(css: string, isFullscreen: boolean = false): string {
  if (!css) return "";

  let sanitized = css
    .replace(/@import\s+[^;]+;/gi, "/* @import blocked */")
    .replace(/url\s*\(\s*["']?\s*https?:\/\//gi, "url(data:none/* blocked */")
    .replace(/behavior\s*:/gi, "/* behavior blocked */:")
    .replace(/expression\s*\(/gi, "/* expression blocked */(");

  if (!isFullscreen) {
    // 15년 차 시니어 아키텍트의 무결성 가드 (ADR):
    // 비-풀스크린 방송 그래픽(Broadcast Graphics)에서 최상위 화면을 꽉 채우는 컨테이너들의 불투명한 배경색을 투명으로 강제 치환합니다.
    // 대상 셀렉터: body, html, .container, .wrapper, .overlay, .canvas, .screen, .graphic-wrap 등
    const targetSelectors = [
      "html", "body", "\\.container", "\\.wrapper", "\\.overlay", "\\.canvas", "\\.screen", 
      "\\.graphic-container", "\\.graphic-wrap", "\\.bg-container", "\\.main-container",
      "#overlay",
      "\\.card", "\\.card-body", "\\.overlay-card", "\\.panel", "\\.box", "\\.graphic-card",
      "\\.main-card", "\\.graphic-bg", "\\.modal", "\\.cg-background", "\\.backdrop"
    ];
    
    targetSelectors.forEach((selector) => {
      // 이 셀렉터를 찾아서 그 안의 background 또는 background-color 속성 중 opaque 한 것을 transparent로 바꿉니다.
      // 예: .container { ... background-color: var(--cg-bg); ... }
      const regex = new RegExp(`(${selector}\\s*(?:,[^{]+)*\\s*\\{[^}]*background(?:-color)?\\s*:\\s*)([^;\\}]+)`, "gi");
      
      sanitized = sanitized.replace(regex, (match, prefix, value) => {
        const trimmedVal = value.trim();
        // 이미 투명하거나 반투명(rgba 중 alpha < 0.95 등)인 경우는 보존합니다.
        if (
          trimmedVal.includes("transparent") || 
          trimmedVal.includes("none") ||
          /rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.\d+)?\s*\)/i.test(trimmedVal)
        ) {
          return match;
        }
        // 그 외 불투명한 색상(var(--cg-bg), #ffffff, rgb, etc.)은 transparent !important 로 치환
        return prefix + "transparent !important";
      });
    });
  }

  return sanitized;
}

/** TextSlot.value HTML escape + profanity filter + 길이 검증 */
export function sanitizeTextValue(value: string): { sanitized: string; warning?: string } {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const profanityPattern = /\b(?:fuck|shit|ass|damn|씨발|시발|개새끼|병신|미친놈|좆|fucking|motherfucker)\b/i;
  if (profanityPattern.test(value)) {
    return { sanitized: escaped, warning: "부적절한 표현이 감지되었습니다." };
  }

  if (value.length > 100) {
    return { sanitized: escaped, warning: `텍스트가 너무 깁니다 (${value.length}자).` };
  }

  return { sanitized: escaped };
}
