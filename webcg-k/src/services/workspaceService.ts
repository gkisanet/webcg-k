/**
 * Workspace Service
 * 워크스페이스 CRUD + 멤버십 관리
 */

import { supabase } from "../lib/supabase";

export interface Workspace {
	id: string;
	name: string;
	slug: string | null;
	description: string | null;
	avatar_url: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	memberCount?: number;
}

export interface WorkspaceMember {
	id: string;
	workspace_id: string;
	user_id: string;
	role: "owner" | "admin" | "member" | "viewer";
	joined_at: string;
	// joined profile fields
	profile?: {
		id: string;
		display_name: string | null;
		email?: string;
	};
}

/** 관리자용: 모든 워크스페이스 + 멤버 수 + 생성자 이름 */
export async function fetchAllWorkspaces(): Promise<(Workspace & { creatorName: string | null })[]> {
	const { data, error } = await supabase
		.from("workspaces")
		.select("*")
		.order("created_at", { ascending: false });

	if (error) {
		console.error("[WorkspaceService] fetchAllWorkspaces error:", error);
		return [];
	}

	const workspaces = data || [];

	// 멤버 수 집계
	const { data: members, error: memberError } = await supabase
		.from("workspace_members")
		.select("workspace_id");

	if (memberError) {
		console.error("[WorkspaceService] fetchAllWorkspaces member count error:", memberError);
	}

	const countMap = new Map<string, number>();
	for (const m of members || []) {
		countMap.set(m.workspace_id, (countMap.get(m.workspace_id) || 0) + 1);
	}

	// 생성자 이름 조회
	const creatorIds = [...new Set(workspaces.map((w: any) => w.created_by).filter(Boolean))];
	const creatorMap = new Map<string, string>();
	if (creatorIds.length > 0) {
		const { data: profiles } = await supabase
			.from("profiles")
			.select("id, display_name")
			.in("id", creatorIds);
		for (const p of profiles || []) {
			creatorMap.set(p.id, p.display_name || "");
		}
	}

	return workspaces.map((ws: any) => ({
		...ws,
		memberCount: countMap.get(ws.id) || 0,
		creatorName: creatorMap.get(ws.created_by) || null,
	}));
}

/** 내가 속한 모든 워크스페이스 */
export async function fetchWorkspaces(): Promise<Workspace[]> {
	const { data, error } = await supabase
		.from("workspaces")
		.select("*, workspace_members!inner(user_id)")
		.eq("workspace_members.user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
		.order("created_at", { ascending: false });

	if (error) {
		console.error("[WorkspaceService] fetchWorkspaces error:", error);
		return [];
	}

	return (data || []).map((ws: any) => ({
		...ws,
		memberCount: ws.workspace_members?.length ?? 0,
	}));
}

/** 단일 워크스페이스 조회 */
export async function fetchWorkspace(wsId: string): Promise<Workspace | null> {
	const { data, error } = await supabase
		.from("workspaces")
		.select("*")
		.eq("id", wsId)
		.single();

	if (error) {
		console.error("[WorkspaceService] fetchWorkspace error:", error);
		return null;
	}
	return data as Workspace;
}

/** 워크스페이스 생성 (생성자는 자동 owner) */
export async function createWorkspace(
	name: string,
	description?: string,
): Promise<Workspace | null> {
	const { data: userData } = await supabase.auth.getUser();
	const userId = userData.user?.id;
	if (!userId) return null;

	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, "-")
		.replace(/^-|-$/g, "")
		+ "-" + Date.now().toString(36);

	const { data, error } = await supabase
		.from("workspaces")
		.insert({
			name,
			description: description || null,
			slug,
			created_by: userId,
		})
		.select()
		.single();

	if (error) {
		console.error("[WorkspaceService] createWorkspace error:", error);
		return null;
	}

	// 생성자를 owner로 등록
	await supabase.from("workspace_members").insert({
		workspace_id: data.id,
		user_id: userId,
		role: "owner",
	});

	return data as Workspace;
}

/** 워크스페이스 수정 (이름/설명) */
export async function updateWorkspace(
	wsId: string,
	data: { name?: string; description?: string },
): Promise<void> {
	await supabase.from("workspaces").update(data).eq("id", wsId);
}

/** 워크스페이스 삭제 */
export async function deleteWorkspace(wsId: string): Promise<void> {
	await supabase.from("workspaces").delete().eq("id", wsId);
}

/** 워크스페이스 멤버 목록 */
export async function fetchMembers(wsId: string): Promise<WorkspaceMember[]> {
	// 1. 멤버 목록 조회
	const { data: members, error: mError } = await supabase
		.from("workspace_members")
		.select("*")
		.eq("workspace_id", wsId)
		.order("joined_at", { ascending: true });

	if (mError) {
		console.error("[WorkspaceService] fetchMembers error:", mError);
		return [];
	}
	if (!members || members.length === 0) return [];

	// 2. 프로필 별도 조회 (user_id는 auth.users를 참조하므로 profiles와 직접 FK가 없음)
	const userIds = members.map((m) => m.user_id);
	const { data: profiles, error: pError } = await supabase
		.from("profiles")
		.select("id, display_name")
		.in("id", userIds);

	if (pError) {
		console.error("[WorkspaceService] fetchProfiles error:", pError);
	}

	const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

	return members.map((m: any) => ({
		...m,
		profile: profileMap.get(m.user_id)
			? {
					id: profileMap.get(m.user_id)!.id,
					display_name: profileMap.get(m.user_id)!.display_name,
			  }
			: undefined,
	}));
}

/** 이메일로 사용자 검색 (멤버 초대용) */
export async function searchUserByEmail(email: string): Promise<{
	id: string;
	display_name: string | null;
} | null> {
	const { data, error } = await supabase
		.from("profiles")
		.select("id, display_name")
		.or(`id.eq.${email},display_name.ilike.%${email}%`)
		.limit(5);

	// profiles.id can be auth.users id. If search by email directly doesn't work,
	// try the auth admin API (requires service_role, not available from client).
	// For client-side, just search by display_name partial match.
	if (error || !data || data.length === 0) {
		// Fallback: exact match on profiles (assuming email-like display_name)
		const { data: exact } = await supabase
			.from("profiles")
			.select("id, display_name")
			.eq("id", email)
			.single();
		return exact ? { id: exact.id, display_name: exact.display_name } : null;
	}

	return { id: data[0].id, display_name: data[0].display_name };
}

/** 멤버 초대 */
export async function inviteMember(
	wsId: string,
	userId: string,
	role: "admin" | "member" | "viewer" = "member",
): Promise<void> {
	const { error } = await supabase.from("workspace_members").insert({
		workspace_id: wsId,
		user_id: userId,
		role,
	});

	if (error) {
		console.error("[WorkspaceService] inviteMember error:", error);
		throw error;
	}
}

/** 멤버 제거 */
export async function removeMember(wsId: string, userId: string): Promise<void> {
	await supabase
		.from("workspace_members")
		.delete()
		.eq("workspace_id", wsId)
		.eq("user_id", userId);
}

/** 멤버 역할 변경 */
export async function updateMemberRole(
	wsId: string,
	userId: string,
	role: "admin" | "member" | "viewer",
): Promise<void> {
	await supabase
		.from("workspace_members")
		.update({ role })
		.eq("workspace_id", wsId)
		.eq("user_id", userId);
}

/** 활성 워크스페이스 전환 */
export async function switchActiveWorkspace(wsId: string): Promise<void> {
	const { error } = await supabase
		.from("profiles")
		.update({ active_workspace_id: wsId } as any)
		.eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");

	if (error) {
		console.error("[WorkspaceService] switchActiveWorkspace error:", error);
	}
}
