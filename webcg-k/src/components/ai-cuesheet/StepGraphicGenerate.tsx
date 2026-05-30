/**
 * StepGraphicGenerate — 씬별 AI HTML 방송 그래픽 생성/수정 작업대
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import Editor from "@monaco-editor/react";
import {
  ChevronLeft, Check, Wand2, Paintbrush, RefreshCw, XCircle, ExternalLink, Info,
  Grid3X3, Code2, Save, X, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { generateSceneGraphic, extractThemeFromCss } from "@/services/aiCuesheetService";
import { fetchGridTemplates, type GridTemplate } from "@/services/gridTemplateService";
import type {
  SceneContent,
  SceneGraphicState,
  ExtractedTheme,
  TextSlot,
  ZoneHint,
  StyleHint,
} from "@/lib/aiCuesheetTypes";
import { sanitizeGraphicCss } from "@/lib/aiGraphicUtils";
import { runMonacoHistoryAction } from "@/lib/monacoHistory";
import type { AiCuesheetZoneProfile } from "@/lib/aiCuesheetZoneProfile";
import {
  AI_CUESHEET_ZONE_ORDER,
  applyGridTemplateToZoneProfile,
  DEFAULT_AI_CUESHEET_ZONE_PROFILE,
  getZoneDefinition,
} from "@/lib/aiCuesheetZoneProfile";

interface StepGraphicGenerateProps {
  scenes: SceneContent[];
  programTitle: string;
  sessionId?: string | null;
  graphicStates: SceneGraphicState[];
  zoneProfile: AiCuesheetZoneProfile;
  onUpdateZoneProfile: (profile: AiCuesheetZoneProfile) => void;
  onUpdateGraphicState: (sceneIdx: number, patch: Partial<SceneGraphicState>) => void;
  onUpdateSlot: (sceneIdx: number, slotIdx: number, patch: Partial<TextSlot>) => void;
  extractedThemes: Record<string, ExtractedTheme>;
  onExtractTheme: (id: string, theme: ExtractedTheme) => void;
  onBack: () => void;
  onComplete?: () => void;
}

type CodeTab = "html" | "css";

const ZONES: ZoneHint[] = ["bottom_bar", "top_bar", "center", "left_third", "fullscreen"];
const STYLES: StyleHint[] = ["emphasis", "normal", "muted"];

export function StepGraphicGenerate({
  scenes, programTitle, graphicStates, zoneProfile, onUpdateZoneProfile, onUpdateGraphicState, onUpdateSlot,
  extractedThemes, onExtractTheme, onBack, onComplete,
}: StepGraphicGenerateProps) {
  const navigate = useNavigate();
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [rightTab, setRightTab] = useState<"info" | "themes">("info");
  const [modifyPrompt, setModifyPrompt] = useState("");
  const [themeFeedback, setThemeFeedback] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const codeEditorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [iframeScale, setIframeScale] = useState(1);
  const [gridTemplates, setGridTemplates] = useState<GridTemplate[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [codeTab, setCodeTab] = useState<CodeTab>("html");
  const [codeDraft, setCodeDraft] = useState({ html: "", css: "" });

  const activeScene = scenes[activeSceneIdx];
  const activeState = graphicStates[activeSceneIdx];

  useEffect(() => {
    setGridLoading(true);
    fetchGridTemplates()
      .then(setGridTemplates)
      .catch((err) => console.warn("[AI Cuesheet] Failed to load grid templates", err))
      .finally(() => setGridLoading(false));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setIframeScale(Math.min(width / 1920, height / 1080, 1));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleGenerate = useCallback(async (sceneIdx: number, applyThemeId?: string) => {
    const scene = scenes[sceneIdx];
    if (!scene) return;
    onUpdateGraphicState(sceneIdx, { status: "generating", errorMessage: undefined });
    try {
      const appliedTheme = (applyThemeId && extractedThemes[applyThemeId]) ? extractedThemes[applyThemeId] : null;
      const result = await generateSceneGraphic(scene, programTitle, { extractedTheme: appliedTheme, zoneProfile });
      onUpdateGraphicState(sceneIdx, {
        status: "done",
        generatedHtml: result.html,
        generatedCss: result.css,
        appliedThemeId: applyThemeId,
        overlayTemplateId: undefined,
      });
    } catch (err: any) {
      onUpdateGraphicState(sceneIdx, { status: "error", errorMessage: err.message || "Generation failed" });
    }
  }, [scenes, programTitle, extractedThemes, zoneProfile, onUpdateGraphicState]);

  const handleModify = useCallback(async (sceneIdx: number) => {
    const scene = scenes[sceneIdx];
    const state = graphicStates[sceneIdx];
    if (!scene || !state?.generatedHtml || !modifyPrompt.trim()) return;
    const request = modifyPrompt;
    setModifyPrompt("");
    onUpdateGraphicState(sceneIdx, { status: "generating" });
    try {
      const result = await generateSceneGraphic(scene, programTitle, {
        existingCode: { html: state.generatedHtml, css: state.generatedCss ?? "" },
        modifyRequest: request,
        zoneProfile,
      });
      onUpdateGraphicState(sceneIdx, {
        status: "done",
        generatedHtml: result.html,
        generatedCss: result.css,
        overlayTemplateId: undefined,
      });
    } catch (err: any) {
      onUpdateGraphicState(sceneIdx, { status: "error", errorMessage: err.message || "Modify failed" });
    }
  }, [scenes, programTitle, graphicStates, modifyPrompt, zoneProfile, onUpdateGraphicState]);

  const showThemeMsg = (text: string, type: "error" | "success") => {
    setThemeFeedback({ text, type });
    setTimeout(() => setThemeFeedback(null), type === "error" ? 6000 : 2000);
  };

  const handleExtractTheme = useCallback((sceneIdx: number) => {
    const state = graphicStates[sceneIdx];
    if (!state?.generatedCss) {
      showThemeMsg("생성된 CSS가 없습니다. 먼저 Generate하세요.", "error");
      return;
    }
    const theme = extractThemeFromCss(state.generatedCss);
    if (!theme) {
      showThemeMsg("CSS에서 --cg-primary, --cg-accent 등 변수를 찾을 수 없습니다. Regenerate를 시도하세요.", "error");
      return;
    }
    const themeId = `scene-${sceneIdx}-${Date.now()}`;
    onExtractTheme(themeId, theme);
    showThemeMsg("Theme extracted successfully!", "success");
  }, [graphicStates, onExtractTheme]);

  const handleSendToTagging = useCallback((sceneIdx: number) => {
    const scene = scenes[sceneIdx];
    const state = graphicStates[sceneIdx];
    if (!scene || !state?.generatedHtml) return;
    sessionStorage.setItem("graphic-tagging:scene", JSON.stringify({
      html: state.generatedHtml,
      css: state.generatedCss ?? "",
      programTitle,
      scene,
    }));
    navigate({ to: "/dashboard/graphic-tagging" });
  }, [scenes, programTitle, graphicStates, navigate]);

  const handleGridTemplateSelect = (templateId: string) => {
    if (!templateId || templateId === "__reset__") {
      onUpdateZoneProfile({ ...DEFAULT_AI_CUESHEET_ZONE_PROFILE, updatedAt: new Date().toISOString() });
      return;
    }
    const template = gridTemplates.find((g) => g.id === templateId);
    if (!template) return;
    onUpdateZoneProfile(applyGridTemplateToZoneProfile(template, zoneProfile));
  };

  const updateZoneBounds = (zone: ZoneHint, field: "x" | "y" | "width" | "height", value: number) => {
    const current = getZoneDefinition(zoneProfile, zone);
    onUpdateZoneProfile({
      ...zoneProfile,
      zones: {
        ...zoneProfile.zones,
        [zone]: {
          ...current,
          bounds: { ...current.bounds, [field]: Math.max(0, Math.round(value || 0)) },
        },
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const openCodeEditor = () => {
    setCodeDraft({ html: activeState?.generatedHtml ?? "", css: activeState?.generatedCss ?? "" });
    setCodeTab("html");
    setCodeEditorOpen(true);
  };

  const applyCodeDraft = () => {
    onUpdateGraphicState(activeSceneIdx, {
      status: "done",
      generatedHtml: codeDraft.html,
      generatedCss: codeDraft.css,
      overlayTemplateId: undefined,
    });
    setCodeEditorOpen(false);
  };

  const handleCodeEditorUndo = () => {
    runMonacoHistoryAction(codeEditorRef.current, "undo");
  };

  const handleCodeEditorRedo = () => {
    runMonacoHistoryAction(codeEditorRef.current, "redo");
  };

  const iframeSrcDoc = useMemo(() => {
    if (!activeState?.generatedHtml && !activeState?.generatedCss) {
      return `<html><body style="background:#0a0a0f;display:flex;align-items:center;justify-content:center;color:#888;font-family:sans-serif;font-size:14px;">Click "Generate" to create this scene's graphic</body></html>`;
    }
    const html = activeState.generatedHtml || "";
    const css = sanitizeGraphicCss(activeState.generatedCss || "");
    const isFullscreen = activeScene?.text_slots.every((s) => s.zone_hint === "fullscreen");
    const bgOverride = !isFullscreen ? "body, #overlay { background: transparent !important; }" : "";
    return `<!DOCTYPE html>
<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none';"><style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1920px; height: 1080px; overflow: hidden; font-family: 'Noto Sans KR', sans-serif; }
${bgOverride}
${css}
</style></head><body>${html}</body></html>`;
  }, [activeState?.generatedHtml, activeState?.generatedCss, activeScene]);

  const generatedCount = graphicStates.filter((g) => g.status === "done").length;
  const errorCount = graphicStates.filter((g) => g.status === "error").length;

  if (!activeScene) return <div className="text-sm text-[var(--text-muted)]">No scenes available.</div>;

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-1">
        {scenes.map((scene, i) => {
          const state = graphicStates[i];
          const statusIcon = state?.status === "done" ? <Check size={10} className="text-green-400" /> : state?.status === "generating" ? <RefreshCw size={10} className="animate-spin text-blue-400" /> : state?.status === "error" ? <XCircle size={10} className="text-red-400" /> : null;
          return (
            <button key={i} onClick={() => setActiveSceneIdx(i)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all shrink-0", i === activeSceneIdx ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30" : "bg-[var(--app-bg)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]")}>
              {statusIcon}<span>Scene {scene.order}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div ref={containerRef} className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-[var(--border-default)] bg-black">
            <div className="absolute" style={{ width: 1920 * iframeScale, height: 1080 * iframeScale, transformOrigin: "top left", top: "50%", left: "50%", marginLeft: -(1920 * iframeScale) / 2, marginTop: -(1080 * iframeScale) / 2 }}>
              <iframe ref={iframeRef} srcDoc={iframeSrcDoc} className="border-0" sandbox="allow-scripts" title="Graphic Preview" style={{ width: 1920, height: 1080, transform: `scale(${iframeScale})`, transformOrigin: "top left" }} />
            </div>
            {activeState?.status === "generating" && <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2"><RefreshCw size={20} className="animate-spin text-blue-400" /><span className="text-sm text-white">Generating...</span></div>}
            {activeState?.status === "error" && <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4"><div className="text-center"><XCircle size={24} className="text-red-400 mx-auto mb-2" /><p className="text-xs text-red-400">{activeState.errorMessage}</p></div></div>}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button size="sm" onClick={() => handleGenerate(activeSceneIdx)} disabled={activeState?.status === "generating"}>{activeState?.status === "done" ? <><RefreshCw size={13} className="mr-1" /> Regenerate</> : <><Wand2 size={13} className="mr-1" /> Generate</>}</Button>
            {activeState?.status === "done" && <>
              <Button size="sm" variant="ghost" onClick={openCodeEditor} title="HTML/CSS를 직접 미세 수정"><Code2 size={13} className="mr-1" /> Code Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => handleExtractTheme(activeSceneIdx)} title="Extract theme from this graphic"><Paintbrush size={13} className="mr-1" /> Extract Theme</Button>
              {themeFeedback && <span className={cn("text-[10px]", themeFeedback.type === "error" ? "text-red-400" : "text-green-400")}>{themeFeedback.text}</span>}
              <Button size="sm" variant="ghost" onClick={() => handleSendToTagging(activeSceneIdx)} className="text-green-400 hover:text-green-300"><ExternalLink size={13} className="mr-1" /> Send to Workbench</Button>
              <div className="flex items-center gap-1.5 ml-auto"><input type="text" value={modifyPrompt} onChange={(e) => setModifyPrompt(e.target.value)} placeholder="Modify request..." className="w-48 px-2 py-1 rounded bg-[var(--app-bg)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" onKeyDown={(e) => { if (e.key === "Enter") handleModify(activeSceneIdx); }} /><Button size="sm" variant="ghost" onClick={() => handleModify(activeSceneIdx)} disabled={!modifyPrompt.trim()}>Apply</Button></div>
            </>}
          </div>
        </div>

        <div className="w-96 shrink-0 flex flex-col gap-3 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-xl p-3 min-h-0">
          <div className="flex bg-[var(--app-bg)] p-1 rounded-lg border border-[var(--border-default)] shrink-0">
            <button onClick={() => setRightTab("info")} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1", rightTab === "info" ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}><Info size={11} /><span>Scene Info</span></button>
            <button onClick={() => setRightTab("themes")} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1", rightTab === "themes" ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}><Paintbrush size={11} /><span>Themes</span></button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {rightTab === "info" ? <div className="space-y-3 pr-1 text-left">
              <div className="space-y-2"><div className="flex justify-between items-center text-[11px] text-[var(--text-muted)] border-b border-[var(--border-default)] pb-1.5"><span>Scene Order</span><span className="font-semibold text-[var(--text-primary)]">#{activeScene.order}</span></div>{activeScene.graphic_type && <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)] border-b border-[var(--border-default)] pb-1.5"><span>Type</span><span className="px-1.5 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-400 font-mono">{activeScene.graphic_type}</span></div>}</div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider"><Grid3X3 size={12} /> Session Zones</div>{zoneProfile.gridTemplateId ? <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium truncate max-w-[160px]">{zoneProfile.name}</span> : <span className="text-[9px] text-[var(--text-muted)]">{zoneProfile.name}</span>}</div>
                <div className="space-y-1.5 p-1.5 rounded-lg bg-[var(--app-bg)]"><Select value={zoneProfile.gridTemplateId ?? ""} onValueChange={(val) => handleGridTemplateSelect(val)} disabled={gridLoading}><SelectTrigger className="w-full h-7 text-[10px] bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)] px-2"><SelectValue placeholder={gridLoading ? "Loading grids..." : "기본값 (표준 Zone)"} /></SelectTrigger><SelectContent position="popper" sideOffset={4} className="bg-[var(--app-bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)]"><SelectItem value="__reset__" className="text-[10px] text-[var(--text-muted)]">↺ 기본값으로 초기화</SelectItem>{gridTemplates.map((template) => <SelectItem key={template.id} value={template.id} className="text-[10px]">{template.name}</SelectItem>)}</SelectContent></Select>
                <div className="space-y-1.5">{AI_CUESHEET_ZONE_ORDER.filter((zone) => zone !== "fullscreen").map((zone) => { const def = getZoneDefinition(zoneProfile, zone); return <div key={zone} className="rounded border border-[var(--border-default)]/60 bg-[var(--bg-secondary)] p-1"><div className="flex items-center justify-between mb-1"><span className="text-[9px] font-mono text-blue-300">{zone}</span><span className="text-[8px] text-[var(--text-muted)] truncate max-w-[120px]">{def.sourceZoneName ?? "session"}</span></div><div className="grid grid-cols-4 gap-1">{(["x", "y", "width", "height"] as const).map((field) => <label key={field} className="text-[8px] text-[var(--text-muted)]">{field}<input type="number" value={def.bounds[field]} onChange={(e) => updateZoneBounds(zone, field, Number(e.target.value))} className="mt-0.5 w-full rounded bg-black/20 border border-[var(--border-default)] px-1.5 py-0.5 text-[9px] text-[var(--text-primary)]" /></label>)}</div></div>; })}</div></div>
              </div>

              <div className="space-y-1"><div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Trigger Timing</div><div className="p-2 rounded-lg bg-[var(--app-bg)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] leading-relaxed">{activeScene.trigger}</div></div>
              <div className="space-y-1"><div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Design Intent</div><div className="p-2 rounded-lg bg-[var(--app-bg)] border border-[var(--border-default)] text-xs text-[var(--text-secondary)] leading-relaxed">{activeScene.graphic_intent}</div></div>
              <div className="space-y-1"><div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Text Slots ({activeScene.text_slots.length})</div><div className="space-y-1.5">{activeScene.text_slots.map((slot, slotIdx) => { const displayVal = slot.display_value ?? slot.value; return <div key={slot.id ?? slotIdx} className="p-1.5 rounded-lg bg-[var(--app-bg)] space-y-1 text-left"><div className="flex items-center flex-wrap gap-1"><span className="px-1.5 py-0.5 rounded text-[9px] bg-gray-500/10 text-gray-400 font-mono">{slot.semantic_role}</span></div><div className="text-[11px] text-[var(--text-primary)] font-medium leading-relaxed bg-[var(--bg-secondary)] p-1.5 rounded border border-[var(--border-default)] break-all">{displayVal}</div><div className="grid grid-cols-[1fr_1fr_auto] gap-1.5"><Select value={slot.zone_hint} onValueChange={(val) => onUpdateSlot(activeSceneIdx, slotIdx, { zone_hint: val as ZoneHint })}><SelectTrigger className="w-full h-7 text-xs bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)] px-2"><SelectValue /></SelectTrigger><SelectContent position="popper" sideOffset={4} className="bg-[var(--app-bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)]">{ZONES.map((z) => <SelectItem key={z} value={z} className="text-xs">{z}</SelectItem>)}</SelectContent></Select><Select value={slot.style_hint} onValueChange={(val) => onUpdateSlot(activeSceneIdx, slotIdx, { style_hint: val as StyleHint })}><SelectTrigger className="w-full h-7 text-xs bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)] px-2"><SelectValue /></SelectTrigger><SelectContent position="popper" sideOffset={4} className="bg-[var(--app-bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)]">{STYLES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent></Select><Select value={String(slot.importance)} onValueChange={(val) => onUpdateSlot(activeSceneIdx, slotIdx, { importance: Number(val) })}><SelectTrigger className="w-full h-7 text-xs bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)] px-2 min-w-[72px]"><SelectValue /></SelectTrigger><SelectContent position="popper" sideOffset={4} className="bg-[var(--app-bg-secondary)] border-[var(--border-default)] text-[var(--text-primary)]">{[1, 2, 3, 4, 5].map((v) => <SelectItem key={v} value={String(v)} className="text-xs">imp {v}</SelectItem>)}</SelectContent></Select></div></div>; })}</div></div>
            </div> : <div className="space-y-3">{Object.keys(extractedThemes).length === 0 ? <p className="text-[11px] text-[var(--text-muted)] leading-relaxed text-left">Generate a graphic first, then click Extract Theme to save its color palette.</p> : <div className="space-y-2">{Object.entries(extractedThemes).map(([id, theme]) => <div key={id} className="p-2.5 rounded-lg bg-[var(--app-bg)] border border-[var(--border-default)] text-left"><div className="flex gap-1 mb-1.5">{[theme.colors.primary, theme.colors.accent, theme.colors.background, theme.colors.text.main].map((c, ci) => <div key={ci} className="w-5 h-5 rounded ring-1 ring-white/10" style={{ backgroundColor: c }} />)}</div><div className="text-[10px] text-[var(--text-muted)] mb-1.5">{theme.typography.fontFamily} · r={theme.layout.borderRadius}</div><Button size="sm" variant="ghost" className="w-full text-[10px] h-6" onClick={() => handleGenerate(activeSceneIdx, id)} disabled={activeState?.status === "generating"}>Apply to Scene</Button></div>)}</div>}</div>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between shrink-0"><Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft size={14} /> Back</Button><div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]"><span>{generatedCount}/{scenes.length} generated</span>{errorCount > 0 && <span className="text-red-400">· {errorCount} errors</span>}{onComplete && generatedCount > 0 && <Button size="sm" onClick={onComplete} className="ml-2 text-xs bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30"><Check size={12} className="mr-1" /> 런다운 편집으로</Button>}</div></div>

      {codeEditorOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-[min(1180px,96vw)] h-[min(760px,90vh)] rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] shadow-2xl flex flex-col overflow-hidden">
            <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Code2 size={16} /> HTML 방송 그래픽 코드 수정
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-[var(--app-bg)] p-0.5 rounded-md">
                  {(["html", "css"] as CodeTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setCodeTab(tab)}
                      className={cn(
                        "px-3 py-1 rounded text-xs uppercase",
                        codeTab === tab ? "bg-[var(--bg-primary)] text-[var(--text-primary)]" : "text-[var(--text-muted)]",
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="ghost" onClick={handleCodeEditorUndo} title="되돌리기 (Ctrl+Z)" aria-label="되돌리기">
                  <Undo2 size={13} />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCodeEditorRedo} title="다시 실행 (Ctrl+Y / Ctrl+Shift+Z)" aria-label="다시 실행">
                  <Redo2 size={13} />
                </Button>
                <Button size="sm" onClick={applyCodeDraft}>
                  <Save size={13} className="mr-1" /> Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCodeEditorOpen(false)}>
                  <X size={14} />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 grid grid-cols-[1fr_420px]">
              <Editor
                height="100%"
                language={codeTab === "html" ? "html" : "css"}
                value={codeDraft[codeTab]}
                onChange={(value) => setCodeDraft((prev) => ({ ...prev, [codeTab]: value ?? "" }))}
                onMount={(editor) => {
                  codeEditorRef.current = editor;
                }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                  tabSize: 2,
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                }}
              />
              <iframe
                title="Code edit preview"
                className="w-full h-full border-l border-[var(--border-default)] bg-black"
                sandbox="allow-scripts"
                srcDoc={`<!DOCTYPE html><html><head><style>*{box-sizing:border-box;margin:0;padding:0}body{width:1920px;height:1080px;overflow:hidden;font-family:sans-serif}${sanitizeGraphicCss(codeDraft.css)}</style></head><body>${codeDraft.html}</body></html>`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
