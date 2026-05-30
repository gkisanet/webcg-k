import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StepSystemPromptProps {
  systemPrompt: string;
  onNext: () => void;
}

export function StepSystemPrompt({ systemPrompt, onNext }: StepSystemPromptProps) {
  const { t } = useTranslation("dashboard");
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("aiCuesheet.step1.title", "Step 1: System Prompt")}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          {t("aiCuesheet.step1.hint")}
        </p>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div className="absolute top-2 right-2 z-10">
          <Button
            size="sm" variant="ghost"
            onClick={() => { navigator.clipboard.writeText(systemPrompt); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="h-7 text-xs gap-1"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t("aiCuesheet.step1.copied", "Copied") : t("aiCuesheet.step1.copyPrompt", "Copy")}
          </Button>
        </div>
        <pre className="h-full overflow-y-auto p-4 rounded-lg bg-[var(--app-bg)] border border-[var(--border-default)] text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed font-mono">
          {systemPrompt}
        </pre>
      </div>

      <div className="flex justify-end shrink-0">
        <Button size="sm" onClick={onNext}>
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
