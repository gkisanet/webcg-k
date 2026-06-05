/**
 * Clock Offset Synchronization
 *
 * ■ Why?
 *   Controller(운영자 PC)와 Renderer(송출 PC)의 로컬 시계가 다르면
 *   startedAt 타임스탬프 기반 타이머 계산에서 remaining 값 불일치 발생.
 *
 *   이 모듈은 서버(Supabase) 시간과 로컬 시간의 delta(offset)를
 *   RTT 보정과 함께 계산하여 모든 클라이언트에서 동일한
 *   "보정된 현재 시간(Date.now() + offset)"을 사용할 수 있게 한다.
 *
 * ■ 사용:
 *   await calibrateClockOffset();  // 초기 로드 시 1회
 *   const now = getServerNow();    // 이후 모든 시간 계산에 사용
 */

import { supabase } from "./supabase";

let _offset = 0;
let _calibrated = false;

/** 서버-로컬 clock offset (ms). 양수 = 서버가 로컬보다 빠름 */
export function getClockOffset(): number {
	return _offset;
}

/** 보정된 현재 시간 (서버 기준). 모든 타이머 계산에 사용 */
export function getServerNow(): number {
	return Date.now() + _offset;
}

/** 캘리브레이션 완료 여부 */
export function isClockCalibrated(): boolean {
	return _calibrated;
}

/**
 * 서버 시간과의 clock offset을 RTT 보정으로 계산.
 * 초기 로드 시 1회만 호출. 재호출 시 캐시된 값 반환.
 *
 * 원리:
 *   1. 요청 직전 t0 기록
 *   2. Supabase REST API 호출 → 응답의 Date 헤더에서 서버 시간 획득
 *   3. 응답 직후 t1 기록
 *   4. RTT = t1 - t0
 *   5. offset = serverTime - (t0 + RTT/2)  ← 요청-응답 중간 시점 가정
 */
export async function calibrateClockOffset(): Promise<number> {
	if (_calibrated) return _offset;

	try {
		// Supabase REST URL — Date 헤더를 위해 REST API 엔드포인트 사용
		const restUrl = (supabase as any).rest?.url;
		const baseUrl = restUrl
			? restUrl.replace(/\/rest\/v1\/?.*$/, "")
			: import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321";

		const t0 = Date.now();
		const res = await fetch(`${baseUrl}/rest/v1/`, {
			method: "HEAD",
			headers: {
				apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
			},
		});
		const t1 = Date.now();

		const serverDate = res.headers.get("Date");
		if (serverDate) {
			const serverTime = new Date(serverDate).getTime();
			const rtt = t1 - t0;
			_offset = serverTime - (t0 + rtt / 2);
		}
	} catch (err) {
		console.warn("[clockSync] 서버 시간 캘리브레이션 실패, offset=0 사용", err);
		_offset = 0;
	}

	_calibrated = true;
	return _offset;
}
