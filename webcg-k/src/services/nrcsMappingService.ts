/**
 * NRCS Mapping Service — 자동 매핑 엔진
 * NRCS CgTextItem → 번들 슬롯 기반으로 그래픽 요소에 텍스트 자동 주입
 *
 * 매핑 흐름:
 * 1. NrcsNewsItem.cgTexts[] 순회
 * 2. 각 CgTextItem.type과 번들 슬롯의 cg_type 매칭
 * 3. 매칭된 슬롯의 field_mapping을 사용하여 그래픽 요소에 텍스트 바인딩
 * 4. 결과를 MappedCgResult[]로 반환
 */

import type { CgTextItem, CgTextType, NrcsNewsItem } from "@/lib/nrcsTypes";
import type { BundleSlot, FieldMappingEntry, TemplateBundle } from "./bundleService";
import { fetchBundle } from "./bundleService";

// ─── 결과 타입 정의 ────────────────────────────────────────────

/** 매핑된 필드 하나의 결과 */
export interface MappedField {
	cg_field_key: string;     // NRCS CG 필드 키 (예: "name", "title")
	cg_field_value: string;   // NRCS에서 온 실제 텍스트 값
	target_element_id: string; // 그래픽 요소 ID
	target_property: string;  // "content" | "src" | "style"
	status: "mapped" | "unmapped"; // 매핑 상태
}

/** 하나의 CG 아이템 매핑 결과 */
export interface MappedCgResult {
	cg_item: CgTextItem;         // 원본 NRCS CG 아이템
	slot: BundleSlot | null;     // 매칭된 번들 슬롯 (없으면 null)
	graphic_id: string | null;   // 연결된 그래픽 ID
	graphic_name: string | null; // 그래픽 이름
	mapped_fields: MappedField[]; // 필드별 매핑 결과
	status: "full" | "partial" | "no_slot" | "no_graphic"; // 전체 상태
}

/** 기사 전체 매핑 결과 */
export interface ArticleMappingResult {
	news_item: NrcsNewsItem;
	bundle: TemplateBundle;
	results: MappedCgResult[];
	summary: {
		total: number;
		fully_mapped: number;
		partially_mapped: number;
		no_slot: number;
		no_graphic: number;
	};
}

import { stripHtml, isRichText } from "@/lib/richTextUtils";

// ─── 매핑 엔진 ─────────────────────────────────────────────────

/**
 * 단일 CG 아이템을 번들 슬롯에 매핑
 * @param cgItem - NRCS CG 텍스트 아이템
 * @param slots - 번들의 슬롯 목록
 * @returns 매핑 결과
 */
export function mapSingleCgItem(
	cgItem: CgTextItem,
	slots: BundleSlot[],
): MappedCgResult {
	// 1. CG 타입에 매칭되는 슬롯 찾기 (priority 순)
	const matchingSlots = slots
		.filter((s) => s.cg_type === cgItem.type)
		.sort((a, b) => b.priority - a.priority);

	const slot = matchingSlots[0] || null;

	// 슬롯 없음
	if (!slot) {
		return {
			cg_item: cgItem,
			slot: null,
			graphic_id: null,
			graphic_name: null,
			mapped_fields: Object.entries(cgItem.fields).map(([key, value]) => ({
				cg_field_key: key,
				cg_field_value: value,
				target_element_id: "",
				target_property: "",
				status: "unmapped" as const,
			})),
			status: "no_slot",
		};
	}

	// 그래픽 미연결
	if (!slot.graphic_id) {
		return {
			cg_item: cgItem,
			slot,
			graphic_id: null,
			graphic_name: null,
			mapped_fields: Object.entries(cgItem.fields).map(([key, value]) => ({
				cg_field_key: key,
				cg_field_value: value,
				target_element_id: "",
				target_property: "",
				status: "unmapped" as const,
			})),
			status: "no_graphic",
		};
	}

	// 2. field_mapping 기반으로 필드 바인딩
	const mapping = slot.field_mapping || {};
	const mappedFields: MappedField[] = Object.entries(cgItem.fields).map(
		([key, value]) => {
			const entry: FieldMappingEntry | undefined = mapping[key];
			if (entry) {
				return {
					cg_field_key: key,
					cg_field_value: value,
					target_element_id: entry.target_element_id,
					target_property: entry.target_property,
					status: "mapped" as const,
				};
			}
			return {
				cg_field_key: key,
				cg_field_value: value,
				target_element_id: "",
				target_property: "",
				status: "unmapped" as const,
			};
		},
	);

	// 상태 판단
	const allMapped = mappedFields.every((f) => f.status === "mapped");
	const anyMapped = mappedFields.some((f) => f.status === "mapped");
	const status = allMapped ? "full" : anyMapped ? "partial" : "no_graphic";

	return {
		cg_item: cgItem,
		slot,
		graphic_id: slot.graphic_id,
		graphic_name: slot.graphic_name || null,
		mapped_fields: mappedFields,
		status,
	};
}

/**
 * 뉴스 기사 전체를 번들에 매핑
 * @param newsItem - NRCS 뉴스 아이템
 * @param bundleId - 사용할 번들 ID
 * @returns 매핑 결과 (서버 조회 포함)
 */
export async function mapArticleToCg(
	newsItem: NrcsNewsItem,
	bundleId: string,
): Promise<ArticleMappingResult> {
	// 번들 + 슬롯 조회
	const bundle = await fetchBundle(bundleId);
	const slots = bundle.slots || [];

	// CG 아이템별 매핑 순회
	const results = newsItem.cgTexts.map((cgItem) =>
		mapSingleCgItem(cgItem, slots),
	);

	// 통계 요약
	const summary = {
		total: results.length,
		fully_mapped: results.filter((r) => r.status === "full").length,
		partially_mapped: results.filter((r) => r.status === "partial").length,
		no_slot: results.filter((r) => r.status === "no_slot").length,
		no_graphic: results.filter((r) => r.status === "no_graphic").length,
	};

	return { news_item: newsItem, bundle, results, summary };
}

/**
 * 매핑 결과를 그래픽 template_data에 적용 (프리뷰/송출용)
 * 그래픽의 elements 배열에서 target_element_id를 찾아 content를 덮어씀
 *
 * @param templateData - 그래픽의 template_data (JSON)
 * @param mappedFields - 매핑된 필드 배열
 * @returns 텍스트가 주입된 새 template_data
 */
export function applyMappingToTemplate(
	templateData: any,
	mappedFields: MappedField[],
): any {
	if (!templateData?.elements) return templateData;

	// deep clone으로 원본 보호
	const cloned = JSON.parse(JSON.stringify(templateData));

	for (const field of mappedFields) {
		if (field.status !== "mapped") continue;

		// 1단계: elements 배열에서 target_element_id 찾기 (기존 호환)
		const element = cloned.elements?.find(
			(el: any) => el.id === field.target_element_id,
		);
		if (element) {
			// 속성 값 주입
			if (field.target_property === "content") {
				// 리치 텍스트 분기: HTML이면 plain text + HTML 양쪽 저장
				// SVG 렌더러는 content (plain text) 사용, DOM 렌더러는 content_html 사용
				if (isRichText(field.cg_field_value)) {
					element.content = stripHtml(field.cg_field_value);
					element.content_html = field.cg_field_value;
				} else {
					element.content = field.cg_field_value;
					// 기존 plain text면 content_html은 설정하지 않음 (하위 호환)
				}
			} else if (field.target_property === "src") {
				element.src = field.cg_field_value;
			}
			// style은 향후 확장
			continue;
		}

		// 2단계: Binding Container의 slots에서 검색 (Phase D-1)
		// Shape(rect/ellipse) 내부에 소유된 텍스트 슬롯에 데이터 주입
		for (const el of cloned.elements || []) {
			if (!el.bindingContainer?.enabled || !el.bindingContainer?.slots) continue;
			const slot = el.bindingContainer.slots.find(
				(s: any) => s.id === field.target_element_id,
			);
			if (slot) {
				// 슬롯의 content에 값 주입
				// 슬롯은 plain text만 지원 (SVG textLength auto-fit과 호환)
				slot.content = isRichText(field.cg_field_value)
					? stripHtml(field.cg_field_value)
					: field.cg_field_value;
				break;
			}
		}
	}

	return cloned;
}

/**
 * 프로그램명으로 번들 자동 매칭 (NRCS 프로그램 → 번들)
 * @param programName - NRCS 프로그램명
 * @param bundles - 번들 목록
 * @returns 매칭된 번들 또는 기본 번들
 */
export function findBundleForProgram(
	programName: string,
	bundles: TemplateBundle[],
): TemplateBundle | null {
	// 1. program_name 정확 매치
	const exact = bundles.find(
		(b) => b.program_name?.toLowerCase() === programName.toLowerCase(),
	);
	if (exact) return exact;

	// 2. 부분 매치 (포함 검색)
	const partial = bundles.find(
		(b) => b.program_name && programName.toLowerCase().includes(b.program_name.toLowerCase()),
	);
	if (partial) return partial;

	// 3. 기본 번들
	const defaultBundle = bundles.find((b) => b.is_default);
	return defaultBundle || null;
}

// ─── CG 타입별 기본 필드 키 추론 (자동 매핑 제안용) ──────────────

/** CG 타입에서 흔히 쓰이는 필드 키 */
export const CG_TYPE_DEFAULT_FIELDS: Record<CgTextType, string[]> = {
	super: ["name", "title"],
	source: ["source"],
	band: ["text"],
	headline: ["title", "subtitle"],
	subheadline: ["title"],
	crawl: ["text"],
	locator: ["location", "reporter"],
	lowthird: ["name", "title"],
	fullcg: ["title", "body"],
	credit: ["role", "name"],
	soundbite: ["name", "text"],
	reporter: ["name", "location"],
	flash: ["title"],
};
