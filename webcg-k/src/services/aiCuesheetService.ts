/**
 * AI 큐시트 서비스 (v4)
 *
 * ■ Step 1: generateCuesheetFromSource() — 소스 자료 → AI → SceneContent[]
 * ■ Step 2: parseAiCuesheetJson() — JSON 파싱 + 검증 (수동 모드용)
 * ■ Step 3: generateSceneGraphic() — 씬별 HTML/CSS 그래픽 생성
 * ■ Theme: extractThemeFromCss() — 생성된 CSS에서 --cg-* 변수 추출
 *
 * v3 → v4 전환:
 *   AI는 더 이상 SemanticScene(시각 디자인)을 생성하지 않는다.
 *   SceneContent + TextSlot[]만 생성하고, 시각 디자인은 Step 3에서
 *   AI 플러그인 생성 방식처럼 씬별로 HTML/CSS를 생성한다.
 */

import type {
  AiCuesheet,
  SceneContent,
  TextSlot,
  ParseResult,
  SceneGraphicResult,
  ExtractedTheme,
} from "../lib/aiCuesheetTypes";
import type { ThemeTokens } from "../lib/types/semanticTypes";
import type { AiCuesheetZoneProfile } from "../lib/aiCuesheetZoneProfile";
import {
  DEFAULT_AI_CUESHEET_ZONE_PROFILE,
  AI_CUESHEET_ZONE_ORDER,
  formatZoneDefinitionForPrompt,
  getZoneDefinition,
} from "../lib/aiCuesheetZoneProfile";
import {
  isValidSemanticRole,
  buildRolePromptFragment,
  buildRoleGraphicPromptFragment,
} from "../lib/semanticRoleDefs";
import { callAI } from "./aiCoreService";
import {
  AI_CUESHEET_DRAFT_FOLDER_NAME,
  ensureOverlayFolder,
} from "./overlayFolderService";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════
// Step 1: 시스템 프롬프트 (SceneContent[] 생성용)
// ═══════════════════════════════════════════════════════════════════

export const AI_CUESHEET_SCHEMA_VERSION = "ai-cuesheet-v4.1";

function normalizeGraphicType(value: unknown): SceneContent["graphic_type"] {
  if (value === "summary_info" || value === "explainer_caption" || value === "stat_visual") {
    return value;
  }
  return undefined;
}

export function buildSystemPrompt(): string {
  return `당신은 WebCG-K 방송 그래픽 시스템의 콘텐츠 기획자입니다.
방송 대본이나 자료를 분석하여, 각 장면(Scene)에서 어떤 텍스트가 화면에 표시되어야 하는지 구조화하는 것이 당신의 역할입니다.

## 핵심 원칙: 콘텐츠만 설계하고, 디자인은 결정하지 않는다
당신은 시각 디자인(색상, 폰트 크기, 레이아웃)을 결정하지 않습니다.
대신 각 텍스트가 **무슨 성격(semantic_role)**이고, **얼마나 중요(importance)**하며,
**어디에 배치되어야 하는지(zone_hint)** 만 지정하세요.
실제 그래픽 디자인은 이후 단계에서 별도 생성됩니다.

## JSON 계약 버전
최상위 JSON에는 반드시 \`schema_version: "${AI_CUESHEET_SCHEMA_VERSION}"\`를 포함하세요.
이 버전은 TextSlot마다 원문 값과 표시 값을 분리하고, 원문 근거를 추적하는 계약입니다.

## TextSlot: 텍스트 조각 정의

각 씬에는 text_slots 배열이 있습니다. 각 TextSlot은:

### semantic_role (정보의 성격)
${buildRolePromptFragment()}

### importance (시각적 중요도 1~5)
- 5: 가장 두드러짐 — 이름, 메인 헤드라인, 핵심 수치
- 4: 강조 — 부제목, 중요 통계
- 3: 중간 — 소속, 일반 텍스트
- 2: 작게 — 보조 정보
- 1: 가장 작게 — 날짜, 출처, 각주

### zone_hint (배치 영역)
- "bottom_bar": 하단 20-25% — Lower Third (가장 일반적)
- "top_bar": 상단 15-20% — 속보, 타이틀
- "center": 중앙 — 메인 타이틀, 명언
- "left_third": 좌측 1/3 — 보조 정보, 용어 해설
- "fullscreen": 전면 — 오프닝, 충격 발표

### style_hint (강조 스타일)
- "emphasis": 강조
- "normal": 기본
- "muted": 약하게

### source_value / display_value / evidence_anchor (v4.1 필수)
- \`source_value\`: 원본 자료에서 실제로 추출한 문장/값입니다. 임의로 요약하거나 꾸미지 마세요.
- \`display_value\`: 방송 그래픽(Broadcast Graphics)에 실제 표시할 문구입니다. 수치/이름은 원문 그대로 유지하고, 부연설명은 시청자가 바로 이해할 수 있는 1~2문장 설명으로 다듬을 수 있습니다.
- \`evidence_anchor\`: source_value가 나온 원문 일부를 10~80자 정도로 짧게 인용합니다. 원문에 존재하지 않는 문구를 만들지 마세요.
- 하위 호환을 위해 \`value\`도 \`display_value\`와 같은 값으로 반드시 채우세요.

나쁜 예:
- source_value: "전문가가 말했다", display_value: "충격 단독" — 원문에 없는 표현을 추가함.
- source_value: "응답자의 72%", display_value: "대부분" — 정확한 수치를 흐림.
- evidence_anchor: "자료에 있음" — 원문 위치를 찾을 수 없는 막연한 근거.

좋은 예:
- source_value: "응답자의 72%가 같은 문제를 경험했다고 답했다", display_value: "72%", evidence_anchor: "응답자의 72%가 같은 문제를 경험"

### context (부연설명, 선택적)
각 text_slot에는 선택적으로 "context" 필드를 추가할 수 있습니다.
context는 방송 그래픽(Broadcast Graphics) 화면에 직접 표시되지 않지만, PD가 콘텐츠를 검토할 때
"이 텍스트가 왜 중요한지", "원본 자료에서 어떤 맥락에서 나온 것인지"를
이해하는 데 도움을 줍니다. 50~200자의 구어체 한국어로 작성하세요.
중요한 통계나 이름에는 반드시 context를 추가하는 것이 좋습니다.

## graphic_intent (디자인 의도)
각 씬에 왜 그래픽이 필요한지 1-2문장으로 설명하세요.
이 의도는 이후 그래픽 디자이너(AI)가 HTML/CSS를 생성할 때 참조합니다.

## graphic_type: 세 가지 제작 유형
각 씬은 반드시 아래 세 가지 중 하나로 분류하세요.

1. "summary_info" — 요약정보
   - 장/주제 전환, 핵심 명제, 지금부터 볼 내용을 짧게 정리합니다.
   - 뉴스 속보식 과장 문구가 아니라 시청자의 맥락 전환을 돕는 안내문이어야 합니다.
2. "explainer_caption" — 부연설명
   - 사용자의 기본 목적입니다. 원문 내용을 한 줄 헤드라인으로 압축하지 말고, 시청자가 이해하기 쉽게 배경·원인·의미를 설명합니다.
   - 자막 위치는 "bottom_bar" 또는 "center"만 사용하세요.
   - display_value는 단순 키워드보다 설명형 문장에 가깝게 작성하세요.
3. "stat_visual" — 통계 또는 그래픽 그림
   - 수치, 비율, 비교, 순서, 변화량이 있을 때만 사용합니다.
   - 이후 그래픽 생성 단계에서 bar, donut, comparison, timeline, pictogram 같은 가벼운 SVG/HTML 도형으로 표현할 수 있게 수치와 단위를 보존하세요.

2~3시간 분량의 긴 영상/대본은 24~36개의 방송 그래픽(Broadcast Graphics) 장면을 목표로 구성하세요.
정보 밀도가 높으면 최대 40개까지 허용합니다. 짧은 자료는 억지로 늘리지 말고 실제 정보량에 맞춰 줄이세요.
반복 발화, 인사말, 잡담, 이미 설명한 내용의 재진술은 장면으로 만들지 마세요.

## 출력 형식
순수 JSON만 출력하세요.

\`\`\`json
{
  "schema_version": "${AI_CUESHEET_SCHEMA_VERSION}",
  "program_title": "알아두면 쓸데있는 현대사회",
  "expert": {
    "name": "홍길동",
    "title": "문화학자",
    "affiliation": "한국대학교"
  },
  "_design_rationale": "이 프로그램의 전반적인 그래픽 연출 방향과 분위기",
  "scenes": [
    {
      "order": 1,
      "graphic_type": "explainer_caption",
      "trigger": "전문가 첫 등장",
      "graphic_intent": "출연자의 전문성과 신뢰도를 시청자에게 각인시킨다",
      "duration": 10,
      "_design_rationale": "인물 소개에 집중. 이름을 가장 크게, 소속은 보조로",
      "text_slots": [
        {
          "semantic_role": "name",
          "value": "홍길동",
          "source_value": "홍길동",
          "display_value": "홍길동",
          "evidence_anchor": "홍길동",
          "importance": 5,
          "zone_hint": "bottom_bar",
          "style_hint": "emphasis"
        },
        {
          "semantic_role": "subtitle",
          "value": "문화학자",
          "source_value": "문화학자",
          "display_value": "문화학자",
          "evidence_anchor": "문화학자",
          "importance": 3,
          "zone_hint": "bottom_bar",
          "style_hint": "normal"
        },
        {
          "semantic_role": "affiliation",
          "value": "한국대학교",
          "source_value": "한국대학교",
          "display_value": "한국대학교",
          "evidence_anchor": "한국대학교",
          "importance": 2,
          "zone_hint": "bottom_bar",
          "style_hint": "muted"
        }
      ]
    },
    {
      "order": 2,
      "graphic_type": "stat_visual",
      "trigger": "핵심 통계 발표",
      "graphic_intent": "핵심 수치를 차분한 시각 요소로 보여주고, 그 수치가 의미하는 바를 설명한다",
      "duration": 8,
      "_design_rationale": "통계 수치를 center 영역에 크게 배치하고, 아래에 의미 설명을 붙인다",
      "text_slots": [
        {
          "semantic_role": "label",
          "value": "조사 결과",
          "source_value": "조사 결과",
          "display_value": "조사 결과",
          "evidence_anchor": "조사 결과",
          "importance": 3,
          "zone_hint": "top_bar",
          "style_hint": "emphasis"
        },
        {
          "semantic_role": "stat",
          "value": "72%",
          "source_value": "국민 10명 중 7명 이상이 경험했다",
          "display_value": "72%",
          "evidence_anchor": "국민 10명 중 7명 이상이 경험",
          "context": "국민 10명 중 7명 이상이 경험한 수치로, 이는 OECD 국가 중 최상위권에 해당합니다. 특히 2030 세대에서 가장 높은 비율을 보였습니다.",
          "importance": 5,
          "zone_hint": "center",
          "style_hint": "emphasis"
        },
        {
          "semantic_role": "subtitle",
          "value": "국민 10명 중 7명이 경험했다",
          "source_value": "국민 10명 중 7명이 경험했다",
          "display_value": "국민 10명 중 7명이 경험했다",
          "evidence_anchor": "국민 10명 중 7명이 경험",
          "importance": 4,
          "zone_hint": "center",
          "style_hint": "normal"
        }
      ]
    }
  ]
}
\`\`\`

## 규칙
1. 모든 장면의 text_slots에 각 텍스트의 **semantic_role을 정확히** 지정하세요.
2. **importance 차별화**: 가장 중요한 정보는 5, 덜 중요한 정보는 1~2로. 모든 걸 3으로 하지 마세요.
3. **graphic_intent는 반드시** 작성하세요.
4. **모든 source_value는 실제 데이터**: 대본/자료에서 추출한 실제 텍스트로 채우세요.
5. **value와 display_value는 동일하게** 방송 그래픽(Broadcast Graphics)에 표시할 최종 문구로 채우세요.
6. **evidence_anchor는 반드시 원문 일부**를 짧게 인용하세요.
7. 각 scene에는 반드시 graphic_type을 넣고, 값은 "summary_info", "explainer_caption", "stat_visual" 중 하나만 사용하세요.
8. 2~3시간 영상/대본은 24~36개 장면을 목표로 하고, 정보 밀도가 높으면 최대 40개까지 구성하세요.
9. 부연설명 자막은 시청자 이해를 돕는 설명형 문장이어야 하며, 뉴스 자막처럼 지나치게 요약된 단정형 헤드라인으로 만들지 마세요.
10. **Zone 분배**: explainer_caption은 bottom_bar 또는 center만 사용하세요. summary_info는 bottom_bar/center, stat_visual은 center 중심으로 사용하세요. fullscreen은 오프닝급 예외에만 사용하세요.
11. 반드시 유효한 JSON만 출력하세요. 마크다운 코드블록 없이 순수 JSON만.`;
}

// ═══════════════════════════════════════════════════════════════════
// Step 1 (API): 소스 자료 → AI → SceneContent[]
// ═══════════════════════════════════════════════════════════════════

export interface CuesheetGenerationOptions {
  systemPromptOverride?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export async function generateCuesheetFromSource(
  sourceMaterial: string,
  options?: CuesheetGenerationOptions,
): Promise<ParseResult> {
  if (!sourceMaterial.trim()) {
    return {
      cuesheet: null,
      errors: ["소스 자료가 비어 있습니다. 대본이나 자료를 입력하세요."],
      warnings: [],
    };
  }

  const systemPrompt = options?.systemPromptOverride ?? buildSystemPrompt();
  const maxOutputTokens = options?.maxOutputTokens ?? 65536;
  const temperature = options?.temperature ?? 0.7;

  const userPrompt = `## 대본 / 자료

${sourceMaterial}

위 자료를 분석하여, 각 정보가 시청자에게 전달되어야 하는 타이밍(trigger)을 포착하고,
최적의 SceneContent 큐시트 JSON을 생성하세요.

## 출력 체크리스트
- program_title: 프로그램 제목
- expert: { name, title, affiliation } — 출연자 정보
- scenes[]: 각 씬은 order, trigger, graphic_intent, duration, text_slots[] 필수
- graphic_type: "summary_info" | "explainer_caption" | "stat_visual" 중 하나
- 모든 text_slots[].value 는 자료에서 추출한 실제 데이터로 채울 것
- 2~3시간 분량이면 24~36개 장면을 목표로 하되 최대 40개를 넘기지 말 것
- 부연설명 자막은 시청자의 이해를 돕는 설명형 문장으로 만들고, 뉴스 헤드라인처럼 과도하게 요약하지 말 것
- 반복/잡담은 제외하되, 이해에 필요한 중요한 정보는 건너뛰지 말 것`;

  try {
    const { text } = await callAI(systemPrompt, userPrompt, {
      maxOutputTokens,
      temperature,
      enforceJsonObject: true,
      requestType: "cuesheet_generation",
    });

    return parseAiCuesheetJson(text);
  } catch (error: any) {
    console.error("[AI-Cuesheet] API 호출 실패:", error);
    return {
      cuesheet: null,
      errors: [`AI API 호출 실패: ${error.message || "알 수 없는 오류"}`],
      warnings: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Step 2: JSON 파싱 + Truncation Recovery (v4 SceneContent 포맷)
// ═══════════════════════════════════════════════════════════════════

export function parseAiCuesheetJson(raw: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let cleaned = raw.trim();

  // 마크다운 코드블록 제거
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // JSON 객체 시작점 찾기
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace !== -1) {
    cleaned = cleaned.slice(firstBrace);
  }

  // 1단계: 직접 파싱
  try {
    const parsed = JSON.parse(cleaned);
    const cuesheet = validateAndBuildCuesheet(parsed, warnings);
    if (cuesheet) return { cuesheet, errors, warnings };
    // 검증 실패 → Level 2로 진행 (v3 format 등)
    warnings.push("JSON 파싱은 성공했으나 v4 형식 검증에 실패했습니다. 복구를 시도합니다.");
  } catch { /* 복구 시도 */ }

  // 2단계: 잘린 JSON 복구
  const recovered = recoverTruncatedJson(cleaned);
  if (recovered) {
    try {
      const parsed = JSON.parse(recovered);
      const cuesheet = validateAndBuildCuesheet(parsed, warnings);
      if (cuesheet) {
        warnings.push("AI 출력이 잘렸지만 복구에 성공했습니다. 일부 씬이 누락되었을 수 있습니다.");
        return { cuesheet, errors, warnings };
      }
    } catch { /* 필드별 추출로 */ }
  }

  // 3단계: 필드별 추출
  const cuesheet = extractCuesheetFields(cleaned, errors, warnings);
  if (cuesheet) {
    return { cuesheet, errors, warnings };
  }

  errors.push("JSON을 파싱할 수 없습니다. 형식을 확인하고 다시 시도하세요.");
  return { cuesheet: null, errors, warnings };
}

// ─── v4: SceneContent 검증 ────────────────────────────────────────

const VALID_ZONE_HINTS = [
  "bottom_bar", "top_bar", "center", "left_third", "fullscreen",
] as const;

const VALID_STYLE_HINTS = ["emphasis", "normal", "muted"] as const;

function isValidZoneHint(v: string): v is TextSlot["zone_hint"] {
  return (VALID_ZONE_HINTS as readonly string[]).includes(v);
}

function isValidStyleHint(v: string): v is TextSlot["style_hint"] {
  return (VALID_STYLE_HINTS as readonly string[]).includes(v);
}

export function buildSceneSlotId(sceneOrder: number, slotIdx: number): string {
  return `scene-${sceneOrder}-slot-${slotIdx + 1}`;
}

function normalizeSlotId(id: unknown, sceneOrder: number, slotIdx: number): string {
  if (typeof id === "string" && id.trim()) {
    return id.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  }
  return buildSceneSlotId(sceneOrder, slotIdx);
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validateTextSlot(slot: Record<string, unknown>, sceneOrder: number, slotIdx: number, warnings: string[]): TextSlot | null {
  const role = slot.semantic_role;
  const legacyValue = optionalTrimmedString(slot.value);
  const sourceValue = optionalTrimmedString(slot.source_value);
  const displayValue = optionalTrimmedString(slot.display_value) ?? legacyValue ?? sourceValue;

  if (typeof role !== "string" || !isValidSemanticRole(role)) {
    warnings.push(`Scene ${sceneOrder} Slot ${slotIdx + 1}: semantic_role이 유효하지 않습니다.`);
    return null;
  }
  if (!displayValue) {
    warnings.push(`Scene ${sceneOrder} Slot ${slotIdx + 1}: value/display_value가 비어 있습니다.`);
    return null;
  }

  return {
    id: normalizeSlotId(slot.id, sceneOrder, slotIdx),
    semantic_role: role,
    value: displayValue,
    source_value: sourceValue ?? legacyValue ?? displayValue,
    display_value: displayValue,
    evidence_anchor: optionalTrimmedString(slot.evidence_anchor),
    context: optionalTrimmedString(slot.context),
    importance: typeof slot.importance === "number" ? Math.max(1, Math.min(5, Math.round(slot.importance))) : 3,
    zone_hint: typeof slot.zone_hint === "string" && isValidZoneHint(slot.zone_hint) ? slot.zone_hint : "bottom_bar",
    style_hint: typeof slot.style_hint === "string" && isValidStyleHint(slot.style_hint) ? slot.style_hint : "normal",
  };
}

// ─── v3 → v4 변환 ─────────────────────────────────────────────

/** v3 SemanticRole → v4 SemanticRole 매핑 */
const V3_TO_V4_ROLE: Record<string, string> = {
  headline_primary: "name",
  secondary_text: "subtitle",
  meta_info: "affiliation",
  description: "subtitle",
  label: "label",
  quote: "quote",
};

/** v3 zone → v4 zone_hint 매핑 */
const V3_TO_V4_ZONE: Record<string, string> = {
  L3: "bottom_bar",
  Full_Screen: "fullscreen",
  Side_Panel_Right: "left_third",
  OTS: "center",
};

/**
 * v3 semantic_scene.semantic_nodes → v4 text_slots[] 변환.
 * AI가 아직 v3 프롬프트로 학습되어 v4 format을 따르지 못할 때 하위 호환.
 */
function convertV3SemanticNodesToSlots(
  sscene: Record<string, unknown>,
  sceneOrder: number,
): TextSlot[] {
  const nodes = Array.isArray(sscene.semantic_nodes) ? sscene.semantic_nodes as Record<string, unknown>[] : [];
  if (nodes.length === 0) return [];

  const zoneRaw = (sscene.layout_intent as Record<string, unknown> | undefined)?.zone;
  const defaultZone: string = typeof zoneRaw === "string" ? (V3_TO_V4_ZONE[zoneRaw] ?? "bottom_bar") : "bottom_bar";

  return nodes.map((node, slotIdx) => {
    const rawRole = typeof node.semantic_role === "string" ? node.semantic_role : "secondary_text";
    const role = V3_TO_V4_ROLE[rawRole] ?? "subtitle";
    const rawValue = typeof node.value === "string" ? node.value : "";
    const rawImportance = typeof node.importance === "number" ? node.importance : 5;
    const importance = Math.max(1, Math.min(5, Math.round(rawImportance / 2)));
    const rawStyle = typeof node.style_hint === "string" ? node.style_hint : "normal";

    return {
      id: buildSceneSlotId(sceneOrder, slotIdx),
      semantic_role: role as TextSlot["semantic_role"],
      value: rawValue,
      source_value: rawValue,
      display_value: rawValue,
      importance,
      zone_hint: defaultZone as TextSlot["zone_hint"],
      style_hint: (rawStyle === "emphasis" || rawStyle === "muted" || rawStyle === "normal"
        ? rawStyle : "normal") as TextSlot["style_hint"],
    };
  });
}

// ─── v4 검증 ────────────────────────────────────────────────────

function validateAndBuildCuesheet(parsed: Record<string, unknown>, warnings: string[]): AiCuesheet | null {
  if (!parsed.program_title || typeof parsed.program_title !== "string") {
    return null;
  }

  const expert = typeof parsed.expert === "object" && parsed.expert !== null
    ? parsed.expert as Record<string, unknown>
    : {};

  if (!expert.name || !expert.title) {
    warnings.push("expert 정보가 불완전합니다.");
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    return null;
  }

  let usedV3Fallback = false;
  const scenes: SceneContent[] = [];
  for (let i = 0; i < parsed.scenes.length; i++) {
    const s = parsed.scenes[i] as Record<string, unknown>;

    if (typeof s.order !== "number" || typeof s.trigger !== "string") {
      warnings.push(`Scene ${i + 1}: 필수 필드(order, trigger)가 누락되어 건너뜁니다.`);
      continue;
    }

    // v4: text_slots 우선
    const textSlotsRaw = Array.isArray(s.text_slots) ? s.text_slots as Record<string, unknown>[] : [];
    let textSlots: TextSlot[] = [];
    for (let j = 0; j < textSlotsRaw.length; j++) {
      const slot = validateTextSlot(textSlotsRaw[j], s.order as number, j, warnings);
      if (slot) textSlots.push(slot);
    }

    // v3 fallback: text_slots가 없으면 semantic_scene에서 변환
    if (textSlots.length === 0) {
      const sscene = s.semantic_scene as Record<string, unknown> | undefined;
      if (sscene && typeof sscene === "object") {
        textSlots = convertV3SemanticNodesToSlots(sscene, s.order as number);
        if (textSlots.length > 0) {
          usedV3Fallback = true;
          warnings.push(`Scene ${i + 1}: v3 semantic_scene에서 자동 변환됨. AI 프롬프트를 업데이트하세요.`);
        }
      }
    }

    if (textSlots.length === 0) {
      warnings.push(`Scene ${i + 1}: 유효한 text_slots가 없어 건너뜁니다.`);
      continue;
    }

    scenes.push({
      order: s.order as number,
      graphic_type: normalizeGraphicType(s.graphic_type),
      trigger: s.trigger as string,
      graphic_intent: typeof s.graphic_intent === "string" ? s.graphic_intent : "",
      duration: typeof s.duration === "number" ? s.duration : 15,
      text_slots: textSlots,
      _design_rationale: typeof s._design_rationale === "string" ? s._design_rationale : undefined,
    });
  }

  if (scenes.length === 0) return null;
  if (usedV3Fallback) {
    warnings.unshift("⚠️ AI가 v3 형식으로 응답했습니다. 시스템 프롬프트가 업데이트되지 않았을 수 있습니다.");
  }

  return {
    schema_version: typeof parsed.schema_version === "string" ? parsed.schema_version : undefined,
    _design_rationale: typeof parsed._design_rationale === "string" ? parsed._design_rationale : undefined,
    program_title: parsed.program_title as string,
    expert: {
      name: (expert.name as string) || "",
      title: (expert.title as string) || "",
      affiliation: expert.affiliation as string | undefined,
    },
    scenes,
  };
}

// ─── JSON 복구 유틸리티 ───────────────────────────────────────────

function recoverTruncatedJson(json: string): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastValidClose = -1;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === "\\") { esc = true; }
      else if (ch === '"') { inStr = false; }
    } else {
      if (ch === '"') { inStr = true; }
      else if (ch === "{") { depth++; }
      else if (ch === "}") {
        depth--;
        if (depth === 0) lastValidClose = i;
      }
      else if (ch === "[") { depth++; }
      else if (ch === "]") {
        depth--;
        if (depth === 0) lastValidClose = i;
      }
    }
  }

  if (lastValidClose > 0 && lastValidClose < json.length - 1) {
    return json.substring(0, lastValidClose + 1);
  }
  return null;
}

function extractJsonStringValue(json: string, key: string): string | null {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
  const keyMatch = keyPattern.exec(json);
  if (!keyMatch) return null;

  const valueStart = keyMatch.index + keyMatch[0].length;
  let i = valueStart;
  let escaped = false;

  while (i < json.length) {
    const ch = json[i];
    if (escaped) {
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === '"') {
      const raw = json.substring(valueStart, i);
      try { return JSON.parse(`"${raw}"`); }
      catch { return raw; }
    }
    i++;
  }

  const truncated = json.substring(valueStart);
  return truncated.length > 0 ? truncated : null;
}

function extractJsonObjectValue(json: string, key: string): Record<string, unknown> | null {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*\\{`);
  const keyMatch = keyPattern.exec(json);
  if (!keyMatch) return null;

  const braceStart = keyMatch.index + keyMatch[0].length - 1;
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = braceStart; i < json.length; i++) {
    const ch = json[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === "\\") { esc = true; }
      else if (ch === '"') { inStr = false; }
    } else {
      if (ch === '"') { inStr = true; }
      else if (ch === "{") { depth++; }
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(json.substring(braceStart, i + 1)); }
          catch { return null; }
        }
      }
    }
  }
  return null;
}

function extractCuesheetFields(json: string, errors: string[], warnings: string[]): AiCuesheet | null {
  const programTitle = extractJsonStringValue(json, "program_title");
  if (!programTitle) {
    errors.push("program_title을 추출할 수 없습니다.");
    return null;
  }

  const expertObj = extractJsonObjectValue(json, "expert");
  const expert = typeof expertObj === "object" && expertObj !== null ? expertObj as Record<string, unknown> : {};

  if (!expert.name && !expert.title) {
    warnings.push("expert 정보를 완전히 복구하지 못했습니다.");
  }

  const scenes = extractScenesArray(json, warnings);
  if (!scenes || scenes.length === 0) {
    errors.push("scenes 배열을 추출할 수 없습니다.");
    return null;
  }

  return {
    schema_version: extractJsonStringValue(json, "schema_version") ?? undefined,
    program_title: programTitle,
    expert: {
      name: (expert.name as string) || "",
      title: (expert.title as string) || "",
      affiliation: expert.affiliation as string | undefined,
    },
    scenes,
  };
}

function extractScenesArray(json: string, warnings: string[]): SceneContent[] | null {
  const keyMatch = /"scenes"\s*:\s*\[/.exec(json);
  if (!keyMatch) return null;

  const arrStart = keyMatch.index + keyMatch[0].length - 1; // '[' 위치
  const items: unknown[] = [];
  let i = arrStart + 1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let itemStart = -1;

  while (i < json.length) {
    const ch = json[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === "\\") { esc = true; }
      else if (ch === '"') { inStr = false; }
    } else {
      if (ch === '"') { inStr = true; }
      else if (ch === "{") {
        if (depth === 0) itemStart = i;
        depth++;
      }
      else if (ch === "}") {
        depth--;
        if (depth === 0 && itemStart >= 0) {
          try { items.push(JSON.parse(json.substring(itemStart, i + 1))); }
          catch { /* 개별 아이템 파싱 실패 무시 */ }
          itemStart = -1;
        }
      }
      else if (ch === "]") break;
    }
    i++;
  }

  if (items.length === 0) return null;

  const scenes: SceneContent[] = [];
  for (let j = 0; j < items.length; j++) {
    const s = items[j] as Record<string, unknown>;

    if (typeof s.order !== "number" || typeof s.trigger !== "string") {
      warnings.push(`Scene ${j + 1}을 복구하지 못했습니다.`);
      continue;
    }

    const textSlotsRaw = Array.isArray(s.text_slots) ? s.text_slots as Record<string, unknown>[] : [];
    let textSlots: TextSlot[] = [];
    for (let k = 0; k < textSlotsRaw.length; k++) {
      const slot = validateTextSlot(textSlotsRaw[k], s.order as number, k, warnings);
      if (slot) textSlots.push(slot);
    }

    // v3 fallback
    if (textSlots.length === 0) {
      const sscene = s.semantic_scene as Record<string, unknown> | undefined;
      if (sscene && typeof sscene === "object") {
        textSlots = convertV3SemanticNodesToSlots(sscene, s.order as number);
        if (textSlots.length > 0) {
          warnings.push(`Scene ${j + 1}: v3 semantic_scene에서 자동 변환됨.`);
        }
      }
    }

    if (textSlots.length === 0) continue;

    scenes.push({
      order: s.order as number,
      graphic_type: normalizeGraphicType(s.graphic_type),
      trigger: s.trigger as string,
      graphic_intent: typeof s.graphic_intent === "string" ? s.graphic_intent : "",
      duration: typeof s.duration === "number" ? s.duration as number : 15,
      text_slots: textSlots,
      _design_rationale: typeof s._design_rationale === "string" ? s._design_rationale : undefined,
    });
  }

  return scenes.length > 0 ? scenes : null;
}

// ═══════════════════════════════════════════════════════════════════
// Hallucination Defense (Phase 3-1)
// ═══════════════════════════════════════════════════════════════════

export interface HallucinationCheck {
  sceneIdx: number;
  slotIdx: number;
  value: string;
  confidence: number;       // 0.0 ~ 1.0
  matchType: "exact" | "substring" | "fuzzy" | "none";
  warning?: string;
}

/**
 * AI가 생성한 TextSlot.value가 원본 sourceMaterial에 실제로 존재하는지 검증.
 *
 * ■ 3단계 매칭:
 *   1. 정규화된 정확 매칭 (소문자, 공백/특수문자 제거)
 *   2. 부분 문자열 매칭 (value가 source에 포함)
 *   3. 단어 단위 매칭 (value의 60% 이상 단어가 source에 존재)
 *
 * @returns HallucinationCheck[] — confidence < 0.5 인 항목은 hallucination 가능성 있음
 */
export function validateAgainstSource(
  scenes: SceneContent[],
  sourceMaterial: string,
): HallucinationCheck[] {
  const results: HallucinationCheck[] = [];

  // Normalize: lowercase, collapse whitespace, remove punctuation except numbers/%
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\w\s\d%]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const sourceWords = new Set(
    normalize(sourceMaterial).split(/\s+/).filter((w) => w.length > 1),
  );

  for (const scene of scenes) {
    for (let j = 0; j < scene.text_slots.length; j++) {
      const slot = scene.text_slots[j];
      const val = slot.value;
      const provenanceValue = slot.evidence_anchor?.trim() || slot.source_value?.trim() || slot.value;
      const valNorm = normalize(provenanceValue);

      // Skip numeric-only values (stats like "72%", "1,234")
      if (/^[\d,.%]+$/.test(valNorm.replace(/[,%]/g, ""))) {
        results.push({
          sceneIdx: scene.order - 1, slotIdx: j, value: val,
          confidence: 1.0, matchType: "exact",
        });
        continue;
      }

      // Skip single-character values
      if (valNorm.length <= 1) {
        results.push({
          sceneIdx: scene.order - 1, slotIdx: j, value: val,
          confidence: 0.5, matchType: "fuzzy",
          warning: "값이 너무 짧아 검증이 불가능합니다.",
        });
        continue;
      }

      // Level 1: Normalized exact match
      const sourceNorm = normalize(sourceMaterial);
      if (sourceNorm.includes(valNorm)) {
        results.push({
          sceneIdx: scene.order - 1, slotIdx: j, value: val,
          confidence: 1.0, matchType: "exact",
        });
        continue;
      }

      // Level 2: Substring match (check if significant portion exists)
      if (valNorm.length >= 3) {
        const subLen = Math.min(valNorm.length - 1, Math.floor(valNorm.length * 0.7));
        let foundSubstring = false;
        for (let start = 0; start <= valNorm.length - subLen; start++) {
          const sub = valNorm.substring(start, start + subLen);
          if (sourceNorm.includes(sub)) {
            foundSubstring = true;
            break;
          }
        }
        if (foundSubstring) {
          results.push({
            sceneIdx: scene.order - 1, slotIdx: j, value: val,
            confidence: 0.8, matchType: "substring",
          });
          continue;
        }
      }

      // Level 3: Word-by-word match
      const valWords = valNorm.split(/\s+/).filter((w) => w.length > 1);
      if (valWords.length > 0) {
        const matchedWords = valWords.filter((w) => sourceWords.has(w));
        const wordRatio = matchedWords.length / valWords.length;

        if (wordRatio >= 0.6) {
          results.push({
            sceneIdx: scene.order - 1, slotIdx: j, value: val,
            confidence: wordRatio, matchType: "fuzzy",
            warning: wordRatio < 0.8
              ? `일부 단어만 원본에서 발견됨 (${Math.round(wordRatio * 100)}%). 확인 필요.`
              : undefined,
          });
          continue;
        }
      }

      // No match found — likely hallucination
      results.push({
        sceneIdx: scene.order - 1, slotIdx: j, value: val,
        confidence: 0, matchType: "none",
        warning: "원본 자료에서 이 값을 찾을 수 없습니다. AI hallucination 가능성.",
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// Step 3: 씬별 AI 그래픽 생성 (HTML+CSS)
// ═══════════════════════════════════════════════════════════════════

const GRAPHIC_GENERATION_SYSTEM_PROMPT = `당신은 WebCG-K 방송 그래픽 디자이너입니다. 하나의 특정 씬에 대해 HTML+CSS 그래픽을 생성합니다.

## 핵심 원칙: 콘텐츠 충실성 (Content Fidelity)
당신은 하나의 구체적인 씬을 위해 하나의 그래픽을 생성합니다.
입력된 각 slot의 \`display_value\`를 **절대 수정, 축약, 변형하지 마세요.** HTML에는 \`display_value\`만 표시하세요.
\`source_value\`와 \`evidence_anchor\`는 원문 검증용 맥락이며 화면에 표시하지 않습니다.
템플릿 시스템을 새로 만들지는 않되, 검수와 재사용 준비를 위해 모든 표시 텍스트 요소에는 제공된 slot id를 추적용 attribute로 남기세요.

## 방송 캔버스 제약
- 캔버스 크기: 1920×1080 (16:9)
- 모든 텍스트는 방송 시청 거리에서 읽을 수 있어야 함
- WCAG AA 대비 최소 기준 충족
- 최소 폰트 크기: 본문 28px, 제목 52px, 메타 정보 18px (1920×1080 기준)

## CSS 제약
- \`box-sizing: border-box\` 전역 적용
- 단일 라인 라벨: \`white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\`
- 멀티라인 텍스트: \`overflow: hidden;\`
- 레이아웃은 CSS Flexbox/Grid 사용 (absolute positioning 지양)
- 애니메이션은 \`transform\`, \`opacity\`만 사용 (GPU 가속)

## 시각적 계층 (importance 1→5)
각 semantic_role의 권장 importance:
${buildRoleGraphicPromptFragment()}

일반 원칙:
- 5: 가장 크고 대담하게 — 가장 높은 importance
- 4: 강조된 크기
- 3: 표준 크기
- 2: 작게 — 보조 정보
- 1: 가장 작고 미묘하게

## 존(Zone) 기반 배치
- "bottom_bar": 하단 20-25% — Lower Third 스타일. 수평 바 형태가 일반적.
- "top_bar": 상단 15-20% — 속보 배너, 타이틀 바
- "center": 중앙 — 큰 텍스트, 명언, 핵심 통계
- "left_third": 좌측 1/3 — 보조 정보 패널
- "fullscreen": 전면 — 오프닝, 대형 충격 자막

## 그래픽 유형별 제작 규칙
- summary_info: 주제 전환과 핵심 명제를 차분하게 정리합니다. 과장된 뉴스 헤드라인, 속보풍 라벨, 불필요한 "충격/단독" 표현을 만들지 마세요.
- explainer_caption: 시청자의 이해를 돕는 부연설명 자막입니다. 하단 또는 중앙에 안정적으로 배치하고, 텍스트 박스는 읽기 쉬운 1~3줄 설명문을 담도록 설계하세요.
- stat_visual: 수치가 있는 경우에만 사용합니다. 외부 라이브러리 없이 SVG/HTML/CSS로 bar, donut, comparison, timeline, pictogram 중 하나를 직접 구성하세요. 3D 차트, 의미 없는 원형 장식, 과도한 그라데이션은 금지합니다.

## 배경 투명도 (★ 절대 필수 — OBS 오버레이 호환)
**"fullscreen"이 아닌 모든 zone은 배경이 반드시 완전히 투명해야 합니다. (body, #overlay { background: transparent !important; })**
실제 방송 송출 및 OBS에서 방송 그래픽(Broadcast Graphics)을 실시간 영상 위에 오버레이로 합성하기 위한 핵심 사항입니다.
- "bottom_bar", "top_bar", "center", "left_third":
  - body 또는 #overlay 요소를 불투명하게 만들지 마세요. 반드시 \`background: transparent !important;\`로 투명화해야 합니다.
  - 개별 텍스트 컨테이너(예: 자막 박스, 라벨)는 반투명 배경(예: \`rgba(15, 23, 42, 0.85)\`, \`backdrop-filter: blur(8px)\`)을 사용하여 가독성을 확보하세요.
  - 그래픽 외부 영역이 투명하지 않으면 실시간 영상이 가려지는 대형 방송 사고가 발생합니다.
- "fullscreen"만 예외: 전체 화면을 덮는 연출이므로 불투명 배경을 허용합니다.

## Theme: CSS Custom Properties (★ 강제)
**모든 색상과 타이포그래피는 반드시 CSS custom properties로 지정하세요.**
직접 색상값(#fff 등)을 사용하지 마세요.

\`\`\`css
:root {
  --cg-primary: #<hex>;        /* 주요 강조색 */
  --cg-accent: #<hex>;         /* 보조 포인트색 */
  --cg-bg: #<hex>;             /* 배경색 */
  --cg-text: #<hex>;           /* 주 텍스트색 */
  --cg-text-muted: #<hex>;     /* 보조 텍스트색 */
  --cg-font-family: '<family>', sans-serif;
  --cg-radius: <px>;           /* border-radius */
}
\`\`\`

## 스타일 힌트 반영
- "emphasis": 굵고 대담하게 — font-weight: 800+, letter-spacing 조정
- "normal": 기본 스타일
- "muted": 흐리게 — opacity: 0.6~0.7, font-weight: 300~400

## Slot Binding (★ 필수)
- 모든 표시 텍스트 요소에는 반드시 \`data-slot-id="제공된 slot_id"\`를 넣으세요.
- 모든 표시 텍스트 요소에는 반드시 \`data-semantic-role="semantic_role"\`을 넣으세요.
- 같은 semantic_role이 여러 개 있어도 role이 아니라 slot_id로 구분하세요.
- \`::before\`, \`::after\`, 숨김 텍스트, 임의 라벨로 새 문구를 만들지 마세요.
- HTML 안에 제공되지 않은 텍스트, 단위, 설명 문구를 추가하지 마세요.
- \`source_value\`나 \`evidence_anchor\`를 화면 텍스트로 렌더링하지 마세요. 화면에는 \`display_value\`만 표시하세요.

## 디자인 원칙
1. 콘텐츠의 분위기에 맞는 색상과 폰트를 선택하세요.
2. 존 힌트에 맞게 배치하되, 창의적으로 해석하세요.
3. 한 씬에 여러 text_slot이 있으면 서로의 관계(계층, 대비)를 고려하세요.
4. 방송용으로 깨끗하고 전문적인 디자인을 만드세요.
5. 불필요한 장식은 피하고, 정보 전달이 우선입니다.

## 출력 형식
순수 JSON만 출력하세요. 마크다운 코드블록 없이.

{
  "html": "<div id=\\"overlay\\"><!-- 실제 콘텐츠 --></div>",
  "css": ":root { --cg-primary: #1a365d; ... }\\n#overlay { ... }",
  "design_rationale": "디자인 의도 1-2문장 (한국어)"
}`;

/**
 * 한 씬에 대한 HTML/CSS 그래픽을 AI로 생성.
 *
 * @param scene - 생성할 씬의 콘텐츠 정의
 * @param programTitle - 프로그램 제목 (맥락 제공용)
 * @param themeTokens - 적용할 테마 (추출된 테마 또는 프리셋). 없으면 AI가 자유롭게 디자인.
 * @param existingCode - 수정 모드일 경우 기존 코드 컨텍스트
 * @param modifyRequest - 수정 모드일 경우 수정 요청 내용
 */
export async function generateSceneGraphic(
  scene: SceneContent,
  programTitle: string,
  options?: {
    themeTokens?: ThemeTokens | null;
    extractedTheme?: ExtractedTheme | null;
    existingCode?: { html: string; css: string } | null;
    modifyRequest?: string | null;
    zoneProfile?: AiCuesheetZoneProfile | null;
  },
): Promise<SceneGraphicResult> {
  const userPrompt = buildGraphicUserPrompt(scene, programTitle, options);

  const { text } = await callAI(GRAPHIC_GENERATION_SYSTEM_PROMPT, userPrompt, {
    maxOutputTokens: 32768,
    enforceJsonObject: true,
    requestType: "cuesheet_graphic_generation",
  });

  const result = parseGraphicResponse(text);
  const validation = validateGraphicSlotBindings(result, scene);
  if (!result.html.trim() || !result.css.trim()) {
    throw new Error("AI 그래픽 생성 결과에 HTML/CSS가 비어 있습니다. 다시 생성하세요.");
  }
  if (!validation.ok) {
    throw new Error(`AI 그래픽 생성 결과에 누락된 slot binding이 있습니다: ${validation.missingSlotIds.join(", ")}`);
  }
  return result;
}

export function buildGraphicUserPrompt(
  scene: SceneContent,
  programTitle: string,
  options?: {
    themeTokens?: ThemeTokens | null;
    extractedTheme?: ExtractedTheme | null;
    existingCode?: { html: string; css: string } | null;
    modifyRequest?: string | null;
    zoneProfile?: AiCuesheetZoneProfile | null;
  },
): string {
  // 수정 모드
  if (options?.existingCode && options?.modifyRequest) {
    return `## 수정 요청
${options.modifyRequest}

## 현재 코드
### HTML
\`\`\`html
${options.existingCode.html}
\`\`\`

### CSS
\`\`\`css
${options.existingCode.css}
\`\`\`

위 코드를 수정 요청에 맞게 수정하세요. 요청된 부분만 변경하고 나머지는 유지하세요.`;
  }

  // 신규 생성 모드
  const parts: string[] = [];

  parts.push(`## 프로그램
${programTitle}`);

  parts.push(`## 씬 정보
- 그래픽 유형: ${scene.graphic_type ?? "explainer_caption"}
- 트리거: ${scene.trigger}
- 디자인 의도: ${scene.graphic_intent || "정보 전달"}
- 지속 시간: ${scene.duration}초`);

  if (scene._design_rationale) {
    parts.push(`- 연출 의도: ${scene._design_rationale}`);
  }

  const zoneProfile = options?.zoneProfile ?? DEFAULT_AI_CUESHEET_ZONE_PROFILE;
  parts.push(`\n## 세션 Zone 프로필
이 세션에서 zone_hint는 아래의 실제 1920x1080 좌표를 의미합니다. 그래픽마다 임의로 위치를 재해석하지 말고, 각 slot은 지정된 영역 안에서만 렌더링하세요.
${AI_CUESHEET_ZONE_ORDER.map((zone) => formatZoneDefinitionForPrompt(getZoneDefinition(zoneProfile, zone))).join("\n")}`);

  parts.push(`\n## 표시할 텍스트`);
  scene.text_slots.forEach((slot, slotIdx) => {
    const slotId = slot.id || buildSceneSlotId(scene.order, slotIdx);
    const displayValue = slot.display_value ?? slot.value;
    const sourceValue = slot.source_value ?? slot.value;
    const evidence = slot.evidence_anchor ? `, evidence_anchor: "${slot.evidence_anchor}"` : "";
    const context = slot.context ? `, context: ${slot.context}` : "";
    parts.push(`- slot_id: ${slotId}, semantic_role: ${slot.semantic_role}, display_value: "${displayValue}", source_value: "${sourceValue}"${evidence}, 중요도 ${slot.importance}, 존 ${slot.zone_hint}, 스타일 ${slot.style_hint}${context}`);
    parts.push(`  - slot_id ${slotId}은 ${slot.zone_hint} 영역 안에서만 렌더링: ${formatZoneDefinitionForPrompt(getZoneDefinition(zoneProfile, slot.zone_hint))}`);
  });

  parts.push(`\n## 필수 Binding 검수 조건
- 위의 모든 slot_id가 HTML에 data-slot-id로 정확히 한 번 이상 존재해야 합니다.
- 각 표시 텍스트 요소는 data-slot-id와 data-semantic-role을 함께 가져야 합니다.
- 예: <span data-slot-id="scene-1-slot-1" data-semantic-role="name">홍길동</span>
- HTML에는 display_value만 표시하고 source_value/evidence_anchor/context는 표시하지 마세요.`);

  // 테마 적용
  if (options?.extractedTheme) {
    const t = options.extractedTheme;
    parts.push(`\n## 적용할 Theme (CSS Custom Properties)
다음 값을 :root에 그대로 사용하세요:
--cg-primary: ${t.colors.primary};
--cg-accent: ${t.colors.accent};
--cg-bg: ${t.colors.background};
--cg-text: ${t.colors.text.main};
--cg-text-muted: ${t.colors.text.muted};
--cg-font-family: '${t.typography.fontFamily}', sans-serif;
--cg-radius: ${t.layout.borderRadius};`);
  } else if (options?.themeTokens) {
    const t = options.themeTokens;
    parts.push(`\n## 적용할 Theme (CSS Custom Properties)
다음 값을 :root에 그대로 사용하세요:
--cg-primary: ${t.colors.primary};
--cg-accent: ${t.colors.accent};
--cg-bg: ${t.colors.background};
--cg-text: ${t.colors.text.main};
--cg-text-muted: ${t.colors.text.muted};
--cg-font-family: '${t.typography.fontFamily}', sans-serif;
--cg-radius: ${t.layout.borderRadius};`);
  }

  parts.push(`\n위 정보로 이 씬에 맞는 HTML+CSS 그래픽을 생성하세요.
텍스트는 절대 수정하지 말고 각 slot의 display_value를 주어진 그대로 사용하세요.`);

  return parts.join("\n");
}

export function parseGraphicResponse(raw: string): SceneGraphicResult {
  let cleaned = raw.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      html: typeof parsed.html === "string" ? parsed.html : "",
      css: typeof parsed.css === "string" ? parsed.css : "",
      design_rationale: typeof parsed.design_rationale === "string" ? parsed.design_rationale : "",
    };
  } catch {
    // JSON 파싱 실패 — HTML/CSS 직접 추출 시도
    const htmlMatch = cleaned.match(/"html"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    const cssMatch = cleaned.match(/"css"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    return {
      html: htmlMatch ? JSON.parse(`"${htmlMatch[1]}"`) : "",
      css: cssMatch ? JSON.parse(`"${cssMatch[1]}"`) : "",
      design_rationale: "",
    };
  }
}

export interface GraphicSlotBindingValidation {
  ok: boolean;
  missingSlotIds: string[];
}

export function validateGraphicSlotBindings(
  graphic: SceneGraphicResult,
  scene: SceneContent,
): GraphicSlotBindingValidation {
  const html = graphic.html || "";
  const missingSlotIds = scene.text_slots
    .map((slot, slotIdx) => slot.id || buildSceneSlotId(scene.order, slotIdx))
    .filter((slotId) => (
      !html.includes(`data-slot-id="${slotId}"`) &&
      !html.includes(`data-slot-id='${slotId}'`)
    ));

  return {
    ok: missingSlotIds.length === 0,
    missingSlotIds,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Theme 추출: 생성된 CSS → ExtractedTheme
// ═══════════════════════════════════════════════════════════════════

const CSS_VAR_PATTERNS: Record<string, string> = {
  primary: "--cg-primary",
  accent: "--cg-accent",
  background: "--cg-bg",
  textMain: "--cg-text",
  textMuted: "--cg-text-muted",
  fontFamily: "--cg-font-family",
  radius: "--cg-radius",
};

function extractCssVar(css: string, varName: string): string | null {
  // :root 블록 또는 일반 규칙에서 --var-name: value; 패턴 추출
  const regex = new RegExp(
    `${varName.replace(/-/g, "\\-")}\\s*:\\s*([^;]+);`,
    "i",
  );
  const match = regex.exec(css);
  return match ? match[1].trim() : null;
}

/**
 * 생성된 CSS에서 --cg-* custom properties를 추출하여 ExtractedTheme을 만든다.
 * 사용자가 마음에 드는 그래픽의 Theme을 저장하여 다른 씬에 재적용 가능.
 */
export function extractThemeFromCss(css: string): ExtractedTheme | null {
  const primary = extractCssVar(css, CSS_VAR_PATTERNS.primary);
  const accent = extractCssVar(css, CSS_VAR_PATTERNS.accent);
  const background = extractCssVar(css, CSS_VAR_PATTERNS.background);
  const textMain = extractCssVar(css, CSS_VAR_PATTERNS.textMain);
  const textMuted = extractCssVar(css, CSS_VAR_PATTERNS.textMuted);
  const fontFamily = extractCssVar(css, CSS_VAR_PATTERNS.fontFamily);
  const borderRadius = extractCssVar(css, CSS_VAR_PATTERNS.radius);

  if (!primary && !accent && !background && !textMain) {
    return null; // 최소한의 색상 정보도 없음
  }

  return {
    colors: {
      primary: primary || "#3b82f6",
      accent: accent || "#f59e0b",
      background: background || "#0f172a",
      text: {
        main: textMain || "#ffffff",
        muted: textMuted || "rgba(255,255,255,0.6)",
      },
    },
    typography: {
      fontFamily: fontFamily || "Noto Sans KR",
    },
    layout: {
      borderRadius: borderRadius || "8px",
    },
  };
}

/**
 * ExtractedTheme을 ThemeTokens로 변환 (SemanticRenderer 호환).
 * font scale은 추출할 수 없으므로 합리적인 기본값 사용.
 */
export function extractedThemeToTokens(
  theme: ExtractedTheme,
  themeId: string,
): ThemeTokens {
  return {
    themeId,
    colors: theme.colors,
    typography: {
      fontFamily: theme.typography.fontFamily,
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
      borderRadius: theme.layout.borderRadius,
      safeAreaPadding: "2rem",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Rundown 발행: AI 그래픽 → overlay_templates 저장
// ═══════════════════════════════════════════════════════════════════

export interface AiCuesheetBindingManifestEntry {
  slot_id: string;
  semantic_role: string;
  field_key: string;
  display_value: string;
  source_value: string;
  evidence_anchor?: string;
}

export interface AiCuesheetOverlayArtifacts {
  sourceCode: { html: string; css: string; js: string };
  dashboardSchema: { properties: Record<string, any> };
  replicantDefaults: Record<string, string>;
  aiMetadata: Record<string, unknown>;
}

export interface BuildAiCuesheetOverlayArtifactsParams {
  scene: SceneContent;
  html: string;
  css: string;
  programTitle?: string;
}

function toSafeJsJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\//g, "<\\/")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildSlotUpdaterJs(defaults: Record<string, string>): string {
  const defaultsJson = toSafeJsJson(defaults);
  return `(function() {\n  var defaults = ${defaultsJson};\n  function writeSlot(slotId, value) {\n    var nodes = document.querySelectorAll('[data-slot-id]');\n    for (var i = 0; i < nodes.length; i += 1) {\n      if (nodes[i].getAttribute('data-slot-id') === slotId) {\n        nodes[i].textContent = value == null ? '' : String(value);\n      }\n    }\n  }\n  webcgk.onData(function(data) {\n    var next = Object.assign({}, defaults, data || {});\n    Object.keys(defaults).forEach(function(slotId) {\n      writeSlot(slotId, next[slotId]);\n    });\n  });\n})();`;
}

export function buildAiCuesheetOverlayArtifacts({
  scene,
  html,
  css,
  programTitle,
}: BuildAiCuesheetOverlayArtifactsParams): AiCuesheetOverlayArtifacts {
  const replicantDefaults: Record<string, string> = {};
  const properties: Record<string, any> = {};

  // 1. 비-풀스크린 방송 그래픽(Broadcast Graphics) 투명 배경 완벽성 강제 안전 장치
  const isFullscreen = scene.text_slots.every((s) => s.zone_hint === "fullscreen");
  let finalCss = css;
  if (!isFullscreen) {
    if (!css.includes("background: transparent !important")) {
      finalCss = css + "\n\n/* [Safety Defense] 방송 그래픽 투명성 강제 안전 장치 */\nbody, #overlay { background: transparent !important; }\n";
    }
  }

  const bindingManifest: AiCuesheetBindingManifestEntry[] = scene.text_slots.map((slot, slotIdx) => {
    const slotId = slot.id || buildSceneSlotId(scene.order, slotIdx);
    const displayValue = slot.display_value ?? slot.value;
    const sourceValue = slot.source_value ?? slot.value;
    replicantDefaults[slotId] = displayValue;

    const descriptionParts = [
      sourceValue ? `원문: ${sourceValue}` : null,
      slot.evidence_anchor ? `근거: ${slot.evidence_anchor}` : null,
      slot.context ? `맥락: ${slot.context}` : null,
    ].filter(Boolean);

    properties[slotId] = {
      type: "string",
      title: slot.semantic_role,
      default: displayValue,
      description: descriptionParts.join("\n"),
      "x-slot-id": slotId,
      "x-semantic-role": slot.semantic_role,
      "x-source-value": sourceValue,
      "x-evidence-anchor": slot.evidence_anchor,
      "x-zone-hint": slot.zone_hint,
      "x-importance": slot.importance,
    };

    return {
      slot_id: slotId,
      semantic_role: slot.semantic_role,
      field_key: slotId,
      display_value: displayValue,
      source_value: sourceValue,
      evidence_anchor: slot.evidence_anchor,
    };
  });

  return {
    sourceCode: {
      html,
      css: finalCss,
      js: buildSlotUpdaterJs(replicantDefaults),
    },
    dashboardSchema: { properties },
    replicantDefaults,
    aiMetadata: {
      lifecycle: "scene_instance",
      source: "ai_cuesheet",
      gallery_policy: "session_draft",
      folder: AI_CUESHEET_DRAFT_FOLDER_NAME,
      schema_version: AI_CUESHEET_SCHEMA_VERSION,
      program_title: programTitle,
      scene_order: scene.order,
      graphic_type: scene.graphic_type ?? "explainer_caption",
      trigger: scene.trigger,
      graphic_intent: scene.graphic_intent,
      binding_manifest: bindingManifest,
    },
  };
}


/**
 * AI 생성 HTML+CSS를 overlay_templates로 저장 (INSERT or UPDATE).
 *
 * @param html - 생성된 HTML
 * @param css - 생성된 CSS
 * @param name - 오버레이 이름 (예: "Scene 1: 전문가 등장")
 * @param userId - 소유자 ID
 * @param existingTemplateId - 수정 모드일 경우 기존 template ID
 * @returns overlay_templates.id
 */
export async function upsertGraphicAsOverlay(
  html: string,
  css: string,
  name: string,
  userId: string,
  existingTemplateId?: string,
  scene?: SceneContent,
  programTitle?: string,
  sessionId?: string | null,
): Promise<string> {
  const artifacts = scene
    ? buildAiCuesheetOverlayArtifacts({ scene, html, css, programTitle })
    : {
      sourceCode: { html, css, js: "" },
      dashboardSchema: null,
      replicantDefaults: {},
      aiMetadata: {
        lifecycle: "scene_instance",
        source: "ai_cuesheet",
        gallery_policy: "session_draft",
        folder: AI_CUESHEET_DRAFT_FOLDER_NAME,
        schema_version: AI_CUESHEET_SCHEMA_VERSION,
      },
    };

  const aiMetadata = sessionId
    ? { ...artifacts.aiMetadata, session_id: sessionId }
    : artifacts.aiMetadata;
  const draftFolder = scene
    ? await ensureOverlayFolder({
      name: AI_CUESHEET_DRAFT_FOLDER_NAME,
      ownerId: userId,
      isSystem: true,
    })
    : null;

  const payload: Record<string, unknown> = {
    source_code: artifacts.sourceCode as any,
    dashboard_schema: artifacts.dashboardSchema as any,
    replicant_defaults: artifacts.replicantDefaults as any,
    ai_metadata: aiMetadata as any,
  };
  if (draftFolder) payload.folder_id = draftFolder.id;

  if (existingTemplateId) {
    // Update existing
    const { error } = await supabase
      .from("overlay_templates")
      .update({
        ...payload,
        name,
        category: scene ? "ai_cuesheet_draft" : "cg_panel",
        source_type: "ai_generated",
        tags: scene ? ["ai-cuesheet", "session-draft"] : ["ai-cuesheet"],
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingTemplateId);

    if (error) throw error;
    return existingTemplateId;
  }

  // Insert new
  const { data, error } = await supabase
    .from("overlay_templates")
    .insert({
      name,
      plugin_type: "html",
      ...payload,
      category: scene ? "ai_cuesheet_draft" : "cg_panel",
      owner_id: userId,
      source_type: "ai_generated",
      tags: scene ? ["ai-cuesheet", "session-draft"] : ["ai-cuesheet"],
    } as any)
    .select("id")
    .single();

  if (error) throw error;
  return (data as any).id;
}
