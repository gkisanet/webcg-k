/**
 * AI 큐시트 세션 영속화 서비스 (v4)
 *
 * ai_cuesheet_sessions / ai_cuesheet_session_scenes 테이블 CRUD.
 * 위자드 단계 전환 시 autoSaveWizardState()로 전체 상태를 저장하고,
 * 세션 재개 시 getSession()으로 복원한다.
 */

import { supabase } from "../lib/supabase";
import type {
  AiCuesheetSession,
  AiCuesheetSessionScene,
  SceneContent,
  SessionListRow,
  CuesheetWizardState,
} from "../lib/aiCuesheetTypes";

// ─── 1. 세션 목록 조회 ────────────────────────────────────────────

export async function fetchSessions(): Promise<SessionListRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("ai_cuesheet_sessions")
    .select("id, program_title, expert_data, status, scene_count, generated_count, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    expert_name: String((row.expert_data as any)?.name || ""),
  })) as SessionListRow[];
}

// ─── 2. 세션 생성 ─────────────────────────────────────────────────

export async function createSession(data: {
  program_title: string;
  expert_data: Record<string, unknown>;
  raw_input_json?: string | null;
  scene_count?: number;
}): Promise<AiCuesheetSession> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Login required");

  const { data: session, error } = await supabase
    .from("ai_cuesheet_sessions")
    .insert({
      ...data as any,
      owner_id: user.id,
      status: "in_progress",
    })
    .select()
    .single();

  if (error) throw error;
  return session as unknown as AiCuesheetSession;
}

// ─── 3. 세션 단건 조회 (scenes 포함) ──────────────────────────────

export async function getSession(id: string): Promise<{
  session: AiCuesheetSession;
  scenes: AiCuesheetSessionScene[];
}> {
  const { data: session, error: sErr } = await supabase
    .from("ai_cuesheet_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (sErr) throw sErr;

  const { data: scenes, error: scErr } = await supabase
    .from("ai_cuesheet_session_scenes")
    .select("*")
    .eq("session_id", id)
    .order("scene_order", { ascending: true });

  if (scErr) throw scErr;

  return {
    session: session as unknown as AiCuesheetSession,
    scenes: (scenes || []) as unknown as AiCuesheetSessionScene[],
  };
}

// ─── 4. 세션 부분 업데이트 ────────────────────────────────────────

export async function updateSession(
  id: string,
  updates: Partial<Pick<AiCuesheetSession, "status" | "program_title" | "expert_data" | "raw_input_json" | "scene_count" | "generated_count">>,
): Promise<void> {
  const { error } = await supabase
    .from("ai_cuesheet_sessions")
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq("id", id);

  if (error) throw error;
}

// ─── 5. Scenes 배치 저장 (v4: graphic state 포함) ─────────────────

export async function saveSessionScenes(
  sessionId: string,
  scenes: SceneContent[],
  generatedHtml?: Record<number, string>,
  generatedCss?: Record<number, string>,
): Promise<void> {
  const newRows = scenes.map((scene) => ({
    session_id: sessionId,
    scene_order: scene.order,
    trigger_note: scene.trigger,
    scene_data: scene as unknown as Record<string, unknown>,
    generated_html: generatedHtml?.[scene.order] ?? null,
    generated_css: generatedCss?.[scene.order] ?? null,
  }));

  if (newRows.length === 0) return;

  // Get existing row IDs BEFORE insert (so we know what to clean up)
  const { data: existing } = await supabase
    .from("ai_cuesheet_session_scenes")
    .select("id")
    .eq("session_id", sessionId);

  const oldIds = (existing || []).map((r) => r.id);

  // INSERT new rows FIRST — if this fails, old data is 100% preserved
  const { error: insertErr } = await supabase
    .from("ai_cuesheet_session_scenes")
    .insert(newRows as any);

  if (insertErr) throw insertErr;

  // ONLY after successful insert, clean up old rows by their original IDs
  // New rows have new IDs, so deleting by old IDs is completely safe
  if (oldIds.length > 0) {
    try {
      await supabase
        .from("ai_cuesheet_session_scenes")
        .delete()
        .in("id", oldIds);
    } catch {
      // Cleanup failure is non-critical — new data is preserved
      console.warn("[Session] Old rows cleanup failed, but new data is safe.");
    }
  }
}

// ─── 6. 세션 삭제 (cascade) ───────────────────────────────────────

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from("ai_cuesheet_sessions").delete().eq("id", id);
  if (error) throw error;
}

// ─── 7. 위자드 상태 자동 저장 ─────────────────────────────────────

export async function autoSaveWizardState(
  sessionId: string | null,
  state: CuesheetWizardState,
): Promise<string> {
  const programTitle = state.parseResult?.cuesheet?.program_title ?? "Untitled";
  const expertData = (state.parseResult?.cuesheet?.expert ?? { name: "", title: "" }) as { name: string; title: string; affiliation?: string };
  const sceneCount = state.parseResult?.cuesheet?.scenes.length ?? 0;
  const generatedCount = state.graphicStates.filter((g) => g.status === "done").length;

  if (!sessionId) {
    const session = await createSession({
      program_title: programTitle,
      expert_data: expertData,
      raw_input_json: state.rawJson || null,
      scene_count: sceneCount,
    });
    sessionId = session.id;
  }

  await updateSession(sessionId, {
    program_title: programTitle,
    expert_data: expertData,
    raw_input_json: state.rawJson || null,
    scene_count: sceneCount,
    generated_count: generatedCount,
  });

  if (state.parseResult?.cuesheet) {
    const htmlMap: Record<number, string> = {};
    const cssMap: Record<number, string> = {};
    for (const gs of state.graphicStates) {
      if (gs.generatedHtml) htmlMap[gs.sceneIndex] = gs.generatedHtml;
      if (gs.generatedCss) cssMap[gs.sceneIndex] = gs.generatedCss;
    }

    await saveSessionScenes(
      sessionId,
      state.parseResult.cuesheet.scenes,
      htmlMap,
      cssMap,
    );
  }

  return sessionId;
}
