import {
  Copy, Check, Sparkles, Loader2, Wrench, RefreshCw,
  Grid3X3, Image as ImageIcon,
} from "lucide-react";

const MAX_AI_ITERATIONS = 2;

const aiSelect: React.CSSProperties = {
  flex: 1, padding: "5px 8px", borderRadius: "0.375rem",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.3)", color: "#e2e8f0",
  fontSize: "0.75rem", outline: "none", cursor: "pointer",
};

interface AIGenerationPanelProps {
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  aiGenerating: boolean;
  aiError: string | null;
  aiIterationCount: number;
  aiPromptHistory: string[];
  aiHasGenerated: boolean;
  onGenerate: (isModify: boolean) => void;
  onReset: () => void;
  // Grid
  gridTemplates: any[];
  selectedGridId: string;
  setSelectedGridId: (v: string) => void;
  setSelectedZoneIds: (ids: string[]) => void;
  setShowGridOverlay: (v: boolean) => void;
  selectedZoneIds: string[];
  zones: any[];
  // Assets
  availableImages: any[];
  selectedImageIds: string[];
  setSelectedImageIds: React.Dispatch<React.SetStateAction<string[]>>;
  showAssetSelector: boolean;
  setShowAssetSelector: (v: boolean) => void;
  copiedPrompt: boolean;
  onCopySystemPrompt: () => void;
}

export function AIGenerationPanel(props: AIGenerationPanelProps) {
  const {
    aiPrompt, setAiPrompt, aiGenerating, aiError,
    aiIterationCount, aiPromptHistory, aiHasGenerated,
    onGenerate, onReset,
    gridTemplates, selectedGridId, setSelectedGridId,
    setSelectedZoneIds, setShowGridOverlay,
    selectedZoneIds, zones,
    availableImages, selectedImageIds, setSelectedImageIds,
    showAssetSelector, setShowAssetSelector,
    copiedPrompt, onCopySystemPrompt,
  } = props;

  const canModify = aiHasGenerated && aiIterationCount < MAX_AI_ITERATIONS;
  const limitReached = aiHasGenerated && aiIterationCount >= MAX_AI_ITERATIONS;

  return (
    <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflow: "auto" }}>
      {/* Phase badge */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 8px", borderRadius: "0.375rem",
        background: limitReached ? "rgba(239,68,68,0.1)" : aiHasGenerated ? "rgba(34,197,94,0.1)" : "rgba(99,102,241,0.1)",
        border: `1px solid ${limitReached ? "rgba(239,68,68,0.2)" : aiHasGenerated ? "rgba(34,197,94,0.2)" : "rgba(99,102,241,0.2)"}`,
        fontSize: "0.6875rem", fontWeight: 600,
      }}>
        <span style={{ color: limitReached ? "#fca5a5" : aiHasGenerated ? "#4ade80" : "#a5b4fc" }}>
          {limitReached ? `⚠️ 수정 한도 (${MAX_AI_ITERATIONS}/${MAX_AI_ITERATIONS})` : aiHasGenerated ? `🔧 수정 모드 (${aiIterationCount}/${MAX_AI_ITERATIONS})` : "✨ 새 코드 생성"}
        </span>
        {aiHasGenerated && (
          <button type="button" onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.625rem", color: "#94a3b8", textDecoration: "underline" }}>초기화</button>
        )}
      </div>

      {/* Prompt history */}
      {aiPromptHistory.length > 0 && (
        <div style={{ padding: "6px 8px", borderRadius: "0.375rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)", fontSize: "0.6875rem", color: "#94a3b8", maxHeight: "60px", overflowY: "auto" }}>
          {aiPromptHistory.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "4px", marginBottom: i < aiPromptHistory.length - 1 ? "3px" : 0 }}>
              <span style={{ color: "#6366f1", flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid selector */}
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <Grid3X3 size={14} style={{ color: "#a78bfa", flexShrink: 0 }} />
        <select value={selectedGridId} onChange={(e) => { setSelectedGridId(e.target.value); setSelectedZoneIds([]); setShowGridOverlay(!!e.target.value); }} style={aiSelect}>
          <option value="">그리드 선택 (선택사항)</option>
          {gridTemplates.map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
        </select>
        {zones.length > 0 && (
          <div style={{ fontSize: "0.75rem", color: "#e2e8f0", background: "rgba(0,0,0,0.3)", padding: "5px 8px", borderRadius: "0.375rem", border: "1px solid rgba(255,255,255,0.1)" }}>
            {selectedZoneIds.length === 0 ? "프리뷰 화면에서 영역을 클릭하세요" : `${selectedZoneIds.length}개 영역 선택됨`}
          </div>
        )}
      </div>
      {zones.length > 0 && (
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button
            type="button" onClick={onCopySystemPrompt}
            style={{
              padding: "5px 10px", borderRadius: "0.375rem",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              background: copiedPrompt ? "rgba(34, 197, 94, 0.15)" : "rgba(139, 92, 246, 0.1)",
              color: copiedPrompt ? "#4ade80" : "#a78bfa",
              fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: "4px",
            }}
          >
            {copiedPrompt ? <Check size={12} /> : <Copy size={12} />}
            {copiedPrompt ? "복사됨" : "시스템 프롬프트 복사"}
          </button>
          <span style={{ fontSize: "0.6875rem", color: "#64748b" }}>
            선택한 영역 정보를 담아 다른 AI에 붙여넣기
          </span>
        </div>
      )}

      {/* Asset selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <ImageIcon size={14} style={{ color: "#a78bfa", flexShrink: 0 }} />
          <button
            type="button" onClick={() => setShowAssetSelector(!showAssetSelector)}
            style={{ ...aiSelect, cursor: "pointer", textAlign: "left", width: "100%" }}
          >
            {selectedImageIds.length > 0 ? `${selectedImageIds.length}개 에셋 선택됨` : "에셋 선택 (선택사항)"}
          </button>
        </div>
        {showAssetSelector && (
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", padding: "4px 0" }}>
            {availableImages.map((img: any) => (
              <div
                key={img.id}
                onClick={() => setSelectedImageIds(prev => prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id])}
                style={{
                  position: "relative", width: "60px", height: "60px", borderRadius: "4px",
                  border: selectedImageIds.includes(img.id) ? "2px solid #a78bfa" : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer", backgroundImage: `url(${img.url_2k || img.url_4k})`,
                  backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0,
                }}
                title={img.name}
              >
                {selectedImageIds.includes(img.id) && (
                  <div style={{ position: "absolute", top: -4, right: -4, background: "#a78bfa", color: "#000", borderRadius: "50%", padding: "2px" }}>
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
              </div>
            ))}
            {availableImages.length === 0 && (
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>업로드된 이미지가 없습니다.</div>
            )}
          </div>
        )}
      </div>

      {selectedZoneIds.length > 0 && zones.length > 0 && (
        <div style={{ padding: "6px 10px", borderRadius: "6px", background: "rgba(96, 165, 250, 0.1)", border: "1px solid rgba(96, 165, 250, 0.2)", fontSize: "0.7rem", color: "#60a5fa" }}>
          <strong>선택된 영역:</strong> {zones.filter((z: any) => selectedZoneIds.includes(z.id)).map((z: any) => z.name).join(", ")}
        </div>
      )}

      {/* AI prompt input */}
      {!limitReached && (
        <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
          placeholder={aiHasGenerated ? "수정할 내용을 입력하세요... (예: 글꼴을 Noto Sans로 변경해줘)" : "이 영역에 축구 스코어보드를 만들어줘..."}
          style={{ flex: 1, minHeight: "60px", padding: "8px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#e2e8f0", fontSize: "0.8125rem", resize: "vertical", outline: "none", fontFamily: "inherit" }}
        />
      )}

      {/* Action buttons */}
      {limitReached ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", padding: "8px 0" }}>
          <span style={{ fontSize: "0.75rem", color: "#fca5a5" }}>수정 한도({MAX_AI_ITERATIONS}회)에 도달했습니다.</span>
          <button type="button" onClick={onReset} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
            <RefreshCw size={14} /> 새로 생성
          </button>
        </div>
      ) : canModify ? (
        <div style={{ display: "flex", gap: "6px" }}>
          <button type="button" disabled={aiGenerating || !aiPrompt.trim()} onClick={() => onGenerate(true)}
            style={{ flex: 1, padding: "8px 16px", borderRadius: "6px", border: "none", cursor: aiGenerating || !aiPrompt.trim() ? "not-allowed" : "pointer", background: "linear-gradient(135deg, #059669, #10b981)", color: "white", fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", opacity: aiGenerating || !aiPrompt.trim() ? 0.5 : 1 }}>
            {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
            {aiGenerating ? "수정 중..." : "수정 요청"}
          </button>
          <button type="button" disabled={aiGenerating} onClick={onReset}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", background: "transparent", color: "#94a3b8", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
            <RefreshCw size={12} /> 새로
          </button>
        </div>
      ) : (
        <button type="button" disabled={aiGenerating || !aiPrompt.trim()} onClick={() => onGenerate(false)}
          style={{ padding: "8px 16px", borderRadius: "6px", border: "none", cursor: aiGenerating || !aiPrompt.trim() ? "not-allowed" : "pointer", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", opacity: aiGenerating || !aiPrompt.trim() ? 0.5 : 1 }}>
          {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {aiGenerating ? "생성 중..." : "AI 코드 생성"}
        </button>
      )}

      {aiError && (
        <div style={{ padding: "6px 10px", borderRadius: "6px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: "0.6875rem", color: "#fca5a5", lineHeight: 1.4 }}>
          ⚠️ {aiError}
        </div>
      )}
    </div>
  );
}
