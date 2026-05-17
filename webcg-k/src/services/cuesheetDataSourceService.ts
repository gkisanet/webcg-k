/**
 * Cuesheet Data Source Service — 큐시트 데이터 소스 관리
 *
 * ■ Why 별도 서비스?
 *   기존 cuesheetService.ts는 큐시트 CRUD에 집중.
 *   데이터 소스(NRCS/CSV)의 저장/동기화/테이블 뷰는
 *   관심사가 다르므로 분리하여 유지보수성 확보.
 *
 * ■ 핵심 플로우:
 *   1. 외부 데이터(NRCS fetch 결과 or CSV parse 결과) → data_sources에 저장
 *   2. 큐시트 생성 시 source_id FK로 연결
 *   3. 데이터 변경 시 syncToCuesheet()로 큐시트 아이템 동기화
 *   4. onair 상태면 동기화 차단 (방송 사고 방지)
 */

import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";

// ─── 타입 정의 ────────────────────────────────────────────────────

/** 데이터 소스 타입 */
export type DataSourceType = "nrcs" | "csv";

/** 컬럼 스키마 정의 — 엑셀 테이블의 헤더 */
export interface ColumnSchema {
	key: string;          // 필드 키 (예: "slug", "title")
	label: string;        // 표시 라벨 (예: "슬러그", "제목")
	type: "text" | "number" | "date" | "boolean";
}

/** 데이터 소스 행 (raw_data의 각 요소) */
export interface DataSourceRow {
	_row_id: string;      // 행 고유 식별자 (diff 매칭용)
	[key: string]: unknown;
}

/** 큐시트 데이터 소스 */
export interface CuesheetDataSource {
	id: string;
	owner_id: string;
	name: string;
	source_type: DataSourceType;
	config: Record<string, unknown>;
	raw_data: DataSourceRow[];
	column_schema: ColumnSchema[];
	row_count: number;
	last_synced_at: string | null;
	created_at: string;
	updated_at: string;
}

// ─── CRUD ─────────────────────────────────────────────────────────

/** 데이터 소스 목록 조회 */
export async function fetchDataSources(): Promise<CuesheetDataSource[]> {
	const { data, error } = await supabase
		.from("cuesheet_data_sources")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data || []) as unknown as CuesheetDataSource[];
}

/** 데이터 소스 상세 조회 (raw_data 포함) */
export async function fetchDataSource(id: string): Promise<CuesheetDataSource> {
	const { data, error } = await supabase
		.from("cuesheet_data_sources")
		.select("*")
		.eq("id", id)
		.single();
	if (error) throw error;
	return data as unknown as CuesheetDataSource;
}

/**
 * 데이터 소스 생성
 *
 * @param params.name - 소스 이름 (예: "KBS 뉴스9 2026-04-07")
 * @param params.source_type - "nrcs" | "csv"
 * @param params.config - 소스별 설정 JSON
 * @param params.raw_data - 원본 데이터 행 배열
 * @param params.column_schema - 컬럼 정의 배열
 */
export async function createDataSource(params: {
	name: string;
	source_type: DataSourceType;
	config: Record<string, unknown>;
	raw_data: DataSourceRow[];
	column_schema: ColumnSchema[];
}): Promise<CuesheetDataSource> {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error("인증 필요");

	const { data, error } = await supabase
		.from("cuesheet_data_sources")
		.insert({
			owner_id: user.id,
			name: params.name,
			source_type: params.source_type,
			config: params.config as unknown as Json,
			raw_data: params.raw_data as unknown as Json,
			column_schema: params.column_schema as unknown as Json,
			row_count: params.raw_data.length,
			last_synced_at: new Date().toISOString(),
		})
		.select()
		.single();
	if (error) throw error;
	return data as unknown as CuesheetDataSource;
}

/**
 * 데이터 소스 raw_data 업데이트 (재동기화)
 *
 * ■ Why 별도 함수?
 *   NRCS/CSV 데이터가 변경되었을 때 raw_data만 갱신.
 *   config나 column_schema는 변경하지 않음.
 */
export async function updateDataSourceData(
	id: string,
	rawData: DataSourceRow[],
): Promise<void> {
	const { error } = await supabase
		.from("cuesheet_data_sources")
		.update({
			raw_data: rawData as unknown as Json,
			row_count: rawData.length,
			last_synced_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (error) throw error;
}

/** 데이터 소스 삭제 */
export async function deleteDataSource(id: string): Promise<void> {
	const { error } = await supabase
		.from("cuesheet_data_sources")
		.delete()
		.eq("id", id);
	if (error) throw error;
}

// ─── 동기화 ───────────────────────────────────────────────────────

/**
 * 데이터 소스 → 큐시트 아이템 동기화
 *
 * ■ 동기화 전략 (3-way diff):
 *   1. raw_data의 _row_id와 cuesheet_items의 source_row_id를 매칭
 *   2. 새 행 → INSERT
 *   3. 변경된 행 → UPDATE (slug, title, reporter 등)
 *   4. 삭제된 행 → DELETE
 *
 * ■ 안전 게이트:
 *   큐시트 status가 "onair"이면 동기화 건너뛰고 경고 반환
 *
 * @returns 동기화 결과 요약
 */
export interface SyncResult {
	inserted: number;
	updated: number;
	deleted: number;
	skipped: boolean;        // onair 상태로 건너뛴 경우
	skipReason?: string;
}

export async function syncDataSourceToCuesheet(
	sourceId: string,
	cuesheetId: string,
): Promise<SyncResult> {
	// 1. 큐시트 상태 확인 — 방송 중이면 변경 전파 차단
	const { data: cuesheet } = await supabase
		.from("nrcs_cuesheets")
		.select("status")
		.eq("id", cuesheetId)
		.single();

	if (cuesheet?.status === "onair") {
		return {
			inserted: 0, updated: 0, deleted: 0,
			skipped: true,
			skipReason: "송출 중(onair) — 방송 안전을 위해 동기화가 차단되었습니다",
		};
	}

	// 2. 데이터 소스 raw_data 조회
	const source = await fetchDataSource(sourceId);
	const rows = source.raw_data || [];

	// 3. 기존 큐시트 아이템 조회
	const { data: existingItems } = await supabase
		.from("nrcs_cuesheet_items")
		.select("id, source_row_id, slug, title, reporter")
		.eq("cuesheet_id", cuesheetId);

	const existing = existingItems || [];
	const existingMap = new Map(existing.map(i => [i.source_row_id, i]));
	const newRowIds = new Set(rows.map(r => r._row_id));

	let inserted = 0;
	let updated = 0;
	let deleted = 0;

	// 4. 새 행 → INSERT, 변경된 행 → UPDATE
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const existingItem = existingMap.get(row._row_id);

		if (!existingItem) {
			// 새 행 삽입
			await supabase.from("nrcs_cuesheet_items").insert({
				cuesheet_id: cuesheetId,
				nrcs_item_id: row._row_id,
				slug: String(row.slug || ""),
				title: String(row.title || ""),
				reporter: row.reporter ? String(row.reporter) : null,
				article_type: row.article_type ? String(row.article_type) : null,
				item_order: i,
				source_row_id: row._row_id,
				cg_data: (row.cg_data || []) as unknown as Json,
			});
			inserted++;
		} else {
			// 변경 감지 (slug, title, reporter 비교)
			const changed =
				existingItem.slug !== String(row.slug || "") ||
				existingItem.title !== String(row.title || "") ||
				existingItem.reporter !== (row.reporter ? String(row.reporter) : null);

			if (changed) {
				await supabase
					.from("nrcs_cuesheet_items")
					.update({
						slug: String(row.slug || ""),
						title: String(row.title || ""),
						reporter: row.reporter ? String(row.reporter) : null,
						item_order: i,
						updated_at: new Date().toISOString(),
					})
					.eq("id", existingItem.id);
				updated++;
			}
		}
	}

	// 5. 삭제된 행 → DELETE
	for (const item of existing) {
		if (item.source_row_id && !newRowIds.has(item.source_row_id)) {
			await supabase
				.from("nrcs_cuesheet_items")
				.delete()
				.eq("id", item.id);
			deleted++;
		}
	}

	// 6. total_items 갱신
	await supabase
		.from("nrcs_cuesheets")
		.update({
			total_items: rows.length,
			updated_at: new Date().toISOString(),
		})
		.eq("id", cuesheetId);

	return { inserted, updated, deleted, skipped: false };
}
