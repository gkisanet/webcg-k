/**
 * Character Service — AI 캐릭터 프리셋 데이터 접근 계층
 * characters.tsx 페이지에서 사용
 */

import { supabase } from "../lib/supabase";

// ─── 타입 재export ───────────────────────────────────────────────

// characters.tsx에서 사용하는 AiCharacterPreset 타입은 해당 파일에서 로컬 정의
// 서비스 계층은 타입-제네릭으로 반환하여 의존성 최소화

// ─── 조회 ────────────────────────────────────────────────────────

/** AI 캐릭터 프리셋 목록 조회 */
export async function fetchPresets<T>(): Promise<T[]> {
	const { data, error } = await supabase
		.from("ai_character_presets")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data || []) as T[];
}

// ─── 삭제 ────────────────────────────────────────────────────────

/** 프리셋 삭제 (FK 참조 해제 → 스토리지 → DB 순서) */
export async function deletePreset(presetId: string, rivFilePath?: string | null): Promise<void> {
	// 1) ai_character_state에서 참조 해제
	await supabase
		.from("ai_character_state")
		.update({ preset_id: null, visible: false, vm_values: {} })
		.eq("preset_id", presetId);

	// 2) 스토리지 파일 삭제
	if (rivFilePath) {
		await supabase.storage.from("characters").remove([rivFilePath]);
	}

	// 3) 프리셋 레코드 삭제
	await supabase
		.from("ai_character_presets")
		.delete()
		.eq("id", presetId);
}
