/**
 * 직함·표기 검증 서비스
 *
 * ■ Why CG 타입별 검증?
 *   뉴스 CG는 유형(super, crawl, headline 등)에 따라
 *   텍스트의 형식·길이·패턴이 다름.
 *   super는 "이름 / 직함", crawl은 최소 길이, headline은 최대 길이.
 */

import type { ContentIssue } from "./index";

// ─── 슈퍼(super) 패턴 검증 ────────────────────────────────────────

/**
 * 슈퍼 자막 형식: "홍길동 / 서울시 관계자"
 * 패턴: 2~5자 이름 + 구분자(/ | ·) + 직함
 */
const SUPER_PATTERN = /^.{2,5}\s*[\/|·]\s*.+$/;

// ─── 자주 틀리는 직함 사전 ────────────────────────────────────────

const TITLE_CORRECTIONS: [string, string][] = [
	["대표이사", "대표"],    // 방송에서는 간결하게
	["사무총장", "사무총장"], // OK
	["부대변인", "부대변인"], // OK
	["센타장", "센터장"],
	["메니저", "매니저"],
	["디렉타", "디렉터"],
	["프로듀서", "프로듀서"], // OK
	["아나운서", "아나운서"], // OK
	["리포타", "리포터"],
	["에디타", "에디터"],
	["교수님", "교수"],      // 방송에서 '-님' 제거
	["박사님", "박사"],
	["선생님", "선생"],      // 인터뷰이 직함에서는 제거
	["위원장님", "위원장"],
	["장관님", "장관"],
	["차관님", "차관"],
	["사장님", "사장"],
	["이사장님", "이사장"],
];

// ─── 메인 검증 함수 ────────────────────────────────────────────────

/**
 * CG 타입별 직함·표기 검증
 *
 * @param text - 순수 텍스트
 * @param cgType - CG 유형 (super, crawl, headline 등)
 * @param fieldKey - 필드 키
 * @returns ContentIssue 배열
 */
export function validateTitleFormat(
	text: string,
	cgType: string,
	fieldKey: string,
): ContentIssue[] {
	const issues: ContentIssue[] = [];

	// ── super 타입: "이름 / 직함" 패턴 강제 ──
	if (cgType === "super" && fieldKey === "name") {
		if (!SUPER_PATTERN.test(text.trim())) {
			issues.push({
				type: "title_format",
				severity: "warning",
				field: fieldKey,
				original: text,
				suggestion: "예: 홍길동 / 서울시 관계자",
				message: `⚠️ 슈퍼 자막 형식: "이름 / 직함" 패턴을 권장합니다`,
			});
		}
	}

	// ── headline 타입: 20자 초과 경고 ──
	if (cgType === "headline") {
		if (text.length > 20) {
			issues.push({
				type: "title_format",
				severity: "warning",
				field: fieldKey,
				original: text,
				message: `⚠️ 헤드라인 ${text.length}자 — 20자 이하 권장 (TV 화면 가독성)`,
			});
		}
	}

	// ── crawl 타입: 10자 미만 경고 ──
	if (cgType === "crawl") {
		if (text.length < 10) {
			issues.push({
				type: "title_format",
				severity: "info",
				field: fieldKey,
				original: text,
				message: `ℹ️ 크롤 자막 ${text.length}자 — 너무 짧을 수 있습니다 (10자 이상 권장)`,
			});
		}
	}

	// ── 직함 오타 검사 (모든 CG 타입) ──
	for (const [wrong, correct] of TITLE_CORRECTIONS) {
		if (wrong === correct) continue;
		if (text.includes(wrong)) {
			issues.push({
				type: "title_format",
				severity: "warning",
				field: fieldKey,
				original: wrong,
				suggestion: correct,
				message: `⚠️ 직함 표기: "${wrong}" → "${correct}"`,
			});
		}
	}

	return issues;
}
