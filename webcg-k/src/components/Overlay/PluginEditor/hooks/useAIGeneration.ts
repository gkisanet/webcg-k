import { useCallback, useEffect, useState } from "react";
import type {
	DashboardSchema,
	PluginSourceCode,
} from "../../../../lib/overlayTypes";
import {
	type ExistingCodeContext,
	generateOverlayCode,
	OVERLAY_SYSTEM_PROMPT,
	parseOverlayResponse,
} from "../../../../services/aiOverlayService";
import { fetchImages, type ImageItem } from "../../../../services/imageService";
import { getZonesFromTemplate } from "../lib/grid-zones";

interface GridTemplate {
	id: string;
	name?: string;
	template_data?: unknown;
}

interface GridZone {
	id: string;
	name: string;
	type: string;
	bounds?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
}

type ZoneWithBounds = GridZone & { bounds: NonNullable<GridZone["bounds"]> };

function hasBounds(zone: GridZone): zone is ZoneWithBounds {
	return !!zone.bounds;
}

function getErrorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

export function useAIGeneration(
	setCode: React.Dispatch<React.SetStateAction<PluginSourceCode>>,
	handleSchemaChange: (newSchema: DashboardSchema) => void,
	setTestData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
	code: PluginSourceCode,
	schema: DashboardSchema | null,
	setActiveTab: (tab: "html" | "css" | "js" | "schema") => void,
	setBottomTab: (tab: "ai" | "dashboard" | "motion" | "visual") => void,
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
	const [gridTemplates, setGridTemplates] = useState<GridTemplate[]>([]);
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
				const { data } = await supabase
					.from("grid_templates")
					.select("id, name, template_data")
					.order("created_at", { ascending: false });
				if (data) setGridTemplates(data as GridTemplate[]);
			} catch {
				/* grid table may not exist */
			}
		})();
	}, []);

	// Load images
	useEffect(() => {
		fetchImages().then(setAvailableImages).catch(console.error);
	}, []);

	const selectedGrid = gridTemplates.find((g) => g.id === selectedGridId);
	const zones = selectedGrid
		? (getZonesFromTemplate(selectedGrid) as GridZone[])
		: [];
	const selectedZones = zones.filter((z) => selectedZoneIds.includes(z.id));

	const handleReset = useCallback(() => {
		setAiIterationCount(0);
		setAiPromptHistory([]);
		setAiHasGenerated(false);
		setAiPrompt("");
		setAiError(null);
	}, []);

	const handleAiGenerate = useCallback(
		async (isModify: boolean) => {
			setAiGenerating(true);
			setAiError(null);
			try {
				const zoneInfo = selectedZones.filter(hasBounds).map((z) => ({
					name: z.name,
					type: z.type,
					x: z.bounds.x,
					y: z.bounds.y,
					width: z.bounds.width,
					height: z.bounds.height,
				}));

				const existingCtx: ExistingCodeContext | null = isModify
					? {
							html: code.html,
							css: code.css,
							js: code.js,
							motion: code.motion ?? null,
							dashboard_schema: schema,
						}
					: null;

				const selectedAssets = availableImages
					.filter((img) => selectedImageIds.includes(img.id))
					.map((img) => ({
						name: img.name,
						url: img.url_2k || img.url_4k || "",
					}));

				const result = await generateOverlayCode(
					aiPrompt,
					zoneInfo.length > 0 ? zoneInfo : null,
					existingCtx,
					selectedAssets.length > 0 ? selectedAssets : null,
				);

				setCode({
					html: result.html,
					css: result.css,
					js: result.js,
					motion: result.motion,
				});
				if (result.dashboard_schema)
					handleSchemaChange(result.dashboard_schema);
				if (
					result.replicant_defaults &&
					Object.keys(result.replicant_defaults).length > 0
				) {
					setTestData(result.replicant_defaults);
				}

				setAiPromptHistory((prev) => [...prev, aiPrompt]);
				if (isModify) {
					setAiIterationCount((prev) => prev + 1);
				} else {
					setAiIterationCount(0);
					setAiHasGenerated(true);
				}
				setAiPrompt("");
				setBottomTab("dashboard");
				setActiveTab("html");
			} catch (err: unknown) {
				console.error("[AI Overlay] Generation failed:", err);
				setAiError(getErrorMessage(err, "AI code generation failed."));
			} finally {
				setAiGenerating(false);
			}
		},
		[
			selectedZones,
			code,
			schema,
			availableImages,
			selectedImageIds,
			aiPrompt,
			setCode,
			handleSchemaChange,
			setTestData,
			setBottomTab,
			setActiveTab,
		],
	);

	const handleImportJson = useCallback(() => {
		setImportError(null);
		try {
			// parseOverlayResponse는 마크다운 백틱 제거, JSON 잘림 복구, 개별 필드 정규식 추출 등 강력한 복구를 포함함
			const parsed = parseOverlayResponse(importJsonText);
			if (parsed.html && typeof parsed.html === "string") {
				setCode({
					html: parsed.html,
					css: parsed.css || "",
					js: parsed.js || "",
					motion: parsed.motion,
				});
			} else {
				throw new Error(
					"html 필드가 없습니다. 완전한 AI 응답 JSON을 입력해주세요.",
				);
			}
			if (parsed.dashboard_schema?.properties) {
				handleSchemaChange(parsed.dashboard_schema);
			}
			if (
				parsed.replicant_defaults &&
				typeof parsed.replicant_defaults === "object"
			) {
				setTestData(parsed.replicant_defaults);
			}
			setShowImportModal(false);
			setImportJsonText("");
			setActiveTab("html");
		} catch (err: unknown) {
			setImportError(getErrorMessage(err, "JSON parsing failed."));
		}
	}, [importJsonText, setCode, handleSchemaChange, setTestData, setActiveTab]);

	const handleCopySystemPrompt = useCallback(async () => {
		const zoneSection = selectedZones.filter(hasBounds).map((z) => ({
			name: z.name,
			type: z.type,
			x: z.bounds.x,
			y: z.bounds.y,
			width: z.bounds.width,
			height: z.bounds.height,
		}));

		const zoneText =
			zoneSection.length > 0
				? `\n\n## Zone\n#overlay를 아래 좌표 안에만 렌더링하세요. 내부 레이아웃은 %, flex, grid로 부모 크기에 맞추고 스크롤/삐져나옴을 만들지 마세요.\n${zoneSection.map((zone) => `- ${zone.name} (${zone.type}): left:${zone.x}px; top:${zone.y}px; width:${zone.width}px; height:${zone.height}px;`).join("\n")}`
				: "\n\n## Zone\n전체 화면 1920x1080. #overlay는 width:100%; height:100%;";

		const assetSection =
			selectedImageIds.length > 0
				? `\n\n## 사용 가능한 이미지 에셋 목록\n다음 이미지들을 HTML의 <img> src 속성이나 CSS background-image 등에 사용할 수 있습니다:\n${availableImages
						.filter((img) => selectedImageIds.includes(img.id))
						.map((img) => `- ${img.name}: ${img.url_2k || img.url_4k}`)
						.join("\n")}`
				: "";

		const fullPrompt = `${OVERLAY_SYSTEM_PROMPT}${zoneText}${assetSection}\n\n## 요청\n(여기에 원하는 오버레이에 대한 설명을 입력하세요. 예: "축구 스코어보드를 만들어줘")`;

		await navigator.clipboard.writeText(fullPrompt);
		setCopiedPrompt(true);
		setTimeout(() => setCopiedPrompt(false), 2000);
	}, [selectedZones, selectedImageIds, availableImages]);

	return {
		// AI generation
		aiPrompt,
		setAiPrompt,
		aiGenerating,
		aiError,
		aiIterationCount,
		aiPromptHistory,
		aiHasGenerated,
		handleAiGenerate,
		handleReset,
		// Import
		showImportModal,
		setShowImportModal,
		importJsonText,
		setImportJsonText,
		importError,
		setImportError,
		handleImportJson,
		// Grid
		gridTemplates,
		selectedGridId,
		setSelectedGridId,
		selectedZoneIds,
		setSelectedZoneIds,
		showGridOverlay,
		setShowGridOverlay,
		zones,
		selectedZones,
		// Assets
		availableImages,
		selectedImageIds,
		setSelectedImageIds,
		showAssetSelector,
		setShowAssetSelector,
		copiedPrompt,
		handleCopySystemPrompt,
	};
}
