import { ArrowLeft, ExternalLink, MonitorCheck, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StepRenderVerifyProps {
  rundownId: string | null;
  onBack: () => void;
  onOpenRundown: () => void;
}

export function StepRenderVerify({ rundownId, onBack, onOpenRundown }: StepRenderVerifyProps) {
  return (
    <div className="h-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 flex flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-primary)] pb-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">5. 송출 검증</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            런다운 편집 화면에서 텍스트를 조정한 뒤 PVW, PGM, 최종 render 경로가 같은 값을 보는지 확인합니다.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} />
          런다운 편집
        </Button>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        {[
          "런다운 속성 패널에서 overlay item의 텍스트 값을 수정합니다.",
          "PVW에서 수정값이 즉시 반영되는지 확인합니다.",
          "PGM으로 전환한 뒤 최종 render 화면에서도 같은 값이 보이는지 확인합니다.",
        ].map((label, index) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border border-[var(--border-primary)] bg-[var(--app-bg)] p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/15 text-xs font-semibold text-blue-300">{index + 1}</span>
            <span className="text-[var(--text-secondary)]">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-100 flex gap-3">
        <MonitorCheck size={18} className="shrink-0 text-blue-300" />
        <div>
          <div className="font-semibold text-blue-200">검증 기준</div>
          <div className="mt-1 text-blue-100/80">방송 그래픽(Broadcast Graphics)의 HTML은 템플릿이고, 실제 표시값은 런다운 item의 runtime data입니다. 세 화면이 같은 값을 보면 데이터 경로가 정상입니다.</div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-5">
        <Button variant="secondary" onClick={onBack}>
          런다운 단계로
        </Button>
        <Button onClick={onOpenRundown} disabled={!rundownId}>
          <RadioTower size={16} />
          런다운 열기
          <ExternalLink size={14} />
        </Button>
      </div>
    </div>
  );
}
