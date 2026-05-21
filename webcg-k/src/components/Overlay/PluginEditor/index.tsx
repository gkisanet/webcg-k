import { useCallback, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Eye, Play, Square, MousePointer2, Settings, Sparkles, Undo2, Redo2 } from "lucide-react";
import type { PluginSourceCode, DashboardSchema } from "../../../lib/overlayTypes";
import { SchemaEditor } from "../SchemaEditor";
import { validateOverlayBindings } from "../../../services/aiOverlayService";

import { usePluginCode } from "./hooks/usePluginCode";
import { useResizer } from "./hooks/useResizer";
import { usePreviewBridge } from "./hooks/usePreviewBridge";
import { useVisualEditBridge } from "./hooks/useVisualEditBridge";
import { useAIGeneration } from "./hooks/useAIGeneration";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

import { Toolbar } from "./components/Toolbar";
import { PreviewContainer } from "./components/PreviewContainer";
import { AIGenerationPanel } from "./components/AIGenerationPanel";
import { DashboardPanel } from "./components/DashboardPanel";
import { ImportModal } from "./components/ImportModal";
import { VizNumField, VizTextField, VizColorField, RootVarsPanel } from "./components/VizFields";
import { BindingValidationPanel } from "./components/BindingValidationPanel";

// ─── 타입 ─────────────────────────────────────────────────────
type BottomTab = "ai" | "dashboard" | "visual";

interface PluginEditorProps {
  initialCode?: PluginSourceCode;
  initialSchema?: DashboardSchema | null;
  initialDefaults?: Record<string, unknown> | null;
  onSave?: (
    code: PluginSourceCode,
    schema: DashboardSchema | null,
    defaults: Record<string, unknown>,
    isSaveAs?: boolean,
  ) => void;
  readOnly?: boolean;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────
export function PluginEditor({
  initialCode,
  initialSchema,
  initialDefaults,
  onSave,
  readOnly = false,
}: PluginEditorProps) {
  // ─── Hooks ────────────────────────────────────────────────
  const codeHook = usePluginCode(initialCode, initialSchema, initialDefaults);
  const {
    activeTab, setActiveTab, code, setCode,
    undoCode, redoCode, canUndoCode, canRedoCode,
    schema, handleSchemaChange, testData, setTestData,
  } = codeHook;

  const resizer = useResizer();
  const { editorWidthPercent, isDragging, containerRef, previewHeightPercent, isVDragging, rightPaneRef, handleResizeStart, handleVResizeStart } = resizer;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<any>(null);

  const visualEdit = useVisualEditBridge(iframeRef, setCode);
  const { visualEditMode, setVisualEditMode, selectedVizElement, setSelectedVizElement, handleVizStyleChange, handleVizRootVarChange } = visualEdit;

  const preview = usePreviewBridge(code, testData, visualEditMode, selectedVizElement, iframeRef);
  const { buildSrcdoc, sendDataToPreview } = preview;

  const [bottomTab, setBottomTab] = useState<BottomTab>("dashboard");

  const bindingValidation = useMemo(
    () =>
      validateOverlayBindings({
        html: code.html,
        css: code.css,
        js: code.js,
        dashboard_schema: schema,
        replicant_defaults: testData,
      }),
    [code.html, code.css, code.js, schema, testData],
  );

  const ai = useAIGeneration(setCode, handleSchemaChange, setTestData, code, schema, setActiveTab, setBottomTab);
  const {
    aiPrompt, setAiPrompt, aiGenerating, aiError,
    aiIterationCount, aiPromptHistory, aiHasGenerated,
    handleAiGenerate, handleReset,
    showImportModal, setShowImportModal,
    importJsonText, setImportJsonText, importError, setImportError,
    handleImportJson,
    gridTemplates, selectedGridId, setSelectedGridId,
    selectedZoneIds, setSelectedZoneIds,
    showGridOverlay, setShowGridOverlay,
    zones,
    availableImages, selectedImageIds, setSelectedImageIds,
    showAssetSelector, setShowAssetSelector,
    copiedPrompt, handleCopySystemPrompt,
  } = ai;

  // ─── 저장 / 포맷 ──────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (onSave) onSave(code, schema, testData, false);
  }, [code, schema, testData, onSave]);

  const handleSaveAs = useCallback(() => {
    if (onSave) onSave(code, schema, testData, true);
  }, [code, schema, testData, onSave]);

  const handleFormat = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction("editor.action.formatDocument")?.run();
    }
  }, []);

  const handleUndo = useCallback(() => {
    undoCode();
    setSelectedVizElement(null);
  }, [setSelectedVizElement, undoCode]);

  const handleRedo = useCallback(() => {
    redoCode();
    setSelectedVizElement(null);
  }, [redoCode, setSelectedVizElement]);

  // ─── 키보드 단축키 ────────────────────────────────────────
  useKeyboardShortcuts(handleSave, handleFormat);

  // ─── 테스트 데이터 변경 → iframe 전달 ─────────────────────
  const handleTestDataChange = useCallback(
    (key: string, value: unknown) => {
      setTestData((prev) => {
        const next = { ...prev, [key]: value };
        sendDataToPreview(next);
        return next;
      });
    },
    [sendDataToPreview, setTestData],
  );

  // ─── 탭 설정 ──────────────────────────────────────────────
  const tabConfig = useMemo(
    () =>
      [
        { key: "html" as const, label: "HTML", icon: null, lang: "html" },
        { key: "css" as const, label: "CSS", icon: null, lang: "css" },
        { key: "js" as const, label: "JS", icon: null, lang: "javascript" },
        { key: "schema" as const, label: "Schema", icon: null, lang: "json" },
      ],
    [],
  );

  // ─── 레이아웃 ──────────────────────────────────────────────
  return (
    <>
      <div ref={containerRef} style={styles.container}>
        {/* ─── 좌측: 코드 에디터 ─── */}
        <div style={{ ...styles.editorPane, flex: `0 0 ${editorWidthPercent}%` }}>
          <Toolbar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onFormat={handleFormat}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onImport={() => { setImportJsonText(""); setImportError(null); setShowImportModal(true); }}
            isSchemaTab={activeTab === "schema"}
            canUndo={canUndoCode}
            canRedo={canRedoCode}
          />

          <div style={styles.editorWrapper}>
            {activeTab === "schema" ? (
              <SchemaEditor schema={schema} onChange={handleSchemaChange} />
            ) : (
              <Editor
                height="100%"
                language={tabConfig.find((t) => t.key === activeTab)?.lang}
                value={code[activeTab as "html" | "css" | "js"]}
                onChange={(value) =>
                  setCode((prev) => ({ ...prev, [activeTab]: value || "" }))
                }
                onMount={(editor) => { editorRef.current = editor; }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  wordWrap: "on",
                  tabSize: 2,
                  scrollBeyondLastLine: false,
                  readOnly,
                  automaticLayout: true,
                  padding: { top: 8 },
                }}
              />
            )}
          </div>
        </div>

        {/* ─── 드래그 리사이저 핸들 ─── */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            width: "5px", cursor: "col-resize",
            background: isDragging ? "var(--accent-primary, #00d4ff)" : "rgba(255, 255, 255, 0.04)",
            transition: isDragging ? "none" : "background 0.2s",
            flexShrink: 0, position: "relative", zIndex: 5,
          }}
          onMouseEnter={(e) => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.background = "rgba(0, 212, 255, 0.3)"; }}
          onMouseLeave={(e) => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.background = "rgba(255, 255, 255, 0.04)"; }}
        />

        {/* ─── 우측: 프리뷰 + 하단 패널 ─── */}
        <div ref={rightPaneRef} style={{
          ...styles.previewPane,
          pointerEvents: (isDragging || isVDragging) ? "none" : "auto",
        }}>
          {/* 프리뷰 헤더 */}
          <div style={styles.previewHeader}>
            <div style={styles.previewHeaderLeft}>
              <Eye size={14} />
              <span style={{ fontWeight: 600 }}>실시간 프리뷰</span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  const next = !visualEditMode;
                  setVisualEditMode(next);
                  if (iframeRef.current?.contentWindow) {
                    if (next) {
                      iframeRef.current.contentWindow.postMessage({ type: "SHOW" }, "*");
                    }
                    iframeRef.current.contentWindow.postMessage(
                      { type: next ? "ENABLE_VISUAL_EDIT" : "DISABLE_VISUAL_EDIT" },
                      "*",
                    );
                  }
                }}
                style={{
                  ...styles.testBtn,
                  background: visualEditMode ? "rgba(0,212,255,0.2)" : styles.testBtn.background,
                  borderColor: visualEditMode ? "rgba(0,212,255,0.6)" : "rgba(139, 92, 246, 0.4)",
                  color: visualEditMode ? "#22d3ee" : "#8b5cf6",
                }}
                title="프리뷰에서 요소를 클릭/드래그/리사이즈하여 CSS 수정"
              >
                <MousePointer2 size={12} />
                {visualEditMode ? "시각 편집 ON" : "시각 편집"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage({ type: "SHOW" }, "*");
                  }
                }}
                style={styles.testBtn}
                title="SHOW 애니메이션 테스트"
              >
                <Play size={12} />SHOW
              </button>
              <button
                type="button"
                onClick={() => {
                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage({ type: "HIDE" }, "*");
                  }
                }}
                style={{ ...styles.testBtn, background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}
                title="HIDE 애니메이션 테스트"
              >
                <Square size={12} />HIDE
              </button>
            </div>
          </div>

          {/* iframe 프리뷰 */}
          <div style={{
            position: "relative",
            flex: `0 0 ${previewHeightPercent}%`,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <PreviewContainer
              iframeRef={iframeRef}
              srcdoc={buildSrcdoc(code)}
              zones={zones}
              selectedZoneIds={selectedZoneIds}
              onSelectZone={setSelectedZoneIds}
              showGridOverlay={showGridOverlay}
            />
          </div>

          {/* ─── 세로 드래그 리사이저 ─── */}
          <div
            onMouseDown={handleVResizeStart}
            style={{
              height: "5px", cursor: "row-resize",
              background: isVDragging ? "var(--accent-primary, #00d4ff)" : "rgba(255, 255, 255, 0.04)",
              transition: isVDragging ? "none" : "background 0.2s",
              flexShrink: 0, zIndex: 5,
            }}
            onMouseEnter={(e) => { if (!isVDragging) (e.currentTarget as HTMLDivElement).style.background = "rgba(0, 212, 255, 0.3)"; }}
            onMouseLeave={(e) => { if (!isVDragging) (e.currentTarget as HTMLDivElement).style.background = "rgba(255, 255, 255, 0.04)"; }}
          />

          {/* ─── 하단 패널 (AI / 대시보드 / 시각 편집) ─── */}
          <div style={styles.dashboardPanel}>
            {/* 탭 바 */}
            <div style={{
              display: "flex", alignItems: "center", gap: "0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <button type="button" onClick={() => setBottomTab("ai")} style={{
                padding: "8px 14px",
                background: bottomTab === "ai" ? "rgba(139,92,246,0.15)" : "transparent",
                border: "none",
                borderBottom: bottomTab === "ai" ? "2px solid #8b5cf6" : "2px solid transparent",
                color: bottomTab === "ai" ? "#a78bfa" : "#94a3b8",
                cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
                display: "flex", alignItems: "center", gap: "4px",
              }}>
                <Sparkles size={12} /> AI 코드 생성
              </button>
              <button type="button" onClick={() => setBottomTab("dashboard")} style={{
                padding: "8px 14px",
                background: bottomTab === "dashboard" ? "rgba(6,182,212,0.1)" : "transparent",
                border: "none",
                borderBottom: bottomTab === "dashboard" ? "2px solid #06b6d4" : "2px solid transparent",
                color: bottomTab === "dashboard" ? "#22d3ee" : "#94a3b8",
                cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
                display: "flex", alignItems: "center", gap: "4px",
              }}>
                <Settings size={12} /> 대시보드
                {bindingValidation.warnings.length > 0 && (
                  <span style={styles.warningBadge}>{bindingValidation.warnings.length}</span>
                )}
              </button>
              <button type="button" onClick={() => setBottomTab("visual")} style={{
                padding: "8px 14px",
                background: bottomTab === "visual" ? "rgba(0,212,255,0.1)" : "transparent",
                border: "none",
                borderBottom: bottomTab === "visual" ? "2px solid #00d4ff" : "2px solid transparent",
                color: bottomTab === "visual" ? "#22d3ee" : "#94a3b8",
                cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
                display: "flex", alignItems: "center", gap: "4px",
              }}>
                <MousePointer2 size={12} /> 시각 편집
              </button>
            </div>

            <BindingValidationPanel validation={bindingValidation} />

            {/* AI 프롬프트 탭 */}
            {bottomTab === "ai" && (
              <AIGenerationPanel
                aiPrompt={aiPrompt}
                setAiPrompt={setAiPrompt}
                aiGenerating={aiGenerating}
                aiError={aiError}
                aiIterationCount={aiIterationCount}
                aiPromptHistory={aiPromptHistory}
                aiHasGenerated={aiHasGenerated}
                onGenerate={handleAiGenerate}
                onReset={handleReset}
                gridTemplates={gridTemplates}
                selectedGridId={selectedGridId}
                setSelectedGridId={setSelectedGridId}
                setSelectedZoneIds={setSelectedZoneIds}
                setShowGridOverlay={setShowGridOverlay}
                selectedZoneIds={selectedZoneIds}
                zones={zones}
                availableImages={availableImages}
                selectedImageIds={selectedImageIds}
                setSelectedImageIds={setSelectedImageIds}
                showAssetSelector={showAssetSelector}
                setShowAssetSelector={setShowAssetSelector}
                copiedPrompt={copiedPrompt}
                onCopySystemPrompt={handleCopySystemPrompt}
              />
            )}

            {/* 대시보드 탭 */}
            {bottomTab === "dashboard" && (
              <DashboardPanel
                schema={schema}
                testData={testData}
                onTestDataChange={handleTestDataChange}
              />
            )}

            {/* 시각 편집 탭 */}
            {bottomTab === "visual" && (
              <div style={{ padding: "10px 12px", overflowY: "auto", flex: 1 }}>
                <div style={styles.visualHistoryBar}>
                  <span style={styles.visualHistoryText}>시각 편집 변경</span>
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndoCode}
                    style={{
                      ...styles.visualHistoryBtn,
                      opacity: canUndoCode ? 1 : 0.45,
                      cursor: canUndoCode ? "pointer" : "not-allowed",
                    }}
                    title="시각 편집 변경 되돌리기"
                    aria-label="시각 편집 변경 되돌리기"
                  >
                    <Undo2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canRedoCode}
                    style={{
                      ...styles.visualHistoryBtn,
                      opacity: canRedoCode ? 1 : 0.45,
                      cursor: canRedoCode ? "pointer" : "not-allowed",
                    }}
                    title="시각 편집 변경 다시 실행"
                    aria-label="시각 편집 변경 다시 실행"
                  >
                    <Redo2 size={13} />
                  </button>
                </div>
                {!visualEditMode && (
                  <div style={{ ...styles.emptyDashboard, padding: "1rem" }}>
                    <MousePointer2 size={24} style={{ opacity: 0.4, color: "#00d4ff" }} />
                    <p style={{ marginTop: 8 }}>프리뷰 상단의 <strong>"시각 편집"</strong> 버튼을 눌러 요소를 선택하세요</p>
                  </div>
                )}
                {visualEditMode && !selectedVizElement && (
                  <div style={{ ...styles.emptyDashboard, padding: "1rem" }}>
                    <MousePointer2 size={24} style={{ opacity: 0.4, color: "#00d4ff" }} />
                    <p style={{ marginTop: 8 }}>프리뷰에서 요소를 <strong>클릭</strong>하여 선택하세요</p>
                  </div>
                )}
                {visualEditMode && selectedVizElement && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", wordBreak: "break-all" }}>
                      <strong style={{ color: "#e2e8f0" }}>{selectedVizElement.tagName.toLowerCase()}</strong>
                      {selectedVizElement.id && <span style={{ color: "#a78bfa" }}> #{selectedVizElement.id}</span>}
                      {selectedVizElement.className && <span style={{ color: "#22d3ee" }}> .{selectedVizElement.className.split(/\s+/).join(".")}</span>}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>
                      {selectedVizElement.selector}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <VizNumField label="left" value={selectedVizElement.computedStyles.left} onChange={(v) => handleVizStyleChange("left", v)} />
                      <VizNumField label="top" value={selectedVizElement.computedStyles.top} onChange={(v) => handleVizStyleChange("top", v)} />
                      <VizNumField label="width" value={selectedVizElement.computedStyles.width} onChange={(v) => handleVizStyleChange("width", v)} />
                      <VizNumField label="height" value={selectedVizElement.computedStyles.height} onChange={(v) => handleVizStyleChange("height", v)} />
                    </div>
                    <VizNumField label="font-size" value={selectedVizElement.computedStyles.fontSize} onChange={(v) => handleVizStyleChange("font-size", v)} />
                    <VizTextField label="margin" value={selectedVizElement.computedStyles.margin} onChange={(v) => handleVizStyleChange("margin", v)} />
                    <VizTextField label="padding" value={selectedVizElement.computedStyles.padding} onChange={(v) => handleVizStyleChange("padding", v)} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <VizColorField label="color" value={selectedVizElement.computedStyles.color} onChange={(v) => handleVizStyleChange("color", v)} />
                      <VizColorField label="background" value={selectedVizElement.computedStyles.backgroundColor} onChange={(v) => handleVizStyleChange("background-color", v)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <VizNumField label="border-radius" value={selectedVizElement.computedStyles.borderRadius} onChange={(v) => handleVizStyleChange("border-radius", v)} />
                      <VizNumField label="opacity" value={selectedVizElement.computedStyles.opacity || "1"} onChange={(v) => handleVizStyleChange("opacity", v)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <VizNumField label="gap" value={selectedVizElement.computedStyles.gap} onChange={(v) => handleVizStyleChange("gap", v)} />
                      <VizNumField label="z-index" value={selectedVizElement.computedStyles.zIndex || "0"} onChange={(v) => handleVizStyleChange("z-index", v)} />
                    </div>
                    <VizTextField label="text-shadow" value={selectedVizElement.computedStyles.textShadow || "none"} onChange={(v) => handleVizStyleChange("text-shadow", v)} />
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", marginBottom: "8px", textTransform: "uppercase" }}>CSS Variables</div>
                      <RootVarsPanel cssText={code.css} onChange={handleVizRootVarChange} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 외부 AI JSON 가져오기 모달 ─── */}
      {showImportModal && (
        <ImportModal
          importJsonText={importJsonText}
          setImportJsonText={setImportJsonText}
          importError={importError}
          setImportError={setImportError}
          onApply={handleImportJson}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex", height: "100%", minHeight: "600px",
    background: "#08080d", color: "var(--text-primary, #e5e5e5)", gap: 0,
  },
  editorPane: {
    display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden",
  },
  editorWrapper: {
    flex: 1, minHeight: 0,
  },
  previewPane: {
    flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden",
  },
  previewHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "6px 12px", borderBottom: "1px solid var(--border-default, #222)",
    background: "var(--app-bg-muted, #111)", fontSize: "12px",
    color: "var(--text-secondary, #aaa)",
  },
  previewHeaderLeft: {
    display: "flex", alignItems: "center", gap: "6px",
  },
  testBtn: {
    display: "flex", alignItems: "center", gap: "3px",
    padding: "3px 8px", border: "1px solid rgba(139, 92, 246, 0.4)",
    borderRadius: "4px", background: "rgba(139, 92, 246, 0.1)",
    color: "#8b5cf6", fontSize: "10px", fontWeight: 600, cursor: "pointer",
  },
  dashboardPanel: {
    flex: 1, minHeight: "80px", borderTop: "none",
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  emptyDashboard: {
    textAlign: "center", padding: "1.5rem",
    color: "var(--text-tertiary, #666)", fontSize: "12px",
  },
  warningBadge: {
    minWidth: "16px",
    height: "16px",
    padding: "0 5px",
    borderRadius: "999px",
    background: "rgba(245, 158, 11, 0.24)",
    color: "#fbbf24",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: 800,
    lineHeight: 1,
  },
  visualHistoryBar: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "10px",
    padding: "6px 8px",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "6px",
    background: "rgba(15, 23, 42, 0.42)",
  },
  visualHistoryText: {
    marginRight: "auto",
    color: "#94a3b8",
    fontSize: "11px",
    fontWeight: 700,
  },
  visualHistoryBtn: {
    width: "26px",
    height: "24px",
    borderRadius: "5px",
    border: "1px solid rgba(34, 211, 238, 0.24)",
    background: "rgba(34, 211, 238, 0.08)",
    color: "#22d3ee",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
