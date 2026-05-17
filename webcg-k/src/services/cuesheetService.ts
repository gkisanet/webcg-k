/**
 * Cuesheet Service — NRCS 큐시트 자동 생성/관리
 * NRCS 뉴스 프로그램 → 큐시트 자동 생성 → 기존 rundowns 연결
 *
 * ■ Why `as any` 제거:
 *   nrcs_cuesheets, nrcs_cuesheet_items 테이블 모두 database.types.ts에
 *   정의되어 있으므로 Supabase 타입 추론이 가능. `as any` 없이도
 *   insert/update 시 컬럼 존재 여부를 컴파일 타임에 검증.
 */

import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import type { NrcsNewsItem, NewsProgram } from "@/lib/nrcsTypes";
import { mapArticleToCg } from "./nrcsMappingService";
import type { ArticleMappingResult } from "./nrcsMappingService";

// ─── 타입 정의 ────────────────────────────────────────────────────

export type CuesheetStatus = "draft" | "ready" | "onair" | "done";
export type CuesheetItemStatus = "pending" | "mapped" | "approved" | "aired";

/** NRCS 큐시트 */
export interface NrcsCuesheet {
	id: string;
	owner_id: string;
	program_name: string;
	program_date: string;
	bundle_id: string | null;
	linked_rundown_id: string | null;
	status: CuesheetStatus;
	total_items: number;
	/** 소스 유형: 수동 입력 / NRCS 연동 / CSV 임포트 */
	source_type: "manual" | "nrcs" | "csv";
	/** 연결된 데이터 소스 ID (manual이면 null) */
	source_id: string | null;
	created_at: string;
	updated_at: string;
	items?: NrcsCuesheetItem[];
}

/** NRCS 큐시트 아이템 */
export interface NrcsCuesheetItem {
	id: string;
	cuesheet_id: string;
	nrcs_item_id: string;
	slug: string;
	title: string;
	reporter: string | null;
	article_type: string | null;
	item_order: number;
	cg_data: unknown[];
	mapping_result: Record<string, unknown>;
	status: CuesheetItemStatus;
	linked_rundown_item_id: string | null;
	/** 데이터 소스 행 ID (동기화 diff 매칭용) */
	source_row_id: string | null;
	created_at: string;
	updated_at: string;
}

// ─── 큐시트 CRUD ──────────────────────────────────────────────────

/** 큐시트 목록 조회 */
export async function fetchCuesheets(): Promise<NrcsCuesheet[]> {
	const { data, error } = await supabase
		.from("nrcs_cuesheets")
		.select("*")
		.order("program_date", { ascending: false });
	if (error) throw error;
	return (data || []) as unknown as NrcsCuesheet[];
}

/** 큐시트 상세 (아이템 포함) */
export async function fetchCuesheet(cuesheetId: string): Promise<NrcsCuesheet> {
	const { data, error } = await supabase
		.from("nrcs_cuesheets")
		.select("*")
		.eq("id", cuesheetId)
		.single();
	if (error) throw error;

	const { data: items, error: itemsError } = await supabase
		.from("nrcs_cuesheet_items")
		.select("*")
		.eq("cuesheet_id", cuesheetId)
		.order("item_order", { ascending: true });
	if (itemsError) throw itemsError;

	return {
		...(data as unknown as NrcsCuesheet),
		items: (items || []) as unknown as NrcsCuesheetItem[],
	};
}

/** 큐시트 생성 */
export async function createCuesheet(params: {
	program_name: string;
	program_date: string;
	bundle_id?: string;
	source_type?: "manual" | "nrcs" | "csv";
	source_id?: string;
	workspace_id?: string | null;
}): Promise<NrcsCuesheet> {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error("인증 필요");

	const { data, error } = await supabase
		.from("nrcs_cuesheets")
		.insert({
			owner_id: user.id,
			program_name: params.program_name,
			program_date: params.program_date,
			bundle_id: params.bundle_id || null,
			source_type: params.source_type || "manual",
			source_id: params.source_id || null,
			workspace_id: params.workspace_id || null,
		})
		.select()
		.single();
	if (error) throw error;
	return data as unknown as NrcsCuesheet;
}

/** 큐시트 상태 변경 */
export async function updateCuesheetStatus(
	cuesheetId: string,
	status: CuesheetStatus,
): Promise<void> {
	const { error } = await supabase
		.from("nrcs_cuesheets")
		.update({ status, updated_at: new Date().toISOString() })
		.eq("id", cuesheetId);
	if (error) throw error;
}

/** 큐시트 아이템 업데이트 (CG 데이터 리치 텍스트 편집 등) */
export async function updateCuesheetItem(
	itemId: string,
	updates: { cg_data?: unknown[]; status?: CuesheetItemStatus },
): Promise<void> {
	const payload: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};
	if (updates.cg_data !== undefined) payload.cg_data = updates.cg_data;
	if (updates.status !== undefined) payload.status = updates.status;

	const { error } = await supabase
		.from("nrcs_cuesheet_items")
		.update(payload)
		.eq("id", itemId);
	if (error) throw error;
}

/** 큐시트 삭제 */
export async function deleteCuesheet(cuesheetId: string): Promise<void> {
	const { error } = await supabase
		.from("nrcs_cuesheets")
		.delete()
		.eq("id", cuesheetId);
	if (error) throw error;
}

// ─── NRCS → 큐시트 자동 생성 ──────────────────────────────────────

/**
 * NRCS 뉴스 프로그램에서 큐시트 자동 생성
 * 프로그램의 모든 기사를 순회하여 큐시트 아이템으로 변환 + 매핑
 */
export async function generateCuesheetFromNrcs(
	program: NewsProgram,
	newsItems: NrcsNewsItem[],
	bundleId: string,
): Promise<NrcsCuesheet> {
	// 1. 큐시트 생성
	const cuesheet = await createCuesheet({
		program_name: program.name,
		program_date: program.date,
		bundle_id: bundleId,
	});

	// 2. 각 기사를 큐시트 아이템으로 변환
	const itemInserts = await Promise.all(
		newsItems.map(async (item, index) => {
			// 매핑 실행
			let mappingResult: ArticleMappingResult | null = null;
			try {
				mappingResult = await mapArticleToCg(item, bundleId);
			} catch (err) {
				console.warn(`[CuesheetGen] 매핑 실패 (${item.slug}):`, err);
			}

			return {
				cuesheet_id: cuesheet.id,
				nrcs_item_id: item.id,
				slug: item.slug,
				title: item.title,
				reporter: item.reporter || null,
				article_type: item.articleType || null,
				item_order: index,
				cg_data: (item.cgTexts || []) as unknown as Json,
				mapping_result: (mappingResult?.results || {}) as unknown as Json,
				status: mappingResult ? "mapped" : "pending",
			};
		}),
	);

	// 3. 아이템 일괄 삽입
	const { error: insertError } = await supabase
		.from("nrcs_cuesheet_items")
		.insert(itemInserts);
	if (insertError) throw insertError;

	// 4. 큐시트 total_items 업데이트
	const { error: updateError } = await supabase
		.from("nrcs_cuesheets")
		.update({
			total_items: itemInserts.length,
			updated_at: new Date().toISOString(),
		})
		.eq("id", cuesheet.id);
	if (updateError) throw updateError;

	return { ...cuesheet, total_items: itemInserts.length };
}

// ─── 기존 Rundown 연결 ──────────────────────────────────────────

/**
 * 큐시트를 기존 rundown에 연결 (통합 모드)
 * 큐시트 아이템을 rundown_items로 동기화
 */
export async function linkCuesheetToRundown(
	cuesheetId: string,
	rundownId: string,
): Promise<void> {
	// 1. 큐시트 연결 정보 업데이트
	const { error: linkError } = await supabase
		.from("nrcs_cuesheets")
		.update({
			linked_rundown_id: rundownId,
			updated_at: new Date().toISOString(),
		})
		.eq("id", cuesheetId);
	if (linkError) throw linkError;

	// 2. 큐시트 아이템 조회
	const { data: csItems, error: itemsError } = await supabase
		.from("nrcs_cuesheet_items")
		.select("*")
		.eq("cuesheet_id", cuesheetId)
		.order("item_order", { ascending: true });
	if (itemsError) throw itemsError;

	// 3. 기존 런다운 아이템의 최대 order 조회
	const { data: existingItems } = await supabase
		.from("rundown_items")
		.select("item_order")
		.eq("rundown_id", rundownId)
		.order("item_order", { ascending: false })
		.limit(1);
	const maxOrder = existingItems?.[0]?.item_order ?? -1;

	// 4. 큐시트 아이템 → rundown_items 변환 + 삽입
	const rundownInserts = (csItems || []).map((ci, i) => ({
		rundown_id: rundownId,
		data: {
			source: "nrcs",
			nrcs_cuesheet_item_id: ci.id,
			slug: ci.slug,
			title: ci.title,
			reporter: ci.reporter,
			article_type: ci.article_type,
			cg_data: ci.cg_data,
			mapping_result: ci.mapping_result,
		} as unknown as Json,
		item_order: maxOrder + 1 + i,
		duration: 10, // 기본 10초
	}));

	if (rundownInserts.length > 0) {
		const { data: insertedItems, error: insertErr } = await supabase
			.from("rundown_items")
			.insert(rundownInserts)
			.select("id");
		if (insertErr) throw insertErr;

		// 5. 큐시트 아이템에 linked_rundown_item_id 역참조 저장
		if (insertedItems && csItems) {
			await Promise.all(
				insertedItems.map((ri, i) =>
					supabase
						.from("nrcs_cuesheet_items")
						.update({ linked_rundown_item_id: ri.id })
						.eq("id", csItems[i]?.id ?? ""),
				),
			);
		}
	}
}

/**
 * 큐시트 아이템 순서 동기화 (NRCS 순서 변경 반영)
 * NRCS에서 기사 순서가 바뀌면 큐시트 + 연결된 런다운 아이템 순서도 갱신
 */
export async function syncItemOrder(
	cuesheetId: string,
	orderedItemIds: string[],
): Promise<void> {
	// 큐시트 아이템 순서 갱신
	await Promise.all(
		orderedItemIds.map((id, index) =>
			supabase
				.from("nrcs_cuesheet_items")
				.update({ item_order: index, updated_at: new Date().toISOString() })
				.eq("id", id),
		),
	);

	// 연결된 런다운 아이템이 있으면 순서도 동기화
	const { data: items } = await supabase
		.from("nrcs_cuesheet_items")
		.select("id, item_order, linked_rundown_item_id")
		.eq("cuesheet_id", cuesheetId)
		.order("item_order", { ascending: true });

	if (items) {
		await Promise.all(
			items
				.filter((i) => i.linked_rundown_item_id)
				.map((i) =>
					supabase
						.from("rundown_items")
						.update({ item_order: i.item_order ?? 0 })
						.eq("id", i.linked_rundown_item_id!),
				),
		);
	}
}

// ─── 런다운 변경 전파 (Smart Lock) ──────────────────────────────

/**
 * 큐시트 아이템 변경사항을 연결된 런다운에 전파
 *
 * ■ Smart Lock 전략:
 *   - 큐시트 편집은 항상 가능 (방송 중에도 다음 방송분 준비 필요)
 *   - 연결된 런다운으로의 **자동 전파만** 차단 (onair 상태일 때)
 *   - 방송 종료 후 사용자가 수동으로 "동기화" 클릭하면 전파
 *
 * @returns 전파 결과: 성공 건수 또는 차단 사유
 */
export interface PropagateResult {
	propagated: number;
	blocked: boolean;
	blockReason?: string;
}

export async function propagateToRundown(
	cuesheetId: string,
): Promise<PropagateResult> {
	// 1. 큐시트 상태 확인
	const { data: cuesheet } = await supabase
		.from("nrcs_cuesheets")
		.select("status, linked_rundown_id")
		.eq("id", cuesheetId)
		.single();

	if (!cuesheet?.linked_rundown_id) {
		return { propagated: 0, blocked: false };
	}

	// 2. 안전 게이트 — 송출 중이면 전파 차단
	if (cuesheet.status === "onair") {
		return {
			propagated: 0,
			blocked: true,
			blockReason: "🔒 송출 중(ONAIR) — 변경사항은 방송 종료 후 수동 동기화해 주세요",
		};
	}

	// 3. 큐시트 아이템 중 linked_rundown_item_id가 있는 것만 조회
	const { data: items } = await supabase
		.from("nrcs_cuesheet_items")
		.select("id, linked_rundown_item_id, cg_data, slug, title, reporter, article_type")
		.eq("cuesheet_id", cuesheetId);

	if (!items) return { propagated: 0, blocked: false };

	let propagated = 0;
	for (const item of items) {
		if (!item.linked_rundown_item_id) continue;

		// 런다운 아이템의 data 블록을 큐시트 아이템 최신 상태로 갱신
		const { error } = await supabase
			.from("rundown_items")
			.update({
				data: {
					source: "nrcs",
					nrcs_cuesheet_item_id: item.id,
					slug: item.slug,
					title: item.title,
					reporter: item.reporter,
					article_type: item.article_type,
					cg_data: item.cg_data,
				} as unknown as Json,
			})
			.eq("id", item.linked_rundown_item_id);

		if (!error) propagated++;
	}

	return { propagated, blocked: false };
}
