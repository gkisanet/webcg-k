import { useTranslation } from "react-i18next";
import { Wand2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StepSourceInputProps {
  sourceMaterial: string;
  onChange: (v: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  parseError: string | null;
}

export function StepSourceInput({
  sourceMaterial, onChange, isGenerating, onGenerate, parseError,
}: StepSourceInputProps) {
  const { t } = useTranslation("dashboard");

  return (
    <div className="flex flex-col gap-3 h-full">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("aiCuesheet.stepSource.title", "Step 1: Source Material")}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          {t("aiCuesheet.stepSource.hint")}
        </p>
      </div>

      {parseError && (
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <div className="flex items-start gap-2">
            <XCircle size={14} className="shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap font-medium">{parseError}</span>
          </div>
        </div>
      )}

      <textarea
        value={sourceMaterial}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("aiCuesheet.stepSource.placeholder")}
        className="flex-1 min-h-[200px] p-3 rounded-lg bg-[var(--app-bg)] border border-[var(--border-primary)] text-[var(--text-primary)] text-xs leading-relaxed resize-y placeholder:text-[var(--text-muted)]"
      />

      <div className="flex justify-end gap-2 shrink-0">
        <Button size="sm" onClick={onGenerate} disabled={!sourceMaterial.trim() || isGenerating}>
          {isGenerating ? (
            <><RefreshCw size={14} className="animate-spin mr-1.5" /> {t("aiCuesheet.stepSource.generating")}</>
          ) : (
            <><Wand2 size={14} className="mr-1.5" /> {t("aiCuesheet.stepSource.generate")}</>
          )}
        </Button>
      </div>
    </div>
  );
}

