/**
 * RundownRepository — rundown + rundown_items + broadcast session data access.
 *
 * 모든 rundown/session 데이터 접근의 단일 seam.
 * DB 스키마 변경은 이 파일만 수정하면 된다.
 */
import { supabase } from "../lib/supabase";

// ─── 타입 ────────────────────────────────────────────────────────────

export interface RundownItem {
  id: string;
  source_type: "graphic" | "template" | "overlay";
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
  sections_data?: RundownSection[] | null;
}

export interface RundownSection {
  id: string;
  label: string;
  order: number;
  color: string;
}

// ─── 1. 읽기 ─────────────────────────────────────────────────────────

export async function fetchRundownMeta(rundownId: string): Promise<RundownMeta> {
  const { data, error } = await supabase
    .from("rundowns")
    .select("id, title, description, is_public, sections_data")
    .eq("id", rundownId)
    .single();

  if (error) throw error;
  return data as unknown as RundownMeta;
}

/**
 * rundown_items 조회 + overlay source_code enrichment.
 * overlay 아이템의 경우 overlay_templates에서 source_code를 가져와 item.data.payload에 주입.
 */
export async function fetchRundownItems(rundownId: string): Promise<RundownItem[]> {
  const { data: itemsData, error } = await supabase
    .from("rundown_items")
    .select("*")
    .eq("rundown_id", rundownId)
    .order("item_order", { ascending: true });

  if (error) throw error;

  const items = (itemsData || []) as unknown as RundownItem[];
  const overlayItems = items.filter((i) => i.source_type === "overlay" && i.source_id);

  if (overlayItems.length > 0) {
    const overlayIds = [...new Set(overlayItems.map((i) => i.source_id))];
    const { data: templates } = await supabase
      .from("overlay_templates")
      .select("id, source_code")
      .in("id", overlayIds);

    if (templates) {
      const templateMap = new Map(
        (templates as any[]).map((t) => [t.id, t.source_code]),
      );
      for (const item of overlayItems) {
        const sc = templateMap.get(item.source_id);
        if (sc) {
          item.data = {
            ...(item.data || {}),
            payload: { html: sc.html || "", css: sc.css || "" },
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
  source_type: string;
  source_id: string;
  data: any;
  cuesheet_item_id?: string;
  segment_id?: string;
}

const GAP = 50;

function generateTimelineData(
  rundownItems: RundownItem[],
  segmentMap?: Map<string, string>,
): TimelineBlock[] {
  let currentPosition = 50;
  const hasAnyWrap = rundownItems.some((i) => i.track_layer === "wrap");
  const blocks: TimelineBlock[] = [];

  // 1단계: Main 아이템 배치
  const mainItems = rundownItems.filter((i) => i.track_layer !== "wrap");
  for (const item of mainItems) {
    const width = item.duration * 10;
    blocks.push({
      id: item.id,
      name: item.source_name,
      trackId: hasAnyWrap ? 2 : 1,
      startPosition: currentPosition,
      width,
      source_type: item.source_type,
      source_id: item.source_id,
      data: item.data,
      cuesheet_item_id: item.id,
      segment_id: (item.section_id && segmentMap?.get(item.section_id)) || undefined,
    });
    currentPosition += width + GAP;
  }

  // 2단계: Wrap CG 배치 — 자식 범위 자동 계산
  const wrapItems = rundownItems.filter((i) => i.track_layer === "wrap");
  for (const wrap of wrapItems) {
    const childBlocks = blocks.filter((b) => {
      const originalItem = rundownItems.find((i) => i.id === b.id);
      return originalItem?.parent_item_id === wrap.id;
    });

    let wrapStart: number;
    let wrapWidth: number;

    if (childBlocks.length > 0) {
      wrapStart = Math.min(...childBlocks.map((b) => b.startPosition));
      const wrapEnd = Math.max(...childBlocks.map((b) => b.startPosition + b.width));
      wrapWidth = wrapEnd - wrapStart;
    } else {
      wrapStart = currentPosition;
      wrapWidth = wrap.duration * 10;
      currentPosition += wrapWidth + GAP;
    }

    blocks.push({
      id: wrap.id,
      name: wrap.source_name,
      trackId: 1,
      startPosition: wrapStart,
      width: wrapWidth,
      source_type: wrap.source_type,
      source_id: wrap.source_id,
      data: wrap.data,
      cuesheet_item_id: wrap.id,
      segment_id: (wrap.section_id && segmentMap?.get(wrap.section_id)) || undefined,
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

  const { data: newSession, error } = await supabase
    .from("broadcast_sessions")
    .insert({
      title: `${rundownTitle} - ${new Date().toLocaleString("ko-KR")}`,
      description,
      rundown_id: rundownId,
      created_by: userId,
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
