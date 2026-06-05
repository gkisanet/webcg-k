/**
 * Zod 스키마 정의 — as any 제거를 위한 타입 안전 파싱
 *
 * 주요 스키마:
 * - GenerationConfig: AI 모델 생성 파라미터
 * - TemplateElement: 그래픽 템플릿 요소
 * - TemplateCanvas: 캔버스 크기 정보
 * - TemplateData: 템플릿 데이터 (elements + canvas)
 * - PlayheadState: 플레이헤드 상태 (세션 브로드캐스트)
 * - TimelineBlockData: 타임라인 블록 DB 레코드
 */

import { z } from "zod";

// ─── AI 모델 생성 파라미터 ─────────────────────────────────────

export const GenerationConfigSchema = z.object({
	temperature: z.number().optional().default(0.9),
	maxOutputTokens: z.number().optional().default(8192),
	topP: z.number().optional().default(0.95),
	topK: z.number().optional().default(40),
	/** @deprecated thinking.enabled로 대체. 레거시 호환용. */
	deepseekThinking: z.boolean().optional().default(false),
	deepseekReasoningEffort: z.enum(["high", "max"]).optional().default("high"),
	/** 프로바이더 공통 thinking/reasoning 설정 (Gemini, DeepSeek, OpenRouter) */
	thinking: z.object({
		enabled: z.boolean(),
		effort: z.enum(["low", "medium", "high", "max"]).optional(),
	}).optional(),
}).passthrough(); // 추가 필드 허용

export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;

/** 안전하게 generation_config 파싱 */
export function parseGenerationConfig(raw: unknown): GenerationConfig {
	if (!raw || typeof raw !== "object") {
		return { temperature: 0.9, maxOutputTokens: 8192, topP: 0.95, topK: 40, deepseekThinking: false, deepseekReasoningEffort: "high" };
	}
	return GenerationConfigSchema.parse(raw);
}

// ─── 그래픽 템플릿 요소 ────────────────────────────────────────

export const TemplateElementSchema = z.object({
	id: z.string(),
	type: z.string(),
	x: z.number().optional(),
	y: z.number().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	src: z.string().optional(),
	src_2k: z.string().optional(),
	src_4k: z.string().optional(),
	text: z.string().optional(),
	style: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type TemplateElement = z.infer<typeof TemplateElementSchema>;

// ─── 캔버스 크기 정보 ──────────────────────────────────────────

export const TemplateCanvasSchema = z.object({
	width: z.number().default(1920),
	height: z.number().default(1080),
}).passthrough();

export type TemplateCanvas = z.infer<typeof TemplateCanvasSchema>;

// ─── 템플릿 데이터 (elements + canvas) ─────────────────────────

export const TemplateDataSchema = z.object({
	elements: z.array(TemplateElementSchema).optional().default([]),
	canvas: TemplateCanvasSchema.optional().default({ width: 1920, height: 1080 }),
}).passthrough();

export type TemplateData = z.infer<typeof TemplateDataSchema>;

/** 안전하게 template_data 파싱 */
export function parseTemplateData(raw: unknown): TemplateData {
	if (!raw || typeof raw !== "object") {
		return { elements: [], canvas: { width: 1920, height: 1080 } };
	}
	try {
		return TemplateDataSchema.parse(raw);
	} catch {
		return { elements: [], canvas: { width: 1920, height: 1080 } };
	}
}

/** 안전하게 elements만 추출 */
export function parseTemplateElements(raw: unknown): TemplateElement[] {
	if (!raw || typeof raw !== "object") return [];
	const data = raw as Record<string, unknown>;
	if (!Array.isArray(data.elements)) return [];
	try {
		return z.array(TemplateElementSchema).parse(data.elements);
	} catch {
		return [];
	}
}

/** 안전하게 canvas 크기 추출 */
export function parseCanvasSize(raw: unknown): { width: number; height: number } {
	if (!raw || typeof raw !== "object") return { width: 1920, height: 1080 };
	const data = raw as Record<string, unknown>;
	if (!data.canvas || typeof data.canvas !== "object") return { width: 1920, height: 1080 };
	try {
		return TemplateCanvasSchema.parse(data.canvas);
	} catch {
		return { width: 1920, height: 1080 };
	}
}

// ─── 플레이헤드 상태 ───────────────────────────────────────────
// ■ Why passthrough? DB에 pgmBlockIds, completedBlockIds 등 추가 필드가 존재.

export const PlayheadStateSchema = z.object({
	/** @deprecated 레거시 단일 PGM — pgmBlockIds로 자동 마이그레이션 */
	pgmBlockId: z.string().nullable().optional(),
	/** 트랙별 활성 PGM (trackId → blockId). DB JSON은 Record<string, string> */
	pgmBlockIds: z.record(z.string(), z.string()).optional(),
	pvwBlockId: z.string().nullable().optional(),
	position: z.number().optional(),
}).passthrough();

export type PlayheadState = z.infer<typeof PlayheadStateSchema>;

/**
 * 안전하게 playhead_state 파싱 + 레거시 pgmBlockId → pgmBlockIds 마이그레이션
 *
 * ■ Why 마이그레이션?
 *   기존 DB에는 pgmBlockId(string)만 저장되어 있다.
 *   새 코드는 pgmBlockIds(Record)를 사용하므로,
 *   레거시 값이 발견되면 자동 변환한다.
 */
export function parsePlayheadState(raw: unknown): PlayheadState & { pgmBlockIds: Record<string, string> } {
	if (!raw || typeof raw !== "object") return { pgmBlockIds: {} };
	try {
		const parsed = PlayheadStateSchema.parse(raw);
		// pgmBlockIds가 이미 있으면 그대로 사용
		if (parsed.pgmBlockIds && Object.keys(parsed.pgmBlockIds).length > 0) {
			return { ...parsed, pgmBlockIds: parsed.pgmBlockIds };
		}
		// 레거시: pgmBlockId가 있으면 trackId를 알 수 없으므로 빈 Record 반환
		// (실제 복원은 $sessionId.tsx에서 블록 매칭으로 처리)
		return { ...parsed, pgmBlockIds: {} };
	} catch {
		return { pgmBlockIds: {} };
	}
}

// ─── 타임라인 블록 DB 레코드 ───────────────────────────────────
// ■ Why passthrough?
//   DB의 timeline_data JSON에는 data, source_type, source_id 등
//   다양한 필드가 존재. Zod 기본 동작(.strip())은 스키마에 없는 필드를
//   삭제하므로, passthrough()로 모든 필드를 보존해야 렌더러에서
//   그래픽 데이터(data.elements)에 접근할 수 있다.

/** 명시적 인터페이스 — DB 실제 형식과 일치 (broadcast.ts와 동기화) */
export interface TimelineBlockData {
	id: string;
	name: string;
	trackId: number;
	startPosition: number;
	width: number;
	color?: string;
	// DB 실제 필드명: data (컨트롤러에서 sourceData로 매핑)
	data?: any;
	source_type?: string;
	source_id?: string;
	// 역추적 필드 (핫 수정 / NRCS 변경 알림용)
	cuesheet_item_id?: string;
	bundle_slot_id?: string;
	// 세그먼트 소속 (Nested Sequence Tab 모델)
	segment_id?: string;
	// 레거시 호환 (이전 코드에서 사용)
	graphicId?: string | null;
	sourceData?: Record<string, unknown> | null;
	transitionIn?: string;
	transitionOut?: string;
}

export const TimelineBlockDataSchema = z.object({
	id: z.string(),
	name: z.string(),
	trackId: z.number(),
	startPosition: z.number(),
	width: z.number(),
	color: z.string().optional(),
	data: z.any().optional(),
	source_type: z.string().optional(),
	source_id: z.string().optional(),
	cuesheet_item_id: z.string().optional(),
	bundle_slot_id: z.string().optional(),
	segment_id: z.string().optional(),
	graphicId: z.string().nullable().optional(),
	sourceData: z.any().optional(),
	transitionIn: z.string().optional(),
	transitionOut: z.string().optional(),
}).passthrough(); // DB에 추가 필드가 있을 수 있으므로 보존

/** 안전하게 timeline_data 배열 파싱 */
export function parseTimelineData(raw: unknown): TimelineBlockData[] {
	if (!raw || !Array.isArray(raw)) return [];
	try {
		return z.array(TimelineBlockDataSchema).parse(raw) as TimelineBlockData[];
	} catch {
		return [];
	}
}
