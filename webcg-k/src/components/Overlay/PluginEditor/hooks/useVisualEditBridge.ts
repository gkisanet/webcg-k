import { useCallback, useEffect, useState } from "react";
import type { PluginSourceCode } from "../../../../lib/overlayTypes";
import { batchUpdateCssProperties, updateCssProperty } from "../../../../lib/cssAstUtils";

interface VizElement {
  selector: string;
  tagName: string;
  className: string;
  id: string;
  computedStyles: Record<string, string>;
}

export function useVisualEditBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  setCode: React.Dispatch<React.SetStateAction<PluginSourceCode>>,
) {
  const [visualEditMode, setVisualEditMode] = useState(false);
  const [selectedVizElement, setSelectedVizElement] = useState<VizElement | null>(null);

  // Visual edit bridge message listener
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.source !== "webcgk-visual-edit") return;
      if (e.data.type === "STYLE_CHANGED") {
        const { selector, styles } = e.data.payload;
        setCode((prev) => {
          const newCss = batchUpdateCssProperties(prev.css, selector, styles);
          return { ...prev, css: newCss };
        });
      }
      if (e.data.type === "ELEMENT_SELECTED") {
        setSelectedVizElement((prev) =>
          prev?.selector === e.data.payload.selector ? prev : e.data.payload,
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setCode]);

  const handleVizStyleChange = useCallback(
    (property: string, value: string) => {
      if (!selectedVizElement) return;
      const selector = selectedVizElement.selector;
      // 1. Real-time iframe update
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: "SET_PROPERTY", selector, property, value },
          "*",
        );
      }
      // 2. CSS state update
      setCode((prev) => ({
        ...prev,
        css: updateCssProperty(prev.css, selector, property, value),
      }));
      // 3. Local inspector state sync
      setSelectedVizElement((prev) =>
        prev
          ? {
              ...prev,
              computedStyles: { ...prev.computedStyles, [property]: value },
            }
          : null,
      );
    },
    [selectedVizElement, iframeRef, setCode],
  );

  const handleVizRootVarChange = useCallback(
    (variableName: string, value: string) => {
      setCode((prev) => ({
        ...prev,
        css: updateCssProperty(prev.css, ":root", variableName, value),
      }));
    },
    [setCode],
  );

  return {
    visualEditMode,
    setVisualEditMode,
    selectedVizElement,
    setSelectedVizElement,
    handleVizStyleChange,
    handleVizRootVarChange,
  };
}
