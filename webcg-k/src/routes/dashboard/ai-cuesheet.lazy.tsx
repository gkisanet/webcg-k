/**
 * AI 큐시트 (v4) — Wizard 페이지 (Phase 2: Thin Orchestrator)
 *
 * ■ Step 1: 시스템 프롬프트 복사 (manual) / 소스 자료 입력 (api)
 * ■ Step 2: JSON ↔ GUI 토글 — 씬별 콘텐츠 검토
 * ■ Step 3: 씬별 AI 그래픽 생성 — PluginEditor 스타일
 * ■ Step 4: 런다운 생성/편집 handoff
 * ■ Step 5: PVW/PGM/render 송출 검증
 *
 * 상태 관리: useReducer (wizardReducer.ts)
 * 컴포넌트: StepSystemPrompt, StepSourceInput, StepContentReview, StepGraphicGenerate, StepRundownEdit, StepRenderVerify
 */

import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback, useRef, useMemo, useReducer } from "react";
import {
  ChevronLeft, Check, Plus, Trash2, XCircle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildSystemPrompt,
  parseAiCuesheetJson,
  generateCuesheetFromSource,
  validateAgainstSource,
  upsertGraphicAsOverlay,
  type HallucinationCheck,
} from "@/services/aiCuesheetService";
import {
  fetchSessions, deleteSession, getSession, autoSaveWizardState, updateSession,
} from "@/services/aiCuesheetSessionService";
import { supabase } from "@/lib/supabase";
import { StepSystemPrompt } from "@/components/ai-cuesheet/StepSystemPrompt";
import { StepSourceInput } from "@/components/ai-cuesheet/StepSourceInput";
import { StepContentReview } from "@/components/ai-cuesheet/StepContentReview";
import { StepGraphicGenerate } from "@/components/ai-cuesheet/StepGraphicGenerate";
import { StepRundownEdit } from "@/components/ai-cuesheet/StepRundownEdit";
import { StepRenderVerify } from "@/components/ai-cuesheet/StepRenderVerify";
import {
  wizardReducer,
  createInitialState,
} from "@/components/ai-cuesheet/wizardReducer";
import {
  analyzeAiCuesheetPublishReadiness,
  buildPartialPublishMessage,
  buildRundownOverlayInserts,
} from "@/lib/aiCuesheetPublish";
import {
  clearLocalWizardSnapshot,
  getRestorableNewSessionSnapshot,
  readLocalWizardSnapshot,
  writeLocalWizardSnapshot,
} from "@/lib/aiCuesheetLocalSnapshot";
import type {
  CuesheetWizardStep,
  CuesheetWizardState,
  SceneContent,
  SessionListRow,
} from "@/lib/aiCuesheetTypes";

export const Route = createLazyFileRoute("/dashboard/ai-cuesheet")({
  component: AiCuesheetPage,
});

// ─── Search Params ────────────────────────────────────────────────

interface AiCuesheetSearch {
  sessionId?: string;
  new?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════════════

function AiCuesheetPage() {
  const { sessionId, new: isNew } = useSearch({ from: "/dashboard/ai-cuesheet" }) as AiCuesheetSearch;

  if (!sessionId && isNew !== "1") {
    return <AiCuesheetSessionListView />;
  }

  return <AiCuesheetWizardView key={sessionId ?? "new"} />;
}

// ═══════════════════════════════════════════════════════════════════
// Session List View
// ═══════════════════════════════════════════════════════════════════

function AiCuesheetSessionListView() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions().then(setSessions).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("aiCuesheet.sessionList.deleteConfirm", "Delete this session?"))) return;
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const statusLabel = (s: SessionListRow) => {
    const map: Record<string, string> = {
      draft: t("status.draft"), in_progress: "In Progress", completed: t("status.completed"),
    };
    return map[s.status] ?? s.status;
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">
            {t("aiCuesheet.title", "AI 큐시트")}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {t("aiCuesheet.description")}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate({ search: { new: "1" } as any })}>
          <Plus size={14} />
          <span className="ml-1.5">{t("aiCuesheet.sessionList.newSession")}</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
          Loading...
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
          <Sparkles size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">{t("aiCuesheet.sessionList.empty")}</p>
          <p className="text-xs text-[var(--text-muted)]">{t("aiCuesheet.sessionList.emptyHint")}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left py-2 font-medium">Title</th>
                <th className="text-left py-2 font-medium">{t("aiCuesheet.sessionList.expert")}</th>
                <th className="text-center py-2 font-medium">{t("aiCuesheet.sessionList.status")}</th>
                <th className="text-center py-2 font-medium">{t("aiCuesheet.sessionList.scenes")}</th>
                <th className="text-center py-2 font-medium">Generated</th>
                <th className="text-right py-2 font-medium">{t("aiCuesheet.sessionList.updated")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--border-default)] hover:bg-[var(--app-bg)] cursor-pointer"
                  onClick={() => navigate({ search: { sessionId: s.id } as any })}
                >
                  <td className="py-2.5 font-medium text-[var(--text-primary)]">{s.program_title}</td>
                  <td className="py-2.5 text-[var(--text-secondary)]">{s.expert_name}</td>
                  <td className="py-2.5 text-center">
                    <span className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full",
                      s.status === "completed" ? "bg-green-500/10 text-green-400" :
                      s.status === "in_progress" ? "bg-blue-500/10 text-blue-400" :
                      "bg-gray-500/10 text-gray-400",
                    )}>
                      {statusLabel(s)}
                    </span>
                  </td>
                  <td className="py-2.5 text-center text-[var(--text-secondary)]">{s.scene_count}</td>
                  <td className="py-2.5 text-center text-[var(--text-secondary)]">{s.generated_count}</td>
                  <td className="py-2.5 text-right text-[var(--text-muted)] text-xs">
                    {new Date(s.updated_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5">
                    <button
                      className="p-1 hover:bg-red-500/10 rounded"
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    >
                      <Trash2 size={13} className="text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Wizard View — Thin Orchestrator
// ═══════════════════════════════════════════════════════════════════

const WORKFLOW_STEPS_MANUAL: CuesheetWizardStep[] = ["system-prompt", "content-review", "graphic-generate", "rundown-edit", "render-verify"];
const WORKFLOW_STEPS_API: CuesheetWizardStep[] = ["source-input", "content-review", "graphic-generate", "rundown-edit", "render-verify"];

function AiCuesheetWizardView() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const { sessionId: initialSessionId, new: isNew } = useSearch({ from: "/dashboard/ai-cuesheet" }) as AiCuesheetSearch;

  // mode: 새 세션이면 api, 재개 시에는 상태 복원 후 결정
  const [mode, setMode] = useState<"manual" | "api">(isNew === "1" ? "api" : "manual");
  const [state, dispatch] = useReducer(wizardReducer, { mode, systemPrompt: buildSystemPrompt() }, ({ mode: m, systemPrompt: sp }) =>
    createInitialState(m, sp),
  );

  const workflowSteps = mode === "manual" ? WORKFLOW_STEPS_MANUAL : WORKFLOW_STEPS_API;

  // Feedback state (not in reducer — ephemeral UI state)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [isGeneratingCuesheet, setIsGeneratingCuesheet] = useState(false);
  const [isPublishingRundown, setIsPublishingRundown] = useState(false);
  const [publishedRundownId, setPublishedRundownId] = useState<string | null>(null);

  const showToast = useCallback((text: string, type: "error" | "success" = "error") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // ─── Local snapshot restore (reload/back safety before DB session exists) ───
  const [isSnapshotRestored, setIsSnapshotRestored] = useState(false);

  useEffect(() => {
    if (initialSessionId || isNew !== "1") return;
    const snapshot = getRestorableNewSessionSnapshot(readLocalWizardSnapshot());
    if (!snapshot) return;

    dispatch({ type: "RESTORE_SESSION", data: snapshot });
    setMode(snapshot.mode);
    setSaveStatus("saved");

    const dismissed = sessionStorage.getItem("webcgk:ai-cuesheet:restore-banner-dismissed");
    if (dismissed !== "true") {
      setIsSnapshotRestored(true);
    }

    const toastShown = sessionStorage.getItem("webcgk:ai-cuesheet:restore-toast-shown");
    if (toastShown !== "true") {
      showToast("이전 AI 큐시트 작업 스냅샷을 복원했습니다.", "success");
      sessionStorage.setItem("webcgk:ai-cuesheet:restore-toast-shown", "true");
    }
  }, [initialSessionId, isNew, showToast]);

  const handleDismissBanner = useCallback(() => {
    setIsSnapshotRestored(false);
    sessionStorage.setItem("webcgk:ai-cuesheet:restore-banner-dismissed", "true");
  }, []);

  const handleResetSnapshot = useCallback(() => {
    if (!window.confirm("이전 세션 스냅샷을 완전히 삭제하고, 처음부터 다시 새로 작성하시겠습니까?")) return;

    clearLocalWizardSnapshot();
    setIsSnapshotRestored(false);
    sessionStorage.setItem("webcgk:ai-cuesheet:restore-banner-dismissed", "true");
    sessionStorage.removeItem("webcgk:ai-cuesheet:restore-toast-shown");

    // 초기화 상태로 복원
    dispatch({
      type: "RESTORE_SESSION",
      data: createInitialState(mode, buildSystemPrompt())
    });
    setSaveStatus("idle");
    showToast("이전 스냅샷이 성공적으로 초기화되었습니다.", "success");
  }, [mode, showToast]);

  // ─── Session resume ────────────────────────────────────────

  useEffect(() => {
    if (!initialSessionId) return;
    (async () => {
      try {
        const { session, scenes } = await getSession(initialSessionId);
        dispatch({ type: "SET_SESSION_ID", id: session.id });
        if (session.layout_profile) {
          dispatch({ type: "UPDATE_ZONE_PROFILE", profile: session.layout_profile as any });
        }

        const restoredScenes = scenes.map((s) => s.scene_data as SceneContent);
        const cuesheet = {
          program_title: session.program_title,
          expert: session.expert_data as any,
          scenes: restoredScenes,
        };
        dispatch({
          type: "SET_PARSE_RESULT",
          result: { cuesheet, errors: [], warnings: [] },
        });

        // rawJson: DB에 없으면 cuesheet에서 자동 생성 (Minor 3 fix)
        const rawJson = session.raw_input_json
          || JSON.stringify(cuesheet, null, 2);
        dispatch({ type: "SET_RAW_JSON", value: rawJson });

        // Session resume → API mode가 합리적 (Bug 2 fix)
        setMode(cuesheet.scenes.length > 0 ? "api" : "manual");

        dispatch({ type: "INIT_GRAPHIC_STATES", sceneCount: restoredScenes.length });
        // Restore generated HTML/CSS by loaded row index; scene_order may be non-contiguous.
        scenes.forEach((s, sceneIdx) => {
          if (s.generated_html) {
            dispatch({
              type: "UPDATE_GRAPHIC_STATE", sceneIdx,
              patch: {
                status: "done",
                generatedHtml: s.generated_html,
                generatedCss: s.generated_css ?? undefined,
                overlayTemplateId: s.overlay_template_id ?? undefined,
              },
            });
          }
        });

        dispatch({ type: "SET_STEP", step: "content-review" });
      } catch (err) {
        console.error("Session resume failed:", err);
      }
    })();
  }, [initialSessionId]);

  // ─── Debounced auto-save (문제 2) ──────────────────────────

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedRef = useRef(false);

  // graphicStates 변경 감지 → generation 완료 시 즉시 저장
  const prevDoneCountRef = useRef(0);

  useEffect(() => {
    if (!state.sourceMaterial.trim() && !state.rawJson.trim() && !state.parseResult?.cuesheet) return;
    writeLocalWizardSnapshot(state);
  }, [state]);

  useEffect(() => {
    if (!state.parseResult?.cuesheet || !state.sessionId) return;

    hasUnsavedRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    // graphic 생성 완료 시 즉시 저장 (페이지 이탈 대비)
    const doneCount = state.graphicStates.filter((g) => g.status === "done").length;
    const shouldSaveNow = doneCount > prevDoneCountRef.current;
    prevDoneCountRef.current = doneCount;

    const delay = shouldSaveNow ? 0 : 2000;

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const sid = await autoSaveWizardState(state.sessionId!, state);
        if (sid !== state.sessionId) dispatch({ type: "SET_SESSION_ID", id: sid });
        setSaveStatus("saved");
        hasUnsavedRef.current = false;
      } catch {
        setSaveStatus("error");
      }
    }, delay);

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.parseResult, state.rawJson, state.graphicStates, state.sessionId]);

  // ─── beforeunload guard (문제 2) ───────────────────────────

  useEffect(() => {
    if (!state.parseResult?.cuesheet) return;

    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.parseResult]);

  // ─── Navigation — with save ────────────────────────────────

  const goToStep = useCallback(async (nextStep: CuesheetWizardStep) => {
    dispatch({ type: "VISIT_STEP", step: nextStep });
    dispatch({ type: "SET_STEP", step: nextStep });

    const stateForSave: CuesheetWizardState = {
      ...state,
      step: nextStep,
      visitedSteps: [...state.visitedSteps, nextStep].filter((v, i, a) => a.indexOf(v) === i),
    };

    setSaveStatus("saving");
    try {
      const sid = await autoSaveWizardState(state.sessionId, stateForSave);
      if (sid !== state.sessionId) dispatch({ type: "SET_SESSION_ID", id: sid });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      showToast("저장에 실패했습니다. 네트워크 상태를 확인하세요.", "error");
    }
  }, [state, showToast]);

  // ─── Step 1 handlers ──────────────────────────────────────

  const handleGenerateCuesheet = async () => {
    setIsGeneratingCuesheet(true);
    hasUnsavedRef.current = true;
    writeLocalWizardSnapshot(state);

    try {
      const result = await generateCuesheetFromSource(state.sourceMaterial);
      const rawJson = JSON.stringify(result.cuesheet, null, 2);
      const nextStep: CuesheetWizardStep = result.cuesheet ? "content-review" : state.step;
      const nextState: CuesheetWizardState = {
        ...state,
        parseResult: result,
        rawJson,
        step: nextStep,
        visitedSteps: result.cuesheet
          ? [...state.visitedSteps, nextStep].filter((v, i, a) => a.indexOf(v) === i)
          : state.visitedSteps,
      };

      writeLocalWizardSnapshot(nextState);
      dispatch({ type: "SET_PARSE_RESULT", result });
      dispatch({ type: "SET_RAW_JSON", value: rawJson });

      if (result.cuesheet) {
        setSaveStatus("saving");
        const sid = await autoSaveWizardState(state.sessionId, nextState);
        const savedState = { ...nextState, sessionId: sid };
        writeLocalWizardSnapshot(savedState);
        if (sid !== state.sessionId) dispatch({ type: "SET_SESSION_ID", id: sid });
        dispatch({ type: "VISIT_STEP", step: "content-review" });
        dispatch({ type: "SET_STEP", step: "content-review" });
        setSaveStatus("saved");
        hasUnsavedRef.current = false;
      }
    } catch (err: any) {
      showToast(`생성 실패: ${err.message}`, "error");
    } finally {
      setIsGeneratingCuesheet(false);
    }
  };

  const handleJsonParsed = (raw: string) => {
    dispatch({ type: "SET_RAW_JSON", value: raw });
    const result = parseAiCuesheetJson(raw);
    dispatch({ type: "SET_PARSE_RESULT", result });
    return result;
  };

  // ─── Step 2 → 3 handler ──────────────────────────────────

  // ─── Hallucination checks ──────────────────────────────

  const hallucinationChecks = useMemo<HallucinationCheck[] | null>(() => {
    if (!state.parseResult?.cuesheet || !state.sourceMaterial.trim()) return null;
    return validateAgainstSource(
      state.parseResult.cuesheet.scenes,
      state.sourceMaterial,
    );
  }, [state.parseResult, state.sourceMaterial]);

  // ─── Step 2 → 3 handler ──────────────────────────────────

  const handleStartGraphicGeneration = () => {
    if (!state.parseResult?.cuesheet) return;
    dispatch({ type: "INIT_GRAPHIC_STATES", sceneCount: state.parseResult.cuesheet.scenes.length });
    goToStep("graphic-generate");
  };

  const publishGeneratedScenesToRundown = useCallback(async (): Promise<string | null> => {
    if (!state.sessionId) return null;

    const scenes = state.parseResult?.cuesheet?.scenes ?? [];
    const programTitle = state.parseResult?.cuesheet?.program_title ?? "AI 큐시트";
    const readiness = analyzeAiCuesheetPublishReadiness(scenes, state.graphicStates);

    if (readiness.readyScenes === 0) {
      showToast("발행 가능한 그래픽이 없습니다. 먼저 장면 그래픽을 생성하고 저장하세요.", "error");
      return null;
    }

    if (readiness.requiresPartialConfirmation && !window.confirm(buildPartialPublishMessage(readiness))) {
      return null;
    }

    setIsPublishingRundown(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { showToast("로그인이 필요합니다.", "error"); return null; }

      const { data: projects } = await supabase
        .from("projects").select("id").eq("owner_id", user.id).limit(1);
      let projectId = (projects as any)?.[0]?.id;
      if (!projectId) {
        const { data: newProject, error: projErr } = await supabase
          .from("projects").insert({ name: "내 프로젝트", owner_id: user.id, settings: {} } as any)
          .select("id").single();
        if (projErr) throw projErr;
        projectId = (newProject as any).id;
      }

      const { data: rundown, error: rErr } = await supabase
        .from("rundowns").insert({
          project_id: projectId, title: programTitle,
          description: `AI 큐시트 자동 생성 — ${new Date().toLocaleDateString()}`,
          created_by: user.id,
        }).select("id").single();
      if (rErr) throw rErr;
      const rundownId = (rundown as any).id;

      const publishGraphicStates = [...state.graphicStates];
      for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
        const scene = scenes[sceneIndex];
        const graphicState = publishGraphicStates[sceneIndex];
        if (graphicState?.status !== "done" || !graphicState.generatedHtml) continue;
        if (graphicState.overlayTemplateId) continue;

        const overlayTemplateId = await upsertGraphicAsOverlay(
          graphicState.generatedHtml,
          graphicState.generatedCss ?? "",
          `Scene ${scene.order}: ${scene.trigger.slice(0, 80)}`,
          user.id,
          undefined,
          scene,
          programTitle,
          state.sessionId,
        );
        publishGraphicStates[sceneIndex] = { ...graphicState, overlayTemplateId };
        dispatch({ type: "UPDATE_GRAPHIC_STATE", sceneIdx: sceneIndex, patch: { overlayTemplateId } });
      }

      const inserts = buildRundownOverlayInserts({
        scenes,
        graphicStates: publishGraphicStates,
        rundownId,
        programTitle,
      });

      const { error: itemsErr } = await supabase.from("rundown_items").insert(inserts as any);
      if (itemsErr) throw itemsErr;

      await updateSession(state.sessionId, { status: "completed" });
      setPublishedRundownId(rundownId);
      clearLocalWizardSnapshot();

      const partialSuffix = readiness.canPublishAll ? "" : ` (${readiness.totalScenes - readiness.readyScenes}개 제외)`;
      showToast(`${inserts.length}개 장면이 런다운에 발행되었습니다${partialSuffix}.`, "success");
      await goToStep("render-verify");
      return rundownId;
    } catch (err: any) {
      showToast(`발행 실패: ${err.message}`, "error");
      return null;
    } finally {
      setIsPublishingRundown(false);
    }
  }, [goToStep, showToast, state]);

  const currentReadiness = analyzeAiCuesheetPublishReadiness(
    state.parseResult?.cuesheet?.scenes ?? [],
    state.graphicStates,
  );

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ search: {} as any })} className="p-1 hover:bg-[var(--app-bg)] rounded">
            <ChevronLeft size={18} className="text-[var(--text-secondary)]" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              {state.parseResult?.cuesheet?.program_title ?? t("aiCuesheet.title", "AI 큐시트")}
            </h1>
            {state.parseResult?.cuesheet && (
              <p className="text-xs text-[var(--text-secondary)]">
                {state.parseResult.cuesheet.expert.name} — {state.parseResult.cuesheet.expert.title}
                {state.parseResult.cuesheet.expert.affiliation ? ` (${state.parseResult.cuesheet.expert.affiliation})` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus !== "idle" && (
            <span className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors",
              saveStatus === "saving" && "bg-blue-500/10 text-blue-400",
              saveStatus === "saved" && "bg-green-500/10 text-green-400",
              saveStatus === "error" && "bg-red-500/10 text-red-400",
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                saveStatus === "saving" && "bg-blue-400 animate-pulse",
                saveStatus === "saved" && "bg-green-400",
                saveStatus === "error" && "bg-red-400",
              )} />
              {saveStatus === "saving" && "Saving..."}
              {saveStatus === "saved" && "Saved"}
              {saveStatus === "error" && "Error"}
            </span>
          )}
          <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--app-bg)] text-[var(--text-muted)] capitalize">
            {mode === "manual" ? "Manual" : "API"}
          </span>
          {state.sessionId && <span className="text-[11px] text-[var(--text-muted)]">#{state.sessionId.slice(0, 8)}</span>}
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className={cn(
          "shrink-0 mb-3 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2",
          toastMessage.type === "error"
            ? "bg-red-500/15 border border-red-500/30 text-red-400"
            : "bg-green-500/15 border border-green-500/30 text-green-400",
        )}>
          <XCircle size={13} className="shrink-0" />
          {toastMessage.text}
        </div>
      )}

      {/* Snapshot Restoration Alert Banner */}
      {isSnapshotRestored && (
        <div className="shrink-0 mb-4 p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <Sparkles size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-300">
                임시 저장된 이전 작업 스냅샷이 복원되었습니다.
              </p>
              <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                브라우저 로컬 저장소(localStorage)에 남아있던 데이터입니다. 다른 PC와의 동기화 문제가 있거나, 
                현재 PC에서 <strong>&quot;scenes 배열을 추출할 수 없습니다&quot;</strong> 등의 오류가 발생한다면, 
                이전의 오염된 임시 스냅샷 데이터를 비우고 처음부터 새로 시작하시는 것을 권장합니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismissBanner}
              className="text-xs h-8 px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-default)]"
            >
              닫기
            </Button>
            <Button
              size="sm"
              onClick={handleResetSnapshot}
              className="text-xs h-8 px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-all font-medium"
            >
              스냅샷 초기화 및 새로 시작
            </Button>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <StepIndicator
        steps={workflowSteps}
        currentStep={state.step}
        labels={{
          "system-prompt": t("aiCuesheet.steps.system", "System Prompt"),
          "source-input": t("aiCuesheet.steps.source", "자료 입력"),
          "content-review": t("aiCuesheet.steps.review", "콘텐츠 검토"),
          "graphic-generate": "Graphics",
          "rundown-edit": "런다운 편집",
          "render-verify": "송출 검증",
        }}
      />

      {/* Step Content */}
      <div className="flex-1 min-h-0 mt-4">
        {state.step === "system-prompt" && (
          <StepSystemPrompt
            systemPrompt={state.systemPrompt}
            onNext={() => goToStep("content-review")}
          />
        )}
        {state.step === "source-input" && (
          <StepSourceInput
            sourceMaterial={state.sourceMaterial}
            onChange={(v) => dispatch({ type: "SET_SOURCE_MATERIAL", value: v })}
            isGenerating={isGeneratingCuesheet}
            onGenerate={handleGenerateCuesheet}
            parseError={state.parseResult?.errors?.[0] ?? null}
          />
        )}
        {state.step === "content-review" && (
          <StepContentReview
            parseResult={state.parseResult}
            rawJson={state.rawJson}
            onJsonChange={(v) => handleJsonParsed(v)}
            onBack={() => goToStep(mode === "manual" ? "system-prompt" : "source-input")}
            onNext={handleStartGraphicGeneration}
            hallucinationChecks={hallucinationChecks}
            dispatch={dispatch}
          />
        )}
        {state.step === "graphic-generate" && (
          <StepGraphicGenerate
            scenes={state.parseResult?.cuesheet?.scenes ?? []}
            programTitle={state.parseResult?.cuesheet?.program_title ?? ""}
            sessionId={state.sessionId}
            graphicStates={state.graphicStates}
            zoneProfile={state.zoneProfile}
            onUpdateZoneProfile={(profile) => dispatch({ type: "UPDATE_ZONE_PROFILE", profile })}
            onUpdateSlot={(sceneIdx, slotIdx, patch) => dispatch({ type: "UPDATE_SLOT", sceneIdx, slotIdx, patch })}
            onUpdateGraphicState={(sceneIdx, patch) =>
              dispatch({ type: "UPDATE_GRAPHIC_STATE", sceneIdx, patch })
            }
            extractedThemes={state.extractedThemes}
            onExtractTheme={(id, theme) =>
              dispatch({ type: "EXTRACT_THEME", id, theme })
            }
            onBack={() => goToStep("content-review")}
            onComplete={() => goToStep("rundown-edit")}
          />
        )}
        {state.step === "rundown-edit" && (
          <StepRundownEdit
            readiness={currentReadiness}
            isPublishing={isPublishingRundown}
            onBack={() => goToStep("graphic-generate")}
            onPublish={() => { void publishGeneratedScenesToRundown(); }}
          />
        )}
        {state.step === "render-verify" && (
          <StepRenderVerify
            rundownId={publishedRundownId}
            onBack={() => goToStep("rundown-edit")}
            onOpenRundown={() => {
              if (publishedRundownId) navigate({ to: `/dashboard/rundowns/${publishedRundownId}` });
            }}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step Indicator
// ═══════════════════════════════════════════════════════════════════

function StepIndicator({
  steps, currentStep, labels,
}: {
  steps: CuesheetWizardStep[];
  currentStep: CuesheetWizardStep;
  labels: Record<CuesheetWizardStep, string>;
}) {
  const currentIndex = Math.max(0, steps.indexOf(currentStep));

  return (
    <div className="flex items-center gap-1 shrink-0 overflow-x-auto max-w-full">
      {steps.map((s, i) => {
        const isCurrent = i === currentIndex;
        const isPast = currentIndex > i;

        return (
          <div key={s} className="flex items-center gap-1">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
              isCurrent && "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
              isPast && "bg-[var(--app-bg)] text-[var(--text-secondary)]",
              !isCurrent && !isPast && "bg-transparent text-[var(--text-muted)]",
            )}>
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                isPast ? "bg-green-500/20 text-green-400" :
                isCurrent ? "bg-blue-500/30 text-blue-400" :
                "bg-[var(--border-default)] text-[var(--text-muted)]",
              )}>
                {isPast ? <Check size={10} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{labels[s] || s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                "w-6 h-px",
                isPast ? "bg-green-500/40" : "bg-[var(--border-default)]",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export { AiCuesheetPage };
