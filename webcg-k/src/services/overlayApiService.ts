/**
 * Overlay API Service — 외부 시스템 연동
 * REST export, MCP 인터페이스, 데이터 동기화
 */

import { supabase } from "../lib/supabase";
import type { OverlayTemplateExtended, DataSourceRow } from "../lib/overlayTypes";

// ─── 오버레이 CRUD ───────────────────────────────────────────────

/**
 * 오버레이 템플릿 저장 (신규 생성)
 */
export async function saveOverlayTemplate(
	template: Omit<OverlayTemplateExtended, "id" | "created_at" | "updated_at">,
) {
	const { data, error } = await supabase
		.from("overlay_templates")
		.insert(template as any)
		.select()
		.single();

	if (error) throw new Error(`오버레이 저장 실패: ${error.message}`);
	return data;
}

/**
 * 오버레이 템플릿 업데이트
 */
export async function updateOverlayTemplate(
	id: string,
	updates: Partial<OverlayTemplateExtended>,
) {
	const { data, error } = await supabase
		.from("overlay_templates")
		.update({ ...updates as any, updated_at: new Date().toISOString() })
		.eq("id", id)
		.select()
		.single();

	if (error) throw new Error(`오버레이 업데이트 실패: ${error.message}`);
	return data;
}

export async function updateOverlayTemplateVisibility(
	id: string,
	visibility: "private" | "workspace" | "public",
) {
	const { error } = await supabase
		.from("overlay_templates")
		.update({ visibility, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(`오버레이 권한 변경 실패: ${error.message}`);
}

// ─── 갤러리 CRUD ─────────────────────────────────────────────────

/**
 * 갤러리에 오버레이 추가
 */
export async function addToGallery(
	templateId: string,
	name: string,
	tags: string[] = [],
) {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error("인증 필요");

	const { data, error } = await supabase
		.from("overlay_gallery")
		.insert({
			owner_id: user.id,
			template_id: templateId,
			name,
			tags,
		})
		.select()
		.single();

	if (error) throw new Error(`갤러리 추가 실패: ${error.message}`);
	return data;
}

/**
 * 갤러리 아이템 삭제
 */
export async function removeFromGallery(galleryId: string) {
	const { error } = await supabase
		.from("overlay_gallery")
		.delete()
		.eq("id", galleryId);

	if (error) throw new Error(`갤러리 삭제 실패: ${error.message}`);
}

/**
 * 갤러리 즐겨찾기 토글
 */
export async function toggleGalleryFavorite(galleryId: string, isFavorite: boolean) {
	const { error } = await supabase
		.from("overlay_gallery")
		.update({ is_favorite: isFavorite })
		.eq("id", galleryId);

	if (error) throw new Error(`즐겨찾기 변경 실패: ${error.message}`);
}

/**
 * 내 갤러리 목록 조회 (overlay_templates JOIN)
 */
export async function fetchMyGallery() {
	const { data, error } = await supabase
		.from("overlay_gallery")
		.select(`
			*,
			template:overlay_templates(*)
		`)
		.order("created_at", { ascending: false });

	if (error) throw new Error(`갤러리 조회 실패: ${error.message}`);
	return data;
}

// ─── 데이터 소스 CRUD ────────────────────────────────────────────

/**
 * 데이터 소스 목록 조회
 */
export async function fetchDataSources(): Promise<DataSourceRow[]> {
	const { data, error } = await supabase
		.from("overlay_data_sources")
		.select("*")
		.order("created_at", { ascending: false });

	if (error) throw new Error(`데이터 소스 조회 실패: ${error.message}`);
	return (data ?? []) as unknown as DataSourceRow[];
}

/**
 * 데이터 소스 생성
 */
export async function createDataSource(source: Omit<DataSourceRow, "id" | "owner_id" | "created_at" | "updated_at" | "last_fetched">) {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error("인증 필요");

	const { data, error } = await supabase
		.from("overlay_data_sources")
		.insert({ ...source as any, owner_id: user.id })
		.select()
		.single();

	if (error) throw new Error(`데이터 소스 생성 실패: ${error.message}`);
	return data;
}

// ─── REST Export (Mock) ──────────────────────────────────────────

/**
 * 오버레이 템플릿을 REST API 응답 형태의 JSON으로 변환
 * 외부 시스템(OBS, vMix 등)에서 가져갈 수 있는 포맷
 */
export function exportOverlayAsJson(template: OverlayTemplateExtended) {
	return {
		id: template.id,
		name: template.name,
		version: "1.0",
		canvas: template.zone_bounds ?? { x: 0, y: 0, width: 1920, height: 1080 },
		elements: template.graphic_data,
		dataSource: template.data_source,
		animation: template.animation_config,
		metadata: {
			source: "WebCG-K",
			sourceType: template.source_type,
			createdAt: template.created_at,
		},
	};
}

/**
 * MCP 서버 연동 인터페이스 (스켈레톤)
 * 향후 실제 MCP 프로토콜 구현 시 확장
 */
export async function syncWithMcpServer(
	_mcpUrl: string,
	_templateId: string,
): Promise<{ success: boolean; message: string }> {
	// TODO: 실제 MCP 프로토콜 구현
	console.log("[MCP] 서버 동기화 요청 (Mock)");
	return {
		success: true,
		message: "MCP 서버 연동은 향후 구현 예정입니다.",
	};
}
