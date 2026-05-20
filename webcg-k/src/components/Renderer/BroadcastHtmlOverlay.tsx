import { useEffect, useMemo, useRef } from "react";
import type { BroadcastOverlayPayload } from "../../lib/broadcastSourceData";
import { buildPluginSrcdoc } from "../../lib/webcgkSrcdoc";

interface BroadcastHtmlOverlayProps {
	payload: BroadcastOverlayPayload;
	title: string;
	width?: number;
	height?: number;
	pointerEvents?: "auto" | "none";
}

export function BroadcastHtmlOverlay({
	payload,
	title,
	width = 1920,
	height = 1080,
	pointerEvents = "none",
}: BroadcastHtmlOverlayProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
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

	useEffect(() => {
		postToIframe("REPLICANT_UPDATE");
	}, [dataJson]);

	return (
		<div style={{ position: "absolute", inset: 0, pointerEvents }}>
			<iframe
				ref={iframeRef}
				srcDoc={srcdoc}
				style={{ width: "100%", height: "100%", border: "none" }}
				sandbox="allow-scripts"
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
