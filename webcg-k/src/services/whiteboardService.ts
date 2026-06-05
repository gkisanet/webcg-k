import { supabase } from "../lib/supabase";

export interface WhiteboardMeta {
	id: string;
	name: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: "private" | "workspace" | "public";
	thumbnail_url: string | null;
	document_state: unknown;
	created_at: string;
	updated_at: string;
}

export async function fetchWhiteboards(workspaceId: string): Promise<WhiteboardMeta[]> {
	if (!workspaceId) return [];
	// 워크스페이스에 속한 보드 + 전역 공개(public) 보드 모두 조회
	// (RLS가 이미 필터링해주지만, 명시적으로 or 조건을 주거나 RLS에 맡길 수 있음. 여기서는 RLS를 믿고 조건 없이 조회할 수도 있으나,
	// 현재 UI 기획상 내 워크스페이스 패널에서 보는 것이므로 workspace_id 매칭이거나 visibility=public 인 것을 가져온다.)
	const { data, error } = await supabase
		.from("whiteboards")
		.select("id, name, workspace_id, owner_id, visibility, thumbnail_url, document_state, created_at, updated_at")
		.or(`workspace_id.eq.${workspaceId},visibility.eq.public`)
		.order("created_at", { ascending: false });

	if (error) throw error;
	return data as WhiteboardMeta[];
}

export async function createWhiteboardWithWorkspace(name: string, workspace_id: string): Promise<WhiteboardMeta> {
	// owner_id는 DB에서 auth.uid()를 기본으로 가져가거나, 클라이언트에서 삽입 안 해도 Supabase RLS 제약에 따라 들어갈 수 있음
	// 단, 우리는 trigger를 만들지 않았으므로 명시적으로 넣어주는 것이 좋으나 auth_uid()를 쓰기 위해 user를 가져와야 함.
	// 간단히 supabase auth에서 가져옴
	const { data: userData } = await supabase.auth.getUser();
	
	const { data, error } = await supabase
		.from("whiteboards")
		.insert([{ name, workspace_id, owner_id: userData.user?.id, visibility: "workspace" }])
		.select()
		.single();

	if (error) throw error;
	return data as WhiteboardMeta;
}

export async function deleteWhiteboard(id: string): Promise<void> {
	const { error } = await supabase.from("whiteboards").delete().eq("id", id);
	if (error) throw error;
}

export async function updateWhiteboardVisibility(
	id: string,
	visibility: "private" | "workspace" | "public"
): Promise<void> {
	const { error } = await supabase
		.from("whiteboards")
		.update({ visibility })
		.eq("id", id);
	
	if (error) throw error;
}
