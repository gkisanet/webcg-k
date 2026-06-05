import { AlertTriangle, ArrowLeft, FileStack, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiCuesheetPublishReadiness } from "@/lib/aiCuesheetPublish";

interface StepRundownEditProps {
  readiness: AiCuesheetPublishReadiness;
  isPublishing: boolean;
  onBack: () => void;
  onPublish: () => void;
}

export function StepRundownEdit({
  readiness,
  isPublishing,
  onBack,
  onPublish,
}: StepRundownEditProps) {
  const excludedCount = readiness.totalScenes - readiness.readyScenes;

  return (
    <div className="h-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-5 flex flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] pb-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">4. 런다운 편집</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            생성 완료된 방송 그래픽(Broadcast Graphics)을 런다운 아이템으로 발행합니다. 발행 후 런다운 속성 패널에서 장면별 텍스트를 다시 조정할 수 있습니다.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} />
          Graphics
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--app-bg)] p-4">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">전체 장면</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{readiness.totalScenes}</div>
        </div>
        <div className="rounded-lg border border-green-500/25 bg-green-500/10 p-4">
          <div className="text-[10px] uppercase tracking-wide text-green-300">발행 가능</div>
          <div className="mt-2 text-2xl font-semibold text-green-300">{readiness.readyScenes}</div>
        </div>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="text-[10px] uppercase tracking-wide text-amber-300">제외 예정</div>
          <div className="mt-2 text-2xl font-semibold text-amber-300">{excludedCount}</div>
        </div>
      </div>

      {excludedCount > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 text-amber-300" />
          <span>일부 장면은 생성된 HTML 방송 그래픽이 없어 이번 런다운 발행에서 제외됩니다. 필요한 경우 Graphics 단계로 돌아가 장면 그래픽을 먼저 생성하세요.</span>
        </div>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 pt-5">
        <Button variant="secondary" onClick={onBack}>
          Graphics로 돌아가기
        </Button>
        <Button onClick={onPublish} disabled={isPublishing || readiness.readyScenes === 0}>
          {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <FileStack size={16} />}
          런다운 생성
        </Button>
      </div>
    </div>
  );
}
