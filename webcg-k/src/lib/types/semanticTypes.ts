/**
 * Semantic Renderer + Design Token Type Definitions
 *
 * WebCG-K v3 아키텍처의 핵심 타입.
 * AI는 HTML/CSS를 생성하지 않고 layout_intent + semantic_nodes JSON만 출력하며,
 * 범용 SemanticRenderer가 ThemeTokens 규칙으로 DOM을 동적 구축한다.
 *
 * 설계 철학: Google SEO의 Schema.org(구조화 데이터) + CSS Flexbox/Grid 추상화의 융합.
 * "내용의 의미(Semantic)와 시각적 표현(Presentation)의 완벽한 분리"
 */

// ─── Semantic Role ─────────────────────────────────────────────────
// 정보의 본질적 역할. SEO의 Schema.org entity type과 동일한 개념.

export type SemanticRole =
  | "headline_primary"  // 가장 중요한 제목/이름 (h1급)
  | "secondary_text"    // 부제목/보조 정보 (h2급)
  | "meta_info"         // 작은 메타 정보 (발음, 날짜, 통계)
  | "description"       // 설명문 (p급)
  | "label"             // 라벨/태그/분류명
  | "quote";            // 인용문/예문

// ─── Style Hint ────────────────────────────────────────────────────
// 데이터가 가진 강조 의도. CSS font-weight/opacity/color로 매핑됨.

export type StyleHint = "normal" | "emphasis" | "muted" | "warning";

/** 노드의 의미를 시각적 아이콘으로 매핑하기 위한 힌트. 렌더러가 SVG 아이콘을 자동 선택. */
export type IconHint = "lightbulb" | "warning" | "info" | "person" | "quote" | "chart" | "globe";

// ─── Theme Tokens ──────────────────────────────────────────────────
// 프로그램별 룩앤필 정의. ThemeProvider가 --cg-* CSS 변수로 주입.

export interface ThemeTokens {
  themeId: string;
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
    /** SemanticRole → CSS font-size 값 (예: "3.5rem") */
    scale: Record<SemanticRole, string>;
  };
  layout: {
    borderRadius: string;
    safeAreaPadding: string;
  };
}

// ─── Theme Preset ID ───────────────────────────────────────────────

export type ThemePresetId = "news" | "variety" | "sports" | "custom";

// ─── Layout Intent ─────────────────────────────────────────────────
// CSS Flexbox/Grid의 추상화. AI는 px 단위의 좌표를 계산하지 않고
// "우측 패널에 세로로, 간격 넓게" 같은 논리적 의도만 전달한다.

export type LayoutZone = "L3" | "Full_Screen" | "Side_Panel_Right" | "OTS";
export type ContainerLogic = "flex-column" | "flex-row" | "grid";
export type Alignment = "start" | "center" | "end" | "space-between";
export type GapSize = "none" | "small" | "medium" | "large";
export type Sizing = "fit-content" | "fill-available";
export type LayoutWeight = "balanced" | "heavy-headline" | "heavy-visual" | "skewed-overlap";
export type VisualRhythm = "compact" | "breathing" | "dramatic";

export interface LayoutIntent {
  zone: LayoutZone;
  container_logic: ContainerLogic;
  alignment: Alignment;
  gap: GapSize;
  sizing: Sizing;
  /** 자식 노드 그룹의 시각적 프레이밍 (기본: none) */
  container_decoration?: ContainerDecoration;
  /** 레이아웃의 시각적 무게 중심 (기본: balanced) */
  layout_weight?: LayoutWeight;
  /** 여백 리듬 — 텍스트와 요소 간 호흡감 (기본: breathing) */
  visual_rhythm?: VisualRhythm;
}

// ─── Scene Decoration ──────────────────────────────────────────────
// 장면 전체의 배경과 분위기를 결정하는 시각 연출 요소.
// ThemeProvider의 --cg-* 변수를 참조하여 렌더링된다.

export type BgType = "solid" | "gradient_to_top" | "gradient_to_bottom" | "gradient_diagonal";
export type AccentBar = "left" | "bottom" | "top" | "corner_bracket";
export type AccentWidth = "thin" | "medium" | "thick";

// ─── Animation Intent ──────────────────────────────────────────────
// 씬의 등장 모션. SemanticRenderer가 이 값에 따라 WAAPI 키프레임을 선택.

export type AnimationIntent =
  | "stomp-bounce"   // 강한 등장 — 예능 벌칙, 충격 발표 (scale 1.2 → 1.0 + translateY)
  | "urgent-flash"   // 긴급 플래시 — 속보, 경고 (opacity 0 → 1 빠르게 + 배경 플래시)
  | "smooth-fade"    // 부드러운 페이드 — 일반 뉴스, 인물 소개 (기본값)
  | "glitch"         // 글리치 — 스포츠 하이라이트, 임팩트 (opacity + translateX 진동)
  | "slide-up"       // 슬라이드업 — 일반 자막 (translateY 40 → 0)
  | "typewriter";    // 타이핑 — 인용, 명언 (노드 stagger reveal)

export interface SceneDecoration {
  background: BgType;
  accent_bar?: AccentBar;
  accent_width?: AccentWidth;
}

// ─── Container Decoration ──────────────────────────────────────────
// children이 있는 노드 그룹의 시각적 프레이밍.

export type FrameType = "none" | "card" | "bordered" | "glass";
export type DividerType = "none" | "line" | "thick_line";

export interface ContainerDecoration {
  frame: FrameType;
  divider: DividerType;
}

// ─── Semantic Node ─────────────────────────────────────────────────
// 정보의 한 단위. SEO의 structured data item에 해당.
// children + layout_intent 로 중첩 레이아웃 지원.

export interface SemanticNode {
  semantic_role: SemanticRole;
  entity_type: string;
  value: string;
  /** 1~10. 폰트 웨이트와 불투명도를 결정하는 시각적 계층 */
  importance: number;
  style_hint: StyleHint;
  /** 시각적 아이콘 힌트. 렌더러가 이 값에 따라 SVG 아이콘을 자동 매핑 */
  icon_hint?: IconHint;
  /** 노드 우측의 작은 컬러 태그 (예: "LIVE", "속보", "NEW") */
  badge?: string;
  /** AI가 주입하는 Tailwind-style 유틸리티 클래스 (화이트리스트 필터링됨).
   *  예: "text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 italic tracking-wide" */
  custom_css_classes?: string;
  /** 중첩 지원: 자식 노드들이 있을 경우 재귀적으로 렌더링 */
  children?: SemanticNode[];
  /** 자식 노드들의 배치 방식. 없으면 부모의 layout_intent 상속 */
  layout_intent?: LayoutIntent;
}

// ─── Semantic Scene ────────────────────────────────────────────────
// 하나의 방송 그래픽 장면 전체 정의.

export interface SemanticScene {
  scene_id: string;
  trigger: string;
  /** AI의 디자인 연출 의도 (Chain of Thought). 이 씬의 시각적 연출 논리를 1~2문장으로 서술 */
  _design_rationale?: string;
  context: {
    graphic_intent: string;
    duration: number;
    /** 씬의 등장 모션 힌트. SemanticRenderer가 키프레임 선택에 참조 */
    animation_intent?: AnimationIntent;
  };
  layout_intent: LayoutIntent;
  /** 장면 전체의 배경/강조 바 연출 (기본: solid, accent 없음) */
  scene_decoration?: SceneDecoration;
  /** AI가 생성한 순수 스타일 CSS. 레이아웃 속성(position, display, width, height, margin 등)은 렌더러가 자동 제거.
   *  색상, 그림자, 그라데이션, 타이포그래피, border-radius, padding, filter 등 시각 효과만 허용. */
  ai_style_sheet?: string;
  semantic_nodes: SemanticNode[];
}

// ─── Theme Template ───────────────────────────────────────────────
// 장르별 큐레이션된 CG Theme. AI가 장르에 맞는 Theme을 생성/추천.

export type Genre = "science" | "news" | "variety" | "sports" | "education" | "documentary";

export type CgTextFormat = "headline" | "name_card" | "quote" | "score" | "description" | "label_list";

export interface ThemeTemplate {
  id: string;
  name: string;
  description?: string;
  genre_tags: Genre[];
  theme_tokens: ThemeTokens;
  default_decoration?: SceneDecoration;
  default_layout?: Partial<LayoutIntent>;
  cg_text_formats: CgTextFormat[];
  is_exemplar: boolean;
  owner_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Internal: Zone Bounding Box ───────────────────────────────────
// layoutUtils가 LayoutIntent.zone을 % 기반 경계 박스로 변환할 때 사용.
// 1920×1080 참조 캔버스 기준.

export interface ZoneBoundingBox {
  left: string;   // "%" 단위 포함
  top: string;
  width: string;
  height: string;
}
