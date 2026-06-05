/**
 * 방송 금칙어/주의어 필터
 *
 * ■ Why JSON 외부 사전?
 *   향후 관리자 페이지에서 편집 가능하도록 데이터를 코드에서 분리.
 *   현재는 static import, 이후 DB 마이그레이션 가능.
 */

// ContentIssue 타입은 index.ts에서 통합 변환하므로 여기서는 미사용
import wordData from "./data/broadcast_prohibited_words.json";

// ─── 타입 ─────────────────────────────────────────────────────────

interface WordEntry {
	word: string;
	replacement?: string;
	reason: string;
}

export interface ProfanityIssue {
	word: string;
	replacement?: string;
	severity: "error" | "warning" | "info";
	message: string;
}

// ─── 사전 로드 ────────────────────────────────────────────────────

const prohibited: WordEntry[] = wordData.prohibited as WordEntry[];
const caution: WordEntry[] = wordData.caution as WordEntry[];
const sensitive: WordEntry[] = wordData.sensitive as WordEntry[];

// ─── 검사 함수 ────────────────────────────────────────────────────

/**
 * 방송 금칙어/주의어 필터링
 *
 * ■ 3단계 심각도:
 *   - prohibited → error: "이 단어는 방송 사용 금지입니다"
 *   - caution → warning: "대체어 사용을 권장합니다"
 *   - sensitive → info: "편집부 확인이 필요합니다"
 *
 * @param text - 순수 텍스트 (HTML 제거 후)
 * @returns 발견된 금칙어 이슈 배열
 */
export function filterProfanity(text: string): ProfanityIssue[] {
	const issues: ProfanityIssue[] = [];

	// 1. 절대 금지어 (error)
	for (const entry of prohibited) {
		if (text.includes(entry.word)) {
			issues.push({
				word: entry.word,
				replacement: entry.replacement,
				severity: "error",
				message: `🚫 금지어: "${entry.word}" → ${entry.replacement || "(삭제)"} — ${entry.reason}`,
			});
		}
	}

	// 2. 주의어 (warning)
	for (const entry of caution) {
		if (text.includes(entry.word)) {
			issues.push({
				word: entry.word,
				replacement: entry.replacement,
				severity: "warning",
				message: `⚠️ 주의어: "${entry.word}" → "${entry.replacement}" — ${entry.reason}`,
			});
		}
	}

	// 3. 민감어 (info)
	for (const entry of sensitive) {
		if (text.includes(entry.word)) {
			issues.push({
				word: entry.word,
				severity: "info",
				message: `ℹ️ 민감어: "${entry.word}" — ${entry.reason}`,
			});
		}
	}

	return issues;
}
