/**
 * Overlay System Types
 * 오버레이 AI CG 생성 시스템 타입 정의
 */

import type { GraphicElement } from "../components/GraphicPreviewRenderer";

// ─── Wizard ───────────────────────────────────────────────────────

/** Wizard 단계 */
export type WizardStep =
	| "grid-select"
	| "zone-select"
	| "ai-prompt"
	| "variation-select";

/** 데이터 소스 유형 */
export type DataSourceType =
	| "none"
	| "weather"
	| "earthquake"
	| "wildfire"
	| "public_data"
	| "image_based"
	| "custom_api"
	| "mcp";

/** 오버레이 생성 원본 유형 */
export type OverlaySourceType =
	| "manual"
	| "ai_generated"
	| "imported"
	| "api_bound";

// ─── CG Variation ─────────────────────────────────────────────────

/** AI가 생성한 CG Variation 하나 */
export interface CgVariation {
	id: string;
	name: string;
	description: string;
	elements: GraphicElement[];
	canvasSize: { width: number; height: number };
	colorScheme: string;
	tags: string[];
	dataSource?: DataSourceType;
}

// ─── Plugin System Types ──────────────────────────────────────────

/** 플러그인 유형: 기존 SVG 방식 또는 신규 HTML 코드 방식 */
export type PluginType = "svg" | "html" | "semantic";

/** 플러그인 소스 코드 (HTML+CSS+JS 3파일 구조) */
export interface PluginSourceCode {
	html: string;
	css: string;
	js: string;
}

/** 대시보드 스키마 프로퍼티 (JSON Schema 기반) */
export interface DashboardSchemaProperty {
	type: "string" | "number" | "boolean" | "color" | "select" | "array";
	title: string;
	default?: unknown;
	/** 필드 설명 (스키마 에디터용) */
	description?: string;
	/** string + enum → 드롭다운 선택 */
	enum?: string[];
	/** select 타입일 때 선택지 */
	options?: { label: string; value: unknown }[];
	/** number 타입일 때 범위 */
	min?: number;
	max?: number;
	minimum?: number;
	maximum?: number;
	step?: number;
}

/** 대시보드 스키마: 플러그인의 제어 가능한 데이터 필드 정의 */
export interface DashboardSchema {
	properties: Record<string, DashboardSchemaProperty>;
}

// ─── Overlay Template (확장) ──────────────────────────────────────

/** 확장된 overlay_templates 행 */
export interface OverlayTemplateExtended {
	id: string;
	owner_id: string;
	name: string;
	description: string | null;
	layer: number;
	graphic_data: GraphicElement[];
	data_source: DataSourceConfig | null;
	refresh_interval: number | null;
	animation_config: AnimationConfig;
	is_public: boolean;
	// AI 확장 컬럼
	grid_template_id: string | null;
	zone_ids: string[] | null;
	zone_bounds: ZoneBounds | null;
	ai_prompt: string | null;
	source_type: OverlaySourceType;
	ai_metadata: AiMetadata | null;
	tags: string[] | null;
	// ─── Plugin 확장 컬럼 (Phase 0) ───
	// ■ Why 기존 테이블 확장?
	//   별도 테이블 대신 컬럼 추가로 기존 SVG 오버레이와 공존.
	//   plugin_type DEFAULT 'svg'로 하위 호환 보장.
	plugin_type: PluginType;
	source_code: PluginSourceCode | null;
	dashboard_schema: DashboardSchema | null;
	replicant_defaults: Record<string, unknown> | null;
	thumbnail: string | null;
	created_at: string;
	updated_at: string;
}

/** Zone 결합 Bounds (% 기반 → 픽셀 변환용) */
export interface ZoneBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** AI 메타데이터 */
export interface AiMetadata {
	model: string;
	prompt: string;
	dataContext?: Record<string, unknown>;
	generatedAt: string;
	variationIndex?: number;
}

// ─── Action Button 시스템 ──────────────────────────────────────────

/** 액션 버튼 타입 */
export type OverlayActionType =
	| "toggle"          // 필드 값 교대 전환
	| "trigger"         // 일회성 애니메이션 실행
	| "data_refresh"    // 외부 API 데이터 재호출
	| "style_switch"    // 스타일 프리셋 전환
	| "cycle_content";  // 콘텐츠 순환 (transition)

/** 콘텐츠 순환 전환 효과 */
export type ContentTransitionType = "fade" | "slide-left" | "slide-up";

/** 순환 콘텐츠 슬라이드 1장 */
export interface ContentSlide {
	label: string;
	elements: GraphicElement[];
}

/** 액션 버튼 설정 (animation_config.actions 배열 원소) */
export interface OverlayAction {
	id: string;
	label: string;
	icon?: string;                        // lucide 아이콘 이름
	type: OverlayActionType;
	color?: string;
	config: {
		// toggle: 특정 필드를 교대 전환
		targetField?: string;
		values?: unknown[];
		// trigger: 일회성 CSS 애니메이션
		animationName?: string;
		duration?: number;
		// data_refresh: API 재호출 (config 불필요, 데이터소스 참조)
		// style_switch: 스타일 프리셋 목록
		presets?: Record<string, unknown>[];
		// cycle_content: 순환 슬라이드
		contents?: ContentSlide[];
		transitionType?: ContentTransitionType;
		transitionDuration?: number;       // ms
		autoInterval?: number;             // 자동 순환 간격 (ms, 0=수동)
	};
}

/** 애니메이션 설정 */
export interface AnimationConfig {
	in: { type: string; duration: number };
	out: { type: string; duration: number };
	loop?: { type: string; duration: number };
	/** 오버레이 카드에 표시할 액션 버튼 목록 */
	actions?: OverlayAction[];
}

// ─── Gallery ──────────────────────────────────────────────────────

/** 갤러리 아이템 (overlay_gallery 행 + JOIN) */
export interface OverlayGalleryItem {
	id: string;
	owner_id: string;
	template_id: string;
	name: string;
	thumbnail: string | null;
	is_favorite: boolean;
	tags: string[];
	created_at: string;
	template?: OverlayTemplateExtended;
}

// ─── Data Source ───────────────────────────────────────────────────

/** 데이터 소스 설정 (overlay_data_sources 행) */
export interface DataSourceConfig {
	id?: string;
	name?: string;
	type: DataSourceType;
	url?: string;
	method?: string;
	headers?: Record<string, string>;
	mapping?: Record<string, string>;
	interval?: number;
	customSourceId?: string; // custom_data_sources 참조
}

/** 데이터 소스 DB 행 */
export interface DataSourceRow {
	id: string;
	owner_id: string;
	name: string;
	type: DataSourceType;
	config: DataSourceConfig;
	is_active: boolean;
	last_fetched: string | null;
	created_at: string;
	updated_at: string;
}

/** 커스텀 데이터 소스 DB 행 (custom_data_sources 테이블) */
export interface CustomDataSource {
	id: string;
	owner_id: string;
	name: string;
	icon: string;
	provider: string;
	description: string | null;
	accent: string;
	endpoint: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
	query_params: Record<string, string>;
	body_template: Record<string, unknown> | null;
	response_mapping: Record<string, string>;
	auth_type: "none" | "api_key" | "bearer";
	api_key_id: string | null;
	is_active: boolean;
	last_tested: string | null;
	last_status: number | null;
	created_at: string;
	updated_at: string;
}

// ─── External Data 응답 ──────────────────────────────────────────

/** Open-Meteo 날씨 데이터 */
export interface WeatherData {
	temperature: number;
	weatherCode: number;
	weatherDescription: string;
	icon: string;
	city: string;
	humidity?: number;
	windSpeed?: number;
}

/** USGS 지진 데이터 */
export interface EarthquakeData {
	magnitude: number;
	location: string;
	depth: number;
	time: string;
	coordinates: { lat: number; lon: number };
}

/** 산불 데이터 (Mock) */
export interface WildfireData {
	level: string;
	location: string;
	areaHa: number;
	status: string;
	startDate: string;
}

// ─── Wizard 상태 ──────────────────────────────────────────────────

/** Wizard 전체 상태 */
export interface WizardState {
	step: WizardStep;
	selectedGridId: string | null;
	selectedZoneIds: Set<string>;
	combinedBounds: ZoneBounds | null;
	prompt: string;
	dataSourceType: DataSourceType;
	dataContext: Record<string, unknown> | null;
	variations: CgVariation[];
	isGenerating: boolean;
	error: string | null;
}

/** Wizard 초기 상태 */
export const INITIAL_WIZARD_STATE: WizardState = {
	step: "grid-select",
	selectedGridId: null,
	selectedZoneIds: new Set(),
	combinedBounds: null,
	prompt: "",
	dataSourceType: "none",
	dataContext: null,
	variations: [],
	isGenerating: false,
	error: null,
};
