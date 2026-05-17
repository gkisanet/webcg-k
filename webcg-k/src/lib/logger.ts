/**
 * 📋 구조화된 로거 유틸리티
 *
 * Why: console.log 162개를 일괄 관리하기 위한 계층형 로거.
 * - 프로덕션에서는 warn/error만 출력하고 debug/info는 자동 비활성
 * - 도메인별 네임스페이스로 출력을 필터링할 수 있어 디버깅 효율 향상
 *
 * 🎓 비유: console.log가 숲 속 여기저기 뿌린 빵 부스러기라면,
 *          Logger는 컬러 리본으로 표시된 정식 등산로 마커다.
 */

// 1. 로그 레벨 정의 — 숫자가 높을수록 심각
const LOG_LEVELS = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	silent: 4, // 모든 로그 비활성
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// 2. 현재 환경의 최소 로그 레벨 결정
//    - development: debug (전부 출력)
//    - production: warn (경고/에러만)
const isDev =
	typeof window !== "undefined"
		? window.location?.hostname === "localhost"
		: process.env.NODE_ENV !== "production";

const MIN_LEVEL: LogLevel = isDev ? "debug" : "warn";

// 3. 네임스페이스별 색상 팔레트 — console 가독성 향상
const NAMESPACE_COLORS: Record<string, string> = {
	"[Timeline]": "#00d4ff",
	"[Overlay]": "#7c3aed",
	"[Realtime]": "#10b981",
	"[AI]": "#f59e0b",
	"[Auth]": "#ef4444",
	"[Render]": "#ec4899",
	"[NRCS]": "#06b6d4",
	"[Character]": "#8b5cf6",
};

function getColor(namespace: string): string {
	return NAMESPACE_COLORS[namespace] || "#a3a3a3";
}

// 4. 로거 팩토리 함수
function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/**
 * 네임스페이스가 지정된 로거를 생성한다.
 * @example
 * const log = createLogger('[Timeline]');
 * log.debug('블록 이동', { blockId, newPosition });
 * log.warn('겹침 감지', { blockA, blockB });
 * log.error('Realtime 연결 실패', error);
 */
export function createLogger(namespace: string) {
	const color = getColor(namespace);

	return {
		debug: (...args: unknown[]) => {
			if (shouldLog("debug")) {
				console.log(`%c${namespace}`, `color: ${color}; font-weight: bold`, ...args);
			}
		},
		info: (...args: unknown[]) => {
			if (shouldLog("info")) {
				console.info(`%c${namespace}`, `color: ${color}; font-weight: bold`, ...args);
			}
		},
		warn: (...args: unknown[]) => {
			if (shouldLog("warn")) {
				console.warn(`%c${namespace}`, `color: ${color}; font-weight: bold`, ...args);
			}
		},
		error: (...args: unknown[]) => {
			if (shouldLog("error")) {
				console.error(`%c${namespace}`, `color: ${color}; font-weight: bold`, ...args);
			}
		},
	};
}

// 5. 기본 로거 (네임스페이스 없음) — 전역 사용
export const logger = createLogger("[App]");
