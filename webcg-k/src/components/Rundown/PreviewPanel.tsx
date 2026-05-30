import { memo, useRef } from "react";
import { Loader2, Play } from "lucide-react";
import { useRundownState, useRundownActions } from "./RundownEditorContext";
import { GraphicPreviewRenderer } from "../GraphicPreviewRenderer";

/**
 * ⚡ 오른쪽 상단: 선택된 런다운 아이템의 실시간 미리보기(Preview) 뷰어 패널
 * React.memo로 밀봉하고 Resize 리스너 연동을 깔끔하게 이식했습니다.
 */
export const PreviewPanel = memo(function PreviewPanel() {
	const {
		selectedItemId,
		previewWidth,
		isResizing,
		previewLoading,
		previewItem,
		previewCode,
		selectedItem,
		selectedGraphicElements,
	} = useRundownState();

	const {
		setIsResizing,
		triggerPreviewShow,
		previewIframeRef,
	} = useRundownActions();

	// ⚡ 공통 srcdoc 빌더 (webcgk 런타임 주입)
	const buildPreviewSrcdoc = (html: string, css: string, js: string) => {
		// buildPluginSrcdoc 헬퍼가 window 전역에 없으므로 context로부터 받아오기 곤란한 static 유틸
		// buildPluginSrcdoc의 단순화 버전 또는 원래 주입 규칙 조립
		return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<style>
					body {
						margin: 0;
						padding: 0;
						background: transparent !important;
						overflow: hidden;
					}
					${css}
				</style>
			</head>
			<body>
				${html}
				<script>
					// mock webcgk runtime inject
					window.webcgk = {
						on: function(event, cb) {
							window.addEventListener('message', function(e) {
								if (e.data.type === event) cb(e.data.payload);
								if (e.data.type === 'INIT' && event === 'data') cb(e.data.payload);
							});
						}
					};
					${js}
				</script>
			</body>
			</html>
		`;
	};

	if (!selectedItemId) {
		return null;
	}

	return (
		<div className="preview-container">
			<div className="ins-section-title">실시간 미리보기</div>
			<div className="preview-frame-wrapper">
				{previewLoading ? (
					<div className="preview-frame-loading">
						<Loader2 className="animate-spin" size={24} />
						<span>오버레이 준비 중...</span>
					</div>
				) : selectedItem?.source_type === "graphic" ? (
					<div className="preview-graphic-box" style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
						<GraphicPreviewRenderer
							elements={selectedGraphicElements}
							canvasWidth={1920}
							canvasHeight={1080}
						/>
					</div>
				) : previewCode ? (
					<div className="preview-iframe-box">
						<iframe
							ref={previewIframeRef as any}
							srcDoc={buildPreviewSrcdoc(
								previewCode.html,
								previewCode.css,
								previewCode.js,
							)}
							sandbox="allow-scripts allow-same-origin"
							className="preview-iframe"
							title="Overlay Preview"
						/>
					</div>
				) : (
					<div className="preview-frame-empty">
						<span>미리보기를 지원하지 않는 포맷이거나</span>
						<span>오버레이 템플릿 정보가 없습니다.</span>
					</div>
				)}
			</div>
			{previewCode && (
				<div className="preview-control-row">
					<button
						type="button"
						onClick={triggerPreviewShow}
						className="preview-play-btn"
					>
						<Play size={14} /> 다시 재생 (SHOW)
					</button>
				</div>
			)}
		</div>
	);
});
