/**
 * 시제·날짜 일관성 검증 서비스
 *
 * ■ Why 시제 검증?
 *   "어제 발생한 사건"이라는 자막이 방송 당일에는 맞지만
 *   하루 뒤 재방송이나 아카이브에서는 틀린 표현이 됨.
 *   program_date 기준으로 시간 표현의 정합성을 검사.
 *
 * ■ 검사 범위:
 *   1. "오늘/어제/내일" 등 상대 시간 표현 경고
 *   2. 과거시제/현재시제 혼용 감지
 */

import type { ContentIssue } from "./index";

// ─── 상대 시간 표현 사전 ──────────────────────────────────────────

const RELATIVE_TIME_WORDS = [
	{ word: "오늘", desc: "방송일 기준 '오늘' — 날짜 변경 시 수정 필요" },
	{ word: "어제", desc: "방송일 기준 '어제' — 재방/아카이브 주의" },
	{ word: "내일", desc: "방송일 기준 '내일' — 날짜 변경 시 수정 필요" },
	{ word: "그저께", desc: "방송일 기준 '그저께'" },
	{ word: "모레", desc: "방송일 기준 '모레'" },
	{ word: "지난주", desc: "특정 날짜 병기 권장" },
	{ word: "이번 주", desc: "특정 날짜 병기 권장" },
	{ word: "다음 주", desc: "특정 날짜 병기 권장" },
	{ word: "올해", desc: "연도 명시 권장" },
	{ word: "작년", desc: "연도 명시 권장" },
	{ word: "지난해", desc: "연도 명시 권장" },
];

// ─── 시제 혼용 패턴 ───────────────────────────────────────────────

/** 과거 시제 어미 */
const PAST_PATTERNS = /했다|였다|됐다|었다|갔다|왔다|났다|졌다/;
/** 현재/미래 시제 어미 */
const PRESENT_PATTERNS = /한다|된다|간다|온다|난다|진다|할 예정|할 계획/;

// ─── 메인 검증 함수 ────────────────────────────────────────────────

/**
 * 시제·날짜 일관성 검증
 *
 * @param text - 순수 텍스트
 * @param programDate - 프로그램 날짜 (YYYY-MM-DD)
 * @param fieldKey - 필드 키
 * @returns ContentIssue 배열
 */
export function validateTemporal(
	text: string,
	programDate: string,
	fieldKey: string,
): ContentIssue[] {
	const issues: ContentIssue[] = [];

	// ── 1. 상대 시간 표현 경고 ──
	for (const entry of RELATIVE_TIME_WORDS) {
		if (text.includes(entry.word)) {
			issues.push({
				type: "temporal",
				severity: "info",
				field: fieldKey,
				original: entry.word,
				message: `📅 "${entry.word}" — ${entry.desc} (방송일: ${programDate})`,
			});
		}
	}

	// ── 2. 과거/현재 시제 혼용 감지 ──
	const hasPast = PAST_PATTERNS.test(text);
	const hasPresent = PRESENT_PATTERNS.test(text);

	if (hasPast && hasPresent && text.length > 20) {
		// 20자 미만은 혼용이 아닌 자연스러운 표현일 수 있음
		issues.push({
			type: "temporal",
			severity: "warning",
			field: fieldKey,
			original: text.slice(0, 30) + (text.length > 30 ? "..." : ""),
			message: `⚠️ 시제 혼용 감지 — 과거형과 현재/미래형이 섞여 있습니다. 일관된 시제 사용을 권장합니다.`,
		});
	}

	return issues;
}
