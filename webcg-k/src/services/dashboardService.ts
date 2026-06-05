/**
 * Dashboard Service — 프로젝트·세션·템플릿 데이터 접근 계층
 * 대시보드 홈(index), 브로드캐스트(broadcast), 템플릿(templates) 페이지에서 사용
 */

import { supabase } from "../lib/supabase";
import type { BroadcastSession } from "../lib/types/broadcast";

// ─── 타입 ────────────────────────────────────────────────────────

// broadcast.tsx 전용: 로그 카운트가 포함된 세션
export interface BroadcastSessionWithLogs extends BroadcastSession {
	broadcastLogCount: number;
	actionLogCount: number;
}

interface FetchAllSessionsOptions {
	archiveMode?: "active" | "archived" | "all";
}

// ─── 프로젝트(세션) 조회 ─────────────────────────────────────────

/** 최근 접근 가능한 프로젝트 조회 (대시보드 홈) */
export async function fetchMyProjects(userId: string): Promise<BroadcastSession[]> {
	const { data, error } = await supabase
		.from("broadcast_sessions")
		.select("*")
		.is("archived_at", null)
		.order("updated_at", { ascending: false })
		.limit(6);
	if (error) throw error;
	return (data || []) as unknown as BroadcastSession[];
}

/** 현재 활성 playout 프로젝트 조회 (실송출 + 리허설) */
export async function fetchLiveProjects(): Promise<BroadcastSession[]> {
	const { data, error } = await supabase
		.from("broadcast_sessions")
		.select("*")
		.in("status", ["live", "rehearsal"])
		.is("archived_at", null)
		.order("updated_at", { ascending: false });
	if (error) throw error;
	return (data || []) as unknown as BroadcastSession[];
}

/** 전체 세션 목록 + 로그 카운트 (브로드캐스트 페이지) */
export async function fetchAllSessions(
	userId: string,
	options: FetchAllSessionsOptions = {},
): Promise<BroadcastSessionWithLogs[]> {
	const archiveMode = options.archiveMode || "active";
	let query = supabase
		.from("broadcast_sessions")
		.select("*")
		.order("updated_at", { ascending: false });

	if (archiveMode === "active") {
		query = query.is("archived_at", null);
	} else if (archiveMode === "archived") {
		query = query.not("archived_at", "is", null);
	}

	const { data, error } = await query;
	if (error) throw error;

	const allRaw = (data || []).map((s: any) => ({
		...s,
		isShared: s.created_by !== userId,
	}));

	// 로그 카운트 병렬 조회
	const sessionsWithLogs: BroadcastSessionWithLogs[] = await Promise.all(
		allRaw.map(async (s: any) => {
			const [{ count: broadcastCount }, { count: actionCount }] = await Promise.all([
				supabase
					.from("session_action_logs")
					.select("id", { count: "exact", head: true })
					.eq("session_id", s.id)
					.eq("action_type", "broadcast_start"),
				supabase
					.from("session_action_logs")
					.select("id", { count: "exact", head: true })
					.eq("session_id", s.id),
			]);
			return {
				...s,
				broadcastLogCount: broadcastCount || 0,
				actionLogCount: actionCount || 0,
			};
		}),
	);

	return sessionsWithLogs;
}

/** 세션 아카이브 — 송출/조작 기록은 보존하고 기본 목록에서 숨긴다. */
export async function archiveSession(sessionId: string): Promise<void> {
	const { error } = await supabase
		.from("broadcast_sessions")
		.update({ archived_at: new Date().toISOString() } as any)
		.eq("id", sessionId);
	if (error) throw error;
}

/** 세션 아카이브 해제 */
export async function restoreArchivedSession(sessionId: string): Promise<void> {
	const { error } = await supabase
		.from("broadcast_sessions")
		.update({ archived_at: null } as any)
		.eq("id", sessionId);
	if (error) throw error;
}

/** 세션 삭제 */
export async function deleteSession(sessionId: string): Promise<void> {
	const { error } = await supabase
		.from("broadcast_sessions")
		.delete()
		.eq("id", sessionId);
	if (error) throw error;
}

// ─── 오버레이 템플릿 ─────────────────────────────────────────────

/** 오버레이 템플릿 목록 조회 */
export async function fetchOverlayTemplates<T>(): Promise<T[]> {
	const { data, error } = await supabase
		.from("overlay_templates")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data || []) as T[];
}

/** 오버레이 템플릿 저장 (생성 또는 수정) */
export async function saveOverlayMeta(
	record: Record<string, unknown>,
	editId?: string,
): Promise<void> {
	if (editId) {
		const { error } = await supabase
			.from("overlay_templates")
			.update(record)
			.eq("id", editId);
		if (error) throw error;
	} else {
		const { error } = await supabase
			.from("overlay_templates")
			.insert(record as any);
		if (error) throw error;
	}
}

/** 오버레이 그래픽 데이터 업데이트 */
export async function updateOverlayGraphics(
	templateId: string,
	elements: unknown[],
): Promise<void> {
	const { error } = await supabase
		.from("overlay_templates")
		.update({ graphic_data: elements as any, updated_at: new Date().toISOString() })
		.eq("id", templateId);
	if (error) throw new Error(error.message);
}

/** 오버레이 템플릿 삭제 — rundown_items 참조가 있으면 거부 */
export async function deleteOverlayTemplate(id: string): Promise<void> {
	// 런다운 아이템 참조 확인 (FK 제약 없으므로 수동 검사)
	const { data: refs, error: refErr } = await supabase
		.from("rundown_items")
		.select("id")
		.eq("source_id", id)
		.limit(1);

	if (refErr) throw new Error("오버레이 사용 여부를 확인할 수 없습니다.");
	if (refs && refs.length > 0) {
		throw new Error("이 오버레이는 큐시트 런다운에서 사용 중이므로 삭제할 수 없습니다.");
	}

	const { error } = await supabase
		.from("overlay_templates")
		.delete()
		.eq("id", id);
	if (error) throw error;
}
