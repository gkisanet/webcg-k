/**
 * AI 그래픽 관련 유틸리티 함수 — CSS sanitize + 텍스트 검증
 */

/** AI 생성 CSS에서 잠재적 위협 요소 제거 */
export function sanitizeGraphicCss(css: string): string {
  if (!css) return "";

  return css
    .replace(/@import\s+[^;]+;/gi, "/* @import blocked */")
    .replace(/url\s*\(\s*["']?\s*https?:\/\//gi, "url(data:none/* blocked */")
    .replace(/behavior\s*:/gi, "/* behavior blocked */:")
    .replace(/expression\s*\(/gi, "/* expression blocked */(");
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
