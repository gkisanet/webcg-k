/**
 * Preflight Service — 큐시트 프리플라이트 검증
 *
 * ■ 비유: 비행기 이륙 전 파일럿이 체크리스트를 확인하는 것처럼,
 *   방송 송출 전 각 CG 아이템이 정상인지 사전 점검한다.
 *
 * ■ 검증 항목 4가지:
 *   1) 그래픽 존재 확인 — 매핑된 graphic_id가 실제 DB에 존재하는가?
 *   2) 매핑 완성도 — CG 필드 중 몇 %가 그래픽 요소에 매핑되었는가?
 *   3) 텍스트 오버플로우 — 매핑된 텍스트가 Text Frame을 초과하는가?
 *   4) 콘텐츠 검증 — 맞춤법/금칙어/직함/시제 (Content Validation Engine)
 *
 * Why 별도 서비스 파일?
 *   $cuesheetId.tsx에 직접 넣으면 600줄+ 컴포넌트가 더 비대해짐.
 *   검증 로직은 순수 함수이므로 서비스 계층에 분리.
 */

import type { CgTextItem } from "@/lib/nrcsTypes";
import { supabase } from "@/lib/supabase";
import { resolveBindingTextLayout } from "@/lib/textFitPolicy";
import type { BundleSlot } from "./bundleService";
import {
	type ContentIssue,
	type ContentValidationResult,
	validateCgContent,
} from "./contentValidation";
import {
	buildCuesheetCheckContext,
	type CuesheetCheckContext,
	type CuesheetReusePolicy,
	type CuesheetValidationStatus,
	createCuesheetContentHash,
	getCuesheetValidationStatus,
} from "./cuesheetCheckService";
import type { NrcsCuesheetItem } from "./cuesheetService";

// ─── 결과 타입 ────────────────────────────────────────────────────

/** 개별 CG 아이템의 검증 결과 */
export interface PreflightCgResult {
	cgItem: CgTextItem;
	/** 매핑된 번들 슬롯 정보 */
	slot: BundleSlot | null;
	/** 그래픽 존재 여부 */
	graphicExists: boolean;
	/** 그래픽 이름 (존재 시) */
	graphicName: string | null;
	/** 매핑 완성도 (0~1) */
	mappingRatio: number;
	/** 매핑된 필드 수 / 전체 필드 수 */
	mappedFieldCount: number;
	totalFieldCount: number;
	/** 텍스트 오버플로우 경고 목록 */
	overflowWarnings: OverflowWarning[];
	/** 종합 상태 */
	status: "ok" | "warning" | "error";
}

/** 텍스트 오버플로우 경고 */
export interface OverflowWarning {
	fieldKey: string;
	ratio: number;
	severity: "warning" | "error";
}

/** 큐시트 아이템 전체의 검증 결과 */
export interface PreflightItemResult {
	item: NrcsCuesheetItem;
	cgResults: PreflightCgResult[];
	/** 콘텐츠 검증 이슈 (맞춤법/금칙어/직함/시제) */
	contentIssues: ContentIssue[];
	/** 종합 상태 (가장 심각한 것 기준) */
	status: "ok" | "warning" | "error";
}

/** 큐시트 전체의 프리플라이트 결과 */
export interface PreflightReport {
	totalItems: number;
	okCount: number;
	warningCount: number;
	errorCount: number;
	/** 콘텐츠 이슈 총 건수 */
	contentIssueCount: number;
	/** 검증 기준시점/재활용 정책 */
	checkContext: CuesheetCheckContext;
	/** 검증 이후 내용 변경 감지를 위한 deterministic fingerprint */
	contentHash: string;
	/** 런다운 전송 가능성을 판단하는 큐시트 체크 상태 */
	validationStatus: CuesheetValidationStatus;
	items: PreflightItemResult[];
}

export interface RunPreflightOptions {
	reusePolicy?: CuesheetReusePolicy;
	generatedAt?: string | null;
	originalAirDate?: string | null;
	targetAirDate?: string | null;
}

// re-export for consumers
export type { ContentIssue, ContentValidationResult };

// ─── 검증 엔진 ────────────────────────────────────────────────────

/**
 * 큐시트 전체를 프리플라이트 검증한다.
 *
 * ■ 알고리즘:
 *   1단계: 번들 슬롯 조회 (cg_type → graphic_id 매핑 확인)
 *   2단계: 관련 그래픽 ID 일괄 조회 (DB 1회 → 존재 여부 확인)
 *   3단계: 각 아이템의 CG 데이터를 슬롯과 매칭하여 검증
 *
 * @param items - 큐시트 아이템 배열
 * @param bundleId - 번들 ID (슬롯 조회용)
 * @param programDate - 프로그램 날짜 (시제 검증용, "2026-04-07"). 미입력 시 오늘 날짜.
 * @returns 프리플라이트 보고서
 */
export async function runPreflight(
	items: NrcsCuesheetItem[],
	bundleId: string | null,
	programDate?: string,
	options: RunPreflightOptions = {},
): Promise<PreflightReport> {
	const effectiveDate = programDate || new Date().toISOString().split("T")[0];
	const checkContext = buildCuesheetCheckContext({
		programDate: effectiveDate,
		generatedAt: options.generatedAt,
		reusePolicy: options.reusePolicy,
		originalAirDate: options.originalAirDate,
		targetAirDate: options.targetAirDate,
	});
	const contentHash = createCuesheetContentHash({
		programDate: checkContext.programDate,
		items,
	});

	// 번들 없으면 검증 스킵
	if (!bundleId || items.length === 0) {
		return {
			totalItems: items.length,
			okCount: 0,
			warningCount: 0,
			errorCount: items.length,
			contentIssueCount: 0,
			checkContext,
			contentHash,
			validationStatus: "blocked",
			items: items.map((item) => ({
				item,
				cgResults: [],
				contentIssues: [],
				status: "error" as const,
			})),
		};
	}

	// 1단계: 번들 슬롯 조회
	const { data: slotsRaw } = await supabase
		.from("bundle_slots")
		.select("*, graphics(name, template_data)")
		.eq("bundle_id", bundleId)
		.order("sort_order", { ascending: true });
	const slots: (BundleSlot & {
		graphics?: { name: string; template_data: Record<string, unknown> } | null;
	})[] = (slotsRaw || []) as unknown as (BundleSlot & {
		graphics?: { name: string; template_data: Record<string, unknown> } | null;
	})[];

	// 2단계: 그래픽 ID → 존재 여부 맵 구축 (1회 쿼리)
	const graphicIds = slots.map((s) => s.graphic_id).filter(Boolean) as string[];
	const graphicExistsMap = new Map<string, boolean>();
	const graphicNameMap = new Map<string, string>();
	const graphicTemplateMap = new Map<string, Record<string, unknown>>();

	if (graphicIds.length > 0) {
		const { data: existingGraphics } = await supabase
			.from("graphics")
			.select("id, name, template_data")
			.in("id", graphicIds);
		for (const g of existingGraphics || []) {
			graphicExistsMap.set(g.id, true);
			graphicNameMap.set(g.id, g.name);
			graphicTemplateMap.set(
				g.id,
				(g.template_data ?? {}) as Record<string, unknown>,
			);
		}
	}

	// 3단계: 아이템별 구조적 검증
	const itemResults: PreflightItemResult[] = items.map((item) => {
		const cgData: CgTextItem[] = (item.cg_data as CgTextItem[]) || [];

		if (cgData.length === 0) {
			return { item, cgResults: [], contentIssues: [], status: "ok" as const };
		}

		const cgResults: PreflightCgResult[] = cgData.map((cgItem) => {
			// CG 타입에 매칭되는 슬롯 찾기
			const matchingSlot = slots.find((s) => s.cg_type === cgItem.type) || null;
			const graphicId = matchingSlot?.graphic_id || null;
			const graphicExists = graphicId
				? (graphicExistsMap.get(graphicId) ?? false)
				: false;
			const graphicName = graphicId
				? (graphicNameMap.get(graphicId) ?? null)
				: null;

			// 매핑 완성도 계산
			const totalFields = Object.keys(cgItem.fields).length;
			const mapping = matchingSlot?.field_mapping || {};
			const mappedFields = Object.keys(cgItem.fields).filter(
				(k) => mapping[k],
			).length;
			const mappingRatio = totalFields > 0 ? mappedFields / totalFields : 0;

			// 오버플로우 검사
			// 그래픽의 template_data에서 바인딩 슬롯을 찾아 checkTextOverflow 호출
			const overflowWarnings: OverflowWarning[] = [];
			if (graphicId && graphicExists) {
				const templateData = graphicTemplateMap.get(graphicId);
				if (templateData?.elements) {
					const canvas = templateData.canvas as { width?: number } | undefined;
					const canvasWidth = canvas?.width ?? 1920;
					for (const [fieldKey, fieldValue] of Object.entries(cgItem.fields)) {
						const mappingEntry = mapping[fieldKey];
						if (!mappingEntry) continue;

						// elements에서 바인딩 슬롯 찾기
						for (const el of templateData.elements as Array<
							Record<string, unknown>
						>) {
							const bc = el.bindingContainer as
								| {
										enabled?: boolean;
										autoFit?: string;
										slots?: Array<Record<string, unknown>>;
								  }
								| undefined;
							if (bc?.enabled && bc?.slots) {
								const slot = bc.slots.find(
									(s) => s.id === mappingEntry.target_element_id,
								);
								if (slot) {
									const result = resolveBindingTextLayout({
										content: String(fieldValue ?? ""),
										autoFit: bc.autoFit,
										shape: {
											x: Number(el.x) || 0,
											width: Number(el.width) || 0,
											height: Number(el.height) || 0,
										},
										slot: {
											frameX: Number(slot.frameX) || 0,
											frameY: Number(slot.frameY) || 0,
											frameWidth: Number(slot.frameWidth) || 0,
											frameHeight: Number(slot.frameHeight) || 0,
											fontSize: Number(slot.fontSize) || 24,
											fontFamily: String(slot.fontFamily || "Pretendard"),
											fontWeight: Number(slot.fontWeight) || 400,
										},
										constraints: { canvasWidth },
									});
									if (result.severity !== "ok") {
										overflowWarnings.push({
											fieldKey,
											ratio: result.ratio,
											severity:
												result.severity === "error" ? "error" : "warning",
										});
									}
								}
							}
						}
					}
				}
			}

			// 종합 상태 판단
			let status: "ok" | "warning" | "error" = "ok";
			if (!matchingSlot)
				status = "error"; // 슬롯 없음
			else if (!graphicExists)
				status = "error"; // 그래픽 미존재
			else if (mappingRatio < 1) status = "warning"; // 부분 매핑
			if (overflowWarnings.some((w) => w.severity === "error"))
				status = "error";
			else if (
				overflowWarnings.some((w) => w.severity === "warning") &&
				status === "ok"
			)
				status = "warning";

			return {
				cgItem,
				slot: matchingSlot,
				graphicExists,
				graphicName,
				mappingRatio,
				mappedFieldCount: mappedFields,
				totalFieldCount: totalFields,
				overflowWarnings,
				status,
			};
		});

		// 아이템 종합 상태 (가장 심각한 것 기준)
		const hasError = cgResults.some((r) => r.status === "error");
		const hasWarning = cgResults.some((r) => r.status === "warning");
		const itemStatus = hasError ? "error" : hasWarning ? "warning" : "ok";

		return { item, cgResults, contentIssues: [], status: itemStatus };
	});

	// ── 4단계: 콘텐츠 검증 (맞춤법/금칙어/직함/시제) ──
	// ■ Why 구조적 검증과 분리 실행?
	//   구조적 검증은 동기(map), 콘텐츠 검증은 비동기(AI 호출 가능).
	//   또한 콘텐츠 검증은 그래픽 매핑과 무관하게 CG 텍스트 자체를 검사.
	const validatableItems = items.map((item) => ({
		id: item.id,
		slug: item.slug || "",
		title: item.title || "",
		cg_data: (item.cg_data || []) as Array<{
			type?: string;
			fields?: Record<string, string>;
		}>,
	}));

	const contentResults = await validateCgContent(
		validatableItems,
		checkContext,
	);

	// 콘텐츠 검증 결과를 각 아이템에 병합
	for (const cvResult of contentResults) {
		const itemResult = itemResults.find((r) => r.item.id === cvResult.itemId);
		if (itemResult) {
			itemResult.contentIssues = cvResult.issues;

			// 콘텐츠 이슈로 상태 격상
			// error급 금칙어 → 아이템 상태를 error로 상향
			if (
				cvResult.issues.some((i) => i.severity === "error") &&
				itemResult.status !== "error"
			) {
				itemResult.status = "error";
			} else if (
				cvResult.issues.some((i) => i.severity === "warning") &&
				itemResult.status === "ok"
			) {
				itemResult.status = "warning";
			}
		}
	}

	// 전체 콘텐츠 이슈 카운트
	const totalContentIssues = itemResults.reduce(
		(sum, r) => sum + r.contentIssues.length,
		0,
	);

	return {
		totalItems: itemResults.length,
		okCount: itemResults.filter((r) => r.status === "ok").length,
		warningCount: itemResults.filter((r) => r.status === "warning").length,
		errorCount: itemResults.filter((r) => r.status === "error").length,
		contentIssueCount: totalContentIssues,
		checkContext,
		contentHash,
		validationStatus: getCuesheetValidationStatus({
			errorCount: itemResults.filter((r) => r.status === "error").length,
			warningCount: itemResults.filter((r) => r.status === "warning").length,
		}),
		items: itemResults,
	};
}

// ─── 매핑 상태 맵 빌더 ────────────────────────────────────────────

/**
 * 프리플라이트 결과에서 DataViewer용 매핑 상태 맵을 생성
 *
 * ■ Why 별도 함수?
 *   DataViewer는 행 ID(source_row_id) → 매핑 상태를 알아야
 *   각 행의 ✅/🟡/🔴 배지를 표시할 수 있음.
 *   프리플라이트는 nrcs_cuesheet_item 기준이므로 변환이 필요.
 *
 * @param report - 프리플라이트 보고서
 * @param items - 큐시트 아이템 배열 (source_row_id 참조용)
 * @returns Map<source_row_id, "full" | "partial" | "unmapped" | "pending">
 */
export function buildMappingStatusMap(
	report: PreflightReport | null,
	items: NrcsCuesheetItem[],
): Map<string, "full" | "partial" | "unmapped" | "pending"> {
	const map = new Map<string, "full" | "partial" | "unmapped" | "pending">();

	if (!report) {
		// 프리플라이트 미실행 → 전부 pending
		for (const item of items) {
			if (item.source_row_id) {
				map.set(item.source_row_id, "pending");
			}
		}
		return map;
	}

	for (const itemResult of report.items) {
		const sourceRowId = itemResult.item.source_row_id;
		if (!sourceRowId) continue;

		// 상태 변환: preflight status → DataViewer 매핑 상태
		// ok → full (그래픽 존재 + 필드 100% 매핑)
		// warning → partial (부분 매핑 또는 오버플로우)
		// error → unmapped (그래픽 미존재 또는 슬롯 없음)
		switch (itemResult.status) {
			case "ok":
				map.set(sourceRowId, "full");
				break;
			case "warning":
				map.set(sourceRowId, "partial");
				break;
			case "error":
				map.set(sourceRowId, "unmapped");
				break;
		}
	}

	return map;
}
