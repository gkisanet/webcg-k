/**
 * Font Service — 폰트 에셋 데이터 접근 계층
 * fonts.tsx 페이지에서 사용 (조회, 업로드, Storage URL 생성)
 */

import { supabase } from "../lib/supabase";

// ─── 타입 ────────────────────────────────────────────────────────

/** 폰트 메타데이터 인터페이스 */
export interface FontItem {
	id: string;
	owner_id: string;
	family_name: string;
	display_name: string;
	style: string;
	weight: number;
	storage_path: string;
	file_size: number | null;
	mime_type: string | null;
	category: "system" | "broadcast" | "custom";
	license_type: "OFL" | "Apache" | "Commercial" | "Unknown";
	license_note: string | null;
	is_active: boolean;
	is_public: boolean;
	created_at: string;
	updated_at: string;
	// Storage URL (런타임 생성)
	url: string | null;
}

// ─── 헬퍼 ────────────────────────────────────────────────────────

/** DB 레코드에 Storage public URL을 추가 */
function addStorageUrls(data: any[]): FontItem[] {
	return data.map((font: any) => ({
		...font,
		url: font.storage_path
			? supabase.storage.from("fonts").getPublicUrl(font.storage_path).data
					.publicUrl
			: null,
	}));
}

// ─── 조회 ────────────────────────────────────────────────────────

/** 폰트 목록 조회 (카테고리 필터 옵션) */
export async function fetchFonts(
	category?: string | null
): Promise<FontItem[]> {
	let query = supabase
		.from("fonts")
		.select("*")
		.eq("is_active", true)
		.order("family_name", { ascending: true })
		.order("weight", { ascending: true });

	if (category) {
		query = query.eq("category", category);
	}

	const { data, error } = await query;
	if (error) throw error;
	return addStorageUrls(data || []);
}

/** family_name으로 그룹핑된 폰트 목록 */
export interface FontFamily {
	familyName: string;
	displayName: string;
	category: "system" | "broadcast" | "custom";
	license_type: string;
	variants: FontItem[];
}

/** 폰트를 family_name 기준으로 그룹핑 */
export function groupByFamily(fonts: FontItem[]): FontFamily[] {
	const map = new Map<string, FontFamily>();

	for (const font of fonts) {
		const existing = map.get(font.family_name);
		if (existing) {
			existing.variants.push(font);
		} else {
			map.set(font.family_name, {
				familyName: font.family_name,
				displayName: font.display_name,
				category: font.category,
				license_type: font.license_type,
				variants: [font],
			});
		}
	}

	return Array.from(map.values());
}

// ─── 업로드 ──────────────────────────────────────────────────────

/** 폰트 업로드 매개변수 */
interface UploadFontParams {
	family_name: string;
	display_name: string;
	weight: number;
	style: string;
	category: "system" | "broadcast" | "custom";
	license_type: string;
	license_notes?: string;
}

/** 폰트 파일 업로드 (Storage + DB 레코드) */
export async function uploadFont(
	file: File,
	params: UploadFontParams,
	userId: string,
): Promise<FontItem> {
	// Storage 업로드 경로: {userId}/{timestamp}_{filename}
	const timestamp = Date.now();
	const storagePath = `${userId}/${timestamp}_${file.name}`;

	// 1. Storage에 파일 업로드
	const { error: storageError } = await supabase.storage
		.from("fonts")
		.upload(storagePath, file, {
			contentType: file.type || "application/octet-stream",
			upsert: false,
		});

	if (storageError) throw storageError;

	// 2. DB에 메타데이터 레코드 삽입
	const { data, error: dbError } = await supabase
		.from("fonts")
		.insert({
			owner_id: userId,
			family_name: params.family_name,
			display_name: params.display_name,
			weight: params.weight,
			style: params.style,
			storage_path: storagePath,
			file_size: file.size,
			mime_type: file.type || null,
			category: params.category,
			license_type: params.license_type,
			license_note: params.license_notes || null,
		})
		.select("*")
		.single();

	if (dbError) {
		// DB 삽입 실패 시 Storage 파일도 정리
		await supabase.storage.from("fonts").remove([storagePath]);
		throw dbError;
	}

	return addStorageUrls([data])[0];
}

// ─── 삭제 ────────────────────────────────────────────────────────

/** 폰트 삭제 (Storage + DB 레코드) */
export async function deleteFont(
	fontId: string,
	storagePath: string,
): Promise<void> {
	// 1. DB 레코드 삭제
	const { error: dbError } = await supabase
		.from("fonts")
		.delete()
		.eq("id", fontId);

	if (dbError) throw dbError;

	// 2. Storage 파일 삭제
	if (storagePath) {
		await supabase.storage.from("fonts").remove([storagePath]);
	}
}
