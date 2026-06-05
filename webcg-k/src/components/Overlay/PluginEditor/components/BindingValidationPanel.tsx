/**
 * BindingValidationPanel — 3단계 심각도 분리 UI
 *
 * ■ Why 3단계?
 *   비유: 병원의 트리아주(Triage).
 *   - errors (빨강): HTML 바인딩이 스키마에 없음 → 런타임 크래시 위험
 *   - warnings (노랑): 스키마 키에 기본값이 없음 → 대시보드 컨트롤 초기화 안 됨
 *   - hints (숨김): 스키마에 있지만 정적 분석 미탐지 → AI 의도적 사용 가능성 높음
 *
 *   이전에는 모든 메시지를 동일한 노란색 경고로 표시하여,
 *   AI가 JS 클로저나 CSS 변수로 의도적으로 사용한 키까지
 *   "문제"처럼 보여 사용자에게 불필요한 불안감을 줬다.
 *   이제 진짜 문제(errors)만 강조하고, hints는 완전히 숨긴다.
 */
import { AlertCircle, TriangleAlert } from "lucide-react";
import type { OverlayBindingValidation } from "../../../../services/aiOverlayService";

interface BindingValidationPanelProps {
  validation: OverlayBindingValidation;
}

export function BindingValidationPanel({ validation }: BindingValidationPanelProps) {
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  // hints는 의도적으로 숨김 — AI 자율성 존중
  if (!hasErrors && !hasWarnings) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "8px 10px 0" }}>
      {/* ─── 치명적 오류: orphanBindings (빨강) ─── */}
      {hasErrors && (
        <div style={styles.errorPanel} role="alert">
          <div style={styles.header}>
            <div style={styles.title}>
              <AlertCircle size={14} />
              <span>바인딩 오류 {validation.errors.length}개</span>
            </div>
            <span style={styles.errorChip}>수정 필요</span>
          </div>
          <ul style={styles.list}>
            {validation.errors.slice(0, 4).map((msg) => (
              <li key={msg} style={styles.item}>{msg}</li>
            ))}
            {validation.errors.length > 4 && (
              <li style={styles.item}>외 {validation.errors.length - 4}개 오류</li>
            )}
          </ul>
        </div>
      )}

      {/* ─── 경고: missingDefaults (노랑) ─── */}
      {hasWarnings && (
        <div style={styles.warnPanel} role="status" aria-live="polite">
          <div style={styles.header}>
            <div style={styles.title}>
              <TriangleAlert size={14} />
              <span>기본값 누락 {validation.warnings.length}개</span>
            </div>
          </div>
          <ul style={styles.list}>
            {validation.warnings.slice(0, 3).map((msg) => (
              <li key={msg} style={styles.item}>{msg}</li>
            ))}
            {validation.warnings.length > 3 && (
              <li style={styles.item}>외 {validation.warnings.length - 3}개 경고</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  errorPanel: {
    padding: "8px 10px",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    borderRadius: "6px",
    background: "rgba(127, 29, 29, 0.22)",
    color: "#fca5a5",
    fontSize: "11px",
  },
  warnPanel: {
    padding: "8px 10px",
    border: "1px solid rgba(245, 158, 11, 0.25)",
    borderRadius: "6px",
    background: "rgba(120, 53, 15, 0.12)",
    color: "#fde68a",
    fontSize: "11px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: 700,
  },
  errorChip: {
    padding: "2px 6px",
    borderRadius: "999px",
    background: "rgba(239, 68, 68, 0.2)",
    color: "#f87171",
    fontSize: "10px",
    fontWeight: 700,
  },
  list: {
    margin: "6px 0 0",
    paddingLeft: "18px",
    lineHeight: 1.45,
    opacity: 0.9,
  },
  item: {
    margin: "2px 0",
  },
};
