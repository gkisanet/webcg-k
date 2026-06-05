import { supabase } from "../lib/supabase";

export const AI_CUESHEET_DRAFT_FOLDER_NAME = "AI 큐시트 초안";

export type OverlayFolderSelection = "all" | "unfiled" | string;

export interface OverlayFolderRecord {
	id: string;
	owner_id: string | null;
	workspace_id: string | null;
	name: string;
	color: string | null;
	is_system: boolean | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface FolderedOverlayTemplate {
	id: string;
	folder_id?: string | null;
}

export function normalizeOverlayFolderName(name: string): string | null {
	const normalized = name.trim().replace(/\s+/g, " ");
	return normalized.length > 0 ? normalized : null;
}

export function filterOverlayTemplatesByFolder<T extends FolderedOverlayTemplate>(
	templates: T[],
	selection: OverlayFolderSelection,
): T[] {
	if (selection === "all") return templates;
	if (selection === "unfiled") return templates.filter((template) => !template.folder_id);
	return templates.filter((template) => template.folder_id === selection);
}

export async function fetchOverlayFolders(): Promise<OverlayFolderRecord[]> {
	const { data, error } = await supabase
		.from("overlay_folders" as any)
		.select("*")
		.order("is_system", { ascending: false })
		.order("created_at", { ascending: true });

	if (error) throw error;
	return ((data || []) as unknown) as OverlayFolderRecord[];
}

export async function createOverlayFolder(params: {
	name: string;
	ownerId: string;
	workspaceId?: string | null;
	color?: string | null;
	isSystem?: boolean;
}): Promise<OverlayFolderRecord> {
	const name = normalizeOverlayFolderName(params.name);
	if (!name) throw new Error("폴더 이름을 입력하세요.");

	const { data, error } = await supabase
		.from("overlay_folders" as any)
		.insert({
			name,
			owner_id: params.ownerId,
			workspace_id: params.workspaceId ?? null,
			color: params.color ?? null,
			is_system: params.isSystem ?? false,
		})
		.select("*")
		.single();

	if (error) throw error;
	return (data as unknown) as OverlayFolderRecord;
}

export async function ensureOverlayFolder(params: {
	name: string;
	ownerId: string;
	workspaceId?: string | null;
	isSystem?: boolean;
}): Promise<OverlayFolderRecord> {
	const name = normalizeOverlayFolderName(params.name);
	if (!name) throw new Error("폴더 이름을 입력하세요.");

	let query = supabase
		.from("overlay_folders" as any)
		.select("*")
		.eq("owner_id", params.ownerId)
		.ilike("name", name);

	query = params.workspaceId
		? query.eq("workspace_id", params.workspaceId)
		: query.is("workspace_id", null);

	const { data: existing, error: fetchError } = await query.limit(1);
	if (fetchError) throw fetchError;
	if (existing?.[0]) return (existing[0] as unknown) as OverlayFolderRecord;

	return createOverlayFolder({
		name,
		ownerId: params.ownerId,
		workspaceId: params.workspaceId ?? null,
		isSystem: params.isSystem ?? false,
	});
}

export async function renameOverlayFolder(folderId: string, name: string): Promise<void> {
	const normalized = normalizeOverlayFolderName(name);
	if (!normalized) throw new Error("폴더 이름을 입력하세요.");

	const { error } = await supabase
		.from("overlay_folders" as any)
		.update({ name: normalized, updated_at: new Date().toISOString() })
		.eq("id", folderId);

	if (error) throw error;
}

export async function deleteOverlayFolder(folderId: string): Promise<void> {
	const { error } = await supabase
		.from("overlay_folders" as any)
		.delete()
		.eq("id", folderId);

	if (error) throw error;
}

export async function moveOverlayTemplatesToFolder(
	templateIds: string[],
	folderId: string | null,
): Promise<void> {
	if (templateIds.length === 0) return;

	const { error } = await supabase
		.from("overlay_templates")
		.update({
			folder_id: folderId,
			updated_at: new Date().toISOString(),
		} as any)
		.in("id", templateIds);

	if (error) throw error;
}
