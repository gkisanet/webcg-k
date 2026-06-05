import { useCallback, useEffect, useRef } from "react";
import type { PluginSourceCode } from "../../../../lib/overlayTypes";
import { getVisualEditBridgeInline } from "../../../../lib/visualEditBridge";
import { buildPluginSrcdoc } from "../../../../lib/webcgkSrcdoc";

export function usePreviewBridge(
	code: PluginSourceCode,
	testData: Record<string, unknown>,
	visualEditMode: boolean,
	selectedVizElement: { selector: string } | null,
	iframeRef: React.RefObject<HTMLIFrameElement | null>,
) {
	const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const testDataRef = useRef(testData);
	const visualEditModeRef = useRef(visualEditMode);
	const selectedVizRef = useRef(selectedVizElement);
	useEffect(() => {
		testDataRef.current = testData;
	}, [testData]);
	useEffect(() => {
		visualEditModeRef.current = visualEditMode;
	}, [visualEditMode]);
	useEffect(() => {
		selectedVizRef.current = selectedVizElement;
	}, [selectedVizElement]);

	const buildSrcdoc = useCallback((c: PluginSourceCode) => {
		return buildPluginSrcdoc({
			html: c.html,
			css: c.css,
			js: c.js,
			motion: c.motion,
			autoShow: false,
			previewBackground: "checkerboard",
			extraBodyScripts: [getVisualEditBridgeInline()],
		});
	}, []);

	const sendDataToPreview = useCallback(
		(data: Record<string, unknown>) => {
			if (iframeRef.current?.contentWindow) {
				iframeRef.current.contentWindow.postMessage(
					{ type: "REPLICANT_UPDATE", payload: data },
					"*",
				);
			}
		},
		[iframeRef],
	);

	// Debounced preview update
	useEffect(() => {
		if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
		updateTimerRef.current = setTimeout(() => {
			if (iframeRef.current) {
				iframeRef.current.srcdoc = buildSrcdoc(code);
				setTimeout(() => {
					sendDataToPreview(testDataRef.current);
					if (visualEditModeRef.current && iframeRef.current?.contentWindow) {
						iframeRef.current.contentWindow.postMessage({ type: "SHOW" }, "*");
						iframeRef.current.contentWindow.postMessage(
							{ type: "ENABLE_VISUAL_EDIT" },
							"*",
						);
						if (selectedVizRef.current) {
							const selected = selectedVizRef.current;
							setTimeout(() => {
								iframeRef.current?.contentWindow?.postMessage(
									{
										type: "SELECT_ELEMENT",
										selector: selected.selector,
									},
									"*",
								);
							}, 100);
						}
					}
				}, 200);
			}
		}, 400);

		return () => {
			if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
		};
	}, [code, buildSrcdoc, sendDataToPreview, iframeRef]);

	// Element selection restore (no iframe reload needed)
	useEffect(() => {
		if (
			visualEditMode &&
			selectedVizElement &&
			iframeRef.current?.contentWindow
		) {
			iframeRef.current.contentWindow.postMessage(
				{ type: "SELECT_ELEMENT", selector: selectedVizElement.selector },
				"*",
			);
		}
	}, [selectedVizElement, visualEditMode, iframeRef]);

	return { buildSrcdoc, sendDataToPreview };
}
