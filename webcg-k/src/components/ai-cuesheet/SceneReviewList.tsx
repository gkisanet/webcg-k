/**
 * SceneReviewList — AI 생성 씬 콘텐츠 검토 컴포넌트
 *
 * @deprecated v4에서는 StepContentReview가 대체. 이 컴포넌트는 더 이상 사용되지 않음.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Hash, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SceneContent } from "@/lib/aiCuesheetTypes";

// ─── Props ──────────────────────────────────────────────────────────

interface SceneReviewListProps {
  scenes: SceneContent[];
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function SceneReviewList({ scenes, className }: SceneReviewListProps) {
  const { t } = useTranslation("dashboard");

  if (!scenes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--text-tertiary)]">
        <Info size={24} />
        <span className="text-xs">{t("aiCuesheet.sceneReview.empty")}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {scenes.map((scene, i) => (
        <SceneReviewCard key={i} scene={scene} index={i} />
      ))}
    </div>
  );
}

// ─── Scene Card ─────────────────────────────────────────────────────

function SceneReviewCard({ scene, index }: { scene: SceneContent; index: number }) {
  const { t } = useTranslation("dashboard");
  const [expanded, setExpanded] = useState(false);

  const slots = scene.text_slots ?? [];

  return (
    <div className="p-3 rounded-lg bg-[var(--app-bg)] border border-[var(--border-primary)] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] font-bold text-[var(--text-tertiary)] shrink-0 w-5">
            #{index + 1}
          </span>
          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
            {scene.trigger}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] shrink-0"
        >
          {expanded ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {scene.duration > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--app-bg-raised)] text-[var(--text-tertiary)]">
            {scene.duration}s
          </span>
        )}
        {slots.length > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--app-bg-raised)] text-[var(--text-tertiary)]">
            <Hash size={10} />
            {slots.length} text slots
          </span>
        )}
      </div>

      {scene.graphic_intent && (
        <p className="mt-2 text-[11px] text-[var(--text-secondary)] italic leading-relaxed line-clamp-2">
          "{scene.graphic_intent}"
        </p>
      )}

      {expanded && slots.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-1">
          {slots.map((slot, si) => (
            <div key={si} className="flex items-center gap-2 text-[10px]">
              <span className="font-semibold text-[var(--accent-primary)] w-16 shrink-0">{slot.semantic_role}</span>
              <span className="text-[var(--text-primary)]">{slot.value}</span>
              <span className="text-[var(--text-tertiary)] ml-auto">
                imp:{slot.importance} · {slot.zone_hint} · {slot.style_hint}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
