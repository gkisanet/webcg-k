/**
 * ActionLog Store — 멀티유저 중요 액션 히스토리 기록
 * 송출/PGM/오버레이 제어 이벤트를 시간순으로 추적
 * 클라이언트 스토어 + Supabase session_action_logs 테이블 동시 저장
 *
 * Why i18n 적용?
 * - ACTION_LABELS에 한국어 라벨이 하드코딩되어 있었음
 * - i18n 키로 교체하여 언어 전환 시 액션 로그도 번역됨
 * - 주의: label은 이제 i18n 키 문자열이므로, UI에서 t(label) 호출 필요
 */

import { Store } from "@tanstack/react-store";
import { supabase } from "../lib/supabase";

// 액션 타입 정의
export type ActionType =
	| "broadcast_start" // 송출 시작
	| "broadcast_stop" // 송출 중단
	| "pgm_on" // PGM 블록 송출 (그래픽 나타남)
	| "pgm_off" // PGM 블록 해제 (그래픽 사라짐)
	| "overlay_on" // 오버레이 활성화
	| "overlay_off" // 오버레이 비활성화
	| "overlay_update" // 오버레이 업데이트
	| "text_edit" // 방송 중 텍스트 핫 수정
	| "nrcs_change_approved"; // NRCS 변경 PD 승인

// 액션 로그 엔트리
export interface ActionLogEntry {
	id: string;
	timestamp: Date;
	type: ActionType;
	userId: string;
	userName: string;
	/** 대상 이름 (예: 블록명, 오버레이명) */
	targetName: string;
	/** 추가 상세 정보 */
	detail?: string;
}

// 액션 타입별 라벨/아이콘
// label은 i18n 키 (common namespace의 actionLog.*)
export const ACTION_LABELS: Record<ActionType, { label: string; icon: string; color: string }> = {
	broadcast_start: { label: "actionLog.broadcastStart", icon: "🟢", color: "var(--accent-success)" },
	broadcast_stop: { label: "actionLog.broadcastStop", icon: "🔴", color: "var(--accent-danger, #ef4444)" },
	pgm_on: { label: "actionLog.pgmOn", icon: "📺", color: "var(--accent-primary)" },
	pgm_off: { label: "actionLog.pgmOff", icon: "⏹", color: "var(--text-tertiary)" },
	overlay_on: { label: "actionLog.overlayOn", icon: "🎭", color: "var(--accent-warning, #f59e0b)" },
	overlay_off: { label: "actionLog.overlayOff", icon: "🎭", color: "var(--text-tertiary)" },
	overlay_update: { label: "actionLog.overlayUpdate", icon: "🔄", color: "var(--accent-secondary, #8b5cf6)" },
	text_edit: { label: "actionLog.textEdit", icon: "✏️", color: "var(--accent-warning, #f59e0b)" },
	nrcs_change_approved: { label: "actionLog.nrcsApproved", icon: "🔔", color: "var(--accent-success)" },
};

// 최대 로그 수
const MAX_LOG_ENTRIES = 200;

// 스토어 상태
interface ActionLogState {
	entries: ActionLogEntry[];
}

export const actionLogStore = new Store<ActionLogState>({
	entries: [],
});

/**
 * 액션 로그 추가 — 클라이언트 스토어 + Supabase 동시 저장
 * @param sessionId 세션 ID (Supabase 저장용, 없으면 클라이언트만)
 */
export function addActionLog(
	type: ActionType,
	userId: string,
	userName: string,
	targetName: string,
	detail?: string,
	sessionId?: string,
): void {
	const entry: ActionLogEntry = {
		id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		timestamp: new Date(),
		type,
		userId,
		userName,
		targetName,
		detail,
	};

	// 1. 클라이언트 스토어에 저장 (실시간 UI)
	actionLogStore.setState((state) => ({
		entries: [entry, ...state.entries].slice(0, MAX_LOG_ENTRIES),
	}));

	// 2. Supabase session_action_logs 테이블에 비동기 저장
	if (sessionId && userId && userId !== "unknown") {
		supabase
			.from("session_action_logs")
			.insert({
				session_id: sessionId,
				user_id: userId,
				action_type: type,
				action_detail: { targetName, detail, userName },
			})
			.then(({ error }: { error: any }) => {
				if (error) console.warn("[ActionLog] Supabase save failed:", error.message);
			});
	}
}

/**
 * 로그 초기화 (클라이언트만)
 */
export function clearActionLog(): void {
	actionLogStore.setState(() => ({ entries: [] }));
}
