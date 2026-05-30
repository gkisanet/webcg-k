/**
 * Cuesheet Check Service — 송출 전 큐시트 품질 게이트
 *
 * 큐시트 체크는 "송출 중 긴급 수정"을 늘리지 않기 위한 사전 검증 Module이다.
 * content hash는 보안 목적이 아니라, 검증 이후 큐시트 내용이 바뀌었는지
 * 빠르게 감지하기 위한 deterministic fingerprint다.
 */

import type { Json } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import type { NrcsCuesheetItem } from "./cuesheetService";

export type CuesheetReusePolicy = "single_air" | "reusable";
export type CuesheetValidationStatus = "passed" | "needs_review" | "blocked";

export interface CuesheetCheckContext {
	programDate: string;
	generatedAt: string | null;
	checkedAt: string;
	timezone: "Asia/Seoul";
	reusePolicy: CuesheetReusePolicy;
	originalAirDate?: string | null;
	targetAirDate?: string | null;
}

export interface BuildCuesheetCheckContextInput {
	programDate: string;
	generatedAt?: string | null;
	checkedAt?: string;
	reusePolicy?: CuesheetReusePolicy;
	originalAirDate?: string | null;
	targetAirDate?: string | null;
}

export interface CuesheetContentHashInput {
	programDate: string;
	items: Pick<
		NrcsCuesheetItem,
		| "id"
		| "slug"
		| "title"
		| "reporter"
		| "article_type"
		| "item_order"
		| "cg_data"
		| "source_row_id"
	>[];
}

export interface CuesheetValidationReportRecord {
	id: string;
	cuesheetId: string;
	status: CuesheetValidationStatus;
	contentHash: string;
	context: CuesheetCheckContext;
	report: unknown;
	checkedBy: string | null;
	checkedAt: string;
	aiModelId: string | null;
	createdAt: string | null;
}

export interface SaveCuesheetValidationReportInput {
	cuesheetId: string;
	status: CuesheetValidationStatus;
	contentHash: string;
	context: CuesheetCheckContext;
	report: unknown;
	aiModelId?: string | null;
}

export function buildCuesheetCheckContext(
	input: BuildCuesheetCheckContextInput,
): CuesheetCheckContext {
	return {
		programDate: input.programDate,
		generatedAt: input.generatedAt ?? null,
		checkedAt: input.checkedAt ?? new Date().toISOString(),
		timezone: "Asia/Seoul",
		reusePolicy: input.reusePolicy ?? "reusable",
		originalAirDate: input.originalAirDate ?? input.programDate,
		targetAirDate: input.targetAirDate ?? input.programDate,
	};
}

export function getCuesheetValidationStatus(input: {
	errorCount: number;
	warningCount: number;
}): CuesheetValidationStatus {
	if (input.errorCount > 0) return "blocked";
	if (input.warningCount > 0) return "needs_review";
	return "passed";
}

export function buildCuesheetContentSnapshot(input: CuesheetContentHashInput) {
	return {
		programDate: input.programDate,
		items: input.items.map((item) => ({
			id: item.id,
			sourceRowId: item.source_row_id,
			order: item.item_order ?? 0,
			slug: item.slug,
			title: item.title,
			reporter: item.reporter,
			articleType: item.article_type,
			cgData: item.cg_data ?? [],
		})),
	};
}

export function createCuesheetContentHash(
	input: CuesheetContentHashInput,
): string {
	const payload = stableStringify(buildCuesheetContentSnapshot(input));
	let hash = 2166136261;

	for (let i = 0; i < payload.length; i++) {
		hash ^= payload.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}

	return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}:${payload.length}`;
}

export function isValidationReportStale(
	report: CuesheetValidationReportRecord | null | undefined,
	currentContentHash: string,
	reusePolicy?: CuesheetReusePolicy,
): boolean {
	if (!report) return true;
	if (report.contentHash !== currentContentHash) return true;
	if (reusePolicy && report.context.reusePolicy !== reusePolicy) return true;
	return false;
}

export async function fetchLatestCuesheetValidationReport(
	cuesheetId: string,
): Promise<CuesheetValidationReportRecord | null> {
	const { data, error } = await supabase
		.from("nrcs_cuesheet_validation_reports" as never)
		.select("*")
		.eq("cuesheet_id", cuesheetId)
		.order("checked_at", { ascending: false })
		.limit(1);

	if (error) throw error;
	const row = Array.isArray(data) ? data[0] : null;
	return row ? mapValidationReportRow(row) : null;
}

export async function saveCuesheetValidationReport(
	input: SaveCuesheetValidationReportInput,
): Promise<CuesheetValidationReportRecord> {
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const { data, error } = await supabase
		.from("nrcs_cuesheet_validation_reports" as never)
		.insert({
			cuesheet_id: input.cuesheetId,
			status: input.status,
			content_hash: input.contentHash,
			context_json: input.context as unknown as Json,
			report_json: input.report as unknown as Json,
			checked_by: user?.id ?? null,
			checked_at: input.context.checkedAt,
			ai_model_id: input.aiModelId ?? null,
		})
		.select("*")
		.single();

	if (error) throw error;
	return mapValidationReportRow(data);
}

function mapValidationReportRow(row: unknown): CuesheetValidationReportRecord {
	const value = row as {
		id: string;
		cuesheet_id: string;
		status: CuesheetValidationStatus;
		content_hash: string;
		context_json: CuesheetCheckContext;
		report_json: unknown;
		checked_by: string | null;
		checked_at: string;
		ai_model_id: string | null;
		created_at: string | null;
	};

	return {
		id: value.id,
		cuesheetId: value.cuesheet_id,
		status: value.status,
		contentHash: value.content_hash,
		context: value.context_json,
		report: value.report_json,
		checkedBy: value.checked_by,
		checkedAt: value.checked_at,
		aiModelId: value.ai_model_id,
		createdAt: value.created_at,
	};
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value) ?? "undefined";
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	const record = value as Record<string, unknown>;
	const entries = Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
	return `{${entries.join(",")}}`;
}
