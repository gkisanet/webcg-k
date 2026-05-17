/**
 * StepGraphicGenerate — 씬별 AI 그래픽 생성 (PluginEditor 스타일)
 *
 * Phase 2: iframe transform:scale() 적용.
 * 1920×1080 캔버스를 컨테이너 크기에 맞춰 자동 스케일링.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Check, Wand2, Paintbrush, RefreshCw, XCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  generateSceneGraphic,
  extractThemeFromCss,
  upsertGraphicAsOverlay,
} from "@/services/aiCuesheetService";
import { supabase } from "@/lib/supabase";
import type {
  SceneContent,
  SceneGraphicState,
  ExtractedTheme,
} from "@/lib/aiCuesheetTypes";
import { sanitizeGraphicCss } from "@/lib/aiGraphicUtils";


// ─── Props ────────────────────────────────────────────────────────

interface StepGraphicGenerateProps {
  scenes: SceneContent[];
  programTitle: string;
  graphicStates: SceneGraphicState[];
  onUpdateGraphicState: (sceneIdx: number, patch: Partial<SceneGraphicState>) => void;
  extractedThemes: Record<string, ExtractedTheme>;
  onExtractTheme: (id: string, theme: ExtractedTheme) => void;
  onBack: () => void;
  onComplete?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────

export function StepGraphicGenerate({
  scenes, programTitle, graphicStates, onUpdateGraphicState,
  extractedThemes, onExtractTheme, onBack, onComplete,
}: StepGraphicGenerateProps) {
  const navigate = useNavigate();
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [modifyPrompt, setModifyPrompt] = useState("");
  const [themeFeedback, setThemeFeedback] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [iframeScale, setIframeScale] = useState(1);

  const activeScene = scenes[activeSceneIdx];
  const activeState = graphicStates[activeSceneIdx];

  // Fetch user for overlay ownership
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // ─── iframe scale calculation (Phase 2-3) ──────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const scaleX = width / 1920;
        const scaleY = height / 1080;
        setIframeScale(Math.min(scaleX, scaleY, 1)); // never upscale
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ─── Generate Graphic ─────────────────────────────────────

  const handleGenerate = useCallback(async (sceneIdx: number, applyThemeId?: string) => {
    const scene = scenes[sceneIdx];
    if (!scene) return;

    onUpdateGraphicState(sceneIdx, { status: "generating", errorMessage: undefined });

    try {
      const appliedTheme = (applyThemeId && extractedThemes[applyThemeId]) ? extractedThemes[applyThemeId] : null;
      const result = await generateSceneGraphic(scene, programTitle, {
        extractedTheme: appliedTheme,
      });

      // Save as overlay_templates for Rundown publishing
      let overlayTemplateId: string | undefined;
      if (userId) {
        try {
          const existingId = graphicStates[sceneIdx]?.overlayTemplateId;
          const name = `Scene ${scene.order}: ${scene.trigger.slice(0, 80)}`;
          overlayTemplateId = await upsertGraphicAsOverlay(
            result.html, result.css, name, userId, existingId,
          );
        } catch (err) {
          console.warn("[Graphic] Failed to save as overlay template:", err);
        }
      }

      onUpdateGraphicState(sceneIdx, {
        status: "done",
        generatedHtml: result.html,
        generatedCss: result.css,
        appliedThemeId: applyThemeId,
        overlayTemplateId,
      });
    } catch (err: any) {
      onUpdateGraphicState(sceneIdx, {
        status: "error",
        errorMessage: err.message || "Generation failed",
      });
    }
  }, [scenes, programTitle, extractedThemes, onUpdateGraphicState]);

  // ─── Modify ───────────────────────────────────────────────

  const handleModify = useCallback(async (sceneIdx: number) => {
    const scene = scenes[sceneIdx];
    const state = graphicStates[sceneIdx];
    if (!scene || !state?.generatedHtml || !modifyPrompt.trim()) return;

    const request = modifyPrompt;
    setModifyPrompt("");
    onUpdateGraphicState(sceneIdx, { status: "generating" });

    try {
      const result = await generateSceneGraphic(scene, programTitle, {
        existingCode: { html: state.generatedHtml!, css: state.generatedCss ?? "" },
        modifyRequest: request,
      });

      // Save updated overlay
      let overlayTemplateId: string | undefined;
      if (userId) {
        try {
          const existingId = graphicStates[sceneIdx]?.overlayTemplateId;
          const name = `Scene ${scene.order}: ${scene.trigger.slice(0, 80)}`;
          overlayTemplateId = await upsertGraphicAsOverlay(
            result.html, result.css, name, userId, existingId,
          );
        } catch (err) {
          console.warn("[Graphic] Failed to update overlay template:", err);
        }
      }

      onUpdateGraphicState(sceneIdx, {
        status: "done",
        generatedHtml: result.html,
        generatedCss: result.css,
        overlayTemplateId,
      });
    } catch (err: any) {
      onUpdateGraphicState(sceneIdx, {
        status: "error",
        errorMessage: err.message || "Modify failed",
      });
    }
  }, [scenes, programTitle, graphicStates, modifyPrompt, onUpdateGraphicState]);

  // ─── Extract Theme ────────────────────────────────────────

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
      showThemeMsg(
        "CSS에서 --cg-primary, --cg-accent 등 변수를 찾을 수 없습니다. AI가 CSS Custom Properties를 사용하지 않았을 수 있습니다. Regenerate를 시도하세요.",
        "error",
      );
      return;
    }

    const themeId = `scene-${sceneIdx}-${Date.now()}`;
    onExtractTheme(themeId, theme);
    showThemeMsg("Theme extracted successfully!", "success");
  }, [graphicStates, onExtractTheme]);

  // ─── Send to Graphic Tagging ────────────────────────────

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

  // ─── Build iframe srcdoc ──────────────────────────────────

  const iframeSrcDoc = useMemo(() => {
    if (!activeState?.generatedHtml && !activeState?.generatedCss) {
      return `<html><body style="background:#0a0a0f;display:flex;align-items:center;justify-content:center;color:#888;font-family:sans-serif;font-size:14px;">Click "Generate" to create this scene's graphic</body></html>`;
    }

    const html = activeState.generatedHtml || "";
    const css = sanitizeGraphicCss(activeState.generatedCss || "");

    // Non-fullscreen → 투명 배경 강제 (OBS 오버레이 호환)
    const isFullscreen = activeScene?.text_slots.every(
      (s) => s.zone_hint === "fullscreen",
    );
    const bgOverride = !isFullscreen
      ? "body, #overlay { background: transparent !important; }"
      : "";

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1920px; height: 1080px; overflow: hidden; font-family: 'Noto Sans KR', sans-serif; }
${bgOverride}
${css}
</style>
</head>
<body>${html}</body>
</html>`;
  }, [activeState?.generatedHtml, activeState?.generatedCss, activeScene]);

  const generatedCount = graphicStates.filter((g) => g.status === "done").length;
  const errorCount = graphicStates.filter((g) => g.status === "error").length;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Scene Tabs */}
      <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-1">
        {scenes.map((scene, i) => {
          const state = graphicStates[i];
          const statusIcon = state?.status === "done"
            ? <Check size={10} className="text-green-400" />
            : state?.status === "generating"
            ? <RefreshCw size={10} className="animate-spin text-blue-400" />
            : state?.status === "error"
            ? <XCircle size={10} className="text-red-400" />
            : null;

          return (
            <button
              key={i}
              onClick={() => setActiveSceneIdx(i)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all shrink-0",
                i === activeSceneIdx
                  ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30"
                  : "bg-[var(--app-bg)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]",
              )}
            >
              {statusIcon}
              <span>Scene {scene.order}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* Left: Preview */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div
            ref={containerRef}
            className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-[var(--border-primary)] bg-black"
          >
            <div
              className="absolute"
              style={{
                width: 1920 * iframeScale,
                height: 1080 * iframeScale,
                transformOrigin: "top left",
                top: "50%",
                left: "50%",
                marginLeft: -(1920 * iframeScale) / 2,
                marginTop: -(1080 * iframeScale) / 2,
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={iframeSrcDoc}
                className="border-0"
                sandbox="allow-scripts"
                title="Graphic Preview"
                style={{ width: 1920, height: 1080, transform: `scale(${iframeScale})`, transformOrigin: "top left" }}
              />
            </div>

            {/* Generating overlay */}
            {activeState?.status === "generating" && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
                <RefreshCw size={20} className="animate-spin text-blue-400" />
                <span className="text-sm text-white">Generating...</span>
              </div>
            )}

            {/* Error overlay */}
            {activeState?.status === "error" && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4">
                <div className="text-center">
                  <XCircle size={24} className="text-red-400 mx-auto mb-2" />
                  <p className="text-xs text-red-400">{activeState.errorMessage}</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              size="sm"
              onClick={() => handleGenerate(activeSceneIdx)}
              disabled={activeState?.status === "generating"}
            >
              {activeState?.status === "done" ? (
                <><RefreshCw size={13} className="mr-1" /> Regenerate</>
              ) : (
                <><Wand2 size={13} className="mr-1" /> Generate</>
              )}
            </Button>

            {activeState?.status === "done" && (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleExtractTheme(activeSceneIdx)}
                    title="Extract theme from this graphic"
                  >
                    <Paintbrush size={13} className="mr-1" /> Extract Theme
                  </Button>
                  {themeFeedback && (
                    <span className={cn(
                      "text-[10px]",
                      themeFeedback.type === "error" ? "text-red-400" : "text-green-400",
                    )}>
                      {themeFeedback.text}
                    </span>
                  )}
                </div>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => handleSendToTagging(activeSceneIdx)}
                  className="text-green-400 hover:text-green-300"
                >
                  <ExternalLink size={13} className="mr-1" /> Send to Tagging
                </Button>
                <div className="flex items-center gap-1.5 ml-auto">
                  <input
                    type="text"
                    value={modifyPrompt}
                    onChange={(e) => setModifyPrompt(e.target.value)}
                    placeholder="Modify request..."
                    className="w-48 px-2 py-1 rounded bg-[var(--app-bg)] border border-[var(--border-primary)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    onKeyDown={(e) => { if (e.key === "Enter") handleModify(activeSceneIdx); }}
                  />
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleModify(activeSceneIdx)}
                    disabled={!modifyPrompt.trim()}
                  >
                    Apply
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Theme Panel */}
        <div className="w-56 shrink-0 flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
            Themes
          </div>

          {Object.keys(extractedThemes).length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Generate a graphic first, then click "Extract Theme" to save its color palette.
              <br /><br />
              Apply saved themes to other scenes for visual consistency.
            </p>
          ) : (
            <div className="space-y-2 overflow-y-auto">
              {Object.entries(extractedThemes).map(([id, theme]) => (
                <div
                  key={id}
                  className="p-2.5 rounded-lg bg-[var(--app-bg)] border border-[var(--border-primary)]"
                >
                  <div className="flex gap-1 mb-1.5">
                    {[theme.colors.primary, theme.colors.accent, theme.colors.background, theme.colors.text.main].map((c, ci) => (
                      <div key={ci} className="w-5 h-5 rounded ring-1 ring-white/10" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-1.5">
                    {theme.typography.fontFamily} · r={theme.layout.borderRadius}
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="w-full text-[10px] h-6"
                    onClick={() => handleGenerate(activeSceneIdx, id)}
                    disabled={activeState?.status === "generating"}
                  >
                    Apply to Scene
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft size={14} /> Back
        </Button>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>{generatedCount}/{scenes.length} generated</span>
          {errorCount > 0 && (
            <span className="text-red-400">· {errorCount} errors</span>
          )}
          {onComplete && generatedCount > 0 && (
            <Button
              size="sm"
              onClick={onComplete}
              className="ml-2 text-xs bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30"
            >
              <Check size={12} className="mr-1" /> Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
