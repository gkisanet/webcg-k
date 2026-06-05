/**
 * RundownRepository — rundown + rundown_items + broadcast session data access.
 *
 * 모든 rundown/session 데이터 접근의 단일 seam.
 * DB 스키마 변경은 이 파일만 수정하면 된다.
 */
import { normalizeGraphicMotionManifest } from "../lib/graphicMotionManifest";
import { supabase } from "../lib/supabase";

// ─── 타입 ────────────────────────────────────────────────────────────

export interface RundownItem {
	id: string;
	source_type: "graphic" | "template" | "overlay" | "ograf";
	source_id: string;
	source_name: string;
	data: any;
	item_order: number;
	duration: number;
	thumbnail?: string;
	section_id?: string | null;
	track_layer?: "wrap" | "main" | null;
	parent_item_id?: string | null;
}

export interface RundownMeta {
	id: string;
	title: string;
	description: string | null;
	is_public: boolean;
	workspace_id?: string | null;
	sections_data?: RundownSection[] | null;
}

export interface RundownSection {
	id: string;
	label: string;
	order: number;
	color: string;
}

export type SectionImportScope = "all" | "workspace" | "public";

export interface RundownSectionImportCandidate {
	source_rundown_id: string;
	source_rundown_title: string;
	source_rundown_description: string | null;
	source_workspace_id: string | null;
	source_is_public: boolean;
	source_updated_at: string | null;
	section: RundownSection;
	item_count: number;
}

export interface RundownSectionImportPayload
	extends RundownSectionImportCandidate {
	items: RundownItem[];
}

// ─── 1. 읽기 ─────────────────────────────────────────────────────────

export async function fetchRundownMeta(
	rundownId: string,
): Promise<RundownMeta> {
	const { data, error } = await supabase
		.from("rundowns")
		.select("id, title, description, is_public, workspace_id, sections_data")
		.eq("id", rundownId)
		.single();

	if (error) throw error;
	return data as unknown as RundownMeta;
}

function normalizeSearchTerm(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function isMatchingSectionCandidate(
	candidate: RundownSectionImportCandidate,
	searchTerm: string,
): boolean {
	if (!searchTerm) return true;
	return [
		candidate.source_rundown_title,
		candidate.source_rundown_description || "",
		candidate.section.label,
	].some((value) => value.toLocaleLowerCase().includes(searchTerm));
}

/**
 * 다른 런다운의 섹션을 가져오기 위한 읽기 전용 목록.
 *
 * ■ Why snapshot source?
 *   "섹션 가져오기"는 기존 템플릿 기능의 확장이 아니라 런다운 편집 재사용 기능이다.
 *   그래서 grid_templates가 아니라 rundowns.sections_data + rundown_items.section_id를
 *   seam으로 삼는다. RLS는 Supabase가 최종 필터링하고, 클라이언트 조건은 UI 의도
 *   (내 워크스페이스 또는 공개 런다운)를 명시하는 역할만 한다.
 */
export async function fetchRundownSectionImportCandidates(params: {
	targetRundownId: string;
	workspaceId?: string | null;
	scope?: SectionImportScope;
	search?: string;
	limit?: number;
}): Promise<RundownSectionImportCandidate[]> {
	const scope = params.scope || "all";
	const searchTerm = normalizeSearchTerm(params.search || "");
	const limit = params.limit ?? 80;

	let query = supabase
		.from("rundowns")
		.select(
			"id, title, description, is_public, workspace_id, sections_data, updated_at",
		)
		.neq("id", params.targetRundownId)
		.order("updated_at", { ascending: false })
		.limit(limit);

	if (scope === "workspace") {
		if (!params.workspaceId) return [];
		query = query.eq("workspace_id", params.workspaceId);
	} else if (scope === "public") {
		query = query.eq("is_public", true);
	} else if (params.workspaceId) {
		query = query.or(`workspace_id.eq.${params.workspaceId},is_public.eq.true`);
	} else {
		query = query.eq("is_public", true);
	}

	const { data, error } = await query;
	if (error) throw error;

	const rows = (data || []) as Array<{
		id: string;
		title: string;
		description: string | null;
		is_public: boolean | null;
		workspace_id: string | null;
		sections_data: RundownSection[] | null;
		updated_at: string | null;
	}>;

	const candidates = rows
		.flatMap((row) => {
			const sourceSections = Array.isArray(row.sections_data)
				? row.sections_data
				: [];
			return sourceSections.map((section) => ({
				source_rundown_id: row.id,
				source_rundown_title: row.title,
				source_rundown_description: row.description,
				source_workspace_id: row.workspace_id,
				source_is_public: !!row.is_public,
				source_updated_at: row.updated_at,
				section,
				item_count: 0,
			}));
		})
		.filter((candidate) => isMatchingSectionCandidate(candidate, searchTerm));

	const sourceRundownIds = [
		...new Set(candidates.map((candidate) => candidate.source_rundown_id)),
	];
	if (sourceRundownIds.length === 0) return candidates;

	const { data: itemRows, error: itemError } = await supabase
		.from("rundown_items")
		.select("rundown_id, section_id")
		.in("rundown_id", sourceRundownIds);

	if (itemError) throw itemError;

	const countBySection = new Map<string, number>();
	for (const item of (itemRows || []) as Array<{
		rundown_id: string;
		section_id: string | null;
	}>) {
		if (!item.section_id) continue;
		const key = `${item.rundown_id}:${item.section_id}`;
		countBySection.set(key, (countBySection.get(key) || 0) + 1);
	}

	return candidates.map((candidate) => ({
		...candidate,
		item_count:
			countBySection.get(
				`${candidate.source_rundown_id}:${candidate.section.id}`,
			) || 0,
	}));
}

export async function fetchRundownSectionImportPayload(
	sourceRundownId: string,
	sourceSectionId: string,
): Promise<RundownSectionImportPayload> {
	const meta = await fetchRundownMeta(sourceRundownId);
	const sourceSections = Array.isArray(meta.sections_data)
		? meta.sections_data
		: [];
	const section = sourceSections.find(
		(candidate) => candidate.id === sourceSectionId,
	);
	if (!section) {
		throw new Error("가져올 섹션을 찾을 수 없습니다.");
	}

	const sourceItems = await fetchRundownItems(sourceRundownId);
	const items = sourceItems.filter(
		(item) => item.section_id === sourceSectionId,
	);

	return {
		source_rundown_id: meta.id,
		source_rundown_title: meta.title,
		source_rundown_description: meta.description,
		source_workspace_id: meta.workspace_id || null,
		source_is_public: !!meta.is_public,
		source_updated_at: null,
		section,
		item_count: items.length,
		items,
	};
}

/**
 * rundown_items 조회 + overlay source_code enrichment.
 * overlay 아이템의 경우 overlay_templates에서 source_code를 가져와
 * item.data 최상위와 item.data.payload 양쪽에 주입한다.
 */
export async function fetchRundownItems(
	rundownId: string,
): Promise<RundownItem[]> {
	const { data: itemsData, error } = await supabase
		.from("rundown_items")
		.select("*")
		.eq("rundown_id", rundownId)
		.order("item_order", { ascending: true });

	if (error) throw error;

	const items = (itemsData || []) as unknown as RundownItem[];
	const overlayItems = items.filter(
		(i) => i.source_type === "overlay" && i.source_id,
	);

	if (overlayItems.length > 0) {
		const overlayIds = [...new Set(overlayItems.map((i) => i.source_id))];
		const { data: templates } = await supabase
			.from("overlay_templates")
			.select(
				"id, source_code, dashboard_schema, replicant_defaults, ai_metadata",
			)
			.in("id", overlayIds);

		if (templates) {
			const templateMap = new Map((templates as any[]).map((t) => [t.id, t]));
			for (const item of overlayItems) {
				const template = templateMap.get(item.source_id);
				const sc = template?.source_code;
				if (sc) {
					const existingData = item.data || {};
					const sourceCode = {
						html: sc.html || "",
						css: sc.css || "",
						js: sc.js || "",
						motion: normalizeGraphicMotionManifest(
							sc.motion || sc.motion_manifest || sc.motionManifest,
						),
					};
					const dashboardSchema =
						existingData.dashboard_schema || template.dashboard_schema || null;
					const replicantDefaults =
						existingData.replicant_defaults ||
						template.replicant_defaults ||
						{};
					const replicantData =
						existingData.replicant_data ||
						existingData.dashboard_data ||
						replicantDefaults;

					item.data = {
						...existingData,
						...sourceCode,
						source_code: sourceCode,
						dashboard_schema: dashboardSchema,
						replicant_defaults: replicantDefaults,
						replicant_data: replicantData,
						ai_metadata:
							existingData.ai_metadata || template.ai_metadata || null,
						payload: {
							...(existingData.payload || {}),
							...sourceCode,
							source_code: sourceCode,
							dashboard_schema: dashboardSchema,
							replicant_defaults: replicantDefaults,
							replicant_data: replicantData,
						},
					};
				}
			}
		}
	}

	return items;
}

// ─── 2. 쓰기 ─────────────────────────────────────────────────────────

export async function addRundownItem(
	rundownId: string,
	item: Partial<RundownItem>,
): Promise<RundownItem> {
	const { data, error } = await supabase
		.from("rundown_items")
		.insert({
			rundown_id: rundownId,
			...item,
		} as any)
		.select()
		.single();

	if (error) throw error;
	return data as unknown as RundownItem;
}

export async function removeRundownItem(itemId: string): Promise<void> {
	const { error } = await supabase
		.from("rundown_items")
		.delete()
		.eq("id", itemId);

	if (error) throw error;
}

export async function saveRundownItems(
	rundownId: string,
	items: RundownItem[],
): Promise<void> {
	const updates = items.map((item, i) => ({
		id: item.id,
		rundown_id: rundownId,
		item_order: i,
		data: item.data,
		duration: item.duration,
		section_id: item.section_id || null,
		track_layer: item.track_layer || null,
		parent_item_id: item.parent_item_id || null,
		source_type: item.source_type,
		source_id: item.source_id,
		source_name: item.source_name,
	}));

	const { error } = await supabase.from("rundown_items").upsert(updates as any);
	if (error) throw error;
}

// ─── 3. 메타데이터 ───────────────────────────────────────────────────

export async function updateRundownTitle(
	rundownId: string,
	title: string,
): Promise<void> {
	const { error } = await supabase
		.from("rundowns")
		.update({ title })
		.eq("id", rundownId);

	if (error) throw error;
}

export async function updateRundownSections(
	rundownId: string,
	sections: RundownSection[],
): Promise<void> {
	const { error } = await supabase
		.from("rundowns")
		.update({ sections_data: sections as any })
		.eq("id", rundownId);

	if (error) throw error;
}

// ─── 4. 송출 세션 생성 ───────────────────────────────────────────────

interface TimelineBlock {
	id: string;
	name: string;
	trackId: number;
	startPosition: number;
	width: number;
	transitionIn?: "cut" | "fade";
	transitionOut?: "cut" | "fade";
	source_type: string;
	source_id: string;
	data: any;
	cuesheet_item_id?: string;
	segment_id?: string;
}

// ■ 그리드 스냅 단위 — blockManipulation.ts의 SNAP_UNIT과 반드시 동일해야 함
const GAP = 50;
const SNAP_UNIT = 50;

/**
 * 블록 생성 시점의 그리드 스냅 보정
 *
 * ■ Why? `duration * 10` 결과값(ex: 70, 130, 175px)은 50px 격자에 맞지 않아
 *   타임라인에 배치 시 블록 가장자리가 스냅선에서 벗어나고,
 *   이후 이동/리사이즈 조작이나 ripple delete 시 격자가 연쇄적으로 붕괴된다.
 *   Math.ceil을 사용해 최소 1칸 이상의 너비를 보장하고 상위 격자로 올림한다.
 *   (예: 70px → 100px (2칸), 130px → 150px (3칸), 1px → 50px (1칸))
 */
function snapWidthToGrid(rawPx: number): number {
	return Math.max(SNAP_UNIT, Math.ceil(rawPx / SNAP_UNIT) * SNAP_UNIT);
}

function generateTimelineData(
	rundownItems: RundownItem[],
	segmentMap?: Map<string, string>,
): TimelineBlock[] {
	// ■ 시작점도 그리드 정렬: 50px (= 1 그리드 칸) 예약 공간에서 출발
	let currentPosition = SNAP_UNIT;
	const hasAnyWrap = rundownItems.some((i) => i.track_layer === "wrap");
	const blocks: TimelineBlock[] = [];

	// 1단계: Main 아이템 배치
	// ■ Why ceil? duration이 짧은 아이템(ex: 3초 → 30px)도 최소 1칸(50px)을 점유해야
	//   드래그/리사이즈의 최소 단위 MIN_BLOCK_WIDTH(100px=2칸)까지의 조작이 가능하다.
	const mainItems = rundownItems.filter((i) => i.track_layer !== "wrap");
	for (const item of mainItems) {
		const width = snapWidthToGrid(item.duration * 10);
		blocks.push({
			id: item.id,
			name: item.source_name,
			trackId: hasAnyWrap ? 2 : 1,
			startPosition: currentPosition,
			width,
			transitionIn: "fade",
			transitionOut: "fade",
			source_type: item.source_type,
			source_id: item.source_id,
			data: item.data,
			cuesheet_item_id: item.id,
			segment_id:
				(item.section_id && segmentMap?.get(item.section_id)) || undefined,
		});
		// ■ currentPosition = 이전 블록 끝 + GAP(50px)
		//   width가 50px 배수이므로 currentPosition도 항상 50px 배수 유지됨
		currentPosition += width + GAP;
	}

	// 2단계: Wrap CG 배치 — 자식 범위 자동 계산
	// ■ childBlocks의 startPosition/width가 이미 그리드 정렬됐으므로
	//   wrapStart/wrapWidth는 별도 스냅 처리 없이 자동으로 그리드에 맞는다.
	const wrapItems = rundownItems.filter((i) => i.track_layer === "wrap");
	for (const wrap of wrapItems) {
		const childBlocks = blocks.filter((b) => {
			const originalItem = rundownItems.find((i) => i.id === b.id);
			return originalItem?.parent_item_id === wrap.id;
		});

		let wrapStart: number;
		let wrapWidth: number;

		if (childBlocks.length > 0) {
			// 자식 블록들의 합산 범위를 wrap 블록으로 사용 (이미 스냅된 값)
			wrapStart = Math.min(...childBlocks.map((b) => b.startPosition));
			const wrapEnd = Math.max(
				...childBlocks.map((b) => b.startPosition + b.width),
			);
			wrapWidth = wrapEnd - wrapStart;
		} else {
			// 자식 없는 孤立 wrap 블록도 동일하게 그리드 스냅 적용
			wrapStart = currentPosition;
			wrapWidth = snapWidthToGrid(wrap.duration * 10);
			currentPosition += wrapWidth + GAP;
		}

		blocks.push({
			id: wrap.id,
			name: wrap.source_name,
			trackId: 1,
			startPosition: wrapStart,
			width: wrapWidth,
			transitionIn: "fade",
			transitionOut: "fade",
			source_type: wrap.source_type,
			source_id: wrap.source_id,
			data: wrap.data,
			cuesheet_item_id: wrap.id,
			segment_id:
				(wrap.section_id && segmentMap?.get(wrap.section_id)) || undefined,
		});
	}

	return blocks;
}

/**
 * 런다운 아이템과 섹션을 broadcast session으로 변환.
 * 4단계 트랜잭션: session 생성 → segments 생성 → timeline 데이터 변환 → timeline_data 업데이트.
 * @returns 생성된 session ID
 */
export async function createBroadcastSession(
	rundownId: string,
	rundownTitle: string,
	description: string | null,
	userId: string,
	items: RundownItem[],
	sections: RundownSection[],
): Promise<string> {
	// 1. 세션 생성
	const timelineBasic = generateTimelineData(items);
	const { data: rundownMeta } = await supabase
		.from("rundowns")
		.select("workspace_id")
		.eq("id", rundownId)
		.single();

	const { data: newSession, error } = await supabase
		.from("broadcast_sessions")
		.insert({
			title: `${rundownTitle} - ${new Date().toLocaleString("ko-KR")}`,
			description,
			rundown_id: rundownId,
			created_by: userId,
			workspace_id: (rundownMeta as any)?.workspace_id ?? null,
			timeline_data: timelineBasic,
			status: "draft",
		} as any)
		.select()
		.single();

	if (error || !newSession) throw error || new Error("Session creation failed");

	// 2. 섹션이 있으면 broadcast_segments 생성 + timeline_data에 segment_id 패치
	if (sections.length > 0) {
		const segmentInserts = sections.map((sec, i) => ({
			session_id: newSession.id,
			label: sec.label,
			segment_order: i,
			color: sec.color,
			slug: sec.label.toLowerCase().replace(/\s+/g, "-"),
		}));

		const { data: insertedSegments } = await (supabase as any)
			.from("broadcast_segments")
			.insert(segmentInserts)
			.select("id");

		if (insertedSegments && insertedSegments.length === sections.length) {
			const segmentMap = new Map<string, string>();
			sections.forEach((sec, i) => {
				segmentMap.set(sec.id, insertedSegments[i].id);
			});

			const timelineWithSegments = generateTimelineData(items, segmentMap);
			await supabase
				.from("broadcast_sessions")
				.update({ timeline_data: timelineWithSegments } as any)
				.eq("id", newSession.id);
		}
	}

	return newSession.id;
}
