/**
 * Content Validation Engine — 큐시트 CG 텍스트 내용 검증 통합 모듈
 *
 * ■ Why 별도 모듈?
 *   기존 preflightService는 "구조적" 검증(그래픽 존재, 슬롯 매핑).
 *   뉴스 방송 사고의 90%는 "내용적" 휴먼 에러(오타, 금칙어, 직함 오류).
 *   관심사 분리로 각 검증기를 독립적으로 발전시킬 수 있음.
 *
 * ■ 4단계 검증 파이프라인:
 *   1. 맞춤법 (로컬 사전 + Gemini AI 심층)
 *   2. 방송 금칙어/주의어
 *   3. 직함·표기 패턴
 *   4. 시제·날짜 일관성
 */

import {
	buildCuesheetCheckContext,
	type CuesheetCheckContext,
} from "../cuesheetCheckService";
import { filterProfanity } from "./profanityFilter";
import { checkSpelling } from "./spellCheckService";
import { validateTemporal } from "./temporalValidator";
import { validateTitleFormat } from "./titleValidator";

// ─── 공통 타입 ────────────────────────────────────────────────────

/** 개별 검증 이슈 */
export interface ContentIssue {
	/** 이슈 유형 */
	type: "spelling" | "profanity" | "title_format" | "temporal";
	/** 심각도: error=저장차단, warning=경고, info=참고 */
	severity: "error" | "warning" | "info";
	/** 이슈가 발견된 필드 키 (CgTextItem.fields의 키) */
	field: string;
	/** 원본 텍스트 */
	original: string;
	/** 교정 제안 (있는 경우) */
	suggestion?: string;
	/** 사용자에게 표시할 메시지 */
	message: string;
}

/** 아이템별 검증 결과 */
export interface ContentValidationResult {
	/** 큐시트 아이템 ID */
	itemId: string;
	/** 발견된 이슈 목록 */
	issues: ContentIssue[];
	/** 전체 통과 여부 (error급 이슈가 없으면 true) */
	passed: boolean;
}

// ─── 입력 타입 (preflightService와 공유) ───────────────────────────

/** 검증 대상 아이템 (NrcsCuesheetItem에서 필요한 필드만) */
export interface ValidatableItem {
	id: string;
	slug: string;
	title: string;
	/** CG 데이터 — fields: Record<string, string> */
	cg_data: Array<{
		type?: string;
		fields?: Record<string, string>;
	}>;
}

// ─── 통합 검증 함수 ────────────────────────────────────────────────

/**
 * CG 텍스트 내용 검증 — 4단계 파이프라인 실행
 *
 * ■ 실행 시점:
 *   1. 저장 버튼 클릭 시
 *   2. "맞춤법 검사" 버튼 클릭 시 (일괄 체크)
 *   3. 프리플라이트 실행 시 (자동 포함)
 *
 * @param items - 검증할 큐시트 아이템 배열
 * @param programDate - 프로그램 날짜 (시제 검증용, "2026-04-07")
 * @param useAiSpellCheck - Gemini AI 심층 맞춤법 검사 사용 여부 (기본 false)
 * @returns 아이템별 검증 결과 배열
 */
export async function validateCgContent(
	items: ValidatableItem[],
	checkContextOrProgramDate: CuesheetCheckContext | string,
	_useAiSpellCheck = false,
): Promise<ContentValidationResult[]> {
	const results: ContentValidationResult[] = [];
	const checkContext =
		typeof checkContextOrProgramDate === "string"
			? buildCuesheetCheckContext({ programDate: checkContextOrProgramDate })
			: checkContextOrProgramDate;

	for (const item of items) {
		const issues: ContentIssue[] = [];

		// CG 데이터의 각 엔트리에서 텍스트 추출
		const cgEntries = item.cg_data || [];

		for (const cg of cgEntries) {
			const fields = cg.fields || {};
			const cgType = cg.type || "unknown";

			for (const [fieldKey, fieldValue] of Object.entries(fields)) {
				if (!fieldValue || typeof fieldValue !== "string") continue;

				// HTML 태그 제거하여 순수 텍스트 추출
				const plainText = stripHtml(fieldValue);
				if (!plainText.trim()) continue;

				// ── 1단계: 맞춤법 검사 (로컬 사전) ──
				const spellingIssues = checkSpelling(plainText);
				for (const sp of spellingIssues) {
					issues.push({
						type: "spelling",
						severity: "warning",
						field: fieldKey,
						original: sp.original,
						suggestion: sp.corrected,
						message: `맞춤법: "${sp.original}" → "${sp.corrected}" (${sp.rule})`,
					});
				}

				// ── 2단계: 금칙어/주의어 필터 ──
				const profanityIssues = filterProfanity(plainText);
				for (const pf of profanityIssues) {
					issues.push({
						type: "profanity",
						severity: pf.severity,
						field: fieldKey,
						original: pf.word,
						suggestion: pf.replacement,
						message: pf.message,
					});
				}

				// ── 3단계: 직함·표기 검증 (CG 타입별) ──
				const titleIssues = validateTitleFormat(plainText, cgType, fieldKey);
				issues.push(...titleIssues);

				// ── 4단계: 시제·날짜 일관성 ──
				const temporalIssues = validateTemporal(
					plainText,
					checkContext,
					fieldKey,
				);
				issues.push(...temporalIssues);
			}
		}

		// error 급이 하나라도 있으면 불합격
		const hasError = issues.some((i) => i.severity === "error");

		results.push({
			itemId: item.id,
			issues,
			passed: !hasError,
		});
	}

	return results;
}

// ─── 유틸 ─────────────────────────────────────────────────────────

/** HTML 태그 제거 → 순수 텍스트 추출 */
function stripHtml(html: string): string {
	return html.replace(/<[^>]+>/g, "").trim();
}
