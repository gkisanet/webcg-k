/**
 * Admin Service — 관리자 패널 데이터 접근 계층
 * admin.tsx 페이지에서 사용 (프로필, AI 모델, API 키, 사용량)
 */

import { supabase } from "../lib/supabase";
import type { UserRole } from "../lib/auth";

// ─── 타입 ────────────────────────────────────────────────────────

export interface UsageSummary {
	totalRequests: number;
	totalTokens: number;
	todayRequests: number;
	todayTokens: number;
}

/** 모델별 사용량 집계 */
export interface ModelUsage {
	modelId: string;
	todayRequests: number;
	todayTokens: number;
	totalRequests: number;
	totalTokens: number;
}

// ─── 프로필 ──────────────────────────────────────────────────────

export interface MembershipInfo {
	workspace_id: string;
	workspace_name: string;
	role: "owner" | "admin" | "member" | "viewer";
}

export interface ProfileWithMemberships {
	id: string;
	display_name: string | null;
	is_admin: boolean;
	role: UserRole;
	updated_at: string;
	created_at: string;
	memberships: MembershipInfo[];
}

/** 전체 사용자 프로필 조회 */
export async function fetchProfiles<T>(): Promise<T[]> {
	const { data, error } = await supabase
		.from("profiles")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return data as T[];
}

/** 사용자 + 소속 워크스페이스 목록 조회 */
export async function fetchProfilesWithMemberships(): Promise<ProfileWithMemberships[]> {
	const [{ data: profiles }, { data: memberships }, { data: workspaces }] = await Promise.all([
		supabase.from("profiles").select("*").order("created_at", { ascending: false }),
		supabase.from("workspace_members").select("*"),
		supabase.from("workspaces").select("id, name"),
	]);

	// 1. 워크스페이스 ID 매핑 폴리필 (w.id 또는 w.workspaceId 지원)
	const wsMap = new Map((workspaces || []).map((w: any) => {
		const wsId = w.id || w.workspaceId;
		return [wsId, w.name];
	}));

	// 2. 명시적 참조 분리 및 snake_case / camelCase 완벽 폴리필 매핑
	const membershipMap = new Map<string, MembershipInfo[]>();
	for (const m of memberships || []) {
		const mUserId = m.user_id || m.userId;
		const mWorkspaceId = m.workspace_id || m.workspaceId;
		const mRole = m.role;

		if (!mUserId) {
			console.warn("[AdminService] workspace_member row missing user identity:", m);
			continue; // 오염된 undefined 키 누적 원천 차단 (다중 테넌트 렌더링 오염 해결 핵심)
		}

		// shallow copy를 통한 참조 공유 방지
		const list = membershipMap.has(mUserId) ? [...membershipMap.get(mUserId)!] : [];
		list.push({
			workspace_id: mWorkspaceId,
			workspace_name: wsMap.get(mWorkspaceId) || "Unknown",
			role: (mRole || "viewer") as "owner" | "admin" | "member" | "viewer",
		});
		membershipMap.set(mUserId, list);
	}

	// 3. 프로필에 memberships 맵핑시 id 및 userId 폴리필 지원
	return (profiles || []).map((p: any) => {
		const pId = p.id || p.userId;
		return {
			...p,
			memberships: pId ? (membershipMap.get(pId) || []) : [],
		};
	});
}

/** 관리자 권한 토글 (하위 호환) */
export async function toggleAdmin(userId: string, currentIsAdmin: boolean): Promise<void> {
	const { error } = await supabase
		.from("profiles")
		.update({ is_admin: !currentIsAdmin })
		.eq("id", userId);
	if (error) throw error;
}

/** 사용자 역할 변경 */
export async function changeRole(userId: string, role: string): Promise<void> {
	const isAdmin = role === "system_admin";
	const { error } = await supabase
		.from("profiles")
		.update({ role, is_admin: isAdmin } as any)
		.eq("id", userId);
	if (error) throw error;
}

// ─── AI 모델 ─────────────────────────────────────────────────────

/** AI 모델 목록 조회 */
export async function fetchModels<T>(): Promise<T[]> {
	const { data, error } = await supabase
		.from("ai_model_config")
		.select("*")
		.order("is_active", { ascending: false });
	if (error) throw error;
	return (data || []) as T[];
}

/** AI 사용량 집계 조회 */
export async function fetchUsageSummary(): Promise<UsageSummary> {
	const { data: allLogs } = await supabase
		.from("ai_usage_logs")
		.select("id, total_tokens, created_at");
	const totalRequests = allLogs?.length ?? 0;
	const totalTokens = allLogs?.reduce((sum: number, l: any) => sum + (l.total_tokens || 0), 0) ?? 0;
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayLogs = allLogs?.filter((l: any) => new Date(l.created_at) >= todayStart) ?? [];
	return {
		totalRequests,
		totalTokens,
		todayRequests: todayLogs.length,
		todayTokens: todayLogs.reduce((sum: number, l: any) => sum + (l.total_tokens || 0), 0),
	};
}

/** 모델별 사용량 집계 — ai_usage_logs를 model_id 기준 GROUP BY */
export async function fetchUsageByModel(): Promise<Record<string, ModelUsage>> {
	const { data: allLogs } = await supabase
		.from("ai_usage_logs")
		.select("model_id, total_tokens, created_at");

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	// 1. 모델별 집계 Map 생성
	const map: Record<string, ModelUsage> = {};
	for (const log of allLogs ?? []) {
		const mid = (log as any).model_id as string;
		if (!map[mid]) {
			map[mid] = { modelId: mid, todayRequests: 0, todayTokens: 0, totalRequests: 0, totalTokens: 0 };
		}
		const tokens = ((log as any).total_tokens as number) || 0;
		map[mid].totalRequests++;
		map[mid].totalTokens += tokens;
		if (new Date((log as any).created_at) >= todayStart) {
			map[mid].todayRequests++;
			map[mid].todayTokens += tokens;
		}
	}
	return map;
}

/** 모델 전환 (모든 모델 비활성화 → 선택 모델 활성화) */
export async function switchModel(modelId: string): Promise<void> {
	await supabase
		.from("ai_model_config")
		.update({ is_active: false })
		.neq("model_id", "");
	await supabase
		.from("ai_model_config")
		.update({ is_active: true, updated_at: new Date().toISOString() })
		.eq("model_id", modelId);
}

/** 모델 임계치 업데이트 */
export async function updateThreshold(modelId: string, threshold: number): Promise<void> {
	await supabase
		.from("ai_model_config")
		.update({ threshold_percent: threshold })
		.eq("model_id", modelId);
}

/** 모델 추가 */
export async function addModel(record: Record<string, unknown>): Promise<void> {
	await supabase.from("ai_model_config").insert(record as any);
}

/** 모델 삭제 */
export async function deleteModel(modelId: string): Promise<void> {
	await supabase.from("ai_model_config").delete().eq("model_id", modelId);
}

/** 시스템 프롬프트 저장 */
export async function saveSystemPrompt(modelId: string, prompt: string): Promise<void> {
	await supabase
		.from("ai_model_config")
		.update({ system_prompt: prompt || null })
		.eq("model_id", modelId);
}

/** 생성 설정 저장 */
export async function saveGenerationConfig(modelId: string, config: Record<string, unknown>): Promise<void> {
	await supabase
		.from("ai_model_config")
		.update({ generation_config: config as any })
		.eq("model_id", modelId);
}

/** API 키 연결 */
export async function linkApiKey(modelId: string, apiKeyId: string | null): Promise<void> {
	await supabase
		.from("ai_model_config")
		.update({ api_key_id: apiKeyId || null })
		.eq("model_id", modelId);
}

// ─── API 키 ──────────────────────────────────────────────────────

/** API 키 목록 조회 */
export async function fetchApiKeys<T>(): Promise<T[]> {
	const { data, error } = await supabase
		.from("api_keys")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data || []) as T[];
}

/** API 키 저장 */
export async function saveApiKey(record: Record<string, unknown>): Promise<void> {
	const { error } = await supabase.from("api_keys").insert(record as any);
	if (error) throw error;
}

/** API 키 삭제 */
export async function deleteApiKey(id: string): Promise<void> {
	const { error } = await supabase.from("api_keys").delete().eq("id", id);
	if (error) throw error;
}
