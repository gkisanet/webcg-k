import { Loader2, Play } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { GraphicElement } from "../GraphicPreviewRenderer";
import { BroadcastGraphicLayer } from "../Renderer/BroadcastGraphicLayer";
import { useRundownState } from "./RundownEditorContext";

type PreviewSourceData = Record<string, unknown> & {
	elements?: GraphicElement[];
	canvasWidth?: number;
	canvasHeight?: number;
	canvas?: { width?: number; height?: number };
};

function toPreviewSourceData(value: unknown): PreviewSourceData {
	return value && typeof value === "object" ? (value as PreviewSourceData) : {};
}

/**
 * ⚡ 오른쪽 상단: 선택된 런다운 아이템의 실시간 미리보기(Preview) 뷰어 패널
 * React.memo로 밀봉하고 Resize 리스너 연동을 깔끔하게 이식했습니다.
 */
export const PreviewPanel = memo(function PreviewPanel() {
	const {
		selectedItemId,
		previewLoading,
		previewCode,
		selectedItem,
		selectedGraphicElements,
	} = useRundownState();

	const [previewReplayKey, setPreviewReplayKey] = useState(0);
	const previewItem = useMemo(() => {
		if (!selectedItem) return null;
		const itemData = toPreviewSourceData(selectedItem.data);
		const itemElements = Array.isArray(itemData.elements)
			? itemData.elements
			: [];
		const sourceData =
			selectedItem.source_type === "graphic"
				? {
						...itemData,
						elements:
							selectedGraphicElements.length > 0
								? selectedGraphicElements
								: itemElements,
						canvasWidth: itemData.canvasWidth ?? itemData.canvas?.width ?? 1920,
						canvasHeight:
							itemData.canvasHeight ?? itemData.canvas?.height ?? 1080,
					}
				: previewCode
					? {
							...itemData,
							source_code: {
								html: previewCode.html,
								css: previewCode.css,
								js: previewCode.js,
							},
						}
					: selectedItem.data;

		return {
			id: selectedItem.id,
			name: selectedItem.source_name,
			trackId: 1,
			transitionIn: "fade" as const,
			transitionOut: "fade" as const,
			sourceType: selectedItem.source_type,
			sourceData,
		};
	}, [previewCode, selectedGraphicElements, selectedItem]);

	if (!selectedItemId) {
		return null;
	}

	return (
		<div className="preview-section">
			<h3>실시간 미리보기</h3>
			<div className="preview-canvas">
				{previewLoading ? (
					<div className="preview-placeholder">
						<Loader2 className="animate-spin" size={24} />
						<span>오버레이 준비 중...</span>
					</div>
				) : previewItem ? (
					<div
						className="preview-graphic-box"
						style={{
							position: "relative",
							width: "100%",
							height: "100%",
							overflow: "hidden",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							background: "#000",
						}}
					>
						<BroadcastGraphicLayer
							key={previewReplayKey}
							item={previewItem}
							phase="enter"
							fadeDurationMs={800}
							pointerEvents="none"
						/>
					</div>
				) : (
					<div className="preview-empty">
						<span>미리보기를 지원하지 않는 포맷이거나</span>
						<span>오버레이 템플릿 정보가 없습니다.</span>
					</div>
				)}
			</div>
			{previewItem && (
				<div className="preview-control-row">
					<button
						type="button"
						onClick={() => setPreviewReplayKey((key) => key + 1)}
						className="preview-play-btn"
					>
						<Play size={14} /> 다시 재생 (SHOW)
					</button>
				</div>
			)}
		</div>
	);
});
