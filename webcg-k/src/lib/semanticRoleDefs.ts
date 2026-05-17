/**
 * SemanticRole SSOT (Single Source of Truth)
 *
 * 모든 SemanticRole 정의의 단일 진실 공급원.
 * aiCuesheetTypes, buildSystemPrompt, GRAPHIC_GENERATION_SYSTEM_PROMPT,
 * Graphic Tagging 페이지 등이 이 파일을 참조한다.
 *
 * 새 role 추가 시 이 파일만 수정하면 모든 곳에 자동 반영됨.
 */

import type { SemanticRole, ZoneHint } from "./aiCuesheetTypes";

// ─── Role Definition ──────────────────────────────────────────────

export interface SemanticRoleDef {
  role: SemanticRole;
  label: string;        // UI 표시용 한글 라벨
  labelEn: string;      // UI 표시용 영문 라벨
  description: string;  // AI prompt에 들어갈 설명
  importanceHint: string; // AI에게 이 role의 importance 추천 범위
  typicalZone: ZoneHint;  // 이 role의 일반적인 배치 영역
  color: string;        // UI 표시용 Tailwind 색상 클래스
}

// ─── Master List ──────────────────────────────────────────────────

export const SEMANTIC_ROLE_DEFS: SemanticRoleDef[] = [
  {
    role: "name",
    label: "이름",
    labelEn: "Name",
    description: "인물 이름 (홍길동)",
    importanceHint: "4-5 (가장 두드러지게)",
    typicalZone: "bottom_bar",
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
  },
  {
    role: "subtitle",
    label: "부제목",
    labelEn: "Subtitle",
    description: "부제목/직함 (서울시장)",
    importanceHint: "3-4",
    typicalZone: "bottom_bar",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  },
  {
    role: "affiliation",
    label: "소속",
    labelEn: "Affiliation",
    description: "소속/단체명 (기후위기 대응 특별위원회)",
    importanceHint: "2-3 (작게)",
    typicalZone: "bottom_bar",
    color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40",
  },
  {
    role: "title",
    label: "제목",
    labelEn: "Title",
    description: "프로그램/섹션 제목",
    importanceHint: "4-5",
    typicalZone: "top_bar",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  },
  {
    role: "stat",
    label: "통계",
    labelEn: "Stat",
    description: "통계 수치 (72%, 1,234건)",
    importanceHint: "4-5 (충격적인 수치는 최대)",
    typicalZone: "center",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  {
    role: "quote",
    label: "인용",
    labelEn: "Quote",
    description: "인용문/발언",
    importanceHint: "3-4",
    typicalZone: "center",
    color: "bg-green-500/20 text-green-400 border-green-500/40",
  },
  {
    role: "label",
    label: "태그",
    labelEn: "Label",
    description: "태그/분류/배지 (LIVE, 속보, 단독)",
    importanceHint: "2-3",
    typicalZone: "top_bar",
    color: "bg-pink-500/20 text-pink-400 border-pink-500/40",
  },
];

// ─── Lookup Utilities ─────────────────────────────────────────────

/** role → label 매핑 */
export const ROLE_LABEL_MAP: Record<SemanticRole, string> = Object.fromEntries(
  SEMANTIC_ROLE_DEFS.map((d) => [d.role, d.label]),
) as Record<SemanticRole, string>;

/** role → color 매핑 (UI용) */
export const ROLE_COLOR_MAP: Record<string, string> = Object.fromEntries(
  SEMANTIC_ROLE_DEFS.map((d) => [d.role, d.color]),
);

/** 모든 valid role string */
export const VALID_SEMANTIC_ROLES = SEMANTIC_ROLE_DEFS.map((d) => d.role);

/** valid role인지 확인 */
export function isValidSemanticRole(v: string): v is SemanticRole {
  return (VALID_SEMANTIC_ROLES as string[]).includes(v);
}

// ─── Prompt Fragment Generator ────────────────────────────────────

/**
 * 시스템 프롬프트에 삽입할 SemanticRole 설명 문자열을 생성.
 * 새 role 추가 시 프롬프트도 자동 갱신됨.
 */
export function buildRolePromptFragment(): string {
  return SEMANTIC_ROLE_DEFS.map((d) =>
    `- "${d.role}": ${d.description}`,
  ).join("\n");
}

/** Graphic 생성을 위한 role 설명 (더 자세한 버전) */
export function buildRoleGraphicPromptFragment(): string {
  return SEMANTIC_ROLE_DEFS.map((d) =>
    `- "${d.role}" (${d.label}): ${d.description}. importance ${d.importanceHint}, 일반적 배치: ${d.typicalZone}`,
  ).join("\n");
}
