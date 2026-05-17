/**
 * DataSource Service — 커스텀 데이터소스 데이터 접근 계층
 * datasources.tsx 페이지에서 사용
 */

import { supabase } from "../lib/supabase";

// ─── 조회 ────────────────────────────────────────────────────────

/** 커스텀 데이터소스 목록 조회 */
export async function fetchCustomSources<T>(): Promise<T[]> {
	const { data, error } = await supabase
		.from("custom_data_sources")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data || []) as T[];
}

// ─── 생성/수정 ───────────────────────────────────────────────────

/** 커스텀 데이터소스 저장 (생성 또는 수정) */
export async function saveCustomSource(
	record: Record<string, unknown>,
	editId?: string | null,
): Promise<void> {
	if (editId) {
		const { error } = await supabase
			.from("custom_data_sources")
			.update(record)
			.eq("id", editId);
		if (error) throw error;
	} else {
		const { error } = await supabase
			.from("custom_data_sources")
			.insert(record as any);
		if (error) throw error;
	}
}

// ─── 삭제 ────────────────────────────────────────────────────────

/** 커스텀 데이터소스 삭제 */
export async function deleteCustomSource(id: string): Promise<void> {
	const { error } = await supabase
		.from("custom_data_sources")
		.delete()
		.eq("id", id);
	if (error) throw error;
}

// ─── 테스트 결과 갱신 ────────────────────────────────────────────

/** 커스텀 소스 테스트 결과 기록 */
export async function updateSourceTestStatus(
	id: string,
	status: string,
	timestamp: string,
): Promise<void> {
	await supabase
		.from("custom_data_sources")
		.update({ last_test_status: status, last_tested: timestamp })
		.eq("id", id);
}
