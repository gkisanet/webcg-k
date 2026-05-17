/**
 * Pending Changes Store — NRCS 변경 알림 인메모리 큐
 *
 * ■ Why 인메모리?
 *   NRCS 변경 알림은 "현재 세션 한정" 정보이므로 DB 영속화 불필요.
 *   방송 종료 시 자동 소멸되어 DB 복잡도를 증가시키지 않는다.
 *   TanStack Store를 사용하여 React 컴포넌트와 자연스럽게 통합.
 *
 * ■ 데이터 흐름:
 *   1. Supabase Realtime → nrcs_cuesheet_items 변경 감지
 *   2. addPendingChange() → pending 큐에 적재 + 헤더 배지 표시
 *   3. PD가 알림 배지 클릭 → Diff 드로어 표시
 *   4. 승인 → updateBlockSourceData() → 렌더러 재발행
 *   5. 거부 → dismissPendingChange() → 큐에서 제거
 */

import { Store } from "@tanstack/store";

// ─── 필드 레벨 변경 정보 ────────────────────────────────────────
export interface FieldChange {
	fieldKey: string;     // 예: "name", "title", "text"
	fieldLabel: string;   // 예: "이름", "직함", "본문"
	oldValue: string;
	newValue: string;
}

// ─── Pending Change (단일 변경 항목) ────────────────────────────
export interface PendingChange {
	id: string;                   // 고유 ID (uuid)
	timestamp: number;            // 변경 감지 시각 (Date.now())
	cuesheetItemId: string;       // 큐시트 아이템 ID
	blockId?: string;             // 매칭되는 타임라인 블록 ID (있을 경우)
	blockName?: string;           // 블록 이름 (UI 표시용)
	eventType: "UPDATE" | "INSERT" | "DELETE";
	// 필드 레벨 변경 상세 (UPDATE인 경우)
	fieldChanges: FieldChange[];
	// 원본 레코드 (승인 시 sourceData 갱신에 사용)
	newRecord: any;
	oldRecord?: any;
	// 처리 상태
	status: "pending" | "approved" | "dismissed";
}

// ─── 스토어 상태 ───────────────────────────────────────────────
export interface PendingChangesState {
	changes: PendingChange[];
}

// 스토어 생성
export const pendingChangesStore = new Store<PendingChangesState>({
	changes: [],
});

// ─── 액션 함수들 ───────────────────────────────────────────────

/**
 * 새로운 변경 알림 추가
 * Supabase Realtime 이벤트 → 이 함수로 변환하여 큐에 적재
 */
export function addPendingChange(change: Omit<PendingChange, "id" | "timestamp" | "status">): void {
	const newChange: PendingChange = {
		...change,
		id: `pc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		timestamp: Date.now(),
		status: "pending",
	};

	pendingChangesStore.setState((state) => ({
		...state,
		changes: [...state.changes, newChange],
	}));

	console.log("[PendingChanges] 변경 감지:", {
		type: change.eventType,
		item: change.cuesheetItemId,
		fields: change.fieldChanges.map(f => `${f.fieldLabel}: ${f.oldValue}→${f.newValue}`),
	});
}

/**
 * 특정 변경을 승인 처리
 * PD가 Diff 확인 후 "반영" 클릭 시 호출
 */
export function approvePendingChange(changeId: string): PendingChange | null {
	let approved: PendingChange | null = null;

	pendingChangesStore.setState((state) => ({
		...state,
		changes: state.changes.map((c) => {
			if (c.id === changeId) {
				approved = { ...c, status: "approved" };
				return approved;
			}
			return c;
		}),
	}));

	return approved;
}

/**
 * 특정 변경을 무시 처리
 */
export function dismissPendingChange(changeId: string): void {
	pendingChangesStore.setState((state) => ({
		...state,
		changes: state.changes.map((c) =>
			c.id === changeId ? { ...c, status: "dismissed" } : c,
		),
	}));
}

/**
 * 모든 변경을 일괄 승인
 */
export function approveAllPendingChanges(): PendingChange[] {
	const approved: PendingChange[] = [];

	pendingChangesStore.setState((state) => ({
		...state,
		changes: state.changes.map((c) => {
			if (c.status === "pending") {
				const a = { ...c, status: "approved" as const };
				approved.push(a);
				return a;
			}
			return c;
		}),
	}));

	return approved;
}

/**
 * 모든 변경을 일괄 무시
 */
export function dismissAllPendingChanges(): void {
	pendingChangesStore.setState((state) => ({
		...state,
		changes: state.changes.map((c) =>
			c.status === "pending" ? { ...c, status: "dismissed" } : c,
		),
	}));
}

/**
 * 처리 완료된 변경(approved/dismissed)을 큐에서 정리
 * 주기적으로 또는 드로어 닫을 때 호출
 */
export function clearProcessedChanges(): void {
	pendingChangesStore.setState((state) => ({
		...state,
		changes: state.changes.filter((c) => c.status === "pending"),
	}));
}

// ─── 셀렉터 (파생 상태) ────────────────────────────────────────

/** pending 상태인 변경 수 */
export function getPendingCount(state: PendingChangesState): number {
	return state.changes.filter((c) => c.status === "pending").length;
}

/** pending 상태인 변경 목록 */
export function getPendingChanges(state: PendingChangesState): PendingChange[] {
	return state.changes.filter((c) => c.status === "pending");
}
