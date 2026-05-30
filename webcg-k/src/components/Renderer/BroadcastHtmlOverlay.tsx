import { useEffect, useMemo, useRef, useState } from "react";
import type { BroadcastOverlayPayload } from "../../lib/broadcastSourceData";
import { buildPluginSrcdoc } from "../../lib/webcgkSrcdoc";

interface BroadcastHtmlOverlayProps {
	payload: BroadcastOverlayPayload;
	title: string;
	width?: number;
	height?: number;
	pointerEvents?: "auto" | "none";
}

/**
 * BroadcastHtmlOverlay 컴포넌트
 * 
 * 15년 차 시니어 아키텍트의 설계 Note (ADR):
 * - **배경**: AI로 생성된 방송 그래픽(Broadcast Graphics)은 1920x1080 절대 해상도(BASE_W/H)를 기준으로 스타일링 및 렌더링됩니다.
 * - **문제**: 송출 컨트롤러의 PVW/PGM 미니 모니터 같이 뷰포트 크기가 작고 비율이 다른 영역에 그대로 HTML iframe을 올릴 경우 스케일 왜곡 및 오버플로우가 일어납니다.
 * - **해결책**: `ResizeObserver`를 이용해 실제 컨테이너의 가로/세로 길이를 모니터링하고, 1920x1080 종횡비가 망가지지 않도록 `Math.min(containerW / width, containerH / height)` 축소 스케일을 계산합니다.
 * - **레이아웃 트레이드오프**: transform을 가한 후에도 flex 아이템 본래의 bounding box 크기는 1920x1080으로 유지됩니다. 따라서 부모 컨테이너에 `overflow: "hidden"`을 걸고, iframe을 `flex-shrink-0`으로 감싼 뒤 `transformOrigin: "center center"`와 `display: "flex"`, `justify-content: "center"`, `align-items: "center"` 구도로 감싸서 어떤 뷰포트 비율에서도 찌그러짐 없이 완벽한 16:9 비율로 중앙 안착하도록 구현했습니다.
 */
export function BroadcastHtmlOverlay({
	payload,
	title,
	width = 1920,
	height = 1080,
	pointerEvents = "none",
}: BroadcastHtmlOverlayProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [scale, setScale] = useState(1);
	const dataJson = JSON.stringify(payload.data || {});

	const srcdoc = useMemo(
		() =>
			buildPluginSrcdoc({
				html: payload.html,
				css: payload.css,
				js: payload.js,
				width,
				height,
				autoShow: false,
			}),
		[payload.html, payload.css, payload.js, width, height],
	);

	const postToIframe = (type: "INIT" | "REPLICANT_UPDATE") => {
		const target = iframeRef.current?.contentWindow;
		if (!target) return;
		target.postMessage({ type, payload: JSON.parse(dataJson) }, "*");
	};

	// 1. 실시간 데이터 동기화 감지 및 Replicant 갱신
	useEffect(() => {
		postToIframe("REPLICANT_UPDATE");
	}, [dataJson]);

	// 2. ResizeObserver를 사용한 정밀 16:9 Fit 축소 스케일 계산 (Step-by-Step)
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width: containerW, height: containerH } = entry.contentRect;
				if (containerW > 0 && containerH > 0) {
					// 가로 비율과 세로 비율 중 더 작게 축소되는 쪽에 맞춤으로써, 16:9 오버레이 전체가 잘림 없이 화면 안에 안착하도록 스케일을 계산합니다.
					const nextScale = Math.min(containerW / width, containerH / height);
					setScale(nextScale);
				}
			}
		});

		observer.observe(el);
		return () => observer.disconnect();
	}, [width, height]);

	return (
		<div 
			ref={containerRef}
			style={{ 
				position: "absolute", 
				inset: 0, 
				pointerEvents, 
				overflow: "hidden",
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			}}
		>
			<iframe
				ref={iframeRef}
				srcDoc={srcdoc}
				allowTransparency={true}
				style={{ 
					width: `${width}px`, 
					height: `${height}px`, 
					border: "none",
					transform: `scale(${scale})`,
					transformOrigin: "center center", // 뷰포트의 정중앙을 기준으로 축소시켜 안정성을 유지합니다.
					background: "transparent",
					flexShrink: 0
				}}
				sandbox="allow-scripts allow-same-origin"
				title={title}
				onLoad={() => {
					postToIframe("INIT");
					setTimeout(() => {
						iframeRef.current?.contentWindow?.postMessage({ type: "SHOW" }, "*");
					}, 50);
				}}
			/>
		</div>
	);
}

