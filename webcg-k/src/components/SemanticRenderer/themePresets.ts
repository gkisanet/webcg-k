/**
 * Theme Presets — 내장 테마 3종
 *
 * 각 테마는 완전한 ThemeTokens 객체. ThemeStore가 이 값들을 읽어
 * ThemeProvider를 통해 --cg-* CSS 변수로 주입한다.
 *
 * 폰트는 fonts.css에 정의된 폰트 중에서 선택 (Inter, Pretendard, SUIT,
 * Noto Sans KR, Gmarket Sans, Oswald, Roboto Condensed 등).
 */

import type { ThemeTokens, ThemePresetId } from "../../lib/types/semanticTypes";

// ─── News Theme ────────────────────────────────────────────────────
// 보수적이고 신뢰감 있는 뉴스/시사용.
// Serif/Sans-serif 혼합, muted blue accent, 표준적인 사이즈 스케일.

const NEWS_THEME: ThemeTokens = {
  themeId: "news",
  colors: {
    primary: "#1e40af",
    accent: "#3b82f6",
    background: "rgba(15, 23, 42, 0.95)",
    text: {
      main: "#f8fafc",
      muted: "rgba(248, 250, 252, 0.6)",
    },
  },
  typography: {
    fontFamily: '"Noto Sans KR", "Inter", sans-serif',
    scale: {
      headline_primary: "3.5rem",
      secondary_text: "2rem",
      meta_info: "1.125rem",
      description: "1.375rem",
      label: "0.875rem",
      quote: "2rem",
    },
  },
  layout: {
    borderRadius: "0.25rem",
    safeAreaPadding: "2rem",
  },
};

// ─── Variety Theme ─────────────────────────────────────────────────
// 발랄하고 눈에 띄는 예능/엔터테인먼트용.
// Bold rounded fonts, bright accent, 큰 border-radius.

const VARIETY_THEME: ThemeTokens = {
  themeId: "variety",
  colors: {
    primary: "#ec4899",
    accent: "#f97316",
    background: "rgba(30, 15, 40, 0.92)",
    text: {
      main: "#ffffff",
      muted: "rgba(255, 255, 255, 0.55)",
    },
  },
  typography: {
    fontFamily: '"Gmarket Sans", "SUIT", sans-serif',
    scale: {
      headline_primary: "4rem",
      secondary_text: "2.25rem",
      meta_info: "1.25rem",
      description: "1.5rem",
      label: "1rem",
      quote: "2.5rem",
    },
  },
  layout: {
    borderRadius: "0.75rem",
    safeAreaPadding: "1.5rem",
  },
};

// ─── Sports Theme ──────────────────────────────────────────────────
// 역동적이고 고대비의 스포츠 중계용.
// Condensed fonts, high-contrast accent, tight padding.

const SPORTS_THEME: ThemeTokens = {
  themeId: "sports",
  colors: {
    primary: "#dc2626",
    accent: "#fbbf24",
    background: "rgba(10, 10, 20, 0.96)",
    text: {
      main: "#ffffff",
      muted: "rgba(255, 255, 255, 0.65)",
    },
  },
  typography: {
    fontFamily: '"Oswald", "Roboto Condensed", "Inter", sans-serif',
    scale: {
      headline_primary: "3.75rem",
      secondary_text: "2rem",
      meta_info: "1.125rem",
      description: "1.25rem",
      label: "0.8125rem",
      quote: "2.25rem",
    },
  },
  layout: {
    borderRadius: "0.125rem",
    safeAreaPadding: "1.25rem",
  },
};

// ─── Preset Map ────────────────────────────────────────────────────

export const THEME_PRESETS: Record<ThemePresetId, ThemeTokens> = {
  news: NEWS_THEME,
  variety: VARIETY_THEME,
  sports: SPORTS_THEME,
  custom: { ...NEWS_THEME, themeId: "custom" },
};

/** preset ID로 ThemeTokens 조회. custom이면 news 베이스 반환 */
export function getPresetTheme(presetId: ThemePresetId): ThemeTokens {
  return THEME_PRESETS[presetId] ?? NEWS_THEME;
}
