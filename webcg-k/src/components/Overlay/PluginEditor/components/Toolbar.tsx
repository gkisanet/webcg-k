import {
  FileCode, Palette, Zap, Table2,
  Save, Copy, Wrench,
} from "lucide-react";
import { useMemo } from "react";
import type { EditorTab } from "../hooks/usePluginCode";

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "4px 8px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "rgba(15, 15, 22, 0.85)", backdropFilter: "blur(12px)",
  },
  tabGroup: { display: "flex", gap: "2px" },
  tab: {
    display: "flex", alignItems: "center", gap: "4px",
    padding: "6px 12px", border: "none", borderRadius: "6px",
    background: "transparent", color: "var(--text-tertiary, #666)",
    fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
  },
  tabActive: {
    background: "rgba(6, 182, 212, 0.15)", color: "#06b6d4",
  },
  saveBtn: {
    display: "flex", alignItems: "center", gap: "4px",
    padding: "5px 12px", border: "1px solid rgba(16, 185, 129, 0.4)",
    borderRadius: "6px", background: "rgba(16, 185, 129, 0.1)",
    color: "#10b981", fontSize: "12px", fontWeight: 600, cursor: "pointer",
  },
};

export function Toolbar({
  activeTab,
  onTabChange,
  onSave,
  onSaveAs,
  onFormat,
  onImport,
  isSchemaTab,
}: {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onFormat: () => void;
  onImport: () => void;
  isSchemaTab: boolean;
}) {
  const tabs = useMemo(() => [
    { key: "html" as EditorTab, label: "HTML", icon: <FileCode size={14} /> },
    { key: "css" as EditorTab, label: "CSS", icon: <Palette size={14} /> },
    { key: "js" as EditorTab, label: "JS", icon: <Zap size={14} /> },
    { key: "schema" as EditorTab, label: "Schema", icon: <Table2 size={14} /> },
  ], []);

  return (
    <div style={styles.tabBar}>
      <div style={styles.tabGroup}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={onImport}
          style={{ ...styles.saveBtn, background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          title="다른 AI로 생성한 전체 JSON(html/css/js/schema)을 붙여넣기"
        >
          <FileCode size={14} />
          가져오기
        </button>
        <button
          type="button"
          onClick={onFormat}
          style={{ ...styles.saveBtn, background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          title="코드 자동 정렬 (Ctrl+Shift+F)"
          disabled={isSchemaTab}
        >
          <Wrench size={14} />
          정렬
        </button>
        <button
          type="button"
          onClick={onSaveAs}
          style={{ ...styles.saveBtn, background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          title="새 이름으로 복사하여 저장"
        >
          <Copy size={14} />
          새로 저장
        </button>
        <button
          type="button"
          onClick={onSave}
          style={styles.saveBtn}
          title="저장 (Ctrl+S)"
        >
          <Save size={14} />
          저장
        </button>
      </div>
    </div>
  );
}
