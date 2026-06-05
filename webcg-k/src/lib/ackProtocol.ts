/**
 * ACK Protocol + Heartbeat + Health Monitor
 *
 * ■ Why ACK?
 *   Supabase Realtime의 Broadcast는 Fire-and-Forget 방식이다.
 *   즉, 컨트롤러가 "PLAY" 이벤트를 보내도 렌더러가 실제로 받았는지 알 수 없다.
 *   네트워크 순간 끊김 시 렌더러는 이전 CG를 계속 표시(State Drift).
 *   ACK 핸드셰이크로 "받았음" 확인 + 재전송 로직을 추가한다.
 *
 * ■ Why Heartbeat?
 *   렌더러(OBS 브라우저 소스)가 24시간 무인으로 돌아간다.
 *   렌더러가 죽거나, 메모리 누수로 응답 불가 상태가 되어도
 *   컨트롤러에 알림이 없으면 PD가 인지하지 못한다.
 *   1초 주기 Heartbeat로 렌더러 생존과 상태를 감시한다.
 *
 * ■ 비유: 등기우편 + 심박 모니터
 *   - ACK = 등기우편의 "받았음" 확인증
 *   - Heartbeat = 환자 심박 모니터 — 끊기면 경보
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { sendRealtimeBroadcast } from "./realtimeBroadcast";

// ─── Heartbeat 메시지 타입 ─────────────────────────────────

export interface HeartbeatPayload {
	/** 렌더러 고유 ID (탭 단위) */
	rendererId: string;
	/** 타임스탬프 */
	timestamp: number;
	/** 현재 표시 중인 CG 블록 ID (없으면 null) */
	currentItemId: string | null;
	/** JS 힙 메모리 사용량 (bytes, Chrome only) */
	memoryUsed: number | null;
	/** JS 힙 메모리 한도 (bytes) */
	memoryLimit: number | null;
}

// ─── ACK 메시지 타입 ─────────────────────────────────────────

export interface AckPayload {
	/** 시퀀스 번호 (컨트롤러가 발행한 seqNum과 매칭) */
	seqNum: number;
	/** ACK 상태 */
	status: "received" | "rendered" | "error";
	/** 에러 메시지 (status=error일 때) */
	errorMessage?: string;
}

// ─── 렌더러 상태 (컨트롤러 측에서 관리) ──────────────────────

export type RendererStatus = "connected" | "delayed" | "disconnected";

export interface RendererState {
	rendererId: string;
	status: RendererStatus;
	lastHeartbeat: number;
	currentItemId: string | null;
	memoryUsedMB: number | null;
	memoryLimitMB: number | null;
	memoryPercent: number | null;
}

// ─── 렌더러 ID 생성 (탭 당 1개) ─────────────────────────────

/**
 * 렌더러 고유 ID 생성
 * ■ Why sessionStorage?
 *   같은 세션의 렌더러를 구분하기 위해 탭 단위 고유 ID가 필요.
 *   localStorage는 탭 간 공유되므로 sessionStorage 사용.
 *   Micro-Flush(location.reload) 시에도 sessionStorage는 유지됨.
 */
export function getOrCreateRendererId(): string {
	const KEY = "webcgk_renderer_id";
	let id = sessionStorage.getItem(KEY);

	if (!id) {
		id = `renderer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		sessionStorage.setItem(KEY, id);
	}

	return id;
}

// ─── 렌더러 측: Heartbeat 발신기 ────────────────────────────

/**
 * Heartbeat 발신 시작
 * 매 interval(ms)마다 렌더러 상태를 Broadcast 채널로 전송.
 *
 * @returns 중지 함수 (cleanup용)
 */
export function startHeartbeat(
	channel: RealtimeChannel,
	getCurrentItemId: () => string | null,
	intervalMs = 1000,
): () => void {
	const rendererId = getOrCreateRendererId();

	const timer = setInterval(() => {
		// 1. 메모리 정보 수집 (Chrome에서만 사용 가능)
		const memory = (performance as any).memory;
		const memoryUsed = memory?.usedJSHeapSize ?? null;
		const memoryLimit = memory?.jsHeapSizeLimit ?? null;

		// 2. Heartbeat 발행
		const payload: HeartbeatPayload = {
			rendererId,
			timestamp: Date.now(),
			currentItemId: getCurrentItemId(),
			memoryUsed,
			memoryLimit,
		};

		try {
			void sendRealtimeBroadcast(channel, "heartbeat", payload as unknown as Record<string, unknown>, {
				restFallback: false,
			});
		} catch {
			// 채널 끊긴 상태 — 다음 인터벌에서 재시도
			console.warn("[Heartbeat] 발신 실패 — 채널 끊김");
		}
	}, intervalMs);

	console.log(`[Heartbeat] 시작 (${intervalMs}ms 주기, ID: ${rendererId})`);

	return () => {
		clearInterval(timer);
		console.log("[Heartbeat] 중지");
	};
}

// ─── 렌더러 측: ACK 응답기 ─────────────────────────────────

/**
 * 수신한 playout 이벤트에 대해 ACK 응답 발행
 */
export function sendAck(
	channel: RealtimeChannel,
	seqNum: number,
	status: AckPayload["status"],
	errorMessage?: string,
): void {
	const ack: AckPayload = { seqNum, status, errorMessage };

	try {
		void sendRealtimeBroadcast(channel, "ack", ack as unknown as Record<string, unknown>, {
			restFallback: true,
		});
	} catch {
		console.warn("[ACK] 응답 발신 실패");
	}
}

// ─── 컨트롤러 측: Heartbeat 감시기 ─────────────────────────

/**
 * Heartbeat 감시 시작
 * 렌더러의 Heartbeat를 수신하고, 3초 이상 끊기면 "disconnected" 판정.
 *
 * @returns { getState, stop } — 현재 렌더러 상태 조회 + 중지 함수
 */
export function createHeartbeatMonitor(options?: {
	/** disconnected 판정 임계값 (ms, 기본 3000) */
	disconnectThresholdMs?: number;
	/** delayed 판정 임계값 (ms, 기본 1500) */
	delayThresholdMs?: number;
	/** 상태 변경 콜백 */
	onStatusChange?: (state: RendererState) => void;
}) {
	const {
		disconnectThresholdMs = 3000,
		delayThresholdMs = 1500,
		onStatusChange,
	} = options ?? {};

	let state: RendererState = {
		rendererId: "",
		status: "disconnected",
		lastHeartbeat: 0,
		currentItemId: null,
		memoryUsedMB: null,
		memoryLimitMB: null,
		memoryPercent: null,
	};

	// 1. Heartbeat 수신 처리
	function handleHeartbeat(payload: HeartbeatPayload): void {
		const memUsedMB = payload.memoryUsed ? Math.round(payload.memoryUsed / 1024 / 1024) : null;
		const memLimitMB = payload.memoryLimit ? Math.round(payload.memoryLimit / 1024 / 1024) : null;
		const memPercent = memUsedMB && memLimitMB ? Math.round((memUsedMB / memLimitMB) * 100) : null;

		const newState: RendererState = {
			rendererId: payload.rendererId,
			status: "connected",
			lastHeartbeat: payload.timestamp,
			currentItemId: payload.currentItemId,
			memoryUsedMB: memUsedMB,
			memoryLimitMB: memLimitMB,
			memoryPercent: memPercent,
		};

		const statusChanged = state.status !== newState.status;
		state = newState;

		if (statusChanged) {
			onStatusChange?.(state);
		}
	}

	// 2. 주기적 상태 체크 (1초마다)
	const checkTimer = setInterval(() => {
		if (state.lastHeartbeat === 0) return; // 아직 한 번도 수신 안 함

		const elapsed = Date.now() - state.lastHeartbeat;
		let newStatus: RendererStatus;

		if (elapsed > disconnectThresholdMs) {
			newStatus = "disconnected";
		} else if (elapsed > delayThresholdMs) {
			newStatus = "delayed";
		} else {
			newStatus = "connected";
		}

		if (state.status !== newStatus) {
			state = { ...state, status: newStatus };
			onStatusChange?.(state);
		}
	}, 1000);

	return {
		/** 현재 렌더러 상태 조회 */
		getState: () => state,
		/** Heartbeat 수신 처리 (채널 이벤트 핸들러에서 호출) */
		handleHeartbeat,
		/** 감시 중지 */
		stop: () => clearInterval(checkTimer),
	};
}

// ─── 컨트롤러 측: State Drift 감지 ──────────────────────────

/**
 * 컨트롤러의 PGM 블록 ID와 렌더러가 보고한 현재 블록 ID 비교
 *
 * ■ Why Drift 감지?
 *   네트워크 끊김 → 복구 후, 컨트롤러는 "블록 A 송출 중"이지만
 *   렌더러는 "블록 B를 표시 중" → 시청자에게 잘못된 CG 표시.
 *   Heartbeat의 currentItemId와 pgmBlockId를 비교하여 Drift 자동 감지.
 */
export function detectStateDrift(
	pgmBlockId: string | null,
	rendererCurrentItemId: string | null,
): boolean {
	// 둘 다 null이면 정상 (아무것도 송출 안 함)
	if (!pgmBlockId && !rendererCurrentItemId) return false;

	// 하나만 null이면 Drift
	if (!pgmBlockId || !rendererCurrentItemId) return true;

	// ID 불일치 = Drift
	return pgmBlockId !== rendererCurrentItemId;
}

// ─── 렌더러 측: 메모리 Health 체크 + Micro-Flush ─────────────

/**
 * 메모리 감시 시작
 * 5분 주기로 체크, 80% 초과 시 Micro-Flush (페이지 리로드).
 *
 * ■ Why Micro-Flush?
 *   OBS 브라우저 소스는 24시간 연속 가동된다.
 *   브라우저 메모리 누수(DOM 노드 누적, 이벤트 리스너 해제 실패 등)가
 *   점진적으로 쌓이면 렌더링 성능이 저하된다.
 *   Micro-Flush는 현재 PGM 상태를 sessionStorage에 저장 → 리로드 → 복원
 *   하는 방식으로, 시청자가 인지 불가한 수준(~100ms)의 자가 치유를 수행한다.
 *
 * ■ Why 80%?
 *   Chrome V8의 GC는 힙 사용량이 높을수록 빈번해져 jank가 발생한다.
 *   80%를 초과하면 GC 비용이 지수적으로 증가하므로, 사전에 리로드하는 것이 안전.
 *
 * @returns 중지 함수
 */
export function startMemoryMonitor(
	getCurrentItemId: () => string | null,
	options?: {
		/** 체크 주기 (ms, 기본 300000 = 5분) */
		intervalMs?: number;
		/** Micro-Flush 임계값 (0.0~1.0, 기본 0.8) */
		flushThreshold?: number;
		/** Micro-Flush 전 상태 저장 키 */
		storageKey?: string;
	},
): () => void {
	const {
		intervalMs = 5 * 60 * 1000,
		flushThreshold = 0.8,
		storageKey = "webcgk_pgm_restore",
	} = options ?? {};

	const timer = setInterval(() => {
		const memory = (performance as any).memory;
		if (!memory) return; // memory API 미지원 (Firefox 등)

		const usedMB = memory.usedJSHeapSize / 1024 / 1024;
		const limitMB = memory.jsHeapSizeLimit / 1024 / 1024;
		const usage = usedMB / limitMB;

		console.log(`[Health] 메모리: ${usedMB.toFixed(0)}MB / ${limitMB.toFixed(0)}MB (${(usage * 100).toFixed(1)}%)`);

		if (usage > flushThreshold) {
			console.warn(`[Health] ⚠️ 메모리 ${(usage * 100).toFixed(0)}% 초과 — Micro-Flush 실행`);

			// 1. 현재 PGM 상태를 sessionStorage에 저장
			const currentItemId = getCurrentItemId();
			if (currentItemId) {
				sessionStorage.setItem(storageKey, currentItemId);
			}

			// 2. 페이지 리로드 (OBS는 URL 유지하므로 자동 재접속)
			location.reload();
		}
	}, intervalMs);

	console.log(`[Health] 메모리 감시 시작 (${intervalMs / 1000}초 주기, 임계값 ${flushThreshold * 100}%)`);

	return () => {
		clearInterval(timer);
		console.log("[Health] 메모리 감시 중지");
	};
}

/**
 * Micro-Flush 후 PGM 상태 복원
 *
 * @returns 복원된 블록 ID (없으면 null)
 */
export function restoreMicroFlushState(
	storageKey = "webcgk_pgm_restore",
): string | null {
	const saved = sessionStorage.getItem(storageKey);
	if (saved) {
		sessionStorage.removeItem(storageKey);
		console.log("[Health] Micro-Flush 후 PGM 상태 복원:", saved);
		return saved;
	}
	return null;
}
