import { useCallback, useEffect, useState } from "react";
import type { DashboardSchema, PluginSourceCode } from "../../../../lib/overlayTypes";
import { generateOverlayCode, type ExistingCodeContext, OVERLAY_SYSTEM_PROMPT } from "../../../../services/aiOverlayService";
import { fetchImages, type ImageItem } from "../../../../services/imageService";
import { getZonesFromTemplate } from "../lib/grid-zones";

export function useAIGeneration(
  setCode: React.Dispatch<React.SetStateAction<PluginSourceCode>>,
  handleSchemaChange: (newSchema: DashboardSchema) => void,
  setTestData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
  code: PluginSourceCode,
  schema: DashboardSchema | null,
  setActiveTab: (tab: "html" | "css" | "js" | "schema") => void,
  setBottomTab: (tab: "ai" | "dashboard" | "visual") => void,
) {
  // AI generation
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Iteration tracking
  const [aiIterationCount, setAiIterationCount] = useState(0);
  const [aiPromptHistory, setAiPromptHistory] = useState<string[]>([]);
  const [aiHasGenerated, setAiHasGenerated] = useState(false);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  // Grid
  const [gridTemplates, setGridTemplates] = useState<any[]>([]);
  const [selectedGridId, setSelectedGridId] = useState<string>("");
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [showGridOverlay, setShowGridOverlay] = useState(false);

  // Assets
  const [availableImages, setAvailableImages] = useState<ImageItem[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Load grid templates
  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import("../../../../lib/supabase");
        const { data } = await (supabase as any)
          .from("grid_templates")
          .select("id, name, template_data")
          .order("created_at", { ascending: false });
        if (data) setGridTemplates(data);
      } catch { /* grid table may not exist */ }
    })();
  }, []);

  // Load images
  useEffect(() => {
    fetchImages().then(setAvailableImages).catch(console.error);
  }, []);

  const selectedGrid = gridTemplates.find((g: any) => g.id === selectedGridId);
  const zones = selectedGrid ? getZonesFromTemplate(selectedGrid) : [];
  const selectedZones = zones.filter((z: any) => selectedZoneIds.includes(z.id));

  const handleReset = useCallback(() => {
    setAiIterationCount(0);
    setAiPromptHistory([]);
    setAiHasGenerated(false);
    setAiPrompt("");
    setAiError(null);
  }, []);

  const handleAiGenerate = useCallback(async (isModify: boolean) => {
    setAiGenerating(true);
    setAiError(null);
    try {
      const zoneInfo = selectedZones.filter((z: any) => z.bounds).map((z: any) => ({
        name: z.name, type: z.type,
        x: z.bounds.x, y: z.bounds.y,
        width: z.bounds.width, height: z.bounds.height,
      }));

      const existingCtx: ExistingCodeContext | null = isModify
        ? { html: code.html, css: code.css, js: code.js, dashboard_schema: schema }
        : null;

      const selectedAssets = availableImages
        .filter(img => selectedImageIds.includes(img.id))
        .map(img => ({ name: img.name, url: img.url_2k || img.url_4k || "" }));

      const result = await generateOverlayCode(
        aiPrompt,
        zoneInfo.length > 0 ? zoneInfo : null,
        existingCtx,
        selectedAssets.length > 0 ? selectedAssets : null,
      );

      setCode({ html: result.html, css: result.css, js: result.js });
      if (result.dashboard_schema) handleSchemaChange(result.dashboard_schema);
      if (result.replicant_defaults && Object.keys(result.replicant_defaults).length > 0) {
        setTestData(result.replicant_defaults);
      }

      setAiPromptHistory(prev => [...prev, aiPrompt]);
      if (isModify) {
        setAiIterationCount(prev => prev + 1);
      } else {
        setAiIterationCount(0);
        setAiHasGenerated(true);
      }
      setAiPrompt("");
      setBottomTab("dashboard");
      setActiveTab("html");
    } catch (err: any) {
      console.error("[AI Overlay] Generation failed:", err);
      setAiError(err.message || "AI code generation failed.");
    } finally {
      setAiGenerating(false);
    }
  }, [
    selectedZones, code, schema, availableImages, selectedImageIds,
    aiPrompt, setCode, handleSchemaChange, setTestData,
    setBottomTab, setActiveTab,
  ]);

  const handleImportJson = useCallback(() => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importJsonText);
      if (typeof parsed !== "object" || parsed === null) throw new Error("Not a valid JSON object.");
      if (parsed.html && typeof parsed.html === "string") {
        setCode({ html: parsed.html, css: parsed.css || "", js: parsed.js || "" });
      } else {
        throw new Error("Missing 'html' field. Please paste the complete AI response JSON.");
      }
      if (parsed.dashboard_schema && parsed.dashboard_schema.properties) {
        handleSchemaChange(parsed.dashboard_schema);
      }
      if (parsed.replicant_defaults && typeof parsed.replicant_defaults === "object") {
        setTestData(parsed.replicant_defaults);
      }
      setShowImportModal(false);
      setImportJsonText("");
      setActiveTab("html");
    } catch (err: any) {
      setImportError(err.message || "JSON parsing failed.");
    }
  }, [importJsonText, setCode, handleSchemaChange, setTestData, setActiveTab]);

  const handleCopySystemPrompt = useCallback(async () => {
    const zoneSection = selectedZones.filter((z: any) => z.bounds).map((z: any) => ({
      name: z.name, type: z.type,
      x: z.bounds.x, y: z.bounds.y,
      width: z.bounds.width, height: z.bounds.height,
    }));

    const zoneText = zoneSection.length > 0
      ? `\n\n## 배치 영역 (매우 중요)\n다음은 사용자가 지정한 렌더링 영역입니다. 코드를 생성할 때 반드시 최상위 래퍼인 \`#overlay\` 요소에 아래의 위치와 크기(CSS)를 적용하여 그래픽이 이 영역 안에만 렌더링되게 하세요. 절대로 100% 폭/높이를 사용해 전체 화면을 채우지 마세요.\n\n${zoneSection.map(zone => `- Zone: "${zone.name}" (${zone.type})\n  위치: x=${zone.x}px, y=${zone.y}px\n  크기: ${zone.width}×${zone.height}px\n  적용할 CSS: position:absolute; left:${zone.x}px; top:${zone.y}px; width:${zone.width}px; height:${zone.height}px;`).join('\n')}\n\n**크기 초과 방지 (Overflow 방지)**: 낭비 요소들(카드, 컨테이너 등)에 고정된 px 크기를 주어 영역 크기를 초과하여 삐져나오는(overflow) 현상이 자주 발생하고 있습니다. 낭비 요소들은 주어진 부모(#overlay)의 크기 안에서 딱 맞게 들어가도록 크기를 고정 픽셀(px) 대신 비율(%, flex: 1 등)을 사용하여 반응형으로 작성하세요. (단, 폰트 크기나 여백 등은 px 사용 가능하며, 그림자(box-shadow)가 영역 밖으로 나가는 것은 허용됩니다.)`
      : "\n\n## 배치 영역\n- 전체 화면 (1920×1080) (최상위 요소 `#overlay`에 width: 100%; height: 100% 적용)";

    const assetSection = selectedImageIds.length > 0
      ? `\n\n## 사용 가능한 이미지 에셋 목록\n다음 이미지들을 HTML의 <img> src 속성이나 CSS background-image 등에 사용할 수 있습니다:\n${availableImages
        .filter(img => selectedImageIds.includes(img.id))
        .map(img => `- ${img.name}: ${img.url_2k || img.url_4k}`)
        .join('\n')}`
      : "";

    const fullPrompt = `${OVERLAY_SYSTEM_PROMPT}${zoneText}${assetSection}\n\n## 요청\n(여기에 원하는 오버레이에 대한 설명을 입력하세요. 예: "축구 스코어보드를 만들어줘")`;

    await navigator.clipboard.writeText(fullPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }, [selectedZones, selectedImageIds, availableImages]);

  return {
    // AI generation
    aiPrompt, setAiPrompt,
    aiGenerating,
    aiError,
    aiIterationCount,
    aiPromptHistory,
    aiHasGenerated,
    handleAiGenerate,
    handleReset,
    // Import
    showImportModal, setShowImportModal,
    importJsonText, setImportJsonText,
    importError, setImportError,
    handleImportJson,
    // Grid
    gridTemplates,
    selectedGridId, setSelectedGridId,
    selectedZoneIds, setSelectedZoneIds,
    showGridOverlay, setShowGridOverlay,
    zones,
    selectedZones,
    // Assets
    availableImages,
    selectedImageIds, setSelectedImageIds,
    showAssetSelector, setShowAssetSelector,
    copiedPrompt,
    handleCopySystemPrompt,
  };
}
