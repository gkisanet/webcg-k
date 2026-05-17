import { useCallback, useEffect, useRef } from "react";
import type { PluginSourceCode } from "../../../../lib/overlayTypes";
import { getVisualEditBridgeInline } from "../../../../lib/visualEditBridge";
import { getWebcgkApiInline } from "../lib/webcgk-api";

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
  useEffect(() => { testDataRef.current = testData; }, [testData]);
  useEffect(() => { visualEditModeRef.current = visualEditMode; }, [visualEditMode]);
  useEffect(() => { selectedVizRef.current = selectedVizElement; }, [selectedVizElement]);

  const buildSrcdoc = useCallback(
    (c: PluginSourceCode) => {
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920,height=1080">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html {
  background-color: #666;
  background-image:
    linear-gradient(45deg, #444 25%, transparent 25%),
    linear-gradient(-45deg, #444 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #444 75%),
    linear-gradient(-45deg, transparent 75%, #444 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}
body { width: 100%; height: 100vh; overflow: hidden; background: transparent; }
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeOutDown {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(20px); }
}
${c.css}
</style>
</head>
<body>
${c.html}
<script>
${getWebcgkApiInline()}
</script>
<script>
${getVisualEditBridgeInline()}
</script>
<script>
${c.js}
</script>
</body>
</html>`;
    },
    [],
  );

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
            iframeRef.current.contentWindow.postMessage(
              { type: "SHOW" },
              "*",
            );
            iframeRef.current.contentWindow.postMessage(
              { type: "ENABLE_VISUAL_EDIT" },
              "*",
            );
            if (selectedVizRef.current) {
              setTimeout(() => {
                iframeRef.current?.contentWindow?.postMessage(
                  { type: "SELECT_ELEMENT", selector: selectedVizRef.current!.selector },
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
    if (visualEditMode && selectedVizElement && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "SELECT_ELEMENT", selector: selectedVizElement.selector },
        "*",
      );
    }
  }, [selectedVizElement, visualEditMode, iframeRef]);

  return { buildSrcdoc, sendDataToPreview };
}
