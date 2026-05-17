/**
 * ThemeProvider — --cg-* CSS Custom Properties 런타임 주입
 *
 * themeStore를 구독하여 activeTheme 변경 시
 * document.documentElement.style.setProperty()로 모든 --cg-* 변수를 갱신한다.
 *
 * ■ Why CSS Custom Properties?
 *   테마 변경 시 GPU 가속 repaint만 발생. React reconciliation overhead 없음.
 *   모든 DOM 요소가 단일 paint frame에서 새 변수값으로 업데이트된다.
 *
 * ■ 주입 변수:
 *   --cg-color-primary / --cg-color-accent / --cg-color-bg
 *   --cg-color-text / --cg-color-text-muted
 *   --cg-font-family
 *   --cg-font-size-{headline_primary, secondary_text, meta_info, description, label, quote}
 *   --cg-radius / --cg-safe-padding
 */

import { type ReactNode, useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import { themeStore } from "../../stores/themeStore";
import type { SemanticRole } from "../../lib/types/semanticTypes";

// ─── Props ─────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: ReactNode;
}

// ─── Injector ──────────────────────────────────────────────────────

const ALL_ROLES: SemanticRole[] = [
  "headline_primary",
  "secondary_text",
  "meta_info",
  "description",
  "label",
  "quote",
];

function injectThemeVariables(): void {
  const { activeTheme } = themeStore.state;
  const { colors, typography, layout } = activeTheme;
  const root = document.documentElement;

  // Colors
  root.style.setProperty("--cg-color-primary", colors.primary);
  root.style.setProperty("--cg-color-accent", colors.accent);
  root.style.setProperty("--cg-color-bg", colors.background);
  root.style.setProperty("--cg-color-text", colors.text.main);
  root.style.setProperty("--cg-color-text-muted", colors.text.muted);

  // Typography
  root.style.setProperty("--cg-font-family", typography.fontFamily);
  for (const role of ALL_ROLES) {
    root.style.setProperty(
      `--cg-font-size-${role}`,
      typography.scale[role] ?? "1.5rem",
    );
  }

  // Layout
  root.style.setProperty("--cg-radius", layout.borderRadius);
  root.style.setProperty("--cg-safe-padding", layout.safeAreaPadding);
}

// ─── Component ─────────────────────────────────────────────────────

export function ThemeProvider({ children }: ThemeProviderProps) {
  // themeStore 구독 — activeTheme 변경 시마다 리렌더
  useStore(themeStore, (s) => s.activeTheme);

  useEffect(() => {
    injectThemeVariables();
  });

  return <>{children}</>;
}
