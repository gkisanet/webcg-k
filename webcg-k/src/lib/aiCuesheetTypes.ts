/**
 * AI 큐시트 타입 정의
 *
 * v4: AI는 콘텐츠 구조(TextSlot[])만 출력하고, 시각 디자인은 사람이 Graphic Tagging으로 제어.
 *     Step 3에서 AI 플러그인 생성 방식처럼 씬별 HTML/CSS 그래픽을 생성.
 *
 * v3: semantic_scene 기반 (SemanticScene + SemanticRenderer)
 * v2: template 기반 (is_new / fields / input_contract 매칭)
 */

import type { ThemeTokens } from "./types/semanticTypes";

// ─── 세션 상태 ─────────────────────────────────────────────────────

export type SessionStatus = "draft" | "in_progress" | "completed";

/** ai_cuesheet_sessions 테이블 미러 */
export interface AiCuesheetSession {
  id: string;
  owner_id: string;
  program_title: string;
  expert_data: { name: string; title: string; affiliation?: string };
  raw_input_json: string | null;
  scene_count: number;
  generated_count: number;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

/** ai_cuesheet_session_scenes 테이블 미러 */
export interface AiCuesheetSessionScene {
  id: string;
  session_id: string;
  scene_order: number;
  trigger_note: string | null;
  scene_data: SceneContent;
  generated_html: string | null;
  generated_css: string | null;
  created_at: string;
}

/** TanStack Table 세션 목록용 flat row */
export interface SessionListRow {
  id: string;
  program_title: string;
  expert_name: string;
  status: SessionStatus;
  scene_count: number;
  generated_count: number;
  created_at: string;
  updated_at: string;
}

// ─── 콘텐츠 구조 (AI 출력 + 사람 검토) ────────────────────────────

/**
 * 정보의 성격 — Graphic Tagging에서 HTML 요소에 data-semantic 태깅할 때 사용.
 *
 * ⚠️ SSOT: 새 role 추가 시 lib/semanticRoleDefs.ts 의 SEMANTIC_ROLE_DEFS 에만 추가하세요.
 *   이 union type과 buildSystemPrompt, GRAPHIC_GENERATION_SYSTEM_PROMPT 가 자동 반영됩니다.
 */
export type SemanticRole = string;

/** 화면 배치 영역 힌트 */
export type ZoneHint =
  | "bottom_bar"     // 하단 20-25% (Lower Third)
  | "top_bar"        // 상단 15-20%
  | "center"         // 중앙 전체
  | "left_third"     // 좌측 1/3
  | "fullscreen";    // 전면

/** 시각적 강조 힌트 */
export type StyleHint = "emphasis" | "normal" | "muted";

/**
 * 하나의 텍스트 조각.
 * AI가 생성하고 사람이 Graphic Tagging에서 오버레이 요소에 매핑.
 */
export interface TextSlot {
  /** 정보의 성격 — data-semantic 어트리뷰트로 HTML 요소에 태깅 */
  semantic_role: SemanticRole;
  /** 실제 표시될 텍스트 값 (AI가 생성, 사람이 수정 가능) */
  value: string;
  /** (선택) 부연설명 — PD 검토용. "왜 이 값이 중요한지" 인간 친화적 설명. CG 화면에 표시되지 않음 */
  context?: string;
  /** 시각적 중요도 1~5 (5: 가장 두드러짐, 1: 작게) */
  importance: number;
  /** 화면상 배치 영역 힌트 */
  zone_hint: ZoneHint;
  /** 강조 스타일 힌트 */
  style_hint: StyleHint;
}

/**
 * 한 장면(Scene)의 콘텐츠 정의.
 * AI는 시각 디자인을 결정하지 않고, 이 SceneContent만 출력한다.
 */
export interface SceneContent {
  order: number;
  /** 방송 트리거 (예: "전문가 첫 등장", "주요 통계 제시") */
  trigger: string;
  /** 이 장면에 그래픽이 필요한 이유 */
  graphic_intent: string;
  /** 지속 시간 (초), 기본값 15 */
  duration: number;
  /** 이 장면에서 화면에 표시할 텍스트 조각들 */
  text_slots: TextSlot[];
  /** AI의 디자인 연출 의도 (Chain of Thought) */
  _design_rationale?: string;
}

// ─── 외부 AI가 출력하는 JSON 구조 ─────────────────────────────────

/** v4: AI가 생성하는 큐시트 — SceneContent[] 기반 */
export interface AiCuesheet {
  /** AI의 디자인 연출 의도 (Chain of Thought). 씬 생성 전 디자인 논리를 먼저 서술 */
  _design_rationale?: string;
  program_title: string;
  expert: {
    name: string;
    title: string;
    affiliation?: string;
  };
  scenes: SceneContent[];
}

// ─── 씬 그래픽 생성 결과 ──────────────────────────────────────────

/** AI가 생성한 한 씬의 그래픽 (HTML+CSS) */
export interface SceneGraphicResult {
  html: string;
  css: string;
  /** AI의 디자인 의도 (1-2문장, 한국어) */
  design_rationale: string;
}

/** 테마 추출 결과 — 생성된 CSS에서 --cg-* 변수를 파싱 */
export interface ExtractedTheme {
  colors: {
    primary: string;
    accent: string;
    background: string;
    text: {
      main: string;
      muted: string;
    };
  };
  typography: {
    fontFamily: string;
  };
  layout: {
    borderRadius: string;
  };
}

export type GraphicGenerationStatus = "idle" | "generating" | "done" | "error";

export interface SceneGraphicState {
  sceneIndex: number;
  status: GraphicGenerationStatus;
  generatedHtml?: string;
  generatedCss?: string;
  appliedThemeId?: string;
  /** overlay_templates.id — 저장된 오버레이 템플릿 참조 */
  overlayTemplateId?: string;
  errorMessage?: string;
}

// ─── 서비스 입출력 ─────────────────────────────────────────────────

export interface ParseResult {
  cuesheet: AiCuesheet | null;
  errors: string[];
  warnings: string[];
}

// ─── 위자드 상태 (영속화용) ────────────────────────────────────────

/** AI 큐시트 위자드 단계 */
export type CuesheetWizardStep =
  | "system-prompt"    // Step 1 (manual): 시스템 프롬프트 복사
  | "source-input"     // Step 1 (api): 자료조사 데이터 입력
  | "content-review"   // Step 2: JSON ↔ GUI 토글 뷰
  | "graphic-generate"; // Step 3: 씬별 AI 그래픽 생성

/** 위자드 전체 상태 스냅샷 — autoSaveWizardState() 입출력 */
export interface CuesheetWizardState {
  sessionId: string | null;
  mode: "manual" | "api";
  step: CuesheetWizardStep;
  visitedSteps: CuesheetWizardStep[];
  sourceMaterial: string;
  systemPrompt: string;
  rawJson: string;
  parseResult: ParseResult | null;
  /** 씬별 그래픽 생성 상태 */
  graphicStates: SceneGraphicState[];
  /** 추출된 테마 저장소 (themeId → ExtractedTheme) */
  extractedThemes: Record<string, ExtractedTheme>;
}
