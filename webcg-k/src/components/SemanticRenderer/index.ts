/**
 * SemanticRenderer — barrel export
 *
 * WebCG-K v3: Semantic & Fluid CG 렌더링 시스템
 *
 * 사용법:
 * ```tsx
 * import { SemanticRenderer, ThemeProvider, themeStore, setThemePreset } from "@/components/SemanticRenderer";
 * ```
 */

export { SemanticRenderer } from "./SemanticRenderer";
export type { SemanticPhase } from "./SemanticRenderer";
export { NodeRenderer, SafeNodeRenderer } from "./NodeRenderer";
export { ThemeProvider } from "./ThemeProvider";
export { THEME_PRESETS, getPresetTheme } from "./themePresets";
export {
  zoneToBounds,
  containerLogicToCSS,
  alignmentToCSS,
  gapToCSS,
  sizingToCSS,
  layoutIntentToCSS,
  fontSizeStrategy,
  importanceToFontWeight,
  importanceToOpacity,
} from "./layoutUtils";
