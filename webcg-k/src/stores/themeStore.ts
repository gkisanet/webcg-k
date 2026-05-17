/**
 * Theme Store — 전역 테마 상태 관리
 *
 * @tanstack/react-store 패턴 (timelineStore, actionLogStore와 동일).
 *
 * ■ Why separate store?
 *   Theme state는 timeline state와 직교(orthogonal)한다.
 *   하나의 store에 합치면 테마 변경 시 모든 timeline 구독자가
 *   불필요하게 re-render된다.
 */

import { Store } from "@tanstack/store";
import type { ThemeTokens, ThemePresetId } from "../lib/types/semanticTypes";
import { getPresetTheme } from "../components/SemanticRenderer/themePresets";

// ─── State ─────────────────────────────────────────────────────────

interface ThemeState {
  activeTheme: ThemeTokens;
  activePresetId: ThemePresetId;
  /** bundle의 theme_config에서 온 override인지 */
  isBundleOverride: boolean;
  /** DB bundle.theme_config 원본 (diff 감지용) */
  bundleConfig: ThemeTokens | null;
}

const initialState: ThemeState = {
  activeTheme: getPresetTheme("news"),
  activePresetId: "news",
  isBundleOverride: false,
  bundleConfig: null,
};

export const themeStore = new Store<ThemeState>(initialState);

// ─── Actions ───────────────────────────────────────────────────────

/** preset 테마로 전환 */
export function setThemePreset(presetId: ThemePresetId): void {
  themeStore.setState((state) => ({
    ...state,
    activeTheme: getPresetTheme(presetId),
    activePresetId: presetId,
    isBundleOverride: false,
    bundleConfig: null,
  }));
}

/** bundle의 theme_config로 override */
export function applyBundleTheme(themeTokens: ThemeTokens): void {
  themeStore.setState((state) => ({
    ...state,
    activeTheme: themeTokens,
    isBundleOverride: true,
    bundleConfig: themeTokens,
  }));
}

/** bundle override 해제 → preset으로 복귀 */
export function clearBundleTheme(): void {
  themeStore.setState((state) => ({
    ...state,
    activeTheme: getPresetTheme(state.activePresetId),
    isBundleOverride: false,
    bundleConfig: null,
  }));
}

/** 특정 ThemeTokens 필드 부분 업데이트 (수정 시 자동으로 custom 프리셋으로 전환) */
export function updateThemeToken<K extends keyof ThemeTokens>(
  key: K,
  value: ThemeTokens[K],
): void {
  themeStore.setState((state) => ({
    ...state,
    activeTheme: { ...state.activeTheme, [key]: value },
    activePresetId: "custom",
  }));
}
