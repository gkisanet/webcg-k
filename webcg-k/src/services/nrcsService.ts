/**
 * NRCS 서비스 (API 클라이언트)
 *
 * 변경 사항 (v2):
 * - 기존: Mock 데이터가 프론트엔드 번들에 하드코딩 (399줄)
 * - 변경: media-server의 REST API (/api/nrcs/*) 호출로 교체
 *
 * Why 분리?
 * 1. 프로덕션 번들 사이즈 감소 (Mock 데이터 제거)
 * 2. 환경변수(VITE_NRCS_URL)로 Mock ↔ 실제 NRCS 전환 가능
 * 3. 실제 KBS NRCS가 준비되면 URL만 변경하여 즉시 연동
 *
 * API Endpoint:
 * - 개발 환경: http://localhost:3200/api/nrcs (media-server Mock)
 * - 프로덕션: 환경변수 VITE_NRCS_URL로 실제 NRCS 서버 지정
 */

import type {
	BureauCode,
	NewsProgram,
	NrcsNewsItem,
} from "@/lib/nrcsTypes";

// ■ Why 자동 추론?
//   브라우저가 172.30.64.201:3000(WSL IP)으로 접속 시,
//   media-server도 같은 호스트(172.30.64.201:3200)에서 접근 가능.
const NRCS_BASE_URL = (() => {
	if (typeof import.meta !== "undefined" && import.meta.env?.VITE_NRCS_URL) {
		return import.meta.env.VITE_NRCS_URL;
	}
	if (typeof window !== "undefined" && window.location?.hostname) {
		return `http://${window.location.hostname}:3200/api/nrcs`;
	}
	return "http://localhost:3200/api/nrcs";
})();

// ─── API 호출 헬퍼 ──────────────────────────────────────────────

async function nrcsFetch<T>(path: string): Promise<T> {
	const res = await fetch(`${NRCS_BASE_URL}${path}`, {
		signal: AbortSignal.timeout(5000),
	});

	if (!res.ok) {
		throw new Error(`NRCS API 오류: ${res.status} ${res.statusText}`);
	}

	const json = await res.json();

	if (!json.success) {
		throw new Error(json.error || "NRCS API 응답 실패");
	}

	return json.data;
}

// ─── 공개 API 함수 ──────────────────────────────────────────────

/**
 * 날짜 + 총국 기반 뉴스 프로그램 목록 반환
 *
 * media-server 미실행 시 fallback: 빈 배열 반환
 * (기존처럼 Mock 지연(200~400ms)은 media-server 측에서 시뮬레이션)
 */
export async function fetchNewsPrograms(
	date: string,
	bureau: BureauCode,
): Promise<NewsProgram[]> {
	try {
		return await nrcsFetch<NewsProgram[]>(
			`/programs?date=${encodeURIComponent(date)}&bureau=${encodeURIComponent(bureau)}`,
		);
	} catch (err) {
		// media-server 미실행 시 graceful fallback
		// Why 빈 배열?
		// UI가 "데이터 없음"으로 표시되므로 앱이 크래시하지 않음.
		// 개발자에게 media-server 기동이 필요함을 콘솔에 알림.
		console.warn(
			"[NRCS] ⚠️ media-server 미연결. 프로그램 데이터를 가져올 수 없습니다.",
			`(${NRCS_BASE_URL})`,
			err,
		);
		return [];
	}
}

/**
 * 프로그램 ID로 기사 아이템 목록 반환
 */
export async function fetchNewsItems(
	programId: string,
): Promise<NrcsNewsItem[]> {
	try {
		return await nrcsFetch<NrcsNewsItem[]>(
			`/items?programId=${encodeURIComponent(programId)}`,
		);
	} catch (err) {
		console.warn(
			"[NRCS] ⚠️ media-server 미연결. 기사 데이터를 가져올 수 없습니다.",
			`(${NRCS_BASE_URL})`,
			err,
		);
		return [];
	}
}
