/**
 * Bundle Service — 템플릿 번들 CRUD
 * 여러 그래픽을 CG 타입별 슬롯으로 묶는 "뉴스 CG 세트" 관리
 *
 * ■ Why `as any` 제거:
 *   Supabase 자동 생성 타입(database.types.ts)이 존재하므로,
 *   `as any`를 쓰면 존재하지 않는 컬럼 참조 같은 런타임 에러를
 *   TypeScript가 잡아주지 못한다. (Phase D-2 grid_template_id 사고 교훈)
 */

import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import type { CgTextType } from "@/lib/nrcsTypes";
import type { ThemeTokens } from "@/lib/types/semanticTypes";

// ─── 타입 정의 ────────────────────────────────────────────────────

/** 필드 매핑 항목: CG 필드 → 그래픽 요소 바인딩 */
export interface FieldMappingEntry {
	target_element_id: string;
	target_property: "content" | "src" | "style";
}

/** 번들 슬롯 */
export interface BundleSlot {
	id: string;
	bundle_id: string;
	cg_type: CgTextType;
	graphic_id: string | null;
	graphic_name?: string; // JOIN으로 가져옴
	field_mapping: Record<string, FieldMappingEntry>;
	sort_order: number;
	priority: number;
}

/** 템플릿 번들 */
export interface TemplateBundle {
	id: string;
	owner_id: string;
	name: string;
	description: string | null;
	program_name: string | null;
	is_default: boolean;
	created_at: string;
	updated_at: string;
	slots?: BundleSlot[];
	slot_count?: number; // 목록 조회 시
}

// ─── 번들 CRUD ────────────────────────────────────────────────────

/** 번들 목록 조회 */
export async function fetchBundles(): Promise<TemplateBundle[]> {
	const { data, error } = await supabase
		.from("template_bundles")
		.select("*, bundle_slots(count)")
		.order("updated_at", { ascending: false });
	if (error) throw error;
	// slot_count 파생 — bundle_slots 집계는 Supabase 타입에 포함되지 않으므로 타입 단언 필요
	return (data || []).map((b) => ({
		...(b as unknown as TemplateBundle),
		slot_count: (b as Record<string, unknown> & { bundle_slots?: { count: number }[] }).bundle_slots?.[0]?.count ?? 0,
	}));
}

/** 번들 상세 조회 (슬롯 포함) */
export async function fetchBundle(bundleId: string): Promise<TemplateBundle> {
	const { data, error } = await supabase
		.from("template_bundles")
		.select("*")
		.eq("id", bundleId)
		.single();
	if (error) throw error;

	// 슬롯 조회 (그래픽 이름 JOIN)
	const { data: slots, error: slotsError } = await supabase
		.from("bundle_slots")
		.select("*, graphics(name)")
		.eq("bundle_id", bundleId)
		.order("sort_order", { ascending: true });
	if (slotsError) throw slotsError;

	return {
		...(data as unknown as TemplateBundle),
		slots: (slots || []).map((s) => ({
			...(s as unknown as BundleSlot),
			graphic_name: (s as unknown as Record<string, { name?: string }>).graphics?.name ?? undefined,
		})),
	};
}

/** 번들 생성 */
export async function createBundle(bundle: {
	name: string;
	description?: string;
	program_name?: string;
}): Promise<TemplateBundle> {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error("인증 필요");

	const { data, error } = await supabase
		.from("template_bundles")
		.insert({
			owner_id: user.id,
			name: bundle.name,
			description: bundle.description || null,
			program_name: bundle.program_name || null,
		})
		.select()
		.single();
	if (error) throw error;
	return data as unknown as TemplateBundle;
}

/** 번들 수정 */
export async function updateBundle(
	bundleId: string,
	updates: Partial<Pick<TemplateBundle, "name" | "description" | "program_name" | "is_default">>
): Promise<void> {
	const { error } = await supabase
		.from("template_bundles")
		.update({
			...updates,
			updated_at: new Date().toISOString(),
		})
		.eq("id", bundleId);
	if (error) throw error;
}

/** 번들 삭제 */
export async function deleteBundle(bundleId: string): Promise<void> {
	const { error } = await supabase
		.from("template_bundles")
		.delete()
		.eq("id", bundleId);
	if (error) throw error;
}

// ─── Theme Config (v3) ────────────────────────────────────────────
// DB theme_config 컬럼을 실제로 사용.
// ThemeTokens JSONB를 읽고 쓰는 helper.

/** 번들의 theme_config 조회 */
export async function getBundleTheme(bundleId: string): Promise<ThemeTokens | null> {
  const { data, error } = await supabase
    .from("template_bundles")
    .select("theme_config")
    .eq("id", bundleId)
    .single();

  if (error || !data?.theme_config) return null;

  const cfg = data.theme_config as Record<string, unknown>;
  // 구조 검증: ThemeTokens 필수 필드 존재 확인
  if (!cfg.themeId || !cfg.colors || !cfg.typography || !cfg.layout) {
    console.warn("[bundleService] theme_config가 ThemeTokens 형식이 아닙니다:", cfg);
    return null;
  }

  return cfg as unknown as ThemeTokens;
}

/** 번들의 theme_config 저장 */
export async function saveBundleTheme(
  bundleId: string,
  themeTokens: ThemeTokens,
): Promise<void> {
  const { error } = await supabase
    .from("template_bundles")
    .update({
      theme_config: themeTokens as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bundleId);

  if (error) throw new Error(`theme_config 저장 실패: ${error.message}`);
}

// ─── 슬롯 CRUD ────────────────────────────────────────────────────

/** 슬롯 추가 */
export async function addSlot(slot: {
	bundle_id: string;
	cg_type: CgTextType;
	graphic_id?: string;
	field_mapping?: Record<string, FieldMappingEntry>;
	sort_order?: number;
}): Promise<BundleSlot> {
	const { data, error } = await supabase
		.from("bundle_slots")
		.insert({
			bundle_id: slot.bundle_id,
			cg_type: slot.cg_type,
			graphic_id: slot.graphic_id || null,
			field_mapping: (slot.field_mapping || {}) as unknown as Json,
			sort_order: slot.sort_order ?? 0,
		})
		.select()
		.single();
	if (error) throw error;
	return data as unknown as BundleSlot;
}

/** 슬롯 수정 (그래픽 연결, 필드 매핑 등) */
export async function updateSlot(
	slotId: string,
	updates: Partial<Pick<BundleSlot, "graphic_id" | "field_mapping" | "sort_order" | "priority">>
): Promise<void> {
	// field_mapping은 Json 타입으로 변환 필요
	const payload: Record<string, unknown> = {};
	if (updates.graphic_id !== undefined) payload.graphic_id = updates.graphic_id;
	if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;
	if (updates.priority !== undefined) payload.priority = updates.priority;
	if (updates.field_mapping !== undefined) payload.field_mapping = updates.field_mapping as unknown as Json;

	const { error } = await supabase
		.from("bundle_slots")
		.update(payload)
		.eq("id", slotId);
	if (error) throw error;
}

/** 슬롯 삭제 */
export async function deleteSlot(slotId: string): Promise<void> {
	const { error } = await supabase
		.from("bundle_slots")
		.delete()
		.eq("id", slotId);
	if (error) throw error;
}

// ─── 그래픽 목록 (슬롯에 연결할 후보) ─────────────────────────────

/** 현재 사용자의 그래픽 목록 (이름/ID만) */
export async function fetchGraphicsForSlot(): Promise<{ id: string; name: string }[]> {
	const { data, error } = await supabase
		.from("graphics")
		.select("id, name")
		.order("name", { ascending: true });
	if (error) throw error;
	return data || [];
}

/** 그래픽 목록 (미리보기 포함 — 번들 편집기용) */
export async function fetchGraphicsWithPreview(): Promise<{
	id: string;
	name: string;
	template_data: Record<string, unknown>;
	updated_at: string;
}[]> {
	const { data, error } = await supabase
		.from("graphics")
		.select("id, name, template_data, updated_at")
		.order("updated_at", { ascending: false });
	if (error) throw error;
	// template_data는 Json → Record<string, unknown> 변환
	return (data || []).map((g) => ({
		...g,
		template_data: g.template_data as unknown as Record<string, unknown>,
		updated_at: g.updated_at ?? new Date().toISOString(),
	}));
}

/** 그래픽의 template_data에서 텍스트 요소 목록 추출 (+ Binding Container 슬롯 포함) */
export async function fetchGraphicElements(
	graphicId: string,
): Promise<{ id: string; type: string; content: string; parentShapeName?: string }[]> {
	const { data, error } = await supabase
		.from("graphics")
		.select("template_data")
		.eq("id", graphicId)
		.single();
	if (error) throw error;

	const templateData = data?.template_data as Record<string, unknown> | null;
	if (!templateData?.elements) return [];

	const elements = templateData.elements as Array<Record<string, unknown>>;
	const results: { id: string; type: string; content: string; parentShapeName?: string }[] = [];

	for (const el of elements) {
		// 1. 독립 텍스트 요소 (기존 호환)
		if (el.type === "text" || el.content !== undefined) {
			results.push({
				id: el.id as string,
				type: (el.type as string) || "unknown",
				content: (el.content as string) || "",
			});
		}

		// 2. Binding Container 슬롯 (Phase D-1)
		// Shape 내부에 소유된 텍스트 슬롯도 매핑 대상으로 노출
		const bc = el.bindingContainer as { enabled?: boolean; slots?: Array<{ id: string; content?: string }> } | undefined;
		if (bc?.enabled && bc?.slots) {
			for (const slot of bc.slots) {
				results.push({
					id: slot.id,
					type: "binding-slot",
					content: slot.content || "",
					parentShapeName: (el.name as string) || "Shape",
				});
			}
		}
	}

	return results;
}
