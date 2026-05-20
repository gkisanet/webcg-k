import { useState } from "react";
import {
  ChevronLeft, ChevronRight, Code, Layout, XCircle, AlertTriangle,
  Plus, Trash2, FileText, BookOpen,
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
import type { ParseResult, SceneContent, TextSlot, ZoneHint, StyleHint } from "@/lib/aiCuesheetTypes";
import type { HallucinationCheck } from "@/services/aiCuesheetService";
import { sanitizeTextValue } from "@/lib/aiGraphicUtils";
import { SEMANTIC_ROLE_DEFS } from "@/lib/semanticRoleDefs";
import type { WizardAction } from "@/components/ai-cuesheet/wizardReducer";

// ─── Constants ────────────────────────────────────────────────────

const ZONES: ZoneHint[] = ["bottom_bar", "top_bar", "center", "left_third", "fullscreen"];
const STYLES: StyleHint[] = ["emphasis", "normal", "muted"];

// ─── Props ────────────────────────────────────────────────────────

interface StepContentReviewProps {
  parseResult: ParseResult | null;
  rawJson: string;
  onJsonChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  hallucinationChecks?: HallucinationCheck[] | null;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Main Component ───────────────────────────────────────────────

export function StepContentReview({
  parseResult, rawJson, onJsonChange, onBack, onNext, hallucinationChecks, dispatch,
}: StepContentReviewProps) {
  const [viewMode, setViewMode] = useState<"gui" | "json">("gui");
  const [contextMode, setContextMode] = useState(false); // 문제 3: 요약/부연설명 토글
  const scenes = parseResult?.cuesheet?.scenes ?? [];

  const lowConfidenceCount = hallucinationChecks?.filter((c) => c.confidence < 0.5).length ?? 0;
  const hasAnyContext = scenes.some((s) => s.text_slots.some((sl) => sl.context));

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">2. 콘텐츠 검토</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {scenes.length}개 장면
            {hallucinationChecks && hallucinationChecks.length > 0 && (
              lowConfidenceCount > 0
                ? <span className="text-amber-400 ml-1">— {lowConfidenceCount}개 값 확인 필요</span>
                : <span className="text-green-400 ml-1">— 모든 값이 원본에서 확인됨</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Context toggle (문제 3) */}
          {hasAnyContext && (
            <button
              onClick={() => setContextMode(!contextMode)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] transition-all",
                contextMode
                  ? "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30"
                  : "bg-[var(--app-bg)] text-[var(--text-muted)]",
              )}
            >
              {contextMode ? <BookOpen size={12} /> : <FileText size={12} />}
              {contextMode ? "부연설명" : "요약"}
            </button>
          )}

          {/* JSON / GUI toggle */}
          <div className="flex bg-[var(--app-bg)] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("gui")}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs transition-all",
                viewMode === "gui"
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] ring-1 ring-[var(--border-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
              )}
            >
              <Layout size={13} /> GUI
            </button>
            <button
              onClick={() => setViewMode("json")}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs transition-all",
                viewMode === "json"
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] ring-1 ring-[var(--border-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
              )}
            >
              <Code size={13} /> JSON
            </button>
          </div>
        </div>
      </div>

      {/* Errors / Warnings */}
      {parseResult && (parseResult.errors.length > 0 || parseResult.warnings.length > 0) && (
        <div className="shrink-0 space-y-1">
          {parseResult.errors.map((e, i) => (
            <div key={`e${i}`} className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
              <XCircle size={12} className="shrink-0 mt-0.5" /> {e}
            </div>
          ))}
          {parseResult.warnings.map((w, i) => (
            <div key={`w${i}`} className="flex items-start gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[11px]">
              <XCircle size={12} className="shrink-0 mt-0.5" /> {w}
            </div>
          ))}
        </div>
      )}

      {/* Hallucination Warnings */}
      {viewMode === "gui" && hallucinationChecks && lowConfidenceCount > 0 && (
        <div className="shrink-0 space-y-1 max-h-32 overflow-y-auto">
          {hallucinationChecks.filter((c) => c.warning).map((c, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 p-2 rounded text-[11px]",
                c.confidence === 0
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-400",
              )}
            >
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span><strong>Scene {c.sceneIdx + 1}</strong>: "{c.value}" — {c.warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {viewMode === "json" ? (
          <textarea
            value={rawJson}
            onChange={(e) => onJsonChange(e.target.value)}
            className="w-full h-full min-h-[300px] p-3 rounded-lg bg-[var(--app-bg)] border border-[var(--border-primary)] text-[var(--text-primary)] text-xs font-mono leading-relaxed resize-y"
            placeholder="Paste JSON here..."
          />
        ) : scenes.length > 0 ? (
          <SceneContentCards
            scenes={scenes}
            hallucinationChecks={hallucinationChecks}
            dispatch={dispatch}
            contextMode={contextMode}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--text-muted)] text-xs gap-2">
            <Code size={24} />
            <p>No scene data. Generate or paste JSON first.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft size={14} /> Back
        </Button>
        <Button size="sm" onClick={onNext} disabled={scenes.length === 0}>
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Scene Cards ──────────────────────────────────────────────────

function SceneContentCards({
  scenes, hallucinationChecks, dispatch, contextMode,
}: {
  scenes: SceneContent[];
  hallucinationChecks?: HallucinationCheck[] | null;
  dispatch: React.Dispatch<WizardAction>;
  contextMode: boolean;
}) {
  const getHallucination = (sceneIdx: number, slotIdx: number) =>
    hallucinationChecks?.find((c) => c.sceneIdx === sceneIdx && c.slotIdx === slotIdx);

  return (
    <div className="space-y-3">
      {scenes.map((scene, si) => (
        <div key={si} className="p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-primary)]">
          {/* Scene Header — editable */}
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 shrink-0">
              Scene {scene.order}
            </span>

            <input
              value={scene.trigger}
              onChange={(e) => dispatch({ type: "UPDATE_SCENE", sceneIdx: si, patch: { trigger: e.target.value } })}
              className="flex-1 bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none border-b border-transparent hover:border-[var(--border-primary)] focus:border-blue-500/50 px-1 py-0.5 min-w-0"
            />

            <input
              type="number"
              value={scene.duration}
              onChange={(e) => dispatch({ type: "UPDATE_SCENE", sceneIdx: si, patch: { duration: Math.max(1, parseInt(e.target.value) || 15) } })}
              className="w-12 text-center bg-[var(--bg-primary)] text-[10px] text-[var(--text-muted)] rounded px-1 py-0.5 outline-none border border-transparent hover:border-[var(--border-primary)] focus:border-blue-500/50"
              min={1} max={120}
            />
            <span className="text-[10px] text-[var(--text-muted)]">s</span>

            {/* Delete scene */}
            <button
              onClick={() => dispatch({ type: "REMOVE_SCENE", sceneIdx: si })}
              className="p-0.5 hover:bg-red-500/10 rounded shrink-0"
              title="Remove scene"
            >
              <Trash2 size={11} className="text-red-400/60 hover:text-red-400" />
            </button>
          </div>

          {/* graphic_intent — editable */}
          <input
            value={scene.graphic_intent}
            onChange={(e) => dispatch({ type: "UPDATE_SCENE", sceneIdx: si, patch: { graphic_intent: e.target.value } })}
            placeholder="그래픽 의도..."
            className="w-full bg-transparent text-[11px] text-[var(--text-secondary)] mb-2.5 outline-none border-b border-transparent hover:border-[var(--border-primary)] focus:border-blue-500/50 px-1 py-0.5 leading-relaxed"
          />

          {/* Text Slots Table */}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[var(--text-muted)] border-b border-[var(--border-primary)]">
                <th className="text-left py-1 font-medium w-24">Role</th>
                <th className="text-left py-1 font-medium">Value</th>
                <th className="text-center py-1 font-medium w-8">Imp</th>
                <th className="text-left py-1 font-medium w-24">Zone</th>
                <th className="text-left py-1 font-medium w-20">Style</th>
                <th className="w-5" />
              </tr>
            </thead>
            <tbody>
              {scene.text_slots.map((slot, sj) => (
                <SlotRow
                  key={sj}
                  slot={slot}
                  sceneIdx={si}
                  slotIdx={sj}
                  dispatch={dispatch}
                  hallCheck={getHallucination(si, sj)}
                  contextMode={contextMode}
                />
              ))}
            </tbody>
          </table>

          {/* Context display (문제 3) */}
          {contextMode && scene.text_slots.some((s) => s.context) && (
            <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-2">
              {scene.text_slots.filter((s) => s.context).map((slot, sj) => (
                <div key={sj} className="text-[10px]">
                  <span className="font-semibold text-purple-400/80">
                    [{slot.semantic_role}] {slot.value}
                  </span>
                  <p className="text-[var(--text-muted)] mt-0.5 leading-relaxed">
                    📖 {slot.context}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Add slot button */}
          <button
            onClick={() => dispatch({ type: "ADD_SLOT", sceneIdx: si })}
            className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <Plus size={10} /> Add text slot
          </button>
        </div>
      ))}

      {/* Add scene button */}
      <button
        onClick={() => dispatch({ type: "ADD_SCENE" })}
        className="w-full py-2.5 rounded-xl border border-dashed border-[var(--border-primary)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--text-secondary)]/30 transition-colors flex items-center justify-center gap-1.5"
      >
        <Plus size={12} /> Add Scene
      </button>
    </div>
  );
}

// ─── Editable Slot Row ────────────────────────────────────────────

function SlotRow({
  slot, sceneIdx, slotIdx, dispatch, hallCheck, contextMode,
}: {
  slot: TextSlot; sceneIdx: number; slotIdx: number;
  dispatch: React.Dispatch<WizardAction>;
  hallCheck?: HallucinationCheck;
  contextMode: boolean;
}) {
  const { warning } = sanitizeTextValue(slot.value);
  const isHallucination = hallCheck && hallCheck.confidence === 0;
  const isLowConfidence = hallCheck && hallCheck.confidence > 0 && hallCheck.confidence < 0.5;

  const update = (patch: Partial<TextSlot>) =>
    dispatch({ type: "UPDATE_SLOT", sceneIdx, slotIdx, patch });

  return (
    <>
      <tr className={cn(
        "border-b border-[var(--border-primary)]/30 group",
        isHallucination && "bg-red-500/5",
        isLowConfidence && "bg-amber-500/5",
      )}>
        {/* Role select */}
        <td className="py-1">
          <Select value={slot.semantic_role} onValueChange={(v) => update({ semantic_role: v })}>
            <SelectTrigger className="w-full h-5 min-h-5 px-1 py-0 text-[10px] border-[var(--border-primary)]/50 bg-transparent text-[var(--text-primary)] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-primary)]">
              {SEMANTIC_ROLE_DEFS.map((d) => (
                <SelectItem key={d.role} value={d.role} className="text-[10px] py-1 px-1.5">{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* Value input */}
        <td className="py-1">
          <div className="flex items-center gap-0.5">
            <input
              value={slot.value}
              onChange={(e) => update({ value: e.target.value, display_value: e.target.value })}
              className="flex-1 bg-transparent font-medium text-[var(--text-primary)] text-[11px] outline-none border-b border-transparent hover:border-[var(--border-primary)] focus:border-blue-500/50 px-0.5 py-0.5 min-w-0"
            />
            {warning && <span className="text-[10px] text-amber-400 shrink-0" title={warning}>⚠</span>}
            {hallCheck?.warning && (
              <span className={cn("text-[10px] shrink-0", isHallucination ? "text-red-400" : "text-amber-400")} title={hallCheck.warning}>
                {isHallucination ? "🛑" : "⚠"}
              </span>
            )}
          </div>
        </td>

        {/* Importance select */}
        <td className="py-1 text-center">
          <Select value={String(slot.importance)} onValueChange={(v) => update({ importance: parseInt(v) })}>
            <SelectTrigger className="w-full h-5 min-h-5 px-1 py-0 text-[10px] border-[var(--border-primary)]/50 bg-transparent text-[var(--text-muted)] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-primary)]">
              {[1, 2, 3, 4, 5].map((v) => (
                <SelectItem key={v} value={String(v)} className="text-[10px] py-1 px-1.5">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* Zone select */}
        <td className="py-1">
          <Select value={slot.zone_hint} onValueChange={(v) => update({ zone_hint: v as ZoneHint })}>
            <SelectTrigger className="w-full h-5 min-h-5 px-1 py-0 text-[10px] border-[var(--border-primary)]/50 bg-transparent text-[var(--text-muted)] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-primary)]">
              {ZONES.map((z) => (
                <SelectItem key={z} value={z} className="text-[10px] py-1 px-1.5">{z}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* Style select */}
        <td className="py-1">
          <Select value={slot.style_hint} onValueChange={(v) => update({ style_hint: v as StyleHint })}>
            <SelectTrigger className={cn(
              "w-full h-5 min-h-5 px-1 py-0 text-[10px] border-[var(--border-primary)]/50 bg-transparent focus:ring-0 focus:ring-offset-0",
              slot.style_hint === "emphasis" ? "text-yellow-400" : slot.style_hint === "muted" ? "text-gray-500" : "text-[var(--text-primary)]",
            )}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-primary)]">
              {STYLES.map((s) => (
                <SelectItem
                  key={s}
                  value={s}
                  className={cn(
                    "text-[10px] py-1 px-1.5",
                    s === "emphasis" ? "text-yellow-400" : s === "muted" ? "text-gray-500" : "text-gray-300",
                  )}
                >
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* Delete slot */}
        <td className="py-1">
          <button
            onClick={() => dispatch({ type: "REMOVE_SLOT", sceneIdx, slotIdx })}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/10 rounded transition-opacity"
            title="Remove slot"
          >
            <Trash2 size={10} className="text-red-400/60 hover:text-red-400" />
          </button>
        </td>
      </tr>

      {/* Context row (문제 3) */}
      {contextMode && (slot.context || slot.source_value || slot.evidence_anchor) && (
        <tr className="border-b border-[var(--border-subtle)]/30 bg-purple-500/3">
          <td colSpan={6} className="py-1.5 px-2 space-y-1">
            {(slot.source_value || slot.evidence_anchor) && (
              <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)]">
                {slot.source_value && (
                  <>
                    <span className="text-[var(--text-tertiary)]">source</span>
                    <span className="leading-relaxed">{slot.source_value}</span>
                  </>
                )}
                {slot.evidence_anchor && (
                  <>
                    <span className="text-[var(--text-tertiary)]">evidence</span>
                    <span className="leading-relaxed">{slot.evidence_anchor}</span>
                  </>
                )}
              </div>
            )}
            <textarea
              value={slot.context ?? ""}
              onChange={(e) => update({ context: e.target.value })}
              className="w-full bg-transparent text-[10px] text-[var(--text-muted)] leading-relaxed outline-none resize-none border border-transparent hover:border-purple-500/20 focus:border-purple-500/40 rounded p-1"
              rows={2}
              placeholder="부연설명 (PD 검토용, 방송 그래픽에 표시되지 않음)..."
            />
          </td>
        </tr>
      )}
    </>
  );
}
