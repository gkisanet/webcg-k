/**
 * Rundown package import/export.
 *
 * Why JSON first?
 * - Current rundown data, vector graphic data, and HTML overlay code already live as JSON columns.
 * - A plain JSON package is easy to inspect, diff, and test.
 * - Binary assets can later be added by wrapping the same manifest in a zip container.
 */
import type { Database, Json } from "../lib/database.types";
import {
	type GraphicMotionManifest,
	normalizeGraphicMotionManifest,
} from "../lib/graphicMotionManifest";
import { supabase } from "../lib/supabase";
import {
	fetchRundownItems,
	fetchRundownMeta,
	type RundownItem,
	type RundownMeta,
	type RundownSection,
} from "./rundownRepository";

export const RUNDOWN_PACKAGE_TYPE = "webcgk.rundown";
export const RUNDOWN_PACKAGE_SCHEMA_VERSION = 1;
export const RUNDOWN_PACKAGE_MIME = "application/vnd.webcgk.rundown+json";

type JsonRecord = Record<string, unknown>;
type OverlayTemplateInsert =
	Database["public"]["Tables"]["overlay_templates"]["Insert"];
type GraphicInsert = Database["public"]["Tables"]["graphics"]["Insert"];
type RundownInsert = Database["public"]["Tables"]["rundowns"]["Insert"];
type RundownItemInsert =
	Database["public"]["Tables"]["rundown_items"]["Insert"];

export interface RundownPackageManifest {
	packageType: typeof RUNDOWN_PACKAGE_TYPE;
	schemaVersion: typeof RUNDOWN_PACKAGE_SCHEMA_VERSION;
	exportedAt: string;
	exportedBy: "WebCG-K";
	format: {
		kind: "webcgk-rundown-json";
		isOgrafPackageExport: false;
		includesOgrafSourceData: boolean;
	};
	notes: string[];
	counts: {
		items: number;
		sections: number;
		htmlOverlays: number;
		graphics: number;
		ografItems: number;
	};
}

export interface RundownPackageMeta {
	title: string;
	description: string | null;
	is_public: boolean;
	sections_data: RundownSection[];
}

export interface RundownPackageItem {
	originalId: string;
	source_type: RundownItem["source_type"];
	source_id: string;
	source_name: string;
	data: unknown;
	item_order: number;
	duration: number;
	thumbnail?: string | null;
	section_id?: string | null;
	track_layer?: "wrap" | "main" | null;
	parent_item_id?: string | null;
}

export interface PluginSourceCodeSnapshot {
	html: string;
	css: string;
	js: string;
	motion?: GraphicMotionManifest | null;
}

export interface OverlayTemplateSnapshot {
	originalId: string;
	name: string;
	description: string | null;
	layer: number | null;
	graphic_data: unknown;
	data_source: unknown;
	refresh_interval: number | null;
	animation_config: unknown;
	is_public: boolean;
	visibility: string;
	grid_template_id: string | null;
	zone_ids: string[] | null;
	zone_bounds: unknown;
	ai_prompt: string | null;
	source_type: string | null;
	ai_metadata: unknown;
	tags: string[] | null;
	plugin_type: string | null;
	source_code: PluginSourceCodeSnapshot | null;
	dashboard_schema: unknown;
	replicant_defaults: unknown;
	thumbnail: string | null;
	category?: string | null;
	blend_mode?: string | null;
}

export interface GraphicSnapshot {
	originalId: string;
	name: string;
	description: string | null;
	template_data: unknown;
	thumbnail_path: string | null;
}

export interface RundownPackage {
	manifest: RundownPackageManifest;
	rundown: RundownPackageMeta;
	items: RundownPackageItem[];
	overlays: OverlayTemplateSnapshot[];
	graphics: GraphicSnapshot[];
}

export interface ImportRundownPackageParams {
	userId: string;
	workspaceId?: string | null;
	titleSuffix?: string;
}

export interface ImportRundownPackageResult {
	rundownId: string;
	itemCount: number;
	overlayCount: number;
	graphicCount: number;
}

export interface ImportedRundownItemDraft {
	originalId: string;
	insert: RundownItemInsert;
	parentOriginalId?: string | null;
}

function isRecord(value: unknown): value is JsonRecord {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function asJson(value: unknown): Json {
	return value as Json;
}

function normalizeSourceCode(value: unknown): PluginSourceCodeSnapshot | null {
	if (!isRecord(value)) return null;
	const html = typeof value.html === "string" ? value.html : "";
	const css = typeof value.css === "string" ? value.css : "";
	const js = typeof value.js === "string" ? value.js : "";
	if (!html && !css && !js) return null;
	const motion = normalizeGraphicMotionManifest(
		value.motion ?? value.motion_manifest ?? value.motionManifest,
	);
	return motion ? { html, css, js, motion } : { html, css, js };
}

function extractSourceCodeFromItemData(
	data: unknown,
): PluginSourceCodeSnapshot | null {
	if (!isRecord(data)) return null;

	const candidates = [
		data.source_code,
		isRecord(data.payload) ? data.payload.source_code : undefined,
		isRecord(data.payload) ? data.payload : undefined,
		data,
	];

	for (const candidate of candidates) {
		const sourceCode = normalizeSourceCode(candidate);
		if (sourceCode) return sourceCode;
	}

	return null;
}

function toPackageItem(item: RundownItem): RundownPackageItem {
	return {
		originalId: item.id,
		source_type: item.source_type,
		source_id: item.source_id,
		source_name: item.source_name,
		data: item.data ?? {},
		item_order: item.item_order,
		duration: item.duration,
		thumbnail: item.thumbnail ?? null,
		section_id: item.section_id ?? null,
		track_layer: item.track_layer ?? null,
		parent_item_id: item.parent_item_id ?? null,
	};
}

function toPackageMeta(meta: RundownMeta): RundownPackageMeta {
	return {
		title: meta.title,
		description: meta.description,
		is_public: !!meta.is_public,
		sections_data: Array.isArray(meta.sections_data) ? meta.sections_data : [],
	};
}

function isOverlayBackedItem(
	item: Pick<RundownPackageItem, "source_type">,
): boolean {
	return item.source_type === "overlay" || item.source_type === "template";
}

function uniqueSourceIds(
	items: Array<Pick<RundownPackageItem, "source_type" | "source_id">>,
	predicate: (
		item: Pick<RundownPackageItem, "source_type" | "source_id">,
	) => boolean,
): string[] {
	return [
		...new Set(
			items
				.filter((item) => predicate(item) && item.source_id)
				.map((item) => item.source_id),
		),
	];
}

function fallbackOverlaySnapshot(
	item: RundownItem,
): OverlayTemplateSnapshot | null {
	const sourceCode = extractSourceCodeFromItemData(item.data);
	if (!sourceCode) return null;

	const data = isRecord(item.data) ? item.data : {};

	return {
		originalId: item.source_id,
		name: item.source_name,
		description: null,
		layer: 0,
		graphic_data: [],
		data_source: null,
		refresh_interval: null,
		animation_config: {
			in: { type: "fade", duration: 300 },
			out: { type: "fade", duration: 300 },
		},
		is_public: false,
		visibility: "private",
		grid_template_id: null,
		zone_ids: null,
		zone_bounds: null,
		ai_prompt: null,
		source_type: "imported",
		ai_metadata: data.ai_metadata ?? null,
		tags: null,
		plugin_type: "html",
		source_code: sourceCode,
		dashboard_schema: data.dashboard_schema ?? null,
		replicant_defaults: data.replicant_defaults ?? {},
		thumbnail: item.thumbnail ?? null,
	};
}

function normalizeOverlayRow(row: JsonRecord): OverlayTemplateSnapshot {
	return {
		originalId: String(row.id),
		name: typeof row.name === "string" ? row.name : "Imported Overlay",
		description: typeof row.description === "string" ? row.description : null,
		layer: typeof row.layer === "number" ? row.layer : null,
		graphic_data: row.graphic_data ?? [],
		data_source: row.data_source ?? null,
		refresh_interval:
			typeof row.refresh_interval === "number" ? row.refresh_interval : null,
		animation_config: row.animation_config ?? null,
		is_public: Boolean(row.is_public),
		visibility: typeof row.visibility === "string" ? row.visibility : "private",
		grid_template_id:
			typeof row.grid_template_id === "string" ? row.grid_template_id : null,
		zone_ids: Array.isArray(row.zone_ids)
			? row.zone_ids.filter((id): id is string => typeof id === "string")
			: null,
		zone_bounds: row.zone_bounds ?? null,
		ai_prompt: typeof row.ai_prompt === "string" ? row.ai_prompt : null,
		source_type: typeof row.source_type === "string" ? row.source_type : null,
		ai_metadata: row.ai_metadata ?? null,
		tags: Array.isArray(row.tags)
			? row.tags.filter((tag): tag is string => typeof tag === "string")
			: null,
		plugin_type: typeof row.plugin_type === "string" ? row.plugin_type : null,
		source_code: normalizeSourceCode(row.source_code),
		dashboard_schema: row.dashboard_schema ?? null,
		replicant_defaults: row.replicant_defaults ?? null,
		thumbnail: typeof row.thumbnail === "string" ? row.thumbnail : null,
		category: typeof row.category === "string" ? row.category : null,
		blend_mode: typeof row.blend_mode === "string" ? row.blend_mode : null,
	};
}

function normalizeGraphicRow(row: JsonRecord): GraphicSnapshot {
	return {
		originalId: String(row.id),
		name: typeof row.name === "string" ? row.name : "Imported Graphic",
		description: typeof row.description === "string" ? row.description : null,
		template_data: row.template_data ?? {},
		thumbnail_path:
			typeof row.thumbnail_path === "string" ? row.thumbnail_path : null,
	};
}

async function fetchOverlaySnapshots(
	sourceIds: string[],
): Promise<OverlayTemplateSnapshot[]> {
	if (sourceIds.length === 0) return [];

	const { data, error } = await supabase
		.from("overlay_templates")
		.select(`
			id, name, description, layer, graphic_data, data_source, refresh_interval,
			animation_config, is_public, visibility, grid_template_id, zone_ids,
			zone_bounds, ai_prompt, source_type, ai_metadata, tags, plugin_type,
			source_code, dashboard_schema, replicant_defaults, thumbnail, category, blend_mode
		`)
		.in("id", sourceIds);

	if (error) throw error;
	return ((data ?? []) as unknown[]).filter(isRecord).map(normalizeOverlayRow);
}

async function fetchGraphicSnapshots(
	sourceIds: string[],
): Promise<GraphicSnapshot[]> {
	if (sourceIds.length === 0) return [];

	const { data, error } = await supabase
		.from("graphics")
		.select("id, name, description, template_data, thumbnail_path")
		.in("id", sourceIds);

	if (error) throw error;
	return ((data ?? []) as unknown[]).filter(isRecord).map(normalizeGraphicRow);
}

export async function exportRundownPackage(
	rundownId: string,
): Promise<RundownPackage> {
	const [meta, rundownItems] = await Promise.all([
		fetchRundownMeta(rundownId),
		fetchRundownItems(rundownId),
	]);

	const items = rundownItems.map(toPackageItem);
	const overlayIds = uniqueSourceIds(items, isOverlayBackedItem);
	const graphicIds = uniqueSourceIds(
		items,
		(item) => item.source_type === "graphic",
	);
	const [overlayRows, graphicRows] = await Promise.all([
		fetchOverlaySnapshots(overlayIds),
		fetchGraphicSnapshots(graphicIds),
	]);

	const overlayById = new Map(
		overlayRows.map((overlay) => [overlay.originalId, overlay]),
	);
	const fallbackOverlays = rundownItems
		.filter(
			(item) => isOverlayBackedItem(item) && !overlayById.has(item.source_id),
		)
		.map(fallbackOverlaySnapshot)
		.filter((overlay): overlay is OverlayTemplateSnapshot => overlay != null);
	const overlays = [...overlayRows, ...fallbackOverlays];
	const rundown = toPackageMeta(meta);
	const ografItemCount = items.filter(
		(item) => item.source_type === "ograf",
	).length;

	return {
		manifest: {
			packageType: RUNDOWN_PACKAGE_TYPE,
			schemaVersion: RUNDOWN_PACKAGE_SCHEMA_VERSION,
			exportedAt: new Date().toISOString(),
			exportedBy: "WebCG-K",
			format: {
				kind: "webcgk-rundown-json",
				isOgrafPackageExport: false,
				includesOgrafSourceData: ografItemCount > 0,
			},
			notes: [
				"This is a WebCG-K rundown JSON package, not an OGraf package export.",
				"OGraf items, when present, are included as WebCG-K sourceData snapshots.",
				"HTML overlay source code is included as a trusted snapshot.",
				"External image, font, and API URLs are referenced as-is in this JSON package.",
			],
			counts: {
				items: items.length,
				sections: rundown.sections_data.length,
				htmlOverlays: overlays.filter((overlay) => overlay.source_code != null)
					.length,
				graphics: graphicRows.length,
				ografItems: ografItemCount,
			},
		},
		rundown,
		items,
		overlays,
		graphics: graphicRows,
	};
}

export function serializeRundownPackage(pkg: RundownPackage): string {
	return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function buildRundownPackageFilename(title: string): string {
	const slug = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return `${slug || "rundown"}.webcgk-rundown.json`;
}

function assertRundownPackage(value: unknown): asserts value is RundownPackage {
	if (!isRecord(value)) {
		throw new Error("큐시트 패키지 JSON 형식이 아닙니다.");
	}
	if (
		!isRecord(value.manifest) ||
		value.manifest.packageType !== RUNDOWN_PACKAGE_TYPE
	) {
		throw new Error("WebCG-K 큐시트 패키지가 아닙니다.");
	}
	if (value.manifest.schemaVersion !== RUNDOWN_PACKAGE_SCHEMA_VERSION) {
		throw new Error(
			`지원하지 않는 큐시트 패키지 버전입니다: ${String(value.manifest.schemaVersion)}`,
		);
	}
	if (!isRecord(value.rundown)) {
		throw new Error("큐시트 메타데이터가 누락되었습니다.");
	}
	if (!Array.isArray(value.items)) {
		throw new Error("큐시트 아이템 목록이 누락되었습니다.");
	}
}

export function parseRundownPackage(raw: string): RundownPackage {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("JSON 파일을 읽을 수 없습니다.");
	}

	assertRundownPackage(parsed);

	return {
		manifest: parsed.manifest,
		rundown: {
			title:
				typeof parsed.rundown.title === "string"
					? parsed.rundown.title
					: "Imported Rundown",
			description:
				typeof parsed.rundown.description === "string"
					? parsed.rundown.description
					: null,
			is_public: Boolean(parsed.rundown.is_public),
			sections_data: Array.isArray(parsed.rundown.sections_data)
				? (parsed.rundown.sections_data as RundownSection[])
				: [],
		},
		items: parsed.items as RundownPackageItem[],
		overlays: Array.isArray(parsed.overlays)
			? (parsed.overlays as OverlayTemplateSnapshot[])
			: [],
		graphics: Array.isArray(parsed.graphics)
			? (parsed.graphics as GraphicSnapshot[])
			: [],
	};
}

function resolveSourceId(
	item: Pick<RundownPackageItem, "source_type" | "source_id">,
	sourceIdMap: Map<string, string>,
): string {
	return (
		sourceIdMap.get(`${item.source_type}:${item.source_id}`) ?? item.source_id
	);
}

export function buildImportedRundownItemDrafts(params: {
	rundownId: string;
	items: RundownPackageItem[];
	sourceIdMap: Map<string, string>;
}): ImportedRundownItemDraft[] {
	return params.items
		.slice()
		.sort((a, b) => a.item_order - b.item_order)
		.map((item, index) => ({
			originalId: item.originalId,
			parentOriginalId: item.parent_item_id ?? null,
			insert: {
				rundown_id: params.rundownId,
				source_type: item.source_type,
				source_id: resolveSourceId(item, params.sourceIdMap),
				source_name: item.source_name,
				data: asJson(item.data ?? {}),
				item_order: index,
				duration: item.duration || 10,
				thumbnail: item.thumbnail ?? null,
				section_id: item.section_id ?? null,
				track_layer: item.track_layer ?? null,
				parent_item_id: null,
			},
		}));
}

async function importOverlaySnapshots(
	overlays: OverlayTemplateSnapshot[],
	params: ImportRundownPackageParams,
): Promise<Map<string, string>> {
	const sourceIdMap = new Map<string, string>();

	for (const overlay of overlays) {
		const insert: OverlayTemplateInsert = {
			owner_id: params.userId,
			name: overlay.name,
			description: overlay.description,
			layer: overlay.layer ?? 0,
			graphic_data: asJson(overlay.graphic_data ?? []),
			data_source: asJson(overlay.data_source ?? null),
			refresh_interval: overlay.refresh_interval,
			animation_config: asJson(overlay.animation_config ?? null),
			is_public: false,
			visibility: "private",
			workspace_id: params.workspaceId ?? null,
			grid_template_id: null,
			zone_ids: overlay.zone_ids,
			zone_bounds: asJson(overlay.zone_bounds ?? null),
			ai_prompt: overlay.ai_prompt,
			source_type: overlay.source_type ?? "imported",
			ai_metadata: asJson(overlay.ai_metadata ?? null),
			tags: overlay.tags,
			plugin_type:
				overlay.plugin_type ?? (overlay.source_code ? "html" : "svg"),
			source_code: asJson(overlay.source_code),
			dashboard_schema: asJson(overlay.dashboard_schema ?? null),
			replicant_defaults: asJson(overlay.replicant_defaults ?? null),
			thumbnail: overlay.thumbnail,
			category: overlay.category ?? null,
			blend_mode: overlay.blend_mode ?? null,
		};

		const { data, error } = await supabase
			.from("overlay_templates")
			.insert(insert)
			.select("id")
			.single();

		if (error) throw error;
		const newId = String(data.id);
		sourceIdMap.set(`overlay:${overlay.originalId}`, newId);
		sourceIdMap.set(`template:${overlay.originalId}`, newId);
	}

	return sourceIdMap;
}

async function importGraphicSnapshots(
	graphics: GraphicSnapshot[],
	params: ImportRundownPackageParams,
): Promise<Map<string, string>> {
	const sourceIdMap = new Map<string, string>();

	for (const graphic of graphics) {
		const insert: GraphicInsert = {
			owner_id: params.userId,
			name: graphic.name,
			description: graphic.description,
			template_data: asJson(graphic.template_data ?? {}),
			thumbnail_path: graphic.thumbnail_path,
			is_public: false,
			workspace_id: params.workspaceId ?? null,
		};

		const { data, error } = await supabase
			.from("graphics")
			.insert(insert)
			.select("id")
			.single();

		if (error) throw error;
		sourceIdMap.set(`graphic:${graphic.originalId}`, String(data.id));
	}

	return sourceIdMap;
}

export async function importRundownPackage(
	pkg: RundownPackage,
	params: ImportRundownPackageParams,
): Promise<ImportRundownPackageResult> {
	assertRundownPackage(pkg);

	const titleSuffix = params.titleSuffix ?? " (가져옴)";
	const rundownInsert: RundownInsert = {
		title: `${pkg.rundown.title}${titleSuffix}`,
		description: pkg.rundown.description,
		is_public: false,
		created_by: params.userId,
		workspace_id: params.workspaceId ?? null,
		sections_data: asJson(pkg.rundown.sections_data),
	};

	const { data: newRundown, error: rundownError } = await supabase
		.from("rundowns")
		.insert(rundownInsert)
		.select("id")
		.single();

	if (rundownError) throw rundownError;
	const rundownId = String(newRundown.id);

	const [overlayMap, graphicMap] = await Promise.all([
		importOverlaySnapshots(pkg.overlays, params),
		importGraphicSnapshots(pkg.graphics, params),
	]);
	const sourceIdMap = new Map([...overlayMap, ...graphicMap]);
	const itemDrafts = buildImportedRundownItemDrafts({
		rundownId,
		items: pkg.items,
		sourceIdMap,
	});

	const itemIdMap = new Map<string, string>();
	for (const draft of itemDrafts) {
		const { data, error } = await supabase
			.from("rundown_items")
			.insert(draft.insert)
			.select("id")
			.single();

		if (error) throw error;
		itemIdMap.set(draft.originalId, String(data.id));
	}

	for (const draft of itemDrafts) {
		if (!draft.parentOriginalId) continue;
		const itemId = itemIdMap.get(draft.originalId);
		const parentItemId = itemIdMap.get(draft.parentOriginalId);
		if (!itemId || !parentItemId) continue;

		const { error } = await supabase
			.from("rundown_items")
			.update({ parent_item_id: parentItemId })
			.eq("id", itemId);

		if (error) throw error;
	}

	return {
		rundownId,
		itemCount: itemDrafts.length,
		overlayCount: pkg.overlays.length,
		graphicCount: pkg.graphics.length,
	};
}
