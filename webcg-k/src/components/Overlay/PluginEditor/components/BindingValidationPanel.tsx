import { TriangleAlert } from "lucide-react";
import type { OverlayBindingValidation } from "../../../../services/aiOverlayService";

interface BindingValidationPanelProps {
  validation: OverlayBindingValidation;
}

export function BindingValidationPanel({ validation }: BindingValidationPanelProps) {
  if (validation.warnings.length === 0) return null;

  const visibleWarnings = validation.warnings.slice(0, 4);
  const hiddenCount = validation.warnings.length - visibleWarnings.length;

  return (
    <div style={styles.panel} role="status" aria-live="polite">
      <div style={styles.header}>
        <div style={styles.title}>
          <TriangleAlert size={14} />
          <span>바인딩 경고 {validation.warnings.length}개</span>
        </div>
        <div style={styles.chips}>
          {validation.missingBindings.length > 0 && (
            <span style={styles.chip}>누락 {validation.missingBindings.length}</span>
          )}
          {validation.orphanBindings.length > 0 && (
            <span style={styles.chip}>고아 {validation.orphanBindings.length}</span>
          )}
          {validation.missingDefaults.length > 0 && (
            <span style={styles.chip}>기본값 {validation.missingDefaults.length}</span>
          )}
        </div>
      </div>
      <ul style={styles.list}>
        {visibleWarnings.map((warning) => (
          <li key={warning} style={styles.item}>{warning}</li>
        ))}
        {hiddenCount > 0 && (
          <li style={styles.item}>외 {hiddenCount}개 경고가 더 있습니다.</li>
        )}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    margin: "8px 10px 0",
    padding: "8px 10px",
    border: "1px solid rgba(245, 158, 11, 0.32)",
    borderRadius: "6px",
    background: "rgba(120, 53, 15, 0.18)",
    color: "#fde68a",
    fontSize: "11px",
    flexShrink: 0,
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
  chips: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  chip: {
    padding: "2px 6px",
    borderRadius: "999px",
    background: "rgba(245, 158, 11, 0.18)",
    color: "#fcd34d",
    fontSize: "10px",
    fontWeight: 700,
  },
  list: {
    margin: "6px 0 0",
    paddingLeft: "18px",
    color: "#fed7aa",
    lineHeight: 1.45,
  },
  item: {
    margin: "2px 0",
  },
};
