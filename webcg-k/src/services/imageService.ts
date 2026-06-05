/**
 * Image Service — 이미지 에셋 데이터 접근 계층
 * images.tsx 페이지에서 사용 (조회, Storage URL 생성)
 */

import { supabase } from "../lib/supabase";

// ─── 타입 ────────────────────────────────────────────────────────

export interface ImageItem {
	id: string;
	owner_id: string;
	name: string;
	description: string | null;
	category: string | null;
	is_public: boolean;
	storage_path: string;
	storage_path_2k: string | null;
	storage_path_4k: string | null;
	file_size: number | null;
	mime_type: string | null;
	keywords: string[] | null;
	created_at: string;
	url_2k: string | null;
	url_4k: string | null;
}

// ─── 헬퍼 ────────────────────────────────────────────────────────

/** DB 레코드에 Storage public URL을 추가 */
function addStorageUrls(data: any[]): ImageItem[] {
	return data.map((img: any) => ({
		...img,
		url_2k: img.storage_path_2k
			? supabase.storage.from("images").getPublicUrl(img.storage_path_2k).data.publicUrl
			: img.storage_path
				? supabase.storage.from("images").getPublicUrl(img.storage_path).data.publicUrl
				: null,
		url_4k: img.storage_path_4k
			? supabase.storage.from("images").getPublicUrl(img.storage_path_4k).data.publicUrl
			: null,
	}));
}

// ─── 조회 ────────────────────────────────────────────────────────

/** 이미지 목록 조회 (카테고리 필터 옵션) */
export async function fetchImages(category?: string | null): Promise<ImageItem[]> {
	let query = supabase
		.from("images")
		.select("*")
		.order("created_at", { ascending: false });
	if (category) {
		query = query.eq("category", category);
	}
	const { data, error } = await query;
	if (error) throw error;
	return addStorageUrls(data || []);
}
