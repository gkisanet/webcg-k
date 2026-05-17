import { FileCode } from "lucide-react";

export function ImportModal({
  importJsonText,
  setImportJsonText,
  importError,
  setImportError,
  onApply,
  onClose,
}: {
  importJsonText: string;
  setImportJsonText: (v: string) => void;
  importError: string | null;
  setImportError: (e: string | null) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#1a1d24", borderRadius: "12px",
          width: "640px", maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
            <FileCode size={16} /> 외부 AI 코드 가져오기
          </h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}>✕</button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>
            ChatGPT, Claude, Gemini 등 다른 AI가 생성한 WebCG-K 오버레이 응답(JSON)을 통째로 붙여넣으세요.<br />
            <strong>html</strong>, <strong>css</strong>, <strong>js</strong>, <strong>dashboard_schema</strong>, <strong>replicant_defaults</strong> 필드를 자동으로 추출하여 각 탭에 적용합니다.
          </p>
          <textarea
            value={importJsonText}
            onChange={(e) => { setImportJsonText(e.target.value); setImportError(null); }}
            placeholder={`{\n  "html": "<div id=\\"overlay\\">...</div>",\n  "css": ":root { ... }",\n  "js": "webcgk.onData(...)",\n  "dashboard_schema": { "properties": { ... } },\n  "replicant_defaults": { ... }\n}`}
            style={{
              flex: 1, minHeight: "240px",
              backgroundColor: "rgba(0,0,0,0.4)", color: "#a5f3fc",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px",
              padding: "12px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
              outline: "none", resize: "vertical", whiteSpace: "pre", overflow: "auto",
            }}
            spellCheck={false}
          />
          {importError && (
            <div style={{ padding: "8px 12px", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", fontSize: "12px", color: "#fca5a5" }}>
              ⚠ {importError}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "13px" }}>
            취소
          </button>
          <button
            type="button" onClick={onApply} disabled={!importJsonText.trim()}
            style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: importJsonText.trim() ? "#0ea5e9" : "rgba(255,255,255,0.06)", color: importJsonText.trim() ? "#fff" : "#64748b", cursor: importJsonText.trim() ? "pointer" : "default", fontSize: "13px", fontWeight: 600 }}
          >
            적용하기
          </button>
        </div>
      </div>
    </div>
  );
}
